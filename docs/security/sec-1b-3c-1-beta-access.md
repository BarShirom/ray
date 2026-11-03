# SEC.1B-3C.1 — Authenticated station access for beta

Evidence date: **2026-11-03, Asia/Jerusalem**. This report describes the uncommitted
implementation on `ray-2-postgres`, based on and still at HEAD
`6b0e9550735c5945c9187023ac4791f4bb5ab996`
(`docs: simplify station visibility policy for beta`). Preflight tree/index were
clean; locally recorded `origin/ray-2-postgres` was **0 ahead / 0 behind**, without
fetch. SEC.1B-3B.2 is committed at `ea63a0ddf02cb3cb2f146ddd65685a4279ba953b`.
The approved policy documents were committed at HEAD; their independent policy
review returned **APPROVE**, with no blocking findings. That review is not a review
of this implementation. **A separate independent critical read-only implementation
review is still required before Git approval.**

Scope: backend policy, HTTP DTO/input changes and regressions, plus this report
and [readiness](../RELEASE_READINESS.md). No client, schema, migration, dependency,
cloud configuration or persistent preview changes. No staging, commit, push,
merge, deployment, AWS or Cloudinary operation occurred.

## Approved policy and actual implementation

The product authority is [design section 17](station-visibility-design.md#17-sec1b-3c0-approved-first-beta-policy-and-implementation-plan).
Its NOT_IMPLEMENTED statements describe the documentation-only stage; current
backend evidence is below. Historical sensitive/regular and invitation/grant
decisions remain **SUPERSEDED FOR BETA**, not erased or implemented as workflows.

| Boundary | Implemented behavior |
| --- | --- |
| Guest | No station discovery/detail/coordinates, feeding reads/writes or station image capability. No public fallback. |
| Current authenticated stored account | View every station across historical classifications and grant states, including inactive stations, precise coordinates and permitted station instructions/images. JWT role/profession claims confer no additional authority. |
| Feeding | Every current authenticated account can feed any active station. Inactive parent remains viewable but returns 409 on feeding creation, before INSERT. |
| Management | Current account plus immutable creator only. The existing helper and caller-relative `canManage` are retained; no management endpoint is introduced. Grants confer no management right. |
| Shared feeding | Independent food/water recency buckets only: `under-2h`, `2-to-6h`, `6-to-12h`, `12-to-24h`, `older`, `no-record`. No other-feeder identity, individual exact timestamp, private note or raw history. `no-record` means no feeding recorded in Ray, not proof cats were unfed. |
| Own history | SQL-filtered to the current author after parent authorization, including inactive parents. Authors retain their own permitted exact log fields; creators cannot read other authors' logs through this endpoint. Dormant grant revocation does not revoke beta access. Stored logs remain preserved. |
| Media/Reports | Private S3 and authoritative ready-attached station parent required for station capabilities. Separate Report audience and transitions unchanged. No private provider phone fields, professional roles or municipal integration added. |

Production changes are deliberately centralized:

- [stationAuthorization.ts](../../server/feedingStations/stationAuthorization.ts):
  transaction-bound view predicate now requires only the current stored account;
  management additionally requires creator ownership. Neither consults visibility
  nor grants. Opaque principal/transaction binding, READ COMMITTED validation,
  station-first locking and fresh authorization after a lock wait remain.
- [postgresStationPrivacyStore.ts](../../server/feedingStations/postgresStationPrivacyStore.ts):
  discovery/detail/create projections omit `visibility`; discovery includes
  `active` and existing caller-relative permissions. Collection rows and cursor
  anchors share the all-station authenticated SQL scope, including inactive rows.
  Bounded ordering/paging, own-author filtering, post-lock summary time and
  transactional activity/feed admission are retained.
- [stationPrivacyStore.ts](../../server/feedingStations/stationPrivacyStore.ts):
  protected types match those DTOs; HTTP creation excludes dormant `visibility`
  and external `image` fields while retaining supported `imageAssetId`.
- [feedingStationController.ts](../../server/controllers/feedingStationController.ts):
  stops forwarding visibility; creator still comes from verified identity in the
  protected store, never body ownership.
- [feedingStationSchemas.ts](../../server/validation/feedingStationSchemas.ts):
  explicit `visibility` rejects with bounded 400 instead of promising a smaller
  audience. The inherited media creation schema applies the same contract.
  Omission uses unchanged internal storage defaults. Food/water rules unchanged.

## Schema, media and rollout preservation

**No migration is needed.** Migration `0007_station_visibility`, all earlier SQL,
snapshots/journal, schema defaults/CHECK/FKs/indexes and internal metadata adapters
remain unchanged. Classifications and grant rows are dormant, not deleted,
relabelled or backfilled. New internal default `sensitive` is metadata only and
does not limit beta audience. Real-PG migration/preservation regressions still run;
all tracked migration artifacts are compared with HEAD in final validation.

The unchanged [media service](../../server/media/service.ts) uses the shared helper
for both initial authorization and final revalidation. It derives the station
from the stored asset FK, verifies ready/purpose/attachment/output identity,
signs outside the SQL transaction, then rechecks parent/current account and
attachment under a short station lock before releasing a capability. Guests and
pending/ready-unattached requests do not invoke the signer. Inactive parents are
readable. Stored grant/classification changes no longer invalidate a beta read;
lost current-account or attachment validity still causes the signed result to
be discarded. Signer latency/lock waits cannot extend the conservative 60-second
receipt. Upload ownership, atomic attachment, normalization, leases, size limits
and durable per-owner issuance budgets are unchanged.

New arbitrary external station image URLs still reject; old external strings
are suppressed by protected projections without rewriting records. Report image
policy remains independent and unresolved where noted in readiness. No new
server-generated Report reference or access bypass is introduced. Manual copying,
co-located public reports, cached/saved images and previously issued signed URLs
remain residual risks; issued capabilities retain their original expiry and
cannot be immediately revoked by logout or this policy change.

JSON, feeding and **both** station media issuers now consume the same policy in
one backend build, including media-enabled and disabled PG compositions. Do not
expose a mixture of old/new backend instances or deploy with an unadapted client.
Complete the client security/DTO work and browser acceptance before cutover.
On failure keep station access unavailable for forward repair; do not restore
the old public Mongo readers or a public media fallback. Retained schema supports
this change without a data rewrite; rollback is not permission to deploy an
incoherent audience or restore public access. Persistent preview records and
media were not queried, migrated, rewritten or deleted.

## Protected endpoint matrix

Paths below have `/api` prefix. Authenticated means a valid verified identity
which still resolves to a stored account. Existing request limits/errors apply.

| Endpoint | Current result |
| --- | --- |
| `GET/HEAD /feeding-stations` | Guest 401; authenticated all-station array, including inactive; `active`, `canFeed` and caller-relative `canManage`, no visibility/creator/contact/time fields. Limit default 100/max 200; only `limit`/`after` accepted, no fabricated total count. SQL descending stored time/UUID and `X-Next-Cursor`; unknown cursor 400. |
| `GET/HEAD /feeding-stations/:id` | Guest 401; any current account sees existing active/inactive parent; malformed ID 400 after auth, missing parent generic 404. Detail adds permitted instructions and authoritative image reference only. |
| `POST /feeding-stations` | Auth required; server creator, existing validation and media attachment transaction. Any explicit JSON `visibility` value 400; omitted value succeeds with unchanged dormant default. External image URLs rejected. |
| `POST /feeding-stations/:id/feedings` | Guest 401; current account/parent/active check under retained shared station lock through INSERT. Missing parent 404, inactive 409 with no new log; author derived from principal. |
| `GET/HEAD /feeding-stations/:id/feedings` | Guest 401; parent authorized then SQL author filter; bounded own-log array (default 50/max 100) and cursor header. Other authors' cursor is invalid, not a history bypass. |
| `GET/HEAD /feeding-stations/:id/feeding-summary` | Guest 401; all current accounts see only independent food/water buckets; excludes future events and uses a post-lock reference instant, never serialized. |
| Unsupported station children/methods | Router-wide auth before lookup, then generic 404 for authenticated unsupported requests; no new management/grant route. |
| `GET/HEAD /media/:assetId/content` | Ready attached station asset: guest uniform 404/no signer; authenticated parent viewer 302 only after both checks. Invalid supplied credentials 401. Report content retains independent existing behavior. |
| `POST /media/:assetId/read-url` | Required auth (guest 401), empty request only, ready authoritative station asset; returns short-lived receipt after both checks. Report asset rejected here. Invalid UUID 400; unavailable/unattached/denied asset generic 404. |
| Upload/complete/capabilities | Existing upload-owner, purpose, size, expiry, budget and attachment constraints unchanged. Public capabilities expose configuration limits only, no station data. |
| Legacy Mongo station/feed and station-access namespaces | All methods/children refused with fixed 503 before parser/auth/storage; earlier CORS preflight may return 204. No second Mongo authorization implementation. Unrelated legacy auth/Report behavior unchanged. |

Station and media responses retain `private, no-store`, `no-referrer`, no ETag/
conditional 304. Implicit HEAD applies the same authorization without a body.

## Verification evidence

**VERIFIED / PASS**, 2026-11-03, local uncommitted tree at the baseline above.
No registry access, live storage calls, production service or persistent preview
was used. Installed dependencies were reused. Ordinary signing/storage cases use
doubles; PG suites exercise actual SQL, transactions and HTTP apps against the
guarded disposable PostgreSQL service, with storage/signing doubles.

The following child-shell preamble isolated backend/build checks from provider and
persistent database settings; no dotenv or credential file was loaded:

```powershell
$ErrorActionPreference = 'Stop'
Get-ChildItem Env: | Where-Object { $_.Name -like 'AWS_*' -or $_.Name -like 'RAY_MEDIA_*' -or $_.Name -like 'CLOUDINARY_*' -or $_.Name -in @('RAY_PREVIEW_DATABASE_URL','RAY_LOCAL_DATABASE_URL','RAY_TEST_DATABASE_URL','RAY_PREVIEW_JWT_SECRET','DATABASE_URL','MONGO_URI','MONGODB_URI') } | ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$env:RAY_MEDIA_MODE = 'disabled'
$env:AWS_EC2_METADATA_DISABLED = 'true'
$env:AWS_CONFIG_FILE = Join-Path $env:TEMP 'ray-sec1b3b1-aws-config-not-created'
$env:AWS_SHARED_CREDENTIALS_FILE = Join-Path $env:TEMP 'ray-sec1b3b1-aws-credentials-not-created'
if ((Test-Path -LiteralPath $env:AWS_CONFIG_FILE) -or (Test-Path -LiteralPath $env:AWS_SHARED_CREDENTIALS_FILE)) { throw 'Offline AWS paths must not exist' }
```

| Exact command / method | Actual result and tier |
| --- | --- |
| `npm.cmd run build --prefix server` | PASS; backend TypeScript build. |
| `node --test --test-concurrency=1 server/tests/*.test.mjs` | **252/252 PASS**, 0 failed/skipped; ordinary offline contracts, actual-app error/abuse, retired routes, media/security and policy-shape regressions. |
| `$env:RAY_TEST_DATABASE_URL='postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'` then `node --test --test-concurrency=1 server/tests/integration/*.test.mjs` | **172/172 PASS**, 0 failed/skipped; actual disposable PostgreSQL and synthetic HTTP. URL is the checked-in disposable test identity, never a persistent/cloud credential. |
| `node --test client/tests/*.test.cjs` | **94/94 PASS**, 0 failed/skipped; existing Node/fixture/client callback/store tests, not browser acceptance. Expected Node redux-persist noop-storage notice. |
| `npm.cmd run build --prefix client` | PASS; TypeScript + normal Vite build, 263 modules, main chunk 579.46 kB. |
| `npm.cmd run build:postgres --prefix client` | PASS; TypeScript + PG-mode Vite build, 263 modules, main chunk 582.03 kB. Both builds retain >500-kB chunk warnings. |
| `client/node_modules/.bin/eslint.cmd --config client/eslint.config.js server/feedingStations/stationAuthorization.ts server/feedingStations/stationPrivacyStore.ts server/feedingStations/postgresStationPrivacyStore.ts server/controllers/feedingStationController.ts server/validation/feedingStationSchemas.ts` | PASS; all five changed production TypeScript files. |
| `node --check <path>` for each of the 11 changed `.mjs` files | PASS. Installed ESLint Node API also checked all 11 with in-memory `@eslint/js` recommended/Node globals and `no-unused-vars` underscore-parameter exemption: 0 errors/warnings. No config/dependency change. First strict recommended pass flagged the unchanged Express error handler `_next`, retained for four-argument arity; source was not changed to silence it. |
| `git diff --check`; explicit UTF-8/BOM/trailing-whitespace/final-newline checks; local Markdown links/anchors/fences/tables; `git hash-object --path=<path> <path>` versus `HEAD:<path>` for tracked migrations; selected credential/signed-capability patterns | PASS: both changed documents, 49 local references, seven tables, balanced fences; all 17 migration artifacts match HEAD after normal Git filters. Changed-file screening found no selected credential/signed-URL pattern. No full-history or deployed-secret audit claimed. |

Disposable lifecycle: inspected Compose labels, loopback port 55433, no mounts and
`/var/lib/postgresql` tmpfs. Started the previously stopped test service with
`docker compose -f compose.postgres.yml --profile test up -d --wait --pull never test-db`.
Tests guard exact target/account, identity and suite advisory lock, refuse existing
Ray objects, and clean only their synthetic suite-owned objects. Stopped only that
service with `docker compose -f compose.postgres.yml --profile test stop test-db`.
Final Compose inspection confirms test stopped, dev still stopped six weeks and
preview still stopped nine days. Docker Desktop was already running and retained.
See the existing [PostgreSQL foundation](../migrations/postgres-local-foundation.md) and
[S3 acceptance ledger](../migrations/s3-media.md#remaining-release-gates); no runbook
provider procedure was executed.

### Regression coverage and obsolete assertions

- All current account types see identical station IDs across formerly sensitive/
  regular/inactive fixtures, independent of valid/revoked/wrong-grantor grants.
  Null/unsupported metadata is tested in guarded synthetic corruption fixtures
  (rolled back in helper tests; restored in HTTP tests); production constraints
  remain unchanged. Invalid/deleted identities, expired credentials and forged/
  wrong-transaction principals remain denied. Management stays creator-only.
- Guest/invalid-token list/detail/nested/HEAD/unsupported paths, private headers,
  bounded queries, unknown parents and both plain/media creation rejection are
  covered. Explicit visibility variants reject before store invocation and create
  no parents; independent attachment rollback regressions remain. Retained
  internal adapter/migration cases still verify historical classification storage.
- Exact stored-millisecond station/log pagination and tie ordering from R-01 remain.
  No count or unsupported filter was added; rows and anchors include inactive
  stations under the same scope. Own-author history, optional note/period presence,
  independent food/water buckets and future-event exclusion remain tested.
- Independent backend PID/lock observations prove metadata commit/rollback has no
  beta audience effect; activity commit rejects waiting feeding without INSERT,
  rollback admits it, and admitted feeding retains its lock until INSERT/commit
  before an inactivation writer can proceed. Fresh post-lock reads remain verified.
- Actual paused signer and final lock-wait cases recheck fresh account/attachment;
  invalidated capability results are discarded. Guest/pending/unattached rejection
  keeps zero signer calls. Metadata-only changes allow reads under beta; expiry
  tests, HEAD, read-url, Report policy, upload lifecycle/budgets and legacy zero
  provider/storage regressions remain.

Only old hybrid audience/active-list and visibility DTO/input assertions were
replaced where the approved beta policy makes them obsolete. Author privacy,
invalid principals, storage preservation, lock/rollback evidence and signer
rejection guarantees were retained rather than weakened.

## Compatibility, release gates and handoff

No frontend file changed. Existing station/history thunks still omit Bearer reads,
expect old DTO fields and do not integrate the protected detail/summary/paging
contract. Passing client tests/builds does not establish working authenticated
station UX or privacy acceptance. Auth-generation/login/register/session fencing,
cross-tab synchronization/persistence, typed bounded API failures (401/404/429/
network with session/request identity), account-scoped Redux/component/media
cleanup and actual map center/zoom/bounds/fit/picker/overlay cleanup remain planned.
REV-01 through REV-04 remain mandatory; this batch does not claim them completed.

Continue with the design's 3C.3 client foundation/integration, then 3C.4 actual
synthetic browser acceptance: overlapping auth completions, delayed logout/account
responses, two tabs/BFCache, neutral map repaint, authenticated-image wire/CORS/
render/cleanup, Hebrew RTL, keyboard/reader and 320/390px. Preserve permitted drafts
and confirmed feeding receipts on recoverable failures; stale callbacks cannot
restore protected data. Do not infer these properties from the current unit suite.

| Gate assessment | Current status / next action |
| --- | --- |
| QG-01/03/04/11/12 affected backend logic | **VERIFIED / PASS** at Level A using source/offline/real disposable PG: beta authorization, input/DTO bounds, own-author privacy, safe errors and transactional/media relationships. Does not establish client isolation or deployed controls. |
| QG-07/09/10/14 local artifact/scope | **VERIFIED** builds, targeted static/document checks and local-only operations. Bundle warning retained. No schema/dependency/config change. Deployment, full secret history and production behavior not verified. |
| Post-implementation independent critical review | **NOT_TESTED / pending**; separate read-only review required before Git approval, then fix/revalidate confirmed findings. Internal parallel implementation QA is not that review. |
| Frontend compatibility/security and browser media | **NOT_TESTED** for beta end-to-end acceptance; source confirms known gaps above. Blocks coherent station exposure. |
| Real-user enrollment/location safety | **UNKNOWN** operating safeguards; malicious registered accounts can access every exact location, including former sensitive rows. Registration establishes an account, not trust. Local rate limits do not solve multi-account/distributed abuse, moderation or incident response. |
| Other Level C/D blockers | Remain in [readiness](../RELEASE_READINESS.md): password/session policy, personal-data access/deletion/retention/takedown, external Report image policy, qualified notices/privacy/accessibility/welfare review, S3/browser/live-provider gaps, dependencies, distributed budgets, production configuration/TLS, backup/restore/recovery, monitoring and incident ownership. No new approval inferred. |
| Unchanged/unimplemented domains | Professional/municipal workflows, station-note editing and invitation/grant management **NOT_APPLICABLE to this implementation**. Historical lifecycle/reuse proposals remain dormant, not finalized. General audit logging/retention remains unresolved. |

Local implementation QA is complete; **not ready for real-user release or
deployment**. The next approval is the separately requested independent read-only
review, followed by fixes/revalidation and explicit Git authorization. The reviewed
staging plan is supplied in the handoff only; it has not been executed.

Changed-file inventory: five production TypeScript files linked above; five
ordinary test/helper files (`abuseRoutes.test.mjs`, `feedingStations.contract.test.mjs`,
`helpers/contracts.mjs`, `stationAuthorization.test.mjs`, `validationBounds.test.mjs`)
under `server/tests`; six integration files (`postgresFeeding.test.mjs`,
`postgresMedia.test.mjs`, `postgresPreview.test.mjs`, `postgresReports.test.mjs`,
`postgresStationAuthorization.test.mjs`, `postgresStationPrivacy.test.mjs`) under
`server/tests/integration`; this new report and `docs/RELEASE_READINESS.md`.
Total **18 paths**, with no frontend file changed. Index remains empty and HEAD/
local upstream relationship remains unchanged. No unrelated changes were present
at preflight or introduced during this batch.
