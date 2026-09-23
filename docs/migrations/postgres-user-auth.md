# PostgreSQL UserStore and isolated auth HTTP verification (10D.1)

Baseline: clean `ray-2-postgres` at
`b059a24fc5899596cc64c43ec8e29af5a0730967` (committed 10C.3).
No applicable AGENTS.md was found. Docker 29.8.0 / Compose 5.5.1 and the Linux
engine were available. The [UserStore contract](user-auth-persistence-boundary.md),
[API baseline](postgres-api-compatibility.md), and
[local PostgreSQL safeguards](postgres-local-foundation.md) remain applicable.

**The isolated local authentication HTTP flow is verified with PostgreSQL.
Normal Express startup still uses MongoDB.** No PostgreSQL adapter is imported
by application startup/default composition, and no mixed-database runtime,
real-user migration or public deployment was performed.

## Adapter and composition

`createPostgresUserStore(db)` accepts the existing connection factory's Drizzle
database explicitly and implements the unchanged `UserStore` interface:

- `findByEmail`: parameterized, case-sensitive lookup with a safe profile projection.
- `findCredentialsByEmail`: the only result/projection that includes `passwordHash`.
- `create`: inserts the supplied hash unchanged, generates a lowercase 24-hex public
  ID with Node `randomBytes(12)`, and returns only the safe profile projection.
- `findIdentityByPublicId`: selects only public identity fields, adding legacy-name
  columns only when requested. Valid uppercase public IDs are canonicalized to
  lowercase. Internal UUIDs are never treated as public IDs or returned to callers.

Safe SELECTs do not select hashes; identity queries/results exclude company and
internal IDs/timestamps/presence metadata. No Mongoose imports, import-time
connections, migrations, upsert, or error-to-null conversion exist in the adapter.
Missing rows return null. Missing/null auth IDs return null, while malformed IDs
reject; required middleware preserves `User not found` versus `Invalid or expired
token`, and optional middleware retains guest fallback. The interface expects
string public IDs; no broader ObjectId-castable input API is introduced.

`createAuthHandlers`, `createAuthMiddleware`, `createOptionalAuthMiddleware`, and
`createAuthRouter` accept a store. Existing handler/middleware exports and the
default router remain bound to `mongoUserStore`. URLs, validation, bcrypt cost 10,
JWT public `id`/seven-day expiry, serializer, and middleware claim rules are unchanged.
Only integration tests inject PostgreSQL. No global setter/provider flag was added.

Auth catch blocks now log only fixed `Register error` / `Login error` messages.
This is a logging-only redaction: SQL error objects can contain query parameters,
hashes and other sensitive values. HTTP failures remain `{ msg: "Server error" }`.
Ordinary duplicates retain the pre-insert lookup's 400 response; an insert uniqueness
failure still rejects (SQLSTATE 23505), reaching the existing generic 500 policy
if a concurrent-registration race occurs. No concurrency policy was redesigned.

## Additive migration and presence semantics

New migration `0003_user_compatibility.sql`, its new snapshot, and the appended
journal entry add only three columns to `users`:

| Column | Meaning/default |
| --- | --- |
| `company_present` | NOT NULL boolean, default true for existing SQL compatibility |
| `legacy_name` | Nullable text for the historical display name |
| `legacy_name_present` | NOT NULL boolean, default false |

New adapter creation always writes company presence explicitly: missing or undefined
means false plus SQL NULL; explicit null means true plus SQL NULL; empty/nonempty
strings mean true plus the original value. Profiles omit company only when the
presence flag is false. Legacy name is not a registration field. Test fixtures
encode its absent/null/empty/string states with the corresponding flag. Optional
identity lookup returns `name: undefined` for absence (omitted in JSON), preserves
explicit null/strings, and required identity lookup excludes name altogether.
Direct SQL writers/import fixtures must maintain the flags deliberately.

Upgrade semantics: existing SQL rows receive `company_present = true`, retaining
their current value, including explicit null; legacy name starts absent. An old SQL
NULL cannot establish whether a source MongoDB field was missing or explicitly
null. This policy does not reconstruct that information, and no source inspection
or backfill is claimed. Required first/last names, email and hash constraints remain.
Historical source records violating them still require a future data audit/import plan.

Old SQL migrations/snapshots are unchanged. The new snapshot leaves all other tables
unchanged; no spatial SQL was generated. Existing `geometry(Point,4326)` corrections,
GiST indexes and safety guards remain intact. No migration was applied to the
preserved development database.

## Real database and HTTP tests

`postgresUsers.test.mjs` reuses `openTestDatabase` ownership checks, identity guards,
advisory lock and cleanup. `test:postgres` now uses `--test-concurrency=1` so files
cannot reset/drop each other's tables. Concurrent separate suite invocations still
fail the existing lock guard. Ordinary `npm test` remains Docker-independent.

Upgrade coverage copies the unchanged first three migrations/journal entries to
an owned temporary fixture directory, applies them to the guarded disposable
database, inserts synthetic null/empty/string-company rows, and applies the full
chain. Existing IDs, hashes, values and historical timestamps remain unchanged;
presence defaults and migration replay are verified. The fixture directory is
removed with a checked temporary-path prefix. Separate fresh-schema tests use
the complete chain normally.

Real SQL adapter/HTTP coverage includes all company/name states, uppercase IDs,
missing/malformed IDs, UUID separation, unchanged hashes, case-sensitive emails,
duplicate email/public-ID constraints, required-column constraints, and hostile
strings passed as parameters. Real transactional column renaming proves safe
SELECTs work without the password column and credential queries reject instead
of returning missing users. Test-only DDL is rolled back/restored.

The test app mounts the real production auth router and injected middleware on
protected/optional test endpoints; it copies no auth logic. Tests verify registration,
login, validation before creation, ordinary duplicates, bcrypt/JWT, safe identities,
company JSON semantics, legacy claims/names, missing/invalid/expired/unknown-user
tokens, lookup failures and redacted logging. No pg/Drizzle queries or UserStore
methods are stubbed. Unexpected Mongo connections/queries/saves are intercepted,
dotenv loading is blocked, environment/mocks are restored and HTTP servers close.

## Commands and results (2026-09-23)

```powershell
# root: prerequisites and disposable service only
docker --version
docker compose version
docker info --format '{{.OSType}}'
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'
docker compose -f compose.postgres.yml --profile test up -d --wait test-db
npm.cmd run build --prefix server

# server: offline generation, ordinary tests, then complete integration suite twice
npm.cmd run db:generate -- --name user_compatibility
npm.cmd test
$env:RAY_TEST_DATABASE_URL = 'postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'
npm.cmd run test:postgres
npm.cmd run test:postgres

# client
npm.cmd run build
node --test tests/feedingStations.test.cjs tests/feedingLogs.test.cjs

# root: cleanup and review
docker compose -f compose.postgres.yml --profile test rm -s -f test-db
docker compose -f compose.postgres.yml --profile test ps -a
docker volume inspect ray-postgres_ray_local_data --format '{{.Name}}'
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard |
  ForEach-Object { git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --no-index --check -- NUL $_ }
```

Both builds pass. Ordinary backend tests **176/176**; complete PostgreSQL suite
**39/39 twice** after the final test additions (16 foundation tests plus 23 new
tests, including suite containers); frontend station/log tests **30/30**.
An earlier PostgreSQL run also passed 37/37 before two registration-company tests
were added. Spatial typmod/SRID rejection, index and metre-query regressions all pass.
Tracked/new-file whitespace and unchanged other-table snapshot checks pass.

Offline migration generation first failed inside the sandbox at OS user lookup
(`uv_os_get_passwd`); approved elevated execution succeeded without installing
anything. Docker commands and the frontend build also used approved elevated access.
Connections closed and the owned test container was removed. The pre-existing
development container remains stopped and `ray-postgres_ray_local_data` remains present.

This is synthetic local auth verification, not a real-data migration rehearsal or
a PostgreSQL test of the other API domains. The normal API remains on MongoDB.
Company history ambiguity, required-field source quality, registration races,
production infrastructure and existing [security findings](../security/milestone-10b-audit-triage.md)
remain unresolved. No dependencies/runtime versions, lockfiles, other domain
production code, frontend, uploads or startup configuration changed. No staging,
commit, push, real-user migration or deployment occurred.
