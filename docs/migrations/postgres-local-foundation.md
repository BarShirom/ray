# PostgreSQL local foundation (Milestone 10B)

**The application still uses MongoDB.
This milestone prepares and tests the PostgreSQL foundation only.**

Baseline: branch `ray-2-postgres`, commit `2307623` (Milestone 10A API contracts).
See [the compatibility baseline](postgres-api-compatibility.md). Express startup,
Mongoose models, controllers, routes, auth, validation and frontend are unchanged.
No MongoDB data or real upload services are used by these integration tests.

## Versions and prerequisites

Verified with Windows PowerShell, Node **22.22.0**, npm **9.6.5**, Docker **29.8.0**
and Docker Compose **5.5.1**, using Linux containers. The backend build and all 88
existing tests pass on Node 22; `server/package.json` now declares
`>=22.22.0 <23`. No machine runtime was installed or downgraded. TypeScript/ESM
NodeNext conventions are unchanged.

Changing the engine declaration did not upgrade the installed Node runtime.
22.22.0 is the tested version, not a claim about the latest patched Node release.

New exact direct dependencies:

| Package | Version | Scope |
| --- | --- | --- |
| drizzle-orm | 0.45.2 | Runtime library, not connected to Express |
| pg | 8.23.0 | Runtime library, not connected to Express |
| drizzle-kit | 0.31.10 | Development |
| @types/pg | 8.23.1 | Development |

Stable versions and peer/engine compatibility were checked against npm package
metadata before installation. Existing package versions remain unchanged.
The [Drizzle PostgreSQL guide](https://orm.drizzle.team/docs/get-started-postgresql)
documents the pg adapter; its current RC installation examples were deliberately
not used. The [migration guide](https://orm.drizzle.team/docs/migrations) describes
the versioned SQL workflow used here.

Docker image: **`postgis/postgis:18-3.6`** (explicit stable tag), tested with
**PostgreSQL 18.6 / PostGIS 3.6.4**. This tag is maintained and recommended by the
[image project](https://github.com/postgis/docker-postgis). It may receive newer
patch releases. PostgreSQL 18 uses `/var/lib/postgresql` as its volume path.

## PowerShell setup and commands

Run from the repository root. Docker Desktop must already be installed/running
with Linux containers. Do not install system software as part of these commands.

```powershell
node --version
npm.cmd --version
docker --version
docker compose version
docker info --format '{{.OSType}}'   # must print linux

# On a fresh checkout, install the locked backend dependencies.
Push-Location server
npm.cmd ci
Pop-Location

# These credentials are LOCAL-ONLY examples matching compose.postgres.yml.
$env:RAY_LOCAL_DATABASE_URL = 'postgresql://ray_local:ray_local_only@127.0.0.1:55432/ray_local'
$env:RAY_TEST_DATABASE_URL = 'postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'

# Development database, with its own persistent named volume.
docker compose -f compose.postgres.yml --profile dev up -d --wait db
Push-Location server
npm.cmd run db:migrate
Pop-Location

# Separate disposable test service, backed by tmpfs (no test data volume).
docker compose -f compose.postgres.yml --profile test up -d --wait test-db
Push-Location server
npm.cmd run test:postgres
Pop-Location
```

The Compose project is `ray-postgres`. Development uses
`127.0.0.1:55432/ray_local` and volume `ray-postgres_ray_local_data`; tests use
`127.0.0.1:55433/ray_test`. Both have readiness healthchecks. Ports bind only to
numeric loopback. If a port is occupied, resolve that conflict before proceeding;
the guards intentionally reject alternate ports/names.

There is no automatic dotenv loading. Only the two dedicated Ray variables above
are used, with no fallback to `DATABASE_URL`, `MONGO_URI`, or generic PG routing
variables. `server/.env.postgres.example` records the local examples. Optional
local files `.env.postgres.local` and `.env.postgres.test` are ignored by Git;
never overwrite an existing `.env`. To load a dedicated file explicitly after a
backend build, use Node's `--env-file=.env.postgres.local` before
`dist/db/migrate-local.js` or `--test tests/integration/*.test.mjs`, from `server/`.

Generate migrations offline from `server/`:

```powershell
npm.cmd run db:generate -- --name describe_change
npm.cmd run db:generate -- --custom --name describe_custom_sql
```

Review and retain generated SQL, snapshots and `meta/_journal.json` together.
Never edit a migration that has already been shared/applied; add a new one.
There is no `drizzle-kit push` workflow and no startup migration hook.
The guarded `db:migrate` command builds the backend and applies existing files to
development only. Integration tests apply the same migrations to the test service.

Stop services from the repository root:

```powershell
docker compose -f compose.postgres.yml --profile dev stop db
docker compose -f compose.postgres.yml --profile test stop test-db
```

Stop/remove **only the disposable test container** to recover after an interrupted
test run. This discards its tmpfs, never the development volume:

```powershell
docker compose -f compose.postgres.yml --profile test rm -s -f test-db
docker compose -f compose.postgres.yml --profile test up -d --wait test-db
```

Do not use `down -v`, reset existing volumes, or prune Docker resources. Normal
tests remove only their own tables, trigger function and migration journal/schema
in a finalizer and close all connections. They reject existing Ray objects before
setup, rather than wiping a possibly meaningful test database. An advisory lock
prevents two copies of this suite from creating/cleaning the same objects.

## Schema and compatibility decisions

Only four domain tables are introduced:

| Table | Relationships / delete action |
| --- | --- |
| users | Referenced by reports, stations and logs |
| reports | Nullable `created_by`, `assigned_to` -> users UUID; SET NULL |
| feeding_stations | Required `created_by` -> users UUID; RESTRICT |
| feeding_logs | Required `station_id` -> stations UUID and `user_id` -> users UUID; RESTRICT |

Every table has a database-generated internal UUID primary key, and a required
unique `public_id` checked against `^[0-9a-f]{24}$`. New writers must supply a
24-character lowercase hex public ID (the tests use `node:crypto`, not Mongoose).
A future import must copy the existing public ID verbatim and resolve FKs through
an explicit public-ID-to-UUID mapping. Future API serialization exposes public
IDs, never internal UUIDs, preserving the existing `id` versus `_id` contracts.

Users have case-sensitive unique text email with no lowercase transformation or
case-insensitive extension. Password hashes are stored unchanged. Report type,
status, and log period use text plus CHECK constraints. Station names must contain
nonwhitespace text; cat/kitten counts are nonnegative integers. Required/defaulted
columns are NOT NULL. Reports default to status `new`, media `[]`; station counts
default to zero and activity to true; logs default to current `fed_at`, food true,
water false. Explicit false remains false. Repeated feedings are allowed.

Optional company, image, notes, period, note, report references and report name
snapshots are nullable. SQL NULL cannot distinguish a missing MongoDB field from
an explicit null. A later import/serializer design must preserve the API's omitted,
null and empty-string behavior deliberately. Empty strings and report snapshots
are retained; deleting a report's user does not erase its name snapshots.

All tables use required `created_at` and `updated_at` as `timestamptz(3)` with
`now()` insert defaults. Explicit historical timestamps are accepted on INSERT.
Migration `0002` installs a shared BEFORE UPDATE trigger function setting
`updated_at = clock_timestamp()` for every update, including raw SQL and FK
SET NULL updates. `created_at` is unchanged by the trigger. Updates overwrite even
an explicitly supplied `updated_at`. A future import should INSERT historical
timestamps; an upsert/update-based import needs a separately reviewed trigger
handling plan and validation that original timestamps survive. No import bypass
or import code is provided here.

## Spatial representation and indexes

Reports and stations each have exactly one authoritative
`geometry(Point,4326)` location. Drizzle represents it as `{ x: longitude,
y: latitude }`. A future API adapter maps `{ lat, lng }` to `{ x: lng, y: lat }`
and back. SQL uses `ST_X(location)` for longitude and `ST_Y(location)` for latitude.
There are no independently writable lat/lng columns. The database rejects empty
points, longitude outside [-180,180], latitude outside [-90,90], non-Point geometry
and incompatible SRIDs.

**Generator caveat:** in Drizzle 0.45.2, the built-in geometry column ignores the
configured SRID when emitting its SQL type. Migration `0001` explicitly changes
the generated type to `geometry(Point,4326)` for both columns; the snapshot still
reflects the generator's `geometry(point)`. Preserve/review the SQL typmod in future
spatial changes and run the typmod integration assertions. No-op generation has
no schema diff. The [Drizzle PostGIS guide](https://orm.drizzle.team/docs/guides/postgis-geometry-point)
also requires a separately versioned extension migration, supplied as `0000` here.
The Docker image may initialize PostGIS itself; `0000` enables it if absent.

### SRID closeout verification (2026-09-21)

The exact installed versions remain `drizzle-orm 0.45.2` and `drizzle-kit 0.31.10`.
Inspection of the installed geometry column implementation confirms that its
`getSQLType()` returns `geometry(point)`, even with `srid: 4326` in the schema.
The reviewed correction is already stored in both CREATE TABLE statements in
`server/db/migrations/0001_domain_tables.sql`:

```sql
"location" geometry(Point,4326) NOT NULL
```

The existing complete chain (`0000` extension, `0001` tables/indexes, `0002`
timestamp triggers) is sufficient. On a newly created tmpfs test container,
`npm.cmd run test:postgres` passed **16/16** against PostgreSQL **18.6** and PostGIS
**3.6.4**, without any corrective SQL after migration. No migration, snapshot,
schema or test was changed during closeout; the development database was not
started or modified, and its volume was preserved. The test container was removed.

Existing regression tests in `server/tests/integration/postgres.test.mjs` already
provide the required coverage, so no duplicate tests were added:

| Exact test name | Evidence |
| --- | --- |
| `fresh database accepts migrations and exposes PostGIS` | Guarded fresh setup applies every journal entry. |
| `required indexes, timestamp precision and spatial typmods exist` | Queries database `geometry_columns` metadata: both tables report `POINT`, SRID `4326`, dimension `2`; verifies both geography-expression GiST indexes via `pg_indexes`. |
| `spatial columns round-trip longitude/latitude and enforce Point/4326` | Checks stored `ST_SRID = 4326`, asymmetric longitude/latitude, and rejection of an explicitly labelled SRID 3857 point for each table. |
| `ST_DWithin geography uses metres for both spatial domains` | Includes the nearby point and excludes the farther point using a 200 m radius. |
| `reapplying migrations keeps journal and existing rows unchanged` | Reapplies the full chain and compares the journal and all four existing records. |

For future spatial changes, generate SQL using the commands above, then review
each new or altered location column's explicit Point/4326 typmod and every
geography-cast index. An unapplied draft migration may receive a narrow, reviewed
handwritten correction; once applied/shared, leave it unchanged and add a new
versioned custom migration if a correction is needed. Do not patch node_modules,
mass-replace generated SQL, or manually alter the database after migration.
For existing data, an SRID label and a coordinate transformation are different
operations; determine the source coordinate system before planning any correction.

Recreate only the disposable test service, apply the complete chain through
`test:postgres`, and require the metadata and SRID-rejection assertions to pass.
A missing SRID typmod causes the metadata assertion to fail even if individual
inserted points happen to carry 4326. A no-change generation result is useful
snapshot information but does not verify the actual database column definition.

Nearby queries use `ST_DWithin(location::geography,
ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography, radius_metres)` with bound
parameters. Both tables have matching GiST expression indexes on
`(location::geography)`. A plain geometry index would not cover that cast.
The tests use asymmetric coordinates and independently known ~94 m and ~1.89 km
points around a 200 m radius. No viewport-specific index or planner-choice
assertion is introduced.

Other indexes, in addition to each UUID primary key and unique public ID:

| Table | Indexes |
| --- | --- |
| users | Unique email |
| reports | `created_at DESC`; `(assigned_to, created_at DESC)`; `created_by`; `status` |
| feeding_stations | `created_by`; `created_at DESC WHERE active = true` |
| feeding_logs | `user_id`; `(station_id, fed_at DESC, created_at DESC, id DESC)` |

The final internal UUID is the stable feeding-history tie-breaker. The composite
history index also covers station FK lookups; the report assignee composite
covers assignee FK lookups, avoiding redundant indexes. All spatial index SQL is
versioned in `0001`, alongside its Drizzle declarations.

## Connection and safety boundaries

`createPostgres` accepts explicit configuration, creates a lazy pg Pool and Drizzle
handle, and supplies an idempotent async `close()`. Default limits are five clients,
5 s connect timeout, 10 s idle timeout and 15 s statement timeout. Schema imports
perform no network access; Express imports none of these modules. Queries bind
values through pg parameters or Drizzle SQL templates.

Before migrations/cleanup, tooling checks exact numeric loopback, fixed port,
database and username; a password is required. URL query parameters/fragments
are forbidden to prevent routing overrides. It also checks the connected database,
user and container-side port (5432). Error messages omit connection URLs/passwords.
TLS is disabled only in the validated localhost configuration; the reusable pool
does not override caller TLS options or disable certificate verification for
future remote deployments. See [pg SSL configuration](https://node-postgres.com/features/ssl).

## Validation and remaining work

Exact validation commands, from the repository root after setting the test variable
and starting `test-db` above:

```powershell
Push-Location server
npm.cmd run build
npm.cmd test
npm.cmd run test:postgres
Pop-Location
Push-Location client
npm.cmd run build
node --test tests/feedingStations.test.cjs tests/feedingLogs.test.cjs
Pop-Location
git diff --check
```

Verified: backend build; **88/88** unchanged backend tests; **16/16** real PostgreSQL
tests; frontend build; **30/30** existing feeding station/log frontend tests.
The default `npm test` still needs no Docker. Tests exercise actual SQL through
pg/Drizzle, including migration replay preserving rows, all four tables, defaults,
IDs, uniqueness, FK actions, checks, historical timestamps and triggers, ordering,
spatial correctness/typmods, required indexes and destructive-target refusal.

Before any future MongoDB import, audit public IDs, duplicate case-sensitive
emails, orphan/missing references, optional-field missing/null distinctions, legacy
names/snapshots, required fields, blank station names, integer/nonnegative counts,
type/status/period values, empty/out-of-range/swapped coordinates, timestamps and
unchanged password hashes. This schema is stricter than some historical Mongoose
records; no real data quality has been assessed.

Remaining work includes an API serializer and persistence implementation, import
and reconciliation rehearsals, backups/restore verification, transaction and
concurrency design, performance at scale, production roles/TLS/secrets, dependency
security review, deployment and a separately approved cutover plan. Installation
reported 12 dependency audit findings (6 moderate, 6 high); no audit-fix upgrades
were performed. The [closeout audit triage](../security/milestone-10b-audit-triage.md)
records fresh full and production-only audits, advisory conditions, baseline
dependency paths, and recommendations awaiting review. The local foundation can
be checkpointed independently of deployment approval; the application is not
cleared for public deployment by these tests. This is not a completed database
migration or production cutover.
