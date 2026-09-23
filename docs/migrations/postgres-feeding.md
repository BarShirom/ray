# PostgreSQL stations and feeding history (Milestone 10D.2)

Baseline: clean `ray-2-postgres` at
`6a59f3a6f6f66fdff5d263bfda698ad2249eb445` (committed 10D.1).
No applicable AGENTS.md was found. Preflight verified Docker 29.8.0,
Compose 5.5.1 and the Linux engine. The preserved development container was
stopped and `ray-postgres_ray_local_data` was present.

**Auth, station creation/reads and feeding creation/history are verified together
against the same disposable PostgreSQL database. Normal application composition
still uses MongoDB.** This work does not implement a cutover or live-data import.
The [API baseline](postgres-api-compatibility.md),
[feeding boundaries](feeding-persistence-boundaries.md),
[local database safeguards](postgres-local-foundation.md) and
[PostgreSQL auth implementation](postgres-user-auth.md) remain applicable.

## Adapters and mappings

`createPostgresFeedingStationStore(db)` implements `create`, `listActive`, and
`findByPublicId`. `createPostgresFeedingLogStore(db)` implements `create` and
`listForStation`. Both accept the existing connection factory's Drizzle handle;
imports open no connections, run no migrations, and import no Mongoose code.

New public IDs use `randomBytes(12).toString("hex")`, matching UserStore.
Public relationship inputs are canonicalized to lowercase and resolved to internal
UUID FKs. Reads use joins and explicit projections to return public relationship
IDs, without per-row lookups, user emails/hashes or internal UUIDs. Creation returns
explicit inserted columns plus the resolved public references. Missing users fail;
there is no placeholder user, upsert, retry or alternate identity.

Station creation trims names, keeps notes whitespace/image strings, uses trusted
creator input, and retains SQL defaults of zero counts and active true. Log creation
keeps explicit false flags, defaults food/water to true/false and feeding time to
now, preserves supplied Dates, and trims notes. Whitelists exclude forged fields.
Application records contain Dates; unchanged serializers produce UTC ISO timestamps,
raw relationship IDs, plain arrays and the existing public keys.

Drizzle's tested point mapping writes `{x: lng, y: lat}` to the existing
`geometry(Point,4326)` column and reads `{lat, lng}`. No coordinate copies were
added. Tests verify asymmetric coordinates at nine decimal places, ST_X/ST_Y and
SRID; all original spatial typmod, index and metre-distance tests still pass.

Station listing filters active=true and orders createdAt DESC; detail includes
inactive stations. History filters the requested station and orders fedAt DESC,
createdAt DESC, then internal UUID DESC, matching the existing SQL index. The last
term only resolves otherwise tied rows; Mongo ordering for those ties was previously
unspecified. Missing station lookup returns null; valid empty history returns [].
SQL failures reject rather than masquerading as either result.

## Compatibility storage and additive migration

Migration `0004_feeding_compatibility.sql`, its new snapshot and appended journal
entry add exactly four columns to each feeding table:

| Table | Columns |
| --- | --- |
| feeding_stations | image_present, notes_present, legacy_version, legacy_version_present |
| feeding_logs | period_present, note_present, legacy_version, legacy_version_present |

Optional-field flags are NOT NULL booleans with default true. New adapter writes
explicitly set each flag false for undefined/omitted values and true for present
values, preserving absent versus null versus empty/string when read. HTTP creation
still rejects explicit null through the unchanged validators. Historical fixtures
exercise explicit null and absence through real SQL plus the production HTTP reads.
The period CHECK still permits only morning/noon/evening or SQL NULL; empty or
arbitrary historical period strings cannot be imported under the current schema.

`legacy_version` is nullable double precision, preserving JavaScript numeric values
without imposing a new integer restriction. `legacy_version_present` is NOT NULL,
default false. Reads omit the value when false and retain explicit null or numeric
values when true. Serializers still map it to `__v`. Normal adapter creation
explicitly writes present version 0, matching the existing Mongo save behavior.
Tests cover absence, null, zero, 7 and 1.5. Direct SQL writers must deliberately
maintain all presence flags; no Mongo document JSONB storage is introduced.

Upgrade policy: pre-existing SQL optional values are treated as present, including
SQL NULL, and legacy version starts absent. A SQL NULL cannot reconstruct whether
the original Mongo field was absent or explicitly null. No legacy version is
inferred. The upgrade test applies only 0000-0003 in an owned disposable database,
inserts synthetic null/empty/string rows and old timestamps, applies the full chain,
compares every previous station/log column unchanged, checks API reads, and replays
migrations without changing rows or journal entries. Fresh installation is tested too.

Previous SQL migrations/snapshots, user/report table definitions, existing feeding
columns, constraints, indexes and spatial definitions are unchanged. Snapshot
comparison verified this. No development-database migration was run.

SQL is intentionally stricter than the broad historical record interfaces: required
names/references/timestamps/booleans, real FK targets, nonnegative integer counts,
finite supported coordinates within geographic bounds, and allowed period values
must hold. Historical null/missing required values, orphan references, empty periods,
unsupported types or out-of-range coordinates still require a separate data audit.
Request validators were not tightened; unsupported SQL inputs fail safely. These
tests do not establish complete compatibility with unseen historical Mongo data.

## HTTP composition and error handling

`createFeedingStationHandlers(stations)`, `createFeedingLogHandlers(stations, logs)`
and `createFeedingStationRouter(stations, logs, authenticate)` add explicit injection.
Existing handler exports and the default router remain bound to the existing Mongo
stores and Mongo-bound authentication. Startup, auth behavior/UserStore, report code,
Mongo adapters/models, validators, serializers and URL/middleware order are unchanged.

The shared test app optionally mounts that production router with both PostgreSQL
feeding stores and `createAuthMiddleware(postgresUserStore)`. Registration and login
also use the production auth router with that same PostgreSQL UserStore/database.
No route or business handler is reimplemented in tests. Unexpected Mongoose
connections, queries and saves are intercepted throughout the PostgreSQL flow.

The complete flow registers/logs in A and B, lets A create a station despite forged
body ownership/activity fields, performs public list/detail, lets B feed A's station,
and reads public history. A fresh pool and app read the same records and authenticate
B's existing token. Tests also retain guests/invalid tokens, body validation and
zero-insert failures, malformed ID field names, missing/inactive responses, inactive
public history, optional/null/version serialization, explicit false, station-specific
history and frontend-compatible timestamps.

The controller retains its original station precheck for Mongo behavior. New
independent missing/inactive errors from the PostgreSQL transactional recheck map
to the existing 404/409 bodies. Other PostgreSQL adapter failures discard the raw
SQL error, properties and cause, yielding only `PersistenceError` /
`Feeding persistence operation failed` through the existing 500 envelope. Tests
induce actual SELECT/INSERT failures using reversible, disposable-schema DDL and
verify safe responses, unchanged row counts and no console error payloads. No global
error handling was redesigned, and Mongo errors still follow their previous path.

## Transactions and observed concurrency

Log creation uses one Drizzle transaction/client for station lookup `FOR SHARE`,
activity recheck, trusted user lookup and insert. It returns only after commit.
FOR SHARE conflicts with active-only UPDATEs; FOR KEY SHARE would not suffice.
Multiple feeding transactions can hold SHARE on the same station. Transactions
perform only these short database operations, with no network calls or retries.

Tests use real, separately named PostgreSQL sessions and the production HTTP router.
The unchanged suite owner holds its advisory lock while an observer polls
`pg_stat_activity`, `wait_event_type='Lock'` and `pg_blocking_pids` with an eight-second
deadline. The 15 ms polling delay is not evidence by itself; each test requires the
specific blocking edge and statement phase. Feeding-first/concurrent tests use a
third, test-owned transaction's `LOCK TABLE feeding_logs IN SHARE MODE` to pause
INSERT after the station row lock, without production hooks, mock SQL or triggers.
All actor statements retain the configured 15-second statement timeout.

Observed on both complete runs:

- Deactivation-first: an uncommitted active=false update allowed the HTTP precheck
  to see the previous active row. The actual feeding FOR SHARE then waited on that
  writer. After commit, HTTP returned 409 and no log was inserted.
- Deletion-first: the equivalent row-delete race waited at FOR SHARE, then returned
  404 after delete committed, with no log inserted.
- Feeding-first: the feeding INSERT was observed waiting on the table gate; the
  active=false UPDATE was then observed waiting on the feeding transaction. Releasing
  the gate produced HTTP 201. After UPDATE resumed, its transaction's next statement
  saw exactly one committed log before committing deactivation. History remained
  readable for the now-inactive station.
- Concurrent legitimate feedings: two distinct backend PIDs both reached INSERT
  while holding compatible station locks. Releasing the shared table gate produced
  two HTTP 201 responses, distinct public IDs and exactly two persisted logs.
- Failure rollback: the real period CHECK rejected insertion, row totals remained
  unchanged and history stayed empty. A separate connection immediately acquired
  FOR UPDATE NOWAIT on the station, proving no retained station lock.

Clients release in finally blocks, with pool-owned fallback releases for acquisition
failures. Pending operations are settled, open transactions rolled back, app servers
closed and actor pools ended. There is no station update/deactivation endpoint.
An inactive station can legitimately have logs that committed before deactivation.
The Mongo precheck/insert sequence and its concurrency limitation remain unchanged.

## Validation and closeout (2026-09-23)

| Check | Outcome |
| --- | --- |
| Backend TypeScript build | PASS |
| Existing Docker-free backend tests | 176/176 PASS, existing assertions unchanged |
| Complete PostgreSQL/PostGIS suite, first run | 67/67 PASS |
| Complete PostgreSQL/PostGIS suite, repeat | 67/67 PASS |
| Frontend TypeScript/Vite build | PASS |
| Existing frontend station/log tests | 30/30 PASS |
| Tracked and new-file whitespace checks | PASS |

The PostgreSQL total includes 28 new tests (including two parent tests), all 23
user/auth tests and all 16 foundation tests. Database versions: PostgreSQL 18.6 /
PostGIS 3.6.4. The default npm test remains Docker-free; the existing
`--test-concurrency=1` PostgreSQL script serializes files without modification.
No required check was blocked or skipped.

Commands executed (PowerShell; builds/test outputs captured in temporary log files):

```powershell
# repository root: preflight
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray status --short
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray branch --show-current
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray log -5 --oneline
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray rev-parse HEAD
docker --version
docker compose version
docker info --format '{{.OSType}}'
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'

# server: offline generation, no database URL or connection required
npm.cmd run db:generate -- --name feeding_compatibility

# repository root
npm.cmd run build --prefix server
docker compose -f compose.postgres.yml --profile test up -d --wait test-db
$env:RAY_TEST_DATABASE_URL = 'postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'
npm.cmd run test:postgres --prefix server
npm.cmd run test:postgres --prefix server

# server
npm.cmd test

# client
npm.cmd run build
node --test tests/feedingStations.test.cjs tests/feedingLogs.test.cjs

# repository root: whitespace and owned-resource cleanup
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard |
  ForEach-Object { git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --no-index --check -- NUL $_ }
docker compose -f compose.postgres.yml --profile test rm -s -f test-db
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'
```

Docker, offline generation and frontend build used approved elevated execution.
Only this run's disposable tmpfs test service was created/removed; the stopped
development container and its named volume were preserved. No live secrets,
MongoDB data, upload services, frontend/dependency files, runtime versions, cloud
resources or public deployment were accessed or changed. No staging, commit or push
was performed.

The [existing security findings](../security/milestone-10b-audit-triage.md) remain
open. Tests demonstrate local persistence, HTTP contracts and the measured lock
orderings; they do not establish live-data quality, migration readiness, performance
at production scale, exhaustive concurrency behavior or deployment clearance.

Reviewed staging paths and suggested commit, **shown only, not executed**. These
are the complete changed/created files for this milestone:

```powershell
git add -- `
  server/controllers/feedingStationController.ts `
  server/controllers/feedingLogController.ts `
  server/routes/feedingStationRoutes.ts `
  server/feedingStations/postgresFeedingStationStore.ts `
  server/feedingLogs/postgresFeedingLogStore.ts `
  server/feedingLogs/feedingPersistenceErrors.ts `
  server/db/schema.ts `
  server/db/migrations/0004_feeding_compatibility.sql `
  server/db/migrations/meta/0004_snapshot.json `
  server/db/migrations/meta/_journal.json `
  server/tests/integration/authApp.mjs `
  server/tests/integration/postgresFeeding.test.mjs `
  docs/migrations/postgres-feeding.md

git commit -m "feat: verify PostgreSQL feeding stores through real HTTP and concurrency flows"
```
