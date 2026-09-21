# User/auth persistence boundary (Milestone 10C.1)

Baseline: clean `ray-2-postgres` at
`e93ac227920df6914536bbec0fab997ad5242170`. The 10B foundation and closeout
documentation are committed in that baseline. No applicable AGENTS.md was found.
See the [API contract baseline](postgres-api-compatibility.md),
[PostgreSQL foundation](postgres-local-foundation.md), and
[unresolved security triage](../security/milestone-10b-audit-triage.md).

Express still uses MongoDB. PostgreSQL is not connected to the API. This change
does not migrate data or approve deployment; no live data/accounts were accessed.

## Boundary and behavior

`server/users/userStore.ts` owns `UserProfile`, `UserCredentials`, `AuthIdentity`,
`CreateUser`, and the small `UserStore` interface. The explicit MongoDB
implementation provides only:

- `findByEmail`: safe profile for registration's duplicate check.
- `findCredentialsByEmail`: profile plus `passwordHash`, requested only by login.
- `create`: accepts an already-hashed password, writes the existing
  `firstName`, `lastName`, `email`, `password`, `company` fields, returns a safe profile.
- `findIdentityByPublicId`: safe identity with string `_id`; optional legacy-name
  projection is selected only by optional authentication.

Records are explicitly mapped. Model imports, documents, query chains and ID
conversion for this auth path now live in `mongoUserStore.ts`; Mongoose remains
active there, in the unchanged models, startup and other domains. There is no
provider flag, PostgreSQL user adapter, generic repository or test-only setter.
Email filters retain their original case and stored password hashes are unchanged.
Database errors propagate to the existing HTTP catch blocks.

The shared `serializeAuthResponse` whitelists `id`, `firstName`, `lastName`, `email`
and defined `company`, plus the top-level token. Missing/undefined company remains
omitted in JSON; null, empty string and nonempty string remain distinct. Mongoose's
existing document conversion omits undefined company. Legacy null/missing name
fields are not replaced with invented defaults. Credentials and database metadata
never enter the response or request identity.

| Existing behavior retained | Result |
| --- | --- |
| Registration / login success | 201 / 200, `{ user, token }` |
| Duplicate registration | 400, `{ msg: "User already exists" }` |
| Missing user / wrong password at login | 400, `{ msg: "Invalid email or password" }` |
| Missing JWT secret at register/login | 500, `{ msg: "Internal server error" }` |
| Register/login database failure | 500, `{ msg: "Server error" }` |
| JWT / hashing | Public string `id`, expiry `7d`, bcrypt cost 10 on registration; existing hashes compared at login |
| Required auth | Existing Bearer parsing, `decoded.id` only; missing header 401 `Authorization token required`, missing user 401 `User not found`, verification/lookup failure 401 `Invalid or expired token` (all `{ error }`) |
| Optional auth | Existing parsing, `decoded.id ?? decoded._id`; missing/invalid auth, missing user, missing secret or lookup failure continues as guest |

Required auth previously attached a selected Mongoose document. Both middleware
now attach plain `AuthIdentity` records with string `_id`, first/last names and
email. Only optional auth includes legacy `name`; its lean query is retained,
while required auth remains hydrated inside the adapter. Reports still prioritize
optional legacy names for creator snapshots and first/last names for required-auth
assignee snapshots. Query filters and reference assignments accept the same public
ID string through existing Mongoose casting; downstream `.toString()` comparisons
also accept strings. No report, station or log production controller changed.

The legacy Express `user?: any` augmentation remains: replacing it with an optional
typed property would require narrowing the unchanged station/log controllers.
The boundary returns typed safe records, but global request typing is still a
known limitation. The required-auth full-user debug print was removed as a
logging-only change. Other logging/error handling is unchanged.

## Verification (2026-09-21)

No test-helper implementation or existing HTTP assertion changed. The only edit
to an existing test is its stale ObjectId comment. All 88 previous backend tests
pass alongside 21 new focused tests (109 total). Tests run real routers,
controllers, middleware and the MongoDB adapter, with underlying Mongoose access
stubbed and synthetic documents. New coverage includes mapping/whitelisting,
company distinctions, hash isolation, bcrypt/JWT, credential lookup usage,
legacy claims/names and error/guest paths. Existing ownership/forged-body assertions
for reports, stations and feeding logs remain intact.

Commands run from the indicated directories:

```powershell
# server: npm test and test:postgres also run the backend build
npm.cmd run build
npm.cmd test
$env:RAY_TEST_DATABASE_URL = 'postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'
npm.cmd run test:postgres

# client
npm.cmd run build
node --test tests/feedingStations.test.cjs tests/feedingLogs.test.cjs

# repository root: inspect, start before integration tests, clean after them
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

Both builds pass; backend **109/109**, real PostgreSQL/PostGIS **16/16**, frontend
**30/30** pass. Whitespace checks cover tracked and new files. The initial backend
build exposed an optional-options typing error, fixed before the passing runs.
The first new test run also exposed an incorrect test assumption about Mongoose
retaining undefined company, corrected without changing existing assertions.
Docker inspection initially hit sandbox access restrictions; approved elevated
Docker commands and the frontend build completed successfully.

The integration suite used a newly created tmpfs test container and the unchanged
migration chain on PostgreSQL 18.6 / PostGIS 3.6.4. Its connections closed, and only
this run's test container was removed. The pre-existing development container
remains stopped and `ray-postgres_ray_local_data` remains present.

Stubbed adapter tests do not prove real MongoDB persistence, live-data quality,
or concurrent registration behavior. Schemas, PostgreSQL migrations/guards,
startup, routes, validation, frontend, uploads, dependencies and lockfiles are
unchanged. Existing dependency/security findings remain unresolved. Nothing was
staged, committed or pushed.
