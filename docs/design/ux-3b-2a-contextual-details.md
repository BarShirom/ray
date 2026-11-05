# UX.3B.2A: Shared map selection and contextual details

Evidence date: **2026-11-05, Asia/Jerusalem**. Intended release: **Level A,
local development** under the [Release Quality Gate](../RELEASE_QUALITY_GATE.md).
Branch `ray-2-postgres`; actual HEAD matches the expected checkpoint:
`6a0019ec6eb65cfb856e65ca75796c315b6949ee`. Initial index and working tree were
clean; local upstream tracking was **0 ahead / 0 behind**, without fetch.
Root [AGENTS](../../AGENTS.md) applies; no nested instructions were found.

This implements equally usable report/station selection using existing data and
permissions. It follows the [mobile prototype design](mobile-map.md),
[map foundation](ux-3b-1-mobile-map-integration.md) and
[mobile visibility/creation-focus remediation](ux-3b-1a-mobile-map-remediation.md).
[Release readiness](../RELEASE_READINESS.md) is unchanged. The real-user pilot
remains **NOT READY**; this change grants no deployment or Git-write authority.

## Implemented architecture and interaction

`SessionMap` owns one local discriminated selection: `kind`, item `id`, `stage`
(compact/full) and monotonically increasing `epoch`. It stores no report/station
object in selection state and creates no global selection store. Each render
resolves the ID from the current visible, authorized collection. Domain switches,
filters and collection removals unrender unavailable selections immediately and
clear their references. Existing alternating list order and visible-count meanings
are retained.

Both marker components now report an ID and actual marker opener. Both map-list
domains call the same parent selection function. Selecting another item replaces
the prior selection; selecting the same item from a different entry point uses
that new opener. Stage transitions and replacement advance the epoch, so a retained
old close/expand callback cannot dismiss a later dialog, including after reopening
the same item. The session-keyed Leaflet boundary still includes identity,
auth-loading state and station authorization revision.

`MapSelectionCard` is a reusable named, nonmodal region with a focusable heading,
explicit close and full-details controls. It is in normal document flow directly
below Leaflet within the map section. It introduces no overlay, floating action,
drag interaction, focus trap or `aria-modal`. The map, controls and attribution
remain in their existing DOM; card CSS does not cover them. Shrinkable columns,
wrapping text/buttons and 44px principal targets apply at both mobile widths.
Desktop retains the existing map/sidebar foundation. Actual geometry remains
unmeasured in this task.

Selection requests focus on the compact heading. Closing it returns to the
connected, enabled list/marker opener, with the surviving map heading as fallback.
When filtering removes a selection, focus on a surviving filter is preserved;
focus lost with removed content receives the fallback. The compact card remains
mounted behind full details so its expand control survives. Native `showModal()`
blocks background interaction only while full details are open. Explicit close
and Escape close the native dialog before the parent returns focus to expand.
No unmount cleanup explicitly restores focus and no delayed focus callback is
scheduled. Session/current-selection guards prevent obsolete callbacks borrowing
another account or affecting a replacement flow.

The creation picker/form keeps its existing focus lifecycle and guards. Picker
Escape does not consume a selected full-details dialog's Escape; a creation form
owns Escape while it is modal. Full selection expansion is refused while the
creation form is open. No new path intentionally nests native dialogs.

## Report presentation and actions

`ReportMarker` no longer imports or renders a Leaflet Popup or dispatches report
mutations. It retains the existing type/status icons, marker names and Leaflet
keyboard activation. Both marker domains explicitly disable `autoPanOnFocus`:
DOM `preventScroll` alone does not prevent Leaflet's own focus-triggered panning.
Opening/closing selection does not intentionally change map center, zoom or fit.

The report compact card shows existing type, actual status, a description preview
of up to 180 Unicode code points and a labelled `updatedAt` only when valid. The
underlying description is preserved, including user-authored punctuation. Full
`ReportDetails` shows the complete description, current public-DTO reporter/
assignee names, existing media, status, creation/update times and validated Waze/
Google Maps links. Invalid/nonfinite/out-of-range coordinates suppress navigation;
zero coordinates remain valid. Resolved copy explains that an app status is not
confirmation of professional treatment. No care timeline or future workflow is
invented.

`ReportCard` adds an optional independent details button, keeping existing
consumers such as MyReports compatible. It does not wrap claim/resolve in another
button. Map list selection therefore reaches the same compact/full details and
navigation without operating a marker. This scope improves the map's list;
it does not add a separate report route or details flow to every other page.

The card and full details share `reportActionFor` eligibility. `SessionMap` owns
the existing claim/resolve thunks and rechecks current report status, actor,
permissions, visible membership and authoritative session before dispatch. A
per-report synchronous pending set prevents duplicate list/full submissions.
Pending status, disabled controls and bounded localized errors remain visible.
Existing typed API failures preserve kind, status, retry and request/session
identity. The account-level report-action cooldown is independent of the latest
error presentation; a deadline ref also fences retained pre-429 callbacks. A
shorter concurrent 429 cannot shorten the active wait. Timers only enable manual
retry and never issue a request.

Report media reuses `MediaImage` and the prior Report popup's image/video
presentation policy. It does not acquire the station media policy. Public Report
DTO identities, images/external hosts and audience risks remain subject to the
existing readiness gates. The old marker CSS's shared button variants are
retained unchanged; only obsolete popup rules are removed.

## Station summary and full details

`StationSelectionSummary` renders activity, finite estimated cat/kitten counts
and separate approved food/water recency buckets through
`FeedingCoordinationSummary`. Existing copy explains that no Ray record does not
prove the cats were unfed. It requests only the selected station's summary through
the current protected thunk, without detail/image/personal-history prefetch.
Guests and obsolete sessions cannot request or present it. Errors require explicit
retry; reselection and StrictMode do not turn errors into automatic requests.

Full details reuses `FeedingStationDetails` and its existing feeding form, own
history, detail/media loading and retry behavior. Added current-session checks
guard presentation, initial reads and close callbacks. Expansion preserves pending
or failed detail/summary/history reads instead of bypassing their explicit retry
controls, including Retry-After. Successful cached resources may refresh. Food-only
and water-only logging, private own notes/times, active-only feeding and existing
server-derived management permissions are retained. No feeding form, grant
workflow, management UI or history audience is invented.

The station marker no longer renders its competing Leaflet popup; it uses the
same compact-to-full path as reports. Private image loading remains in full
details with `StationMediaImage` source/session fences, abort/disposal and Blob URL
cleanup. No protected station image is exposed to guests.

## Preserved security and prototype boundaries

[Session isolation](../security/sec-1b-3c-2-client-integration.md),
[cross-tab recovery](../security/sec-1b-3c-3a-session-recovery.md),
[Leaflet/picker safety](../security/sec-1b-3c-3b-browser-remediation.md),
[native acceptance limits](../security/sec-1b-3c-4-browser-acceptance.md) and
[S3 protections](../migrations/s3-media.md) remain applicable. Guests see public
reports but no stations, feeding data or station images. Authenticated station
viewing, active-only feeding and server-controlled management are unchanged.
Selection is presentation, not authorization. Shared station summaries reveal no
other feeder identities, exact feeding times or private notes. Only selected full
details requests the author's history. Previously copied data/signed capabilities
are not made immediately revocable by UI cleanup.

Unlike the standalone UX.3A prototype, this uses real installed Leaflet, production
Redux/thunks and existing DTOs; it supplies no demo-account switch, simulated care
workflow, future categories, drag sheet or new provider integration. There is no
React Native migration, new dependency, backend/API/schema/JWT change, GPS request,
background tracking or cloud operation. Existing Hebrew/RTL and typed resource
checks remain; no U+2014 is introduced into application copy or used to rewrite
user-generated descriptions.

## Verification and evidence tiers

Executed on the evidence date with Node **22.22.0**, npm **9.6.5** and existing
locked packages. Mounted tests use installed React/React DOM/React Leaflet/Leaflet
with bounded DOM, storage, HTTP, clock and object-URL doubles where applicable.
They do not establish native rendering, keyboard delivery, provider behavior or
actual multi-tab scheduling.

| Command / method | Actual result and boundary |
| --- | --- |
| `node --test client/tests/mapTeardown.test.cjs client/tests/reportDetails.test.cjs client/tests/stationSelectionSummary.test.cjs client/tests/stationDialogLifecycle.test.cjs client/tests/uiCopy.test.cjs client/tests/contextualDetailsLayout.test.cjs` | **VERIFIED / PASS, 77/77**, zero failures/skips. Component/state/lifecycle/permission/copy and CSS-source evidence. |
| `node --test client/tests/*.test.cjs` | **VERIFIED / PASS, 296/296**, zero failures/skips; 40 new tests over the 256-test checkpoint. Retains auth/session/privacy/media/creation/teardown coverage. |
| `npm.cmd run build --prefix client` | **VERIFIED / PASS**, 270 modules; CSS 46.48 kB / gzip 11.72 kB, main JS 624.15 kB / gzip 195.92 kB. Existing >500-kB chunk warning remains. |
| `npm.cmd run build:postgres --prefix client` | **VERIFIED / PASS**, 270 modules; same CSS, main JS 625.33 kB / gzip 196.04 kB. Same warning. |
| `client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit --incremental false`; same for `client/tsconfig.node.json` | Both **VERIFIED / PASS**; independently repeated against frozen source. |
| Cwd `client`: `node_modules/.bin/eslint.cmd src/pages/mapPage/MapPage.tsx src/components/mapSelection/MapSelectionCard.tsx src/components/mapSelection/StationSelectionSummary.tsx src/components/reportCard/ReportCard.tsx src/components/reportCard/reportAction.ts src/components/reportDetails/ReportDetails.tsx src/components/reportMarker/ReportMarker.tsx src/components/feedingStationMarker/FeedingStationMarker.tsx src/components/feedingStationDetails/FeedingStationDetails.tsx src/i18n/locales/reports.ts` | **VERIFIED / PASS**, zero errors/warnings; the final station guard edit also passed its affected-file check. |
| `npm.cmd run lint --prefix client` | **VERIFIED / PASS**, zero errors; one pre-existing `react-refresh/only-export-components` warning at unchanged `Media.tsx:6`. |
| `node --check` on changed/new `mapTeardown.test.cjs`, `reportDetails.test.cjs`, `stationSelectionSummary.test.cjs`, `contextualDetailsLayout.test.cjs`; installed ESLint Node API with recommended rules and Node/browser globals | All four **VERIFIED / PASS**, zero lint errors/warnings. |
| PostCSS parsing of five affected CSS files and two 320/390px source-contract tests | **VERIFIED / PASS**: in-flow shrinkable card, wrapping controls, viewport-bounded scrollable report dialog and scoped map selectors. No pixel calculation or browser acceptance. |
| Documentation links/formatting, UTF-8/final-newline/whitespace, separate untracked-file checks, bounded credential/capability screening, snapshot inventory and `git diff --check` | **VERIFIED / PASS** for all 20 paths, including nine untracked files; 11 relative links valid, eight generated build text files screened with no bounded sensitive-pattern candidates, index empty. |

The map fixture adds 17 cases and preserves all 28 existing tests, adapting direct
station-dialog tests to compact/expand entry. It covers both domains and entry
points, normal/StrictMode, current-data resolution, replacement/filter/removal,
safe focus fallback, guest report navigation and station refusal, inactive station
privacy, feeding history/logout, claim/resolve permissions and pending behavior,
same-item reopen stale callbacks, delayed A summary after B, marker focus panning
options and overlapping 429 deadlines. New report tests add 11 cases; station
summary/full retry tests add 10; CSS source contracts add two.

Implementation-agent final focused/full tests and both builds used process-local
provider/database isolation: inherited
AWS/media/Cloudinary/database settings removed, media/metadata disabled and AWS
config/credential paths verified nonexistent. Requested builds used
automatic-review-approved filesystem traversal for esbuild on Windows. No package
installation, application/API server, database service, preview reset, cloud or
GPS operation was used. No backend/PostgreSQL/provider checks were rerun because
their source/configuration did not change.

The separate critical read-only reviewer independently passed the 77-test focused
command, both TypeScript checks and `git diff --check`. It identified Leaflet's
focus-pan default and the cross-report cooldown bypass; both were corrected and
regressed before frozen QA. Station reopening pending/error guards were also
reviewed and tested. Its final verdict is **GO for scoped Level A source/offline
review**, with no unresolved production/test correction. Its documentation
precision correction is incorporated: the independent commands used offline
doubles and did not claim the implementation runner's environment-isolation
checks. Full suite and build totals above are implementation-agent evidence,
not independent reruns.

## Native acceptance and previous findings

The supported browser inventory returned no browser surfaces and **The browser
access host is unavailable**. No alternate runner, fixture server, native input,
screenshots or access-restriction bypass was used in this task.

| Previous Work finding | Implemented resolution | Verification limit |
| --- | --- | --- |
| Legacy report popup clips at 320px, including close. | Report Popup interaction and its content CSS removed; both entry points open the wrapping compact card and viewport-bounded full dialog. | Source/automated PASS; actual 320px geometry **NOT_TESTED**. |
| Escape repeatedly fails to dismiss legacy report popup. | Compact Escape and native full-dialog cancel use guarded close paths with focus return. No legacy report popup remains in this flow. | Mounted/callback PASS; native keyboard/focus **NOT_TESTED**. |
| Report list has no complete details/location/navigation path. | Independent list details opener reaches the same report full details and validated navigation as marker selection. | Mounted/public-DTO/navigation PASS; native reader/keyboard journey **NOT_TESTED**. |
| Shared contextual details missing for both domains. | Shared ID selection and nonmodal shell, then report full details or reused station details. | Automated parity/current-state/session PASS; native usability **NOT_TESTED**. |
| Earlier mobile map visibility and creation cancellation focus. | Existing map-first foundation and creation focus implementation retained, with its regressions passing. | This does not add fresh native geometry/focus evidence to UX.3B.1a. |

**NOT_TESTED:** actual measured 320x740 and 390x844 CSS-pixel and desktop layouts,
card visibility, horizontal overflow, control/attribution clipping, native
Tab/Enter/Escape/focus/scroll restoration, modal inertness, touch, safe areas,
browser chrome/virtual keyboard, contrast, zoom/reflow, screen-reader names and
announcements, browser wire/media decoding/Blob reclamation, actual two-tab
scheduling and physical devices. No new screenshots exist. DOM doubles, SSR and
PostCSS are not substitutes for these checks.

When supported browser access is available, measure both exact mobile viewports
and desktop. Select each domain from marker and list, expand/close/Escape, use
report navigation without map interaction, inspect independent food/water and
author-only history, exercise guest/member/inactive/error/429 states and account
changes including two tabs. Verify visible/announced focus and controls, map
position and attribution, wrapping/no overflow, creation cancel/change-location
and protected-media cleanup. Do not request real GPS or live providers for an
ordinary local acceptance run.

## Gate assessment and handoff

Affected QG-01/03/04/09/12 have source/offline regression evidence. QG-02/06 native
accessibility/mobile acceptance remains **NOT_TESTED**. QG-07 retains the bundle
warning; QG-10 changed-file/build-output bounded screening passes. This is scoped
Level A work, not Level B/C/D, accessibility certification or real-user pilot
clearance. The remaining privacy, enrollment/abuse, welfare, media, operating and
accessibility blockers in readiness remain open. No readiness edit is warranted
by local-only evidence.

Changed tracked paths:

- `client/src/components/feedingStationDetails/FeedingStationDetails.tsx`
- `client/src/components/feedingStationMarker/FeedingStationMarker.tsx`
- `client/src/components/feedingStationMarker/FeedingStationMarker.css`
- `client/src/components/reportCard/ReportCard.tsx`
- `client/src/components/reportCard/ReportCard.css`
- `client/src/components/reportMarker/ReportMarker.tsx`
- `client/src/components/reportMarker/ReportMarker.css`
- `client/src/i18n/locales/reports.ts`
- `client/src/pages/mapPage/MapPage.tsx`
- `client/src/pages/mapPage/MapPage.css`
- `client/tests/mapTeardown.test.cjs`

New paths:

- `client/src/components/mapSelection/MapSelectionCard.tsx`
- `client/src/components/mapSelection/StationSelectionSummary.tsx`
- `client/src/components/reportCard/reportAction.ts`
- `client/src/components/reportDetails/ReportDetails.tsx`
- `client/src/components/reportDetails/ReportDetails.css`
- `client/tests/contextualDetailsLayout.test.cjs`
- `client/tests/reportDetails.test.cjs`
- `client/tests/stationSelectionSummary.test.cjs`
- `docs/design/ux-3b-2a-contextual-details.md`

The existing prototype/design/remediation documents, UI-copy regression,
readiness, backend, dependencies/lockfiles and unrelated work are preserved.
A saved 312-file baseline content snapshot confirms exactly 11 tracked edits,
nine new files, no deletions and 301 unchanged baseline files.

Suggested commit message: `feat: add shared mobile map detail cards`.
Reviewed staging commands are **shown only**, not executed; no wildcard staging.
The separate independent critical read-only review is complete for this Level A
scope. Git writes still require user authorization.

```powershell
git add -- "client/src/pages/mapPage/MapPage.tsx" "client/src/pages/mapPage/MapPage.css" "client/src/i18n/locales/reports.ts" "client/src/components/mapSelection/MapSelectionCard.tsx" "client/src/components/mapSelection/StationSelectionSummary.tsx" "client/src/components/reportCard/ReportCard.tsx" "client/src/components/reportCard/ReportCard.css" "client/src/components/reportCard/reportAction.ts" "client/src/components/reportDetails/ReportDetails.tsx" "client/src/components/reportDetails/ReportDetails.css" "client/src/components/reportMarker/ReportMarker.tsx" "client/src/components/reportMarker/ReportMarker.css" "client/src/components/feedingStationMarker/FeedingStationMarker.tsx" "client/src/components/feedingStationMarker/FeedingStationMarker.css" "client/src/components/feedingStationDetails/FeedingStationDetails.tsx"
git add -- "client/tests/mapTeardown.test.cjs" "client/tests/contextualDetailsLayout.test.cjs" "client/tests/reportDetails.test.cjs" "client/tests/stationSelectionSummary.test.cjs"
git add -- "docs/design/ux-3b-2a-contextual-details.md"
```

No staging, commit, push, merge, deployment, cloud or database operation was
performed. Pre-existing services, preview records and media were not modified.
