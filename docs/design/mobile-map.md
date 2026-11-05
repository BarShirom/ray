# UX.3A — מפת קהילה למובייל: הצעת אינטראקציה

Date: **2026-11-05, Asia/Jerusalem**. Prototype/design scope only, Release Quality
Gate **A**. Branch `ray-2-postgres`; actual HEAD
`076fbb5d383777e3d895b28e274ee8b5f91b9686`. Preflight tree/index clean, local
upstream **0 ahead / 0 behind**, without fetch. SEC.2A.1 is committed at this HEAD.
The product-priority follow-up preserves the two intentional untracked prototype
files; no tracked/application file is changed.
Read [AGENTS](../../AGENTS.md), [Quality Gate](../RELEASE_QUALITY_GATE.md),
[readiness](../RELEASE_READINESS.md), localization and browser-remediation evidence.
No nested AGENTS applies; readiness and historical evidence are unchanged.

Open [the self-contained prototype](../prototypes/mobile-map.html) directly in a
current browser. Exact local path:
`C:\Users\97254\Desktop\projects-2025\ray\docs\prototypes\mobile-map.html`.
Double-click the file, or use the browser's Open File command. No server, build,
installation, credentials or internet connection is needed. Refresh restores the
initial guest fixtures; all changes live only in this page's memory. Do not enter
real descriptions or personal information.

## One proposed direction

**Product priority clarification:** comprehensive community-cat welfare is the
purpose. Stations and reports are complementary, equally important core domains;
neither is a primary/secondary feature. Food/water and ongoing care, injured/sick/
distressed cats, kittens, sterilization needs, and reporting/follow-up/coordination
all inform this direction. Future examples below are concepts, not implemented
or approved operational workflows.

The map is the primary surface. The default **הכול** overview combines stations
and reports for members, with equal **תחנות / דיווחים** controls and independent
filter groups. Guests see public reports and an explicit station sign-in explanation,
without protected fixtures/counts. Equally styled **תחנות והאכלה** and **דיווח חדש**
actions stay outside the map; neither domain is a secondary action. One small
group contains schematic zoom/recenter controls;
it never requests location. The same composition expands on desktop without
becoming a three-column dashboard. The design starts at 390px, includes 320px
rules, system Hebrew fonts and the existing blue brand direction with quieter
map colors. This is a proposal, not a production CSS change.

Markers have shape, icon and text distinctions, with a selected ring and explicit
pressed state. Activating a marker opens a **nonmodal compact card**; the map
remains available and focus is not trapped. A list control provides the same
items and selection path for both domains without requiring spatial navigation.
Report cards show need/status, short description and synthetic `updatedAt`, labelled
**עדכון אחרון שנרשם**. Station cards show name/activity and useful, separate shared
food/water recency. Both lead to full details and domain-appropriate actions in
the same number of selection steps. There is no invented care timeline/outcome.

**כל צורכי חתולי הקהילה** opens a five-area welfare overview. Current station/
report capabilities are distinguished from clickable future-only examples for
dedicated kitten support, sterilization/neutering and care-provider coordination.
Each future example says **עתידי — לא קיים ביישום**, has no operational form/action,
and does not add a Report type or imply service receipt. General/urgent Reports
can already describe kittens; the dedicated workflow is the future concept.
Synthetic marker positions are separated in the mixed overview, and list order
follows the schematic drawing rather than domain priority or fake distances.

**לפרטים המלאים** opens a native modal `<dialog>`. Background interaction is
unavailable through `showModal()`. The header/primary footer stay outside the
scrolling body. Explicit close/back and Escape return focus to the compact
card; closing the compact card returns to the marker/list opener, with a visible
view-control fallback when that opener is hidden. Modal close cleanup is
synchronous and ignores a delayed old close event after a replacement opens.
Selection and schematic camera position survive detail open/close in the same
simulated account. Every account change resets them.

## Current source versus proposal

Source observations, **not an actual inspection of the running app**:

- [MapPage/CSS](../../client/src/pages/mapPage/MapPage.css) stacks panels below
  900px, uses three columns above, and assigns 60vh per mobile panel.
  [ReportMarker](../../client/src/components/reportMarker/ReportMarker.tsx) uses a
  large Leaflet popup. Compact card → modal is proposed UI.
- Reports implement only `emergency`, `food`, `general` and `new`, `in-progress`,
  `resolved`. Existing [ReportCard](../../client/src/components/reportCard/ReportCard.tsx)
  allows authenticated claim of new reports and UI resolution by the stored
  assignee of in-progress reports; backend checks remain authoritative. A food
  Report is not a station log. Current cards show `createdAt`; the API also supplies
  `updatedAt`, explicitly labelled in this proposal.
- Public Report discovery and guest no-image creation remain. No real identity,
  phone/photo/location, operational sterilization/kitten/provider workflow, new
  organization role, messaging, notification, dispatch or clinical outcome is added.
  The welfare overview's explicitly future concepts do not change current capabilities.
- The [approved station beta policy](../security/station-visibility-design.md#17-sec1b-3c0-approved-first-beta-policy-and-implementation-plan)
  denies guests station fixtures, allows all authenticated accounts to view every
  station and allows feeding only at active stations. Management stays
  creator-controlled; no editing, deletion, invitation/grant or visibility UI.
- Station details separate coarse shared food/water recency from **ההיסטוריה שלי**.
  Shared data has no feeder identity, precise time or private note. Exact synthetic
  times/notes are author-only. No record means no Ray record, not no food.

## Click-through guide

| State | How to reach it | Expected prototype behavior |
| --- | --- | --- |
| Balanced overview | Open/refresh the file | **הכול** is the neutral default. Guests see public reports and the station-access explanation; members see both domains together. No protected station count/preview for guests. |
| Guest stations | Choose **תחנות** or **תחנות והאכלה** | Sign-in explanation, no rendered station markers/list/detail data. |
| Member / account switch | **הדגמה: אורח** → choose account A or B → update | Explicit simulation; no real authentication/storage. New account starts in the mixed overview with neutral camera and cleared selections/drafts. |
| Report compact → full → map | Activate a marker → full details → close; Escape closes the compact card | Same selection/camera within an account, with requested focus restoration. |
| List alternative | Choose **רשימה** → activate an item | Same compact card and full detail path. |
| Equal station/report selection | Member overview or list → either marker/item → compact → details | Same selection/expand/close path. Station summary is immediately useful; full feeding/history and Report actions remain domain-specific. |
| Active station / own history | Account A → active station → details | Independent food/water buckets; expand own history. Account B has no seeded personal log. |
| Water-only feeding / recoverable draft | Active station → feeding demo → uncheck food → optional synthetic note → example error → confirm | Draft remains; explicit confirmation adds an in-memory own-history example only. Shared summaries stay fixture data; nothing is recorded in Ray. |
| Inactive station | Choose the dashed **לא פעילה** station | Viewable content and clear unavailable explanation; feeding action disabled and guarded. |
| Claim / resolve | Member A → new report → demo claim → demo resolve | Only permitted simulated transitions; resolved is not verified medical care. Member B cannot resolve A's in-progress fixture. |
| Loading / no results / retry | Demo controls → choose map/list state or details state | Deterministic states with explicit manual completion/retry; no background timer or automatic request. Filter controls also produce genuine empty fixture subsets. |
| Image states | Demo controls → choose placeholder, no image, loading or unavailable → open details | Local illustration, explicit no attachment, or recoverable failure; no actual photo/load/decoder. |
| Guest report form | **דיווח חדש** | Synthetic description and manual point select/clear/reselect, no image; submit only explains the simulated action and preserves draft. No new map record/API write. |
| Welfare / future-only examples | **כל צורכי חתולי הקהילה** → kitten, sterilization or coordination example | All five welfare areas represented. Each future example is explicitly not implemented, read-only and offers only a return path. |
| Protected cleanup | Open member station details → **התנתקות מדומה ובדיקת ניקוי התצוגה** | Modal/compact/station markers/images/own log/draft and camera cleared; neutral guest overview shows only public reports and the access explanation. |

## Security and accessibility boundary

The visible notice **אב־טיפוס — נתונים סינתטיים** appears in the page and modal.
All graphics are inline SVG. There are no external resources, network/storage,
auth, GPS or upload calls; CSP also blocks connections/form navigation/frames.
UI gating is **not server authorization**: the standalone fixture source is readable.

Real buttons, semantic groups, visible focus, 44px minimum principal targets,
keyboard marker/list activation, Escape, mixed-text isolation/wrapping and
permanent status/alert announcement nodes are supplied. No compact-card focus trap
or false `aria-modal` is used. Native reader/focus/contrast/reflow behavior still
requires browser verification; there is no accessibility/legal conformance claim.

Preserve [session generation/isolation](../security/sec-1b-3c-2-client-integration.md),
[read-only logout recovery](../security/sec-1b-3c-3a-session-recovery.md), and
[Leaflet teardown/manual selection](../security/sec-1b-3c-3b-browser-remediation.md).
Auth/authorization loss must discard selections, overlays, camera center/zoom/
bounds/fit/picker state, drafts and stale responses. Keep station images private,
parent-authorized, session/source fenced and abortable; revoke Blob URLs. Asset
failure does not prove parent deletion; Report policy stays separate. This
prototype has no real requests/Blob URLs and cannot verify those controls.

Foreground location must be explicit/optional, with manual keyboard pan/select/
clear, denied/unavailable feedback and cancellation of late callbacks. No GPS on
map open or background tracking/geofencing. Preserve unobscured real-map attribution.
Dynamic viewports, safe areas and scrollable sheets need actual browser-chrome,
virtual-keyboard and orientation verification.

## Verification

Browser inventory on the evidence date returned **The browser access host is
unavailable**, with no connected browser surfaces. The existing local app was not
visually inspected. No workaround, new browser runner, screenshot, application
test/build, backend/PG suite, database/service or live-provider operation occurred.
This does not block delivery of the runnable prototype.

Local checks **PASS**: Node `vm.Script` compiles the inline JS. PostCSS parsing passed.
HTML checks verify Hebrew/RTL, unique static IDs/local
fragments and no external resources or network/storage/GPS calls. **UX-L01–L20**
pass 20 bounded VM/DOM-double scenario groups covering the click-through states,
requested focus targets, account cleanup, stale close, permissions, draft retention
and escaped mixed-text notes. Calls to network/storage/GPS would fail the fixture;
none occurred. These checks ran through standard input, without adding a test
framework/file. UX-L17–L20 additionally cover mixed-domain card/action routing,
both entry points, read-only future examples and independent filters/account reset.
HTML validation passes **43 unique static IDs / 12 local fragments**;
the note passes **11 relative links/anchors** and table formatting. Both new files
pass UTF-8/BOM, final-newline, whitespace and sensitive-pattern screening;
`git diff --check` passes, with untracked files checked separately. The index is
empty and all tracked files are unchanged.

A separate focused read-only source review found no remaining required correction
for local prototype/product review after empty-image, announcement, wrapping and
touch-target refinements. The product-priority follow-up also received a separate
read-only source check of equal domain attention, mixed-item routing, guest privacy,
account cleanup and future-state honesty, with no remaining required correction.
These are not native accessibility or application-integration approval; the
review/implementation sequence below still applies.

**NOT_TESTED:** native click/keyboard/Escape/focus restoration, modal inertness,
screen-reader announcements, actual 320/390px/desktop geometry and horizontal
overflow, zoom/reflow, touch, virtual keyboard and browser wire capture. Source
intent and DOM doubles do not turn these into browser PASS. No screenshots exist.
Readiness and all existing release blockers remain unchanged.

## Small implementation sequence after review

1. Product/visual review of this single direction, followed by a separate focused
   read-only accessibility/security review before application integration.
2. Extract Report/Station presentation in existing React/typed Hebrew resources,
   current APIs and session-scoped selection; add no backend/provider.
3. Replace Report popups with compact card/native dialog and retain the list.
   Preserve Leaflet within an authorized session, use `invalidateSize` after real
   layout changes, and retain safe session teardown.
4. Integrate existing summary/own-history/media/actions with typed failures, drafts,
   explicit retry and abort/revocation boundaries intact.
5. Verify 320/390px/desktop, keyboard/reader, mixed text, attribution, denied GPS,
   account/logout races and media. Future React Native could reuse domain contracts;
   native location/navigation/accessibility/lifecycle need separate design. No
   rewrite or claim of native parity is part of UX.3A.

Only `docs/prototypes/mobile-map.html` and this note are deliverables. No staging,
commit, push, merge, deployment or application integration is performed.
