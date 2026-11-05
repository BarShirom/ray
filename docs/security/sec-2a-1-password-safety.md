# SEC.2A.1 — Password safety and UTF-8 registration limits

Evidence date: **2026-11-05, Asia/Jerusalem**. Intended gate: **A, local
development**. Verified branch `ray-2-postgres`, HEAD
`767015dd8cc15882dcd13aff57d182fa9b76ee36`; clean preflight tree/index and local
upstream **0 ahead / 0 behind**, without fetch. The reviewed SEC.1B-3C checkpoints,
including [3C.4](sec-1b-3c-4-browser-acceptance.md), are committed at this baseline.
This password change remains uncommitted. No Git write or deployment is authorized.

Read [AGENTS](../../AGENTS.md), the [Release Quality Gate](../RELEASE_QUALITY_GATE.md),
[readiness](../RELEASE_READINESS.md), [SEC.1A / SEC-006](pre-pilot-security-audit.md#sec-006--bcrypt-silently-truncates-long-unicode-passwords),
[SEC.1B-1](sec-1b-1-remediation.md), the session/remediation evidence and relevant
authentication, user-store, registration, i18n and test implementation. No nested
AGENTS applies. Historical security reports are preserved.

## Installed behavior and original risk

Installed versions are **Node v22.22.0, bcryptjs 3.0.2 and Zod 4.6.6**. Both
registration validators already enforced the same minimum of eight Unicode code
points. The baseline gap was the absence of a bcrypt-specific byte maximum on
both client and server, not a current minimum-length mismatch.

Actual installed-library probes establish that bcryptjs uses the first **72 encoded
bytes** without rejecting a longer string. Different suffixes after that prefix
verify against the same hash; byte 72 can split a multibyte character. Installed
Zod `.min(8)` counts Unicode code points: seven astral characters fail despite
occupying fourteen JavaScript UTF-16 units, while eight pass. Combining marks count
separately; a code point is not necessarily a visible grapheme.

This matches the [versioned bcryptjs documentation](https://github.com/dcodeIO/bcrypt.js/tree/v3.0.2)
and [encoder source](https://github.com/dcodeIO/bcrypt.js/blob/v3.0.2/index.js#L344-L391),
the [official Zod code-point change](https://zod.dev/blog/zod-4-5#string-length-counts-code-points)
and [TextEncoder specification](https://encoding.spec.whatwg.org/#interface-textencoder),
checked on the evidence date against the installed implementation. This is not a
claim that these are the newest package versions or that a fresh advisory audit
is clean. Manifests, lockfiles and dependencies remain unchanged.

Malformed UTF-16 requires special handling. bcryptjs encodes an unpaired surrogate
into its own three-byte sequence; standard UTF-8 encoders substitute U+FFFD, also
three bytes. Byte counts agree, but the bytes and resulting hashes differ.
Registration rejects such strings rather than repairing or normalizing them.
Existing login continues comparing the original raw string.

## Exact new-registration contract

- Password must be a string containing **at least eight Unicode code points**.
- It must be well-formed Unicode: no unpaired UTF-16 surrogate code units.
- The actual UTF-8 encoding must contain **at most 72 bytes**, inclusive.
- No trimming, normalization, encoding round-trip, truncation or composition rule
  is applied. Whitespace, combining marks, Hebrew, emoji and mixed languages remain
  valid within these bounds.
- The server is authoritative. Its registration schema uses a small shared
  registration-only helper and `Buffer.byteLength(value, "utf8")`; the browser
  validator uses `TextEncoder` after the same malformed-string check.
- Existing bounded validation envelopes contain fixed password-field messages,
  never the password. Typed Hebrew guidance explains the minimum and UTF-8 byte
  ceiling; multibyte characters consume more than one byte. Field errors remain
  linked to the input and preserve the submitted draft.

Open registration is retained; this change adds no invitation, email verification,
password-strength service or external password API.

## Existing-account compatibility and unresolved decision

**Login is intentionally unchanged:** nonempty string validation, existing generic
invalid-credential response and raw `bcrypt.compare`. No registration-only minimum,
byte maximum or malformed-Unicode rejection is added to login. Existing shorter,
overlong and malformed synthetic/legacy passwords can therefore retain their
previous verification behavior. Bcrypt hashes and work factor **10**, JWT shape and
seven-day lifetime, identity serialization, both user-store adapters, rate limits,
error sanitization and client session/cross-tab/logout guards remain unchanged.

**Residual prefix equivalence remains.** A historical overlong password can still
authenticate through another input with the same effective first 72 bytes. An
appended suffix also authenticates against a **new exact-72-byte hash**, because
login remains permissive. The registration correction prevents choosing a new
password with an ignored suffix; it does not eliminate all login equivalence or
make historical hashes safe. Knowing the effective prefix remains necessary;
this is not evidence of passwordless account access.

Strict login rejection needs an explicit product/security compatibility and
recovery decision. At a multibyte split, a valid shorter Unicode prefix may not
represent the historical effective bytes. A hash does not reveal the original
input length or reconstruct unknown plaintext. No hash rewrite, prehash, algorithm
switch, silent account invalidation or invented plaintext migration is performed.
Password reset/recovery and any future versioned KDF transition require their own
reviewed design; no reset capability is claimed here. Persistent preview accounts
and credentials were not queried or changed to obtain migration evidence.

## Validation evidence

All cases below use synthetic values and installed libraries. Local HTTP tests
exercise production routing, validation and hashing with an in-memory UserStore;
legacy contracts exercise the real Mongo adapter with Mongoose operations doubled.
Frontend tests execute the real client/server validators, Redux thunks, captured
registration callbacks and SSR. They do not establish native browser scheduling,
rendering, focus movement or reader announcements. No password values, hashes or
JWTs are logged by the new regression cases.

| ID | Required behavior | Actual evidence / tier | Result |
| --- | --- | --- | --- |
| P-01 | Seven code points fail; eight pass independently of UTF-16 units. | Installed Zod, server helper and client agree for ASCII, Hebrew, astral and combining inputs; seven astrals are fourteen UTF-16 units and still fail. | PASS, local libraries |
| P-02 | Exactly 72 UTF-8 bytes pass; 73 fail without truncation. | ASCII, two-/three-/four-byte and mixed boundaries agree across Buffer, TextEncoder, actual bcrypt.truncates and both validators. | PASS, local libraries |
| P-03 | Reject empty/non-string/malformed registration values. | Server rejects missing/null/non-string/empty; client/server reject unpaired high/low surrogates and preserve valid pairs and genuine U+FFFD. | PASS, schemas/callback fixtures |
| P-04 | Preserve raw Unicode/whitespace and avoid composition rules. | Combining forms, spaces and embedded NUL remain unchanged; actual hashes distinguish changed in-boundary bytes, trimmed and normalized inputs. | PASS, actual bcrypt/HTTP |
| P-05 | Existing hashes and login contracts stay compatible. | Short/overlong/malformed synthetic hashes verify without rehash; generic wrong-credential response, cost 10 for new hashes, token/user allowlist and seven-day JWT remain. | PASS, actual HTTP/bcrypt; no real MongoDB |
| P-06 | Document actual prefix equivalence rather than imply complete remediation. | Different suffixes and multibyte splits verify; new exact-72-byte hashes accept appended login suffixes. | PASS confirming residual risk, actual bcrypt/HTTP |
| P-07 | Invalid registration never reaches lookup/hash/write and never echoes credentials. | Instrumented real router observes zero lookup/hash/create calls for rejection; fixed password-field errors and sanitized persistence logs exclude synthetic markers. | PASS, local HTTP/store double |
| P-08 | Hebrew local/remote errors preserve draft and accessible field semantics. | Production callbacks reject invalid input before HTTP, retain all fields, request password focus, expose linked ARIA/alert props and safely label known server errors; recoverable remote rejection retains draft. | PASS, captured hooks/SSR/Axios doubles |
| P-09 | PostgreSQL preserves valid registration, rejection and historical accounts. | Actual PostgreSQL adapter/router accepts raw 72-byte Unicode with cost 10/login, rejects 73 bytes without inserting a user, and verifies historical overlong hashes without rewriting them. Full suite 174/174; no persistent preview operation. | PASS, disposable PostgreSQL |
| P-10 | Changed password guidance works in native keyboard/reader/mobile journeys. | No native browser/reader/measured-width run in this milestone. Historical Work evidence is not extended to this new feedback. | NOT_TESTED |

Exact commands from repository root, except where cwd is stated:

| Command | Actual result on the evidence date |
| --- | --- |
| `npm.cmd ls bcryptjs zod --all --prefix server`; `node --version` | PASS: bcryptjs 3.0.2, Zod 4.6.6, Node v22.22.0. No install/version change. |
| `npm.cmd run build --prefix server` | PASS; also repeated by existing full backend/PG scripts. |
| `node --test server/tests/passwordPolicy.test.mjs server/tests/auth.contract.test.mjs server/tests/authBoundary.contract.test.mjs server/tests/validationBounds.test.mjs` | PASS **43/43**, no failures/skips. |
| `npm.cmd test --prefix server` | PASS **260/260**, no failures/cancellations/skips. Includes current abuse, parser, privacy, media and legacy regressions; no live provider. |
| `npm.cmd run test:postgres --prefix server` | PASS **174/174**, no failures/cancellations/skips; guarded tmpfs target only, PostgreSQL 18.6 / PostGIS 3.6.4. Storage/signing use doubles; no live provider. |
| `node --test tests/passwordValidation.test.cjs tests/localization.test.cjs tests/shell.test.cjs` (cwd `client`) | PASS **27/27**, local fixtures. |
| `node --test tests/authSessions.test.cjs tests/rateLimits.test.cjs` (cwd `client`) | PASS **56/56**, local fixtures. |
| `node --test client/tests/*.test.cjs` | PASS **233/233**, no failures/cancellations/skips. Development middleware timing warnings appeared under parallel checks; no guard was disabled. |
| `npm.cmd run build --prefix client` | PASS, 266 modules; main JS **613.80 kB / 193.23 kB gzip**. |
| `npm.cmd run build:postgres --prefix client` | PASS, 266 modules; main JS **614.99 kB / 193.32 kB gzip**. Both builds retain the >500-kB warning; approximately 0.88-kB main-JS increase from this baseline. |
| `& client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit --incremental false` | PASS. |
| `& client/node_modules/.bin/tsc.cmd -p client/tsconfig.node.json --noEmit --incremental false` | PASS. |
| `& .\node_modules\.bin\eslint.cmd src/features/auth/validateRegistrationPassword.ts src/i18n/errors.ts src/i18n/locales/he.ts src/i18n/locales/shell.ts` (cwd `client`) | PASS, targeted configured source lint. |
| `node --check client/tests/passwordValidation.test.cjs`; `node --check server/tests/passwordPolicy.test.mjs`; `node --check server/tests/validationBounds.test.mjs`; `node --check server/tests/integration/postgresUsers.test.mjs` | PASS, all four. |

Changed CJS test also passes installed ESLint recommended/CommonJS lint with
Node/browser globals: one file, zero errors/warnings. Backend has no ESLint
configuration; its TypeScript build and changed-JS syntax checks apply. No claim
of repository-wide lint cleanliness or fresh advisory audit is made.

Reproducible CJS lint command, cwd repository root:

```powershell
@'
const { ESLint } = require('./client/node_modules/eslint');
const js = require('./client/node_modules/@eslint/js');
const globals = require('./client/node_modules/globals');
(async () => {
  const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [{files:['**/*.cjs'],languageOptions:{ecmaVersion:2022,sourceType:'commonjs',globals:{...globals.node,...globals.browser}},rules:js.configs.recommended.rules}] });
  const r = await lint.lintFiles(['client/tests/passwordValidation.test.cjs']);
  const errors=r.reduce((n,x)=>n+x.errorCount,0), warnings=r.reduce((n,x)=>n+x.warningCount,0);
  console.log(JSON.stringify({files:r.length,errors,warnings})); process.exitCode=errors||warnings?1:0;
})().catch(()=>{process.exitCode=1;});
'@ | node
```

All integrated executions used process-local offline isolation: ambient AWS/media/
Cloudinary/database/proxy settings removed, media and metadata disabled, AWS config/
credential files set to verified nonexistent task-specific paths. Only disposable
PG execution receives the dedicated test URL. Docker/build permissions were used
for ordinary local execution, not provider access or a browser-security bypass.

The stopped test-db was inspected before starting: Ray Compose service, tmpfs
`/var/lib/postgresql`, numeric loopback **55433**, dedicated **ray_test** identity.
The existing suite verifies URL/database identity, acquires its advisory lock and
refuses pre-existing Ray objects before creating/cleaning only suite-owned objects.
Development was stopped and preview was already running; neither is a test target.
No migration file, application schema or persistent credential/record is changed.
`docker compose -f compose.postgres.yml --profile test up -d --wait --pull never test-db`
started only that inspected service. After the suite,
`docker compose -f compose.postgres.yml --profile test stop test-db` stopped it.
Final container metadata shows development/test stopped and the pre-existing
preview still running/healthy. No volume reset/removal, persistent database query,
AWS, S3, Cloudinary or other paid-provider operation occurred.

## Changed files and handoff

Production changes are limited to the server registration helper/schema and the
client registration validator/typed Hebrew messages. Register's existing form,
login, controllers, adapters, session-generation code, rate controls, JWT and
hashing implementation remain unchanged.

- `server/validation/passwordPolicy.ts` (new), `server/validation/authSchemas.ts`
- `server/tests/passwordPolicy.test.mjs` (new), `server/tests/validationBounds.test.mjs`,
  `server/tests/integration/postgresUsers.test.mjs`
- `client/src/features/auth/validateRegistrationPassword.ts`, `client/src/i18n/errors.ts`,
  `client/src/i18n/locales/he.ts`, `client/src/i18n/locales/shell.ts`,
  `client/tests/passwordValidation.test.cjs`
- `docs/RELEASE_READINESS.md`, this report (new)

Final inventory is **12 paths: nine modified and three new**, with an empty index
and unchanged branch/HEAD/local upstream 0/0. Both changed documents pass **55
relative-link/anchor checks**, five table-column checks and two balanced fenced
blocks. All 12 changed/new files pass strict UTF-8, final-newline, trailing-space
and replacement-character checks. The pre-existing BOM in the client password
test is preserved; no new BOM is introduced. Credential/private-key/JWT/database-
URL/signed-capability pattern screening finds no candidates. `git diff --check`
passes; new-file content is checked separately because Git omits it from that
command. No unrelated file is modified.

Reviewed single-line staging commands, **shown only**:

```powershell
git add -- server/validation/authSchemas.ts server/validation/passwordPolicy.ts server/tests/passwordPolicy.test.mjs server/tests/validationBounds.test.mjs server/tests/integration/postgresUsers.test.mjs
git add -- client/src/features/auth/validateRegistrationPassword.ts client/src/i18n/errors.ts client/src/i18n/locales/he.ts client/src/i18n/locales/shell.ts client/tests/passwordValidation.test.cjs
git add -- docs/RELEASE_READINESS.md docs/security/sec-2a-1-password-safety.md
```

Suggested commit message: `fix: enforce safe bcrypt password byte limits`.
Nothing is staged, committed, pushed, merged or deployed.

The separate independent read-only reviewer reran
`node --test server/tests/passwordPolicy.test.mjs` (**8/8**) and
`node --test client/tests/passwordValidation.test.cjs` (**13/13**) under offline
isolation, with no failures/skips. Its additional deterministic mixed-Unicode
probe compared both production validators to native well-formed/code-point/UTF-8
criteria across 10,000 bounded strings with no discrepancy. These are local
checks, not PostgreSQL/native-browser evidence. Its final disposition is
**APPROVE for scoped Level A SEC.2A.1**, with no required corrections or new
review findings. It inspected all 12 paths, completed documentation and the three
shown-only staging commands; it did not independently rerun the full suites,
builds or PostgreSQL tests. No Git authorization, native acceptance, strict-login
policy approval or real-user release approval is inferred.

## Release Quality Gate and remaining work

This scoped change addresses new-password input semantics under QG-01/04/10/12,
with Hebrew field guidance and local semantic tests under QG-02/06. Native browser,
screen-reader, keyboard-focus and measured 320/390px acceptance of the changed
password feedback require separate evidence; prior Work successes cover their
recorded paths, not this new feedback. No new native pass is inferred.

Ray is **not ready for a real-user pilot**. Compatible password recovery/strict
login policy, server JWT revocation/session/secret policy, open-enrollment abuse,
privacy/retention/access/deletion, dependencies, remaining browser/S3 acceptance,
production recovery and monitoring remain separate open release gates. No invitation-only
enrollment policy, production session design or real-user launch approval is added.
