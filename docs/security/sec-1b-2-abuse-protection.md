# SEC.1B-2 - Scoped API abuse protection and media issuance budgets

Date: **2026-10-26, Asia/Jerusalem**. Branch: **`ray-2-postgres`**.
Baseline: **`ad724dcd7f7a9d60be747eaf191f74210f7de70d`** (QG.1).

**Local defensive implementation; real-user pilot and production remain blocked.**
This partially addresses **SEC-003** (API abuse) and **SEC-007** (media budgets).
General request counters are bounded and process-local. PostgreSQL media issuance
reservations are shared and durable per owner. This does not establish distributed
API enforcement, global/lifetime retained-storage quotas or DDoS protection.

## Preflight and scope

The initial tree was clean on the requested branch. QG.1 `ad724dcd...` and SEC.1B-1
`ffb020fc8ad274cac368572f41dbd2f15da09801` were committed; S3.1, UX.1, UX.2 and
SEC.1A remain ancestors. Locally recorded `origin/ray-2-postgres` matched HEAD,
**0 ahead / 0 behind**. No fetch was performed; remote freshness is unknown.
Read root [AGENTS.md](../../AGENTS.md), the [quality gate](../RELEASE_QUALITY_GATE.md),
[readiness](../RELEASE_READINESS.md), [audit](pre-pilot-security-audit.md),
[SEC.1B-1](sec-1b-1-remediation.md), [preview](../migrations/postgres-preview.md)
and [S3 runbooks](../migrations/s3-media.md), plus actual routes, persistence and tests.
No nested AGENTS instructions were found.

The normal entry still composes MongoDB; the PostgreSQL application is an isolated
loopback preview, not production infrastructure. This change keeps those modes,
JWT semantics, public visibility, ownership, transitions and database contracts.
No new role, workflow, schema migration or managed service was introduced. No
AWS/Cloudinary API, real storage operation, IAM change, deployment or persistent
preview reset was performed. Git writes are left for review.

## Threat/resource analysis and protected operations

All JSON/form requests retain SEC.1B-1's **512-KiB decoded body**, field/structure
bounds and bounded errors. Images remain separate signed raw transfers, not API
body bytes. Authentication below means the existing JWT verification plus stored
identity lookup; optional report authentication still falls back to guest when
the bearer is invalid. No quota uses a supplied email, actor field or token text.

| Operation | Authentication / available identity | Work, existing controls and expected use | Added protection |
| --- | --- | --- | --- |
| Login | Guest; socket IP/subnet | Credential lookup and bcrypt comparison; ordinary retries/shared-IP login bursts. Generic invalid-credential behavior retained. | IP attempt window before schema/controller/database/password work; ingress first. Successful and failed admitted attempts count alike. |
| Register | Guest; socket IP/subnet | Email lookup, bcrypt hash and account insert; occasional enrollment, including shared-network cohorts. | Separate IP enrollment window before validation/hash/insert; no email-based lockout or new membership disclosure from rate-limit responses. Existing duplicate-email behavior remains a separate finding. |
| Create report | Optional JWT; verified account or socket guest | Bounded description/media fields; parent insert and optional transactional attachment. Guests retain no-image reporting. | Guest IP budget or verified-account write budget, after existing optional auth and before validation/store work. |
| Claim/resolve report | JWT; verified account | Stored-assignee checks, writes and PostgreSQL lock/recheck; repeated actions or races. | Shared account write budget after auth, before controller/store. SQL ownership/race behavior unchanged; legacy SEC-005 remains open. |
| Create station | JWT; verified account | Bounded name/location/text, insert and optional atomic media attachment; occasional new stations. | Shared account write budget before validation/insert. |
| Create feeding log | JWT; verified account | Station lookup, active-state checks and timestamped log insert; feeders visiting multiple stations. | Same account write budget before validation/station lookup/insert. |
| Lists/details/history, assigned lists/statistics | Guest or existing JWT route; socket IP/subnet | Queries and response serialization; repeated map/list refreshes and aggregates. Lists still lack pagination/result-size bounds. | Shared read budget before query; protected read routes apply it before auth lookup as well. |
| Media capabilities/content | Guest reads; socket IP/subnet | Capabilities are cheap; content resolves attachment/parent and signs a short read capability. Existing public attached-parent policy retained. | Read budget before lookup/signing; ingress first. Does not cap reuse of an already issued signed URL at S3. |
| Issue media intent | JWT; stored owner UUID in PostgreSQL | Validate intent, lock user, reserve asset then sign; existing six outstanding and ten/minute limits. | Durable rolling owner count/declared-byte budgets before insert/signing; API ingress bounds pre-auth work. |
| Complete/normalize media | JWT; verified owner | Existing ten attempts/minute, 1,024-owner map, two local workers/one per owner, row lease, spacing/five attempts, source size/hash and bounded decoder. | Retain these controls without a duplicate generic completion quota; canonical owner key, deterministic local-clock tests and useful Retry-After. |
| PostgreSQL `/readyz` | No JWT; socket IP/subnet | One SQL readiness query per admitted probe. `/healthz` is cheap process liveness. | Both ingress and read budgets before SQL; health stays available without these counters. |

Request attempts and object/processing reservations serve different purposes.
Domain limits count attempts, including invalid schema or failed writes once the
scoped middleware is reached. Failed/duplicate mutations cannot create extra
rows after a rejection. PostgreSQL claim/attachment locks and leases continue to
handle concurrent state transitions; rate limiting is not their replacement.

## Request limits, identity and rejection

`server/security/abuseProtection.ts` provides a small synchronous fixed-window
counter with deterministic clock/configuration injection for tests. A custom
counter supplies bounded-capacity state and joint admission without adding a
dependency. There are no new packages,
timers, unbounded queues, raw request objects or external quota services.

| Class | Effective default | Identity / rationale |
| --- | --- | --- |
| Ingress, including API, readiness and unknown paths | **600/minute per socket IP/subnet** plus **6,000/minute per application instance** | Coarse protection before JSON/form parsing and JWT/database work; ample headroom for a small group sharing a network. The instance ceiling bounds work from rotating identities. Cheap liveness and the early retired-upload refusal bypass parsing and these counters. |
| Login | **120/15 minutes per socket IP/subnet** | Allows shared-network login bursts while bounding repeated bcrypt/lookup attempts; no user-supplied account key. |
| Registration | **60/hour per socket IP/subnet** | Allows cohort enrollment without treating every write as signup; bounds hashing/account churn from one peer. |
| Guest report creation | **30/hour per socket IP/subnet** | Allows multiple community reports/shared-network users; limits anonymous inserts. |
| Authenticated domain writes | **120/10 minutes per verified account**, shared across reports/actions/stations/feedings | Supports bulk care rounds and corrections without allowing a token, IP or route switch to reset that account's mutation allowance. |
| Public/expensive reads | **300/minute per socket IP/subnet**, shared across covered read routes | Headroom for map/history refreshes and images; limits repeated query/signing work. |

Windows begin with an identity's first admitted use and reset at their recorded
expiry. Policy values are constructor inputs for controlled tests, not an HTTP
or environment bypass. Production construction uses these defaults. Separate
middleware instances created by separate applications do not share counters.

Each of the six identity classes has at most **10,000 live buckets**, plus one
static global-ingress bucket. Expired entries are swept periodically (normally
at most once/minute) or when capacity can be reclaimed. Live entries are never
evicted to admit new identities. At capacity, new identities receive 429 until
the earliest expiry; existing identities retain their own remaining allowance.
Counters do not retain submitted credentials, emails, JWTs or bodies. Ingress
checks its peer and instance counters synchronously before debiting either;
ingress-rejected peers cannot consume another ingress bucket. A later scoped
rejection still counts as ingress work already performed.

IP identity comes exclusively from `req.socket.remoteAddress`, **not** `req.ip`,
`X-Forwarded-For`, `Forwarded` or `X-Real-IP`. IPv4-mapped IPv6 addresses normalize
to IPv4; native IPv6 is canonicalized/grouped by **/56** so temporary address and
/64 rotation within that allocation does not create fresh keys. Missing/invalid
peer addresses share a bounded unknown bucket. Both apps explicitly use
`trust proxy:false`, replacing the legacy unreviewed one-hop setting. No request
header can enable proxy trust. Authenticated identity comes from server-set
`req.user._id`; tokens/IP changes do not choose a different account quota.

Shared-network users have separate account write allowances but share coarse
socket read/ingress/auth/guest windows. Behind an unreviewed reverse proxy, its
socket address represents all its clients. Correct deployed proxy attribution
is still a required production design/test decision; blindly trusting forwarded
headers or a hop count is not a fallback. Distinct botnet prefixes/accounts can
still spread work up to instance/global limitations.

Rejection is **HTTP 429**, `Cache-Control:no-store`, a positive integer
`Retry-After` in seconds and fixed `{message:"Too many requests. Please try again later."}`.
It exposes no account existence, remaining quota or submitted identity. CORS
exposes only the added `Retry-After` response-header name to existing allowed
origins; origin rules are otherwise unchanged. OPTIONS retains CORS handling.
Retired legacy uploads still return their early unavailable response before
parsing/provider access. Parser 400/413/415 and authentication 401 behavior are
preserved for requests admitted to those boundaries.

## Durable media issuance reservations

New per-owner rolling **24-hour** ceilings are **120 intents** and
**268,435,456 declared source bytes (256 MiB)**, including the requested intent.
This permits up to forty three-image reports/day at ordinary sizes, while the
byte ceiling permits thirty-two maximum-size 8-MiB sources. These are initial
defensive ceilings, not a declaration of the final pilot spending policy.

The existing PostgreSQL user row lock serializes issuance across application
instances. A database-clock snapshot is taken after that lock. Existing asset
rows supply count/byte reservations for **all states**, including attached,
expired, failed, deleting and deleted tombstones. The inserted reservation is
explicitly timestamped at admission with `clock_timestamp()`, avoiding the
transaction-start default backdating a queued lock request. No migration or
separate counter table is needed. A second service/pool or application restart
cannot reset these owner budgets. Recovery follows the database rolling window.

The existing six unexpired outstanding intents and ten new intents/minute still
apply. Checks run before asset insertion and `signUpload`, so a quota rejection
creates no extra intent or signed permission and starts no storage operation.
Signing failure remains a failed row and consumes reservations: refunding failed
requests would enable unlimited database/signing churn. Attaching, expiring or
cleaning an asset does not refund its rolling issuance budget. Per-quota
Retry-After uses the earliest relevant expiry/window change; it is an opportunity
estimate, not reserved capacity or a promise that a retry will succeed.

These are **declared-source issuance reservations**, not measured billable or
retained bytes. They exclude normalized-output accounting, lifetime retention,
existing object reads, signed-capability reuse, account proliferation and global
cross-account spending. Storage state can outlive a window. Completion's rate,
two-worker/one-owner ceilings and identity map remain **service/process local**;
SQL leases protect each asset across processes but do not create a distributed
global/per-owner worker limit. No protection is presented as a global durable
storage or processing guarantee.

Signed PUT length/type/checksum/SSE/owner/conditional-write restrictions, 8-MiB
source/count limits, normalization, ownership, attachment transactions, retry
state transitions and admitted idempotent completion behavior are unchanged.
All media 429s now carry a positive Retry-After; short worker pressure suggests
one second, spacing and SQL quota windows supply their relevant estimate.

## Hebrew UX and regression boundaries

The existing typed Hebrew mapper handles **any HTTP 429 before backend text,
field errors or authentication messages**, so throttling cannot imply incorrect
credentials or account membership. Valid delta-seconds Retry-After values
between 1 and 86,400 produce natural Hebrew wait guidance; malformed/date/zero/
excessive values use a safe generic temporary-limit message. Fetch media errors
retain only normalized retry metadata, while Axios supplies its existing headers.
Generated local feedback remains safe through thunk/component remapping.

No form/navigation redesign or timer/retry loop was added. Existing forms clear
on success and retain descriptions, locations, text and selected files on
failure; new callback/store tests verify that behavior for login, registration,
report, station and feeding forms. Failed claim/resolve does not fabricate new
state. An explicit media retry retains the uploaded intent/completion cache and
does not issue another PUT after an already successful transfer. The user is
advised to wait; controls do not automatically resubmit at expiry or prevent an
earlier intentional click, which may receive another safe 429.

## Verification evidence

Commands are from repository root unless the working directory is stated.
All automated fixtures are synthetic; no AWS/Cloudinary operation was performed.

| Exact command | Actual result and scope |
| --- | --- |
| `npm.cmd run build --prefix server` | PASS, exit 0. Also rebuilt by both full backend/PG scripts. |
| `npm.cmd test --prefix server` | PASS **233/233**, zero failures/skips, final state. Includes retained parser-survival, validation, ownership and legacy-upload regressions. |
| `node --test tests/abuseProtection.test.mjs` (cwd `server`) | PASS **15/15**: class boundaries, reset/recovery, bounded capacity, simultaneous attempts, global/peer accounting, canonical addresses, proxy spoofing and account/shared-IP separation. |
| `node --test server/tests/abuseRoutes.test.mjs` | PASS **7/7**; also rerun in the full suite after final ingress placement. Real HTTP/controller/auth logic with synthetic persistence fixtures, not a database test. |
| `node --test server/tests/mediaBudgets.test.mjs` | PASS **4/4**: controlled completion clock/capacity, worker release and no work after rejection, positive router Retry-After. |
| `docker compose -f compose.postgres.yml --profile test up -d --wait test-db` | PASS; inspected stopped service had correct ownership, loopback 55433 and tmpfs. Only this service was started. |
| `npm.cmd run test:postgres --prefix server` | PASS **127/127**, zero failures/skips. Includes real independent-pool count/byte/race and post-lock timestamp tests with storage doubles; no S3 transfer. |
| `docker compose -f compose.postgres.yml --profile test stop test-db` | PASS; confirmed stopped after final browser/PG cleanup. Only this task-started disposable service was stopped. |
| `npm.cmd run build --prefix client` | PASS. Existing >500-kB bundle warning remains. |
| `npm.cmd run build:postgres --prefix client` | PASS. Windows sandbox esbuild ancestor/config access failure required an authorized retry; no code/limit change to pass it. |
| `node --test client/tests/*.test.cjs` | PASS **88/88**, zero failures/skips. Existing component callback/Redux/Axios/SSR fixture techniques retained, no added framework. |
| `& .\node_modules\.bin\eslint.cmd src/api/retryAfter.ts src/api/media.ts src/i18n/errors.ts src/i18n/locales/he.ts` (cwd `client`) | PASS, zero errors/warnings. No backend ESLint setup exists; TypeScript and JS syntax checks cover changed backend code. |
| `node --check <file>` for all changed `.mjs`/`.cjs` | PASS **7 files**. |
| `git diff --check` with the repository-specific read-only safe.directory override | PASS. Informational LF/CRLF warnings are not whitespace defects. |
| Explicit UTF-8 new-file scan, relative-link/anchor and manifest-reference checks | PASS: **8 new files** have no trailing spaces/tabs and end with LF; both changed documents' local links resolve. |

General-counter tests use low injected thresholds and controlled clocks, not a
load attack or real-time sleeps. Existing default policies are checked for valid
finite settings. HTTP tests prove the correct route ordering, normal login,
guest creation, authenticated feeding/claim/resolve/station/report actions,
account separation at one socket address, read/signing rejection before effects,
Retry-After CORS exposure and continued liveness. Unknown URLs and readiness
cannot bypass the final pre-parser ingress budget. Rejected ingress never reaches
the parser; retired uploads and cheap liveness retain their early behavior.

Real-PG budget fixtures cover exact 120-intent and 256-MiB boundaries, one extra
byte, all states/attachment/expiry/failure, no insert/sign after rejection,
separate accounts, a fresh service/independent pool, one race winner and rolling
recovery by guarded test-row timestamps. A bounded query-based lock observation
proves queued requests are timestamped after admission, without sleeping.
Existing tests additionally retain media transactions, private pending assets,
attachment ownership and cleanup guards.

The first full backend attempt recorded **232/233**, with an unchanged preview
startup child timing out during concurrent verification. A standalone full run
passed **233/233** without weakening its assertion/deadline; the final ingress
composition was then verified by another full passing run. Initial PG **126/126**
was followed by **127/127** after the added lock-time fix/regression. These results
describe actual execution stages, not a claim that the first runs all passed.

No manifest, lockfile or installed dependency version was changed. No registry
audit was rerun because this milestone adds no dependency; prior SEC.1B-1 counts
(12 server/21 client affected packages) remain dated evidence, not a fresh audit
or a claim that remaining findings were fixed.

Backend/PG logs are local `%TEMP%/ray-sec1b2-server-tests{,-final}.log`,
`ray-sec1b2-postgres-tests{,-final}.log` and
`ray-sec1b2-postgres-tests-composition-final.log` (the final PG run). Frontend
commands returned direct tool output rather than separate log files. Tests used the guarded disposable
database, disabled media/metadata resolution, absent task-specific AWS files and
removed inherited AWS variables. No production credentials or preserved preview
records/objects were used.

### Real local browser/API verification

Chrome exercised the actual React PostgreSQL-mode frontend and actual preview
composition backed by **guarded disposable PostgreSQL**, not an intercepted API.
Media remained disabled. Only the test fixture's login policy was lowered to
**two attempts per controlled 60-second window**; production defaults were not
changed. The frontend used `VITE_API_URL=http://127.0.0.1:4001` and
`npm.cmd run dev:postgres --prefix client` on the reviewed loopback origin 5175.
The task created and used only its own synthetic account/tab/processes.

Two invalid keyboard Enter submissions were followed by 429 on the third. The
visible Hebrew alert gave temporary-limit and 60-second wait guidance; the email
remained, the password stayed masked/nonempty, focus remained in the password
field and no automatic retry was observed. After advancing the **same API
process's injected clock** by 60 seconds, changing only the password and pressing
Enter signed in successfully. The assigned-page link then loaded its genuine
empty state by keyboard. The account signed out and the task tab/frontend closed.
This verifies representative login rejection/recovery and navigation, not every
form, screen reader, physical device or mobile layout; other form preservation
is covered by the explicitly synthetic callback/store tests.

The initial plain-exec fixture's stdin was closed, so its task-owned process was
restarted with a PTY and its guarded disposable fixture tables recreated before
the final sequence. The claimed reset/recovery happened **without a restart after
that final 429**. There were seven total bounded login attempts across the two
fixture runs. Screenshot capture timed out/returned unusable clipping, so no
screenshot artifact is offered as evidence; observed accessibility-tree text,
alert semantics and navigation support the recorded browser result. The fixture
closed its listener/pools and cleaned only its owned test schema afterward.

Both application modes' final ingress ordering was also exercised in HTTP tests,
and the final PostgreSQL suite was rerun after the browser fixture released its
database ownership. Only the task-started disposable test service is stopped;
no persistent preview/dev service, data or attached objects are touched. The
temporary API helper was removed. Browser work created no station, report,
feeding or image records; its synthetic seed account was removed with the owned
fixture schema.

## Remaining release gates and follow-up

The [Release Quality Gate](../RELEASE_QUALITY_GATE.md) is applied to availability,
auth safety, bounded errors, data integrity, recoverability, accessible failure
feedback and media costs. This milestone does not require unrelated SEO/cosmetic
verification. [Readiness](../RELEASE_READINESS.md) records the partial controls
without closing SEC-003/007 as complete.

For QG-01/07/11/12, automated and local-API evidence verifies the scoped admission,
recovery, ownership and reservation behavior. QG-02 has selected keyboard/alert
evidence only; comprehensive accessibility remains NOT_TESTED. Unrelated SEO and
cosmetic review is NOT_APPLICABLE to this change. Production/distributed and
retention decisions below remain BLOCKERs for their intended release scope;
Engineering/Operations own the technical next steps and Product owns enrollment,
spend and retention policy, with actual named owners still TBD.

| Status / finding | Applicability and required follow-up |
| --- | --- |
| VERIFIED partial controls | Preserve deterministic boundary/recovery, cross-account, no-side-effect and real-PG race tests. Test-only constructor thresholds are labelled separately from production defaults. |
| BLOCKER: shared API enforcement | Before multi-instance/restart-tolerant production exposure, choose a shared atomic quota store or enforce equivalent limits at a reviewed trusted edge. Define outage/fail-closed behavior, proxy topology, identities, windows and contention/expiry tests. No Redis or managed service was deployed. |
| BLOCKER: global media spend/processing | Approve enrollment, durable global/cross-account reservations and retained-source/output/lifetime budgets, distributed worker capacity and accounting through failure/cleanup/retention. A new focused schema/infrastructure decision may be needed; this milestone does not invent one. |
| BLOCKER: public result/abuse policy | Paginate/bound list results with reviewed contracts; decide enrollment/guest moderation and representative load/error/cost objectives. Fixed windows allow boundary bursts; these controls are not network DDoS defenses. |
| Production scaling follow-up | Size/query-plan historical owner accounting and appropriate indexes/retention. The existing owner index supports lookup, but aggregate work still grows with that owner's history. No finite lifetime record cap was added. |
| Other existing blockers | Privacy/audiences, emergency expectations, retention/takedown, bcrypt/session policies, remaining dependencies, accessibility, production PG/TLS/origins/credentials, backups/restore/monitoring and named S3 acceptance gaps remain as recorded. Conditional legacy claim risk remains if Mongo serves real reports. |

No historical SEC.1A/SEC.1B-1 or S3 evidence was rewritten. No cloud acceptance,
comprehensive accessibility, backup/restore or production readiness is inferred
from local tests. No application/public privacy policy was changed.

## Changed files and review handoff

The review set contains **22 files: 14 modified and 8 new**. Backend changes are
the shared abuse module, both compositions, three domain routers, media
service/types/router and targeted core/HTTP/media/PG tests. Frontend changes are
the retry metadata helper, media fetch boundary, typed Hebrew error resources
and targeted preservation tests. Documentation changes are this report and
the current readiness record. Manifests, locks, migrations and historical audit/
remediation/S3 records are unchanged.

Reviewed single-line staging commands, **not executed**, from repository root:

```powershell
git add -- server/security/abuseProtection.ts server/app.ts server/preview/app.ts server/routes/authRoutes.ts server/routes/reportRoutes.ts server/routes/feedingStationRoutes.ts server/media/service.ts server/media/types.ts server/media/routes.ts server/tests/abuseProtection.test.mjs server/tests/abuseRoutes.test.mjs server/tests/mediaBudgets.test.mjs server/tests/integration/postgresMedia.test.mjs server/tests/integration/postgresMediaBudgets.test.mjs
git add -- client/src/api/retryAfter.ts client/src/api/media.ts client/src/i18n/errors.ts client/src/i18n/locales/he.ts client/tests/rateLimits.test.cjs client/tests/media.test.cjs
git add -- docs/security/sec-1b-2-abuse-protection.md docs/RELEASE_READINESS.md
```

Suggested commit: **`fix: add scoped API abuse protection`**. HEAD and tracking
remain the preflight values; the index is empty. No staging, commit, push, merge
or deployment was performed. Wait for review before Git writes.
