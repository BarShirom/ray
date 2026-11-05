# SEC.1B-3C.4 — Targeted acceptance evidence and local fault harness

Evidence date: **2026-11-05, Asia/Jerusalem**. Intended gate: **A — local
verification**, with separately attributed Work browser evidence. Verified branch
`ray-2-postgres`, HEAD `6063cf2cf9ca76980f7701b507f6c2a0b26f87e0`; clean working
tree/index, local upstream 0 ahead / 0 behind without fetch. The 3C.3B fixes are
committed at this baseline. This follow-up remains uncommitted.

Read [AGENTS](../../AGENTS.md), the [Release Quality Gate](../RELEASE_QUALITY_GATE.md),
[readiness](../RELEASE_READINESS.md), [3C.2](sec-1b-3c-2-client-integration.md),
[3C.3A](sec-1b-3c-3a-session-recovery.md), [3C.3B](sec-1b-3c-3b-browser-remediation.md),
the [preview runbook](../migrations/postgres-preview.md), relevant tests and media
implementation. No nested AGENTS applies.

## Native evidence already supplied by Work

The current task's section 2 explicitly reports these checks as successful in
actual Windows Chrome against the local PostgreSQL preview at the known successful
checkpoint above. They are **user-supplied native evidence**, not reruns by this
agent. No additional browser version, run timestamp, screenshots or coverage is
inferred. Prior Work rejection at `57db448...` remains historical; these newer
results supersede that rejection for the specifically covered paths.

| ID | Expected behavior | Reported actual behavior | Evidence tier | Result |
| --- | --- | --- | --- | --- |
| W-01 | Map navigation and logout remain usable. | Leaflet navigation/logout no longer crash. | Work, actual Windows Chrome/local PG | PASS |
| W-02 | Foreign logout clears mounted protected presentation. | Two-tab logout cleared mounted map/dialog state. | Work, actual Windows Chrome/local PG | PASS |
| W-03 | Initial manual Report point works without device geolocation. | Keyboard selection, clearing and reselection passed at measured 320px and 390px CSS widths. | Work, actual Windows Chrome/local PG | PASS |
| W-04 | Existing Report actions remain functional. | Guest Report submission, plus claim/resolve flows passed. No guest claim/resolve permission is inferred. | Work, actual Windows Chrome/local PG | PASS |
| W-05 | Ordinary identity restoration and account history remain isolated. | Basic login, refresh and account-history isolation passed. | Work, actual Windows Chrome/local PG | PASS |
| W-06 | Selected critical flows retain Hebrew/RTL behavior. | Selected Hebrew/RTL flows passed; not complete accessibility conformance. | Work, actual Windows Chrome/local PG | PASS |

These completed native checks were not unnecessarily repeated. Running the
required automated regression suite again does not constitute a native rerun.

## Smallest local harness change

The existing Node test infrastructure already executes production Redux stores,
thunks, persistence, captured React callbacks/effects and bounded HTTP/fetch
responses. It already covers overlapping auth attempts, stale/current 401,
parent404 eviction, inactive409, 429 metadata, storage-warning/recovery and session
isolation. Another E2E framework or an unexercised browser entry would not close
the unavailable native boundary.

The only harness extensions are test-local:

- [rateLimits.test.cjs](../../client/tests/rateLimits.test.cjs): extend the existing
  callback fixture with a configurable responder, preserving its existing 429
  default. Add bounded network-failure → retained draft → explicit successful
  retry journeys for production Login, Report and station feeding callbacks.
- [stationImageLifecycle.test.cjs](../../client/tests/stationImageLifecycle.test.cjs):
  extend the protected image fixture for controlled effect commits/disposal,
  station/log state and error/retry assertions. Exercise the production image
  helper/component rather than a replacement image algorithm.

No application source, contract, dependency, package script, production/Vite
configuration, global debug route or provider setting is changed. No server,
test-control endpoint, new browser runner, certificate or trust change is added.
All fault controls exist only inside test processes. There is no database fixture
or PostgreSQL evidence in these new local cases.

Controlled promises/responders and explicit timer advancement replace timing
guesses. HTTP adapters/fetch, captured hooks/effects, storage and object URLs are
doubles where stated. Local PASS can establish callback/state/request-option
behavior; it cannot establish native rendering, browser scheduling, wire CORS,
storage denial or resource reclamation.

## Local execution ledger

Executed on the evidence date using Node `v22.22.0`, npm `9.6.5` and existing
installed packages. L-01 through L-05 rerun existing regressions; L-06 through
L-12 are seven new cases. These are local production-module/fixture results,
**not browser or PostgreSQL results**. The matrix groups related existing cases;
it does not claim that every one of the 225 suite tests is a new acceptance case.

| ID | Expected behavior | Actual behavior | Evidence tier | Result |
| --- | --- | --- | --- | --- |
| L-01 | New auth intent/logout fences delayed A success/failure; B and same-account reauthentication remain current. | Existing auth/station/log/Report tests reject obsolete completions and old401/404; current401 clears the matching session and fresh auth succeeds. | Production Redux/thunks; controlled Axios responses | PASS |
| L-02 | Refresh restores identity only; foreign-session and failed-logout recovery cannot overwrite B or resurrect protected state. | Existing persistence/recovery tests retain Hebrew shell warning, purge populated protected domains and keep B/newer guest authority intact; injected focus/pageshow reconciliation passes. | Production store/persistence; storage/event/callback doubles, not actual tabs/BFCache | PASS |
| L-03 | Parent404 evicts protected station/history; inactive409 blocks feeding without erasing own logs or allowing older active reads to re-enable it. | Existing station/log regressions pass, including stale-response fencing and fresh recovery for uncached inactive detail. No station record is altered. | Production thunks/reducers; Axios doubles | PASS |
| L-04 | 429 retains bounded Retry-After metadata, Hebrew feedback and drafts without automatic writes. | Existing Login/register/Report/station/feeding/action and upload cases pass with bounded request counts; raw account/field text cannot change 429 classification. | Production callbacks/thunks/helpers; HTTP and hook doubles | PASS |
| L-05 | Only the Ray issuer receives Bearer; byte options omit credentials/referrer, and stale/logout completion cannot publish a prior image. | Existing media request-option, source/session fencing, disposal, byte-cap and overall-timeout tests pass. | Production media helpers; fetch/abort/timer/object-URL doubles, not wire/native abort | PASS |
| L-06 | Login network failure retains mixed-language draft and permits one explicit retry. | Failure shows Hebrew alert semantics, retains fields and no navigation; settling/rerender sends no second request. One explicit retry succeeds and navigates once. | Production Login callback/thunk/store; Axios ERR_NETWORK and hook doubles | PASS |
| L-07 | Report network failure retains text, point and type without false success or automatic retry. | Mixed Hebrew/English/Russian description, point and emergency type remain; no item/navigation appears after failure. One explicit retry adds the receipt and navigates once. | Production Report callback/thunk/store; Axios ERR_NETWORK and hook doubles | PASS |
| L-08 | Feeding network failure retains the open draft, period and water-only choice; retry is bounded. | Note/period/food=false/water=true remain, with no receipt or refresh on failure. One explicit retry writes once, followed by exactly the expected summary and own-history GETs. | Production feeding callback/thunk/store; Axios ERR_NETWORK and hook doubles | PASS |
| L-09 | Asset404 preserves its populated station/log/auth state and offers fallback; only parent404 evicts station data. | Issuer asset404 shows status/retry in the returned element tree with no parent refresh. Controlled parent404 removes station/detail/summary/history while retaining auth. | Production component/effects/thunks/reducers; fetch/Axios/hook doubles | PASS |
| L-10 | Byte401/404 remain image failures; current Ray issuer401 invalidates authentication. | Each failed byte read stops after issuer+bytes without renewal or URL creation; issuer401 clears auth before any byte fetch. | Production image helper/component/store; fetch/hook doubles | PASS |
| L-11 | Retry-After disables manual image retry until the wait ends and never schedules a request. | At injected 4,999ms button remains disabled; at 5,000ms it enables with request count still one. Explicit retry makes count two; a second failure offers no further retry for that source/session. | Production component/retry hook; captured effects and controlled timer/fetch doubles | PASS |
| L-12 | Image-error callback disposes each URL once; a new source/session receives its own retry allowance. | Manually delivered duplicate onError callbacks and effect cleanup revoke each stub URL once across five loads; source/session changes restore one retry without inheriting the old allowance. | Production image callback/helper; hook/fetch/object-URL doubles, no decoder | PASS |

Exact test/build/type commands, run from repository root:

```powershell
node --test client/tests/authSessions.test.cjs client/tests/logoutRecovery.test.cjs client/tests/feedingStations.test.cjs client/tests/feedingLogs.test.cjs client/tests/rateLimits.test.cjs client/tests/stationImageLifecycle.test.cjs client/tests/media.test.cjs client/tests/reportSessions.test.cjs
node --test client/tests/*.test.cjs
& client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit --incremental false
& client/node_modules/.bin/tsc.cmd -p client/tsconfig.node.json --noEmit --incremental false
npm.cmd run build --prefix client
npm.cmd run build:postgres --prefix client
node --check client/tests/rateLimits.test.cjs
node --check client/tests/stationImageLifecycle.test.cjs
```

- Focused suite: **147/147 PASS**, no failures/skips. Full frontend: **225/225
  PASS**, no failures/skips (baseline 218 plus seven new cases).
- Both TypeScript no-emit checks and both CJS syntax checks: **PASS**.
- Normal and PostgreSQL builds: **PASS**, 266 modules each. Main JS is respectively
  612.92 kB / 192.89 kB gzip and 614.11 kB / 192.97 kB gzip; both retain the existing
  >500-kB warning. No new bundle increase or application source change.
- Targeted lint: existing installed ESLint recommended/CommonJS configuration with
  Node/browser globals, both changed test files, **0 errors / 0 warnings**. This
  does not claim repository-wide lint cleanliness. The reproducible command is:

```powershell
@'
const { ESLint } = require("./client/node_modules/eslint");
const js = require("./client/node_modules/@eslint/js");
const globals = require("./client/node_modules/globals");
(async () => {
  const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [{
    files: ["**/*.cjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs",
      globals: { ...globals.node, ...globals.browser } },
    rules: js.configs.recommended.rules
  }] });
  const results = await lint.lintFiles([
    "client/tests/rateLimits.test.cjs", "client/tests/stationImageLifecycle.test.cjs"
  ]);
  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  const warnings = results.reduce((n, r) => n + r.warningCount, 0);
  console.log(JSON.stringify({ files: results.length, errors, warnings }));
  process.exitCode = errors || warnings ? 1 : 0;
})().catch(() => { process.exitCode = 1; });
'@ | node
```

Each execution used process-local offline isolation: inherited AWS/media/provider,
database and proxy settings removed, media disabled, metadata disabled and AWS
config/credentials paths verified nonexistent. Builds needed the ordinary build
process permission outside the filesystem sandbox; no browser/security workaround
was used. No backend/SQL/schema behavior changed, so backend and disposable-PG
regressions were not rerun. Prior PG results remain dated historical evidence.

No application defect was confirmed by these local cases. Native gaps below are
unverified boundaries, not invented failures or successful browser acceptance.

## Remaining native cases

This task's browser inventory returned no browser connections and
`The browser access host is unavailable`. No browser input or permission workaround
was attempted. The following cases remain unexecuted in a native browser; local
doubles do not change that status.

| ID | Expected behavior | Actual behavior / prerequisite | Evidence tier | Result |
| --- | --- | --- | --- | --- |
| N-01 | Delayed A200 and A401 cannot change current B; current401 permits reauthentication. | Native controlled response ordering unavailable. Existing production-module race fixtures are separate evidence. | Native browser required | BLOCKED |
| N-02 | Parent404 removes the station UI; asset404 retains station/feeding data and shows image fallback. | Native fault-intercepted UI not run. Local state/callback evidence cannot prove visible browser behavior. | Native browser required | BLOCKED |
| N-03 | Inactive409, network loss and 429 preserve permitted drafts; Retry-After gates manual retry without storms. | No real API was flooded or persistent station altered. Native bounded injection/count capture unavailable. | Native browser required | BLOCKED |
| N-04 | Failed durable logout stays visible; recovery cannot overwrite B. | Browser-native storage failure not exercised. Injected storage failures/read-only recovery remain local evidence. | Native browser storage required | BLOCKED |
| N-05 | An actual BFCache restoration reconciles a suspended A page after B/login/logout. | No observed history restoration with `pageshow.persisted === true`. Manually firing pageshow is not BFCache evidence. | Native browser required | BLOCKED |
| N-06 | Protected images decode; stale/logout bytes never repaint; browser object URLs are released. | Actual decoding/pixels, native abort and Blob URL resource lifecycle not run. | Native browser required; trusted HTTPS additionally needed for the separate byte-origin journey | BLOCKED |
| N-07 | Browser wire capture proves Ray-only Bearer and credential-free HTTPS image bytes; separate-origin CORS allows/denies correctly. | No suitable already-trusted local certificate was discovered; no TLS bypass or real S3 used. | Native browser, trusted HTTPS and separate origin required | BLOCKED |
| N-08 | Remaining critical recovery/error/dialog journeys work with keyboard, visible focus, RTL, zoom/reflow and reader announcements. | Selected Work keyboard/width checks above are retained. Broader native focus/dialog/recovery/zoom/reader journeys were not run here. | Native browser / actual assistive tooling required | NOT_TESTED |

Certificate discovery inspected repository filenames and public metadata in
CurrentUser/LocalMachine `My`/`Root`, narrowly filtered for localhost/127.0.0.1.
No suitable candidate was found. CurrentUser refers to the runtime account,
not necessarily the interactive Chrome account; this is not a universal absence
claim. No private key, stored identity or provider credential was read/exported,
and no trust/security setting was modified. HTTPS/CORS tests require a suitable
existing trusted fixture and working browser access before they can be credited.

## Live S3 remains a separate gate

The [S3 remaining-gates ledger](../migrations/s3-media.md#remaining-release-gates)
remains authoritative. Local mocks do not verify live wire preflight/Content-Length
and signed headers, same-length checksum mismatch rejection, corrupt completion,
ready-unattached/cross-owner-ready attachment, broader parent visibility,
expiry/interruption/explicit retry, invalid files/counts, guest/disabled no-image
flows or ready-completion idempotency. No AWS, S3 or Cloudinary request or
configuration change is authorized or performed here.

## Release gate and priorities

QG-01/03/04/07/12 gain only the specifically labelled local rejection/recovery
evidence; W-01 through W-06 establish the supplied selected browser checks.
QG-02/06/09 accessibility/mobile/navigation acceptance is partial. Native media
and credential-destination checks remain open; QG-14/15 deployment, recovery and
operational gates are separate and unresolved. Ray is **not ready for a
real-user pilot** on this evidence.

Priority follow-up is working browser access and bounded N-01 through N-04 fault
interception, then actual N-05 BFCache and trusted local HTTPS N-06/N-07. Complete
N-08 with real keyboard/reader/reflow evidence; do not repeat W-01 through W-06
unless relevant code/environment changes invalidate them. Keep provider acceptance
separate and separately authorized.

Server JWT/session/password policy, enrollment/distributed abuse, exact location
exposure, personal-data retention/access/deletion/notices, dependencies, live S3,
production recovery/monitoring and remaining welfare/accessibility gates in
readiness remain open. Persistent preview records/media are untouched; no database,
cloud, deployment, staging, commit, push or merge operation is performed.

## Documentation and handoff checks

Both changed documents pass 57 relative-link/anchor checks, six table-column
checks and three closed-fence checks. All four changed/new files pass strict UTF-8,
no BOM/replacement characters, final newline and trailing-whitespace checks.
Credential/private-key/JWT/database-URL/signed-capability pattern screening found
no candidates; no sensitive values were printed. `git diff --check` passes;
untracked report content was checked separately. Manual source/evidence review
retains the original authentication/privacy contracts and historical evidence.

The expected inventory is the two test files, readiness and this report only.
SHA-256 comparison against all 303 preflight files confirms the other 300 files
unchanged. HEAD/branch and local upstream 0/0 remain unchanged; the index is empty.
Reviewed staging commands below cover exactly those four paths, **shown only**:

```powershell
git add -- client/tests/rateLimits.test.cjs client/tests/stationImageLifecycle.test.cjs
git add -- docs/RELEASE_READINESS.md docs/security/sec-1b-3c-4-browser-acceptance.md
```

Suggested commit message: `test: extend targeted acceptance recovery and media evidence`.

A separate independent critical read-only review on the evidence date returned
**APPROVE** for this scoped Level A test/documentation change, with no actionable
application findings or remaining required corrections. Final documentation
checking corrected the closed-fence count from two to three after adding the
staging block; the final checker confirms three balanced blocks. The reviewer independently inspected the
affected production paths and reran
`node --test client/tests/rateLimits.test.cjs client/tests/stationImageLifecycle.test.cjs`
under process-local offline isolation: **19/19 PASS**, no failures/cancellations/
skips. The reviewer also confirmed whitespace, branch/HEAD, local upstream 0/0,
empty index and the four-path inventory; it did not rerun the full suite, builds,
TypeScript, native browser or PostgreSQL checks. This is independent local review,
not native acceptance, real-user release approval or authorization for Git writes.
