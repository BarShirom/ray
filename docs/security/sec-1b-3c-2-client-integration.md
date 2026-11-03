# SEC.1B-3C.2 — Client sessions and protected station integration

Date: **2026-11-03, Asia/Jerusalem**. Intended gate: **A, local development**.
Branch `ray-2-postgres`, baseline/current HEAD
`2363ac511c6c4be5ca445c389d06e895e3cd1310`. Preflight tree/index were clean;
local `origin/ray-2-postgres` was 0 ahead / 0 behind, without fetch. SEC.1B-3C.1
and its R-01 runbook correction were committed. This implementation remains
uncommitted. The separate independent critical read-only review returned
**REVISE BEFORE COMMIT**, with no Critical/High finding, two Medium commit blockers
(C2-R01/R02) and three Low findings (C2-R03/R04/R05). The corrective follow-up below
records their disposition and revalidation; internal implementation QA is not a
new independent approval. No Git write is authorized.

Read root AGENTS, the [Release Quality Gate](../RELEASE_QUALITY_GATE.md),
[readiness](../RELEASE_READINESS.md), [approved beta design §17](station-visibility-design.md#17-sec1b-3c0-approved-first-beta-policy-and-implementation-plan),
[3C.1 backend evidence](sec-1b-3c-1-beta-access.md),
[3B.2 endpoint evidence](sec-1b-3b-2-endpoint-privacy.md),
[UX.2](../ux2-reliability.md), [localization](../localization.md) and the existing
[PostgreSQL](../migrations/postgres-local-foundation.md),
[preview](../migrations/postgres-preview.md) and [S3](../migrations/s3-media.md)
procedures. No nested AGENTS applies. Historical documents remain unchanged.

## Authentication intent, persistence and cross-tab boundary

REV-01's root cause was two unguarded commit paths: auth thunks dispatched
`setAuth` after awaited HTTP, and fulfilled reducers accepted any completion.
The new [auth thunks](../../client/src/features/auth/authThunks.ts) no longer
dispatch that side effect. A current attempt ID gates before HTTP, after HTTP,
errors and reducer completion. New login/register intent and logout invalidate
older work immediately; accepted/rejected obsolete actions cannot restore identity
or replace current errors. Logout invalidates at its pending action. Auth forms
guard duplicate submission, mounted state, accepted request ID and browser authority
before navigation/error presentation. Navbar/MyReports logout callbacks also fence
their rendered identity and subsequent navigation.

[Session snapshots](../../client/src/features/auth/session.ts) carry an opaque
generation ID plus captured actor/token. New intent/logout advances the generation;
accepted auth keeps that intent's browser authority while changing actor/token.
Exact snapshot comparison therefore distinguishes pending guests, accepted users,
same-account reauthentication and A→B→A. The
[root reducer](../../client/src/app/store.ts) resets reports, stations and feeding
domains atomically on generation **or actor/token** changes. UI remount keys include
the generation, actor and auth-loading stage, never the token.

[Persistence](../../client/src/features/auth/authPersistence.ts) keeps the existing
`persist:root` key and auth-only boundary. Only `{user, sessionId}` persists; no
password, attempt ID, loading/error flag, station/report collection, feeding log,
blob or signed capability is added to storage. A credential-free shared
`ray:auth-authority` marker coordinates same-origin tabs:

- Explicit local intent publishes authority synchronously **before** Redux
  subscribers can start requests under the accepted transition.
- Auth completion and restoration can write identity only while the existing
  marker still matches. They never advance/reassert authority over a newer tab.
  Ownership is checked before and after the identity write; ambiguous storage
  contents fail closed on restoration rather than selecting obsolete credentials.
- Queued Redux Persist writes require matching authority and an unblocked writer.
  Failed publication blocks old queued writes and removes owned identity/authority
  where storage permits. Delayed hydration loses to any explicit local intent;
  `finishAuthRestoration` cannot clear a current attempt's loading flag.
- Storage, focus and pageshow checks clear the stale tab without rebroadcasting
  or copying another tab's credentials. Requests check authority even before a
  queued storage event is delivered. Local guest Report work remains valid without
  borrowing another tab's identity. This avoids event loops and preserves public
  Report discovery/submission.

Modern ordered credentials restore after refresh. The previous storage format has
no authority/generation proof and deliberately requires one fresh login. Blocked
or failing browser storage fails locally to a guest; failed durable logout now has
a persistent Hebrew shell warning and an explicit generation-bound recovery
action. If storage remains unavailable, old credentials may survive and restore
after refresh; local guest state does not prove durable removal. An authenticated
session requires usable storage coordination. These are client isolation rules,
**not server JWT revocation**. Existing copied JWT lifetime, password/session and
recovery policy remain independent real-account release requirements.

## Protected API, state and safe errors

Station/log thunks capture the session before awaiting work and bind pending,
fulfilled and rejected actions to request IDs. Obsolete successes/errors cannot
replace data, loading/error state, refresh newer requests or expire another account.
Superseded requests are ignored even within the same session. Cancellation is
available through thunk signals; acceptance does not rely on abort alone.

The [typed failure boundary](../../client/src/api/errors.ts) retains safe kind,
HTTP status, bounded retry seconds and allowlisted field feedback, plus session/
request identity. It discards response bodies, unknown messages, credentials and
capabilities. `source` distinguishes real HTTP responses from client guards.
Only a matching-session **HTTP** 401 expires credentials; a queued local guest
denial cannot expire a newly accepted user sharing the intent generation. A stale
tab's 401 clears locally without publishing logout over a newer tab. Hebrew text
is presentation only, never an authorization test.

Parent 404 removes the station/detail/history, tombstones older snapshots and
advances the authorization revision used by the map. Asset failure does not imply
parent loss. Inactive POST 409 reconciles activity/permissions while preserving the
draft; the follow-up also records an uncached inactivity observation, invalidates
its prior detail request and gates feeding presentation/submission until a fresh
authoritative detail succeeds. Bounded 429 feedback
and explicit retry timers preserve drafts; network/server/protocol failures remain
errors rather than successful empty lists. Confirmed feeding receipts survive
recoverable summary/history refresh failure.

| API integration | Implemented behavior |
| --- | --- |
| Collection | Bearer to configured Ray API only; guests send no station HTTP. Consume 200-row pages and `X-Next-Cursor` in server order. Validate DTOs, cursor syntax/advancement, duplicate IDs and page size. A 100-page bound fails visibly rather than claiming a complete truncated map. |
| Detail/create | Fetch actual detail for instructions/image; discovery does not invent absent creator or timestamps. Omit dormant classification. Preserve server-derived owner and private `imageAssetId` creation; no sensitive/regular selector. |
| Shared summary | Separate food/water objects containing only the backend's six recency buckets. Hebrew explains that no record in Ray does not prove cats were unfed. No other feeder identity, exact event timestamp or private note is displayed. |
| Own history | Separate author-only DTOs with Israel date/time formatting; explicit 100-row cursor append, bounded at 100 pages. Limit/protocol failure is visible and preserves already loaded pages. No reconstruction of public individual events. |
| Feeding | Active `canFeed` required in UI; backend remains authoritative. Successful POST retains its receipt and refreshes summary/history while superseding older reads. Inactive stations remain viewable. |
| Reports | Public discovery and guest creation remain independent. Assigned/history actions and all report completions are fenced; claim/resolve authority still comes from the existing backend. Session changes clear prior state, then public reports reload. |

[Axios](../../client/src/api/http.ts) refuses bearer-bearing absolute or
protocol-relative destinations outside the configured Ray origin. Map tiles and
external links receive no Ray Authorization header. Backend API/security, schema,
migrations, dependencies and cloud configuration are unchanged.

## Map, forms and image lifecycle

[MapPage](../../client/src/pages/mapPage/MapPage.tsx) remounts the actual Leaflet
instance on the authentication/render epoch or parent-authorization revision.
Markers, station selection, dialogs/popups, created station, temporary location
and picker state are discarded. The new
[viewport lifecycle](../../client/src/pages/mapPage/stationViewport.ts) stops old
motion, closes popups and starts at the fixed default `[32.0853, 34.7818]`, zoom 13,
without animation. A disposed lifecycle cannot fit bounds; a fresh instance fits
the current station collection once. Public Report markers keep their independent
policy. Map tiles/geography are not mirrored for RTL. A keyboard control can select
the current map center for station creation; actual keyboard/mobile behavior still
needs browser verification.

Session-keyed forms and entry/completion guards prevent retained callbacks from
submitting a previous draft under a new account. Recoverable errors preserve the
current form's mixed-direction text, file selections and food/water choices.
Station creation no longer attempts the retired Cloudinary/external-image path:
unsupported image mode fails closed, while Report's separate policy is retained.

[StationMediaImage](../../client/src/components/media/StationMediaImage.tsx) uses
the rendered Provider store and a session/source/retry identity. The
[media helper](../../client/src/api/media.ts) reconstructs only a UUID issuance
route on the configured Ray origin, sends Bearer there, then fetches HTTPS bytes
with no Ray header, cookies or referrer, no-store and redirect refusal. Existing
60-second/8-MiB/WebP limits remain. Current issuer 401 expires only that session;
byte-server failure never logs out Ray. Source/identity change or unmount aborts,
ignores late results and revokes object URLs. The render gate hides old decoded
bytes before effect cleanup. A source/session gets one explicit retry; 429 respects
bounded wait metadata without an automatic request loop. Upload chains check the
captured session after asynchronous stages and before the next protected request
or parent creation. Signed permissions
remain mounted memory only; no logs or persistence were added.

Previously issued signed URLs, cached/saved images and copied information cannot
be recalled immediately. All registered accounts can obtain exact station
locations under the approved beta policy; registration is not trust verification.
No invitation, grants UI, station-note editing or professional/municipal role was
implemented. Independent Report content can still disclose manually copied or
co-located information. REV-04's residual limits remain.

## Initial implementation evidence before independent review

Evidence date: **2026-11-03**, initial 55-path handoff before the review corrections.
The counts and artifact sizes in this table are preserved historical evidence for
that stage, not the final follow-up tree. Installed dependencies only;
no provider credentials resolved, no dotenv loaded for backend/test checks, media
disabled by environment, EC2 metadata disabled, AWS config/credential paths set to
verified nonexistent files. Only the guarded synthetic `ray_test` target on
`127.0.0.1:55433` was used. The existing helper validates URL/connected identity,
holds its advisory lock, refuses existing Ray objects and cleans only owned
synthetic objects. Persistent dev/preview records and retained media were untouched.

| Command / method | Result and evidence tier |
| --- | --- |
| `node --test client/tests/*.test.cjs` | **152/152 PASS**, zero failed/skipped. Offline controlled promises, real reducers/store/persistence and captured component/effect/controller fixtures; not a mounted browser. Development-only Redux invariant timing warnings appeared under concurrent tests. |
| `npm.cmd run build --prefix client` | PASS; 264 modules; main JS **607.38 kB**, gzip **191.20 kB**, CSS 42.45 kB. Normal TypeScript/Vite build. |
| `npm.cmd run build:postgres --prefix client` | PASS; 264 modules; main JS **608.57 kB**, gzip **191.26 kB**, CSS 42.45 kB. Fixed loopback PG mode. Both builds retain the >500-kB chunk warning. |
| `client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit` | PASS on the initial handoff source; both initial builds also type-check. |
| Installed ESLint with `client/eslint.config.js` on all changed/new TS/TSX | PASS on the initial handoff source, 37 files, zero errors/warnings. |
| `node --check <path>` plus installed ESLint Node API on changed/new `.cjs` | PASS, 14 files, zero errors/warnings; in-memory Node/browser globals and recommended rules, no config/dependency addition. |
| `npm.cmd run build --prefix server` | PASS; unchanged backend TypeScript. |
| `node --test --test-concurrency=1 server/tests/*.test.mjs` | **252/252 PASS**, zero failed/skipped; current task offline API/parser/auth/media/legacy regressions. |
| `$env:RAY_TEST_DATABASE_URL='postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'` then `node --test --test-concurrency=1 server/tests/integration/*.test.mjs` | **172/172 PASS**, zero failed/skipped; actual disposable PostgreSQL/HTTP and storage doubles. This is the checked-in disposable identity, not a persistent/cloud credential. |
| Production client store/thunks against actual local `createPreviewApp` + guarded PostgreSQL, Node stdin fixture | PASS: real A/B login, all active/inactive station DTOs/detail, separate author-only histories and shared summary, water-only POST/receipt/refresh, inactive 409, A→B reset, logout purge and guest zero station HTTP. Nine station GETs, two feeding POSTs; zero guest station reads. This is actual HTTP/SQL, **not browser evidence**. |
| Production client creation/image lifecycle + real HTTP/PG parent issuance, controlled HTTPS byte double | PASS: station create DTO/owner; two authenticated issuance calls; byte requests omit headers/credentials/referrer; one object URL created/revoked; delayed post-logout bytes cannot paint; guest makes no issuance call. Bytes supplied by an in-process double, not S3 or browser CORS/rendering. |
| Browser attempt | **NOT_TESTED.** Browser host unavailable; native Chrome selection was stopped because Computer Use could not verify the active Windows URL sufficiently to enforce policy. No bypass/alternate automation was attempted. No screenshots, actual two-tab/BFCache, rendered Leaflet, decoded browser image, mobile or screen-reader pass claimed. |
| Documentation and Git hygiene | PASS: 59 repository links, including 19 anchors, across the two changed documents; balanced fences; `git diff --check`; UTF-8/final-newline checks on all 55 changed/new files; no BOM/trailing whitespace on all 16 new files. Selected access-key/private-key/JWT/signed-capability literal screening found no matches. This is not a full repository/history secret audit. |
| Schema and scope preservation | PASS: all 17 tracked migration SQL/journal/snapshot artifacts match HEAD after Git normalization; no server, package, lockfile, schema, configuration or unrelated documentation change. Exactly 39 tracked modifications and 16 new files; index empty. |

Initial integration failures were corrected transparently: old fixtures omitted
auth request IDs or expected serialized Error strings after typed rejection;
typed 429 remapping lost its bounded delay; subscriber requests could run before
authority publication; partial storage failure admitted queued old writes;
restoration/completion could reassert stale authority. Deterministic interleaving,
quota, subscriber, mixed login/register, same-token reauth and navigation regressions
now cover the corrections. Local guest failures are distinguished from real HTTP
401 so a queued guard cannot expire newly accepted credentials. No test/guard was
weakened to preserve the obsolete contracts.

The first extra media probe used an incorrect installed Sharp entry path and
failed before adding its image fixture; the corrected package entry passed.
No live S3/Cloudinary call occurred. The temporary API used only synthetic records
and signing doubles. Its guarded finalizers cleaned its objects, and its listener
closed. The task-owned Vite session and test-db service were stopped; dev/preview
remained stopped. No database reset, preview migration/seed or cloud operation.

## Independent review corrections and current revalidation

Corrective follow-up, **2026-11-03, Asia/Jerusalem**, same HEAD. Preflight preserved
the intentional **55 paths (39 modified, 16 new)** and empty index; local tracking
was 0/0 without fetch. The separate read-only review returned **REVISE BEFORE
COMMIT**: no Critical/High finding, Medium C2-R01/R02 and Low C2-R03/R04/R05.
The initial evidence above remains attributed to the pre-correction stage.

| Finding and reproduced root cause | Actual correction and focused evidence |
| --- | --- |
| **C2-R01, Medium:** storage denial retained credentials, but logout fulfilled and feedback was hidden outside auth pages; refresh could restore A. | Pending logout still purges identity/protected Redux domains. Durable failure rejects with safe `{kind:"storage-unavailable",sessionId}`; only confirmed durable publication returns `{persisted:true}`. Nonpersisted `auth.logoutFailure` drives [LogoutStorageWarning](../../client/src/components/navbar/LogoutStorageWarning.tsx) in the persistent shell. Hebrew text explains device-storage/refresh risk, manual site-data recovery and copied-credential limits. Generation-bound explicit retry refuses observed newer same-tab/foreign-tab authority without shared writes. Superseded recovery retains its warning and explains why retry is unavailable. Actual Navbar callback and shell fixtures cover `/map-page`, `/`, `/login`, local purge, denied reads/writes/removal, refresh risk, recovery and newer-B protection; warning output contains no credentials/private fixture data. |
| **C2-R02, Medium:** cleanup queued native close; development StrictMode reopened the dialog before the event dismissed it. | Native close is ignored while the current dialog is open; dismissal also rejects unmounted lifecycles. Cleanup still closes the captured element. Button, Escape and genuine native close notify the parent once and restore connected opener focus. Five production-effect/ref/handler regressions model the queued event, ref detach/reconnect and unmount. Before correction 3/5 failed; all pass afterward. This is deterministic lifecycle evidence, not a mounted renderer or browser. |
| **C2-R03, Low:** an earlier root-deletion event unconditionally cleared newer B or its authentication attempt. | Storage/focus/pageshow handling reconciles the current marker and valid persisted identity against local session/actor/token, including pending guest identity. No foreign credential adoption. Tests preserve completed B and pending login/register after delayed deletion; genuine deletion, corruption and unavailable storage clear locally without rebroadcast. |
| **C2-R04, Low:** public-ID sorting contradicted PostgreSQL's independent internal-UUID tie-break. | Stable timestamp ties retain fetched page order. Unreconciled receipt IDs survive failed refresh/retry and stop supplying provisional order once a fetched page establishes their position. Tests cover conflicting public-ID ties across append, duplicates and receipt reconciliation after failure. No backend/cursor/schema change. |
| **C2-R05, Low:** inactive409 invalidated pending detail only when cached metadata existed. | Inactivity is retained without fabricating a station row; the old detail request is always invalidated. Fresh accepted detail can clear the observation. Details presentation and retained form submission consult the current marker. Tests cover uncached pending detail, 409, ignored delayed active200, suppressed feeding, retained callback refusal and fresh recovery. |

Pre-fix production-store probes in the independent review established C2-R01/R03.
The three new data regressions and two uncached presentation regressions also
failed before correction. Existing assertions and security guards were preserved.
A concurrent intermediate typecheck caught an in-progress logout matcher typing
error; its typed pending case corrected that error before final validation.

Commands below use installed packages and the offline credential guards described
above. No dotenv/provider credential resolution, AWS/S3 or Cloudinary request.

| Executed command / method | Current follow-up result and boundary |
| --- | --- |
| `node --test client/tests/authSessions.test.cjs` | **43/43 PASS**, including 12 new auth/logout/storage regressions. Production store/thunks plus controlled storage/HTTP and shell/callback rendering fixtures. |
| `node --test client/tests/feedingLogs.test.cjs client/tests/feedingStations.test.cjs client/tests/apiFailures.test.cjs` | **41/41 PASS**, including three new ordering/receipt/inactive-detail cases. |
| `node --test client/tests/stationDialogLifecycle.test.cjs client/tests/stationCreationLegacy.test.cjs client/tests/stationPresentation.test.cjs` | **15/15 PASS**, including seven new dialog/inactive-presentation cases. No DOM/browser certification. |
| `node --test client/tests/*.test.cjs` | **174/174 PASS**, zero failed/skipped. Development-only Redux invariant timing warnings appeared under concurrent tests. |
| `npm.cmd run build --prefix client` | PASS; 265 modules; main JS **610.76 kB**, gzip **192.22 kB**; CSS 42.45 kB. |
| `npm.cmd run build:postgres --prefix client` | PASS; 265 modules; main JS **611.95 kB**, gzip **192.24 kB**; CSS 42.45 kB. Both retain the >500-kB warning; real-device performance acceptance remains open. |
| `client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit --incremental false` and the same command with `client/tsconfig.node.json` | Both PASS on final source. |
| Installed ESLint Node API with `client/eslint.config.js` over Git-derived changed/new TS/TSX paths | **39 files PASS**, zero errors/warnings; no repository-wide lint claim. |
| `node --check <path>` and installed ESLint Node API with recommended rules and Node/browser globals over changed/new CJS | **15 files PASS**, zero errors/warnings; no dependency/configuration addition. |
| `npm.cmd run build --prefix server`; `node --test --test-concurrency=1 server/tests/*.test.mjs` | Build PASS; **252/252 PASS**, zero failed/skipped. Backend unchanged. |
| Guarded `RAY_TEST_DATABASE_URL` above; `node --test --test-concurrency=1 server/tests/integration/*.test.mjs` | **172/172 PASS**, zero failed/skipped; actual disposable PostgreSQL/PostGIS, storage/signing doubles. No live S3 evidence. |
| Node-stdin production client against actual loopback `createPreviewApp` and guarded SQL | PASS: real A/B auth/ownership, 101 tied own-history rows across 100+1 pages in SQL order, water-only receipt/summary, B own-history isolation, actual delayed HTTP200 after SQL deactivation/feeding409, fresh recovery, rejected failed logout/local purge, retained-credential refresh risk and explicit durable recovery. Eight station GETs, two feeding POSTs, zero guest station GETs. Storage failure is a double; HTTP/SQL are real. |
| Browser surface inventory | **NOT_TESTED:** browser host remains unavailable. No browser input/screenshots, actual two-tab/BFCache, Leaflet, decoded images/CORS, keyboard/reader or mobile acceptance. |
| Documentation/scope hygiene | PASS: 61 repository links, including 20 anchors, eight tables, balanced fences, `git diff --check`, valid UTF-8/final newline on all 58 changed/new files and no BOM/trailing whitespace on all 18 new files. Selected credential/capability literal screening found no match; this is not a complete secret-history audit. All 17 migration artifacts match HEAD; staging commands exactly cover the 58-path inventory. |

The HTTP fixture retained its 102 synthetic feeding records and two users through
assertions; its guarded finalizer then removed only owned objects and closed its
listener. Test-db was verified to use tmpfs, no mounts and numeric loopback 55433;
it was started for QA and stopped afterward. Persistent dev/preview services stayed
stopped, with records/media untouched. No persistent reset/migration/seed or cloud
operation occurred.

**Disposition:** all five findings are corrected at source/automated tiers, with
the labelled HTTP/PG checks. No remaining confirmed code-level commit blocker from
these findings was found in corrective QA. The original independent verdict is
retained; no subsequent independent APPROVE or Git authorization is invented.
Real-user privacy acceptance remains blocked by browser checks and existing gates.

### Bounded browser acceptance still required

Using a separately available local browser and guarded synthetic A/B fixtures:

1. Guest map: public Report visible, no station data or protected HTTP; direct
   refresh into map and protected routes behaves truthfully.
2. A login: all station pages, active/inactive details, independent food/water
   summaries and own logs. Save a water-only feeding; verify receipt and refresh.
3. Logout/account switch while map/dialog/picker/image is open: inspect actual
   center, zoom, bounds, fit lifecycle, overlays, decoded nodes and object URLs.
   Repeat A→B, B→A, same-account reauth, back/forward/BFCache and two tabs.
4. Defer auth, data and image completions; test both login orders, login/register,
   logout, foreign-tab changes and stale 401. Inspect persisted identity only;
   do not export or log tokens, passwords or capabilities.
5. With an authorized **local** HTTPS storage double, inspect Ray-only Bearer,
   credential-free byte fetch, actual CORS/redirect/error/expiry handling and URL
   revocation. This task authorizes no live S3 follow-up or certificate bypass.
6. Force storage failure in synthetic local logout fixtures; verify the shell
   warning across navigation, explicit recovery, reload risk and newer-tab safety.
   Open details in development StrictMode; test queued cleanup, button/Escape/native
   closure, exactly-once dismissal and focus return. No browser security bypass.
7. Test Hebrew keyboard focus/Escape/return, map-center selection, retry/draft
   recovery, live announcements, mixed text, screen reader and 320/390 CSS widths.
   Record exact browser/device evidence and failures; do not infer conformance
   from SSR/controller fixtures or build success.

## Release Quality Gate and handoff

| Requirement | Current assessment |
| --- | --- |
| QG-01/03/04/11/12 client logic | **VERIFIED** for automated session/race/state/API/privacy/error fixtures and the labelled real HTTP/PG paths. Actual browser isolation remains **NOT_TESTED**. |
| QG-02/06/09 Hebrew/mobile/accessibility/navigation | Typed copy, build and source/callback checks passed. Full critical keyboard/reader, 320/390px, direct browser routes and focus recovery remain **NOT_TESTED**. |
| QG-07/10/13/14 artifact/configuration | Local builds/static checks and no provider/dependency/schema change. Bundle warning remains; no fresh registry audit, full secret-history scan or deployed configuration verification. |
| Independent implementation review | **Performed: REVISE BEFORE COMMIT** on the initial tree. C2-R01 through C2-R05 are addressed in the corrective follow-up; that evidence does not invent a subsequent independent approval or authorize Git writes. |
| Real-user release | **Blocked** by browser acceptance and existing server session/password, malicious enrollment/location risk, distributed abuse/global media budgets, retention/personal-data processes/notices, dependencies, S3 acceptance, accessibility/welfare, production/TLS, restore/recovery, monitoring and incident ownership in readiness. |

Do not deploy a mixed old/new client/backend or expose legacy public fallback.
This batch changes client code/tests and current readiness only; no backend API,
schema/migration/dependency/cloud or historical milestone document changes.
Exact inventory and shown-only staging commands accompany the final handoff.
No staging, commit, push, merge or deployment is authorized or performed here.

## Changed-file inventory and reviewed staging plan

Current working-tree inventory on `ray-2-postgres`, HEAD
`2363ac511c6c4be5ca445c389d06e895e3cd1310`: **58 paths** (40 modified
tracked, 18 new), all unstaged; index empty. Local upstream remains 0/0 without
fetch. The initial 55-path inventory is preserved as the pre-correction evidence
above. Current scope is 39 TS/TSX, two CSS, 15 CJS test/helper files and two docs.

This follow-up changes **18 paths** relative to its preserved preflight content:
16 existing files and two newly created files. It adds three paths to the original
Git change inventory: existing `Layout.tsx`, new `LogoutStorageWarning.tsx` and
new `stationDialogLifecycle.test.cjs`. No server, schema, migration, dependency,
package/lockfile, cloud configuration or unrelated documentation changes.

```text
client/src/app/store.ts
client/src/components/feedingStationDetails/FeedingStationDetails.tsx
client/src/components/layout/Layout.tsx
client/src/components/navbar/LogoutStorageWarning.tsx
client/src/components/navbar/Navbar.tsx
client/src/features/auth/authPersistence.ts
client/src/features/auth/authSelectors.ts
client/src/features/auth/authSlice.ts
client/src/features/auth/authThunks.ts
client/src/features/feedingLogs/feedingLogsSlice.ts
client/src/features/feedingStations/feedingStationsSelectors.ts
client/src/features/feedingStations/feedingStationsSlice.ts
client/src/i18n/locales/shell.ts
client/tests/authSessions.test.cjs
client/tests/feedingLogs.test.cjs
client/tests/stationDialogLifecycle.test.cjs
docs/RELEASE_READINESS.md
docs/security/sec-1b-3c-2-client-integration.md
```

Exact cumulative `git status --short` (also the complete staging inventory):

```text
 M client/src/api/http.ts
 M client/src/api/media.ts
 M client/src/app/store.ts
 M client/src/components/createFeedingStation/CreateFeedingStation.tsx
 M client/src/components/createFeedingStation/StationLocationPicker.tsx
 M client/src/components/feedingStationDetails/FeedingStationDetails.css
 M client/src/components/feedingStationDetails/FeedingStationDetails.tsx
 M client/src/components/layout/Layout.tsx
 M client/src/components/media/StationMediaImage.tsx
 M client/src/components/navbar/Navbar.tsx
 M client/src/components/reportMarker/ReportMarker.tsx
 M client/src/features/auth/authSelectors.ts
 M client/src/features/auth/authSlice.ts
 M client/src/features/auth/authThunks.ts
 M client/src/features/feedingLogs/feedingLogsSlice.ts
 M client/src/features/feedingLogs/feedingLogsThunks.ts
 M client/src/features/feedingLogs/types.ts
 M client/src/features/feedingStations/feedingStationsSelectors.ts
 M client/src/features/feedingStations/feedingStationsSlice.ts
 M client/src/features/feedingStations/feedingStationsThunks.ts
 M client/src/features/feedingStations/types.ts
 M client/src/features/reports/reportsSlice.ts
 M client/src/features/reports/reportsThunks.ts
 M client/src/i18n/errors.ts
 M client/src/i18n/locales/shell.ts
 M client/src/i18n/locales/stations.ts
 M client/src/pages/login/Login.tsx
 M client/src/pages/mapPage/MapPage.css
 M client/src/pages/mapPage/MapPage.tsx
 M client/src/pages/myReports/MyReports.tsx
 M client/src/pages/register/Register.tsx
 M client/src/pages/report/Report.tsx
 M client/tests/assignedReports.test.cjs
 M client/tests/assignedReportsPersistence.test.cjs
 M client/tests/feedingLogs.test.cjs
 M client/tests/feedingStations.test.cjs
 M client/tests/media.test.cjs
 M client/tests/rateLimits.test.cjs
 M client/tests/reportsLocalization.test.cjs
 M docs/RELEASE_READINESS.md
?? client/src/api/errors.ts
?? client/src/api/useApiRetryGate.ts
?? client/src/components/feedingStationDetails/FeedingCoordinationSummary.tsx
?? client/src/components/navbar/LogoutStorageWarning.tsx
?? client/src/features/auth/authPersistence.ts
?? client/src/features/auth/session.ts
?? client/src/features/feedingStations/protectedStationApi.ts
?? client/src/features/feedingStations/stationDtos.ts
?? client/src/pages/mapPage/stationViewport.ts
?? client/tests/apiFailures.test.cjs
?? client/tests/authSessions.test.cjs
?? client/tests/reportSessions.test.cjs
?? client/tests/stationCreationLegacy.test.cjs
?? client/tests/stationDataHarness.cjs
?? client/tests/stationDialogLifecycle.test.cjs
?? client/tests/stationImageLifecycle.test.cjs
?? client/tests/stationPresentation.test.cjs
?? docs/security/sec-1b-3c-2-client-integration.md
```

Reviewed single-line commands below are **shown only, not executed**. They cover
all 58 cumulative paths, including the corrections. The prior independent
REVISE verdict and this corrective evidence must remain available for review;
explicit Git authorization is still required. No wildcard or `git add .`.

```powershell
git add -- "client/src/api/http.ts" "client/src/api/media.ts" "client/src/app/store.ts" "client/src/features/auth/authSelectors.ts" "client/src/features/auth/authSlice.ts" "client/src/features/auth/authThunks.ts" "client/src/api/errors.ts" "client/src/api/useApiRetryGate.ts" "client/src/features/auth/authPersistence.ts" "client/src/features/auth/session.ts"
git add -- "client/src/features/feedingLogs/feedingLogsSlice.ts" "client/src/features/feedingLogs/feedingLogsThunks.ts" "client/src/features/feedingLogs/types.ts" "client/src/features/feedingStations/feedingStationsSelectors.ts" "client/src/features/feedingStations/feedingStationsSlice.ts" "client/src/features/feedingStations/feedingStationsThunks.ts" "client/src/features/feedingStations/types.ts" "client/src/features/reports/reportsSlice.ts" "client/src/features/reports/reportsThunks.ts" "client/src/features/feedingStations/protectedStationApi.ts" "client/src/features/feedingStations/stationDtos.ts"
git add -- "client/src/components/createFeedingStation/CreateFeedingStation.tsx" "client/src/components/createFeedingStation/StationLocationPicker.tsx" "client/src/components/feedingStationDetails/FeedingStationDetails.css" "client/src/components/feedingStationDetails/FeedingStationDetails.tsx" "client/src/components/layout/Layout.tsx" "client/src/components/media/StationMediaImage.tsx" "client/src/components/navbar/Navbar.tsx" "client/src/components/reportMarker/ReportMarker.tsx" "client/src/i18n/errors.ts" "client/src/i18n/locales/shell.ts" "client/src/i18n/locales/stations.ts" "client/src/pages/login/Login.tsx" "client/src/pages/mapPage/MapPage.css" "client/src/pages/mapPage/MapPage.tsx" "client/src/pages/myReports/MyReports.tsx" "client/src/pages/register/Register.tsx" "client/src/pages/report/Report.tsx" "client/src/components/feedingStationDetails/FeedingCoordinationSummary.tsx" "client/src/components/navbar/LogoutStorageWarning.tsx" "client/src/pages/mapPage/stationViewport.ts"
git add -- "client/tests/assignedReports.test.cjs" "client/tests/assignedReportsPersistence.test.cjs" "client/tests/feedingLogs.test.cjs" "client/tests/feedingStations.test.cjs" "client/tests/media.test.cjs" "client/tests/rateLimits.test.cjs" "client/tests/reportsLocalization.test.cjs" "client/tests/apiFailures.test.cjs" "client/tests/authSessions.test.cjs" "client/tests/reportSessions.test.cjs" "client/tests/stationCreationLegacy.test.cjs" "client/tests/stationDataHarness.cjs" "client/tests/stationDialogLifecycle.test.cjs" "client/tests/stationImageLifecycle.test.cjs" "client/tests/stationPresentation.test.cjs"
git add -- "docs/RELEASE_READINESS.md" "docs/security/sec-1b-3c-2-client-integration.md"
```

Suggested commit message (not executed):

```text
fix: secure client sessions and integrate protected stations
```

