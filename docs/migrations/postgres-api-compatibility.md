# PostgreSQL migration: REST compatibility baseline (10A)

Baseline: `95cc1a8` (`feat: add feeding station creation flow`), branched from
`ray-2-foundation` to `ray-2-postgres`. This milestone changes tests/documentation
only. Production routes, controllers, models, validation and frontend are unchanged.

## Endpoint and authentication matrix

All paths below are relative to `/api`. Required authentication means the existing
Bearer JWT middleware plus a successful User lookup. Lists return plain arrays,
without pagination envelopes. No response wrapper should be introduced by migration.

| Method/path | Authentication | Success |
| --- | --- | --- |
| POST `/auth/register` | Public | 201 `{user, token}` |
| POST `/auth/login` | Public | 200 `{user, token}` |
| POST `/reports` | Optional; guests allowed | 201 report |
| GET `/reports` | Public | 200 report array |
| GET `/reports/me` | Required | 200 reports assigned to the current user |
| PATCH `/reports/:id/claim` | Required | 200 updated report |
| PATCH `/reports/:id/resolve` | Required; assignee only | 200 updated report |
| GET `/reports/stats` | Required | 200 `{total, resolved, inProgress, new}` |
| GET `/reports/stats/me` | Required | 200 `{total, resolved, inProgress}` for current assignee |
| POST `/feeding-stations` | Required | 201 station |
| GET `/feeding-stations` | Public | 200 active station array |
| GET `/feeding-stations/:id` | Public | 200 station, including inactive stations |
| POST `/feeding-stations/:stationId/feedings` | Required | 201 feeding log; station must exist and be active |
| GET `/feeding-stations/:stationId/feedings` | Public | 200 log array; station must exist, may be inactive |

Uploads/health/startup middleware are outside this test milestone. Existing upload
URLs and Cloudinary behavior must not change as part of the database migration.

## IDs, relationships, serialization

- MongoDB ObjectIds serialize as 24-character hexadecimal strings. Auth uses
  `user.id`; reports, stations and logs use `_id`. JWTs contain the user ID in `id`
  and expire after seven days. Preserve existing IDs and valid tokens at cutover.
- Auth user fields are `id`, `firstName`, `lastName`, `email`, optional `company`.
  `token` is top-level. No password/hash or nested token is returned.
- Report `createdBy` and `assignedTo` are populated user objects with `_id` and
  selected `firstName`, `lastName`, optionally legacy `name`, or null. They do not
  expose user email/password. Keep this distinct from raw station/log references.
- Station `createdBy`, log `stationId` and log `userId` are raw ID strings.
- Locations remain `{lat: number, lng: number}`, not GeoJSON or SQL point values.
- `createdAt`, `updatedAt`, and log `fedAt` serialize to ISO UTC strings with
  milliseconds. Stats/counts remain JSON numbers, not PostgreSQL bigint strings.
- Raw Mongoose results may include `__v`. Synthetic saved fixtures include it;
  some equality assertions capture it. No inspected frontend consumer uses it.
  Removing it still needs an explicit compatibility decision, not an accidental
  consequence of replacing Mongoose.

## Defaults, optional fields, and ordering

**Auth:** registration trims first/last names, requires a valid email and at least
8 password characters; login requires a valid email and nonempty password.
Company omitted from a record is omitted from JSON. Empty string is retained.
Registration rejects `company: null`, but login of a stored null company returns
explicit null. Existing password hashes must not be regenerated during migration.
Email is currently matched exactly; case normalization is a separate decision.

**Reports:** types are `emergency`, `food`, `general`; statuses are `new`,
`in-progress`, `resolved`. Creation fixes status to `new`, defaults media to `[]`,
and ignores body ownership/status fields. Description must contain nonwhitespace
text but is not trimmed. Media is an ordered string array, with no URL validation.
Creator comes from optional authentication, otherwise null with name `Guest`.
Assignee and its name initially default to null. Stored display names win using
nullish fallback (even an empty stored name wins). Otherwise use populated `name`,
then first/last name, then null. Lists request `createdAt` descending. `/me` and
personal statistics filter by **assignedTo**, never createdBy.

**Stations:** name is trimmed/nonblank; counts are nonnegative integers defaulting
to zero; active defaults to true. Creation ignores body `createdBy`/`active` and
uses the authenticated identity. Image/notes are omitted when absent; empty
strings and notes whitespace are retained. Creation rejects explicit nulls, but
stored nulls pass through public reads. List queries request `active: true` and
`createdAt` descending. Detail queries do not filter activity.

**Logs:** body allows only `fedAt`, `period`, `food`, `water`, `note`; all unknown
keys, including `userId` and `stationId`, are rejected. Station identity comes from
the URL; user identity comes from `req.user._id`. `fedAt` defaults to current time
and accepts ISO datetimes with offsets; period is optional morning/noon/evening.
Food defaults true, water false; explicit false is retained for both. Omitted
period/note are omitted in JSON. Notes trim whitespace, possibly to an empty
string. Explicit null for those optional inputs is rejected. History requests
filter by station ID and order by `fedAt` descending, then `createdAt` descending;
equal values for both have no specified tie-breaker. Public history remains
available for inactive stations. There is no one-feeding-per-user/day restriction.

## Error contracts

Zod validation returns HTTP 400:

```json
{
  "message": "Validation failed",
  "errors": [{ "field": "email", "message": "Invalid email" }]
}
```

Nested fields use dotted paths, e.g. `location.lat`. Root issues, including unknown
feeding-log keys, use `body`. Tests protect the envelope and string field/message
types without freezing every library-generated Zod message.

| Situation | Status and body |
| --- | --- |
| Duplicate registration (existing-user lookup) | 400 `{msg: "User already exists"}` |
| Unknown email or wrong password | 400 `{msg: "Invalid email or password"}` |
| Missing/incorrect Bearer prefix | 401 `{error: "Authorization token required"}` |
| Invalid/expired token | 401 `{error: "Invalid or expired token"}` |
| Required auth user missing | 401 `{error: "User not found"}` |
| Report missing during claim/resolve | 404 `{error: "Report not found"}` |
| Claim of non-new report | 400 `{error: "Report is already claimed or resolved"}` |
| Resolve by anyone except assignee | 403 `{error: "Only assigned user can resolve the report"}` |
| Malformed station ID | 400 validation envelope, field `id` or `stationId`, message `Invalid feeding station ID` |
| Missing station (detail or feedings) | 404 `{message: "Feeding station not found"}` |
| Feeding creation at inactive station | 409 `{message: "Feeding station is inactive"}` |

Do not homogenize `msg`, `error`, and `message` in the database migration. Auth
controller failures use 500 `{msg: "Server error"}` (missing JWT secret uses
`Internal server error`). Report handlers use operation-specific 500 `error`
messages; other forwarded errors reach the startup handler's 500 `{error, message}`.
Not every infrastructure failure branch is covered by this offline suite.

## Quirks and separate decisions

These are observed behaviors, not endorsements or fixes in this milestone:

- Invalid optional authentication silently creates a guest report. Optional auth
  also accepts legacy JWT `_id`; required auth reads `id` only.
- Public inactive-station detail/history may need a future visibility policy.
- Malformed report IDs currently become operation-specific 500s, unlike station
  IDs. Tests inject a lookup failure to protect handler behavior; they do not prove
  MongoDB casting. Invalid report IDs should be handled deliberately in a later task.
- Claim is read-then-save, with no atomic guard against concurrent claims. Resolve
  checks assignee but not current status; repeat resolve by the assignee succeeds.
- Station activity check and log insertion are separate operations. No concurrent
  deactivation/write safety is proven here.
- Duplicate registration has a lookup/write race. The duplicate-key failure path
  is not equivalent to the tested pre-existing-user response.
- Coordinate bounds are not checked. Location/media/image validation is weaker
  than a future geospatial/storage policy may require. Do not silently tighten it.
- Auth middleware logs the authenticated user. Do not copy this into a desired
  security design. Tests suppress that logging and use synthetic users only.
- Mongoose references are not foreign keys. Orphan references, stored nulls and
  legacy `name` values need real data inspection before SQL constraints are applied.

## Test boundaries and repeatable commands

From `server/`:

- `npm.cmd run build` builds TypeScript.
- `npm.cmd test` builds and runs `node --test tests/*.test.mjs` (all backend tests).

From `client/`:

- `npm.cmd run build`
- `node --test tests/feedingStations.test.cjs tests/feedingLogs.test.cjs`

New auth/report/station contract tests and the extended existing feeding-log tests
mount the real routers, controllers, required/optional auth, Zod middleware and
schemas in an ephemeral localhost Express app. They use real bcrypt/JWT operations
and real Mongoose document defaults/casting/JSON serialization. No production
startup or upload service is imported. The test error handler mirrors startup JSON
but is not a test of the production startup wiring, CORS, or security headers.

`tests/helpers/contracts.mjs` holds HTTP setup, fixture documents and database
seams. `feedingLogDatabase.mjs` holds the existing feeding-log persistence stubs.
Queries/create/save/populate/counts are stubbed as needed; population fixtures
represent the selected fields. The tests assert requested filters, projections,
ordering and returned serialization, not the database's execution of those queries.
Saved timestamps/version fields are synthetic, not evidence that save hooks ran.
Environment and mocks are restored; dotenv loading is intercepted before importing
auth middleware, and unexpected Mongoose queries/connections/saves fail offline.
Feeding-log subtests reset mutable fixtures before each case.

Frontend tests run the existing Redux/thunk flows with a stubbed HTTP adapter and
in-memory storage, including the upload helper with synthetic responses. No real
upload service is called. These tests do not exercise a browser/map rendering.

**Unverified:** real persistence, MongoDB query sorting/population, uniqueness,
referential integrity, spatial calculations, transaction isolation, concurrent
writes, production infrastructure, and the contents of existing MongoDB data.
Those need later real-database integration and migration-rehearsal milestones.

Before cutover, inspect and back up existing MongoDB data, verify restore, audit
IDs/references/coordinates/nulls/duplicates/timestamps, and reconcile imports.
No actual MongoDB data was inspected or backed up by this milestone. Replace the
persistence stubs as PostgreSQL is introduced while retaining the HTTP assertions.
