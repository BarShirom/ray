# Station/log persistence boundaries (Milestone 10C.2)

Baseline: clean `ray-2-postgres` at
`0b438dc86c0dd8b23e00eda3a29fe2cad2b96278` (committed 10C.1).
No applicable AGENTS.md was found. This extends the
[user boundary](user-auth-persistence-boundary.md), preserving the
[API contracts](postgres-api-compatibility.md). Express still uses MongoDB;
PostgreSQL is not connected to the API. No live data was accessed or migrated.

## Boundaries and compatibility

`FeedingStationStore` provides `create`, `listActive`, and `findByPublicId`.
`FeedingLogStore` provides `create` and `listForStation`. Their application-owned
record/input types live alongside explicit Mongo implementations. Records have
string `publicId` and raw string relationship IDs, ordinary Date timestamps,
and optional/nullable historical fields. They contain no Mongoose documents or
query objects. Missing station returns null; database failures propagate unchanged.

Creation explicitly maps the existing model fields. The unchanged models retain
station name trimming, count/active defaults, feeding-time and food/water defaults,
and note trimming. Explicit false survives. Adapters add no foreign-key checks,
repair logic, transactions, provider switches or PostgreSQL implementations.

Reads retain lean queries and never hydrate historical rows or insert defaults.
Missing/undefined values remain omitted from JSON; null, empty strings, zero and
false retain their distinct values. Historical note/name text is not retrimmed.
Station lists request `{ active: true }` with `{ createdAt: -1 }`. Detail lookup
does not filter activity. Log lists filter by the route's station ID and request
`{ fedAt: -1, createdAt: -1 }`, with no additional tie-breaker or application sort.

Shared per-domain response serializers explicitly whitelist the existing fields
for creation/list/detail/history. They emit domain `_id`, raw `createdBy` or
`stationId`/`userId`, numeric `{ lat, lng }`, and ISO UTC timestamps including
milliseconds. List/history responses remain arrays. No nested user, credentials,
internal UUID or arbitrary metadata is forwarded.

`legacyVersion` is an optional compatibility field mapped from MongoDB `__v` and
serialized back to `__v`. Existing values (including zero or stored null) survive;
absence/undefined never becomes an invented version. This is retained HTTP
compatibility, not a new domain requirement. The inspected schemas have no custom
JSON transforms; creation document conversion stays inside the adapters.

The database-independent `isPublicId` guard accepts only strings of exactly 24
ASCII hexadecimal characters, including uppercase. It rejects non-strings,
whitespace (including trailing line breaks), wrong lengths and non-hex characters.
It is used only by station/log controllers. Uppercase route strings reach Mongo
unchanged and ObjectId results retain their usual lowercase public representation.
Malformed IDs keep the existing 400 validation envelope and `id` versus `stationId`
field names. Missing stations remain 404; inactive stations reject log creation
with 409 but permit public detail/history access. Missing history is not silently
treated as an empty list. Unexpected errors still reach `next(err)`.

Trusted creator/user IDs still come from authentication, and the log station ID
comes from the URL. Body ownership/active protections and validation are unchanged.
The separate station check and log insertion remain separate, non-atomic operations;
concurrent activity changes are a known gap for later PostgreSQL/cutover design.

Both station/log controllers are free of direct Mongoose/model imports and query
chains. Mongoose remains in their adapters, the completed user adapter, unchanged
models, reports, and startup. Auth, reports, routes, schemas, PostgreSQL files,
frontend, dependencies, lockfiles, uploads and active database selection are unchanged.

## Verification (2026-09-23)

All 109 previous backend tests pass with 30 new focused tests: **139/139**.
New tests exercise real adapters with real synthetic Mongoose creation documents
and lean fixtures, as well as real HTTP routers/controllers/serializers. Coverage
includes field whitelists, dates/coordinates, defaults versus historical absence,
null/empty/false distinctions, versions, uppercase IDs, requested filters/sorts,
creation sequencing and rejected database operations. Unexpected Mongo access is
intercepted; mocks/environment are restored and HTTP servers close.

No existing HTTP, authorization or ownership assertion changed. No database-helper
implementation changed. One direct-controller fixture now supplies a string user
ID instead of an ObjectId, matching the already-established auth request identity.
The initial run passed every existing test; two new uppercase-ID fixtures had an
incorrect length and were corrected before the final passing run.

Exact validation commands (PowerShell; directory noted):

```powershell
# server
npm.cmd run build
npm.cmd test
$env:RAY_TEST_DATABASE_URL = 'postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'
npm.cmd run test:postgres

# client
npm.cmd run build
node --test tests/feedingStations.test.cjs tests/feedingLogs.test.cjs

# root: inspect, start before integration, remove only this run's test container afterward
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'
docker compose -f compose.postgres.yml --profile test up -d --wait test-db
docker compose -f compose.postgres.yml --profile test rm -s -f test-db
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard |
  ForEach-Object { git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --no-index --check -- NUL $_ }
```

Both builds pass; backend **139/139**, PostgreSQL/PostGIS **16/16**, frontend
**30/30** pass. Tracked and new-file whitespace checks pass. Docker commands and
the frontend build used approved elevated execution for sandbox access.
The unchanged foundation suite ran on a newly created tmpfs container using
PostgreSQL 18.6 / PostGIS 3.6.4 and the documented safety guards. Connections closed
and the owned test container was removed. The development container remains stopped
and `ray-postgres_ray_local_data` remains present.

Stubbed Mongo tests verify mapping, requested queries and HTTP behavior, not real
persistence, MongoDB sorting, concurrent-write safety or real-data quality. Existing
data (including malformed historical field types) still needs a separately approved
audit before migration. Passing foundation tests does not test the API against
PostgreSQL. Existing [security findings](../security/milestone-10b-audit-triage.md)
remain unresolved. No deployment clearance, dependency upgrades, staging, commit
or push are part of this milestone.
