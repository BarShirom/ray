# SEC.1B-3B.1 - PostgreSQL station privacy foundation

Date: **2026-11-03, Asia/Jerusalem**. Branch: **`ray-2-postgres`**.
Baseline: **`180ed390e2a9a4e040b393924618039893b26ef2`**
(`docs: finalize station privacy implementation contracts`). Preflight tree/index
were clean; the [contract](station-visibility-design.md) was committed; locally
recorded upstream was **0 ahead / 0 behind**, without fetch. Root
[AGENTS.md](../../AGENTS.md) applies; no nested instruction file was found.

**Internal foundation implemented locally; partial privacy rollout, not deployable.**
No station JSON/media/legacy route, controller, serializer, current store, auth or
frontend behavior was rewired. Existing public reads remain public. A sensitive
database value is not proof of protected API access. A separate independent
critical, read-only review is the next step before any Git commit.

## Implemented boundary

[Migration 0007_station_visibility](../../server/db/migrations/0007_station_visibility.sql),
its generated snapshot/journal and [Drizzle schema](../../server/db/schema.ts) add:

- `feeding_stations.visibility`: text, NOT NULL, default `sensitive`, CHECK only
  `sensitive`/`regular`. Constant-default ADD COLUMN; no existing-row UPDATE, owner
  generation, timestamp rewrite or seed repair. Both existing and omitted new
  classifications become sensitive at the database level.
- `station_access_grants`: restricted UUID FKs for station, recipient and grantor;
  composite primary key `(station_id,user_id)` permits one latest-state row even
  after revocation. `granted_at` is required timestamptz(3) with no default, so a
  later writer supplies a fresh post-lock instant; `revoked_at` is nullable.
  CHECKs reject self-grants and revocation before grant time.
- Partial `(user_id,station_id)` index for unrevoked recipient lookup; the PK also
  serves station/recipient checks. Existing owner/spatial/discovery indexes remain.
  No speculative discovery index, permission tier, invitation/token table, expiry,
  consent field or audit-history abstraction was added.

The existing restricted, non-null `created_by` remains the sole owner. FKs prove
referential integrity, not grantor authority. Direct database operators remain
privileged; no new RLS or ownership-immutability trigger is claimed. Future grant
writes must check the immutable creator inside the station-first transaction.

[stationAuthorization.ts](../../server/feedingStations/stationAuthorization.ts)
provides internal helpers only:

| Helper | Implemented behavior |
| --- | --- |
| `resolveStationPrincipalFromVerifiedIdentity(tx, identity)` | Caller must supply required-auth's verified identity, never request-body/path identity or an unverified JWT. Resolves only the current internal user UUID and produces an opaque principal bound to that exact transaction. This helper does not itself authenticate a request. |
| `stationViewPredicate(tx, principal)` | SQL valid-classification AND current account AND (regular OR creator OR active owner-attributed explicit grant). Guest, forged/cross-transaction principal and invalid classification deny. SQL filtering can precede ordering/limits without projecting private station content. |
| `lockAndAuthorizeStation(tx, principal, publicId, action)` | `view` takes station FOR SHARE; `manage` takes FOR UPDATE. Locks only station ID without a pre-wait policy predicate, then checks current policy in a separate READ COMMITTED statement. Missing/denied returns null; allowed returns only internal station ID, canView and canManage. Only creator can manage; a grant never confers administration. |

Runtime guards reject a bare database/pool and unsupported transaction isolation.
The caller owns a short, live READ COMMITTED transaction and must use that same
client for subsequent protected work; neither transaction nor decision may be
retained after commit. No HTTP/signing/image processing under the lock. Future
policy writers lock station first, then grant state. There is no professional,
municipal, company, report-assignment, feeding-authorship or upload-owner bypass.
View-and-feed is the sole approved grant scope; no new regular-viewer `canFeed`
decision or feeding-path integration is implemented here.

## Preservation and concurrency evidence

Actual guarded disposable **PostgreSQL 18.6 / PostGIS 3.6.4** tests verify:

- Fresh migration, new sensitive default, visibility rejection, grant NOT NULL/PK/
  three restricted FKs, self/time checks, active index and explicit grant-time rule.
- Upgrade from exactly 0000-0006 with users, active/inactive stations, logs, reports,
  ready station/report attachments and historical optional/legacy values. Every
  original column/row, owner, timestamp, password-hash fixture, media reference,
  attachment ID, EWKB/SRID and geometry typmod compares unchanged after 0007/replay.
  Every old constraint remains; exactly visibility CHECK/NOT NULL is added on old
  tables. Old journal entries/source hashes remain unchanged; new grants are empty.
- Internal creator/regular/grantee/revoked/wrong-grantor/guest/unrelated-user matrix,
  no grant administration or implicit future-role access, denied invalid stored
  visibility, deleted-account/cross-transaction refusal, and SQL filter-before-limit.
- Five independent-pool cases: revoke commit before waiting view; regular-to-sensitive
  restriction before waiting view; revoke rollback before waiting view; admitted
  view holds revoke until completion; failed transaction rolls back mutation and
  releases its station lock. Tests observe blocking PIDs/query/lock edges with
  bounded polling, rather than using a sleep to assume ordering.

The disposable helper still validates URL/identity, holds the suite advisory lock,
refuses existing Ray objects before ownership, and cleans only owned objects without
CASCADE. It now recognizes grants and drops owned grants before stations/users.
A real sentinel-table probe verifies refusal without data/object changes. The
failed-open cleanup ownership branch is source-reviewed, not separately exercised
by that sentinel test. The prior feeding upgrade test separately asserts the new
sensitive column while preserving every old-column comparison.

Read-only schema comparison also verified **14 historical SQL/snapshot files byte
identical**, seven unchanged old journal entries, and a snapshot delta limited to
the grant table plus visibility/check. Offline generation replay reports no schema
changes. No persistent preview/development database or retained object was queried,
migrated, seeded, reset or otherwise targeted.

These are **internal policy/constraint** guarantees. Future endpoint feed/revoke,
visibility, grant creation and signed-read races remain NOT_TESTED until those
paths actually call the helpers and use their transaction client. Already admitted
operations/cached bytes/preissued signed URLs cannot be recalled retroactively.

## Executed validation

Node **22.22.0**, npm **9.6.5**, Docker **29.8.0**. Backend checks ran with media
disabled, inherited AWS/media/cloud credentials removed from their isolated process,
metadata disabled and AWS config/credential paths set to verified nonexistent
task-specific paths. The PG URL was only the public synthetic test example from
the [guarded setup](../migrations/postgres-local-foundation.md), numeric loopback
55433, `ray_test`, tmpfs. No live AWS/Cloudinary/third-party test was run.

| Actual command, repository root unless stated | Result / evidence tier |
| --- | --- |
| `npm.cmd run db:generate -- --name station_visibility`, cwd `server`, `TSX_DISABLE_CACHE=1` | PASS; offline generation and no-op regeneration; no database credentials in generator config. |
| `npm.cmd run build --prefix server` | PASS; backend TypeScript. |
| `npm.cmd test --prefix server` | PASS **240/240**, zero skipped; includes existing station/log/auth/report/parser/media compatibility and seven new offline policy orchestration cases. |
| `node --test --test-concurrency=1 server/tests/integration/postgresStationAuthorization.test.mjs server/tests/integration/postgresStationPrivacyMigration.test.mjs` | PASS **16/16**, zero skipped; real disposable PG foundation/migration/refusal/locking evidence. |
| `npm.cmd run test:postgres --prefix server` | PASS **143/143**, zero skipped; complete guarded PostgreSQL suite, including existing feeding/media/report/auth/preview regressions and the new foundation cases. |
| `npm.cmd run build --prefix client` | PASS; normal build, existing >500-kB chunk advisory. |
| `npm.cmd run build:postgres --prefix client` | PASS; preview build, same chunk advisory. |
| `node --test client/tests/*.test.cjs` | PASS **88/88**, zero skipped; no frontend source change. |
| `& .\client\node_modules\.bin\eslint.cmd --config client/eslint.config.js server/db/schema.ts server/feedingStations/stationAuthorization.ts` | PASS; explicit installed local config, no backend lint setup/dependency added. |
| `node --check` against the five `.mjs` paths listed below | PASS; syntax tier, not execution evidence. |
| Read-only `node -` migration/snapshot/journal comparison and final hygiene validator | PASS: 14 historical files byte-identical/seven old journal entries unchanged; all 12 changed/new files decode as UTF-8 with final newline/no trailing whitespace. Both changed documents: 40 local links/15 heading anchors valid, tables/fences/package commands valid. Five selected credential/capability patterns have no match; not a history-wide secret audit. Approved design remains byte-equivalent after newline normalization. |
| `git --no-optional-locks -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check` | PASS, exit 0; Git's configured LF-to-CRLF notices are not whitespace failures. No Git config change. Separate Node checks include untracked files. |

Exact syntax-check targets (each passed):

```powershell
node --check server/tests/integration/database.mjs
node --check server/tests/integration/postgresFeeding.test.mjs
node --check server/tests/integration/postgresStationAuthorization.test.mjs
node --check server/tests/integration/postgresStationPrivacyMigration.test.mjs
node --check server/tests/stationAuthorization.test.mjs
```

Intermediate failures are retained: sandbox migration generation hit Windows
`os.userInfo` ENOMEM and frontend esbuild could not read the workspace ancestor;
the same offline commands passed with scoped execution outside that restriction.
The first backend build caught a Drizzle `instanceof` generic-narrowing error;
a boolean runtime predicate preserves the concrete schema type and build/tests pass.
First full PG run: **137 passed / 6 failed** (including the failed parent test).
Three race fixture application names exceeded PostgreSQL's 63-byte limit; names
are now bounded/asserted while exact lock-edge observation is retained. Migration
tests now explicitly account for PG18's named NOT NULL constraint and RESTRICT
delete SQLSTATE `23001`, preserving all old-constraint/row checks and dangling
INSERT `23503` checks. Focused and complete PG revalidation pass; no production policy/schema
change or weakened guard was used to correct those test assumptions.

Docker was initially unavailable. Only the inspected, initially stopped
`ray-postgres-test-db-1` tmpfs service was started via
`docker compose -f compose.postgres.yml --profile test up -d --wait --pull never test-db`.
The engine was started through installed Docker Desktop; no Docker config changed.
`docker compose -f compose.postgres.yml --profile test stop test-db` passed at
closeout. The same test container is stopped; preview/development containers retain
their original IDs and stopped states (8 days / 6 weeks). Docker Desktop is left
running; no shared-engine shutdown was attempted. No other container or process
was stopped by a task command except its own unresponsive Desktop launch.

## Remaining exposure, decisions and release gate

Existing GET station list/detail/history and GET `/api/media/:assetId/content`
remain public. Current authenticated station/feed writes do not use this new
station ACL. Mongo station routes/default export remain unchanged. No grant API,
recipient reference, acceptance, auth-fencing UI or protected-media issuer was added.
Do not expose this partial implementation or advertise sensitive-station privacy.

PD-01 through PD-09 are preserved. Invitation expiry/reuse/consent/acceptance,
recipient label/lifecycle and audit retention remain OPEN/PROPOSED in the contract;
the schema does not settle them. Exact summary/own-history edges, regular feeding
writes, cross-tab/client/Leaflet isolation, image/report-domain policy and signed-URL
risk disposition remain dependent work.

Apply the [Release Quality Gate](../RELEASE_QUALITY_GATE.md) at local level A:
QG-01/03/11 internal authorization, integrity and migration evidence is verified
for disposable fixtures only. QG-04/07/12 regression builds/tests pass for the
unchanged routes; they do not establish new endpoint enforcement. QG-10's isolated
credential boundary is source/command-reviewed, not a comprehensive secret audit.
QG-14 production migration/recovery and QG-15 real backup/retention/provider controls
remain unverified. No new UI/browser or cloud acceptance is claimed.

All [readiness blockers](../RELEASE_READINESS.md) remain: complete JSON/media/legacy
authorization and client fencing, password/session policy, report audiences,
distributed abuse/resource limits, dependency risk, live media acceptance,
production/backup/recovery, notices/qualified privacy review, accessibility and
animal-welfare acceptance. Pilot/production remains **NOT READY**.

Next dependencies: **3B.2 JSON + 3B.3 media + safe legacy refusal** must form one
boundary before reachability; 3B.4 grants waits for lifecycle decisions; mandatory
3B.5 auth/errors -> 3B.6 state/map/media -> 3B.7 Hebrew UX -> 3B.8 integrated evidence.
The existing preview migration-state guard will refuse an unapplied 0007; do not
disable it. Any later authorized preview upgrade uses the existing runbooks inside
a stopped boundary and preserves rows/objects. Recover forward while unavailable;
no destructive down migration, grant-table removal, seed reset or public-route
rollback as privacy recovery.

No staging, commit, push, merge or deployment. The requested **separate independent
critical read-only review** must precede a commit; confirmed fixes then receive
affected revalidation and explicit Git-write approval.

## Reviewed file scope and checkpoint commands

The following **shown-only** single-line commands list exactly the 12 changed/new
files; nothing is staged. No application route, current store, frontend, package,
lockfile, cloud configuration or historical security audit file changed.

```powershell
git add -- server/db/schema.ts server/db/migrations/0007_station_visibility.sql server/db/migrations/meta/0007_snapshot.json server/db/migrations/meta/_journal.json
git add -- server/feedingStations/stationAuthorization.ts server/tests/stationAuthorization.test.mjs server/tests/integration/database.mjs server/tests/integration/postgresFeeding.test.mjs server/tests/integration/postgresStationAuthorization.test.mjs server/tests/integration/postgresStationPrivacyMigration.test.mjs
git add -- docs/security/sec-1b-3b-1-foundation.md docs/RELEASE_READINESS.md
```

Suggested commit message: `feat: add PostgreSQL station privacy foundation`.
Wait for the separate independent critical review; these commands are not execution
authorization. HEAD and local upstream tracking remain the clean preflight baseline.
