# UX.3B.1a: Mobile map visibility and station creation focus

Evidence date: **2026-11-05, Asia/Jerusalem**. Intended release: **Level A,
local development** under the [Release Quality Gate](../RELEASE_QUALITY_GATE.md).
Branch `ray-2-postgres`; actual baseline HEAD
`0766b913c244e7659327539ebc7395993efaabdb`. Initial index and working tree were
clean. Local upstream tracking was **0 ahead / 0 behind**, without fetch.
Root [AGENTS](../../AGENTS.md) applies; no nested instructions were found.

This narrowly follows the [UX.3B.1 integration](ux-3b-1-mobile-map-integration.md)
and [mobile map design](mobile-map.md). It changes presentation and creation-flow
focus, without redesigning report/station details. [Current readiness](../RELEASE_READINESS.md)
and its real-user release gates remain applicable. The real-user pilot remains
**NOT READY**.

## Original findings and expected results

These are **user-supplied native Chrome acceptance findings** for the checkpoint,
not measurements made during this remediation:

| Finding | Supplied evidence | Required result |
| --- | --- | --- |
| A: map below the initial mobile viewport | Guest map began at document y=744 at 320x740 CSS pixels, leaving no map initially visible; no page-wide horizontal overflow was observed. At 390x844, it began around y=695. | Meaningful map content in the initial mobile viewport, balanced report/station entry points, understandable guest access and accessible filters/counts/list. Preserve attribution and desktop usability. |
| B: lost focus after station form cancellation | At both mobile widths, cancelling the station dialog returned focus to BODY. | Explicit cancel and Escape return to a surviving creation control. Logout/account changes must never restore an obsolete opener or interfere with the replacement session. |

## Implemented changes

### A: put the real map before supporting content

The mobile DOM order is now compact header, real map, then supporting controls
and result list. The header retains the title, equal All/Reports/Stations controls,
equal New Report and station-create/sign-in actions, and named filter/list bypass
links. The existing filter disclosure, complete guest privacy notice with
login/register links, visible counts and loading/error feedback move together
after the map. They are retained, including their existing conditions and live
regions. The filter bypass targets a focusable support container.

At desktop widths, the support controls and list occupy the existing 350px
sidebar beside the map; the header still spans both columns. Sidebar filters use
one column. Mobile header spacing is reduced from 12px to 8px. CSS selectors stay
scoped to `.map-layout`. Existing wrapping, 44px principal targets, map height,
safe-area padding, isolated Leaflet stacking, zoom controls and attribution are
retained. No competing floating action is introduced.

This is a minimal structural/layout correction. Marker data, request paths,
filter semantics, counts, mixed-list order and authorization are unchanged.
Source and mounted tests establish the new hierarchy; **post-fix viewport
geometry and visual sufficiency remain NOT_TESTED**.

### B: own focus for the entire creation flow

`SessionMap` captures the actual Add Station button when creation starts. It
focuses the keyboard map-center selection button after the picker mounts. The
picker accepts an optional button ref; its location/GPS logic is unchanged.
Picker Escape and explicit cancel use the same cancellation path. The parent
leaves Escape to an open station form or station-details dialog.

The creation form closes its native dialog synchronously before requesting
cancel/change-location/success transitions. Its effect closes the captured dialog
node on cleanup, including unmount and StrictMode replay. Cancel and native
dialog Escape share a guarded helper; existing pending/submission guards remain.
There is no delayed focus callback or `close`-event-driven cancellation.

The parent restores the captured opener in a layout effect after React has
re-enabled it, and only if it is connected and enabled. Flow callbacks and focus
work require the mounted instance's authoritative session to remain current.
The existing session-keyed map boundary removes the old picker/form/opener on
logout or account change. No unmount cleanup explicitly restores focus. Changing location
preserves the mounted form draft and focuses the replacement picker control.
The focus call may bring its target into view; it does not change Leaflet's camera.

These changes address the removed picker opener/disabled Add button lifecycle
that left the form without a useful native return target. The baseline mounted
cancel probe failed its surviving-trigger assertion before the parent fix; the
final regression passes. Actual native focus/scroll/event delivery is still
**NOT_TESTED** in this task.

## Preserved contracts and regression coverage

Guest reports remain public; guests neither request nor receive station data.
All authenticated users can discover stations, including inactive stations;
active-only feeding and creator management remain server-enforced. Shared
food/water summaries, author-only history, media protections and independent
Report policy are unchanged. No new API, schema, dependency, grant workflow,
real GPS call, backend or provider operation is introduced.

[Session isolation](../security/sec-1b-3c-2-client-integration.md),
[cross-tab logout recovery](../security/sec-1b-3c-3a-session-recovery.md),
[Leaflet/picker remediation](../security/sec-1b-3c-3b-browser-remediation.md)
and [remaining browser acceptance](../security/sec-1b-3c-4-browser-acceptance.md)
remain applicable. Existing session/request fences, camera disposal and station
details implementation are retained.

Ten added mounted regressions cover picker/form explicit cancel and Escape in
normal/StrictMode; change-location draft preservation and refocus in both modes;
obsolete picker/form callbacks after logout/account change, including while a
replacement account's flow is active; station-details Escape/focus; and
station-details Escape while a creation picker is active. They assert surviving
focus targets, enabled state, no unintended writes, stable map/camera and removed
old-session controls. Existing guest hierarchy coverage now checks the map
before filters/notices/counts/list, both care entry points and filter/list bypass.
All previous ordering/count, privacy, session and teardown assertions remain.

The DOM double models disabled controls and native close returning to a connected,
enabled previous focus target, with BODY fallback when that target was removed.
An initial StrictMode probe failure also reproduced without creation and came
from the double's incomplete close behavior. The double was aligned with the
existing station-dialog lifecycle fixture; no production details code was
changed and no product defect was established by that probe. Native focus,
layout and assistive-technology behavior are outside this model.

## Verification performed

All commands ran against this uncommitted change on the evidence date, using
installed Node **22.22.0**, npm **9.6.5** and existing locked packages. Tests use
installed React/React DOM/React Leaflet/Leaflet and production components with
bounded DOM, HTTP and storage doubles. They do not establish browser geometry,
actual cross-tab scheduling or backend/provider behavior.

| Command / method | Actual result and evidence tier |
| --- | --- |
| `node --test client/tests/mapTeardown.test.cjs client/tests/uiCopy.test.cjs client/tests/stationCreationLegacy.test.cjs` | **VERIFIED / PASS, 34/34**, zero failures/skips. Mounted component and UI-copy checks; no literal or encoded U+2014 added to Ray interface copy. |
| `node --test client/tests/*.test.cjs` | **VERIFIED / PASS, 256/256**, zero failures/skips. Includes authentication/session, cross-tab recovery doubles, account isolation, feeding/privacy/media, stale callbacks, form and Leaflet teardown regressions. |
| `npm.cmd run build --prefix client` | **VERIFIED / PASS**, 266 modules; CSS 45.45 kB / gzip 11.63 kB, main JS 619.06 kB / gzip 194.61 kB. Existing >500-kB chunk warning remains. |
| `npm.cmd run build:postgres --prefix client` | **VERIFIED / PASS**, 266 modules; CSS 45.45 kB / gzip 11.63 kB, main JS 620.25 kB / gzip 194.74 kB. Same warning. |
| `client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit --incremental false`; same for `client/tsconfig.node.json` | Both **VERIFIED / PASS**. |
| Cwd `client`: `node_modules/.bin/eslint.cmd src/pages/mapPage/MapPage.tsx src/components/createFeedingStation/CreateFeedingStation.tsx src/components/createFeedingStation/StationLocationPicker.tsx` | **VERIFIED / PASS**, zero errors/warnings. This is affected-file lint, not a new full-repository lint claim. |
| `node --check` on the two changed CJS tests; installed ESLint Node API with recommended rules and Node/browser globals | **VERIFIED / PASS**, zero errors/warnings. No lint configuration changes. |
| Installed PostCSS parses MapPage CSS; CSS AST checks scoped `.map-layout` selectors | **VERIFIED / PASS**, parsing/source assertions only, no layout-engine claim. |
| Changed-file UTF-8/final-newline/trailing-whitespace, documentation links/formatting, bounded credential/signed-capability screening, separate new-file checks and `git diff --check` | **VERIFIED / PASS** for all seven paths, including the untracked report; nine relative links valid, zero bounded sensitive-pattern candidates and an empty index. |

Tests and builds used process-local isolation: inherited AWS/media/Cloudinary/
database settings removed, media and metadata disabled, AWS config/credential
paths verified nonexistent. Both requested builds used automatic-review-approved
filesystem traversal for esbuild's Windows ancestor lookup. No configuration
workaround, package installation, cloud, database, preview reset or real GPS
operation occurred. Production source was unchanged between those builds and
the final test-only fixture refinement.

## Native acceptance boundary

The browser connector inventory returned **The browser access host is
unavailable**, with no browser surfaces. No alternative runner, fixture server,
native input, screenshots or access-restriction bypass was used in this task.

**NOT_TESTED after this change:** actual 320x740 and 390x844 CSS-pixel layouts,
desktop geometry, map document/top coordinates, initial visible map height,
page-wide overflow, attribution/control clipping, touch, safe areas, virtual
keyboard, zoom/reflow, contrast, native Tab/Escape/focus/scroll restoration,
screen-reader announcements and actual multi-tab event scheduling. No fresh
browser screenshots exist. Automated structural/focus assertions are not native
Chrome or accessibility acceptance.

When supported access is available, measure map top/bottom and viewport
intersection at both exact mobile sizes and desktop; record horizontal overflow
and authentic screenshots. Check guest/member All/Reports/Stations, filters,
counts, guest notice and both care entry points; attribution and picker controls;
picker/form explicit cancel and Escape; change location; station-details Escape
with/without creation; navigation/logout/account switching, including two tabs.
Verify visible and announced focus, not just `activeElement`.

## Gate assessment and UX.3B.2

Local automated checks support **Level A** review of this scoped change.
QG-01/03/04/09/12 have affected source/offline evidence; QG-02/06 native manual
acceptance remains **NOT_TESTED**. QG-07 retains the bundle warning. No backend,
PostgreSQL or provider checks were run because their code/configuration did not
change. This does not certify Level B/C/D, accessibility or a real-user pilot.
The separate independent critical read-only review returned **GO for scoped
Level A pre-Git review**, with no confirmed introduced defect or required
production/test correction. It independently reran the focused 34-test suite,
both no-emit TypeScript checks, `git diff --check` and report link/encoding checks.
Full-suite/build results above are implementation-agent evidence, not independent
reruns. Git writes still require user authorization.

The following remain explicitly open for **UX.3B.2**, without implementing new
routes, categories or details cards here:

- Legacy report popup clipping at 320px.
- Escape not closing the legacy report popup.
- Report-list entries lacking a complete details/location/navigation path.
- Marker and list selection opening shared contextual details, with equally
  usable report/station information and appropriate domain actions.

## Inventory and handoff

Changed paths: `MapPage.tsx`, `MapPage.css`, `StationLocationPicker.tsx`,
`CreateFeedingStation.tsx`, `mapTeardown.test.cjs`,
`stationCreationLegacy.test.cjs`, and this new report. The original design,
prototype, UX.3B.1 report, UI-copy regression, readiness, production server,
schema, dependency/lockfiles and unrelated work are preserved.
A before/after content comparison of all 311 baseline files verifies the six
tracked edits, this one new file, no deletions and 305 unchanged files.

Suggested commit message: `fix: prioritize mobile map and restore station creation focus`.

Reviewed staging command is **shown only**, not executed. Git writes require the
user's authorization after the separate critical review.

```powershell
git add -- "client/src/pages/mapPage/MapPage.tsx" "client/src/pages/mapPage/MapPage.css" "client/src/components/createFeedingStation/StationLocationPicker.tsx" "client/src/components/createFeedingStation/CreateFeedingStation.tsx" "client/tests/mapTeardown.test.cjs" "client/tests/stationCreationLegacy.test.cjs" "docs/design/ux-3b-1a-mobile-map-remediation.md"
```

No staging, commit, push, merge, deployment, cloud or database operation was
performed. Pre-existing services, preview records and media were not modified.
