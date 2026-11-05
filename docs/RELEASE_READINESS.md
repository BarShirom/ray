# Ray release readiness

Current assessment: **2026-11-05, Asia/Jerusalem**, SEC.1B-3C.4 targeted acceptance
evidence/local fault harness, uncommitted. Verified branch `ray-2-postgres`, HEAD
`6063cf2cf9ca76980f7701b507f6c2a0b26f87e0`; clean preflight/index and local tracking
**0 ahead / 0 behind**, without fetch. The 3C.3B browser fixes are committed at
this baseline. The [3C.4 evidence ledger](security/sec-1b-3c-4-browser-acceptance.md)
distinguishes supplied Work results, new local checks and unavailable native cases.

**Newer successful Work browser checkpoint:** the current task explicitly reports
actual Windows Chrome/local-PostgreSQL success at `6063cf2...` for Leaflet navigation
and logout, two-tab mounted map/dialog cleanup, keyboard Report location
selection/clear/reselection at measured 320px and 390px widths, guest Report
submission plus claim/resolve, basic login/refresh/account-history isolation and
selected Hebrew/RTL flows. These are user-supplied native results, not fresh runs
by this agent, and supersede the earlier rejection only for those covered paths.
No guest claim/resolve permission, broader accessibility or additional browser
coverage is inferred. Completed native checks are not unnecessarily repeated.

Remaining native response-order/error/request-count, storage-denial, BFCache,
protected-image decoding/object-URL, CORS/credential-destination and wider
accessibility/recovery cases remain **NOT_TESTED / BLOCKED by prerequisites**.
This session again reports the browser access host unavailable; no permission
workaround was attempted. No suitable already-trusted local HTTPS certificate
was discovered in the inspected repository/runtime certificate stores. No trust
change or live-provider request was made. The minimal harness extends existing
Node callback/effect fixtures only; local PASS does not close native gaps or
establish PostgreSQL evidence. All separate real-user release gates remain open.

**SEC.1B-3C.4 local verification, 2026-11-05:** focused production-module suite
**147/147**, full frontend **225/225** (seven new cases), both frontend builds,
both no-emit TypeScript checks and targeted test lint/syntax pass. New cases cover
network-failed Login/Report/feeding draft retention with one explicit successful
retry, asset404 versus parent404, byte401/404 versus issuer401, controlled
Retry-After gating and image-error callback disposal/retry reset. All HTTP,
captured React hooks, clocks and object URLs are doubles where used: these are
not native rendering, browser-network or PostgreSQL results. No new application
defect was confirmed within that scope. Application/dependency/backend/schema
files are unchanged; no database/provider operation or backend/PG rerun occurred.
Both builds retain the existing bundle-size warning. The separate independent
critical read-only review returned **APPROVE** for this scoped Level A change,
with no remaining required corrections; its independent changed-file run passed **19/19**.
That review grants neither native acceptance nor Git authorization; real-user
launch remains blocked.

Historical SEC.1B-3C.3B assessment, **2026-11-05**, then-uncommitted browser-blocker
remediation on `ray-2-postgres`, verified baseline
`57db448149f091634dcb011b920fd20c24f5ebbe`; working tree/index were clean and local
tracking was **0 ahead / 0 behind**, without fetch. SEC.1B-3C.2 is committed at
`5fa5cc73e7d7ec06885c706364c59862f86301af`; the independently approved
[3C.3A read-only recovery correction](security/sec-1b-3c-3a-session-recovery.md)
is committed at the current baseline. Its dated 199/199 frontend and 68/68 focused
results remain evidence for that stage, not new native-browser acceptance.

**Actual browser acceptance was attempted and rejected:** the user-supplied Work
review exercised Windows Chrome against local PostgreSQL preview at `57db448...`
and returned **REJECT / REVISE**. C3B-R01 is a Leaflet `_leaflet_pos` teardown
exception/blank screen during navigation or session changes. C3B-R02 is the lack
of an initial keyboard-only manual Report location without geolocation. These
are observed pre-fix failures, distinct from the earlier unavailable browser
tooling. The findings were supplied for this 2026-11-05 task; no separate browser
run timestamp or additional passes are inferred.

The [3C.3B remediation report](security/sec-1b-3c-3b-browser-remediation.md) records
the lifecycle correction, keyboard center/clear controls, valid-location guard,
geolocation cancellation and its evidence. At that task's handoff, post-fix native
acceptance remained **NOT_TESTED**: its browser inventory reported the browser access
host unavailable. Automated/simulated checks do not overturn the Work rejection
or establish an actual browser pass. The existing real-user release decision
and all applicable blockers below remain open.

**SEC.1B-3C.3B local verification, 2026-11-05:** focused map/report regressions
**40/40**, full frontend **218/218**, both frontend builds, both no-emit TypeScript
checks and targeted lint/syntax pass. The new map tests execute installed React,
React Leaflet, Leaflet, actual MapPage/router and Redux against a bounded DOM
double; the Report tests use controlled production callbacks/hooks/HTTP. The
original viewport fails six of the final map tests when substituted in memory;
the missing Report center button also failed before correction. These results
support local remediation, not native layout, keyboard, two-tab scheduling or
screen-reader acceptance. Backend/PG code is unchanged and not rerun; no provider
or database operation occurred. The existing bundle-size warning remains.
The separate independent read-only code review returned **APPROVE** for that scoped
local change after a map region-role correction and revalidation. At that handoff,
no confirmed Level A commit blocker remained; automated checks did not overturn
Work's native rejection or close real-user gates. The newer supplied native
successes are recorded above. Neither review authorizes Git writes.

Historical SEC.1B-3C.2 assessment, **2026-11-03**, then-uncommitted client session
and protected station integration on `ray-2-postgres`, baseline
`2363ac511c6c4be5ca445c389d06e895e3cd1310`; SEC.1B-3C.1 and its reviewed
runbook correction are committed. Initial implementation preflight was clean;
the corrective follow-up preserved 55 intentional paths and an empty index.
Local tracking then remained **0 ahead / 0 behind** without fetch. The
[client implementation report](security/sec-1b-3c-2-client-integration.md) records its
automated/HTTP/PG evidence, the independent **REVISE BEFORE COMMIT** verdict and
its five corrections, plus blocked browser acceptance. Historical 3C.1 wording
below describes its implementation stage.

Historical QG.1/SEC.1B-2 assessment, **2026-10-26, Asia/Jerusalem**: branch **`ray-2-postgres`**, baseline **`ad724dcd7f7a9d60be747eaf191f74210f7de70d`** (QG.1), with SEC.1B-2 implementation then uncommitted. Its preflight tree was clean and local upstream 0/0 without fetch. Its dated evidence below remains historical.

**Decision: NOT ready for a closed pilot with real users or public production.** Applicable BLOCKER items below require resolution and evidence before launch. Local development and guarded synthetic demonstrations have useful evidence; they do not establish readiness for real identities, animal locations or images.

**First-beta policy APPROVED; backend VERIFIED locally; client implemented with browser acceptance incomplete:** the product owner authorizes
every current authenticated account to discover/view all stations and their precise
locations, shared summaries and attached images, and record feedings at active
stations. Guests remain denied; creator-only management and author-only history,
minimized summaries, private phone protection and separate Report policy remain.
The hybrid audience/default/publication and invitation/grant roadmap are
**SUPERSEDED FOR BETA**, with historical decisions retained in the
[design's authoritative section 17](security/station-visibility-design.md#17-sec1b-3c0-approved-first-beta-policy-and-implementation-plan).
ALL includes inactive discovery/viewing; inactive feeding remains denied.

The committed backend implements that audience through the shared current-account
predicate, including both media issuers. Collection/detail/create DTOs omit
`visibility`; discovery includes `active`. Explicit creation `visibility` receives
400 in plain and media-enabled PostgreSQL compositions. Migration 0007, defaults,
constraints, classifications and grant records remain unchanged as dormant
metadata; no schema migration/backfill/drop or persistent preview operation occurred.
Creator authority, author-only logs, minimized summaries, provider signing/attachment/
owner protections and legacy station/feed refusal remain intact in local regressions.
The current client work adds authenticated DTO/paging, summary/own-history,
session/state fencing and map/media cleanup, verified at the tiers below.
**Do not deploy until actual browser acceptance is complete, or mix old/new clients
or JSON/media policies across backend instances.**

Registration establishes an account, **not trust**: malicious self-registration
would disclose all precise locations, including formerly sensitive stations.
Existing local rate limits do not establish sufficient enrollment, distributed/
multi-account abuse protection, moderation or incident handling. Accurate real-data
audience/provider notices, personal-data access/deletion/retention/takedown and
qualified privacy review remain release gates. No invitation-only enrollment rule
or safety guarantee is inferred from this policy approval.

The simplified sequence is backend policy/DTOs without schema change; real-PG/media
regressions; mandatory auth-generation/cross-tab/typed-error foundation followed by
protected station/map/media client integration; Hebrew/mobile/browser acceptance
and independent critical review; fixes/revalidation; explicit Git approval.
Grant/reference screens and their lifecycle are removed from beta dependencies.
Session/password policy, actual client isolation and authenticated-image browser
verification, remaining S3 checks, distributed abuse, accessibility/welfare,
dependencies, production configuration, backup/restore/monitoring and all applicable
real-data blockers remain open. No deployment readiness is granted.

**Historical SEC.1B-3C.2 evidence, 2026-11-03:** client auth-generation, guarded
identity-only persistence, cross-tab event/focus checks, session/request fencing,
typed failures, all-page station reads, separate feeding summaries/own history and
keyed Leaflet/media cleanup are implemented. Corrective revalidation passes
frontend **174/174**, backend **252/252**, disposable PG **172/172**, all three
builds and targeted static checks. Actual client HTTP/PG verifies 101 tied history
rows across pages, receipts, A/B isolation, inactive409/stale-detail fencing,
fresh recovery and failed/durable logout outcomes. Initial image HTTP evidence
used real parent issuance with controlled HTTPS bytes; that extra image probe was
not rerun in this follow-up. No live storage call. **Browser verification was
blocked when Computer
Use could not verify the active Windows URL; actual two-tab/BFCache, Leaflet camera,
decoded image/CORS, 320/390px and keyboard/reader acceptance remain NOT_TESTED.**
Old pre-fencing credentials require one fresh login. The independent review found
no Critical/High issue, two Medium commit blockers (logout feedback and StrictMode
dialog close) and three Low findings (stale storage deletion, history ties and
uncached inactive detail). All five have corrections and focused regressions in
the [follow-up ledger](security/sec-1b-3c-2-client-integration.md#independent-review-corrections-and-current-revalidation).
Failed durable logout now rejects, purges locally and retains an accessible Hebrew
shell warning explaining device-storage/refresh risk; recovery is fenced against
newer sessions. Unavailable storage may retain credentials. Client cleanup does
not revoke issued server JWTs. The original review verdict is retained, not
replaced by an invented follow-up approval. No Git writes or real-user release
approval.

**Historical SEC.1B-3C.1 verification, 2026-11-03, now committed:** backend build and **252/252**
ordinary tests, full guarded disposable PostgreSQL **172/172**, frontend **94/94**,
normal and PostgreSQL frontend builds, targeted lint/syntax and documentation checks
passed. Real PostgreSQL evidence covers identical authenticated station audiences,
inactive discovery/feeding rejection, dormant metadata, creator authority, private
feeding projections, media parent rechecks and independent-session lock waits.
Storage/signing used doubles; no browser or live-provider evidence was added.
Both frontend builds retain the existing >500-kB chunk warning. No client,
dependency or schema files changed. The disposable test service was stopped;
persistent dev/preview services remained stopped. Its subsequent independent
read-only review returned **APPROVE WITH CHANGES**; the R-01 S3 opening-notice
correction was incorporated before the committed 3C.1 baseline. That review does
not cover the then-uncommitted 3C.2 client implementation.

**SEC.1B-3B.1 local follow-up, 2026-11-03:** the
[station privacy foundation](security/sec-1b-3b-1-foundation.md) adds migration
`0007_station_visibility` and internal transaction-bound authorization helpers.
Verified on disposable PostgreSQL only: full old-row/geometry/media/journal
preservation, constraints, policy matrix and five lock-order cases; backend
**240/240**, PostgreSQL **143/143**, frontend **88/88** tests, both frontend builds
and backend build passed. Historical migrations remain unchanged. The persistent
preview was not migrated or queried. **At that foundation stage, existing station
JSON/media routes and Mongo station routes remained unprotected by the new ACL.**
No frontend privacy control was enabled; that partial rollout was not deployable.
JSON/media/legacy authorization, client fencing and real-pilot blockers were open.
That foundation's evidence is historical; current endpoint evidence follows below.

**Historical SEC.1B-3B.2 implementation/follow-up, 2026-11-03, now committed at
`ea63a0dd...`:** based on committed foundation
`165f9127fc5159ff2c89f4251be03896e655d0e5`, the
[endpoint privacy implementation](security/sec-1b-3b-2-endpoint-privacy.md) protects
PostgreSQL station JSON, author-only feeding history/shared summaries and both
station-media read issuers together. Legacy/default station and grant namespaces
now refuse all methods/children with 503; no public fallback. Authenticated regular
viewers may feed; sensitive access requires creator or active creator-issued grant.
The owner approved the section 16.3 feeding contract, including parent-access-required
own history after revocation with stored logs preserved. Backend **242/242**,
disposable PostgreSQL **167/167**, frontend **94/94** and all three builds pass;
the linked report records exact commands, lint limitations and evidence tiers.
No schema/dependency
change, persistent preview operation or live cloud operation occurred.
The owner's follow-up confirms that `no-record` concerns Ray's records, not whether
cats were fed; shared buckets disclose no feeder identities, exact individual
timestamps or private notes. Revocation preserves stored records while denying
station-scoped own history. Future personal-data access/deletion processes remain
a separate unresolved release-readiness requirement.
**At that historical stage, client auth/session/cross-tab fencing, protected
state/map cleanup and the later Hebrew UX were incomplete.** Current 3C.2 evidence
is recorded above; full browser privacy acceptance and real pilot/production remain
blocked. A separate independent critical read-only review
was performed for that batch: **APPROVE WITH CHANGES**, with R-01/R-02 corrections
and revalidation recorded in its report. This is not review or runtime evidence
for the newly approved beta policy; Git writes are not authorized here.

This is the current snapshot. The [Release Quality Gate](RELEASE_QUALITY_GATE.md) defines the permanent standard, release levels and change-based verification. [SEC.1B-2](security/sec-1b-2-abuse-protection.md) adds verified scoped local API limits and durable per-owner media issuance reservations. Distributed API enforcement, global retained-media budgets and distributed processing remain unresolved. Its verification is distinguished below from reused historical evidence; no live AWS/Cloudinary operation was performed.

## Application modes and release levels

| Level or mode | Current position |
| --- | --- |
| Local development | Supported by existing local commands and guards. Use synthetic data and the [preview runbook](migrations/postgres-preview.md); stop only task-owned processes. |
| Synthetic-data demo | Guarded local PostgreSQL demonstrations have browser evidence. Media is disabled by default; activation is separately gated. A publicly hosted demo needs exposure/configuration review and applicable abuse controls. |
| Closed real-user pilot | **Blocked.** A restricted audience does not remove privacy, security, operational or critical accessibility requirements. |
| Public production | **Blocked.** No verified production PostgreSQL/S3 deployment is established. |

Normal backend `dev`/`start` still select MongoDB through [server startup](../server/server.ts) and [legacy composition](../server/app.ts). Requests reaching retired `/api/upload`, `/api/feeding-stations` and `/api/station-access` namespaces receive 503 before parsing or provider access; existing CORS origin/preflight handling runs earlier. Cloudinary/Multer dependencies and unused legacy files remain for focused cleanup. Unrelated legacy auth/report behavior remains; no Mongo station/feed writes or reads are exposed.

The [PostgreSQL preview](../server/preview/runtime.ts) binds the API to `127.0.0.1:4001`, with frontend PostgreSQL mode at `127.0.0.1:5175`. It uses guarded synthetic storage, explicit migrations and a dedicated secret; it is not production composition. Private S3 support is opt-in. In the current review tree, station image capabilities require authoritative parent authorization; Report images retain their independent existing audience. Previously issued URLs/cached or saved bytes cannot be immediately revoked. Content references still use the loopback API. No persistent preview upgrade or S3 activation was performed in this batch.

Implemented capabilities include Hebrew/RTL login and registration, authenticated PostgreSQL station reads/creation and feeding coordination, guest reports without images, report claiming/resolution, and directly loaded account-scoped assigned reports. The committed 3C.2 client uses current DTOs, pagination, Bearer credentials and session fencing with automated and synthetic HTTP/PG evidence. Selected supplied Work browser checks now pass at `6063cf2...`; remaining targeted privacy/media/recovery/accessibility acceptance is incomplete as recorded above. PostgreSQL transactions and media ownership/attachment controls have integration evidence. NGO/municipal roles, dispatch/acceptance integrations, a private case tier, and sterilization workflows are not implemented.

## Evidence reused

| Evidence | Actual result and boundary |
| --- | --- |
| [SEC.1B-2, 2026-10-26](security/sec-1b-2-abuse-protection.md#verification-evidence), review tree based on `ad724dcd...` | Backend build and **233/233** tests; disposable real-PostgreSQL **127/127**; frontend normal/preview builds and **88/88** tests; targeted client lint passed. Controlled-clock HTTP/core tests cover 429/recovery, proxy headers, account separation and rejection before side effects. Real PG tests prove rolling count/bytes, all-state accounting, independent-pool races and post-lock admission timestamps with storage doubles. Real browser + API + disposable PG verified keyboard login 429/Hebrew wait, retained fields, same-process controlled-clock recovery, successful login and assigned-page loading using a lower test-only login threshold; no screenshot or broad accessibility certification claimed. No live cloud or persistent preview data used. |
| [SEC.1B-1, 2026-10-26](security/sec-1b-1-remediation.md#executed-verification), implementation stage based on `44839a29e1b1854c76821a5957c8db0c3943c707`, committed at `ffb020fc...` | Backend build and **207/207** tests; disposable real-PostgreSQL **122/122**; frontend normal/preview builds and **77/77** tests; targeted client lint, JS syntax and whitespace checks passed. Parser-survival tests used isolated children of both actual apps. Storage/signing tests used synthetic fixtures/doubles. These are prior-stage results; the current larger suites also retain those regressions. |
| [UX.1 localization](localization.md#browser-evidence), 2026-10-25 | Actual browser/API/PostgreSQL synthetic workflows, Hebrew errors, selected keyboard/focus checks and 320/390 CSS-pixel layouts. Media disabled; local media previews were labelled fixtures. No physical-device or comprehensive accessibility certification. |
| [UX.2 reliability](ux2-reliability.md#browser-evidence), 2026-10-25 | Actual direct assigned-report loading, refresh, account change, claim/resolve and outage/retry; invalid-token reauthentication. Race/restoration cases use labelled fixtures. Timed JWT expiry and physical-device checks were not run. |
| [S3.1 acceptance ledger](migrations/s3-media.md#development-checkpoint-closeout-2026-09-24), September 2026 | Prior real browser station/report uploads, normalized display, logout guest display and refresh/API-restart persistence. Separate live Node checks covered altered signed headers/length, replay and expired/fresh reads. PostgreSQL/mock evidence covers concurrency, ordering, rollback, quotas, leases and orphan cleanup; those are not live-S3 certifications. No current cloud state was rechecked. |

## Current checks and required actions

Status describes the evidence for the **actual result**, not an overall pass: `VERIFIED` may establish a confirmed failure. `NOT_TESTED` means a known check has not been performed; `UNKNOWN` means the relevant state/decision is unestablished; `EXTERNAL_DEPENDENCY` requires an external party or environment; `NOT_APPLICABLE` records scope exclusion. Severity applies to an unresolved finding at the stated release level; `—` means no finding in the stated evidence. Owner roles below are **TBD**, not assigned people.

| Requirement / applicability | Method and evidence | Status | Actual result | Severity | Next action / owner role (TBD) |
| --- | --- | --- | --- | --- | --- |
| Safe request parsing, bounded validation, retired anonymous upload | Actual-app child survival, schemas, HTTP regressions; [SEC.1B-1](security/sec-1b-1-remediation.md) | VERIFIED | SEC-001/004 and anonymous exposure SEC-002 remediated. Parser/shared error-handler portion of SEC-013 fixed. | — | Preserve regression coverage; Engineering. |
| Correct auth, assigned isolation, report transitions and feeding persistence | Contract/real-PG tests; UX.1/UX.2 browser evidence above | VERIFIED | Tested PG ownership, concurrency, timestamps, direct refresh and retry paths held. This does not grant private access or certify production. | — | Recheck affected boundaries when code/configuration changes; Engineering. |
| Map teardown and initial keyboard Report location | [3C.3B correction](security/sec-1b-3c-3b-browser-remediation.md); [new supplied Work results at `6063cf2...`](security/sec-1b-3c-4-browser-acceptance.md#native-evidence-already-supplied-by-work) | VERIFIED for supplied covered native paths | Earlier Work rejection at `57db448...` is historical. Newer Work reports crash-free navigation/logout, two-tab mounted cleanup and keyboard location selection/clear/reselection at measured 320/390px. | — for these covered cases; wider acceptance remains open | Preserve evidence; repeat only after relevant change. Complete remaining targeted error/media/BFCache/accessibility cases; Engineering, Accessibility. |
| Scoped local API rejection and recoverable Hebrew feedback | Controlled-clock core/HTTP and frontend callback/store tests; [SEC.1B-2](security/sec-1b-2-abuse-protection.md) | VERIFIED | Separate ingress/auth/registration/guest/account/read limits, bounded maps, socket-only attribution and positive Retry-After; forms retain drafts and do not retry automatically. General counters are local to each app instance and reset on restart. | — for verified local scope | Preserve regressions; review shared-IP thresholds against intended deployment; Engineering, Product. |
| Durable per-owner media issuance reservations | Independent-pool/lock-wait/rolling-window tests on disposable PG; [SEC.1B-2 media budgets](security/sec-1b-2-abuse-protection.md#durable-media-issuance-reservations) | VERIFIED | Existing six outstanding/ten per minute plus 120 intents and 256 MiB declared source bytes per rolling 24 hours, all states counted under the existing owner lock. No insert/sign after rejection; no schema change. Not actual retained/output/global storage accounting. | — for verified reservation scope | Preserve SQL admission/ownership/transaction tests; size historical aggregate queries for production; Engineering. |
| Distributed abuse/resource bounds before exposed pilot APIs | [SEC-003/007](security/pre-pilot-security-audit.md#findings--missing-protections-with-demonstrated-risk) and [SEC.1B-2 limitations](security/sec-1b-2-abuse-protection.md#remaining-release-gates-and-follow-up) | VERIFIED | Local API limits and durable owner issuance controls improve the system, but shared API enforcement, reviewed proxy attribution, pagination, global/cross-account retained-byte budgets and distributed completion capacity remain open. | BLOCKER for intended exposed APIs/paid media | Define enrollment/moderation, shared atomic quotas/edge enforcement, retention/output/global budgets and production identity; enforce and verify across processes; Product, Engineering, Operations. |
| Password, session and remaining error boundaries before real accounts | [SEC-006/011/013](security/pre-pilot-security-audit.md), SEC.1B-1 remaining scope | VERIFIED | Bcrypt truncates beyond 72 UTF-8 bytes; copied seven-day bearer tokens survive local logout. Controller-specific errors/logs still need review. | BLOCKER for real-account policy and safe handling | Decide compatible enrollment/session/recovery policies; fix/test remaining unsafe paths; Product, Security, Engineering. |
| Legacy claim integrity if Mongo remains exposed | Adapter probe and PG comparison; [SEC-005](security/pre-pilot-security-audit.md#sec-005--legacy-claim-race-can-overwrite-the-winning-assignee) | VERIFIED | Legacy claim race remains; PG locking tests passed. | BLOCKER if legacy serves pilot reports | Exclude legacy from pilot routing or fix and verify race; Engineering, Operations. |
| Explicit identity/location/routine/image audience before real data | [SEC.1B-3C.2 client evidence](security/sec-1b-3c-2-client-integration.md), [3C.1 backend](security/sec-1b-3c-1-beta-access.md), [3C.4 scope/evidence](security/sec-1b-3c-4-browser-acceptance.md); [approved beta plan](security/station-visibility-design.md#17-sec1b-3c0-approved-first-beta-policy-and-implementation-plan); [SEC-008/009](security/pre-pilot-security-audit.md#findings--privacy-and-product-decisions) | VERIFIED backend/automated logic and supplied selected browser paths; remaining native acceptance incomplete | All-current-account audience, minimized summaries, author-only history and parent-media checks retained. Work reports basic account-history isolation and two-tab logout cleanup; delayed-response/native-media/BFCache boundaries remain untested. Malicious enrollment, public Report data, copies and notice/operating risks remain. | BLOCKER for real data | Complete remaining targeted native checks and establish enrollment/abuse/notices/operating readiness; Product/privacy, Engineering, Security, Operations. |
| Retention, deletion/takedown and external-media policy | Lifecycle/source review; [SEC-010/012](security/pre-pilot-security-audit.md); [station external-image suppression](security/sec-1b-3b-2-endpoint-privacy.md#json-projections-and-compatibility) | VERIFIED for recorded scope | Attached originals/outputs retained without app removal. PG station external URLs are rejected on new writes and suppressed on protected reads without rewriting old strings; Report external-image policy remains separate and open. | BLOCKER before real images/data under the chosen mode | Decide original necessity, periods, removal/request handling and Report/host policy; implement retry-safe lifecycle; Product/privacy, Engineering, Operations. |
| Remaining dependency risk disposition | Prior SEC.1B-1 audit JSON comparison and [dependency report](security/sec-1b-1-remediation.md#dependency-changes) | VERIFIED | Prior snapshot: server **12** affected packages (4 moderate/7 high/1 critical), client **21** (2 low/4 moderate/14 high/1 critical); body-parser/qs/Zod findings removed. SEC.1B-2 changes no dependencies/lockfiles and does not rerun the registry audit. Historical audit exits were 0 despite findings. | BLOCKER for unresolved reachable runtime risk; tooling assessed separately | Refresh audit/reachability review for the relevant release or dependency work; remove retired dependencies or apply scoped fixes; Security, Engineering. |
| Complete media security acceptance before S3 activation | [S3 ledger and named gaps](migrations/s3-media.md#remaining-release-gates), [SEC-017](security/pre-pilot-security-audit.md#sec-017--full-s3-acceptance-remains-incomplete) | NOT_TESTED | Browser wire/preflight and token/cookie inspection; same-length payload checksum mismatch; corrupt live completion; ready-unattached/cross-owner-ready and broader parent visibility; controlled expiry/interruption/retry; invalid files/counts; S3-specific guest/disabled no-image flows; live ready-completion idempotency remain open. | BLOCKER for media activation | Approve applicable bounded follow-up using retained ledger; preserve signing/size/ownership controls and evidence tiers; Security, Engineering. No cloud action authorized here. |
| Effective S3 and production identity/configuration | Prior restricted dev SDK identity; [SEC-016/017](security/pre-pilot-security-audit.md#verification-gaps-and-operations) | UNKNOWN | Effective out-of-prefix permissions and production compute role/TLS/origin/proxy/DB-TLS/secret configuration unverified. Templates and local results do not establish deployed controls. | BLOCKER for real-user deployment | Establish intended PG/S3 composition, least privilege and configuration failure tests; Operations, Security. |
| Backup, restore, rollback, monitoring and incident response | Runbook/repository inspection; [SEC-016](security/pre-pilot-security-audit.md#sec-016--production-postgresqls3-operating-controls-are-not-established) | NOT_TESTED | No demonstrated production restore, coordinated DB/object recovery, migration recovery, alert response, retention enforcement or credential-revocation exercise. | BLOCKER before real data | Assign operational ownership/recovery objectives; demonstrate synthetic restore/recovery and alarms in intended environment; Operations, Engineering. |
| Secrets/credential lifecycle and log handling | SEC.1A selected tracked-file patterns and SEC.1B-1 error regressions | UNKNOWN | No selected-source secret match was found historically; comprehensive history/runtime secret review, production rotation and full client/storage/log inspection are not established. | BLOCKER for credential-bearing deployment | Perform scoped secret/config/log review without disclosing values; document rotation/revocation; Security, Operations. |
| Accessible critical workflows and mobile use | Historical UX.1/UX.2/SEC.1B-2 evidence; [supplied Work checkpoint and remaining gaps](security/sec-1b-3c-4-browser-acceptance.md) | VERIFIED selected keyboard/RTL/measured-width paths; broader acceptance NOT_TESTED | Work passed Report keyboard location selection/clear/reselection at actual CSS widths 320/390 and selected critical Hebrew/RTL flows. This does not verify screen-reader announcements, all recovery/dialog/focus journeys, zoom/reflow, contrast or physical-device behavior. | BLOCKER for inaccessible or materially unverified critical pilot actions; other defects SHOULD_FIX | Complete targeted reader/keyboard/recovery/reflow cases without repeating valid completed checks; Accessibility, Engineering. |
| Privacy notice, accessibility statement and applicable obligations | [Route inspection](../client/src/App.tsx), [heading-only About](../client/src/pages/about/About.tsx), qualified scope/content review | EXTERNAL_DEPENDENCY | No privacy/accessibility/terms routes or publication evidence established; qualified determination of applicable obligations is outstanding. Code/automation cannot certify compliance. | BLOCKER where applicable to pilot/production | Obtain qualified scope review and prepare accurate notices, contact and statement; Product/privacy, qualified reviewer. |
| Animal-welfare wording and trustworthy care status | [Rendered emergency option](../client/src/components/reportForm/ReportForm.tsx), [Hebrew resources](../client/src/i18n/locales/he.ts), [localization semantics](localization.md) | VERIFIED | Emergency reporting is offered without rendered emergency-service limitations/escalation guidance. No monitoring/dispatch/municipal acceptance integration exists. Feeding/water copy distinguishes recorded actions, but full welfare acceptance is outstanding. | BLOCKER before real-user emergency reporting | Add truthful reporting-versus-response guidance and appropriate escalation information, reviewed for intended service; verify statuses and advice; Product/domain or qualified reviewer, Engineering. No legal violation is asserted. |
| Performance, navigation and public discovery | Representative-device/data checks; browser link/deep-link/error routes; metadata/social-preview review | NOT_TESTED | Existing builds warn about a >500-kB bundle. No representative load/performance budget or complete navigation/broken-link/SEO/social audit; only a client template README and SPA rewrite exist. | SHOULD_FIX; critical failures become BLOCKER | Measure intended scale/device behavior; inspect public routes/metadata/share cards and links; Engineering, Product. SEO is inapplicable to private views. |
| Remaining validation/enumeration improvements | [SEC-014/018](security/pre-pilot-security-audit.md) | VERIFIED | Registration reveals membership; API geographic ranges still differ from PG constraints. Neither is a standalone pilot blocker in the audit. | SHOULD_FIX | Record enrollment disclosure decision; add coordinate boundary 400s while retaining DB checks; Product/privacy, Engineering. |
| Repeatable CI | Repository/package inspection | VERIFIED | Existing local commands available; no checked-in CI workflow found. Backend has no ESLint setup. | SHOULD_FIX | Add a small future CI baseline using the gate's existing build/test/static checks; Engineering. No workflow added in QG.1. |
| Future sterilization/neutering workflow | Report-domain/source review | NOT_APPLICABLE | Not implemented or deployed. Current reports have general/food/emergency types. | BACKLOG | Add future coordination/observations/collection/outcome checks within the shared Report domain when scoped; Product, Engineering. |

Closing a finding requires evidence for the intended mode/environment, not a changed label. Product acceptance cannot waive a known exploitable control failure. An untested check becomes a release blocker when it leaves a material security, privacy, integrity, operational or critical-workflow risk unresolved; unrelated visual refinements do not automatically block a release.

## Historical-document interpretation

- SEC.1B-3C.0 design statements such as NOT_IMPLEMENTED and its `ea63a0dd...` preflight describe the approved documentation-only stage. SEC.1B-3C.1's linked report records the committed backend; 3C.2's then-uncommitted client evidence is now committed at `5fa5cc7...`, with its independent verdict/corrections and historical browser gaps retained. The current 3C.4 ledger distinguishes newer supplied Work successes from remaining native gaps and local doubles. Sections 1-16 retain superseded hybrid decisions. The S3 runbook's corrected opening describes the implemented authenticated beta audience and separate Report policy; historical procedures, evidence and unresolved media gates remain applicable within their recorded boundaries.
- The audit's follow-up and SEC.1B-1 report describe an uncommitted review tree at `44839a29...`; that implementation is now committed at `ffb020fc...`. Their test evidence remains attributed to that stage.
- The S3 runbook's old HEAD/uncommitted/staging statements and early blocked-browser result are historical. S3.1 is committed in ancestor `a0dccb8733229fbca47c700bdacb67657ce6c9f2`; its September 24 closeout supersedes the earlier functional blocker, while named acceptance gaps remain open. Historical dependency counts are superseded by SEC.1B-1, not silently rewritten.
- The original preview runbook's preserved legacy-upload behavior, six-migration description and separate-future-S3 wording describe its original milestone. Current legacy uploads are retired; migration 0006 and opt-in media are documented by S3.1. No historical import/Cloudinary transfer is required for Ray's fresh stores.
- Localization's remaining direct-refresh/password-gate defects were fixed by UX.2. UX.2's statement that passwords had no maximum predates SEC.1B-1's generic transport bound; the eight-code-point minimum/raw hashing behavior and unresolved bcrypt byte-truncation issue remain distinct.

Historical QG.1 documentation validation on 2026-10-26: **VERIFIED / PASS** for 41 repository link/anchor references, six package-script references plus the existing frontend test glob, sensitive-pattern screening, independent source/evidence review, `git diff --check` and explicit whitespace/final-newline checks on its three new files. That milestone changed only `AGENTS.md` and the two release documents. It ran no application, accessibility, audit or provider verification. Current SEC.1B-2 evidence and scope are recorded in its linked report.

This snapshot does not authorize deployment, live media verification, cleanup, data resets, credential changes or Git writes. Reassess against the permanent gate after relevant code, policy, dependency, environment or provider changes.
