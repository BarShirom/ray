# Report persistence boundary (Milestone 10C.3)

Baseline: clean `ray-2-postgres` at
`5009e22cbf2cc540e2c7afac074f84996a4640d4` (committed 10C.2).
No applicable AGENTS.md was found. This completes boundary extraction for the
four existing domains, following the [user/auth](user-auth-persistence-boundary.md)
and [feeding](feeding-persistence-boundaries.md) patterns and preserving the
[API baseline](postgres-api-compatibility.md). Express still uses MongoDB;
PostgreSQL has not been connected to the API. No live data was accessed or migrated.

## Operations and records

`ReportStore` supports `create`, `listAll`, `listAssignedTo`, `claim`, `resolve`,
`getGlobalStats`, and `getAssignedStats`. The explicit Mongo implementation owns
model access, document conversion, lean queries, population and save operations.
It returns mapped plain `ReportRecord` and `ReportUserSummary` values, string
public IDs, ordinary Date timestamps and typed numeric statistics. Historical
fields remain optional/nullable; reads do not introduce model defaults.

Creation takes trusted creator identity/name from the controller, fixes status
to `new`, preserves description whitespace, and retains the ordered media array
or the existing empty-array default. Guests keep null creator and `Guest` snapshot.
Body-supplied ownership, assignee, status and name snapshots remain ignored.
The existing schema supplies the remaining defaults; no schema or validation changed.
Lists retain `createdAt DESC` with no extra tie-breaker. Personal list/count filters
remain `assignedTo`, never `createdBy`. Counts still execute separately/sequentially;
they are not a consistent transactional snapshot.

Claim returns `claimed`, `not-found` or `not-new`; resolve returns `resolved`,
`not-found` or `not-assignee`. These are domain outcomes, not HTTP responses.
Claim retains read/check/save, the trusted assignee, and the name fallback
`actorName ?? storedAssignedToName ?? null`, including stored empty strings.
Resolve compares the raw stored assignee ID before population. A dangling user
reference becoming null in the display response cannot change that authorization.
Display summaries are never used as authorization identities. Repeated resolution
by the same assignee remains allowed, without a new status precondition.

The controller retains existing 404/400/403 outcomes and operation-specific 500
responses. Creation still forwards unexpected errors to `next(err)`. Malformed
report IDs still reach claim/resolve's existing 500 paths; the station ID guard
is not applied here. This inconsistency is an existing issue, not recommended API
design. Read/check/save remains non-atomic; concurrent claims/resolutions need
deliberate remediation in later PostgreSQL implementation work.

## Serialization

One serializer serves create, both lists, claim and resolve. It whitelists `_id`,
description/type/status, numeric `{ lat, lng }`, ordered media, ISO UTC timestamps,
safe populated relations and both name snapshots. User summaries whitelist only
`_id`, `firstName`, `lastName`, and legacy `name`; no email, company, credentials,
tokens or other metadata is returned. Raw reference IDs remain inside the Mongo
authorization flow rather than being substituted for populated response summaries.

Name precedence is unchanged: a non-nullish stored snapshot wins, including `""`;
otherwise a truthy populated legacy name wins; otherwise truthy first/last names
are joined with one separator and no trimming; otherwise null. The existing
computed name fields still appear as null when no name exists. Other missing fields
remain omitted, and explicit nulls/empty values remain distinct. `legacyVersion`
preserves the value/presence of `__v` (including zero/null) without inventing a
version. This field is legacy HTTP compatibility, not a new domain requirement.

## Coupling scan

The read-only production controller/middleware scan found **no remaining direct
Mongoose/model imports or Mongoose query/document operations**. Callers still
explicitly select their Mongo adapters. Remaining direct production coupling:

| File(s) | Purpose |
| --- | --- |
| `server/users/mongoUserStore.ts` | User queries and mapping |
| `server/feedingStations/mongoFeedingStationStore.ts` | Station writes/queries and mapping |
| `server/feedingLogs/mongoFeedingLogStore.ts` | Log writes/history and mapping |
| `server/reports/mongoReportStore.ts` | Report writes/queries, population, authorization and counts |
| `server/models/UserModel.ts`, `FeedingStationModel.ts`, `FeedingLogModel.ts`, `ReportModel.ts` (all under `server/models/`) | Existing schemas, references, defaults and model registration |
| `server/server.ts:2`, `server/server.ts:101` | Mongoose import and active MongoDB connection |

## Validation (2026-09-23)

All 139 previous backend tests and 37 new report tests pass: **176/176**.
Existing HTTP/security assertions and helper implementations are unchanged.
New tests cover real adapter mapping and HTTP router/controller/serializer paths
with stubbed Mongoose calls, synthetic creation documents and lean/populated
fixtures. They check trusted writes, names, omission/null/version semantics,
whitelists, query filters/order, counts, no mutation/save/population on refusal,
raw-assignee authorization with missing populated users, repeated resolution,
malformed IDs, and query/save/population error paths. Unexpected Mongo access is
intercepted; mocks/environment are restored and HTTP servers close.

Exact commands (PowerShell, indicated directory):

```powershell
# root: standalone backend build
npm.cmd run build --prefix server
# server
npm.cmd test
$env:RAY_TEST_DATABASE_URL = 'postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'
npm.cmd run test:postgres
# client
npm.cmd run build
node --test tests/feedingStations.test.cjs tests/feedingLogs.test.cjs
# root: inspect; start before integration; remove only this run's test container afterward
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'
docker compose -f compose.postgres.yml --profile test up -d --wait test-db
docker compose -f compose.postgres.yml --profile test rm -s -f test-db
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard |
  ForEach-Object { git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --no-index --check -- NUL $_ }
rg -n 'mongoose|models/|Model\.|\.populate\(|\.lean\(|\.save\(|\.countDocuments\(' server/controllers server/middleware
rg -n 'mongoose|models/' server --glob '*.ts' --glob '!node_modules/**' --glob '!dist/**'
```

Both builds pass; backend **176/176**, real PostgreSQL/PostGIS foundation **16/16**,
frontend station/log **30/30**, tracked/new-file whitespace checks pass.
Docker and frontend build used approved elevated sandbox access. The unchanged
foundation suite ran on a fresh tmpfs test container with PostgreSQL 18.6 /
PostGIS 3.6.4 and existing safety guards. Connections closed and this run's test
container was removed; the development container remains stopped and its volume
`ray-postgres_ray_local_data` remains present.

Stubbed Mongo tests do not verify real persistence, population, sorting, data
quality or concurrent-write safety. PostgreSQL foundation tests do not test the
running API against PostgreSQL. Existing [security findings](../security/milestone-10b-audit-triage.md)
remain open; this is not deployment clearance or cutover. No auth/user/feeding,
schema, route, startup, frontend, PostgreSQL, upload, dependency or lockfile changes
were made. Nothing was staged, committed or pushed.
