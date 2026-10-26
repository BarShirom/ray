# Ray Release Quality Gate

This is the standing engineering standard. [Release readiness](RELEASE_READINESS.md)
records the current decision and open work. Neither document grants deployment,
cloud-spend or data-change authorization. The gate belongs in the existing change
review/release note; it does not require a separate committee or approval service.

## Apply the smallest sufficient review

Record the intended release level, changed behavior and affected checks. Reuse
valid evidence for unchanged behavior; run the affected checks and record gaps.
Before a launch, reassess all checks applicable to that release level, including
unresolved findings outside the latest diff. A documentation change can be accepted
while a real-user launch remains blocked.

| Level | Required evidence and boundary |
| --- | --- |
| **A - Local development** | Relevant build/tests or documentation checks; synthetic fixtures, guarded local services and no unintended external effects. Incomplete features may remain clearly identified. No implication of real-user release approval. |
| **B - Synthetic-data demo** | A plus the demonstrated end-to-end paths, Hebrew/mobile/error states and an explicit synthetic-data label. Verify isolation and removal of real identities, photos and sensitive locations. Current loopback preview is suitable only within its documented local boundary. Public hosting/tunnels, real accounts or paid integrations add their actual exposure/cost/security checks; calling it a demo does not waive them. |
| **C - Closed pilot with real users** | All applicable security, privacy, welfare, accessibility, integrity and operating BLOCKERs resolved with environment-relevant evidence. Review enrollment, audience, real-data notices, support/incident owners, resource budgets, recovery and provider controls. Invitations or a small cohort do not make real data synthetic. |
| **D - Public production** | C plus public reachability/abuse/load and discovery implications, deployed origin/TLS/credentials, public notices/support, operational alerts, recoverability and rollback evidence for the actual environment. SEO/sharing only for deliberately public-safe content. |

There is no automatic requirement for a fresh complete infrastructure audit on a
small documentation or CSS change. There is a targeted review whenever a change
affects authentication/authorization, visibility, media, report ownership,
migrations, real-user information, an external integration or production configuration.

| Change | Minimum affected checks |
| --- | --- |
| Documentation only | Accuracy against source, relative links, commands, evidence dates/tiers, secrets and whitespace. No application suite solely because prose changed. |
| Hebrew copy/CSS | Relevant i18n tests/build and manual RTL, keyboard/reader semantics, 320/390px/reflow and affected loading/error/action states. Safety/privacy meaning changes also trigger those checks. |
| Report ownership/permissions | Guest, reporter, assignee and other-account matrix; actor-derived writes; direct requests, refresh/reauthentication and concurrent transition regressions; related serializers/media reads. |
| S3/media | Relevant offline signing/image tests and disposable-PG ownership/lifecycle/concurrency tests; review budgets, content, retries and expiry. Live evidence only when the changed boundary needs it, with separately authorized scope and the existing cumulative ledger. |
| Database migration | Review SQL/hash history and compatibility; guarded disposable migration/integrity tests; data impact, backup, deploy ordering and tested rollback or forward recovery. Never reset preview to make checks pass. |
| Production deployment | Reassess the full applicable C/D gate for the actual artifact/configuration/provider state; use valid prior evidence where justified. |

Evidence can be reused when its commit/artifact, code path, schema, dependency
tree, configuration, environment/provider and release scope still match the
claim. Record the comparison and reference, not a claim of rerunning it. A change
to any relevant dependency invalidates that evidence for the affected boundary:
for example IAM/origin changes invalidate permission/origin evidence, and auth,
visibility or schema changes invalidate related cross-user/data checks. A CSS
change need not invalidate SQL transaction evidence. Unavailable artifacts,
undocumented environment drift and new advisories require reassessment.

## Record evidence and decisions

Use one compact record per applicable requirement, in the release note, PR or
readiness table. Split a row when its claims have different results or evidence.

| Field | Required content |
| --- | --- |
| Requirement / applicability | Check ID, concrete expected behavior, release level and affected modes/data/audience. For exclusions, state the reason. |
| Method / evidence | Exact command or reproducible manual steps; commit/artifact, date, environment and reference. Label source review, automated offline/mock, disposable PostgreSQL, browser or separately authorized live-provider evidence. |
| Status / actual result | One status below plus PASS/FAIL or the observed limitation. A command's exit code alone does not establish security or functional success. |
| Finding / action | Severity if an issue exists, its impact on this release, next action and responsible owner. Use an unassigned role/TBD until someone accepts ownership; do not invent a person or application role. |

- **VERIFIED**: the method was performed and evidence establishes the stated
  result, including a confirmed failure. It does not mean the release passed.
- **NOT_TESTED**: the applicable check has not been performed for the needed scope.
- **NOT_APPLICABLE**: excluded for a stated release/change-specific reason.
- **UNKNOWN**: facts, configuration or evidence are insufficient to determine the result.
- **EXTERNAL_DEPENDENCY**: completion depends on a provider, operator or qualified
  review; record what is needed and who will obtain it. This does not waive the check.

Findings use **BLOCKER** for a genuine security, privacy, data-integrity,
legal-operational or critical-workflow risk relevant to the intended release;
**SHOULD_FIX** for a meaningful issue that need not prevent that release; and
**BACKLOG** for a noncritical improvement. Use no finding severity for a verified
pass. Explain reachability and release applicability instead of copying an npm
severity into the release decision. A visual refinement is not automatically a
BLOCKER. A material unverified security/recovery boundary can itself block a
real-data launch; untested does not mean passed or automatically make every minor
check a blocker. Record accepted SHOULD_FIX/BACKLOG work with owner/action;
applicable BLOCKERs must be resolved before C/D launch.

## Practical release checks

In this table **A** means automated/source verification and **M** means manual or
operational verification. Source review cannot substitute for observed runtime,
device, provider or recovery behavior. Apply relevant rows at A/B; C/D require
evidence for the full applicable release scope.

| ID / category | Practical verification and evidence to retain |
| --- | --- |
| **QG-01 Security/authorization** | **A:** route/object matrix for guest, current user and another user; missing/invalid/expired tokens, deleted identity, forged actor fields, direct API access, concurrent claim/resolve and attachment boundaries. Run affected contract/PG tests and parser-survival regressions when changed. **M:** compare deployed modes/config with the threat model and open SEC findings; do not treat CORS or hidden UI as authorization. |
| **QG-02 Accessibility** | **A:** existing label/semantic/i18n tests and affected component/source checks. **M:** complete critical tasks with keyboard and screen reader; verify names, labels, headings/landmarks, bypass navigation, focus order/visibility, dialog focus/Escape/return, status/error announcements, contrast and zoom/reflow. Check map interaction and a usable non-pointer location-selection path. Record browser/reader and actual failures. No scan alone proves conformance. |
| **QG-03 Privacy/data handling** | **A:** compare guest/other-user/reporter/assignee API and media responses to an approved field/audience matrix, including lists/history/inactive/resolved content. **M:** product approves purpose, precision, identity/routine/photo exposure, notices, third parties, retention and request/removal handling. Private S3 does not make attached images private to an assignee. Require qualified review of applicable obligations before real data. |
| **QG-04 Forms/actions** | **A:** registration/login, station/log/report creation and permitted transitions persist with server validation and existing contracts. Preserve the eight-code-point registration minimum without implying the bcrypt byte issue is solved. **M:** empty/boundary/invalid/mixed-language input, denied permissions, double clicks, slow/failing API and successful confirmation; no false success or lost form on recoverable failure. |
| **QG-05 Accessibility statement** | **M:** qualified accessibility/legal review determines applicable statement obligations. Where needed, publish a reachable Hebrew statement with truthful scope, tested limitations, contact/feedback route, owner and review date; verify navigation and response ownership. **A:** link/content checks when a statement exists. A document or automated report is not legal-compliance certification. |
| **QG-06 Mobile usability** | **M:** critical paths at actual CSS widths **320px and 390px**, desktop and an appropriate touch device; no clipped fields/actions, page overflow, inaccessible controls or trapped dialog scrolling. Check zoom, long text, keyboard and loading/error states. Label iframe/emulated and physical-device evidence accurately. **A:** related existing layout/SSR checks. |
| **QG-07 Performance/reliability** | **A:** relevant builds/tests; compare bundle changes/warnings, parser/validation/image/resource bounds and concurrency behavior. **M:** representative slow/offline/dependency failures, retries without loops, liveness versus readiness, restart and bounded shutdown. For real users, record expected load, latency/resource/cost budgets and measured results in a controlled environment; no arbitrary universal benchmark or unbounded load test. |
| **QG-08 SEO/social sharing** | **A:** inspect language/title/description, routes and intentionally public metadata/assets. **M:** deployed public-safe preview cards, canonical/indexing policy and fetch behavior where applicable. Never place private identity, exact sensitive locations or signed capabilities in metadata. Exclude local/closed/private routes with an explicit reason; check their indexing policy rather than demanding promotion. |
| **QG-09 Navigation/links** | **A:** changed document links and route references; existing navigation/guard tests. **M:** direct load and refresh of map/report/assigned/auth routes, back/forward, logout, missing routes, external destinations and logo/menu/footer links. Verify actual hosting SPA fallback, not just the checked-in rewrite. |
| **QG-10 Secrets/credentials** | **A:** review changed files/build output, env exposure and logging with synthetic markers; never print secrets/tokens/signed URLs. Separate VITE-exposed values from backend secrets. **M:** production secret storage/rotation, least privilege, credential provenance and revocation owner; effective provider permissions need evidence, not templates alone. Do not resolve live credentials in ordinary tests. |
| **QG-11 Data integrity** | **A:** identifiers, timestamps/time zones, constraints, transaction rollback, concurrent ownership transitions and parent/media attachment consistency; real disposable-PG tests for SQL changes. **M:** review migration/deploy order and recovery compatibility, including database/object synchronization. Preserve migration history, preview records and attached objects. |
| **QG-12 Errors/recovery** | **A:** safe bounded 400/413/415/500 responses, no stack/body/SQL/storage detail, failed persistence is not success, stale responses cannot cross accounts. **M:** meaningful Hebrew loading/empty/error/success, explicit retry, restored form/session behavior, outage/restart and recovery without duplicate recorded actions. |
| **QG-13 Dependencies/supply chain** | **A:** review lockfile diffs and package paths, use compatible supported fixes and fresh scoped audits for a dependency/release review. Separate runtime reachability from tooling metadata and document residual findings. **M:** assess native image host/decoder and trusted build inputs. No blanket audit fix, unjustified major upgrade or automatic claim that all advisories are resolved. |
| **QG-14 Deployment/rollback** | **A:** actual build mode, public URLs, migration compatibility and config failure checks. **M:** production PostgreSQL composition, TLS/DB TLS, exact origins/trusted proxy attribution, secrets/runtime privileges, supervision/readiness and smoke checks; record deploy artifact plus tested rollback or forward-recovery procedure. Loopback preview/Vite is not production infrastructure. Deployment remains separately authorized. |
| **QG-15 Monitoring/backups/lifecycle** | **M:** owned error/security/cost alerts and incident response; PostgreSQL backup encryption/access/retention and a demonstrated restore into an isolated target; recovery objectives, S3 ownership/retention/removal and consistent DB/object recovery; retry-safe authorized cleanup. **A:** existing failure/lease/cleanup doubles and disposable-PG tests support logic only. A backup configuration without restore evidence is insufficient. |

## Ray-specific acceptance

These checks refine the categories above; they are not a second parallel checklist.

| Domain | Required behavior and verification |
| --- | --- |
| **Feeding stations/history** | Test selected/edited location, coordinate validation and denied/unavailable geolocation. Explicitly classify precise coordinates, feeder identities and routines before real data. Verify server-derived creator and permitted actions; do not infer an edit/delete right from an owner ID. Confirm saved history, ordering/instants and Jerusalem display. Water-only means water; no record means no recorded feeding, not proof an animal was unfed. A general report is not a station feeding log. |
| **Animal reports** | Create/reload/persist the recorded description, image order and location; test guest no-image behavior, assigned direct loading/refresh/reauthentication and account isolation. Exercise safe claim/resolve races and stored-assignee checks, loading/retry/failure states and no false success. Assignment is not a private-case audience. Do not claim an organization/municipality received or accepted a report unless such an acknowledged integration exists. |
| **Animal welfare** | Review Hebrew emergency/distress labels, status and help copy. Explain community reporting versus emergency response; do not imply guaranteed monitoring, dispatch, rescue, professional intervention or clinical outcome. Claim/resolve reflects recorded account actions, not verified veterinary care. Safety/clinical advice and any service/contact details need qualified review and current verification for their intended use. |
| **Future sterilization/neutering** | Keep future workflow-specific coordination, observations, collection and outcome tracking within the shared Report domain. Review its future state/access/data integrity when implemented. No separate disconnected case system or claim that these capabilities, verified providers or municipal roles already exist. |
| **Media** | Preserve private S3 access, signed upload/read restrictions, owner/purpose/expiry/state/count checks and atomic attachment. Test checksum/type/size/animation handling, replay/conditional writes, completion idempotency, expiry/retry/leases, quotas, abandoned versus attached lifecycle and no capability leaks. Current limits/ledger and exact procedures live in the [S3 runbook](migrations/s3-media.md); finish applicable acceptance gaps without repeating successful live cases or resetting budgets. |
| **Privacy/access** | Approve feeder/reporter identifiers, coordinates/schedules, text/photos/context and reporter/assignee/future verified-provider audiences. Test least privilege on every related endpoint and media read. Define deletion, retention, originals/takedown and handling of data-subject requests. No implemented future role or privacy entitlement may be assumed. |
| **Hebrew/RTL/time** | Hebrew is the active release language. Verify typed resources, RTL shell, unmirrored geography/attribution, keyboard/reader feedback and 320/390px flows. Preserve mixed Hebrew/English/Russian user content, punctuation/digits, isolated emails/URLs and long names/filenames. Test `he-IL` display, `Asia/Jerusalem` dates, midnight/DST and unchanged ISO instants. English/Russian UI support remains architectural until complete resources and verification exist. |
| **Operations** | Separate disposable tests, persistent synthetic preview and production data/credentials. Verify PostgreSQL restore, S3 ownership/retention, production TLS/origins, rate/resource budgets, error/cost monitoring and named operational response before real-user launch. Use the [preview runbook](migrations/postgres-preview.md) for local setup, not production deployment. |

## Existing commands and guarded execution

From repository root in PowerShell, with the repository's Node **22** range
(`>=22.22.0 <23`) and locked packages. Commands are recommendations, not evidence
that they were executed for a particular release. Use `npm.cmd` on Windows without
changing machine execution policy. No root package script, backend ESLint setup
or frontend `test` script currently exists.

| Purpose | Existing command |
| --- | --- |
| Backend TypeScript | `npm.cmd run build --prefix server` |
| Backend offline contracts/security tests (includes build) | `npm.cmd test --prefix server` |
| Frontend tests | `node --test client/tests/*.test.cjs` |
| Normal frontend build | `npm.cmd run build --prefix client` |
| PostgreSQL-mode frontend build | `npm.cmd run build:postgres --prefix client` |
| Full configured frontend lint | `npm.cmd run lint --prefix client` |
| Targeted frontend lint example, cwd `client` | `& .\node_modules\.bin\eslint.cmd src/i18n/errors.ts src/i18n/locales/he.ts` (substitute actual affected configured files) |
| Backend changed `.mjs` syntax example | `node --check server/tests/requestParsing.test.mjs` (build covers `.ts`) |
| Dependency review | `npm.cmd audit --json --prefix server` and `npm.cmd audit --json --prefix client`; inspect actual JSON, paths and exit status |
| Installed relevant dependency paths | `npm.cmd ls express body-parser raw-body qs zod --all --prefix server` |
| Tracked whitespace | `git diff --check` |
| New-file inventory for separate whitespace/link checks | `git ls-files --others --exclude-standard` |

Do not assume targeted lint proves repository-wide lint clean. For new files,
check trailing spaces/tabs and final newline separately; `git diff --check` omits
untracked content. Verify changed Markdown relative links/anchors against actual
targets and scan only appropriate output without displaying sensitive values.

Ordinary backend/PG checks must run with media disabled, metadata disabled,
inherited AWS credential/profile/endpoint variables absent and AWS config/credential
paths set to verified nonexistent task-specific files. Use a separate terminal/job
so environment isolation does not overwrite a developer's configuration. Offline
SDK signing with synthetic credentials is not a live-provider call.

PostgreSQL integration is optional when unrelated to the change, required for
relevant SQL/transaction/media persistence work, and part of applicable C/D release
evidence. First inspect the intended service/ownership and configure only the
guarded disposable `RAY_TEST_DATABASE_URL` according to the
[local foundation](migrations/postgres-local-foundation.md) and
[preview isolation](migrations/postgres-preview.md) records. The target is
**`ray_test`, numeric loopback port 55433, tmpfs**, never development 55432 or
persistent preview 55434. Existing helpers verify URL/identity, acquire an advisory
lock, refuse unexpected Ray objects and clean only suite-owned objects.

```powershell
# Start only the inspected disposable service if needed; record whether you started it.
docker compose -f compose.postgres.yml --profile test up -d --wait test-db
# With the dedicated test URL and offline environment configured:
npm.cmd run test:postgres --prefix server
# Only if this verification started it:
docker compose -f compose.postgres.yml --profile test stop test-db
```

Never put preview migrate/seed/start, cloud verification or cleanup into a general
gate command. Do not use volume removal, persistent resets or automatic migrations
to make checks pass. `test:s3:live` and cleanup apply are **not ordinary gate checks**:
use the S3 runbook's explicit authorization, cumulative budgets, existing retained
objects and reviewed manifests. Even cleanup dry run reads preview SQL; it is not
a routine documentation check. Stop only task-started services/processes.

No checked-in CI workflow was found when QG.1 was established. A minimal future CI
change should use existing lockfiles/Node support, run the offline build/test/lint
commands above with isolated credentials, and provision only an ephemeral guarded
PostGIS test target for relevant integration/release jobs. Retain results and
actionable dependency findings, protect secrets in untrusted jobs and exclude
live AWS/Cloudinary, preview data and deployment. This is a recommendation, not an
implemented workflow or a new testing framework.

## Source of truth and handoff

Use the current source/commit plus [readiness](RELEASE_READINESS.md) to reconcile
historical milestone narratives. Preserve dated evidence rather than rewriting
old outcomes. The [SEC.1A audit](security/pre-pilot-security-audit.md),
[SEC.1B-1 remediation](security/sec-1b-1-remediation.md),
[S3 acceptance ledger](migrations/s3-media.md),
[localization record](localization.md) and [UX.2 record](ux2-reliability.md)
supply detailed evidence and known limitations; do not duplicate their operational
instructions here. Legal compliance is never established solely by code scanning,
automated accessibility tests, this gate or a passing build. Obtain qualified
review for applicable legal, privacy and accessibility-statement obligations.
