# Local PostgreSQL application preview (Milestone 10E)

Baseline: clean `ray-2-postgres` at
`42dd056f5def1da9f86f3bac099f979aecf6e5d1`, with 10D.3 and its timestamp
closeout committed. No applicable AGENTS.md was found. Docker 29.8.0,
Compose 5.5.1, Linux engine, Node 22.22.0 and the existing locked dependencies
were used. This is a local preview, not an application switch or deployment.

## Current project context

Ray has not been used in the field. There is no historical user, report,
station, feeding-log or media dataset requiring migration. The first release
uses fresh PostgreSQL and S3 stores. This supersedes historical-data migration
assumptions in earlier milestone documents, including proposed source audits,
imports and transfer rehearsals. It does not supersede completed API compatibility
work, IDs, schema migrations, tests, or the existing security findings.

No MongoDB imports, backfills, dual writes, synchronization, account/session
migration, Cloudinary transfer or new legacy compatibility mechanisms were added.
S3 implementation remains a separate task. All preview records are synthetic.
Normal backend `dev` / `start` still select MongoDB; normal frontend `dev` /
`build` keep their original environment behavior.

## Composition and isolation

`server/preview-server.ts` starts `preview/runtime.ts`. Configuration accepts only
`RAY_PREVIEW_DATABASE_URL` and a dedicated `RAY_PREVIEW_JWT_SECRET` of at least
32 characters, different from an inherited `JWT_SECRET`. There is no fallback
to generic, Mongo, development or test database variables. Auth factories accept
an optional secret getter; normal exports still read `JWT_SECRET` at request time.
The preview getter closes over the dedicated secret without modifying global env.

`preview/app.ts` explicitly constructs UserStore, FeedingStationStore,
FeedingLogStore and ReportStore from the same Drizzle database/pool, then mounts
the existing real router/controller/middleware/serializer factories. Mongo model
modules remain transitively imported by the existing default exports but no Mongo
connection/query/save is used. Imports open no connections. No production entry
point, Cloudinary module, upload router or dotenv is in the preview import graph.
Normal `server.ts` now explicitly loads `dotenv/config` before its routes; the
import-time auth middleware dotenv call is removed. Existing contract tests pass.

The API binds only `127.0.0.1:4001`. Startup validates URL and connected database
identity, then matches all six migration journal timestamps and SHA-256 hashes
against unchanged migrations 0000-0005. It never migrates or seeds automatically.
`/healthz` is process liveness; `/readyz` checks actual database access and returns
503 when it fails. Missing/mismatched migrations name the explicit migration
command. Startup errors omit raw connection details. The listener uses Node HTTP
because Express 5 also calls its listen callback on errors. Occupied ports fail
without an alternate port or a readiness announcement.

SIGINT/SIGTERM stop accepting HTTP, allow one second before closing active HTTP
connections, and close the shared pool. A five-second process deadline bounds a
stalled shutdown. Abrupt OS termination cannot guarantee graceful callbacks;
PostgreSQL still rolls back unfinished transactions. Tests exercise a stalled HTTP
request and verify that the listener and real pool close.

Preview CORS accepts only `http://127.0.0.1:5175` (and clients with no Origin,
such as local CLI tools). No wildcard, suffix or production-origin inheritance.
All `/api/upload` calls return 503 with `uploads unavailable in local preview`,
before body parsing or any provider access. Normal Mongo upload behavior is kept.

Vite's `postgres` mode disables env-file loading and automatic env-prefix exposure,
explicitly defines `VITE_API_URL=http://127.0.0.1:4001`, and rejects a different
inherited value. Secrets are not exposed as VITE variables. The unchanged thunks
already include `/api`; the base has no `/api` suffix. Server and Vite preview
bind only loopback, with fixed strict port 5175. Build output is `dist-postgres`,
separate from normal `dist`. No existing environment file is read/overwritten by
the preview. The 5175 origin isolates Redux auth storage from normal local origins.

The existing UI/Redux flows are used without interception or fake storage. A small
preview banner labels synthetic data and disabled uploads. Both upload inputs are
disabled with explanatory text; the upload helper rejects before network access.
Existing token/name debug prints in Navbar and Report were removed so preview
use does not print tokens. This does not change authentication or report behavior.

## Database ownership and safe setup

| Target | Service/profile | Loopback port | DB/user | Storage |
| --- | --- | --- | --- | --- |
| Existing development | db / dev | 55432 | ray_local | ray-postgres_ray_local_data, unchanged |
| Disposable tests | test-db / test | 55433 | ray_test | tmpfs, unchanged |
| Synthetic persistent preview | preview-db / preview | 55434 | ray_preview | ray-postgres_ray_preview_data |

All services use the existing `postgis/postgis:18-3.6` image. No schema, migration,
snapshot, dependency version or lockfile changed. The exact local URL guard adds
only preview: numeric loopback, expected port/database/user, nonempty password,
PostgreSQL protocol, no query/fragment. Connected identity must match the database,
user and internal port 5432. Test cleanup still accepts only the disposable test
URL and identity; it refuses preview/development before issuing any query.

Run commands from the repository root in PowerShell. Docker Desktop must already
be running its Linux engine. Do not install/upgrade anything for these instructions.
If dependencies are absent on another checkout, use the existing lockfiles with
`npm.cmd ci --prefix server` and `npm.cmd ci --prefix client` once.

One-time setup (migrate/seed may safely be rerun):

```powershell
# Checks existing container/volume labels, image, mount and loopback binding.
# Refuses unexpected ownership or an occupied DB port; never deletes/adopts it.
& ./scripts/start-postgres-preview.ps1

# Local-only synthetic example; unsuitable for deployment.
$env:RAY_PREVIEW_DATABASE_URL = 'postgresql://ray_preview:ray_preview_only@127.0.0.1:55434/ray_preview'
npm.cmd run db:migrate:preview --prefix server
npm.cmd run db:seed:preview --prefix server
```

If script execution is blocked by the machine's existing policy, do not change
that policy. Inspect resources and their ownership using approved local procedures;
do not bypass a guard or silently adopt conflicts. Migration/seed errors never
justify resetting or deleting data. Unexpected migration hashes require inspection.

On each start, terminal 1 (backend):

```powershell
& ./scripts/start-postgres-preview.ps1
$env:RAY_PREVIEW_DATABASE_URL = 'postgresql://ray_preview:ray_preview_only@127.0.0.1:55434/ray_preview'
$env:RAY_PREVIEW_JWT_SECRET = 'ray-preview-only-secret-not-for-deployment-2026'
npm.cmd run build --prefix server
npm.cmd run start:postgres --prefix server
# Alternatively, for source watch mode: npm.cmd run dev:postgres --prefix server
```

Terminal 2 (frontend):

```powershell
# Explicit local value; never copy backend secrets into VITE variables.
$env:VITE_API_URL = 'http://127.0.0.1:4001'
npm.cmd run dev:postgres --prefix client
```

Open **http://127.0.0.1:5175/map-page**. API readiness:
**http://127.0.0.1:4001/readyz**. Use numeric loopback, not localhost aliases.
Do not expose either service publicly, enable tunnels or change the fixed ports.
If a port is occupied, report/inspect the conflict; do not kill unrelated processes.

Local-only seed accounts: `demo1@ray.example.invalid` and
`demo2@ray.example.invalid`; password for both: `RayDemoOnly!2026`.
These are deliberately public synthetic credentials, not deployment credentials.
The browser verification also created `browser10e@ray.example.invalid` with that
same local-only password; this third account is not part of the seed command.

The seed creates two users, three stations (cats 2/4/6, kittens 0/1/2), three
feeding logs and three clearly labelled reports covering every existing type and
status. No photographs or invented real incidents are used. Bcrypt cost 10 hashes
are generated only for missing users. Stable seed public IDs reserve the values
in `preview/seed.ts`; new application records keep their existing random IDs.

One transaction and a transaction advisory lock serialize seeds. Existing records
are skipped, never updated or deleted; password hashes, report transitions, timestamps
and manually created data survive. Missing seed rows are filled in. A reserved ID
with a different identifying email/name/note/description, or an email uniqueness
conflict, aborts and rolls back the whole run. Changing a seed identifying label
manually therefore causes refusal, not an overwrite. Review such conflicts; there
is no reset/repair mode. Repeating seed after changing a password does not reset it.

Stop/restart safely:

```powershell
# Ctrl+C in each terminal you started stops its API/frontend process.
# Then stop only the preview DB; its named volume remains intact.
docker compose -f compose.postgres.yml --profile preview stop preview-db

# Restart and verify the same owned resources without deleting anything.
& ./scripts/start-postgres-preview.ps1
# Start backend/frontend again using the separate terminal commands above.
```

Do not use `down -v`, volume removal, database resets, or Docker prune. Do not stop
other people's processes. A normal stop/start preserves preview data. The existing
development container/volume were neither started nor modified by this milestone.

## Actual browser and persistence results (2026-09-23)

Chrome browser tooling exercised the actual Vite UI, real Express API and real
persistent PostgreSQL database. No API interception, MSW or fixture responses.

| Check | Evidence/result |
| --- | --- |
| Seed map | Three stations and three reports/types/statuses rendered; station counts/history visible |
| Registration/login | Created Synthetic Browser Carer 10E; logout/login succeeded; wrong password showed `Invalid email or password` |
| Station creation | Created `SYNTHETIC BROWSER 10E station`, counts 4/1, no image; immediate marker and success state; details visible |
| Feeding | Saved food/water/morning with a synthetic note; immediate history; same history after refresh and login |
| Report creation | Created `SYNTHETIC BROWSER 10E report: UI exercise only; no real incident.` without media |
| Second actor | demo2 claimed then resolved that report; assigned names/status updated |
| Assigned list | Three assigned reports visible after map load, including resolved browser report |
| Available counts | Map legend updated to General 2, Food 1, Emergency 1, In progress 1, Resolved 2 |
| Statistics APIs (HTTP, not a statistics UI) | Global total=4/resolved=2/inProgress=1/new=1; demo2 total=3/resolved=2/inProgress=1 |
| Guest restrictions | Login/signup prompts replace station/feeding actions; claim unavailable to guest; existing guest report creation remains allowed |
| Disabled uploads | Station/report inputs disabled and labelled; direct upload HTTP 503; helper refusal tested |
| API restart | Browser station/history and assigned report still readable; fresh login and statistics correct |
| Preview DB stop/start | Only preview-db stopped; readiness 503; UI station-load error and Retry; after start readiness 200, Retry recovered stations; refresh recovered reports/history |
| Exact persistence | Station/log/assigned-report response objects, IDs, coordinates and timestamps plus statistics compared exactly before/after DB restart |
| Seed repetition | Two initial migrate/seed runs succeeded; another seed after browser writes preserved a digest of every stored row, including hashes and timestamps |
| Desktop | Actual map/report/station workflows and map tiles visually inspected |
| Narrow viewport | Requested 390x844; navigation/map/assigned-list AX and station-history interaction worked. See limitations below |

No real users/data, MongoDB or live upload service were used. Preview rows at
closeout: three users, four stations, four feeding logs, four reports. Development
storage was preserved. The owned API/frontend processes and test container were
stopped/removed at closeout; preview container was stopped with its volume retained.

## Browser limitations and existing UI issues

- A direct refresh of `/my-reports` displays zero until visiting Map. The existing
  component filters the in-memory reports list without fetching it on mount; only
  auth is persisted. Map -> My reports restores the list. PostgreSQL `/me` returns
  all three assigned reports. This pre-existing behavior was observed, not changed.
- At requested 390px width, DOM measurements showed navigation extending to x=453
  and document width 469. Existing navbar flex items do not wrap. The preview
  banner is outside that row. This is an existing narrow-layout issue, not a
  completed responsive-layout certification. Mobile screenshot capture timed out
  twice; mobile checks are DOM/AX and interaction checks, not visual sign-off.
- OpenStreetMap tiles loaded successfully (nine current tile images had nonzero
  natural dimensions); desktop screenshots showed the map. Existing Google Fonts
  stylesheet/preconnects and unpkg Leaflet marker shadows are also external asset
  dependencies. Local logo/marker assets loaded. These are not application APIs.
- Browser console warning/error collection returned no captured entries, including
  after the intentional outage, so it is not a complete network/error ledger.
  The browser tool did not expose a full network capture; resource timing was
  unavailable in its read-only scope. DOM asset URLs, local build configuration,
  actual API/SQL results and outage/recovery were checked. No remote application
  API or upload request was observed, but an exhaustive network/HAR audit is NOT RUN.
  For manual follow-up, use browser DevTools Network with Preserve log, filter
  Fetch/XHR, repeat the workflows, and verify all application requests target
  `http://127.0.0.1:4001/api/...`; inspect failed requests separately from map/font
  assets. No browser/test stack was installed.
- Real uploads are **NOT verified** and intentionally unavailable. S3 is separate.
  Existing [security findings](../security/milestone-10b-audit-triage.md) remain
  open; no risk acceptance, remediation, dependency upgrade or deployment clearance.

## Automated validation ledger

| Check | Result |
| --- | --- |
| Backend TypeScript build / ordinary tests | PASS, 182/182 |
| Full real PostgreSQL/PostGIS suite | PASS, 109/109; includes unchanged timestamp/concurrency regressions |
| Normal frontend build | PASS |
| PostgreSQL frontend build | PASS |
| Existing frontend station/log tests | PASS, 30/30; assertions unchanged |
| Preview upload refusal test | PASS, 1/1 |
| Config/cleanup guards | Remote/unexpected URLs, missing config, inherited/default secret, preview/dev cleanup refusal tested |
| Startup/runtime | Missing and mismatched migrations, fixed occupied API/frontend ports, actual readiness loss/recovery and stalled HTTP shutdown verified |
| Composition | Actual four-domain HTTP flow on disposable PostgreSQL; unexpected Mongo operations fail tests; import graph excludes dotenv/Cloudinary/startup |
| Seed | Repetition, partial completion, conflict refusal, hash/manual-row preservation verified; destructive fixtures only in disposable test DB |
| Whitespace / protected files | Tracked and new-file checks; schema/migrations/snapshots/lockfiles unchanged |

Intermediate failures were retained honestly: initial frontend builds caught an
unused selector and unavailable Node type import, fixed without new dependencies.
Two frontend test attempts stopped at the new mode module because the existing
CommonJS harness did not substitute `import.meta.env.MODE`; its loader now supplies
normal development mode, retaining all prior assertions. An edit script failed
before writing its initial seed attempt, and a later ignore-file edit targeted a
nonexistent root file; the actual client ignore file was then updated. Initial
backend preview integration passed 107/107, then 108/108 after checksum/partial-seed
coverage. The occupied API-port probe exposed the Express 5 callback issue and
falsely announced readiness; the Node listener fix plus regression tests corrected
it. Its first edit had a missing brace caught by TypeScript, corrected before the
final passing backend/full PostgreSQL runs. No assertions were weakened or skipped.

Exact validation commands from root (PowerShell):

```powershell
npm.cmd run build --prefix server
npm.cmd test --prefix server
docker compose -f compose.postgres.yml --profile test up -d --wait test-db
$env:RAY_TEST_DATABASE_URL = 'postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'
npm.cmd run test:postgres --prefix server
node --test --test-concurrency=1 server/tests/integration/postgresPreview.test.mjs
npm.cmd run build --prefix client
npm.cmd run build:postgres --prefix client
node --test client/tests/feedingStations.test.cjs client/tests/feedingLogs.test.cjs
node --test client/tests/preview.test.cjs

git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard | ForEach-Object { git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --no-index --check -- NUL $_ }
# Only this run's disposable tmpfs container; never preview/development storage.
docker compose -f compose.postgres.yml --profile test rm -s -f test-db
```

Additional negative checks: with a synthetic `VITE_API_URL=https://synthetic-remote.invalid`,
preview build refused before contacting it; a second frontend instance refused
5175. A second API instance refused 4001 with no readiness announcement after the
fix. Missing preview config exits 1 safely. The initially unmigrated preview DB
refused API startup and named `db:migrate:preview`. Runtime outputs and tests were
captured under `%TEMP%\ray-10e-*.log`. The persistence comparison used synthetic
HTTP snapshots in `%TEMP%\ray-10e-persistence.json`, with no tokens in that file.

## Reviewed files and proposed checkpoint (shown only)

Changed groups: dedicated Compose profile and guarded PowerShell starter; preview
configuration/composition/runtime/migration/seed tooling; narrow auth secret/env
loading changes; frontend mode/banner/upload disabling and logging redaction;
regression tests and this document. No schema or store semantics changed.

```powershell
git add -- client/.gitignore client/package.json client/src/api/upload.ts client/src/components/createFeedingStation/CreateFeedingStation.tsx client/src/components/layout/Layout.tsx client/src/components/navbar/Navbar.tsx client/src/components/reportForm/ReportForm.tsx client/src/pages/report/Report.tsx client/src/preview.ts client/tests/feedingStations.test.cjs client/tests/preview.test.cjs client/vite.config.ts compose.postgres.yml docs/migrations/postgres-preview.md scripts/start-postgres-preview.ps1 server/controllers/authController.ts server/db/local-config.ts server/db/migrate-preview.ts server/db/migrate.ts server/db/seed-preview.ts server/middleware/authMiddleware.ts server/middleware/optionalAuthMiddleware.ts server/package.json server/preview-server.ts server/preview/app.ts server/preview/config.ts server/preview/migration-state.ts server/preview/runtime.ts server/preview/seed.ts server/routes/authRoutes.ts server/server.ts server/tests/integration/postgresPreview.test.mjs server/tests/preview.test.mjs
```

Proposed message: `feat: add isolated PostgreSQL application preview with synthetic data`.
No staging, commit or push was performed. Normal Mongo defaults remain unchanged;
no live data was read/migrated, no cloud resources/deployment or dependency upgrade.
