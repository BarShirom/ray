# SEC.1B-3C.3B — Map teardown and keyboard Report location

Evidence date: **2026-11-05, Asia/Jerusalem**. Intended gate: **A, local
development**. Verified branch `ray-2-postgres`, baseline HEAD
`57db448149f091634dcb011b920fd20c24f5ebbe`; clean working tree/index and local
upstream 0 ahead / 0 behind, without fetch. SEC.1B-3C.2 is committed at
`5fa5cc73e7d7ec06885c706364c59862f86301af`; the reviewed
[3C.3A recovery correction](sec-1b-3c-3a-session-recovery.md) is committed at HEAD.
This remediation remains uncommitted.

Read [AGENTS](../../AGENTS.md), the [Release Quality Gate](../RELEASE_QUALITY_GATE.md),
[readiness](../RELEASE_READINESS.md), [3C.2 evidence](sec-1b-3c-2-client-integration.md),
3C.3A and the relevant installed implementation/tests. No nested AGENTS applies.

## Findings and corrections

The user-supplied Work review exercised actual Windows Chrome against the local
PostgreSQL preview at the baseline and returned **REJECT / REVISE**. Its reported
failures are pre-fix native-browser evidence, not this implementation's own browser
run. The findings were supplied for this 2026-11-05 task; the exact browser-run
timestamp and any additional successful scenarios were not supplied or inferred.

**C3B-R01 — teardown crash.** Installed React Leaflet 5.0.0 removes its Leaflet
map in the parent MapContainer passive cleanup before the viewport child's cleanup.
Leaflet 1.9.4 `remove()` stops internal motion, removes layers/popups and deletes
the map pane. The old child's public `stop()` calls `setZoom()`/`getCenter()` and
dereferences that deleted pane, producing the reported `_leaflet_pos` exception
and blank screen. Installed React/ReactDOM are 19.1.0.

The [viewport correction](../../client/src/pages/mapPage/stationViewport.ts)
makes disposal an idempotent local fence only. Parent `map.remove()` owns actual
map/layer/popup cleanup. Startup still stops motion, closes popups and initializes
the neutral default view; fitting remains once per live instance and cannot run
after disposal. No broad catch, private-field check, session-key change or disabled
privacy cleanup was introduced. MapPage's keyed remount still discards previous
camera, markers, selected details, picker and creation state.

The new [teardown regressions](../../client/tests/mapTeardown.test.cjs) reproduce
the original failure with actual installed React/ReactDOM/React Leaflet/Leaflet
methods and production viewport code. Their bounded DOM host double supplies
nodes/events without native rendering, geometry or browser scheduling. This is
stronger than a camera-only stub but is **not native-browser acceptance**.

**C3B-R02 — initial keyboard location unavailable.** The original Report map
exposed only click/drag selection; without a marker or device geolocation,
keyboard users could pan but had no action to select the first point.

[MapPreview](../../client/src/components/mapPreview/MapPreview.tsx) now has normal
focusable Hebrew center-selection and clear buttons outside the Leaflet canvas.
Keyboard users focus the map, pan with arrows and activate center selection with
the standard button interaction. The map is a named region with associated
instructions. Pointer selection and marker drag remain; repeated-world longitude
is wrapped before validation. Map state is not keyed on the selected point.

[ReportForm](../../client/src/components/reportForm/ReportForm.tsx) derives readiness
from the shared [finite/range guard](../../client/src/components/mapPreview/location.ts),
accepting latitude -90..90 and longitude -180..180, including zero. A polite atomic
status includes selected coordinates in an LTR `bdi`, so selecting a different
point changes the announcement. Clear restores the missing-location state; missing
or invalid data cannot enable submit. Controls wrap on small widths and use visible
focus. Pending selection is inert and handlers also reject pending interaction.

[Report](../../client/src/pages/report/Report.tsx) independently validates before
upload/POST. Manual selection/clear cancels device location watching and advances
an intent fence so queued old fixes cannot replace a chosen point or resurrect a
cleared one. New device requests, submission and unmount also cancel obsolete
watching. Description/type/files remain in the same component state; location
changes do not reset the draft. Guest no-image submission and payload contracts
are unchanged. New feedback uses [typed Hebrew resources](../../client/src/i18n/locales/reports.ts).

The [Report regressions](../../client/tests/reportLocation.test.cjs) execute production
component callbacks, state hooks, form markup, validation and guest thunk/HTTP
payloads with explicitly controlled hooks/Leaflet/geolocation/HTTP doubles. They
do not establish native keyboard event delivery, layout or screen-reader behavior.

**DOC-01 — outdated readiness.** The current readiness opening now identifies the
committed 3C.3A baseline, attributes the Work browser rejection and separates
pre-fix failures, local remediation evidence and pending native reacceptance.
Earlier dated results and open real-user release gates remain historical/intact.

## Executed validation

Final frozen-source checks, **2026-11-05**:

| Command / method | Actual result and boundary |
| --- | --- |
| Final map test file with original HEAD viewport substituted in memory only | **1 PASS / 6 FAIL**, reproducing the original pane stack across cleanup/navigation/session regressions. Repository source was not reset or overwritten. |
| Initial Report center-button regression before correction | **0 PASS / 1 FAIL**, specifically the missing focusable first-point action. |
| `node --test client/tests/mapTeardown.test.cjs client/tests/stationPresentation.test.cjs client/tests/stationDialogLifecycle.test.cjs client/tests/stationCreationLegacy.test.cjs` | **22/22 PASS**, including all seven new teardown cases. Real installed rendering/lifecycle modules against a DOM double; no native-browser claim. |
| `node --test client/tests/reportLocation.test.cjs` | **12/12 PASS**, production component/handler/HTTP fixtures. |
| `node --test client/tests/mapTeardown.test.cjs client/tests/reportLocation.test.cjs client/tests/stationPresentation.test.cjs client/tests/stationDialogLifecycle.test.cjs client/tests/stationCreationLegacy.test.cjs client/tests/reportSessions.test.cjs` | **40/40 PASS**, zero failed/skipped. |
| `node --test client/tests/*.test.cjs` | Final corrected-source run **218/218 PASS**, zero failed/skipped; 19 new tests over the committed 199-test baseline. Development-only Redux invariant timing warnings appeared under concurrent tests; guards/assertions were not disabled or weakened. |
| `npm.cmd run build --prefix client` | Final source PASS: 266 modules; main JS **612.92 kB**, gzip **192.89 kB**, CSS 42.74 kB. |
| `npm.cmd run build:postgres --prefix client` | Final source PASS: 266 modules; main JS **614.11 kB**, gzip **192.97 kB**, CSS 42.74 kB. Both builds retain the existing >500-kB chunk warning. |
| `client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit --incremental false`; same command with `client/tsconfig.node.json` | Both PASS. |
| Cwd `client`: `node_modules/.bin/eslint.cmd src/components/mapPreview/MapPreview.tsx src/components/mapPreview/location.ts src/components/reportForm/ReportForm.tsx src/i18n/locales/reports.ts src/pages/mapPage/stationViewport.ts src/pages/report/Report.tsx` | Six changed/new TS/TSX files PASS, zero errors/warnings; no whole-repository lint claim. |
| `node --check client/tests/mapTeardown.test.cjs`; `node --check client/tests/reportLocation.test.cjs` | Both PASS. Installed ESLint Node API with recommended rules and CommonJS/Node/browser globals also passes both new CJS files, zero findings. No dependencies/configuration added. |
| Documentation/scope hygiene | UTF-8/no BOM/final newlines on all 11 paths; four new files have no trailing whitespace; selected credential/capability literal screening; relative-link/anchor/table/fence checks and `git diff --check` PASS. This is not a full secret-history audit. |

The whole-file whitespace probe initially found pre-existing spaces in the tracked
ReportForm source. Those unrelated lines remain unchanged; tracked diff checks and
strict new-file whitespace checks pass. Builds ran outside the restricted sandbox
because of the previously established esbuild ancestor-directory restriction,
with task-authorized ignored output writes and no configuration workaround.

Full/focused integrated tests and builds use installed packages and isolated child
environments: inherited AWS/media/Cloudinary/database variables removed; media and
EC2 metadata disabled; AWS config/credential paths verified nonexistent. Controlled
fixtures never contact providers, tiles or a database. Guarded development/preview
services were not started, stopped, seeded, migrated, reset or queried.

## Browser acceptance and release boundary

This task's browser inventory returned no browser connections and
`The browser access host is unavailable`. No browser input, alternate automation
bypass, application/preview service startup or persistent preview mutation was
performed. The Work findings remain attributed native evidence; post-fix native
browser acceptance is **NOT_TESTED**.

Required native follow-up against guarded local synthetic fixtures:

1. Actual Map → Login navigation; mounted logout; two-tab logout/session changes;
   A → B → A; repeated remount and development StrictMode, with no console crash
   or blank screen and no stale camera/marker/dialog/picker state.
2. Keyboard-only initial Report point without geolocation: focus map, pan, select
   center, hear confirmation, change and clear; preserve draft and guest submit.
   Retest pointer/drag and denied/unavailable device location.
3. Hebrew RTL at 320px and 390px, visible focus/tab order, screen-reader names/status,
   pending controls and error recovery. DOM doubles/SSR do not prove these.
4. Existing cross-tab/BFCache, protected image rendering/CORS/object-URL and wider
   privacy acceptance required by readiness; no new provider acceptance claimed.

QG-01/03 account isolation and access policy remain unchanged; QG-02/04/06/09/12
are affected by these critical map/form corrections. Local automated verification
does not reverse the rejected native acceptance or approve a real-user release.
The existing security/session/JWT, enrollment/location abuse, privacy/notices/
retention, dependencies, accessibility/welfare, S3 acceptance and operational
deployment/restore/monitoring/incident gates remain open in readiness.

No auth/session recovery, protected Redux fencing, station audience, feeding DTO,
media signing, Report ownership/claim/resolve, rate limit, schema/migration,
dependency or production configuration change. Backend/PG tests are not required
for these UI/lifecycle changes under the change-based gate; their previous results
are historical, not reruns. No cloud/provider or database operation is performed.

## Independent review and handoff

The separate fresh critical read-only reviewer found one source-level
**P2 / SHOULD_FIX** issue: the map's label was assigned to a generic `div`, which
does not support author naming under [ARIA in HTML](https://www.w3.org/TR/html-aria/#docconformance-naming).
The correction assigns `role="region"` on the same focusable map container before
its label; the existing pointer/map semantics test now asserts that role. This
was an authoring-semantics finding, not an observed screen-reader failure.

After that correction, implementation QA reran the final full 218-test suite,
40 focused tests, builds, TypeScript and targeted lint successfully. The reviewer
independently passed the 40 focused tests before the correction, then the corrected
12-test Report suite and an additional in-memory production MapPreview probe.
That probe mounted installed React/React Leaflet/Leaflet under StrictMode, checked
the named region/description, drove the installed keyboard pan handler and
production center/clear controls, and verified stable map identity and longitude
wrapping. A missing native `tabIndex` default in its reused DOM double was corrected
before the probe passed; that fixture assumption was not an application finding.
It remains simulated DOM/event evidence, not native-browser acceptance.

Final independent verdict on **2026-11-05: APPROVE** for the scoped Level A change;
no remaining confirmed finding, required fix or Level A commit blocker. The reviewer
made no edits or external changes and did not independently rerun full/build/static
QA. All prior Work/native reacceptance and real-user gates remain open.

Final inventory is 11 intentional paths (seven modified, four new), index empty;
292 other baseline files unchanged. The shown-only staging commands cover exactly
those paths. Explicit Git approval remains required. No staging, commit, push,
merge or deployment is authorized or performed by this task.
