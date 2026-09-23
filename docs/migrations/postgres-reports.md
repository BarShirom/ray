# PostgreSQL ReportStore and four-domain HTTP verification (10D.3)

Baseline: clean `ray-2-postgres` at
`ce700a53fb2ea5c6c1196e611c31ce2067321060` (committed 10D.2).
No applicable AGENTS.md was found. Preflight verified Docker 29.8.0,
Compose 5.5.1 and the Linux engine. Development service `db` was stopped and
`ray-postgres_ray_local_data` was present.

**All four domains are exercised together against the same disposable local
PostgreSQL database. Normal application defaults still use MongoDB.** The
[API baseline](postgres-api-compatibility.md),
[report boundary](report-persistence-boundary.md),
[local safeguards](postgres-local-foundation.md),
[user/auth implementation](postgres-user-auth.md) and
[feeding implementation](postgres-feeding.md) remain applicable.

## ReportStore and response mapping

`createPostgresReportStore(db)` implements the unchanged interface:

| Operation | PostgreSQL behavior |
| --- | --- |
| create | Trusted creator lookup, whitelisted insert, joined response inside one transaction |
| listAll | Two separate LEFT JOINs for creator/assignee; createdAt DESC |
| listAssignedTo | Same projection/order, filtered by assignee public ID |
| claim | FOR UPDATE, rechecked status, trusted assignee lookup, update and joined response |
| resolve | FOR UPDATE, compare actual stored assignee UUID with actor UUID, update and joined response |
| getGlobalStats | One aggregate SELECT for total/resolved/inProgress/new |
| getAssignedStats | One aggregate SELECT scoped to assignee for total/resolved/inProgress |

Imports open no connection or migration and use no Mongoose code. The existing
connection factory supplies an explicit Drizzle dependency. Every transactional
statement uses its transaction client; no pool queries are mixed into transactions.
All inputs are parameterized. IDs use `randomBytes(12).toString("hex")`, matching
the other stores; valid uppercase public IDs are canonicalized to lowercase.
Internal UUIDs remain foreign keys and never appear in application records/responses.

Separate aliased LEFT JOINs retain guests and nullable relationships without
per-report user lookups. User projections select only public ID, first/last names
and the existing legacy-name value/presence columns. No password, hash, email,
company or token is selected for report summaries. Tests temporarily rename all
three sensitive user columns and successfully run every report operation, proving
that the projections do not depend on those columns. Returned summaries contain
only public ID, first/last names and optional legacy name; presence flags stay internal.

Creation preserves description whitespace, media order/duplicates and the []
default. Status starts new, assignment starts null, and trusted controller identity
and name determine creator fields. Body ownership/status/assignee/version overrides
are ignored. Guests and invalid optional tokens preserve null creator / Guest name.
A non-null missing creator or claim assignee fails without fabrication or guest
fallback. An unknown resolving actor is refused as not-assignee, not treated as a
new relationship. Genuine SQL failures remain failures rather than missing outcomes.

The unchanged serializer and reportFullName helper retain stored name precedence:
non-nullish snapshots (including empty strings) win, then truthy legacy names,
then untrimmed first/last names, then null. Optional auth still includes legacy name;
required auth still supplies its existing first/last identity. No auth behavior changed.
Synthetic user deletions exercise the existing ON DELETE SET NULL FKs: reports
remain visible with null summaries and retained creator/assignee name snapshots.

Locations retain geometry(Point,4326), written as longitude/latitude and mapped to
{lat, lng}. There are no separately writable coordinate copies. Adapter tests check
nine-decimal asymmetric coordinates, ST_X/ST_Y and SRID; the unchanged foundation
suite checks spatial typmods, GiST indexes and metre-distance behavior. Application
records retain Dates; the serializer emits ISO UTC timestamps. Lists remain arrays
ordered by createdAt DESC; no tie-breaker was added, so equal timestamps remain
unspecified, as before.

## Report-only compatibility migration

New `0005_report_compatibility.sql` adds exactly two report columns:

| Column | Meaning |
| --- | --- |
| legacy_version | Nullable double precision, preserving JavaScript numeric values |
| legacy_version_present | NOT NULL boolean, default false |

Normal new reports explicitly write present version 0. Historical SQL rows acquire
absent version, without an invented value. Reads omit legacyVersion when the flag
is false, retain explicit null when true plus SQL NULL, and retain numeric values
when true. The unchanged serializer maps this to __v. Tests cover absent/null/0/7/1.5
through claim and resolve; neither operation increments the version. Installed real
Mongoose model change tracking confirms that these scalar changes do not request
an automatic __v increment, without making a Mongo query or save.

No name snapshot presence flags were added: the existing serializer intentionally
normalizes absent/null snapshots through the same nullish fallback. Existing
nullable FKs represent the supported guest/deleted-user null relationships. This
is not a claim that every absent historical Mongo field can be reconstructed.
Version presence cannot be recovered from previous SQL rows without source evidence;
future importers must explicitly set its value and flag. No JSONB document storage,
generic compatibility framework or future-domain metadata was introduced.

Upgrade tests apply 0000-0004 to an owned disposable database, insert synthetic
null/empty/string snapshots, ordered media and historical timestamps, then apply
the full chain. All previous report columns remain unchanged, versions stay absent,
HTTP serialization semantics are checked, and replay preserves rows/journal entries.
Fresh migrations also pass. Previous migrations/snapshots are unchanged; the new
snapshot was compared against 0004 to verify all existing columns, constraints,
indexes and spatial definitions and every user/station/log table remain identical.
No migration was applied to the development database.

SQL still requires valid type/status values, timestamps, location and media, valid
geographic bounds and real referenced users. Required first/last names on users
also restrict historical summaries. Missing/null required fields, dangling IDs,
unsupported historical values or malformed coordinates require a separate audit
and import decision. Request validation was not changed and constraints were not
weakened. Existing model-default null relationships and name fallbacks are preserved;
unseen historical documents are not certified compatible.

## Atomic transitions and actual concurrency evidence

Claim locks the report row with FOR UPDATE and rechecks status after acquiring the
lock. A missing row returns not-found; a non-new row returns not-new without an
UPDATE. The successful claimant resolves the trusted user ID, writes in-progress,
and applies `suppliedName ?? previousSnapshot ?? null`, preserving empty strings.
The response is read with safe joined projections while the row is still locked,
and success is returned only after commit. A second claimant observes the committed
status and cannot overwrite the winner, including repeated claims by the same user.
This is an intentional PostgreSQL-only improvement over the Mongo read/check/save race.

Resolve locks the same row, resolves the actor public ID and compares the stored
assignee UUID before writing. Display names and populated summaries cannot authorize
it. Missing/unassigned/other-user outcomes retain their existing meanings. Repeated
resolution is allowed, and no status prerequisite is added. The report remains
locked through update and response read, protecting authorization from concurrent
assignee changes. Refused operations leave all columns, timestamps and versions
unchanged. No reassignment/deletion endpoint was added.

The new suite coordinates real separately named sessions with an observer polling
pg_stat_activity, wait_event_type=Lock and pg_blocking_pids. Each wait has an
8-second deadline and checks FOR UPDATE plus a specific blocking edge. The 15 ms
poll interval is not used as evidence by itself; queries retain the connection
factory's 15-second statement timeout. The suite owner's advisory lock and the
existing guarded database lifecycle remain unchanged.

Observed in the real HTTP tests:

- Two users' distinct backend PIDs waited in the same report's row-lock chain behind
  a test-owned transaction. An unrelated report was claimed successfully before
  releasing that lock. After release, exactly one request returned 200 and one
  returned the existing 400 claim-conflict body. Stored assignee matched the winner;
  the loser received 403 resolving it, and repeated winning claim was refused,
  with the full stored row unchanged by both denials. The winner could resolve.
- A resolver for A waited on an uncommitted direct SQL assignee change to B. After
  the writer committed, A received 403 despite the retained A display-name snapshot.
  Its denied action changed no fields; B then resolved successfully. Direct fixture
  SQL is test-owned and does not introduce a product reassignment feature.
- Temporarily renaming report description forced the joined response SELECT to fail
  after the claim/resolve UPDATE. Both HTTP requests returned their existing safe
  operation-specific 500. Restoring the column showed every original field unchanged,
  including versions and timestamps. An independent session acquired
  both report rows FOR UPDATE NOWAIT, demonstrating rollback and lock release.

Test clients release in finally blocks with pool-owned fallback releases on setup
failures. Pending operations settle, transactions roll back, and app servers/pools
close. No production test hooks, query/store mocks, retries or external services are
used. This covers these lock orderings, not every possible application race or
concurrent user deletion/deadlock scenario. PostgreSQL errors remain safe failures;
no automatic retry policy is introduced.

## Statistics, errors and production composition

Each statistics method executes one SELECT using COUNT(*) and FILTER expressions,
so its fields share a single statement snapshot. Personal scope joins on assignee,
never creator. Empty scopes return zeros. pg's int8 text counts are parsed with
BigInt, checked against 0 and Number.MAX_SAFE_INTEGER, then converted to numbers.
Unsafe counts fail rather than silently rounding or exposing bigint strings. Tests
use real PostgreSQL bigint values at/beyond the safe boundary and compare ordinary
aggregate results against actual stored rows. Global fields remain total/resolved/
inProgress/new; personal fields remain total/resolved/inProgress.

A report-local safe error wrapper discards raw database error messages, properties
and causes. Creation retains the existing forwarded {error,message} 500 envelope
with PersistenceError / Report persistence operation failed. Other operations keep
the controller's existing operation-specific 500 bodies. Expected domain outcomes
are returned normally. Malformed report IDs deliberately keep claim/resolve's
existing 500 behavior via the ID guard plus safe error; no new 400 contract or
global framework was introduced. Tests force actual SELECT/INSERT/update failures,
verify every error envelope and confirm no raw console error payloads are logged.

`createReportHandlers(store)` and `createReportRouter(store, requiredAuth,
optionalAuth)` supply explicit composition. Existing exports/default router remain
Mongo-bound. Handler behavior, URL/middleware ordering, validators, name helper,
serializer, Mongo adapter/model and production startup remain unchanged. The shared
integration app optionally mounts the real report router using the same PostgreSQL
UserStore-backed auth as its auth and feeding routers. No handler logic is copied.

The combined smoke flow starts from zero report stats, registers/logs in A and B,
creates A's station, records B's feeding and reads public history, creates A's
report with forged fields ignored, lets B claim and resolve, and verifies exact
global/personal stats before and after transitions. Personal lists filter B's
assignment rather than A's authorship. A fresh pool/app reads station, feeding and
report records with B's existing token. Unexpected Mongoose connections, queries
and saves are intercepted throughout; all four domains share the isolated SQL DB.

## Implementation validation before the timing closeout

Final validation uses installed dependencies and PostgreSQL 18.6 / PostGIS 3.6.4:

| Check | Result |
| --- | --- |
| Backend TypeScript build | PASS |
| Existing backend tests | 176/176 PASS; assertions unchanged |
| Complete PostgreSQL/PostGIS suite on final implementation | 96/96 PASS |
| Repeat complete PostgreSQL/PostGIS suite | 96/96 PASS |
| Frontend TypeScript/Vite build | PASS |
| Existing frontend feeding tests | 30/30 PASS |
| Tracked/new-file whitespace checks | PASS |

The 96 include 29 new report tests, all 28 feeding tests, 23 auth tests and 16
foundation tests, including parent tests. The existing serial PostgreSQL script
needs no changes. An initial complete run also passed 96/96; final runs followed
the reviewed unknown-resolving-user refusal adjustment. There was also one failed
intermediate run: 89 passed / 7 failed, consisting of four timestamp-window
assertions plus their three parent tests. The assertions compared PostgreSQL
current timestamps against Windows Date.now() bounds in the foundation, feeding
and report suites. No assertions or clocks were changed. A later 20-sample clock
probe placed every database timestamp within its host request window (1-3 ms
round trips); the original failure's exact clock offset/cause was not captured.
The unchanged final code then passed two consecutive complete 96/96 runs. Treat
these cross-clock timestamp checks as a remaining test-environment sensitivity,
not a resolved root cause. The complete suite ran four times in total: 96/96,
89/96, 96/96 and 96/96. An initial compilation
caught alias-specific types and pool-only typing in shared transaction helpers;
these were corrected before successful builds. No required check was skipped or blocked.

Exact commands (PowerShell; routine outputs captured in temporary log files):

```powershell
# root: preflight and owned disposable service
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray status --short
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray branch --show-current
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray log -5 --oneline
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray rev-parse HEAD
docker --version
docker compose version
docker info --format '{{.OSType}}'
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'
docker compose -f compose.postgres.yml --profile test up -d --wait test-db

# server: offline migration generation; ordinary backend tests
npm.cmd run db:generate -- --name report_compatibility
npm.cmd test

# root: build and complete final integration runs
npm.cmd run build --prefix server
$env:RAY_TEST_DATABASE_URL = 'postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'
npm.cmd run test:postgres --prefix server
npm.cmd run test:postgres --prefix server

# client
npm.cmd run build
node --test tests/feedingStations.test.cjs tests/feedingLogs.test.cjs

# root: whitespace and owned test-container cleanup
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard |
  ForEach-Object { git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --no-index --check -- NUL $_ }
docker compose -f compose.postgres.yml --profile test rm -s -f test-db
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'
```

Docker, offline generation and frontend build used approved elevated execution.
Cleanup verification found no remaining domain tables, migration schema or other
test database connections. Only this run's test container was removed; the stopped
development container and volume were preserved. No live data/secrets, real accounts,
MongoDB/upload services, exports/imports, repair or cutover were accessed/performed.
No frontend, dependency, runtime, cloud resource or deployment changes occurred.

Historical source-data compatibility, migration rehearsals, production-scale
performance, broader concurrency and deployment remain separate work. The
[existing security findings](../security/milestone-10b-audit-triage.md) remain open;
passing local tests does not provide public-deployment clearance.

The timestamp reliability closeout below supersedes the earlier test-sensitivity note.

Complete implementation plus closeout staging paths, **shown only**:

```powershell
git add -- server/reports/postgresReportStore.ts server/controllers/reportController.ts server/routes/reportRoutes.ts server/db/schema.ts server/db/migrations/0005_report_compatibility.sql server/db/migrations/meta/0005_snapshot.json server/db/migrations/meta/_journal.json server/tests/integration/authApp.mjs server/tests/integration/postgresReports.test.mjs server/tests/integration/postgres.test.mjs server/tests/integration/postgresFeeding.test.mjs server/tests/integration/timestamps.mjs server/tests/integration/postgresTimestamps.test.mjs docs/migrations/postgres-reports.md
git commit -m "feat: verify PostgreSQL reports with atomic claims and reliable timestamp tests"
```

No staging, commit or push was performed.

## Timestamp reliability closeout (2026-09-23)

Closeout started on the expected branch/HEAD
`ray-2-postgres` / `ce700a53fb2ea5c6c1196e611c31ce2067321060`, with the ten
uncommitted 10D.3 files above expected and preserved. No unrelated changes or
AGENTS.md instructions were found. Content hashes confirm the eight pre-existing
production/schema/migration/harness files are unchanged by closeout. Only the
existing report integration test and this document were further edited, alongside
changes to the foundation/feeding tests and two new test files:
`tests/integration/timestamps.mjs` and `tests/integration/postgresTimestamps.test.mjs`.
No production behavior, dependency, migration, precision or clock setting changed.

### Original failures and retained evidence

The saved `%TEMP%\ray-10d3-postgres-final.log` records **four failed leaves**, not
seven independent defects. Locations below are from that original output, before
closeout edits; filenames are relative to `server/tests/integration/`.

| Exact leaf test | Original test / assertion line | Failed assertion |
| --- | --- | --- |
| all four tables return UUIDs, public IDs, defaults and nullable fields | postgres.test.mjs:60 / :64 | `row[field].getTime() >= before && row[field].getTime() <= Date.now()` |
| adapters preserve observed Mongo defaults, whitelist, Dates, public IDs and actual spatial/FK values | postgresFeeding.test.mjs:127 / :145 | `date.getTime() >= before && date.getTime() <= Date.now()` |
| HTTP empty optionals/default feeding, station-specific history and inactive public reads | postgresFeeding.test.mjs:377 / :389 | `Date.parse(feeding.body.fedAt) >= beforeTime && Date.parse(feeding.body.fedAt) <= Date.now()` |
| adapter defaults, trusted fields, parameterized text, Dates, UUID FKs and spatial precision | postgresReports.test.mjs:229 / :241 | `date instanceof Date && date.getTime() >= start && date.getTime() <= Date.now()` |

The parent failures were `real PostgreSQL/PostGIS foundation` (one child),
`real PostgreSQL feeding adapters and complete production HTTP flow` (two children),
and `real ReportStore, report HTTP and combined four-domain PostgreSQL flow`
(one child). Their `subtestsFailed` status explains the reported 89 passed / 7 failed
out of 96. The log retains only boolean expected=true / actual=false, no actual
Date values, sampled bounds or failing loop-field identity. Those values cannot
be reconstructed and are not invented here.

A single unchanged diagnostic run of the three affected files passed **73/73**.
Thus the original four test failures were not reproduced in their original tests.
A separately bounded 32-query probe did reproduce the defective comparison
assumption: 14 rounded `now()` observations fell outside their host request windows,
and 17 rounded values were 1 ms above pg's Date conversion of raw `now()`.
For example, host bounds were `2026-09-23T07:13:40.343Z` through `.344Z`, while
PostgreSQL `now()::timestamptz(3)` returned `.345Z`. The same raw timestamp converted
by pg was `.344Z`. Rounded database-clock observations minus host response time
ranged from 0 to +1 ms. Evidence is retained in
`%TEMP%\ray-10d3-closeout-clock-diagnostic.log`.

A fixed SQL experiment confirms precision independently of clock alignment:
`2020-01-01T00:00:00.000600Z` read as unrestricted timestamptz through pg becomes
Date `.000Z`, whereas PostgreSQL's timestamptz(3) cast yields `.001Z`. An input
at `.000400Z` rounds to `.000Z`. Drizzle's raw execute path instead returns timestamp
text (confirmed in the installed node-postgres/session.js); ORM timestamp columns
map to Date. Test observations now explicitly normalize that text after the SQL
precision cast. This is test code, not a driver or application change.

### Confirmed findings versus hypotheses

| Candidate | Finding |
| --- | --- |
| Node wall clock versus database time | Proven invalid assumption: independent clock readings are not guaranteed to enclose rounded database values; the bounded probe produced counterexamples. |
| Precision/rounding/conversion | Proven: PostgreSQL rounds at precision 3 while Date cannot retain sub-ms digits. Even an unrounded database upper bound parsed by pg can wrongly reject the same stored instant. |
| Transaction start versus execution | Confirmed semantics: defaults use now()/transaction start; updated_at trigger uses clock_timestamp()/execution. The original four lower bounds preceded their operations/BEGINs, so no misplaced transaction bound was identified there. New regressions protect the distinction. |
| Missing awaits or incorrect sampling order | Inspected inserts, adapters and requests are awaited; no missing await was found. |
| Reused fixtures, leaked transactions, order dependence | Defaults were checked before later fixture mutations; report/feeding creations use fresh IDs. Guarded serial lifecycles, rollback tests and cleanup remain intact. No evidence of a leak/order defect was found. |
| Incorrect production timestamp | No demonstrated production defect. Adapters omit creation timestamps; log default test omits fedAt; columns and trigger behave as defined. |

These findings establish a defect in the assertion design. They do **not** establish
which clock/rounding event caused each historical failed assertion, because that
run omitted values. Historical root cause remains unconfirmed. No host/WSL/Docker
clock configuration was inspected for modification or changed.

### Replacement assertions and retained guarantees

- Foundation defaults still omit all timestamp inputs. Each insertion now observes
  `transaction_timestamp()::timestamptz(3)` on the same explicit transaction/client
  and compares createdAt/updatedAt (and default fedAt) to it exactly. A default
  generated from the wrong instant is rejected; no date is supplied to the insert.
- Station/log/report adapter defaults are bracketed by awaited
  `clock_timestamp()::timestamptz(3)` observations on the same database, before the
  operation can BEGIN and after it completes. Returned values must lie within
  those bounds and same-transaction default fields must agree. There is no added
  tolerance, retry, sleep or global clock mock. The helper deliberately rejects
  backwards database bounds and reports the actual value and both bounds on failure.
- Default feeding HTTP responses and report list timestamps are compared exactly
  against separately read persisted values in canonical UTC. Feeding persisted
  values also satisfy the database generation bounds. This checks serialization
  and persistence, not merely Date validity.
- The companion foundation test `historical millisecond timestamps insert unchanged;
  SQL updates trigger all tables` also used a host-clock assumption, with a 5-second
  allowance. It now checks each trigger result against rounded database execution
  bounds and rereads persistence, while retaining exact historical createdAt and
  supplied initial updatedAt checks. The allowance was removed, not enlarged.
- Fixed historical and ordering fixtures, explicit feeding dates/offset conversion,
  denied-action equality, rollback equality, migration preservation and concurrency
  assertions remain. Date.now() now appears only in existing bounded lock-observer
  deadlines, not timestamp-value correctness comparisons.

The new regression file adds five counted tests (including one parent): negative
bounds checks reject stale/future values just 1 ms outside the interval, invalid
Dates and reversed bounds; HTTP checks reject a 1 ms altered instant and non-UTC
output. Actual SQL verifies rounding and demonstrates the invalid unrounded bound.
A real transaction observes database-clock advancement with at most 64 queries,
without sleeping, then creates all four domains with timestamp inputs omitted.
Their defaults must equal transaction start even though execution is later. An
UPDATE must instead produce a later execution-time timestamp, preserve createdAt,
and survive commit/persisted reread. This would fail for a trigger incorrectly using
transaction time, or defaults incorrectly using statement/execution time.

### Bounded validation ledger

No retry-until-green loop or restarted full-suite count was used. The three complete
runs below were issued once as a fixed `1..3` sequence, retaining every outcome.

| Run/check | Result |
| --- | --- |
| Original affected files, once before edits | 73/73 PASS |
| Initial edited focused run | 57 passed / 8 failed of 65 reached; helper incorrectly assumed Drizzle execute returned Dates, causing early parent termination; corrected text normalization |
| Corrected focused repetition 1 | 78/78 PASS |
| Corrected focused repetition 2 | 78/78 PASS |
| Backend build and ordinary tests | PASS; 176/176 |
| Complete PostgreSQL run 1 | 101/101 PASS; exit 0 |
| Complete PostgreSQL run 2 | 101/101 PASS; exit 0 |
| Complete PostgreSQL run 3 | 101/101 PASS; exit 0 |
| Frontend build and feeding tests | PASS; 30/30 |
| Tracked and new-file whitespace | PASS |

The full-suite count is now 101: the original 96 plus five timestamp regression
checks/parent. The initial edited focused failure was a helper implementation error,
not a reproduced historical timestamp failure. Its early foundation-parent failure
explains the lower reached-test count; no test was skipped to obtain a pass.

Exact test commands from the repository root (PowerShell; synthetic test URL only):

```powershell
$env:RAY_TEST_DATABASE_URL = 'postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'
node --test --test-concurrency=1 server/tests/integration/postgres.test.mjs server/tests/integration/postgresFeeding.test.mjs server/tests/integration/postgresReports.test.mjs
node --test --test-concurrency=1 server/tests/integration/postgres.test.mjs server/tests/integration/postgresFeeding.test.mjs server/tests/integration/postgresReports.test.mjs server/tests/integration/postgresTimestamps.test.mjs
npm.cmd run build --prefix server
npm.cmd test --prefix server
npm.cmd run test:postgres --prefix server
npm.cmd run test:postgres --prefix server
npm.cmd run test:postgres --prefix server
```

The four-file focused command ran three times total: initial helper failure, then
two corrected repetitions. Every run's output is retained under
`%TEMP%\ray-10d3-closeout-*.log`; the full runs are numbered `full-1` through `full-3`.
Frontend commands from client/: `npm.cmd run build` and
`node --test tests/feedingStations.test.cjs tests/feedingLogs.test.cjs`.
Whitespace commands are the tracked `git diff --check` and per-new-file
`git -c core.safecrlf=false diff --no-index --check -- NUL <path>`, using the existing
safe.directory override as listed above. The unchanged local-config identity,
ownership/advisory-lock and cleanup guards were used throughout.

Closeout is ready for a reviewed 10D.3 checkpoint commit. No production/schema changes
were made to satisfy tests. Cleanup confirmed zero remaining domain tables/migration
schema and zero other test DB connections; only the owned disposable container was
removed. Development container/volume were preserved. Normal defaults remain MongoDB;
no live data was accessed or migrated, and no frontend/dependency/deployment changes
occurred. Existing security findings remain open. No staging, commit or push occurred.
