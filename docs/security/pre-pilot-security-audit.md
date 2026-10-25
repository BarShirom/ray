# SEC.1A — Pre-pilot security audit

Date: **2026-10-25**. Branch: **`ray-2-postgres`**. Audited commit: **`945ab79523a511bafdfd34f27ad72004a0b935b3`** (UX.2).

**Decision: not ready for a real public pilot.** No Critical application exploit was established. High-priority findings are a reproduced unauthenticated parser process crash, anonymous Cloudinary consumption in the legacy application, missing API abuse controls, and reachable validation amplification. Reviewed PostgreSQL ownership and attachment checks held in the existing tests. Intentional public reads are distinguished below from excessive disclosure and undecided privacy policy.

This assessment changes only this document. No remediation, package upgrade, staging, commit, push, deployment, AWS request, credential renewal, persistent-preview reset or deletion was performed. Defensive evidence summaries omit payloads, passwords, tokens, object identifiers and signed URLs. Passing local tests is not deployment approval.

## Scope, preflight and evidence boundaries

- The initial working tree was clean. HEAD was rechecked after the interruption and remained unchanged. UX.1 `8d1bb5e5d073f0053a32828d8943d13cc6641a1e` and S3.1 `a0dccb8733229fbca47c700bdacb67657ce6c9f2` are ancestors. Locally recorded `origin/ray-2-postgres` was **0 ahead / 0 behind**; no fetch was performed, so remote freshness is unknown.
- No applicable `AGENTS.md` was found in the repository or its filesystem ancestors. Git reads used a per-command `safe.directory` override; no Git configuration was changed.
- Reviewed routes, controllers, validators, serializers, Mongo/SQL adapters, migrations, frontend persistence/API/rendering, media signing/state/cleanup, dependency manifests/locks and existing tests. Context: [PostgreSQL API compatibility](../migrations/postgres-api-compatibility.md), [S3 history](../migrations/s3-media.md), [localization](../localization.md), [UX.2](../ux2-reliability.md), and [older dependency triage](milestone-10b-audit-triage.md). Earlier histories remain unchanged.
- **Modes matter:** `server/server.ts:6-9,75-78,99-110` / `npm start` still compose MongoDB and legacy Cloudinary uploads. `server/preview/app.ts` composes PostgreSQL; `preview/runtime.ts:34-45` deliberately binds local loopback. S3 is opt-in there. The preview is not an implemented production PostgreSQL deployment. `media/service.ts:17` also generates loopback content URLs.
- Evidence tiers: **source** establishes reachable logic/configuration; **synthetic probe** uses current modules with disposable processes/in-memory stores; **PG** uses real disposable PostgreSQL with storage doubles; **prior live/browser** means the retained September S3.1 evidence, not current AWS verification. No real MongoDB race or current cloud/IAM state was tested.

## Threat model

| Actor | Current authority and relevant threat |
|---|---|
| Guest | Reads public stations/history/reports/attached images; can register, log in and create reports without images. Can scrape, spam and bypass all React constraints. |
| Authenticated feeder/reporter | Guest reads plus station/log creation, report claim, own assignments and owned media issuance/completion/attachment. Registration is open; an account does not establish a verified real-world identity. |
| Another authenticated user | Must not complete/attach someone else's asset, resolve their assignment, or select a different actor in request fields. Can claim any still-new report by current policy. |
| Report assignee | Can resolve their stored assignment and list their own assigned reports; assignment does not currently grant a separate private case-data tier. |
| Operator | Runs guarded migration/cleanup tools and holds database/cloud privileges. This is an operational trust boundary, not an application admin role. |
| Administrator / NGO / municipal provider | **No application role or privileged endpoint implemented.** Future partners have no special access entitlement today. Do not load their private case/personnel data under an assumed future permission model. |
| Malicious direct client | Can construct IDs, ownership fields, malformed bodies and arbitrary allowed URLs independently of the UI; CORS and unguessable IDs are not authorization. |

Protected assets are account identities, hashes and bearer credentials; assignment integrity; feeder routines and free text; exact locations of vulnerable animals; image content and original metadata; storage keys and signed capabilities; database/API availability; and cloud/processing budgets. Existing requirements include actor-derived writes, assignee-only resolution, owner-only media mutations and nonpublic unattached media. Current public parent visibility is a product behavior, not an implicit requirement that all future care data be public.

## Endpoint and object-authorization matrix

Paths below have the `/api` prefix. Shared controllers apply to both modes unless noted. “Public” means guests can obtain the response directly. No station/report edit/delete routes or standalone report-detail route were found.

| Method / route | Readers or writers; object check | Rejection / boundary | Source and existing coverage |
|---|---|---|---|
| `POST /auth/register` | Public; creates a new account, returns only its auth profile/token | Invalid schema 400; duplicate email 400; missing secret 500 | `routes/authRoutes.ts:8-14`, `controllers/authController.ts:8-44`; `auth.contract`, `authBoundary.contract`, PG users |
| `POST /auth/login` | Public; password comparison against selected email | Invalid body/credentials 400; no token on failure | `authController.ts:47-77`; same auth tests |
| Profile/current user, logout, refresh, reset/change password | **No HTTP endpoints implemented**. Local logout clears Redux/persistence only | Copied JWT remains valid until expiry/user removal | `authRoutes.ts:8-14`; `client/src/features/auth/authThunks.ts:112-123`; SEC-011 |
| `GET /feeding-stations` | Public; active stations | No pagination; inactive excluded from this list | `routes/feedingStationRoutes.ts:19`, `controllers/feedingStationController.ts:30-34`; feeding contracts/PG feeding |
| `GET /feeding-stations/:id` | Public; includes inactive station detail | Malformed ID 400; missing 404 | Same routes/controller `:40-57`; feeding boundary/PG tests |
| `POST /feeding-stations` | JWT required; server derives creator from authenticated user; supplied ownership cannot select another user | 401 guest; 400 schema; S3 attachment checks below | `feedingStationRoutes.ts:18`, `feedingStationController.ts:13-24`; feeding contracts, PG feeding/media |
| Station update/delete | **Absent**, including an inactivation endpoint | Do not infer owner edit rights from `createdBy` | Complete station router |
| `GET /feeding-stations/:stationId/feedings` | Public history, including inactive station history | 400 malformed ID; 404 missing station | `controllers/feedingLogController.ts:57-76`; feeding log/boundary/PG tests |
| `POST /feeding-stations/:stationId/feedings` | JWT; any feeder can log at any active station; server fixes user/station IDs | 401 guest; strict schema rejects forged fields 400; missing 404; inactive 409 | `feedingLogController.ts:11-43`, `validation/feedingLogSchemas.ts`; same tests |
| `GET /reports` | Public; all report statuses, coordinates, text, reporter/assignee summaries and media | No pagination; visibility is not assignee-only | `routes/reportRoutes.ts:14`, `controllers/reportController.ts:32-36`; report contracts/PG reports |
| `POST /reports` | Guest-enabled optional auth; creator comes from middleware; status forced new and assignment empty | Invalid/expired optional bearer falls back to guest. Schema 400. S3 images require valid actor ownership | `reportRoutes.ts:15`, `reportController.ts:17-26`, `middleware/optionalAuthMiddleware.ts`; report contracts/PG media |
| `GET /reports/me` | JWT; filter uses current authenticated **assignee**, not creator or caller-supplied ID | 401 missing/invalid/expired token or deleted identity | `reportRoutes.ts:16`, `postgresReportStore.ts:100-101`; PG reports assignee-scope tests; frontend assigned-report tests |
| `PATCH /reports/:id/claim` | JWT; any user can claim a new report for self; ignores supplied assignee | 404 absent; 400 already claimed/resolved; malformed ID currently 500. PG locks/rechecks; Mongo race SEC-005 | `reportController.ts:48-65`, `postgresReportStore.ts:102-111`, `mongoReportStore.ts:70-81`; PG concurrent claims |
| `PATCH /reports/:id/resolve` | JWT; compares authenticated actor with **stored** assignee before mutation; repeated resolution allowed | 403 another actor; 404 missing; malformed ID 500 | `reportController.ts:67-81`, `postgresReportStore.ts:113-123`, `mongoReportStore.ts:84-94`; PG cross-user/concurrency tests |
| `GET /reports/stats`, `/reports/stats/me` | JWT; global aggregate / current-assignee aggregate respectively | 401 unauthenticated; no caller-selected user scope | `reportRoutes.ts:19-20`, `reportController.ts:85-100`; report contracts/PG reports |
| Report detail/edit/delete | **Absent**. Detail UI uses data already returned by public list | No hidden assignee-private detail API | Complete report router |
| `GET /media/capabilities` | Public in PG preview; enabled flag and limits only | Disabled by default | `preview/app.ts:46-48`; preview/media tests |
| `POST /media/uploads` | S3-enabled PG only; JWT and existing user; strict intent; server generates keys | 401 guest; 400 invalid/client storage fields; 429 six outstanding or ten new/min/user; 503 storage | `media/routes.ts:6-8`, `validation.ts:5-10`, `service.ts:91-117`; offline media + PG media |
| Presigned S3 `PUT` | Any holder of five-minute capability can use its fixed permission; no Ray JWT required/sent to S3 | Fixed key/method/length/type/checksum/SSE/owner/conditional write; altered permission/replay rejected in prior evidence | `media/s3.ts:38-50`, `types.ts:5-7`; offline SDK signing, prior Node S3 |
| `POST /media/:id/complete` | JWT plus row lock and owner equality; ready completion idempotent | 400 bad ID; 403 other owner; 404 missing; 410 expired unattached; 409 bad state/lease; 422 image; 429 limits; 503 storage | `media/service.ts:43-48,119-150`; PG media |
| Attachment through station/report `POST` | Same transaction locks owned, ready, unexpired, unattached, correct-purpose assets; one station / three report images | 401 guest images; 403 other owner; 400 invalid count/duplicates; 404 missing; 409 wrong purpose/reuse/state/expiry | `media/service.ts:50-85`, `validation.ts:12-13`; PG ownership, ordering, rollback and concurrent attachment tests |
| `GET /media/:id/content` | **Public** for ready assets attached to an existing parent, including inactive stations; 302 to fresh 60-second bearer URL | 400 bad ID; 404 pending, processing, failed, unattached-ready or missing-parent asset; `no-store` / `no-referrer` | `media/routes.ts:14-16`, `service.ts:152-161`; PG media + prior guest/browser/Node reads |
| Expired/abandoned assets | Unattached expiry prevents completion/attachment; ready **attached** reads do not expire with the upload intent | No public asset listing/deletion endpoint; cleanup eligible only after both expiries + 24h, with no live processing lease | `service.ts:127-135,165-178`; PG expiry/cleanup |
| Cleanup CLI | Operator, guarded preview DB/config, exact reviewed UUID manifest, max 100; rechecks eligibility and tombstones before object deletion | Never attached; no bucket listing; failed deletion retryable; no HTTP cleanup/admin endpoint | `media/cleanup.ts:10-38`, `service.ts:163-178`; PG mocks, earlier exact probe cleanup only |
| `POST /upload/media` | **Legacy normal entry only: anonymous**, five files, 25 MiB each | PG preview returns 503 before body parsing/provider access; legacy missing auth SEC-002 | `server.ts:75`, `routes/uploadRoutes.ts:20-44`, `preview/app.ts:40-43` |

Coverage abbreviations refer to `server/tests/*.test.mjs` and `server/tests/integration/postgres*.test.mjs`. Especially useful: `postgresReports.test.mjs:204` auth failures, `:309` assignee scope, `:416` credential exclusion, `:436` safe persistence failures, `:484` claim concurrency, `:518` assignee recheck; `postgresMedia.test.mjs:41-159` media boundaries. Absence of a finding is not proof of every possible ID/timing combination.

## Privacy inventory and decisions

| Data | Actual guest exposure | Recommended pilot decision / tradeoff |
|---|---|---|
| Account email, company, password hash | Auth response includes the signing-in user's email/company; public report summaries omit them and hashes. No phone field/API found | Keep account/contact data private. Future contact sharing requires explicit scope and purpose. |
| Names and stable user IDs | Report reporter/assignee summaries include names and public IDs; station creator and feeding-log user IDs are public | Remove public feeder/account linkage the UI does not use; prefer pseudonyms/aggregates. Named attribution aids coordination but reveals identity across activities. SEC-008. |
| Station and animal coordinates | Public precise coordinates in lists/detail; report history remains public across statuses | Decide which places are safe to publish, precision, inactive/resolved retention and any private-case exception. Recommend coarse public discovery and exact coordinates for explicitly authorized pilot participants; this requires new server policy, not merely hidden map markers. SEC-009. |
| Feeding routines, dates and notes | Public precise `fedAt`, period, food/water and free text; can be joined through user IDs | Public latest/aggregate care status is safer than named full histories. Detailed routines help coordination but enable feeder targeting and animal-location misuse. |
| Report description / assignment | Public free text, identity snapshots, assigned user and timestamps; `/me` is a scoped convenience view | Define public-safe text guidance, sensitive-case access and removal. Being an assignee currently does not hide the case from guests. |
| Images | Any guest can request attached normalized images and obtain usable signed URLs; inactive parent allowed. Pending/unattached assets remain private | Explicitly approve anonymous access/consent, or implement parent authorization for restricted cases. Signed URLs are shareable capabilities, not evidence of a private application audience. |
| Original image metadata | Public WebP normalization removes metadata; private source originals remain stored | Decide whether originals are necessary, short retention, operator access and deletion/takedown. Metadata may contain GPS or people-related details. SEC-010. |
| Browser state and logs | Only auth slice persisted, including token/own profile. Legacy errors log raw messages/stacks; normal request logger logs path without query/body | Decide shared-device session policy; avoid credentials, free text and signed capabilities in logs. SEC-011/013. |
| Future organization data | No implemented private organization/municipal tier | Keep out of pilot datasets until purpose, permissions and identity verification are designed and tested. |

Sources: `server/serializers/{authResponse,reportResponse,feedingStationResponse,feedingLogResponse}.ts`; `reportResponse.ts:6,17-20`, `feedingStationResponse.ts:15`, `feedingLogResponse.ts:7-12`; `client/src/app/store.ts:26-30`; `media/image.ts:24-27`, `media/service.ts:152-176`. Product approval is required for visibility/retention changes; none was applied in SEC.1A. These are privacy design recommendations, not legal-compliance certification.

## Verified controls and limits

- JWT signature/expiry verification is followed by a database identity lookup (`middleware/authMiddleware.ts:19-45`). Deleted users cannot continue as protected actors. No signature bypass was demonstrated. Explicit algorithm/issuer/audience policy is absent and belongs in environment/session hardening; absence alone is not a bypass.
- Auth responses and public domain serializers use explicit allowlists. SQL user projections and Mongo population exclude credential fields; poisoning/projection regressions cover the boundary. Auth errors do not log passwords or database details.
- Server-derived ownership/status mappings and strict feeding/media schemas prevent mass assignment. SQL uses bound Drizzle predicates/parameters; reviewed Mongo queries use validated scalar fields/IDs. No reachable SQL/NoSQL injection was established from these call sites.
- PostgreSQL claim/resolution transactions lock and recheck the row; assigned listing is actor scoped. Media owner checks, sorted asset row locks, parent+attachment atomicity and database constraints prevent cross-owner/reuse races in tested paths.
- S3 issue quotas lock the user row, so six-outstanding / ten-intents-per-minute enforcement is database backed across instances. Completion rate and worker ceilings are only per process (SEC-007).
- Presigning fixes server keys, expected owner, method, MIME, length, checksum, SSE and `If-None-Match:*`. Downloads verify HEAD/ETag/length/type and streamed bytes/hash with limits/timeouts. Output retries accept an existing object only if normalized checksum/length/type match (`media/s3.ts:32-99`). A presigned URL is a bearer capability, not intrinsically single-use.
- Image processing checks JPEG/PNG/WebP magic and declared type **before** native metadata, rejects animation/corruption, caps 8 MiB and 20 million pixels, resizes/orients and emits metadata-stripped WebP (`media/image.ts:14-28`). Sharp maintenance remains necessary; no SVG bypass or Ray RCE was proven.
- Restricted S3 credentials require a named temporary profile and STS role/account verification using the same credential object, not ambient fallback (`media/s3.ts:9-26`, `config.ts:6-23`). Policy files under `infra/s3/` are templates, not proof of effective deployed permissions.
- React renders user text normally; no `dangerouslySetInnerHTML` sink found; Leaflet icon HTML is constant. External navigation uses numeric coordinates. No stored-XSS exploit was found. No frontend CSP was found in checked-in `client/index.html` / `client/vercel.json`; hosting headers were not inspected.
- API credentials are explicit Bearer headers (`client/src/api/http.ts:14`, `withCredentials:false`); no auth cookies were found. Classic ambient-cookie CSRF was not demonstrated. Public write spam is still possible. CORS does not stop direct clients or replace authorization.
- UX.2 gates auth restoration and fences assigned-state responses by session/request, clears on logout and excludes stale foreign data (`client/src/main.tsx`, `reportsSlice.ts`, assigned selectors/tests). This protects UI state, not server-token revocation.
- Preview validates a dedicated >=32-character secret, exact guarded DB URL/identity and migration hashes; startup does not migrate/seed (`preview/config.ts`, `runtime.ts`, `migration-state.ts`). Local TLS disabling is limited to guarded Docker URLs (`db/local-config.ts:12-22`). Normal Mongo startup has weaker secret/config/error safeguards.

## Findings — confirmed vulnerabilities

### SEC-001 — Compressed body parsing can terminate the process

**High / Confirmed. Both modes. Pilot blocker: yes for any reachable API.** Any unauthenticated requester reaching global parsers is sufficient; no account, object ID or matching route is required. `server/server.ts:70-71` and `preview/app.ts:44-45` enable default inflation with installed `express@5.1.0 -> body-parser@2.2.0`. An isolated disposable Node child using the installed parser configuration accepted a bounded synthetic request, then exited 1 on an unhandled decompression error. The application services, databases and cloud were not targets of this probe. This confirms the parser defect/configuration path; a full actual-app crash was intentionally not attempted.

Impact: loss of care coordination until process recovery; repeated requests can defeat restarts. Minimum remediation: resolve to `body-parser>=2.4.0` through a reviewed Express/lock update; alternatively reject encoded bodies with `inflate:false` if product/API compatibility permits. Add isolated child-process regression tests covering pre-auth JSON and form parsers, malformed compression, normal requests and process survival. Product decision: only whether compressed API requests are supported. [Upstream advisory and fix](https://github.com/advisories/GHSA-27r3-jxmh-p828).

### SEC-002 — Anonymous legacy Cloudinary storage consumption

**High / Confirmed source path. Legacy Mongo only. Pilot blocker: yes if this entry/route is reachable.** Prerequisites are public normal startup and configured Cloudinary credentials. `server/server.ts:75` mounts `routes/uploadRoutes.ts:41-44` without authentication; its filter trusts supplied MIME, accepts five files of 25 MiB each and uses Cloudinary `resource_type:auto` (`:8-27`). No live Cloudinary upload was attempted.

Impact: unauthorized paid storage/processing and unreviewed media hosting. Minimum remediation for the intended PG pilot: disable/remove this production exposure. If legacy uploads must remain, require verified JWT before provider invocation, actual-content validation and durable quotas. Tests: guest multipart rejected before any storage call; authorized ownership, spoofed MIME, file count/size and quotas. Product decision: retire or support legacy media; preserve guest reports without images if desired. Preview already returns 503 before parsing this route (`preview/app.ts:40-43`).

### SEC-004 — Report validation amplifies small invalid collections

**High / Likely availability impact; validation amplification Confirmed. Both modes. Pilot blocker: yes.** A guest can reach report validation with a body below the 10 MiB parser cap. `validation/reportSchemas.ts:12` has no collection maximum; installed `zod@4.6.5` accumulates failures. Bounded actual-schema probes produced 1,000 issues from a 2,088-byte synthetic body; the S3 alternate schema's maximum still produced 1,001 issues. Memory exhaustion was deliberately not attempted.

Impact: excessive allocation/serialization and API starvation at larger inputs. Minimum remediation: Zod >=4.6.6 plus early collection/body/field bounds and capped error responses; do not assume `.max()` alone prevents work. Tests: oversized collections stop early, bounded issues/output, ordinary field-error compatibility and guest route coverage. Product decision: permissible text/media bounds, not whether to fix unbounded work. [Upstream advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

### SEC-005 — Legacy claim race can overwrite the winning assignee

**Medium / Confirmed adapter behavior. Legacy Mongo only. Pilot blocker: yes if legacy reports serve the pilot.** Two authenticated users race a new report. `reports/mongoReportStore.ts:70-81` reads/checks/saves non-atomically; an actual-adapter test with controlled independent document snapshots returned two claimed results and two writes. This was not a real MongoDB concurrency test. PG row-lock behavior is unaffected and passed real concurrency tests.

Impact: lost assignment and care handoff confusion. Minimum remediation: conditional atomic transition from status new to claimed; preserve response semantics. Tests: real Mongo race gives one winner, loser cannot resolve, winner remains assigned. Product decision: legacy support versus retirement. Source contrast: `postgresReportStore.ts:102-123`.

### SEC-006 — bcrypt silently truncates long Unicode passwords

**Medium / Confirmed. Both modes. Pilot blocker: resolve new-account policy before enrollment.** Attacker must know/guess the effective first 72 UTF-8 bytes; this is not a generic passwordless takeover. `validation/authSchemas.ts:7` has a minimum but no byte maximum; `authController.ts:26,64` passes raw strings to bcryptjs. A synthetic actual-auth-router/in-memory-store probe accepted two distinct 19-codepoint, 73-byte passwords with a shared effective prefix: registration 201, different-suffix login 200. No credential values were printed.

Impact: users can believe suffix characters strengthen/distinguish a password when they do not. Minimum remediation: reject >72 UTF-8 bytes for **new** bcrypt passwords, or design a versioned suitable-KDF migration. Do not silently prehash, normalize, trim or invalidate existing hashes. Existing long-password accounts need compatible login and recovery/migration rules. Tests: byte boundary, Hebrew/non-BMP input, different suffix, old hashes and raw transport. Product decision: UX wording and migration/recovery. UX.2's length-alignment tests do not address this byte limit.

### SEC-013 — Unexpected errors expose raw parser details

**Low / Confirmed. Both modes; legacy logging worse. Pilot blocker: safe error/log boundary required before real account data.** Malformed input reaches `preview/app.ts:62-66` / `server.ts:89-94`. A synthetic loopback preview probe returned 500 `SyntaxError` with its own body marker in the message; preview logging was generic. Legacy additionally logs raw error message/stack. This proves reflection of caller input, not another user's secret disclosure. SQL adapters/auth handlers already sanitize their failures.

Minimum remediation: generic unexpected 500, safe parser 400/413 mapping, structured redacted logs. Tests: malformed login body marker absent from response/logs; oversized input 413; storage/SQL details absent. Impact: unnecessary detail and possible sensitive request fragments in legacy logs. Product decision: none for redaction; operations chooses diagnostic retention/access.

### SEC-014 — Registration reveals account membership

**Low / Confirmed. Both modes. Pilot blocker: no alone; record privacy disposition and abuse limits.** Anyone can compare duplicate-email 400 `User already exists` with registration 201 (`authController.ts:20`; `tests/auth.contract.test.mjs:44-51`). Impact: enumerating association with Ray. Login uses generic invalid credentials; timing differences were not measured. Minimum remediation: generic enrollment response/verification workflow plus rate limits. Tests: equivalent public responses without breaking legitimate enrollment, bounded attempts. Product decision: disclosure versus onboarding compatibility.

## Findings — missing protections with demonstrated risk

### SEC-003 — Authentication, guest writes and public reads lack abuse bounds

**High / Confirmed missing controls. Both modes. Pilot blocker: yes for public reachability.** Anonymous clients can repeatedly register/login (bcrypt CPU), create guest reports with large text, and read entire accumulated lists. No limiter appears in `routes/authRoutes.ts:12-13`, `routes/reportRoutes.ts:14-15` or app composition. Text fields are unbounded (`reportSchemas.ts:4-12`, station/log schemas); body limits are 10 MiB. `postgresReportStore.ts:99` and `mongoReportStore.ts:59-61` return all reports; station/history reads also lack pagination.

Impact: spam/care misinformation, credential attacks, database growth, scraping and availability/cost pressure. Minimum remediation: correctly attributed edge/API limits plus durable account/write budgets, bounded fields/bodies and bounded pagination. Keep defenses effective across instances; process-local limits alone are insufficient. Tests: anonymous/authenticated quotas, proxy/IP handling, distributed concurrency, large text, page caps and normal guest submission. Product decision: open signup/guest reporting versus invitation/moderation and chosen thresholds. CORS is not a mitigation.

### SEC-007 — Media cost protection stops short of aggregate budgets

**Medium / Confirmed. S3-enabled PG. Pilot blocker: yes before paid public media.** An authenticated/openly registered user can attach successive assets; attached assets and expired pending intents do not count toward six-outstanding quota (`media/service.ts:97-105`). Ten intents/minute/user is durable; ten completions/minute and two active processors are per process (`:28-36,119-150`). No aggregate retained-byte/day/lifetime/global budget or distributed worker ceiling is implemented.

Impact: paid storage, original+output growth and decoder CPU beyond planned pilot spend; multiple accounts magnify it. Minimum remediation: durable account/global byte/time budgets, issuance reservations reconciled through failure/cleanup, and distributed processing capacity. Tests: multi-instance issuance/completion, attached/expired accounting, retry/failure refund rules, open-account bypass and budget exhaustion. Product decision: pilot enrollment and spend limits. Existing race-safe outstanding quotas must be preserved.

### SEC-010 — Attached media has no retention or takedown lifecycle

**Medium / Confirmed missing lifecycle. S3-enabled PG (legacy Cloudinary also lacks an app removal flow). Pilot blocker: yes before real images.** Legitimate uploads can contain people/GPS; attached source originals and outputs persist, while cleanup explicitly excludes attached records (`media/service.ts:165-176`). There is no owner-delete/moderator route or application admin role.

Impact: indefinite sensitive-original retention, continuing public image exposure and storage cost after need ends. Minimum remediation after policy review: minimize original retention, define parent/media deletion and operator takedown, enforce references/leases and retry-safe deletion. Tests: attached/unattached lifecycle, shared references if introduced, completion/deletion races, partial failure and backup-retention implications. Product decision: retention periods, original necessity, removal authority and audit trail. Do not broaden the orphan cleaner to delete attached files without this design.

### SEC-011 — Persistent seven-day bearer sessions cannot be revoked by logout

**Medium / Confirmed design limitation. Both modes. Pilot blocker: explicit session policy required; remediation priority depends on pilot data/device use.** Prerequisite is copying a token through shared-device access, extension compromise or an XSS not established here. `authController.ts:35-37,70` issues seven-day tokens; `client/src/app/store.ts:26-30` persists auth including token in localStorage; client logout only clears local state. There is no server revocation/session version/logout endpoint.

Impact: a copied token survives local logout until expiry or user removal. Minimum remediation: choose shorter access lifetime plus revocable sessions/session version and explicit logout semantics; reconsider persistent bearer storage for shared devices. Cookie migration would require CSRF and cross-origin redesign and is not a drop-in fix. Tests: copied-token logout/revocation, expiry, restoration, multiple devices and stale-response isolation. Product decision: remembered login, device trust, lifetime and account recovery. No token theft was demonstrated.

### SEC-018 — Geographic bounds differ between API schema and persistence

**Low / Confirmed validation gap. Both schemas; stored invalid coordinates mainly legacy. Pilot blocker: no alone.** Direct clients can submit finite out-of-range numbers (`feedingStationSchemas.ts:6-7`, `reportSchemas.ts:9-10`). PG database checks reject these (`db/schema.ts:50,79`; migration `0001`), typically as sanitized 500; legacy models have only required numeric fields. Browser/map damage was not reproduced. Minimum remediation: latitude/longitude ranges at validation, 400 responses, retain DB checks; test boundaries in both modes. Impact: legacy data integrity and confusing failures. Product decision: none beyond whether service-area bounds are also desired.

## Findings — privacy and product decisions

### SEC-008 — Public identifiers connect named people to feeding routines

**Medium / Confirmed exposure, not an established authorization bypass. Both modes. Pilot blocker: approve/minimize before real identities.** Guests can join report names/public IDs with station creators and feeding-log user IDs/timestamps/notes. `serializers/reportResponse.ts:6,17-20`, `feedingStationResponse.ts:15`, `feedingLogResponse.ts:7-12` expose these links. Feeding-history UI does not need the user ID.

Impact: identification, routine tracking and targeting of feeders. Minimum remediation: remove unused public account linkage, choose pseudonyms/public summaries and authorize any detailed identity/history view. Tests: guest and other-user response allowlists, joined-correlation fixture, preserve legitimate care coordination. Product decision: named attribution/contact sharing. Public IDs are identifiers, not secrets or authorization.

### SEC-009 — Exact locations and attached images are intentionally public

**Medium / Confirmed policy; real-world harm depends on context. Both modes. Pilot blocker: explicit visibility/consent decision.** A guest needs no token to read precise animal/station locations, report/history text or get usable URLs for attached S3 outputs, including inactive station parents (`media/routes.ts:14-16`, `service.ts:152-161`). This matches public-parent behavior; it is **not a demonstrated media IDOR**. A private bucket does not change this audience.

Impact: harvesting animal locations, exposing people/home details in images/text, and schedule inference. Minimum safe decision: specify public-safe data, sensitive-case precision/access, inactive/resolved retention and image consent. Recommend minimized public discovery plus authorized exact case access where needed; product may retain fully public care information with explicit safeguards. Tests must enforce the chosen policy at all list/detail/content endpoints and invalidate/limit future read capabilities after visibility changes. Signed URLs remain usable within their short lifetime. Product decision: required; do not silently change maps/read semantics.

### SEC-012 — Legacy/disabled-media URLs permit third-party tracking loads

**Low / Confirmed browser-load path; downstream harm unverified. Legacy and media-disabled PG. Pilot blocker: choose supported media mode/URL policy.** Report creators (including guests) can store arbitrary media strings; station creators can store arbitrary image strings (`validation/reportSchemas.ts:12`, `feedingStationSchemas.ts:11`). Station details/report popups pass these to image/video elements (`client/src/components/feedingStationDetails/FeedingStationDetails.tsx:87`, `client/src/components/reportMarker/ReportMarker.tsx:175-188`). This can cause a viewer to contact an uploader-selected third party. `client/src/components/media/Media.tsx:32` adds no-referrer to images, which still exposes the viewer's IP to the image host; popup videos have no explicit referrer policy.

No backend URL retrieval, SSRF or executable HTML/XSS sink was established. S3-enabled schemas reject supplied image/media URLs (`media/validation.ts:12-13`). Minimum remediation: own-media or approved scheme/host allowlist and suitable frontend CSP; define handling for legacy URLs. Tests: unsupported schemes/hosts rejected, approved media works, no unexpected external load. Product decision: compatibility with external/legacy media.

## Dependency inventory and disposition

### SEC-015 — Installed vulnerable versions require a reviewed maintenance batch

**Medium / Confirmed inventory; exploit confidence varies below. Pilot blocker: reachable runtime issues must be fixed or explicitly dispositioned, not waived by aggregate counts.** SEC-001/004 describe the stronger specific findings. Other package warnings do not automatically establish Ray exploitation; each requires the relevant function/configuration/runtime. Minimum remediation is reviewed manifest/lock updates or retirement of unused legacy paths, followed by affected tests/builds and a fresh audit. Product decision: legacy support and accepted residual/dev-only risk. No `npm audit fix`, force upgrade or package mutation was run.

Fresh `npm audit --json` on 2026-10-25, npm **9.6.5**, Node **22.22.0**:

| Tree | Flagged packages | Critical | High | Moderate | Low |
|---|---:|---:|---:|---:|---:|
| Client | 21 | 1 | 14 | 4 | 2 |
| Server | 15 | 1 | 9 | 5 | 0 |

These are package-level npm counts, including propagated/transitive advisories, **not 36 independent application exploits**. Fresh data supersedes the earlier S3 runbook's 12-package snapshot without rewriting that history. Installed/lock comparisons covered 244 client and 216 server installed lock entries with matching versions. `npm ls --all --json` reported no client problems; server reported two extraneous optional WASM packages (`@emnapi/runtime@1.11.3`, `@img/sharp-wasm32@0.35.4`). No cleanup was performed.

### Server: all 15 flagged package names

`R` means installed runtime dependency; `D` development tooling. Dependency arrows identify the relevant root path, not every duplicate installation.

| Package / installed version / path | Upstream level; Ray reachability | Minimum remediation / compatibility |
|---|---|---|
| `body-parser 2.2.0` R, `express -> body-parser` | High; both global parsers reachable before auth; SEC-001. URL-encoded DoS also flagged. Invalid-limit advisory's prerequisite is not shown: Ray's literal `10mb` is valid | >=2.4.0 within Express's transitive range; review Express/tree resolution; parser regressions. [Crash advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828), [form advisory](https://github.com/advisories/GHSA-wqch-xfxh-vrr4) |
| `proxy-addr 2.0.7` R, `express -> proxy-addr` | **Critical metadata**, conditional mapped-IPv6 trust-subnet bug. Normal app uses numeric `trust proxy=1`; preview default false. Required subnet configuration is absent; no confirmed Critical Ray bypass | >=2.0.8 compatible transitively; separately validate actual reverse-proxy topology before IP limits. [Advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) |
| `zod 4.6.5` R, direct | High; report schema amplification in both modes; SEC-004 | >=4.6.6 within `^4.6.5`; early bounds/error-budget tests. [Advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |
| `sharp 0.35.4` R, direct exact pin | High librsvg warning; actual calls only S3 PG image completion. Raw raster gate precedes native decoding. Advisory possible RCE requires specific glibc-Linux runtime conditions; audited host Windows. No SVG bypass/Ray RCE demonstrated | Change exact pin to >=0.35.5; review native platform/Node compatibility; explicitly block unsupported SVG decoder; image regressions on intended host. [Upstream advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) |
| `cloudinary 1.41.3` R, direct; `multer-storage-cloudinary 4.0.0` R, direct | Two High package flags for one SDK chain. Legacy path only. SDK argument-injection exposure is not separately proven: route supplies fixed folder/options rather than arbitrary transformation parameters. Anonymous upload SEC-002 is independently real | SDK >=2.7.0 is a major change; adapter's Cloudinary-1 peer range makes isolated upgrade unsuitable. Prefer remove/disable legacy path for PG pilot; otherwise replace/retest adapter. npm's suggested adapter downgrade is not a reviewed fix. [Advisory](https://github.com/advisories/GHSA-g4mf-96x5-5m2c) |
| `jws 3.2.2` R, `jsonwebtoken -> jws` | High metadata. Upstream excludes `jws.verify()` users: installed `jsonwebtoken/verify.js:165` uses that interface, not vulnerable `createVerify` secret lookup | >=3.2.3 compatible transitive refresh; JWT regressions. No demonstrated JWT forgery. [Upstream qualification](https://github.com/advisories/GHSA-869p-cjfg-cm3x) |
| `mongoose 8.16.1` R, direct | High; legacy data path. `$nor` filter sanitization / update-casting advisories need attacker-controlled query/update structure. Reviewed adapters construct scalar filters and field mappings; no such injection demonstrated | >=8.24.1 within `^8.16.1`; legacy contract/race tests or retire production legacy mode. [Filter advisory](https://github.com/advisories/GHSA-wpg9-53fq-2r8h) |
| `lodash 4.17.21` R, `cloudinary -> lodash` | High template injection / moderate prototype operations; legacy SDK chain. No attacker-controlled `template` import keys or vulnerable omit/unset path found in application | >=4.17.24 outside current audit range through compatible SDK/tree update; validate SDK behavior or remove legacy chain. [Template advisory](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) |
| `path-to-regexp 8.2.0` R, `express -> router` | High; both routers use it. Advisory sequential optional/multiple wildcard patterns absent from checked-in API routes; no matching DoS proven | >=8.4.0 compatible transitive update; route/malformed-path regressions. [Advisory](https://github.com/advisories/GHSA-j3q9-mxjg-w52f) |
| `qs 6.14.0` R, Express/body-parser | Moderate; extended URL-encoded parser reachable in both modes. Not every comma/stringify/isBuffer advisory condition appears in current calls; no separate process-crash proof | >=6.16.0 compatible transitive resolution; bound parser depth/count/bytes and test form rejection. [Array advisory](https://github.com/advisories/GHSA-6rw7-vpxm-498p) |
| `drizzle-kit 0.31.10`, `@esbuild-kit/esm-loader 2.6.5`, `@esbuild-kit/core-utils 3.3.2`, nested `esbuild 0.18.20` D | Four Moderate flags from `drizzle-kit -> loader -> core-utils -> esbuild`. Vulnerable esbuild development server is not Ray's preview runtime. Other installed esbuild 0.25.5/0.28.2 copies are outside this advisory | Use a supported tooling/tree update or isolate tooling; do not apply npm's suggested **downgrade to drizzle-kit 0.18.1** blindly. Preserve migration hashes/SQL and test generation separately. [Advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |

### Client: all 21 flagged package names

Runtime entries affect the frontend used with either backend. A client lockfile `runtime` flag does not mean Node-only adapter code runs in the browser.

| Package / installed version / path | Upstream level; Ray reachability | Compatible remediation / required verification |
|---|---|---|
| `axios 1.10.0` R, direct | High; browser API client used. Many warnings concern Node HTTP/proxy/stream adapters or require a separate prototype-pollution primitive. No arbitrary API URL/config or pollution primitive found; no Ray SSRF/token exfiltration established | Candidate >=1.20.0 within `^1.10.0`, outside all current reported ranges; verify current registry/engines during implementation. Retest auth headers, FormData, errors and media requests. [Representative advisory](https://github.com/advisories/GHSA-pf86-5x62-jrwf) |
| `form-data 4.0.3` R, `axios -> form-data` | **Critical metadata** for Node multipart boundary generation, also High field/filename handling. Ray browser uses native FormData, not this Node generator; no affected Node consumer found | >=4.0.6 via Axios/tree update covers both flagged ranges. Do not call this a confirmed browser Critical. [Boundary advisory](https://github.com/advisories/GHSA-fjxv-7rqg-78g4) |
| `follow-redirects 1.15.9` R, `axios -> follow-redirects` | Moderate Node adapter warning; not browser redirect implementation | >=1.15.12 transitively; retest any future Node Axios consumer. [Advisory](https://github.com/advisories/GHSA-r4q5-vmmm-2653) |
| `react-router-dom 7.6.2 -> react-router 7.6.2` R | Two High package flags. Ray uses declarative BrowserRouter, static routes and fixed navigation destinations (`client/src/App.tsx:1-33`). Framework/SSR/server-action advisories do not establish Ray server RCE; named open-redirect advisory explicitly excludes BrowserRouter. Other route-matching warnings need separate evaluation | Candidate >=7.18.0 within `^7.6.2`, outside current reported ranges; review changelog/engines. Test Hebrew navigation, guards and hostile path rejection. [Mode qualification](https://github.com/advisories/GHSA-2w69-qvjg-hvjx) |
| `uuid 11.1.0` R, direct | Moderate v3/v5/v6 caller-buffer bounds warning; no vulnerable buffer API usage found | >=11.1.1 within declared range; verify actual imports/build. [Advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| `vite 6.3.5` D, direct | High dev-server/file/editor warnings, including Windows conditions. Not a production static server; do not expose development/preview tooling publicly | Compatible 6.x release outside `<=6.4.3` audit range; verify maintained candidate/engines. Test both builds and local dev restrictions. [File-read advisory](https://github.com/advisories/GHSA-p9ff-h696-f583) |
| `rollup 4.44.0` D, `vite -> rollup` | High build-time file-write warning; requires affected build inputs. No attacker-controlled public build service exists here | >=4.59.0 transitively; inspect build output paths. [Advisory](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) |
| `postcss 8.5.6`, `nanoid 3.3.11`, `source-map-js 1.2.1` D, Vite/PostCSS chain | Three High tooling flags. Processes project CSS/maps/IDs during builds; no untrusted upload-to-build pipeline found | Resolve respectively outside `<=8.5.22`, `<=3.3.17`, `<=1.2.1`; fresh audit and CSS/build regression. Compatible fixes reported by npm |
| `browserslist 4.25.0`, `@babel/core 7.27.4` D, React plugin/Babel chain | High / Low; project build configuration and source input, not API request handling | Compatible refresh outside `<=4.28.6` / `<=7.29.0`; build regression; avoid untrusted build configuration |
| `@eslint/plugin-kit 0.3.2`, `@humanfs/node 0.16.6`, `ajv 6.12.6`, `flatted 3.3.3`, `js-yaml 4.1.0` D, ESLint/config/cache chain | Low / Moderate / Moderate / High / High. Local lint/config/cache inputs; no public runtime use found | Compatible tree refresh to >=0.3.4 / >=0.16.8 / >=6.14.0 / >3.4.1 / >4.3.1 respectively; lint/config/cache regression. npm reports fixes available |
| `brace-expansion 1.1.12 / 2.0.2`, `minimatch 3.1.2 / 9.0.5`, `picomatch 2.3.1 / 4.0.2` D, lint/TypeScript/Vite glob chains | Three High package flags with duplicate versions; no API-controlled glob evaluation found | Refresh parent trees outside affected ranges: brace-expansion >1.1.20 / >2.1.6; minimatch >3.1.3 / >9.0.6; picomatch >2.3.1 / >4.0.3. Retest lint/build; avoid broad major override |

Compatible version floors above are audit-snapshot candidates, not installed/tested upgrades or a promise that future advisories are absent. For low-priority grouped tool warnings, the saved audit JSON is the exact advisory/range inventory; no claim of code-level exploit verification is made. Require fresh audits plus production-bundle/tooling review after SEC.1B, and record justified residual warnings individually.

## Verification gaps and operations

### SEC-017 — Full S3 acceptance remains incomplete

**Medium / Needs verification. S3-enabled PG. Pilot blocker: yes for media activation.** This is an evidence gap, not proof of a bypass. Attacker prerequisites/impact depend on each unverified boundary. Minimum remediation is separately authorized, bounded verification and review of effective permissions; do not weaken signed-length/checksum/conditional-write rules to simplify testing. Required regressions/acceptance are below. Product decision: final image audience and any intentionally deferred live tests. **No live AWS operation was performed in SEC.1A.**

Prior September evidence in `docs/migrations/s3-media.md:15-49,493-564` records actual browser station/report upload/display and refresh/API-restart persistence; prior Node checks record unsigned read 403, altered signed length/headers 403, replay 412, and expired read 403 followed by fresh 302/200. Sanitized counters reconcile with retained artifacts: 23 measured Node S3 requests, two browser submissions, nine reserved lifetime keys and 1,828 submitted PUT-body bytes. The 65-attempt planning charge includes unmeasured browser reserves; it is not a measured wire total. Four attached objects were retained; prior probe cleanup is complete and must not be repeated. No current existence/deletion permission is inferred from this history.

Still-open acceptance:

1. Actual browser SignedHeaders and wire Content-Length, OPTIONS/PUT status, and absence of Ray Authorization/cookies. Successful raw-file uploads plus required signed length support compatibility, **not captured wire evidence**.
2. Same-length altered payload checksum rejection, distinct from signed-header tampering; live corrupt-image completion and non-attachable failed state.
3. Ready-unattached privacy; cross-owner completion/attachment of a ready asset; broader parent/inactive visibility against the approved policy.
4. Controlled browser expiry and explicit single retry/no loop; interrupted-form preservation; invalid file/count; guest and disabled no-image creation; live ready-completion idempotency.
5. Effective out-of-prefix permission review/simulation. Checked-in role/policy/CORS templates and prior restricted-role results are not a full effective-permission audit.
6. Concurrency, ordering, rollback, quotas, leases and application orphan cleanup have real-PG/storage-double coverage, **not live S3 certification**, except historical exact probe cleanup. Keep that tier distinction or approve bounded follow-up.

Current benign in-memory Sharp checks rejected standalone SVG and three raster-prefix/SVG fixtures (4/4) on Windows. This limited check is not exhaustive polyglot exclusion or Linux runtime verification.

### SEC-016 — Production PostgreSQL/S3 operating controls are not established

**Medium / Needs verification of intended deployment. Pilot blocker: yes.** Normal startup remains legacy Mongo; preview is loopback-only with local content URLs. No actual production reverse proxy, credential role, DB/TLS endpoint, monitoring or backup deployment was inspected. This is an operational release requirement, not evidence of a deployed misconfiguration.

Before real data, define/review a production PG composition, public URL/origin policy, TLS termination and trusted proxy hops, strong dedicated secret storage/rotation and issuer/audience/algorithm policy, database TLS/least-privilege runtime roles, connection/request/resource bounds, process supervision/readiness and alerting. Normal CORS allows configured exact origins or dot-prefixed suffix subdomains (`server.ts:23-62`); preview is exact loopback origin. Review actual origins rather than widening either blindly. Numeric one-hop trust must match deployment topology, particularly before IP limits.

Also require controlled migrations outside startup, backup encryption/access/retention and a demonstrated restore, synchronized database/object recovery, scheduled orphan cleanup with reviewed manifests, retention/takedown procedures, cost alarms, redacted logging/access controls and incident/credential-revocation ownership. Tests/acceptance: production-config failure modes, TLS/proxy attribution, restart/readiness, restored synthetic dataset plus media consistency, deletion retries and alarm exercises. Product/operations decision: owners, recovery objectives, retention and accepted residual risks. Local guarded Docker plaintext/SSL-off settings must not become production defaults.

Tracked-file checks found only example env files and ignore/type files, with no matches for the selected credential/private-key patterns in inspected source/infra/docs. This was **not a comprehensive Git-history secret scan**; actual env/AWS credentials were not read. Unknown current secrets, deployed headers, IAM permissions, backups and observability remain unknown.

## Tests executed and coverage gaps

All commands ran against this commit on Node 22.22.0. Builds generated only ignored outputs. Existing test bodies were not modified.

| Command / evidence | Actual result and boundary |
|---|---|
| `npm.cmd run build --prefix server` | PASS, exit 0 |
| `npm.cmd test --prefix server` | PASS **189/189**, 0 failed/skipped; includes another TypeScript build |
| `node --test client/tests/*.test.cjs` (repository root) | PASS **76/76**, 0 failed/skipped |
| `docker compose -f compose.postgres.yml --profile test up -d --wait test-db` | Started only disposable loopback test service on 55433; healthy |
| `npm.cmd run test:postgres --prefix server` | PASS **122/122**, 0 failed/skipped, including PostgreSQL auth, cross-user report/feeding/media, concurrency, constraints, startup and cleanup. Test helpers enforce disposable DB identity/schema ownership |
| `docker compose -f compose.postgres.yml --profile test stop test-db` | PASS; only service started for this audit stopped; no volume removal or persistent preview changes |
| `npm.cmd audit --json --prefix client` and `--prefix server` | Completed fresh registry audits; nonzero vulnerability exits expected. Counts above. Initial sandbox network attempt failed; authorized read-only retry succeeded; no fix command |
| `npm.cmd ls --all --json --prefix client` and `--prefix server` | Client valid; server optional extraneous artifacts noted above. Lock/installed versions compared without mutation |
| Isolated parser child; bounded actual-Zod schema probe | Parser process exit 1 confirmed; collection issue amplification confirmed; no application process killed/OOM attempt |
| Actual auth router + synthetic UserStore | Unicode bcrypt boundary behavior confirmed, register 201 / alternate-suffix login 200; ephemeral listener closed |
| Actual Mongo report adapter + independent synthetic snapshots | Two claims/two writes confirmed; **no real MongoDB** |
| Actual preview composition + fake DB, malformed JSON | Raw own-body marker reflected in 500; generic preview log; no DB access; ephemeral listener closed |
| Benign in-memory native image checks | Four unsupported/misleading fixtures rejected; no cloud/network/files; Windows only |

PostgreSQL run used only `RAY_TEST_DATABASE_URL=postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test` (compose's disposable **test-only** fixture), `RAY_MEDIA_MODE=disabled`, `AWS_EC2_METADATA_DISABLED=true`, non-existent temporary AWS config/credential paths and removed ambient AWS credential/profile variables. Media tests inject doubles; no AWS credentials or metadata resolution were used.

Local logs: `%TEMP%/ray-sec1a-server-build.log`, `ray-sec1a-server-tests.log`, `ray-sec1a-client-tests.log`, `ray-sec1a-postgres-tests.log`; dependency JSON `ray-sec1a-{client,server}-{audit,ls}.json`. These are temporary, untracked supporting artifacts, not durable report attachments. Focused probes were inline synthetic Node invocations; no reusable security scripts were added. The report intentionally contains no offensive payloads/reproduction recipes. Sanitized results and exact source/advisory references above support defensive regression implementation.

Existing tests strongly cover serializer/persistence boundaries, invalid JWTs, assignee scopes, PG races/transactions, media ownership/state and frontend restoration/retry isolation. Missing regression coverage includes fixed parser crash survival, byte-aware passwords/existing-account migration, global/distributed abuse budgets, private-location/identity policy, revocation, attached retention/takedown, safe generic parser errors and real Mongo concurrency. No browser security/wire capture, production TLS/IAM/configuration test, full secret-history scan, external scanner or live cloud verification was run. Actual newly selected dependency fixes remain untested because SEC.1A prohibits implementation.

## Incremental SEC.1B plan — review before implementation

| Batch | Exact scope / likely files | Tests, compatibility and data implications | Acceptance criteria |
|---|---|---|---|
| **SEC.1B-1: stop immediate availability/storage exposure** | SEC-001/004/002: reviewed Express/body-parser and Zod manifest/lock refresh; early parser/collection bounds in `server.ts`, `preview/app.ts`, validators/error middleware; disable legacy `/api/upload` for the intended pilot. If legacy remains supported, atomic Mongo claim is a separate small patch | Isolated parser-survival regression, bounded invalid-array work/error output, unauth upload rejection before provider, both-mode contracts; optional real-Mongo race. Preserve guest no-image flow and review encoded-body compatibility. No privacy/DB migration necessary for parser fixes | Both global parser paths survive malformed compression, bounded validation and normal requests pass; PG production target cannot expose anonymous Cloudinary. Record legacy retirement decision; preserve PG ownership tests |
| **SEC.1B-2: constrain public abuse and paid media** | SEC-003/007: edge/API limits with reviewed proxy attribution; durable account/global budgets, field/body/page limits, process-independent completion capacity. `routes`, validation/controllers/stores, `media/service.ts`, reviewed quota schema/migration if needed | Multi-instance/time-window/race tests, signup/guest/login limits, attached/expired/failure accounting, pagination compatibility and UI updates. Decide enrollment, guest-report/moderation thresholds and cost ceiling first | Caps hold across processes and account workflow; quotas cannot be bypassed by attaching/expiry/retries; intended care use remains viable; spend/abuse alarms owned |
| **SEC.1B-3: approve and enforce privacy/lifecycle** | SEC-008/009/010/012: product decision table first; serializer minimization, authorized parent/content reads where approved, location/history precision, approved media hosts, retention/deletion/takedown. Likely serializers/routes/stores/media service/client views and explicit migrations | Guest/other-user/assignee allowlists, cross-endpoint visibility, no private data in public lists/media, signed-URL residual lifetime, lease/reference/deletion retry tests. Public contract/legacy URL changes and data retention need a migration/communication plan | Written public/private/assigned/future-partner policy; unused linkage removed; real-data images have consent/removal/retention; all reads enforce same policy. No invented NGO/admin privileges |
| **SEC.1B-4: authentication and error hardening** | SEC-006/011/013/014/018: byte-aware new-password policy and compatible account migration, session expiry/revocation/storage design, strong dedicated config, generic parser/errors, email-enumeration disposition and coordinate validation | Unicode/72-byte/existing-hash tests; copied-token revocation and restoration; secret-marker response/log exclusions; bad IDs/JSON/size safely rejected; coordinate boundary tests. Cookie/session redesign requires dedicated CSRF review | New passwords have honest effective semantics; existing accounts remain recoverable; session/logout policy demonstrably enforced; no raw credential/body/error details cross logs/API |
| **SEC.1B-5: remaining dependency maintenance** | SEC-015: exact Sharp pin/native platform first, compatible frontend/runtime refresh, then isolated dev-tool/legacy chains; manifests/locks only in small coherent batches | Image/metadata/corruption regressions on intended host; frontend default/PG builds, navigation/auth/upload tests; legacy adapter compatibility or removal; migration-tool hash/output review; fresh npm audits. Never blindly accept Cloudinary major or drizzle-kit downgrade suggestions | Each advisory fixed, unreachable with documented evidence, or explicitly accepted by owner; no unreviewed audit-force/major tree churn. SEC.1B-1 fixes are not deferred to this batch |
| **SEC.1B-6: production and bounded acceptance** | SEC-016/017: separately design production PG/S3 entry/configuration, TLS/proxy/DB/credentials, backups/restore, monitoring and operator procedures; finish retained S3 acceptance ledger under separate authorization/budget | Configuration failure, readiness/restart, restore/media consistency, alert and takedown exercises; explicitly bounded future browser/live cases. Preserve prior cumulative ledger and evidence tiers; do not reset budget or repeat completed cleanup | Production architecture and owners reviewed; all applicable release gates below signed off. Local test success alone cannot clear deployment |

Recommended first review/implementation scope is **SEC.1B-1**, with an explicit PostgreSQL-only pilot/legacy retirement decision. No confirmed PostgreSQL ownership bypass warrants replacing the existing checks. Any newly discovered Critical authorization issue takes priority over these batches and UX work.

## Explicit real-pilot release gates

- Close SEC-001 and SEC-004; disable anonymous legacy uploads and either retire legacy production exposure or fix/test its claim race.
- Enforce distributed authentication/write/read/media abuse budgets and bounded inputs/results; define invitation/guest/moderation policy.
- Approve public identity, exact location, routine, free-text and image audience/consent rules; minimize unnecessary account linkage and enforce policy consistently on API/media reads.
- Adopt byte-correct new-password handling, compatible existing-account recovery, secret/session policy and safe error/log boundaries.
- Patch/disposition runtime dependencies, particularly parser/validation and native image processing; keep developer servers private and review tooling warnings separately.
- Establish original/attached media retention, operator takedown and tested retry-safe deletion; real data must have a removal path.
- Finish named S3 gates with honest live/browser/mock distinctions under separately authorized work; verify effective credentials/prefix/origin policy without assuming templates are deployed.
- Implement/review production PG composition, TLS/proxy/database/least-privilege credentials, controlled migrations, supervision/readiness, cost/security alerts, backup/restore and incident owners. Do not ship loopback preview URLs or local Docker settings.

Final repository scope: this new audit document only; no tracked application, test, lockfile, migration or previous history changes. Expected `git status --short`: `?? docs/security/pre-pilot-security-audit.md`. HEAD/upstream tracking remain the preflight values; no Git writes were performed.
