# SEC.1B-3B.2 - PostgreSQL station, feeding and media privacy

Date: **2026-11-03, Asia/Jerusalem**. Intended level: **A, local development**.
Implementation and integrated QA record. The separate independent critical
read-only review returned **APPROVE WITH CHANGES**; its two Low findings and
follow-up verification are recorded below. Explicit Git approval remains required.
No deployment approval.

## Baseline and scope

Preflight: `ray-2-postgres`, HEAD
`165f9127fc5159ff2c89f4251be03896e655d0e5`, clean working tree and index;
locally recorded upstream **0 ahead / 0 behind**, without fetching. The committed
[3B.1 foundation](sec-1b-3b-1-foundation.md), migration 0007 and production
[authorization helper](../../server/feedingStations/stationAuthorization.ts) were
present. Root AGENTS and the [quality gate](../RELEASE_QUALITY_GATE.md) apply;
no nested AGENTS were found. No unrelated starting changes required preservation.

This batch integrates protected PostgreSQL JSON, feeding and media reads, plus
legacy refusal, as one security unit. It adds no schema, dependency, cloud
configuration, invitation/grant-management API, role or station-note editor.
All eight migration SQL files, snapshots and journal remain unchanged from HEAD.
Persistent preview records and attached objects were not queried or modified.

## Approved product policy and contract decisions

[PD-01 through PD-09](station-visibility-design.md#14-decisions-assumptions-and-remaining-risks)
remain authoritative. New and pre-existing stations default to sensitive; deliberate
regular creation is allowed. Every authenticated account may discover/view/feed
an **active regular** station. Sensitive viewing/feeding requires creator ownership
or an active explicit grant issued by that creator. Creator-only administration
does not become available to a regular viewer, grantee or claimed professional.
Guests cannot view/feed stations or obtain station image capabilities.

The task explicitly approves regular feeding (C-04). The product owner's additional
reply approves the section 16.3 feeding contract (C-03): shared food/water recency
buckets, separate author-only logs, and current station access for station-scoped
own history. Sensitive revocation returns 404 even for the author's old station
history; stored logs are preserved. This does not approve unspecified reference
lifecycle, audit retention, client freshness or operating decisions.

The owner's follow-up explicitly confirms that shared buckets disclose no feeder
identities, exact individual timestamps or private notes. `no-record` describes
the absence of a qualifying food/water record in Ray, never evidence that the cats
were not fed. Revocation blocks station-scoped own history without deleting stored
records. Future personal-data access/deletion processes remain a separate
release-readiness requirement; this contract neither implements nor waives them.
These clarifications match the existing implementation; this follow-up changes
documentation only and does not rerun or relabel the application evidence below.

## Reachable endpoint matrix

Paths include `/api`. Preview composition uses only the protected
[privacy store](../../server/feedingStations/postgresStationPrivacyStore.ts), not
the historical actor-free adapters. All station descendants authenticate before
route dispatch, including HEAD and unsupported methods. Existing global parsing
and ingress admission may reject first; those failures also carry private headers.

| Endpoint / method | Effective policy and result |
| --- | --- |
| `GET /feeding-stations` (also HEAD) | Required auth; SQL filters active, validly classified regular/owned/granted stations before ordering/limit. No hidden totals. Default 100, maximum 200; `after` must identify an accessible active anchor or returns generic 400. Array response; optional `X-Next-Cursor`. |
| `GET /feeding-stations/:id` (also HEAD) | Required auth; shared station lock and fresh view policy; authorized inactive detail remains visible. Missing/inaccessible IDs share the same 404. |
| `POST /feeding-stations` | Required auth/account write limit; server derives creator. Visibility defaults sensitive. External `image` input rejected in both PG modes. Media-enabled attachment and parent creation share one transaction; media-disabled asset attachment is 503. |
| `GET /feeding-stations/:id/feedings` (also HEAD) | Required current parent access; SQL filters caller's own logs only. Default 50, maximum 100; author/parent-scoped cursor and array response with optional next header. |
| `POST /feeding-stations/:id/feedings` | Required auth/account write limit; same live transaction resolves principal, takes station shared lock, rechecks policy, checks active, then inserts caller-derived log. Inactive authorized parent is 409; denied parent is 404 before active disclosure. |
| `GET /feeding-stations/:id/feeding-summary` (also HEAD) | Required current parent access and shared lock; independent food/water aggregates as of one post-lock server instant, excluding future events. No individual events or precise times. |
| Other station methods/children | Guest 401; authenticated generic 404 without target lookup or mutation. Unsupported filters/search/query fields are bounded 400, not hidden-data search surfaces. |
| `POST /media/:assetId/read-url` | Required auth; strict empty `{}`/no query; station-only authoritative parent check, returns `{url,expiresIn:60}`. Report-parent assets return 404. |
| `GET /media/:assetId/content` (also HEAD) | Missing credential permitted only for existing Report-media policy; any supplied invalid credential is 401 before lookup. Station parents require creator/grantee/regular-viewer authorization; generic image 404 on denial. Authorized redirect uses the same final-check helper as read-url. Only optional `retry=1` query accepted. |
| Existing media uploads/completion/capabilities | Owner-based issuance/completion, normalization, durable budgets, leases and attachment checks retained; completion uses empty `{}`/no query. No station read bypass for pending, processing, ready-unattached or uploader-owned attached assets. Capabilities disclose service availability/limits only. |
| `/station-access` and descendants in preview | Fixed 503; invitation/grant-management operations are not implemented. |
| `/feeding-stations` and `/station-access`, all descendants/methods in legacy/default composition | Fixed 503 `{message:"Station service unavailable"}` before parser, auth, Mongo or provider access. Existing CORS preflight may answer 204 earlier. No public fallback. |

Canonical 24-hex station IDs retain uppercase normalization; malformed IDs are
bounded 400. Asset IDs remain UUIDs. Authentication lookup outages propagate safe
500 rather than false 401; invalid/deleted identities remain 401. No Hebrew text
matching makes a security decision. Existing applicable limits preserve 429 and
positive `Retry-After` without reaching protected work.

## JSON projections and compatibility

Explicit DTOs are defined in
[stationPrivacyStore.ts](../../server/feedingStations/stationPrivacyStore.ts).

| Representation | Allowed fields |
| --- | --- |
| Discovery | `_id`, `name`, exact `location:{lat,lng}`, `estimatedCats`, `estimatedKittens`, `visibility`, caller-relative `permissions:{canManage,canFeed}`. No creator, grants, notes, image, timestamps or version. |
| Detail/create receipt | Discovery plus `active`, presence-preserved `notes`, and optional stable image reference for the actual ready attached station asset. Stored arbitrary image strings are omitted without rewriting them. |
| Own log/create receipt | `_id`, `stationId`, `fedAt`, `food`, `water`, presence-preserved `period`/`note`, `createdAt`, `updatedAt`. No user ID, identity/name or version. Creator receives no other-author history. |
| Shared summary | Exactly `{food:{recency},water:{recency}}`; each bucket is `under-2h`, `2-to-6h`, `6-to-12h`, `12-to-24h`, `older` or `no-record`. Exact boundaries move to the older bucket; neither-action/future events do not establish current recency. |

List and own-history cursors retain SQL-text ordering anchors rather than
round-tripping them through JavaScript Dates. The actual columns use
`timestamp(3)`; checked-in pagination regressions establish millisecond rounding,
ordering and equal-timestamp tie handling, not submillisecond coverage. Existing food,
water, periods, nullable/missing optional fields and ISO-time author receipts are
retained. Historical Mongo/PG adapter fidelity tests remain separate from the new
protected HTTP contract. Geographic station inputs now match PG coordinate bounds.

These are intentional API compatibility changes. Existing station thunks omit
Bearer on reads and use older full-entity types; they can receive 401 or incomplete
presentation until the protected-client batch. Do not weaken the server to make
that old UI appear ready. No station visibility/grant-management UI/API is added.

## Media authorization and client compatibility

The [media service](../../server/media/service.ts) resolves the original
`media_assets.station_id`, ready state, purpose and attachment; it never trusts a
client parent ID, copied stable URL, upload ownership or secondary Report string.
It checks authorization before signing, signs **outside** a transaction, then
opens a short transaction, reacquires the shared station lock and rechecks fresh
policy and attachment before releasing the result. Initial denial signs nothing;
revocation/visibility changes during signing discard the result. A conservative
signing-start receipt rejects capabilities that have aged out while waiting.
Nominal signed-read lifetime remains **60 seconds**.

Protected namespaces set private/no-store, no-referrer and no-cache before parsing,
auth and forwarded error handling; no ETag/conditional 304. Newly signed S3 GETs
override response cache policy to `private, no-store`; future normalized
outputs use it too. Independent Report JSON ETags remain functional. Report content
retains its existing public audience; read-url does not create a second Report
policy. Report external URLs and public text/location remain separate open risks.

[StationMediaImage](../../client/src/components/media/StationMediaImage.tsx) uses
the configured Ray origin and reconstructed UUID endpoint for Bearer-authenticated
read-url requests. It refuses authenticated redirects, then fetches HTTPS image
bytes separately without Ray credentials/cookies/referrer, with no-store, a shared
abortable 60-second bound and streamed 8 MiB cap. WebP/size checks precede display.
Blob/object URLs remain in mounted memory and are disposed on source/identity
change or unmount; local identity checks guard asynchronous completion and render.
Existing Report image rendering remains separate. This narrow component change
does **not** implement auth-attempt or cross-tab fencing.

Previously issued signed URLs can be used directly until expiry; in-flight
transfers, old cached responses and saved/copied images cannot be recalled by
grant updates. Manual copying into public Report text/photos cannot be prevented
semantically. REV-04 covers server-generated responses/references/access checks,
not an impossible immediate revocation guarantee. No objects were removed/rekeyed.

## Transaction and concurrency evidence

Every protected store operation creates its own live READ COMMITTED transaction
and production opaque principal. Authorization decisions do not escape for reuse.
Future grant/visibility writers must take the station **FOR UPDATE first**;
protected detail/history/summary/feed/read issuance take **FOR SHARE**, then query
fresh policy after any wait. The immutable station creator and active valid
creator-issued grant predicate remain centralized in the foundation.

Real disposable-PG tests observe independent backend PIDs and actual lock waits:
revocation commit denies a waiting feeding with no INSERT; rollback admits it;
regular-to-sensitive commit denies a waiting read; rollback admits it. A feeding
already holding the shared lock completes its INSERT before a later revocation,
which waits, then denies later attempts. This is serialization, not retroactive
cancellation of an already admitted operation. Media tests pause signing, observe
the final shared-lock wait against a committed revoke, and verify no capability
is released; visibility changes and expired receipts also discard results.

## Initial implementation verification

The initial implementation evidence below is **2026-11-03**, before the independent
review and its correction follow-up, against the uncommitted tree based on the
HEAD above. Commands run with cloud/provider/database environment variables
removed, nonexistent AWS credential/config paths and EC2 metadata disabled.
Only `RAY_TEST_DATABASE_URL` selected the guarded loopback **ray_test:55433**.
The test container was inspected: tmpfs data, no volume mounts, workspace Compose
labels, loopback port. Only that stopped test service was started and stopped
again after integration tests; persistent preview/dev services remained stopped.
See the existing
[disposable setup](../migrations/postgres-local-foundation.md) for procedures.

| Command / evidence tier | Actual result |
| --- | --- |
| `npm.cmd run build --prefix server` / TypeScript | PASS. |
| `npm.cmd test --prefix server` / offline HTTP, unit and storage doubles | PASS **242/242**, zero failed/skipped, final full run after all production and test corrections. Includes backend TypeScript build. |
| `npm.cmd run test:postgres --prefix server` / real disposable PostgreSQL, mocked storage | PASS **167/167**, zero failed/skipped, after strict completion validation. Includes five observed independent-session endpoint lock cases and media final-lock/signing races. No live S3/Cloudinary. |
| `npm.cmd run build --prefix client` | PASS; main JS 579.46 kB, existing >500 kB warning. |
| `npm.cmd run build:postgres --prefix client` | PASS; main JS 582.03 kB, existing >500 kB warning. |
| `node --test client/tests/*.test.cjs` / offline frontend | PASS **94/94**, zero failed/skipped, including bounded-image regressions. |
| `client/node_modules/.bin/eslint.cmd --config client/eslint.config.js` with explicit changed TS/TSX paths | **20/20 files PASS**. Including `authMiddleware.ts` reports two pre-existing declaration errors (`no-namespace`, `no-explicit-any`), unchanged at HEAD; that file passes with only those two rules disabled by command. No lint/config/dependency change or suppression added to source. |
| `node --check` on explicit changed/new JS test paths | PASS **23 files**, including the new media completion test. |
| `git --no-optional-locks -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --check`; read-only `node -` validator | PASS: all 47 changed/new files checked for UTF-8/whitespace/final LF and selected credential patterns; 165 local links, 44 source line anchors, 17 Markdown anchors and 31 tables valid. All 17 tracked migration SQL/metadata files byte-identical to HEAD; nine approved PD rows and four REV disposition rows unchanged. Command-scoped Git options only; no configuration write. |
| Browser, two-tab, actual Leaflet and live-provider acceptance | NOT_TESTED in this batch. No claim of full frontend privacy acceptance. |

Initial integrated runs found stale test assumptions (guest station rate admission,
new media-router argument, HEAD empty-body parsing and the approved generic 500
envelope); these were corrected without weakening authorization. Source QA also
avoided potential Date-conversion precision loss in cursor anchors and bounded
the station-image stream/lifetime. R-01 below corrects the overstated precision
evidence. The results above describe that implementation stage; they are not
silently replaced by the subsequent review or follow-up execution.

## Independent review and narrow corrections

The separate independent critical security/authorization/privacy review on
**2026-11-03** returned **APPROVE WITH CHANGES**. It found no Critical, High,
Medium or commit-blocking authorization/privacy defect. R-01 and R-02 were Low,
nonblocking corrections, not a real-user release clearance.

The reviewer independently compared 74 backend outputs with an in-memory
TypeScript compilation (zero diagnostics, exact match), reproduced PostgreSQL
**167/167**, frontend **94/94** and sequential backend **242/242**. The initial
parallel backend attempt was **241/242**, with one existing 10-second child-startup
timeout; the unchanged full sequential rerun passed. Additional guarded HTTP/PG
probes checked immediate new feeding summaries, authenticated pending/unattached
media denial with zero signer calls, and attached HEAD authorization. Those probes
were review evidence, not checked-in regressions or browser/live-provider proof.

| Finding / follow-up | Exact correction and evidence boundary |
| --- | --- |
| R-01 Pagination precision | Corrected the fixture comments and this report: `timestamp(3)` rounds supplied fractional inputs to milliseconds. Added explicit stored-value assertions and retained pagination/tie-order coverage. Production pagination logic and schema are unchanged; no submillisecond verification is claimed. |
| R-02 Superseded S3 contract | [S3 runbook](../migrations/s3-media.md#flow-and-contracts) now explicitly distinguishes its historical public station-image behavior from current authenticated station-parent authorization, links the current design/report, and clarifies legacy station/feed refusal. Report policy stays separate. Dated historical browser/S3 evidence is preserved; no new live verification claimed. |
| Material checked-in media regressions | Extended existing PG fixtures to cover authenticated owner/unrelated pending and ready-unattached content GET/HEAD and read-url denial, zero signer calls, authorized attached HEAD and guest HEAD denial. These are real HTTP/PostgreSQL with a storage double, not actual S3. |

Only four files change in this follow-up: this report, the S3 runbook,
`server/tests/integration/postgresStationPrivacy.test.mjs` and
`server/tests/integration/postgresMedia.test.mjs`. The entire existing implementation
is preserved; application code, migrations, dependencies and readiness status do
not change. The cumulative checkpoint now contains 48 files because the runbook
is additionally modified. No new independent-review verdict is inferred from
implementing these corrections.

### Follow-up revalidation, 2026-11-03

The same offline environment isolation and guarded tmpfs **ray_test:55433** apply.
The test container was inspected before start (tmpfs, no mounts, loopback port and
expected workspace labels); persistent preview/dev services remained stopped.
Only the disposable test service was started and stopped for this follow-up;
no AWS/Cloudinary or persistent-preview operations occurred.
Results below are fresh follow-up execution, separate from the retained initial
implementation and independent-review results above. Existing subtests were
extended, so the suite counts remain unchanged despite stronger assertions.

| Exact command / method | Actual result / evidence tier |
| --- | --- |
| `npm.cmd run build --prefix server` | PASS; current backend TypeScript build. |
| `node --test --test-concurrency=1 server/tests/integration/postgresStationPrivacy.test.mjs server/tests/integration/postgresMedia.test.mjs` | PASS **37/37**, zero failed/skipped; real disposable PG and HTTP with storage doubles. Stored station times `.123000`/`.124000`, own-log times `.123000`/`.124000` and `.457000`, exact page/tie order, and new media denial/HEAD assertions executed. |
| `node --test --test-concurrency=1 server/tests/*.test.mjs` | PASS **242/242**, zero failed/skipped; full offline backend suite after the build. Sequential execution avoids the previously observed parallel startup-timeout pressure; no test or timeout was weakened. |
| `node --test --test-concurrency=1 server/tests/integration/*.test.mjs` | PASS **167/167**, zero failed/skipped; full disposable-PG regression suite, including actual independent-session revocation/visibility/feed lock edges and media signing races. |
| `node --test client/tests/*.test.cjs` | PASS **94/94**, zero failed/skipped; rerun for checkpoint revalidation although frontend source is unchanged in this follow-up. |
| `npm.cmd run build --prefix client`; `npm.cmd run build:postgres --prefix client` | Both PASS. Main JS remains 579.46 kB / 582.03 kB respectively; existing >500 kB warnings remain. |
| `node --check server/tests/integration/postgresStationPrivacy.test.mjs`; `node --check server/tests/integration/postgresMedia.test.mjs` | Both PASS. |
| `node -` using installed ESLint API, `@eslint/js` recommended rules and Node globals on the two changed `.mjs` files | PASS **2 files, zero errors/warnings**; in-memory override only, no new configuration/framework/dependency. Initial TS lint limitations above remain historical and unchanged. |
| Read-only `node -` scope/hash, UTF-8, local-link/anchor, formatting and migration-history validator; `git diff --check` | PASS: all **48** cumulative files, including all **13 new** files, pass text/whitespace/final-LF and selected credential-pattern checks; **173** local links, **44** source line anchors, **19** Markdown anchors and **42** tables valid. All **17** migration SQL/metadata files unchanged from HEAD. Hash comparison confirms only the four named follow-up files changed; production source, approved design and readiness are preserved. Exact report status and 48-path staging inventory match Git; index empty. |

Browser, actual
protected-image CORS/render/decoded-node/object-URL cleanup, two-tab/Leaflet and
live-provider verification remain **NOT_TESTED** by this follow-up. Existing
historical evidence does not establish those new behaviors.

## Remaining work and rollout gate

REV-01 auth-attempt/session generation, cross-tab persistence/navigation fencing;
REV-02 actual map center/zoom/bounds/fit/picker/overlay cleanup; and REV-03 typed
bounded thunk rejections/stale handling remain mandatory **3B.5 before 3B.6/7/8**.
Local image token checks do not close them. No current browser privacy evidence.
3B.4 still needs owner management and decisions on reference consent, lifetime,
reuse, acceptance/regrant and grants across classification changes. C-07 audit
durability/access/retention and C-08 residual capability/report/external-image risk
disposition remain open. No unspecified policy was promoted to APPROVED.

QG-01/03/10/11/12 have the bounded local evidence above. QG-02/04/06/09 user-facing
privacy/error/accessibility acceptance remains incomplete. The
[readiness blockers](../RELEASE_READINESS.md) continue to apply: password/session,
Report audience/legacy claim risk, distributed abuse/global media budgets,
dependency risk, retention/takedown, named live S3 gaps, notices/welfare,
production configuration, backup/restore/recovery and operating ownership.

**No real-user pilot/public production readiness. No deployment in this task.**
JSON + media + legacy refusal must ship together within a stopped/restricted
boundary after review; never expose protected JSON with old public media issuance
or legacy station handlers. Persistent preview upgrade remains separately scoped.
Failure keeps the station boundary unavailable and preserves records/media for
forward repair; restoring old public readers is not a recovery option.

No staging, commit, push, merge, migration of preview or cloud operation occurred.
Suggested commit, only after review follow-up and explicit Git
authorization: `feat: enforce station and media privacy in PostgreSQL API`.

## Reviewed file inventory and Git handoff

Final scope: **48 files: 35 modified tracked, 13 new**. The exact short status
below inventories every changed implementation, test and documentation file.
HEAD and local 0/0 tracking remain unchanged; index empty. No unrelated changes.

```text
 M client/src/api/media.ts
 M client/src/components/feedingStationDetails/FeedingStationDetails.tsx
 M client/tests/media.test.cjs
 M docs/RELEASE_READINESS.md
 M docs/migrations/s3-media.md
 M docs/security/station-visibility-design.md
 M server/app.ts
 M server/controllers/feedingLogController.ts
 M server/controllers/feedingStationController.ts
 M server/feedingStations/feedingStationStore.ts
 M server/feedingStations/postgresFeedingStationStore.ts
 M server/media/routes.ts
 M server/media/s3.ts
 M server/media/service.ts
 M server/middleware/authMiddleware.ts
 M server/preview/app.ts
 M server/routes/feedingStationRoutes.ts
 M server/tests/abuseRoutes.test.mjs
 M server/tests/authBoundary.contract.test.mjs
 M server/tests/feedingBoundary.contract.test.mjs
 M server/tests/feedingLog.test.mjs
 M server/tests/feedingStations.contract.test.mjs
 M server/tests/helpers/contracts.mjs
 M server/tests/helpers/parserSurvival.mjs
 M server/tests/integration/authApp.mjs
 M server/tests/integration/postgresFeeding.test.mjs
 M server/tests/integration/postgresMedia.test.mjs
 M server/tests/integration/postgresPreview.test.mjs
 M server/tests/integration/postgresReports.test.mjs
 M server/tests/integration/postgresUsers.test.mjs
 M server/tests/media.test.mjs
 M server/tests/mediaBudgets.test.mjs
 M server/tests/requestParsing.test.mjs
 M server/tests/validationBounds.test.mjs
 M server/validation/feedingStationSchemas.ts
?? client/src/components/media/StationMediaImage.tsx
?? docs/security/sec-1b-3b-2-endpoint-privacy.md
?? server/feedingStations/postgresStationPrivacyStore.ts
?? server/feedingStations/retiredStationRoutes.ts
?? server/feedingStations/stationPrivacyHttp.ts
?? server/feedingStations/stationPrivacyStore.ts
?? server/media/contentUrl.ts
?? server/middleware/privateResponse.ts
?? server/tests/feedingSummary.test.mjs
?? server/tests/integration/postgresStationPrivacy.test.mjs
?? server/tests/legacyStationRetirement.test.mjs
?? server/tests/mediaRoutes.test.mjs
?? server/tests/protectedResponse.test.mjs
```

Reviewed single-line staging commands, **shown only, not executed**. They enumerate
only this reviewed batch; rerun status and preserve any later unrelated work.
Execute only after the separate independent review and explicit Git authorization.

```powershell
git add -- server/app.ts server/controllers/feedingLogController.ts server/controllers/feedingStationController.ts server/feedingStations/feedingStationStore.ts server/feedingStations/postgresFeedingStationStore.ts server/feedingStations/postgresStationPrivacyStore.ts server/feedingStations/retiredStationRoutes.ts server/feedingStations/stationPrivacyHttp.ts server/feedingStations/stationPrivacyStore.ts server/media/contentUrl.ts server/media/routes.ts server/media/s3.ts server/media/service.ts server/middleware/authMiddleware.ts server/middleware/privateResponse.ts server/preview/app.ts server/routes/feedingStationRoutes.ts server/tests/abuseRoutes.test.mjs server/tests/authBoundary.contract.test.mjs server/tests/feedingBoundary.contract.test.mjs server/tests/feedingLog.test.mjs server/tests/feedingStations.contract.test.mjs server/tests/feedingSummary.test.mjs server/tests/helpers/contracts.mjs server/tests/helpers/parserSurvival.mjs server/tests/integration/authApp.mjs server/tests/integration/postgresFeeding.test.mjs server/tests/integration/postgresMedia.test.mjs server/tests/integration/postgresPreview.test.mjs server/tests/integration/postgresReports.test.mjs server/tests/integration/postgresStationPrivacy.test.mjs server/tests/integration/postgresUsers.test.mjs server/tests/legacyStationRetirement.test.mjs server/tests/media.test.mjs server/tests/mediaBudgets.test.mjs server/tests/mediaRoutes.test.mjs server/tests/protectedResponse.test.mjs server/tests/requestParsing.test.mjs server/tests/validationBounds.test.mjs server/validation/feedingStationSchemas.ts
git add -- client/src/api/media.ts client/src/components/feedingStationDetails/FeedingStationDetails.tsx client/src/components/media/StationMediaImage.tsx client/tests/media.test.cjs
git add -- docs/RELEASE_READINESS.md docs/migrations/s3-media.md docs/security/sec-1b-3b-2-endpoint-privacy.md docs/security/station-visibility-design.md
```

