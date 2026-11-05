# UX.3B.1: Mobile map foundation

Evidence date: **2026-11-05, Asia/Jerusalem**. Intended release: **Level A,
local development** under the [Release Quality Gate](../RELEASE_QUALITY_GATE.md).
Branch `ray-2-postgres`; baseline HEAD
`076fbb5d383777e3d895b28e274ee8b5f91b9686`. Local tracking was **0 ahead /
0 behind**, without fetch. Initial index and tracked tree were clean. The two
intentional untracked [design note](mobile-map.md) and
[prototype](../prototypes/mobile-map.html) were preserved. Root
[AGENTS](../../AGENTS.md) applies; no nested instructions were found.

This implements the map shell, discovery filters and non-map list with the real
React/Leaflet map and existing API thunks. It grants no deployment, Git or
real-user release approval. [Current readiness](../RELEASE_READINESS.md) is
unchanged; the real-user pilot remains **NOT READY**.

## Implemented scope

- Neutral **הכול / דיווחים / תחנות האכלה** controls use named native buttons
  with `aria-pressed`. Reports and stations have equal control/action prominence.
- A prominent New Report link uses the existing public `/` route. Members retain
  station creation and manual location selection. Guests receive a station-care
  sign-in link and truthful access explanation.
- The map precedes the result list in mobile reading order. Secondary report
  type/status, station active/inactive filters and the existing legend are in a
  native disclosure. Inactive stations are included by default and labelled for
  viewing only.
- One pair of visible report/station collections drives markers, counts and list
  items. List entries alternate domains, preserving order inside each collection,
  so a long collection cannot bury the other domain. No distance ranking or new
  workflow is inferred.
- A named list bypass link and return-to-map link avoid requiring marker
  interaction for the matching collections. Existing ReportCard content/actions
  are reused, with the report-location limitation below. Station list buttons
  have station-specific names and focus their opener before opening the existing
  station dialog.
- Scoped map CSS replaces the former mobile 60vh filter/list panels. It uses a
  single shrinkable mobile column, wrapping controls/text, 44px principal targets,
  physical safe-area padding and a bounded viewport-relative map height. Map
  stacking is isolated beneath the app header and zoom controls have 44px targets.
  Desktop retains
  the map beside the list, with filters above. These are implemented structures,
  **not measured browser geometry**.
- Loading, empty and recoverable failures are scoped to the displayed domains.
  A failed station collection leaves public reports usable. Existing explicit
  station retries and Retry-After gating are retained.

## Differences from UX.3A and retained components

This is the first integration increment, not the full prototype. The list stays
available below the map on mobile and beside it on desktop; no map/list switch
destroys or hides Leaflet. Existing report popups, ReportCard, station details,
feeding forms, shared summaries, own history and creation dialog are reused
without rebuilding their details UI. Compact selection cards and redesigned
details belong to **UX.3B.2**.

The existing ReportCard list does not provide a complete details, location or
navigation path. This is an inherited usability limitation, not a newly
introduced authorization defect. UX.3B.1 supplies matching marker/list
collections, but does not provide a complete non-map alternative for locating a
reported cat. UX.3B.2 must make marker and list selection open the same contextual
details experience, with equally usable details and appropriate actions for both
reports and feeding stations.

The list shows the current station DTO's name/activity/cat counts; it does not
prefetch feeding history, shared summaries or images. Those remain in the
existing authorized details flow. Public reports retain their existing fields,
claim/resolve permissions and media policy. No kitten, sterilization or
care-provider workflow, new Report category, provider or paid integration is
introduced.

The original design note remains historical UX.3A evidence. The prototype's
user-facing em dashes were replaced with natural colon punctuation to meet the
new product-copy rule; its feedback styling, live regions and behavior are
preserved. A regression without new dependencies scans all actual merged Hebrew resource
strings and prototype copy, including encoded forms in the prototype. It does
not scan unrelated historical documentation or prohibit user-authored API data.

## Authorization and lifecycle

The frontend continues to consume the existing server-enforced policy: public
Report discovery and supported guest creation, no guest station requests/data,
authenticated viewing of all stations including inactive ones, and feeding only
where authorized at active stations. Filtering is presentation, never an access
check. No API, schema, JWT/session or grant-management behavior changes.

MapPage's existing key includes session ID, actor, auth-loading state and station
authorization revision. Its SessionMap still owns filters, station selection,
creation/picker state, dialogs and camera. Account changes/logout/authorization
loss remount that entire boundary, discard protected presentation and retain the
existing Redux/request and protected-image fences.

Leaflet stays mounted across presentation changes within a session. The first
station fit uses visible stations: a delayed station response while Reports is
selected cannot move the camera to hidden stations. Revealing stations permits
the first fit; later filtering preserves the camera. The existing viewport
`dispose()` remains fence-only, with no unsafe camera calls after parent removal.

[Auth isolation](../security/sec-1b-3c-2-client-integration.md),
[read-only logout recovery](../security/sec-1b-3c-3a-session-recovery.md),
[Leaflet and picker remediation](../security/sec-1b-3c-3b-browser-remediation.md)
and [browser acceptance limits](../security/sec-1b-3c-4-browser-acceptance.md)
remain applicable. Shared food/water buckets, author-only detailed history,
server-derived image parents, private S3 and independent Report policy are
unchanged. Hiding markers does not revoke copied data or previously issued
capabilities.

## Verification performed

The implementation-time commands below ran against the uncommitted
implementation, using installed Node **22.22.0**, npm **9.6.5** and locked
packages. They remain historical evidence for unchanged production code; the
narrow review closeout does not rerun the builds. No dependencies changed.
Frontend tests use bounded DOM/HTTP/storage doubles where stated. They do not
prove native event delivery, actual CSS widths, visual appearance, reader
behavior or backend/PostgreSQL authorization.

| Command / method | Actual result and evidence tier |
| --- | --- |
| `node --test client/tests/mapTeardown.test.cjs client/tests/uiCopy.test.cjs` | **VERIFIED / PASS, 15/15**, no failures/skips. Mounted installed React DOM, React Leaflet, Leaflet and production MapPage/router/Redux with DOM/HTTP doubles; actual merged locale and prototype scans. |
| `node --test client/tests/*.test.cjs` | **VERIFIED / PASS, 241/241**, no failures/skips. Includes auth attempts, cross-tab persistence/recovery doubles, stale report callbacks, station/media/dialog lifecycles, feeding privacy, rate limits, manual Report location and GPS callback fences. |
| `npm.cmd run build --prefix client` | **VERIFIED / PASS**: 266 modules, CSS 45.26 kB, main JS 617.84 kB / gzip 194.29 kB. Existing >500-kB chunk warning remains. |
| `npm.cmd run build:postgres --prefix client` | **VERIFIED / PASS**: 266 modules, CSS 45.26 kB, main JS 619.03 kB / gzip 194.36 kB. Same warning. |
| `client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit --incremental false`; same for `client/tsconfig.node.json` | Both **VERIFIED / PASS**. |
| `npm.cmd run lint --prefix client` | **VERIFIED / PASS**, zero errors; one pre-existing `react-refresh/only-export-components` warning at unchanged `Media.tsx:6`. |
| Cwd `client`: `node_modules/.bin/eslint.cmd src/pages/mapPage/MapPage.tsx src/i18n/locales/reports.ts` | **VERIFIED / PASS**, zero errors/warnings. |
| `node --check` on both changed/new CJS tests; installed ESLint Node API with recommended rules and Node/browser globals | **VERIFIED / PASS**, zero errors/warnings. No lint configuration changes. |
| Installed PostCSS parses MapPage CSS and prototype CSS; Node `vm.Script` compiles prototype inline JS | **VERIFIED / PASS**, local parsing/syntax only. Additional CSS AST assertions verify scoped selectors, 44px zoom dimensions and isolated map stacking; no layout-engine claim. |
| Changed-file whitespace, UTF-8/final-newline, documentation links/format, bounded credential/signed-capability screening and `git diff --check` | **VERIFIED / PASS**; untracked contents checked separately. No sensitive credential or signed URL added. |

The implementation-time map suite added six cases to the seven retained lifecycle regressions:
guest public reports without station requests/disclosure; shared map/list
filtering across both domains and active/inactive stations; station-network
failure with explicit retry and continued public-report use; delayed hidden
station response without camera movement; station-list details and account/
logout resets; and creation picker/domain compatibility without writes.
Assertions include Hebrew/RTL, named navigation, pressed state and map-before-list
reading order. The DOM double only gained SVG feature detection needed to run
the installed Leaflet CircleMarker lifecycle; existing guards were not weakened.

The full suite and builds used process-local environment isolation: inherited
AWS/media/Cloudinary/database settings removed, media and metadata disabled,
AWS config/credential paths verified nonexistent. No live provider, preview
database, migration or backend process was used. The first normal build failed
because sandboxed esbuild could not traverse an ancestor directory. The requested
builds then passed with automatic-review-approved normal filesystem traversal;
no source or build-configuration workaround was added.

### Narrow review closeout

Five deterministic regressions now exercise production MapPage presentation
through the existing mounted DOM-double fixture, preserving every previous
privacy, session and Leaflet-teardown assertion. They make 27 explicit ordered
list and visible-status-count assertions: three reports/two stations, two
stations/one report, reports only, stations only and a guest with station
fixtures present. Expected domain/item sequences are written explicitly without
sorting or rebuilding the production interleaving algorithm. Coverage includes
All/Reports/Stations selection, report type/status filters, station activity
filters and empty filtered results. Member status text must match both visible
domain counts; guest status text must show only the visible report count and no
protected station entries.

The focused command `node --test client/tests/mapTeardown.test.cjs
client/tests/uiCopy.test.cjs` is **VERIFIED / PASS, 20/20**, no failures/skips.
These are offline mounted-component results, not native browser evidence. No
production behavior was changed and no production mismatch was found by these
cases. The U+2014 user-interface copy regression remains intact. Full frontend
rerun `node --test client/tests/*.test.cjs` is **VERIFIED / PASS, 246/246**,
no failures/skips. `node --check` on both CJS test files and the installed ESLint
Node API check of those files also pass, with zero lint errors/warnings. These
closeout results replace the historical test totals for the current checkpoint.
Final closeout hygiene is **VERIFIED / PASS**: nine relative report links,
code-fence/table formatting, UTF-8/final-newline/trailing-whitespace checks on all
eight cumulative paths (including untracked files), bounded credential/capability
screening with zero candidates, an empty index and `git diff --check`. A saved
311-file content snapshot confirms that only the test file and this report
changed during closeout; the other 309 files are byte-identical.

Only `client/tests/mapTeardown.test.cjs` and this report change in the closeout;
all other existing implementation/prototype work is preserved. Builds remain
the implementation-time evidence above; no backend, PostgreSQL or provider
checks are rerun for this test/documentation delta.

## Browser and accessibility limitations

The browser connector inventory returned **The browser access host is
unavailable**. The supported native computer-use path could observe an existing
Chrome prototype tab. Before opening the integration fixture, native input was
stopped because it could not determine the current browser URL confidently
enough to enforce policy. No further browser input or bypass was attempted.

A task-owned Vite fixture briefly served the actual client at numeric loopback
port 5176 with synthetic in-memory API responses, disabled media and CSP-blocked
external images/tiles. It used installed packages and no production source
override, database or provider. Its first sandboxed esbuild attempt failed on
ancestor traversal; the approved retry started, then was stopped after native
input ended. The integrated page was **not opened or inspected**. The fixture
does not establish API/PostgreSQL, authentication, network or browser evidence.

**NOT_TESTED for this change:** actual CSS widths 320px/390px and desktop,
horizontal overflow, touch, safe areas/browser chrome/virtual keyboard,
zoom/reflow, contrast, native keyboard/focus/anchor return, screen-reader
announcements, full popup/dialog usability, actual cross-tab scheduling,
protected-image decoding/object URLs and GPS device/permission behavior.
No integration screenshots were captured. Structural assertions and CSS parsing
are not browser or accessibility PASS.

## Gate result and remaining work

The separate independent critical read-only review returned **GO for Git
approval at Level A**, with no introduced commit-blocking defect confirmed. Its
nonblocking findings were the inherited ReportCard limitation recorded above
and Low test-coverage gaps for mixed-list order and visible counts. The narrow
closeout addresses those test gaps and documents the limitation; only focused
review of that delta is needed. This is not full mobile/browser acceptance or
Level B/C/D clearance. QG-01/03/04/09/12 have source/offline regression evidence for affected
presentation and retained isolation. QG-02/06 manual checks remain NOT_TESTED.
QG-07 retains the bundle warning; QG-10 changed-file screening passes.
Backend/PG/provider verification is NOT_APPLICABLE to this presentation-only
change; historical results are not reported as reruns.

Before mobile acceptance, run the integrated app at measured 320px and 390px,
then desktop: exercise All/Reports/Stations; expand/collapse filters; reach the
list and both domains without marker pointing; retry a failed collection; create/
cancel/change station location; use the existing guest Report manual picker;
open/close existing details; switch accounts/logout, including two tabs; check
attribution and every action for clipping/overlay obstruction. Record actual
browser/reader/device results and authentic screenshots where available.

UX.3B.2 retains compact selection/details redesign, shared marker/list selection
and its focus/media/action acceptance for both reports and stations. Native
mobile, keyboard and screen-reader acceptance of this integrated page remains
**NOT_TESTED**. GPS acceptance remains separate: explicit foreground intent,
manual/keyboard alternative, denied/unavailable feedback, cancellation of late
callbacks, real device/permission behavior and no background tracking.
Existing welfare/privacy/security/accessibility/operational release gates remain
open in readiness. The completed independent review grants no staging, commit,
deployment or real-user release authorization.

## Inventory and handoff

Task edits: `MapPage.tsx`, `MapPage.css`, `reports.ts`,
`mapTeardown.test.cjs`, new `uiCopy.test.cjs`, this report and punctuation-only
changes to the pre-existing untracked prototype. The pre-existing untracked
`mobile-map.md` is preserved unchanged. No server, dependency/lockfile,
database/schema/migration, cloud configuration or unrelated document is changed.

Suggested commit message: `feat: integrate the mobile map foundation`.

Reviewed staging commands are **shown only**, not executed. The first command
covers this integration; the second separately lists the preserved UX.3A
artifacts so the intended combined scope is explicit. No wildcard staging.

```powershell
git add -- "client/src/pages/mapPage/MapPage.tsx" "client/src/pages/mapPage/MapPage.css" "client/src/i18n/locales/reports.ts" "client/tests/mapTeardown.test.cjs" "client/tests/uiCopy.test.cjs" "docs/design/ux-3b-1-mobile-map-integration.md"
git add -- "docs/design/mobile-map.md" "docs/prototypes/mobile-map.html"
```

No staging, commit, push, merge, deployment, cloud operation or database operation
was performed. Task-started fixture process is stopped; pre-existing preview
services/data/media were not changed.
