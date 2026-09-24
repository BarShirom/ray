# S3.1: private images in the local PostgreSQL preview

Status: **ready for a development checkpoint with verified browser functional flows; full security acceptance and public-deployment readiness are NOT complete.** Restricted SDK activation, station/report uploads, decoded display, refresh and API-restart persistence passed. Direct browser wire-header/preflight inspection and named security cases below remain pending. The S3-enabled API was stopped. The 2026-09-24 closeout below supersedes earlier checkpoint blockers; historical setup commands are not instructions to run more operations in this closeout. HEAD remains `f91d393ce4618cb2e6dc13d4d022b46ed048de13` on `ray-2-postgres` (completed 10E); the expected S3.1 working tree remains uncommitted. Normal application startup still uses MongoDB. The preview remains loopback-only, on API `127.0.0.1:4001` and frontend `127.0.0.1:5175`.

Ray uses fresh stores. Only synthetic local fixtures are involved; no MongoDB import, historical session migration or Cloudinary transfer. Applied migrations `0000`-`0005` and prior snapshots are unchanged. Migration `0006_media_assets.sql` is additive; during implementation it was applied only to the disposable test database. During the authorized activation run below it was also applied to the guarded persistent preview database. No database or volume was reset.

## Development checkpoint closeout: 2026-09-24

This closeout reviews existing evidence and prepares staging commands only. No cloud requests, browser uploads, cleanup, database writes, schema changes, process restarts, source edits or dependency upgrades were performed. Existing successful tests were not rerun. The implementation, preview records and four attached station/report source/output objects are preserved. Nothing was staged, committed, pushed, merged or deployed.

The exact application provider, `restrictedCredentials(mediaConfig())()`, previously resolved `ray-s3-dev` through explicit `fromIni`; STS using that same credential object verified `arn:aws:sts::438298964276:assumed-role/RayMediaDevRole/ray-local`. This is retained SDK evidence, not a new identity check or merely CLI evidence. Real production forms uploaded the 285-byte station JPEG and 203-byte report PNG, completed normalization to two 80-byte WebPs, attached them and displayed decoded 64x48 images. Refresh and an API restart preserved both records and images. After actual UI logout, both attached images displayed and the guest upload input was disabled. Separate local API attempts to reuse each attached asset returned 409; these were sequential API tests, not browser negative tests or a live concurrent race.

Evidence reviewed: ignored `server/dist/s3-activation/{ledger.json,assets.json,records.json,records-before-restart.json,security-results.json,duplicate-results.json,read-expiry-results.json,probe-cleanup-result.json,cumulative-budget.json,all-run-keys.json}`, the original probe manifest, retained validation logs and the browser observations recorded below. These local artifacts are excluded from the staging plan. The matrix describes existing evidence; a pass in one tier does not certify another. `—` means no retained verification at that tier. API-only results are explicitly labeled and are not counted as live S3 tests.

| Acceptance case | Offline/unit verified | Real PostgreSQL + mocked S3 verified | Live S3 verified | Real browser verified | Pending/manual or not tested |
| --- | --- | --- | --- | --- | --- |
| Restricted SDK identity; broad-role rejection | Config/identity rejection tests | — | Exact application provider + STS passed before S3 | Browser used that API; no independent identity test | Production compute identity is separate |
| Station JPEG/report PNG upload, completion, normalization and attachment | Decoder + upload helper | Ready transition and claims | Both sources HEAD/GET and normalized PUTs | Both production forms and decoded output display | No missing functional happy-path check |
| Refresh/restart persistence and stable content references | — | Persisted relationships with new service | Retained objects/read success | Both images after refresh and actual API restart; API snapshots identical | Full persistent client-state audit not captured |
| Expired signed read rejected; fresh read works | — | Fresh mocked redirects | Node HTTP: expired 403, fresh redirect 302 and S3 200 | Later display passed separately | Controlled browser expiry-error/retry remains pending |
| Signed length/MIME/checksum headers; conditional replay | Actual offline SDK signatures | Storage verification doubles | Node: valid 200, changed length/MIME/checksum header 403; replay 412 | Successful raw File upload compatibility | Browser SignedHeaders, wire length, PUT status and preflight capture pending |
| Same-length payload checksum mismatch | Download checksum mismatch | Failed completion cannot attach | — | — | Actual S3 `BadDigest` case, distinct from changed signed header |
| Corrupt/unsupported/animated/oversized image rejection | Corrupt, MIME, pixel/byte caps and animation tests | Missing/expired/checksum/corrupt completion failures | — | — | Live corrupt-image 422, failed state and no attachable/displayed ready output |
| Pending/ready-unattached privacy; cross-user denial | — | Pending B-complete and ready B-attach denied; unattached reads 404 | — | — | Live preview API already passed pending guest 404 and B complete/attach 403; ready-unattached 404 and ready B complete/attach 403 pending |
| Attached parent visibility | — | Attached and inactive-station reads | Signed attached reads; unsigned output 403 | Guest station and report images decoded after logout | Broader parent visibility, including inactive station, not live-certified |
| Duplicate attachment, ordering and atomic claims | Report count helper checks | Ordered 3 images, duplicate/concurrent claims, rollback and SQL constraints | — | Happy-path attachment only | Real API sequential station/report reuse 409 passed; live concurrent race/order/rollback not tested |
| Guest/no-image and disabled-mode behavior | Fail-closed capabilities and sign-in helper | Guest issuance 401, no-image report 201, disabled 503 | — | Guest image input disabled | Current S3.1 browser guest no-image submit and disabled-mode creation not captured |
| Invalid size/type/count before upload | Intent validation + client helpers | Validation and attachment limits | — | — | Live API sizes 0 and 8,388,609 returned 400; browser invalid-file/count prevention not captured |
| Interrupted uploads and explicit retry without loops | Helper retry/412 verification and partial-progress tests | Idempotent ready completion, retryable storage/SQL failure | Identical output retry 412 then matching HEAD 200 | No forced interruption or explicit retry | Browser text preservation, explicit image retry once/no loop; live ready completion idempotency pending |
| Quotas, leases, concurrency and processing bounds | Download bounds and decoder limits | Rate/quota/lease/concurrency tests | — | — | Live adverse-load cases not tested; production distributed limits not implemented |
| Cleanup, expiry guards and attached exclusion | — | Exact orphan deletion, attached exclusion, partial retry | Original probe's three exact DELETEs 204 | — | Application orphan apply not live-tested; no cleanup authorized now |
| Prefix isolation and sensitive-data handling | Prefix signing rejection; explicit client request options | Stable API refs | Unsigned read denied; sanitized Node logs | Stable DOM image refs | Effective out-of-prefix permission simulation and browser wire token/cookie inspection pending; no comprehensive client-storage/log audit |

### Content-Length evidence and remaining manual inspection

The retained actual SignedHeaders list is from the **Node probe**, not either browser upload: `content-length;content-type;host;if-none-match;x-amz-checksum-sha256;x-amz-expected-bucket-owner;x-amz-server-side-encryption`. Neither browser upload's actual SignedHeaders list was retained. No missing browser capture has been reconstructed or represented as captured evidence.

Current `server/media/s3.ts` sets `PutObjectCommand.ContentLength` from the intent, explicitly includes `content-length` in `signableHeaders`, and checks the generated URL's SignedHeaders before returning permission. Current `client/src/api/media.ts` uploads the raw File with `credentials:'omit'` and no manual Content-Length or Ray bearer header. Those are directly inspected code facts. Accepted browser uploads through this unchanged code support the inference that browser-generated lengths were compatible with the signatures. They do not supply the missing actual wire values, OPTIONS/PUT statuses or proof of absent Authorization/Cookie headers. The functional browser result remains PASS; wire inspection remains PENDING. No protection, protocol, IAM, CORS or bucket change is proposed.

Manual Chrome DevTools checklist for a **separately authorized, bounded session**; this closeout authorizes no uploads or other cloud requests:

1. Reconcile the same cumulative ledger and reserve the future session's keys, bodies and request/retry allowance before starting. Reverify the restricted SDK provider when that session is authorized. Use one existing tiny synthetic fixture through a production form; do not rerun successful probes.
2. Open Network before the approved upload. Inspect the actual S3 OPTIONS (if emitted) and PUT locally. Record only request methods, statuses, relevant header names, safe MIME/length values, `If-None-Match:*`, SSE `AES256`, expected-owner match and checksum-match conclusions. If preflight is cached/absent, mark it unobserved; do not repeat uploads without a remaining session allowance.
3. Inspect the PUT URL locally only to transcribe the `X-Amz-SignedHeaders` **header-name list**. Confirm `content-length` is included and the emitted Content-Length equals the fixture's byte length. Record whether Authorization/Cookie headers are absent on the S3 request. Check the preflight origin/method/header allowance against the actual request; Content-Length is browser-generated, not manually set by JavaScript.
4. Record the PUT result and completion/attachment conclusion; reconcile actual requests, retries, keys and submitted bytes. Stop on a discrepancy and preserve protections. Share only sanitized header names, safe relevant values, methods, status codes and conclusions. Do not request/export full presigned URLs, credentials, tokens or raw HAR files, and avoid screenshots exposing query strings.

### Remaining release gates

The development checkpoint may record functional completion now. Full S3.1 security/acceptance sign-off still requires the named gaps above: browser wire/preflight inspection; same-length checksum `BadDigest`; corrupt live completion; ready-unattached visibility and ready cross-user completion/attachment; broader parent visibility; controlled browser expiry retry/no-loop and interrupted-form preservation; browser invalid-file/count and guest/disabled no-image flows; live ready-completion idempotency; and effective out-of-prefix permission review/simulation. Concurrent claims, ordering, rollback, quotas/leases and orphan cleanup have PostgreSQL/mock coverage only (except exact probe cleanup); retain that limitation or explicitly approve bounded live coverage before claiming it. No outside-prefix write or cleanup is requested.

Public deployment also remains gated on production credential/compute and origin/TLS configuration review, distributed abuse controls, operational monitoring, reviewed retention/deletion policy, decoder/dependency maintenance and disposition of the existing security findings (12 affected dependency packages: 6 moderate, 6 high). This checkpoint is not production clearance or full security certification.

### Preserved cumulative ledger and staging boundary

Across both verification sessions: **9 reserved keys; 1,828 submitted PUT-body bytes; 23 measured Node S3 requests. Browser traffic was not fully measured. 65 attempts are reserved for conservative planning, not an exact measured total** (23 measured Node + 2 blocked-connection reserve + 40 browser reserve). Submitted bodies are not a complete transport-byte measurement. Original cumulative limits remain **20 new object keys, 32 MiB uploaded and 200 S3 attempts**; no reset, reclaimed-key budget or exact remaining request allowance is claimed.

All four attached station/report objects and existing preview records remain retained. The two stored original probe objects were previously removed by the three-key guarded cleanup; do not repeat it. The pending unuploaded intent remains unchanged. Its historical eligibility timestamp is not current deletion authorization. This closeout neither rechecks cloud state nor authorizes deletion.

The reviewed working set remains **49 files: 28 modified and 21 new**, with no staged changes. Only this runbook is edited by this closeout; the existing implementation and unrelated work are preserved. The complete, shown-only commands in [Reviewed staging list](#reviewed-staging-list) include exact paths and exclude local evidence, secrets and generated files. Suggested commit message: `feat: add private S3 images with verified browser flows`.

## Flow and contracts

`RAY_MEDIA_MODE` defaults to `disabled`. In that mode, `/api/media/capabilities` returns `enabled:false`, media routes return 503 and forms offer creation without images. `/api/upload` remains unavailable in every PostgreSQL mode. S3 activation verifies a restricted caller before the API starts. Readiness subsequently checks SQL; it does not perform a chargeable S3 health probe on every request. S3/session failures produce a safe 503 with a source-login renewal hint.

With S3 enabled:

1. Authenticated `POST /api/media/uploads` accepts only `{purpose:"station"|"report",contentType,byteLength,checksum}`. Checksum is canonical base64 SHA-256 of the exact raw file. Response 201 includes `assetId`, `state`, intent `expiresAt`, upload `url`, required `headers`, conservative `uploadExpiresAt`, and `expiresIn:300`. No filename, bucket, key, endpoint, region or ACL can be supplied.
2. Browser uploads the raw File to that URL. No multipart body, Ray Authorization header, cookies or manual Content-Length. Permission exists in mounted-form memory only; it is not persisted or logged.
3. Authenticated owner `POST /api/media/:assetId/complete` verifies and normalizes the source, writes immutable output, then commits `state:"ready"`. Retry returns the same ready asset, subject to expiry for unattached assets. Failed completion never returns ready. An uncertain PUT can be retried with the same permission; a 412 leads to server verification, not assumed success.
4. `POST /api/feeding-stations` uses optional `imageAssetId`; `POST /api/reports` uses optional `mediaAssetIds` (ordered, maximum 3). Ownership, purpose, expiry, readiness and prior attachment are checked while locking the assets. The parent insert and claims commit in one transaction. Guest reports without images remain valid. **S3 creation intentionally rejects `image` URLs and nonempty `media` URLs/paths**; empty report `media:[]` remains accepted. Normal Mongo input contracts are unchanged.
5. Responses preserve `image:string` and `media:string[]` using stable `http://127.0.0.1:4001/api/media/<uuid>/content` URLs. This origin is trusted local configuration, never the Host header. Public GET resolves SQL and the existing parent visibility (including publicly readable inactive station details), then redirects to a fresh 60-second signed GET of validated output. Pending or ready-but-unattached assets return 404. Redirects use `Cache-Control:no-store` and `Referrer-Policy:no-referrer`. UI retries an image only after an explicit click, once; no automatic retry loop.

`media_assets` stores a UUID, owner FK, purpose, server-generated incoming/output keys, expected MIME/length/checksum, state/expiry/attempt/lease information, normalized output dimensions/length/checksum and timestamps. Nullable station/report FKs, a one-parent check, a unique station index and unique `(report_id,position)` with positions 0-2 enforce attachment structure. SQL does not store bytes, signed URLs or credentials. Existing domain IDs are untouched. The existing database timestamp trigger also covers media.

## Limits, consistency and cleanup

Accepted inputs: one station image or up to three report images; JPEG/PNG/WebP only; 1 byte-8 MiB per source; maximum 20,000,000 decoded pixels. GIF, SVG, HEIC, videos, malformed files, APNG and animated WebP are rejected. Magic bytes, declared MIME and actual decoder format must agree. sharp decodes, auto-orients, resizes inside 1600 x 1600 without enlargement, then re-encodes a single WebP at quality 82. EXIF/GPS/ICC/XMP are not retained. This is bounded image validation/normalization, **not malware scanning**.

Incoming keys are `dev/incoming/<uuid>` and server-only outputs `dev/ready/<uuid>.webp`. Both PUTs use `If-None-Match:*`, fixed checksum, content type, length, SSE-S3 `AES256` and expected bucket owner. Output keys are never issued for browser writes. Conditional writes prevent a replay from changing an existing object's bytes; a presigned URL is not inherently single-use. A retry after output was stored but SQL failed accepts existing output only when HEAD proves the identical normalized checksum, length and type. No SQL transaction spans S3 operations.

Actual SDK signing tests confirm that `content-length`, `content-type`, `if-none-match`, checksum, SSE and expected-owner headers are signed and that changing declared length changes the signature. HEAD must match the intent; GET is ETag-conditional and streamed under the expected size and 8 MiB cap. HEAD+GET share a 15-second deadline; sharp output processing has a 10-second timeout; output PUT has 15 seconds, fallback HEAD 10 seconds. Up to two verifications run concurrently, one per owner, without an unbounded processing queue. SQL leases last one minute, allow at most five attempts and space retries by two seconds. A ready transition requires the current, unexpired lease.

**Live size gate:** the production browser forms successfully uploaded raw JPEG/PNG Files, and the separate Node probe's changed-length request was rejected. The presigner requires signed Content-Length. Their compatibility is supported by actual acceptance and code inspection; direct browser wire-header/preflight inspection remains pending. A browser cannot set this header manually. Client checks and a later HEAD alone do not prevent oversized transfer costs. Preserve the signed length, checksum and conditional-write protections; missing automation capture is not grounds to change the upload protocol or policy. The S3-enabled local listener remains stopped pending separately bounded follow-up.

Per-user issuance: at most six outstanding unattached intents, and ten new intents per minute, serialized with a PostgreSQL user lock. Completion: ten requests per minute per owner, a bounded in-memory limiter (1024 owners), two total active processors per process. The completion rate/concurrency limits are **single-process**, not production distributed limits. Intent lifetime is one hour; attached media remains available after it expires. Source objects belonging to attached media are retained as well as their outputs; this cleanup never deletes attached media.

Orphan cleanup waits until BOTH the intent expiry and conservative upload-URL expiry are at least 24 hours old, and any processing lease has ended. Dry run returns at most 100 exact SQL-known pairs, without AWS credential resolution or bucket listing. Apply rechecks eligibility, atomically marks deleting to exclude attachment/completion, deletes those exact keys and records a tombstone. Partial deletion remains retryable. No bucket sweep or lifecycle rule is installed.

From repository root, with the dedicated preview database URL already configured:

```powershell
npm.cmd run build --prefix server
node server/dist/media/cleanup.js
node server/dist/media/cleanup.js | Out-File -Encoding utf8 -LiteralPath "$env:TEMP\ray-media-orphans.json"
```

Review that manifest before separately authorizing deletion. Only after AWS activation and approval:

```powershell
node server/dist/media/cleanup.js --apply "$env:TEMP\ray-media-orphans.json"
```

A stale/noneligible manifest is refused; regenerate dry run. This CLI validates the exact local preview database identity. It cannot operate on development/test/remote databases. Live-test probe cleanup has a separate exact manifest and refuses any key referenced by a media record.

## Dependencies and local validation

New direct pins: `@aws-sdk/client-s3`, `@aws-sdk/client-sts`, `@aws-sdk/credential-providers`, `@aws-sdk/s3-request-presigner` **3.1138.0**; `sharp` **0.35.4**. Verified registry metadata/engines with Node **22.22.0** (project range `>=22.22.0 <23`): SDK requires Node >=20; sharp requires >=20.9.0. The only changed existing transitive package is `semver` 7.7.2 to 7.8.5, required by sharp's `^7.8.5` dependency. No unrelated upgrades or forced audit fixes.

The chosen SDK's `fromIni({profile:"ray-s3-dev"})` resolves an AssumeRole profile's `source_profile`, including a source using `login_session`. Installed provider source and [AWS login credential support](https://docs.aws.amazon.com/sdkref/latest/guide/feature-login-credentials.html) were checked. This implementation uses the same explicitly resolved temporary credentials for STS identity verification and S3, not the ambient default chain. Each new session must have a token/expiry and identify as assumed `RayMediaDevRole` in account `438298964276`. Broad-role/root/other-account identities and endpoint overrides fail closed. [SDK credential providers](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-credential-providers.html).

Local test results (storage doubles and synthetic fixtures; **not real S3 verification**):

| Command from repository root | Result |
| --- | --- |
| `npm.cmd run build --prefix server` | Pass |
| `npm.cmd test --prefix server` | 189 tests passed, no skips |
| `$env:RAY_TEST_DATABASE_URL='postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'; npm.cmd run test:postgres --prefix server` | 122 tests passed, no skips |
| `npm.cmd run build --prefix client` | Pass |
| `npm.cmd run build:postgres --prefix client` | Pass |
| `node --test client/tests/*.test.cjs` | 37 tests passed, no skips |
| `npm.cmd audit --prefix server --json` | Same 12 affected packages as baseline: 6 moderate, 6 high; no new affected packages |

The original 182 backend, 109 PostgreSQL and 31 frontend tests remain, including auth, four-domain contracts, spatial, timestamp and concurrency regressions. New coverage includes real auth/SQL ownership, concurrent duplicate claims, ordered images, SQL constraints, parent/attachment rollback, no transactions during sequential storage operations, partial S3/DB failure, quotas/leases, expiry, private pending versus public attached reads and idempotent orphan deletion; plus actual offline SDK signatures, download bounds, synthetic corrupt/animated/pixel-excess/metadata fixtures and frontend raw uploads/retries. New S3/sharp dependency packages have no findings in this audit; existing Cloudinary/Mongoose/jws/router/body-parser/qs/tooling findings remain separate follow-up work.

Disposable test service only (existing guards refuse existing Ray objects and non-test URLs):

```powershell
docker compose -f compose.postgres.yml --profile test up -d --wait test-db
```

No preserved preview migration happens at startup. Human-authorized preview upgrade, keeping its volume and synthetic contents:

```powershell
docker compose -f compose.postgres.yml --profile preview up -d --wait preview-db
$env:RAY_PREVIEW_DATABASE_URL='postgresql://ray_preview:ray_preview_only@127.0.0.1:55434/ray_preview'
npm.cmd run db:migrate:preview --prefix server
```

Set the dedicated preview JWT secret using the existing [preview runbook](postgres-preview.md); never reuse the normal JWT secret. The normal preview launcher continues to work with images disabled. New non-secret settings are illustrated in `server/.env.s3.example`; it is not loaded automatically.

## Proposed AWS setup - human review/application only

Exact bucket: `ray-media-438298964276-eu-north-1-an`; region `eu-north-1`; expected owner `438298964276`; prefix `dev/`. Proposed role `arn:aws:iam::438298964276:role/RayMediaDevRole`, profile `ray-s3-dev`. This is a local development configuration, not a production role integration. Do not substitute `AccountFullAccessRole` for application operations.

Review [trust template](../../infra/s3/trust.template.json), [object permission policy](../../infra/s3/media-policy.json) and [one CORS rule](../../infra/s3/cors-rule.json). **The exact existing source IAM role ARN/path is still unverified.** The trust template deliberately contains a non-deployable placeholder, not an assumed-role session ARN or wildcard principal. Do not create the role until that exact principal has been verified and the rendered trust document reviewed.

Permissions use only object ARNs under this exact bucket's `dev/*`:

- `s3:PutObject`: incoming browser PUT and normalized server output; conditional `s3:if-none-match` must be `*`, SSE must be AES256 and TLS is required.
- `s3:GetObject`: HEAD/checksum validation, bounded source GET, output retry HEAD and signed output GET.
- `s3:DeleteObject`: separately approved exact-key orphan/probe cleanup.

No bucket-level action is required by the application. No listing, HeadBucket, ACL writes, administration, KMS or CloudFront. STS GetCallerIdentity does not require a grant in this S3 policy. Role policy alone does not prove the account's effective access: review other attached/inline policies, resource policies, boundaries and organization controls before activation. [S3 conditional enforcement](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html), [PutObject contract](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html).

1. Human read-only setup checks, using the existing setup profile (never application S3 operations). These output identity/configuration, not credential caches:

```powershell
aws sts get-caller-identity --profile default
aws iam get-role --role-name AccountFullAccessRole --profile default --query Role.Arn --output text
aws s3api get-bucket-location --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default
aws s3api get-bucket-ownership-controls --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default
aws s3api get-public-access-block --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default
aws s3control get-public-access-block --account-id 438298964276 --profile default --region eu-north-1
aws s3api get-bucket-encryption --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default
aws s3api get-bucket-versioning --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default
aws s3api get-bucket-policy-status --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default
aws s3api get-bucket-policy --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default
aws s3api get-bucket-cors --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default
```

Verify role metadata against the reported setup session. If the source is differently named or lookup is denied, stop that setup step and obtain the exact IAM ARN from the administrator; do not guess a path. In the console also verify **General purpose**, **Account Regional namespace**, owner enforcement/ACLs disabled, all four bucket Block Public Access settings enabled, default SSE-S3 AES256 and versioning never enabled (empty status, not Enabled or Suspended). Review any existing bucket policy, including conditional writes and public grants. `NoSuchBucketPolicy`/`NoSuchCORSConfiguration` is distinct from AccessDenied; do not treat every error as an absent policy/rule. Do not alter bucket privacy/encryption/versioning/lifecycle under this milestone. The previously reported successful HeadBucket does not establish these properties.

2. Render and review an exact trust document, after verifying that `AccountFullAccessRole` is the intended source. This command only prepares a temporary local document:

```powershell
$raySourceRoleArn=aws iam get-role --role-name AccountFullAccessRole --profile default --query Role.Arn --output text; if ($LASTEXITCODE -ne 0 -or $raySourceRoleArn -notmatch '^arn:aws:iam::438298964276:role/.+') { throw 'Verify the exact setup IAM role ARN first' }; $rayTrust=Get-Content -Raw -LiteralPath infra/s3/trust.template.json | ConvertFrom-Json; $rayTrust.Statement[0].Principal.AWS=$raySourceRoleArn.Trim(); [IO.File]::WriteAllText((Join-Path $env:TEMP 'ray-media-trust.reviewed.json'),($rayTrust | ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
Get-Content -LiteralPath "$env:TEMP\ray-media-trust.reviewed.json"
```

3. **Cloud-modifying commands, proposed only. Human approval required before execution.** If the role already exists, inspect it instead of updating/replacing its trust or policies automatically. The source principal must be authorized to assume this exact role; do not attach the media policy to the broad setup role.

```powershell
aws iam create-role --role-name RayMediaDevRole --assume-role-policy-document "file://$env:TEMP/ray-media-trust.reviewed.json" --description "Ray local synthetic media only; dev prefix" --max-session-duration 3600 --profile default
aws iam put-role-policy --role-name RayMediaDevRole --policy-name RayMediaDevObjects --policy-document file://infra/s3/media-policy.json --profile default
```

4. Human profile setup commands modify only named properties in `~/.aws/config`; they do not replace the whole file or create access keys/users. The existing default source profile must actually use `login_session`. Renew that source with `aws login` when needed; do not print its cache or credential files.

```powershell
aws configure set role_arn arn:aws:iam::438298964276:role/RayMediaDevRole --profile ray-s3-dev
aws configure set source_profile default --profile ray-s3-dev
aws configure set region eu-north-1 --profile ray-s3-dev
aws configure set role_session_name ray-media-local --profile ray-s3-dev
aws configure set duration_seconds 3600 --profile ray-s3-dev
aws login --profile default
aws sts get-caller-identity --profile ray-s3-dev
```

The last command must identify account 438298964276, assumed `RayMediaDevRole`, not the source broad role or root. The SDK performs its own verification with the actual provider used by S3. Confirm the installed CLI supports `aws login` and the named source already works; profile setup and real credential-chain resolution remain untested here.

5. Review effective permissions, including a read-only IAM simulation of a write outside `dev/` (expected implicit/explicit deny). Simulation complements actual role/profile review; it is not a substitute for all resource-policy evaluation.

```powershell
aws iam list-attached-role-policies --role-name RayMediaDevRole --profile default
aws iam list-role-policies --role-name RayMediaDevRole --profile default
aws iam get-role-policy --role-name RayMediaDevRole --policy-name RayMediaDevObjects --profile default
aws iam simulate-principal-policy --policy-source-arn arn:aws:iam::438298964276:role/RayMediaDevRole --action-names s3:PutObject --resource-arns arn:aws:s3:::ray-media-438298964276-eu-north-1-an/outside-dev/synthetic-probe --context-entries ContextKeyName=aws:SecureTransport,ContextKeyValues=true,ContextKeyType=boolean ContextKeyName=s3:x-amz-server-side-encryption,ContextKeyValues=AES256,ContextKeyType=string ContextKeyName=s3:if-none-match,ContextKeyValues=*,ContextKeyType=string --profile default
```

No real write outside the prefix is proposed.

6. CORS is not authorization and does not make objects public. Proposed origin is only `http://127.0.0.1:5175`, with PUT for upload and GET for browser read verification. Required signed request headers are explicitly listed. Browser-generated Content-Length is not manually set or added to preflight. There is no OPTIONS AllowedMethod or wildcard origin. S3 handles preflight.

Read and preserve existing CORS first; merge the one rule into a reviewed complete document. Example for an existing CORS configuration (stop on errors):

```powershell
$rayCorsText=aws s3api get-bucket-cors --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default --output json; if ($LASTEXITCODE -ne 0) { throw 'Inspect error; do not overwrite existing CORS' }; $rayCors=$rayCorsText | ConvertFrom-Json; $rayRule=Get-Content -Raw -LiteralPath infra/s3/cors-rule.json | ConvertFrom-Json; $rayMerged=@{CORSRules=@($rayCors.CORSRules)+@($rayRule)}; [IO.File]::WriteAllText((Join-Path $env:TEMP 'ray-media-cors.reviewed.json'),($rayMerged | ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
```

Only when the read specifically returns `NoSuchCORSConfiguration` and that absence is confirmed:

```powershell
$rayRule=Get-Content -Raw -LiteralPath infra/s3/cors-rule.json | ConvertFrom-Json; [IO.File]::WriteAllText((Join-Path $env:TEMP 'ray-media-cors.reviewed.json'),(@{CORSRules=@($rayRule)} | ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
```

Review duplicates/conflicts and unrelated rules before application. **The following replaces the entire CORS document: run only after reviewing the merged file and approving that exact update.**

```powershell
Get-Content -LiteralPath "$env:TEMP\ray-media-cors.reviewed.json"
aws s3api put-bucket-cors --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --cors-configuration "file://$env:TEMP/ray-media-cors.reviewed.json" --profile default
aws s3api get-bucket-cors --bucket ray-media-438298964276-eu-north-1-an --expected-bucket-owner 438298964276 --profile default
```

## Historical activation procedure (results recorded below)

Prerequisites: reviewed role/trust/policy/profile; verified restricted CLI identity; bucket checks above; reviewed/applied exact CORS; human approval for this bounded synthetic test. Do not change cloud settings to make a failing test pass without a new review. Do not substitute the setup role. No real user images.

Set non-secret settings in the same PowerShell that will run the API/test, after the preview migration and dedicated secret setup:

```powershell
$env:RAY_MEDIA_MODE='s3'; $env:RAY_S3_BUCKET='ray-media-438298964276-eu-north-1-an'; $env:RAY_S3_REGION='eu-north-1'; $env:RAY_S3_PREFIX='dev/'; $env:RAY_S3_PROFILE='ray-s3-dev'; $env:RAY_S3_EXPECTED_ACCOUNT='438298964276'; $env:RAY_S3_EXPECTED_ROLE='arn:aws:iam::438298964276:role/RayMediaDevRole'
```

For one separately approved live run, create one UUID namespace. Retain that UUID in the local manifest; use the same environment for API and probe. Do not reuse a prior run directory or change run ID before cleanup:

```powershell
$env:RAY_S3_LIVE_TEST_APPROVED='synthetic-bounded-test'; $env:RAY_S3_TEST_RUN=[guid]::NewGuid().ToString()
npm.cmd run test:s3:live --prefix server
npm.cmd run start:postgres --prefix server
```

In another terminal:

```powershell
npm.cmd run dev:postgres --prefix client
```

`test:s3:live` is separate from all default tests. It refuses without the explicit approval string, a valid UUID and exact restricted S3 config. It writes a synthetic 64 x 48 PNG and a three-key manifest under `$env:TEMP\ray-s3-<run UUID>`, before S3 writes. All probe and form keys are under `dev/test-runs/<run UUID>/`. Changing the issuance namespace later does not invalidate reads of existing SQL-attached test images under `dev/`. The Node probe verifies conditional replay denial, changed MIME/checksum/length signature denial, HEAD/GET checksum, actual normalization/output, identical output retry and unsigned private output denial. It never prints signed URLs or raw SDK errors. Passing this Node probe **does not verify browser behavior**.

Budget for the combined manually supervised run: at most **6 image intents** (probe uses 2 keys; UI up to 4 intents), **12 object keys**, **50 S3 requests** including deliberate failures and SDK retries, **1 MiB of uploaded data**, plus at most **1 MiB downloaded**, and **10 STS requests**. Images must each be <=16 KiB, using the generated synthetic fixture (one station, one report, one private pending/cross-user case, one corruption case). Stop on repeated failures; do not benchmark or repeatedly refresh. These are test-procedure budgets, not a hard account billing cap; S3/IAM do not impose them automatically.

Required manual browser checks, recording only pass/fail and asset/resource IDs (no HAR, signed URLs, token-bearing screenshots, credentials or raw SDK errors):

- At `http://127.0.0.1:5175`, sign in as synthetic user A. Select the generated fixture for a station; inspect preflight and raw PUT locally. Confirm exact signed Content-Length succeeds, required headers are sent, and no Ray token/cookies are sent to S3. The Node probe's larger-body negative must also have failed. If the browser fails signature/length, stop activation; request approval for presigned POST range policy instead.
- Submit station and one report image, see the images, refresh, restart the API with the same preview DB/config, and see them again. Wait >60 seconds, request the stable content URL again, and verify a fresh read. Do not copy/log that redirect URL. One explicit image retry must not loop.
- While signed out, images are disabled with a sign-in explanation; a report without images still submits. Disabled server mode still offers no-image creation. Invalid size/type/count is rejected before uploads; interrupted uploads retain form text.
- Use synthetic user B's authenticated Ray session to attempt A's pending/ready asset completion and attachment via the API; expect 403 and no new parent. Asset IDs alone do not grant access; GET of pending/unattached media returns 404.
- Exercise completion on a synthetic invalid PNG (a small text file declared PNG); expect 422 and no attachable asset. Repeated completion of valid ready media is idempotent. Server uses normalized WebP, not incoming bytes.
- Confirm unsigned direct S3 access is denied (automated probe), reviewed effective permissions deny out-of-prefix writes (IAM simulation), and no signed URLs/credentials appear in application logs or test reports.

Exact run cleanup plan:

- Probe `manifest.json` contains its three exact keys, bucket, prefix and a conservative `cleanupAfter` timestamp. Read it locally; after that time and separate deletion approval, run the command below with the same test UUID/config and guarded preview DB. It refuses if any probe key is referenced by SQL. It never lists or recursively deletes a bucket.
- For form uploads, run normal orphan dry run; review only manifest rows whose keys start with this run's exact prefix. After their expiry plus 24 hours, approve only those exact unattached keys. Attached synthetic station/report media is intentionally retained; no automatic parent/data deletion is supplied. Any later deletion requires explicit approval and relationship-aware work.

```powershell
Get-Content -LiteralPath "$env:TEMP\ray-s3-$env:RAY_S3_TEST_RUN\manifest.json"
npm.cmd run test:s3:live --prefix server -- --cleanup
```

Disable in the API terminal and restart the preview to return to safe mode:

```powershell
$env:RAY_MEDIA_MODE='disabled'; Remove-Item Env:RAY_S3_TEST_RUN -ErrorAction SilentlyContinue; Remove-Item Env:RAY_S3_LIVE_TEST_APPROVED -ErrorAction SilentlyContinue
npm.cmd run start:postgres --prefix server
```

No production compute/role integration, production CORS, public deployment, lifecycle policy, or general media deletion UI is configured. Future explicit application switch can retire Cloudinary/Mongo dependencies; this milestone leaves normal behavior intact. Production work still includes distributed abuse controls, credential/compute selection, operational monitoring, decoder/dependency updates and a reviewed retention/deletion policy. Costs include source/output storage, successful/failed requests, data transfer and local image processing. There is no zero-cost promise or hard billing cap.

Implementation references: [SDK presigning/raw browser file uploads](https://aws.amazon.com/blogs/developer/generate-presigned-url-modular-aws-sdk-javascript/), [sharp input bounds](https://sharp.pixelplumbing.com/api-constructor/), [sharp output metadata/timeout](https://sharp.pixelplumbing.com/api-output/).

## Reviewed staging list

Reviewed 49 files (28 modified, 21 new). These commands enumerate the complete list; they are shown only and have not been executed. Exclude credentials, actual environment files, signed URL captures, verification artifacts, logs, node_modules, build output, data and AWS caches. `server/.env.s3.example` is a reviewed non-secret, disabled example, not an actual environment file. Proposed commit message: `feat: add private S3 images with verified browser flows`.

```powershell
git add -- "client/src/api/media.ts" "client/src/components/createFeedingStation/CreateFeedingStation.tsx" "client/src/components/feedingStationDetails/FeedingStationDetails.tsx" "client/src/components/layout/Layout.tsx" "client/src/components/media/Media.tsx" "client/src/components/reportCard/ReportCard.css" "client/src/components/reportCard/ReportCard.tsx"
git add -- "client/src/components/reportForm/ReportForm.tsx" "client/src/components/reportMarker/ReportMarker.tsx" "client/src/features/feedingStations/feedingStationsThunks.ts" "client/src/features/feedingStations/types.ts" "client/src/features/reports/reportsThunks.ts" "client/src/pages/report/Report.tsx" "client/tests/media.test.cjs"
git add -- "server/.env.s3.example" "server/controllers/feedingStationController.ts" "server/controllers/reportController.ts" "server/db/migrations/0006_media_assets.sql" "server/db/migrations/meta/0006_snapshot.json" "server/db/migrations/meta/_journal.json" "server/db/schema.ts"
git add -- "server/feedingStations/feedingStationStore.ts" "server/feedingStations/postgresFeedingStationStore.ts" "server/media/cleanup.ts" "server/media/config.ts" "server/media/image.ts" "server/media/routes.ts" "server/media/s3.ts"
git add -- "server/media/service.ts" "server/media/types.ts" "server/media/validation.ts" "server/package-lock.json" "server/package.json" "server/preview-server.ts" "server/preview/app.ts"
git add -- "server/preview/runtime.ts" "server/reports/postgresReportStore.ts" "server/reports/reportStore.ts" "server/routes/feedingStationRoutes.ts" "server/routes/reportRoutes.ts" "server/tests/integration/database.mjs" "server/tests/integration/postgresMedia.test.mjs"
git add -- "server/tests/live/s3.mjs" "server/tests/media.test.mjs"
git add -- "docs/migrations/postgres-preview.md" "docs/migrations/s3-media.md"
git add -- "infra/s3/cors-rule.json" "infra/s3/media-policy.json" "infra/s3/trust.template.json"
```

Tracked diff whitespace and all new-file trailing-whitespace/final-newline checks passed. Old migrations/snapshots 0000-0005 and the Git index are unchanged. The test container created for this task was removed after validation; development/preview containers remain stopped and their volumes preserved. No AWS changes, real S3 transfers, deployment, staging, commit or push occurred.

## Activation attempt: 2026-09-23, run 24d3e4dd

This section supersedes the historical activation-pending statements above. This is a **partial verification, not S3.1 completion or deployment clearance**. No application source, dependencies, migrations or existing S3.1 tests were changed in this activation attempt. The only additional reviewable file edit is this runbook. Local instrumentation, fixtures, manifests and logs are in the Git-ignored `server/dist/s3-activation/` directory; they are not product code or staging candidates. The original 28 modified and 21 new S3.1 files remain present, with no staged changes.

### Preflight and migration evidence

- Branch `ray-2-postgres`; HEAD `f91d393ce4618cb2e6dc13d4d022b46ed048de13`. No applicable `AGENTS.md` was found in the repository or inspected ancestor directories. Git's sandbox ownership warning was handled using per-command `-c safe.directory=C:/Users/97254/Desktop/projects-2025/ray`, without changing global configuration.
- Node 22.22.0, AWS CLI 2.37.0 and Docker are already on PATH. No stale PATH, installation or PATH edit. Sandbox AWS initially reported profile not found, and Docker reported configuration/pipe access denied; running the same authorized checks outside the sandbox resolved both.
- `aws sts get-caller-identity --profile ray-s3-dev --region eu-north-1 --no-cli-pager` returned account `438298964276`, ARN `arn:aws:sts::438298964276:assumed-role/RayMediaDevRole/ray-local`.
- SDK verification imported `restrictedCredentials` from `server/dist/media/s3.js`, called `restrictedCredentials(mediaConfig())()`, then passed that same returned temporary credential object to `STSClient`/`GetCallerIdentityCommand` and `assertMediaIdentity`. It returned the same account and ARN. The provider itself also performs its built-in STS check. Credentials/tokens were never printed or exported. No default-chain fallback, credential-file modification or broad-role S3 operation occurred.
- The human-confirmed trust source is `arn:aws:iam::438298964276:role/managed/AccountFullAccessRole`. Bucket privacy/ownership/AES256/CORS confirmation is human-supplied evidence. No IAM, trust, CORS, bucket-policy, lifecycle or encryption command was run; no bucket-level permission was requested.
- `& ./scripts/start-postgres-preview.ps1` verified and started the existing preview container/volume. Ports 4001 and 5175 were free. Before migration, the normal local URL guard and `assertDatabaseIdentity(pool,'preview')` passed; SQL returned database/user `ray_preview`/`ray_preview`, internal port 5432. All six applied journal hashes/timestamps matched local migrations. The only pending identifier shown was **`0006_media_assets`**, reviewed as additive table/FKs/indexes/trigger.
- With `RAY_PREVIEW_DATABASE_URL=postgresql://ray_preview:ray_preview_only@127.0.0.1:55434/ray_preview`, `npm.cmd run db:migrate:preview --prefix server` applied and verified `0006`. No reset/seed/truncation or other database migration occurred.

### Live Node/S3 evidence and limits

Run UUID: `24d3e4dd-ddb9-4627-8eaf-662c3cb02a6a`; exact prefix: `dev/test-runs/24d3e4dd-ddb9-4627-8eaf-662c3cb02a6a/`.

Before cloud operations, the combined plan reserved three probe keys and four application intents with possible normalized outputs: at most 11 keys, 150 S3 attempts, and fixtures under 16 KiB. This is below the user's limits of 20 keys, 200 attempts and 32 MiB including retries. The existing opt-in probe was inspected before execution. A local ignored wrapper instrumented Node HTTPS and fetch, refused requests outside the exact run prefix, and imposed a 100-attempt/1-MiB PUT-body ceiling on its operations. Browser traffic was to be accounted separately; none occurred. No bucket listing, outside-prefix probe or cloud administration was performed.

The unmodified `server/tests/live/s3.mjs` was executed via `node server/dist/s3-activation/probe.mjs` after loading the exact environment below. The wrapper records only methods, exact keys, header names, statuses and sanitized S3 XML error codes, never URLs, signatures, tokens or credential values.

| Real S3 case | Observed result |
| --- | --- |
| Synthetic 64x48 PNG, 203 bytes, signed PUT | 200 |
| Reuse same completed source PUT permission | 412 `PreconditionFailed` |
| Changed Content-Type against original signature | 403 `SignatureDoesNotMatch` |
| Changed checksum header against original signature | 403 `SignatureDoesNotMatch` |
| 208-byte body against signed 203-byte length | 403 `SignatureDoesNotMatch` |
| Source HEAD and conditional GET | 200 / 200; exact checksum/length validated |
| Normalize to 80-byte WebP and immutable output PUT | 200 |
| Identical output retry | PUT 412, fallback checksum/length/type HEAD 200 |
| Signed output GET | 200; downloaded checksum matched normalized bytes |
| Unsigned direct output GET | 403 `AccessDenied` |

The presigned upload's signed-header list was exactly `content-length;content-type;host;if-none-match;x-amz-checksum-sha256;x-amz-expected-bucket-owner;x-amz-server-side-encryption`. Application frontend source supplies only Content-Type, If-None-Match and the three named x-amz headers; it uses the raw File body, `credentials:'omit'`, and never sets Content-Length or sends the Ray bearer token to S3. **Source inspection and Node success are not browser wire evidence.**

The wrong-length probe returned a signature error, distinguishable from `BadDigest`; it is not proof of a same-length payload-checksum rejection. That independent checksum case and a corrupt-image completion through live S3 were **NOT RUN**. No ready application asset was produced.

Measured S3 total: **12 request attempts**, including deliberate failures and observed SDK requests, **1,180 bytes of PUT bodies as a conservative upper bound**, three probe keys attempted/reserved, and two successfully stored objects (203-byte source plus 80-byte normalized output). Failed/early-rejected bodies may have transferred fewer bytes. This is client instrumentation, not AWS billing/server-side accounting. No SDK retry was observed. STS activity was not included in the S3 count or instrumented as a complete STS ledger. One later API intent reserved another source/output pair without uploading, so **five exact run keys are reserved overall, two objects stored**. No browser S3 attempts, downloads or automatic image retries occurred.

### Real API and browser results

The existing preview entry point ran with real PostgreSQL and `openS3Storage`, bound to `127.0.0.1:4001`; `/readyz` passed and the production frontend at `127.0.0.1:5175` displayed `S3 images enabled`. The ignored wrapper imported that entry point only to count SDK requests; it supplied no mocked storage/API responses. Two new synthetic users were registered through the local API:

| Actor | Public ID | Email |
| --- | --- | --- |
| A | `a9e9df75622bc49b142a7ce8` | `s31-24d3e4dd-a@ray.example.invalid` |
| B | `f881799cb7663c9dd5656e1d` | `s31-24d3e4dd-b@ray.example.invalid` |

Both use the public, local-only synthetic password `RayDemoOnly!2026`. No production account or real incident was used.

Chrome successfully exercised logout, guest image-input disabling, login as A, map location selection and the actual Add Feeding Station form. A draft synthetic station name/notes was entered. The native file-chooser tool timed out before selecting the 285-byte synthetic JPEG and reset its tool session. Browser recovery showed the form had closed; no station submission, upload intent or browser S3 request resulted from that flow. Synthetic local PNG (203 bytes) and WebP (84 bytes) fixtures were also generated, but not uploaded through the browser.

The browser's documented recovery requires the user to enable **Allow access to file URLs** under the ChatGPT extension's Details at `chrome://extensions`. The agent did not change this access setting. The browser exposes DOM/screenshots/file chooser APIs but no network-capture API; therefore preflight, actual browser-generated Content-Length, wire header/token absence and signed upload status were **NOT OBSERVED**. No HTTP/CLI upload was substituted for the browser flow.

| Local real-API security case | Result |
| --- | --- |
| Guest POST `/api/media/uploads` | 401 |
| Declared sizes 0 and 8,388,609 | 400, before signing/issuance |
| A creates one pending WebP intent | 201, no S3 upload |
| B completes A's pending intent | 403 |
| B attaches A's intent to a station | 403, no parent created |
| Guest GET pending asset content | 404 |

Asset `4d38e7c4-82d1-48ad-a47b-5c65e75ebd8d` remains pending and unattached. The first security script completed these assertions but failed before manifest writing because sandbox PowerShell disallowed dot-sourcing the session environment file. Recovery explicitly set the permitted preview URL, recovered exact SQL records, validated configuration before further actions, and repeated the six negative checks against the **same** asset. No duplicate intent was created. PowerShell execution policy was not changed or bypassed.

Station/report image creation, decoded persisted-image display, refresh persistence, API-restart image persistence, expired-read-URL renewal, publicly attached visibility, ready-but-unattached visibility, live corrupt image/checksum rejection and live duplicate attachment are **NOT RUN**. Their offline/PostgreSQL tests passed, but that does not upgrade their live tier. The S3-enabled API was stopped because the browser size gate remains open. No application defect was established and no product fix/regression test change was justified.

### Remaining browser checklist and size gate

After enabling the documented upload-tool permission, start one controlled preview session with the exact commands below and a remaining-budget ledger. Keep DevTools Network captures containing URLs local under the ignored run directory. Do not copy full URLs/tokens into this document.

1. Log in as A. Use the actual station form with the 285-byte synthetic JPEG. Capture OPTIONS and signed PUT from origin `http://127.0.0.1:5175`; record sanitized status/header names, signed-header names, browser-generated Content-Length and actual raw body length. Confirm no manually set Content-Length, Ray Authorization or cookies reach S3, and no browser security override is active.
2. Stop on signature/CORS failure. Do not change IAM/CORS. If a required header is refused, record the exact missing header for human review. No missing CORS header has yet been observed in this run.
3. Confirm server normalization reaches ready, station POST carries only the asset reference, and the persisted image actually decodes (nonzero natural dimensions and visible pixels). Refresh and inspect again. Create one clearly labelled General report with a PNG and check its image similarly.
4. Restart only the owned preview API; verify both images still decode. Retain an earlier signed read URL only in private local test memory, wait beyond its actual expiry while doing other work, confirm its denial, then resolve the stable content URL and verify a fresh signed read succeeds. Verify SQL/Redux persistence contains stable content references, not signed URLs. Test one explicit image retry without a loop.
5. Exercise A's ready-but-unattached media versus B completion/attachment, public attached visibility under existing parent rules, duplicate attachment refusal, a same-length checksum-mismatched tiny body, and corrupt content that never becomes a displayed ready image. Use remaining planned intents only and add every source/output key to the manifest before operations. Do not rerun the completed probe merely to get a green combined report.
6. Preserve successful small station/report examples and their source/output objects. Cleanup only this run's exact unattached objects after the existing guards allow it.

Exact browser-compatible signed-PUT size enforcement remains **unverified**. The Node size rejection is encouraging, but insufficient for this task's completion gate. Keep live upload acceptance stopped until that gate passes. If PUT cannot meet it, the separate-review proposal is presigned POST with a `content-length-range` condition, exact server-generated key, checksum/type/encryption constraints and bounded expiry. AWS documents the range condition in [POST policies](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html); its [conditional-write documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html) describes the PutObject/CompleteMultipartUpload replay protection used here. POST must not be assumed to preserve this implementation's `If-None-Match:*` guarantee or satisfy its existing IAM condition. A protocol change would require a separately reviewed replay/overwrite and cleanup design plus exact CORS/policy implications; no such change was made or authorized here.

### Exact activation/startup commands and stopped state

The activation used these session-local values (also retained in ignored `server/dist/s3-activation/env.ps1`). No existing env file was overwritten, and no backend secret was put in VITE settings. These commands enable a **controlled verification session**, not unrestricted upload acceptance. Run from repository root after resolving the browser blocker; do not rerun migrations or the live probe unnecessarily.

```powershell
& ./scripts/start-postgres-preview.ps1
$env:RAY_PREVIEW_DATABASE_URL='postgresql://ray_preview:ray_preview_only@127.0.0.1:55434/ray_preview'
$env:RAY_PREVIEW_JWT_SECRET='ray-preview-only-secret-not-for-deployment-2026'
$env:RAY_MEDIA_MODE='s3'; $env:RAY_S3_BUCKET='ray-media-438298964276-eu-north-1-an'; $env:RAY_S3_REGION='eu-north-1'; $env:RAY_S3_PREFIX='dev/'; $env:RAY_S3_PROFILE='ray-s3-dev'; $env:RAY_S3_EXPECTED_ACCOUNT='438298964276'; $env:RAY_S3_EXPECTED_ROLE='arn:aws:iam::438298964276:role/RayMediaDevRole'
$env:RAY_S3_LIVE_TEST_APPROVED='synthetic-bounded-test'; $env:RAY_S3_TEST_RUN='24d3e4dd-ddb9-4627-8eaf-662c3cb02a6a'
npm.cmd run build --prefix server
npm.cmd run start:postgres --prefix server
```

Second terminal:

```powershell
$env:VITE_API_URL='http://127.0.0.1:4001'
npm.cmd run dev:postgres --prefix client
Start-Process 'http://127.0.0.1:5175/map-page'
```

For normal no-upload preview, set `$env:RAY_MEDIA_MODE='disabled'` before starting the API. Mongo-mode defaults are unchanged. At closeout, owned API PID 8340 and frontend PID 25660 were verified by command line and stopped. The preview and this run's test service were stopped; their containers and the persistent preview volume remain. Development container/volume were untouched. **No process started by this run remains running.**

### Exact manifests, retention and deferred cleanup

Probe manifest: `%TEMP%\ray-s3-24d3e4dd-ddb9-4627-8eaf-662c3cb02a6a\manifest.json`. On this machine `%TEMP%` for the authorized cloud process was `C:\Users\97254\AppData\Local\Temp`. It contains these relative keys under the exact run prefix:

- `incoming/89e39c1a-4532-4f95-b7cc-f14305bfec1b` (stored, 203 bytes).
- `ready/89e39c1a-4532-4f95-b7cc-f14305bfec1b.webp` (stored, 80 bytes).
- `incoming/73ba8dc8-8724-4fef-8b05-2174d100ea02` (all writes rejected; reserved cleanup key).

Probe cleanup is guarded until **2026-09-23 14:49:09.775 UTC / 17:49:09.775 Jerusalem**. Cleanup was not attempted early and no expiry wait loop was used. With the same environment above and guarded preview DB running, the existing exact-key command is:

```powershell
node server/tests/live/s3.mjs --cleanup
```

It rechecks that none of those three keys are referenced in media SQL and deletes only those exact keys; no listing or sweeping. This task already authorizes that exact disposable cleanup, so no new policy approval is needed when the guard permits it. Allow up to six additional S3 attempts for its three deletes with two-attempt SDK bounds, and add them to the ledger.

`server/dist/s3-activation/assets.json` records the pending application's source/output pair: `incoming/4d38e7c4-82d1-48ad-a47b-5c65e75ebd8d` and `ready/4d38e7c4-82d1-48ad-a47b-5c65e75ebd8d.webp`. Neither was uploaded. Its upload expiry is `2026-09-23T14:45:15.793Z`, intent expiry `2026-09-23T15:40:15.130Z`; normal orphan cleanup cannot select it before **2026-09-24T15:40:15.130Z**, and must still recheck leases/attachment. Later, generate the existing dry run, filter to this exact run prefix, review the filtered manifest, and apply only that manifest:

```powershell
$rayRunPrefix='dev/test-runs/24d3e4dd-ddb9-4627-8eaf-662c3cb02a6a/'
$rayCandidates=node server/dist/media/cleanup.js | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cleanup dry run failed' }
$rayExact=@($rayCandidates | Where-Object { $_.sourceKey.StartsWith($rayRunPrefix) -and $_.outputKey.StartsWith($rayRunPrefix) })
ConvertTo-Json -InputObject $rayExact -Depth 5 | Set-Content -Encoding utf8 server/dist/s3-activation/orphans-reviewed.json
Get-Content server/dist/s3-activation/orphans-reviewed.json
node server/dist/media/cleanup.js --apply server/dist/s3-activation/orphans-reviewed.json
```

Retained SQL records are the two synthetic users and one pending intent only; no new stations/reports or attached media exist. The two stored probe objects are deferred cleanup, not successful preview examples. `records.json`, `assets.json`, `ledger.json` and `security-results.json` under the ignored run directory provide exact IDs and sanitized evidence. No raw network capture or presigned URL file was created.

### Validation and checkpoint outcome

| Tier / established command | This activation result |
| --- | --- |
| `npm.cmd run build --prefix server` | PASS |
| `npm.cmd test --prefix server` | PASS, 189/189, no skips |
| `RAY_TEST_DATABASE_URL` set to guarded 55433 test URL; `npm.cmd run test:postgres --prefix server` | PASS, 122/122, no skips |
| `npm.cmd run build --prefix client` | PASS outside sandbox; initial esbuild ancestor-directory access denial retained in log |
| `npm.cmd run build:postgres --prefix client` | PASS |
| `node --test client/tests/*.test.cjs` | PASS, 37/37, no skips |
| Unmodified opt-in live S3 probe | PASS once, 12 requests |
| Real preview API security checks | PASS, as itemized above |
| Real browser login / station form / guest disabled input | PASS |
| Browser upload, network/Content-Length gate, station/report images | BLOCKED / NOT RUN |
| Tracked and 21 new-file whitespace checks | PASS |

Ordinary tests were run with media disabled and no live-test approval/run environment. Storage-double tests remained isolated from live credentials and made no cloud writes. No tests were skipped or weakened. Logs are under `server/dist/s3-activation/`; failed sandbox build and file-chooser attempts are not counted as successful verification.

**S3.1 is not ready for a completed activation checkpoint commit.** Browser acceptance, the remaining live security cases and example retention still need completion. Public deployment is separately not ready, including the existing security/operational follow-ups described earlier. No staging, commit, push, merge or deployment occurred. The full single-line staging commands in the preceding reviewed staging list remain shown-only; the sole additional edit from this attempt is included by this shown-only command:

```powershell
git add -- docs/migrations/s3-media.md
```

## Resume preflight: 2026-09-24

The user confirmed that the official ChatGPT Chrome extension's **Allow access to file URLs** setting is now enabled. Browser tool documentation was reconnected, but file selection and the real browser upload flow were **NOT RETRIED** because the prerequisite AWS identity check failed first:

```text
aws sts get-caller-identity --profile ray-s3-dev --region eu-north-1 --no-cli-pager
aws: [ERROR]: Your session has expired. Please reauthenticate using 'aws login'.
```

This was the authorized check outside the sandbox, not the earlier sandbox profile-visibility problem. The existing session-local configuration still explicitly selects `ray-s3-dev`, account `438298964276`, `RayMediaDevRole`, the exact bucket/region and the original run namespace. The application's `restrictedCredentials` still uses explicit `fromIni` and verifies temporary credentials with STS; no ambient fallback or credential/configuration edit was made. SDK identity was not re-requested after the CLI reported expiry. The human must refresh the **existing temporary source login**, then both restricted CLI and application SDK identity must pass before resuming uploads or cleanup. Do not log in as a replacement role or create permanent credentials.

Branch/HEAD remain `ray-2-postgres` / `f91d393ce4618cb2e6dc13d4d022b46ed048de13`; all expected uncommitted S3.1 changes are preserved. The only reviewable edit in this resume is this runbook. No API, frontend or database process was started, no migration/build/test/probe was repeated, and no S3 operation or deletion occurred.

The existing `ledger.json`, `assets.json`, `records.json` and original probe `manifest.json` were reconciled before any cloud budget expenditure. At this preflight, cumulative usage remained **12 S3 attempts**, **at most 1,180 PUT-body bytes**, **five exact reserved keys**, and **two successfully stored probe objects**. These historical totals precede the browser resume below. The original cumulative limits continue; restarting never resets the budget. Existing synthetic fixtures remained present: JPEG 285 bytes, PNG 203 bytes and WebP 84 bytes.

At the resume check, local time was `2026-09-24T09:14:41+03:00` (`2026-09-24T06:14:41Z`). The probe manifest's actual `cleanupAfter=2026-09-23T14:49:09.775Z` is past, but cleanup remains pending because credentials expired and the existing command must still check SQL references. The pending application intent's normal orphan eligibility threshold, `2026-09-24T15:40:15.130Z`, is **still in the future** at this check. Neither its source nor output was uploaded. No attached media or unrelated object was touched.

Browser file selection after the permission change, station/report image flows, persistence and the browser Content-Length/signature gate remain unverified. Prior successful offline/PostgreSQL/Node-S3 evidence is retained without rerunning it. S3.1 completion and checkpoint readiness remain blocked. No staging, commit, push, protocol/security-policy change or deployment occurred.

## Browser resume results: 2026-09-24 after source-login refresh

This is the latest result, superseding the expired-login/file-selection blockers above. All original S3.1 changes remain uncommitted. No application code, dependencies, migration, IAM, CORS, encryption or upload protocol was changed. Only this runbook and ignored verification artifacts changed. Existing successful tests/probes were reused, not rerun.

### Restricted activation and real browser flow

The application's exact `restrictedCredentials(mediaConfig())()` provider resolved temporary credentials through `fromIni` for **`ray-s3-dev`**. Both its internal check and a further `STSClient` using that same credential object passed `assertMediaIdentity`, returning account `438298964276` and `arn:aws:sts::438298964276:assumed-role/RayMediaDevRole/ray-local`. No broad-role fallback was used. The existing guarded preview database was started without schema changes. Startup passed the existing database/migration checks; `/readyz` returned `ready:true`, and capabilities returned `enabled:true`, `maxBytes:8388608`, station limit 1 and report limit 3.

Chrome reconnected to the same extension/profile. The station file chooser succeeded on the single resumed attempt: the actual production form showed the existing 285-byte synthetic JPEG and a decoded 64x48 local preview. The file-selection tool call took approximately 65 seconds but completed successfully; no application security setting was changed. A second chooser selected the existing 203-byte synthetic PNG for a General report. There were exactly two browser submit actions with images, no manual retry and no CLI substitute for either creation workflow.

| Real-browser check | Observed result |
| --- | --- |
| Station raw JPEG upload, complete and attach | PASS: UI creation success; SQL ready asset owned by synthetic A and attached to station |
| Station detail image | PASS: visible blue synthetic pixels; `complete:true`, natural dimensions 64x48; stable API content src |
| Report PNG upload, complete and attach | PASS: report appeared on map; SQL ready asset owned by A and attached to report |
| Report image | PASS: visible blue synthetic pixels; `complete:true`, natural dimensions 64x48 |
| Browser refresh | PASS: both retained images subsequently decoded at 64x48 |
| API restart | PASS: stopped only owned API PID 33144, restarted as PID 23072; both images decoded after browser reload |
| Exact persistence | PASS: station/report API snapshot JSON was identical before and after restart, including IDs, content references and timestamps |
| Guest public visibility | PASS: after real UI logout, both public attached images decoded at 64x48; guest upload input disabled |
| Duplicate attachment (real local API) | PASS: both station and report asset reuse returned 409; no duplicate parent created |

Both sources normalized to **80-byte WebP outputs**. SQL ownership confirmed the browser session was existing synthetic A (`a9e9df75622bc49b142a7ce8`). Neither API snapshots nor rendered `img.src` values contain signed URLs; they use stable `/api/media/<asset>/content` references. Raw signed URL values were not logged or written by these checks.

Retained examples:

| Resource | Public ID | Asset ID | Retained source/output bytes |
| --- | --- | --- | --- |
| `SYNTHETIC S3.1 24d3e4dd station` | `eee740956e602ae20f2c93f0` | `265e189a-1cd5-41a7-90be-7c4a076c66a4` | 285 / 80 |
| `SYNTHETIC S3.1 24d3e4dd report: image verification only; no real incident or request for help.` | `5df902687f4af7cd07f31577` | `2ec21dfc-5b70-4877-a882-faf413bb5255` | 203 / 80 |

Their exact keys are `incoming/<asset ID>` and `ready/<asset ID>.webp` under the original `dev/test-runs/24d3e4dd-ddb9-4627-8eaf-662c3cb02a6a/` prefix. All four attached source/output objects are retained. Exact assets, parents, owners and expiries are in ignored `server/dist/s3-activation/assets.json` and `records.json`. Do not clean them as orphans.

### Read expiry and Content-Length evidence boundary

A separate **Node HTTP read-only check**, clearly distinct from browser uploads, held one station signed URL only in memory. Its actual expiry was `2026-09-24T06:31:37.000Z`. After expiry it returned **403 `AccessDenied`**. Requesting the stable content endpoint returned **302**, `Cache-Control:no-store`, and a **different signed URL**; its S3 GET returned **200** and decoded as a 64x48 WebP. Subsequent real browser reload/reopen after API restart also decoded both images. Thus fresh URL issuance after expiry is verified by the HTTP tier, with real browser display separately verified. No signed-URL-expiry error/retry interaction was forced inside the browser, and browser caching was not bypassed.

The first expiry-check attempt was blocked by sandbox `connect EACCES` on two connection addresses before an S3 response. It was retried once outside the sandbox and passed. Its signed URLs remained in memory; only sanitized status/code/dimensions were written to `read-expiry-results.json`. There was no retry-until-green loop.

Actual Chrome uploads succeeded using the unchanged production `uploadImages` implementation: a raw File, no manually supplied Content-Length, existing checksum/SSE/expected-owner/If-None-Match headers, and `credentials:'omit'`. The unchanged server presigner requires `content-length` in SignedHeaders. Combined with the prior real-S3 incorrect-length **403 `SignatureDoesNotMatch`** result, successful Chrome upload is evidence that these browser-generated request lengths were compatible with the signature. This is **an inference from actual acceptance plus inspected signing/client code**, not merely an SDK PUT or a later HEAD-length check.

However, the browser tool exposes no network-capture API. Actual OPTIONS status, wire Content-Length values, browser PUT status codes, the emitted SignedHeaders query and absence of Authorization/cookies on the wire were **not directly captured**. No raw HAR/NetLog was created, no browser debugging/security configuration was changed, and no missing CORS header was observed. **The user's full wire-level Content-Length/preflight completion gate remains open.** Do not label this as a completed header audit. The remaining concrete requirement is a local DevTools capture of one bounded production upload, sanitized to method/status/header names and body/Content-Length values; keep full URLs local and ignored. Account for that future upload against the same cumulative limits. A protocol or policy change is not justified by this tooling limitation.

Remaining original live cases: same-length checksum-mismatched payload (`BadDigest` rather than signed-header tampering), corrupt-image completion, ready-but-unattached visibility and cross-user completion/attachment of such a ready asset. These were not silently promoted from offline test coverage. Prior guest/pending/cross-user/invalid-size API checks and Node replay/signature/unsigned-access evidence remain valid. Broader parent visibility states and browser explicit-retry/no-loop behavior are not fully certified.

### Cumulative budget and cleanup reconciliation

The existing ledger was loaded across API restarts. Its local ignored wrapper was adjusted so `--cleanup` also loads that same ledger instead of initializing a new one; product code and the existing live test stayed unchanged. No successful upload probe was repeated.

| Cumulative measure across all sessions | Result |
| --- | --- |
| Instrumented Node S3 requests in `ledger.json` | 21 = prior 12 + two normalization flows (6) + exact probe DELETEs (3) |
| Additional measured read-expiry S3 requests | 2 |
| Total measured Node S3 requests | **23** |
| Browser uploads | Two submit actions, 285 + 203 = **488 body bytes**; exact browser wire request count unavailable |
| Instrumented Node PUT-body upper bound | 1,340 bytes = previous 1,180 + two 80-byte outputs |
| Recorded submitted PUT bodies, including prior deliberate failures | **1,828 bytes**; excludes unobserved browser transport retransmission |
| Conservative planning charge | **65 attempts** = 23 measured Node + 2 blocked-connection reserve + 40 browser-attempt reserve; **12,740 bytes** = 1,340 + 40 x 285 |
| Lifetime exact reserved keys | **9**, including cleaned/rejected/unuploaded keys; budget is not reclaimed by deletion |
| Successful objects ever stored / currently retained | 6 / 4 attached objects |

The 40 browser attempts and their byte allowance are conservative **planning reserves, not observed wire counts or a certified bound on browser transport retries**. There were no repeated browser submit actions or explicit image retries. The limited manual actions stayed within the planned workload, far below the 200-attempt/32-MiB/20-key limits on recorded activity, but an exact all-transport request total cannot be certified without browser capture. `cumulative-budget.json` preserves this distinction. No exact remaining request allowance is claimed. Reconcile the same cumulative ledger before any separately authorized future work; do not reset the original limits.

Cleanup checked actual time, not relative wording: the original manifest expiry `2026-09-23T14:49:09.775Z` had passed by `2026-09-24T06:31:42.897Z`. While the owned API was stopped for its restart test, the existing `server/tests/live/s3.mjs --cleanup` path rechecked the guarded preview DB and absence of references, then deleted **only the original manifest's three probe keys**. All three DELETEs returned **204**. That removes the two stored probe objects and the reserved rejected-upload key. `probe-cleanup-result.json` records completion; **do not repeat probe cleanup**. Attached station/report keys were not in that manifest.

The original pending/unuploaded asset `4d38e7c4-82d1-48ad-a47b-5c65e75ebd8d` remains unchanged. At `2026-09-24T06:33:19.459Z`, the guarded orphan dry run returned `[]`; its eligibility threshold is still `2026-09-24T15:40:15.130Z`. No lease/expiry guard was bypassed. The earlier exact-prefix-filtered orphan cleanup commands remain applicable later, with rechecking; they must never include attached assets.

### Closeout, startup and validation

The original preview startup commands above remain valid with the same namespace and synthetic A credentials. Open `http://127.0.0.1:5175/map-page` to find the retained station and General report after starting the controlled preview. Session-local configuration remains in ignored `server/dist/s3-activation/env.ps1`. The Node instrumentation wrapper is optional; a future audit must still maintain cumulative accounting.

Because the strict wire-header gate remains incomplete, the S3-enabled listener was stopped at closeout. Only owned API PID **23072**, frontend PID **15216**, and the preview DB service started for this session were stopped. The test service was not restarted. Persistent preview data/volume and all four attached S3 objects remain intact. No owned process remains running.

No product fix was needed for these successful workflows. Two post-refresh locator-evaluation calls timed out after 3 seconds despite visible images; direct read-only DOM inspection recovered and verified decoding without another upload or page reload. An initial image observation immediately after opening details returned loading dimensions 0x0; a subsequent settled observation confirmed 64x48. These are recorded as intermediate observations, not failed uploads. The report form also showed its sign-in explanatory text while authenticated, though upload was enabled and succeeded; this copy issue was left unchanged.

The previous backend 189/189, PostgreSQL 122/122, frontend 37/37 and normal/preview build passes remain the validation baseline because no product code changed. Tracked/new-file whitespace checks were rerun for this documentation update. No test, dependency, auth/signing/size/checksum/conditional-write protection or assertion was changed. No staging, commit, push, merge or deployment occurred. **Functional browser image flows pass and are ready to record in a development checkpoint. Full S3.1 security acceptance still awaits the wire audit and named remaining checks in the closeout matrix. Public deployment is separately not ready.**
