# SEC.1B-1 - Request parsing, validation bounds and legacy upload containment

Date: **2026-10-26**. Branch: **`ray-2-postgres`**. Baseline: **`44839a29e1b1854c76821a5957c8db0c3943c707`** (`docs: add pre-pilot security audit`).

**Implemented locally; ready for code review, not public-pilot clearance.** SEC-001, SEC-004 and the anonymous-upload exposure in SEC-002 are remediated with regression evidence. The parser/error-handler portion of SEC-013 is also addressed. Other audit findings and release gates remain open. Nothing was staged, committed, pushed, merged or deployed.

## Preflight and safety boundary

The initial working tree was clean. The requested branch and committed [SEC.1A audit](pre-pilot-security-audit.md) were verified before edits. S3.1 `a0dccb8733229fbca47c700bdacb67657ce6c9f2`, UX.1 `8d1bb5e5d073f0053a32828d8943d13cc6641a1e` and UX.2 `945ab79523a511bafdfd34f27ad72004a0b935b3` remain ancestors. HEAD and locally recorded `origin/ray-2-postgres` were identical, **0 ahead / 0 behind**. No fetch was performed; current remote freshness is unknown. No applicable `AGENTS.md` was found in the repository or its filesystem ancestors. Git reads used a per-command `safe.directory` override without changing configuration.

Read the audit, implementation and tests alongside the [preview runbook](../migrations/postgres-preview.md), [API compatibility record](../migrations/postgres-api-compatibility.md), [S3 runbook and acceptance ledger](../migrations/s3-media.md), and localization/UX.2 evidence. Historical verification results were not rewritten.

All requests were bounded synthetic loopback requests or read-only npm/advisory metadata retrieval. There were no AWS/Cloudinary API calls, live storage operations, IAM/CORS changes, deployment, schema changes, destructive migrations or persistent-preview resets. PostgreSQL verification used only the guarded disposable test service, with storage doubles. Its preexisting container was stopped initially; only that service was started and then stopped. Preview data and attached S3 objects were not touched. No unrelated processes were stopped.

## Findings and root causes

| Finding | Confirmed cause | Remediation and evidence |
| --- | --- | --- |
| SEC-001 | Both global pre-auth parsers used Express 5.1.0 -> body-parser 2.2.0. A decoder could finish before its HTTP request, retain a pipe without an error listener, then emit a fatal late decompression error. No route or authentication was needed. | Pin the compatible patched parser, share bounded JSON/form configuration, safely classify parser errors. Isolated children exercise the actual legacy and preview apps, require rejection, health recovery and subsequent ordinary requests, then exit 0. |
| SEC-004 | Guest report `media` had no collection maximum. Even the S3 schema's previous `.max()` could visit invalid items and accumulate issues; middleware serialized every issue. Ignored object fields and text also lacked work bounds. | Patch Zod; check collection length before the item schema; bounded iterative shape traversal before authentication and Zod; product field bounds and capped errors. A 1,000-item synthetic collection produces one issue and zero item-schema executions. |
| SEC-002 | Legacy `/api/upload/media` mounted a provider-backed multipart parser without authentication. Importing the router initialized Cloudinary storage; up to five 25-MiB files could cause anonymous paid storage work. | Unconditionally retire the entire legacy upload namespace before body parsers. Tests prove 503 for guests, supplied bearer tokens, multipart and malformed JSON, with no provider imports, persistence or storage operations. |
| SEC-013 (partial) | Parser errors were returned as raw-message 500s; unexpected errors could expose details, with legacy raw stacks logged. | Parser-origin 400/413/415 responses use fixed messages; untyped decompression 400s are normalized at the parser boundary. Unexpected errors return generic 500 and a fixed log message. Other controller-specific error/log paths remain a separate review. |

## Parsing and error handling

`server/app.ts` extracts the existing legacy application composition as `createLegacyApp()` so tests can exercise real middleware ordering without MongoDB startup. `server/server.ts` retains dotenv, MongoDB connection and listener startup. CORS, proxy trust, routes and JWT behavior are preserved. `server/preview/app.ts` keeps its independent PostgreSQL composition and never imports the legacy upload router or provider.

Both modes mount `requestParsers()` from `server/middleware/requestParsing.ts` after their early legacy-upload refusal. JSON and extended URL-encoded forms remain supported, including nested location fields and arrays. Valid gzip, deflate and Brotli requests remain supported on the project's Node 22 runtime. No global fatal-error suppression was added.

| Limit or response | Exact value / behavior | Reason |
| --- | --- | --- |
| JSON/form body | **524,288 decoded bytes (512 KiB)**, including streamed requests without Content-Length | APIs carry text and media references, not image bytes. This supports 10,000-code-point descriptions even with JSON escaping or percent-encoded Unicode, plus reference fields, while replacing the prior 10-MiB allowance. S3 image-byte limits are unchanged. |
| URL-encoded parameters | **32** | Current form shapes need far fewer fields; bounds `qs` work before schema validation. |
| URL-encoded bracket depth | **4** | Supports existing nested location/array forms; deeper structures are unsupported. The shared shape budget also applies. |
| Malformed JSON/compression/length | **400**, fixed `Malformed request body` | No raw body, decompressor error or credential fragment reflected. |
| Excess bytes / form parameters | **413**, fixed message | Reject without increasing limits. |
| Unsupported encoding/charset | **415**, fixed message | Preserve parser rejection semantics without reflecting header contents. |
| Unexpected error | **500** `{error:"ServerError",message:"Internal Server Error"}`; fixed `Request failed` log | No internal error names, messages or stacks in this boundary. Existing safe preview `MediaError` handling remains before the shared fallback. |

The final error middleware remains after routes and retains Express's four-argument signature. Already-sent responses delegate errors to Express. Decompression failures without a body-parser `type` are normalized only inside the parser callback, rather than trusting arbitrary domain errors' HTTP statuses.

## Validation limits and compatibility

Product text limits count **Unicode code points**, using the installed Zod implementation. They do not normalize Hebrew, mixed-language text or passwords. Existing trimming behavior is preserved: person/station names and feeding notes trim; report descriptions and station notes retain their submitted content.

| Field | New maximum | Product rationale |
| --- | --- | --- |
| Given/family name | **100 code points each** | Compound and multilingual names. |
| Company / station name | **200 code points each** | Useful organization names and station labels. |
| Email, registration and login | **254 code points**, plus existing email syntax validation | Bounded address validation. |
| Report description / station notes | **10,000 code points each** | Detailed care instructions and narratives. |
| Feeding note | **4,000 code points** | Detailed individual care updates. |
| Legacy station image / report media reference | **2,048 code points each** | Generous URL/reference allowance; normal S3 content references are much shorter. |
| Legacy report media | **6 references** | Matches the existing report UI's maximum. The retired multipart route's old five-file limit is no longer active. |
| S3 report attachments | Existing **3 unique asset IDs**; legacy `media` remains empty/absent | Early length rejection replaces the previous post-item maximum; ownership/state/transaction checks remain unchanged. |
| S3 intent checksum | Exactly **44 characters**, canonical base64 SHA-256 | Existing accepted checksum contract, now bounded before decoding. |

The iterative shared shape guard accepts an object body and rejects excessive structures before authentication/database lookup and Zod processing, including fields a schema would strip. It allows bodyless reads/actions; endpoint schemas still reject missing required bodies. Exact ceilings: **32 own fields per object; 128 UTF-16 units per field name; 128 total visited values including containers/root; container depth 4 with root depth 0; 6 elements per array; 32,768 UTF-16 units per string**. Primitives may occur directly below the deepest permitted container. Current API shapes use shallow objects and a single location object, so these ceilings leave substantial headroom. This is one submitted domain object per write, not a new bulk-record API.

The wider transport string ceiling accommodates the product's maximum astral-character descriptions and bounds ignored fields and password-processing work. Passwords retain the **8-code-point registration minimum**, permissive existing-account login minimum and exact raw hashing/comparison; this is **not** the SEC-006 bcrypt-byte-policy fix. Existing 256-character and multilingual password regression cases remain accepted. Values already stored and list/detail responses are unchanged.

`validateBody(schema)` remains safe when router factories are mounted independently. A WeakMap avoids rewalking an unchanged body already checked by global middleware. `boundedArray()` uses a pre-item check/pipe, including S3's zero legacy URLs and three IDs, so excessive collections never reach item parsing. Media issuance's direct schema path is covered by the global shape guard.

Validation still returns HTTP 400 with `{message:"Validation failed",errors:[{field,message}]}`. It emits at most **8 issues**; each path uses at most **5 segments of 128 UTF-16 units each**, and each message at most **200 UTF-16 units**. Strict-schema unknown-field names are replaced with `Unrecognized fields`. Shape failures emit one fixed issue; unknown top-level keys map to `body`. These changes bound output without echoing arbitrary submitted field names. The Hebrew typed resources map the new text/collection/structure/size/encoding errors and upload-retirement response to safe user feedback. API keys and successful payload structures are unchanged.

## Dependency changes

Official advisory and npm metadata were checked on 2026-10-26: [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828), [upstream parser fix](https://github.com/expressjs/body-parser/commit/1260c38), [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [body-parser metadata](https://registry.npmjs.org/body-parser/2.4.0), [Zod metadata](https://registry.npmjs.org/zod/4.6.6). Both selected versions are the first patched compatible releases. Express 5.1.0's declared `body-parser:^2.2.0` accepts 2.4.0; a scoped manifest override enforces that exact security floor without an unrelated Express upgrade. Zod is pinned to 4.6.6 rather than selecting the newer available 4.6.7.

| Dependency path under `server/node_modules/` | Before -> after |
| --- | --- |
| `express -> body-parser` (hoisted) | **2.2.0 -> 2.4.0** |
| Direct `zod` | **4.6.5 -> 4.6.6** |
| `body-parser -> raw-body` | 3.0.0 -> 3.0.2 |
| `body-parser` / shared `qs` | 6.14.0 -> 6.16.1 |
| Parser `debug` | 4.4.1 -> 4.4.3 |
| Parser `http-errors` | 2.0.0 -> 2.0.1 |
| Parser `iconv-lite` | 0.6.3 -> 0.7.3 |
| Parser `type-is` | 2.0.1 -> 2.1.0 |
| `qs -> side-channel` | 1.1.0 -> 1.1.1 |
| `side-channel -> side-channel-list` | 1.0.0 -> 1.0.1 |
| `body-parser/node_modules/content-type`, `type-is/node_modules/content-type` | Added 2.1.0; root content-type 1.0.5 unchanged |
| `http-errors/node_modules/statuses` | Removed 2.0.1 duplicate; uses existing root 2.0.2 |

These transitive changes satisfy the patched parser's raised dependency minima. Two incidental npm patch refreshes (`es-object-atoms`, `hasown`) were restored to baseline in the lockfile and installed tree; no unrelated upgrade remains. The server lockfile was updated. No client dependency changed and no blanket audit-fix command was run.

Installed/locked versions were verified with `npm.cmd ls express body-parser raw-body qs zod --all --prefix server` and lockfile comparison. Node is **22.22.0**, npm **9.6.5**. Parser dependencies retain compatible engines. Expected behavior changes are the documented bounds, fixed parser error statuses/messages and late-decoder cleanup; valid compressed JSON/forms are covered by regressions.

Fresh baseline server audit: **15 affected packages (5 moderate, 9 high, 1 critical)**. After: **12 (4 moderate, 7 high, 1 critical)**, removing package findings for body-parser, qs and Zod with no new server finding. Client remains **21 (2 low, 4 moderate, 14 high, 1 critical)**. Both audit commands actually returned exit 0 in this environment despite findings; the JSON, not exit status alone, establishes those counts. This is not resolution of the entire SEC.1A dependency audit. Restored incidental packages had no finding in either comparison.

## Legacy retirement decision

The intended platform remains PostgreSQL/private S3. There are no historical field users requiring Cloudinary media migration. Every request reaching the retired `/api/upload` namespace middleware, including descendants, returns **503** `{message:"Legacy media uploads are retired"}` with `Cache-Control:no-store`, before body parsing, authentication, multipart handling or provider access. There is no environment bypass or anonymous compatibility fallback. Existing CORS origin/preflight handling remains earlier in the stack; it can reject an origin or answer OPTIONS before this middleware.

The retired router imports only Express. The legacy app's complete local import graph has no Cloudinary, Multer, upload-middleware or dotenv import; startup still loads dotenv separately. PostgreSQL's refusal and messages remain unchanged in both disabled and S3-enabled compositions. S3 issuance still requires authentication and uses the existing owner/state/transaction protections. No public S3 route was introduced.

Intentional compatibility change: normal legacy frontend image submissions now receive the localized unavailable-service error. Legacy authentication, reports, station/log routes and no-image workflows remain available; stored media references are not rewritten. Follow-up cleanup may remove retained Cloudinary 1.41.3, multer-storage-cloudinary 4.0.0, Multer 1.4.5-lts.2, Cloudinary-core 2.14.0, Lodash 4.17.21 and Multer types, plus unused provider configuration/upload middleware/type declarations and legacy client upload callers. Removing the entire Mongo architecture or changing stored media is outside this milestone.

## Executed verification

Commands below are from repository root unless a working directory is specified. Tests use only synthetic fixtures and storage doubles. No `test:s3:live` command was run.

| Exact command | Result |
| --- | --- |
| `npm.cmd run build --prefix server` | PASS, exit 0. |
| `npm.cmd test --prefix server` | PASS **207/207**, zero failures/skips, including rebuild and the new parser/upload/validation regressions. |
| `node --test tests/legacyUpload.test.mjs` (cwd `server`) | PASS **3/3**. |
| `node --test server/tests/validationBounds.test.mjs` | PASS **7/7**. |
| `docker compose -f compose.postgres.yml --profile test up -d --wait test-db` | PASS; verified stopped disposable service started healthy. |
| `npm.cmd run test:postgres --prefix server` | PASS **122/122**, zero failures/skips, including a final-state rerun after parser/dependency narrowing. |
| `docker compose -f compose.postgres.yml --profile test stop test-db` | PASS; only task-started test service stopped; no volume removal. |
| `npm.cmd run build --prefix client` | PASS, exit 0. Existing >500-kB bundle warning remains. |
| `npm.cmd run build:postgres --prefix client` | PASS, exit 0. Same bundle warning. |
| `node --test client/tests/*.test.cjs` | PASS **77/77**, zero failures/skips. |
| `node --test client/tests/localization.test.cjs client/tests/passwordValidation.test.cjs` | PASS **13/13**. Existing password assertions retained; source-loader resolution updated for the shared NodeNext helper import. |
| `& .\node_modules\.bin\eslint.cmd src/i18n/errors.ts src/i18n/locales/he.ts` (cwd `client`) | PASS, exit 0. Backend has no ESLint configuration; TypeScript build and new JS syntax checks cover changed backend files. |
| `npm.cmd audit --json --prefix server`; `npm.cmd audit --json --prefix client` | Completed; counts above, actual exit 0 with remaining findings. |
| `git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check` | PASS, exit 0. Git's informational LF/CRLF conversion warnings do not report whitespace defects. |
| New-file whitespace scan (`git ls-files --others --exclude-standard`, Node UTF-8 scan) | PASS: **8 new files**, no trailing spaces/tabs, every file ends in LF. |
| `node --check <file>` for each changed `.mjs`/`.cjs` | PASS: **6 files**, including the isolated child fixture and modified frontend tests. |

The parser regression's children bind only ephemeral numeric loopback ports. They exercise both actual compositions, both content types and the confirmed bounded late-decoder condition; require 401 rejection before persistence, subsequent health 200 and ordinary request rejection; then malformed compression 400 and another healthy response. There are no uncaught-exception handlers hiding crashes. Parent assertions require successful child exit, bounded runtime and clean error output. Other tests cover valid JSON/extended forms/gzip/deflate/Brotli, decoded-byte boundaries, oversized chunked input, form parameter/depth boundaries, malformed encoding and generic unexpected-error redaction.

Validation tests cover each field boundary with Hebrew and astral characters; exact shape budgets; early collection failure; bounded issue output; strict-field redaction; checksum bounds; ordinary station/log/report/auth/media schemas; and guest HTTP rejection followed by successful report creation. Existing full contract and PostgreSQL tests retain real authentication, account isolation, transactions, attachment ownership, concurrency and S3 storage-double behavior.

The first concurrent full backend attempt had one unchanged preview-child startup timeout (206/207); a standalone repeat passed 207/207 without changing or weakening that test. The first frontend test attempt exposed the source-loader's unresolved new `.js` helper import; fixing its TypeScript resolution preserved all assertions and the full suite then passed 77/77. A local form-boundary fixture size was corrected before the passing full run. Initial sandbox frontend builds hit Windows esbuild ancestor-directory access denial; authorized retries passed. PowerShell requires `npm.cmd`, not the blocked `npm.ps1`; no execution policy was changed.

Temporary evidence logs: `%TEMP%/ray-sec1b1-server-tests.log`, `ray-sec1b1-client-{build,postgres-build,tests}.log`, `ray-sec1b1-postgres-tests.log`, `ray-sec1b1-postgres-tests-final.log`, and `ray-sec1b1-{server,client}-audit-after.json`. They are supporting local artifacts, not committed evidence or secrets. Test PostgreSQL used only the documented `ray_test` fixture at loopback 55433; ambient AWS variables were removed, AWS config/credentials paths were nonexistent task paths, metadata was disabled and media mode was disabled.

## Remaining risks and review scope

The public pilot remains blocked by the audit's abuse budgets/pagination/enrollment decisions (SEC-003), legacy Mongo claim race if that architecture remains exposed (SEC-005), bcrypt byte semantics and account transition (SEC-006), aggregate/distributed media budgets (SEC-007), public identity/location/routine/image privacy decisions (SEC-008/009), retention/takedown (SEC-010), sessions/revocation (SEC-011), external media policy (SEC-012), remaining controller-specific error/log review (SEC-013), enumeration disposition (SEC-014), other dependency findings (SEC-015), production composition/configuration and retained S3 acceptance gaps (SEC-016/017), and coordinate validation (SEC-018). Request bounds do not substitute for distributed abuse controls or bounded list results. No privacy visibility, role, password hashing, cloud policy or database contract was changed here.

Affected files: `server/app.ts`, `server/server.ts`, `server/preview/app.ts`, `server/middleware/{requestParsing,validateBody}.ts`, `server/validation/{inputBounds,authSchemas,feedingStationSchemas,feedingLogSchemas,reportSchemas}.ts`, `server/media/validation.ts`, `server/routes/uploadRoutes.ts`, server manifest/lockfile, `server/tests/{requestParsing,validationBounds,legacyUpload}.test.mjs`, `server/tests/helpers/parserSurvival.mjs`, `client/src/i18n/{errors.ts,locales/he.ts}`, `client/tests/{localization,passwordValidation}.test.cjs`, the audit follow-up note, and this document.

Final read-only recheck: HEAD remains the baseline, locally recorded tracking remains 0 ahead / 0 behind, and the index is empty. The review working set is **24 files: 16 modified and 8 new**.

## Reviewed staging commands - not executed

From repository root, only after review:

```powershell
git add -- server/app.ts server/server.ts server/preview/app.ts server/middleware/requestParsing.ts server/middleware/validateBody.ts server/validation/inputBounds.ts server/validation/authSchemas.ts server/validation/feedingStationSchemas.ts server/validation/feedingLogSchemas.ts server/validation/reportSchemas.ts server/media/validation.ts server/routes/uploadRoutes.ts server/package.json server/package-lock.json server/tests/requestParsing.test.mjs server/tests/validationBounds.test.mjs server/tests/legacyUpload.test.mjs server/tests/helpers/parserSurvival.mjs
git add -- client/src/i18n/errors.ts client/src/i18n/locales/he.ts client/tests/localization.test.cjs client/tests/passwordValidation.test.cjs
git add -- docs/security/pre-pilot-security-audit.md docs/security/sec-1b-1-remediation.md
```

Suggested commit message: **`fix: harden request parsing and contain legacy uploads`**. No Git write was performed; wait for review before staging, committing, pushing or merging.
