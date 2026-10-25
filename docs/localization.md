# UX.1: Hebrew launch and RTL

Implemented on `ray-2-postgres` from clean baseline
`a0dccb8733229fbca47c700bdacb67657ce6c9f2` (committed S3.1). No applicable
AGENTS.md was found. HEAD was not changed. No staging, commit, push, merge or
deployment was performed. Evidence dates below use 2026-10-25 in Asia/Jerusalem.

## Launch policy and maintenance

Hebrew is the only enabled UI language, regardless of browser language. Local
bundled resources initialize synchronously before React; there is no translation
network request, detector, language switcher or partial English/Russian release.

- `client/src/i18n/index.ts`: single i18next/react integration, typed semantic
  keys, Hebrew initialization/fallback, missing-key safe fallback, document
  language, direction, title and description.
- `locales/he.ts`: resource composition, common labels and errors.
  `shell.ts`, `reports.ts`, `stations.ts`: feature groups, including auth, map,
  feeding and media. Add application text here, not in components.
- `formatters.ts`: `Intl` dates, times, calendar days, numbers and display mappings
  for unchanged backend periods/statuses/types.
- `errors.ts`: exact known-message mappings plus HTTP status, code and field-path
  handling at the frontend boundary. Unknown messages never become visible SQL,
  AWS details, credentials or signed URLs. Unknown field errors retain a Hebrew
  field label and safe validation feedback. No English substring replacement.

Preferred terms include map, feeding stations, adding a feeding station,
"I Fed Here", feeding history and assigned-to-me reports using the Hebrew
terminology in the task. `/my-reports` continues to mean assigned reports.
No feeding record is presented as absence of feeding. Water-only records say
water was supplied. Report lists do not claim distance filtering or dispatched
rescue services. About translates its existing heading without inventing content.

All reachable application-owned navigation, headings, forms, labels, states,
actions, preview warnings, accessibility text and image fallbacks were reviewed.
No remaining application-owned English UI was found in source or exercised flows.
Internal English errors/enum values remain where they are not UI output.
User names, station names, descriptions, notes, filenames and database rows are
never translated or overwritten. Ray and external brands retain their names.

## Dependencies and future languages

New direct dependencies are pinned: `i18next@26.5.10` and
`react-i18next@17.1.8`. Their official [TypeScript guidance](https://www.i18next.com/overview/typescript)
and [React integration](https://react.i18next.com/latest/using-with-hooks), together
with npm registry metadata, were checked. The React package supports React >=16.8,
i18next >=26.2 and TypeScript 5/6/7, compatible with this client's React 19 and
TypeScript 5.8. String-key typing is explicitly enabled with `enableSelector:false`.

The client lockfile adds `html-parse-stringify@4.0.1`. npm also updates two
directly required transitive dependencies to satisfy the new React integration:
`@babel/runtime` 7.27.6 -> 7.29.10 (requires ^7.29.7), and
`use-sync-external-store` 1.5.0 -> 1.7.0 (requires ^1.6.0). TypeScript's lockfile
dependency classification changes to devOptional; its version stays 5.8.3.
Other existing dependency versions and all server dependencies remain unchanged.

To add English/Russian later: add complete local resources with the same semantic
keys and correct plural forms, add only finished locales to `supportedLngs`, and
choose an explicit product language policy. Do not copy Hebrew into fake locale
dictionaries. Document attributes already use `i18next.dir(language)` centrally;
English/Russian receive LTR. Migrate components using the exported fixed-launch
`t` function to `useTranslation` when implementing live locale switching so they
rerender on a language change. Add coverage/visual checks before enabling choices.

## Direction, typography and formatting

Initial HTML is `lang="he" dir="rtl"`; central initialization keeps attributes
and metadata consistent. Logical spacing/alignment is used in touched layouts.
The navbar uses a compact accessible menu below 800px with aria-expanded,
aria-controls, visible focus and Escape returning focus to its toggle. Report
cards wrap actions without squeezing descriptions; filter groups scroll in their
outer panel without shrinking their controls. Native dialogs retain scrolling
and keyboard behavior. Closing station details restores focus to its opener.

Emails and coordinate readouts are isolated LTR. Free text uses `dir="auto"`,
and names/filenames use `bdi` with wrapping. No direction controls are inserted
into stored values. Hebrew-capable system fonts and readable line height replace
the existing external Inter font requests; no font package/request was added.
Leaflet zoom titles, markers and popup-close labels are localized. Map tiles,
coordinates, transforms, provider and attribution are not mirrored or changed.

All event display uses `he-IL`, `Asia/Jerusalem`, 24-hour time through `Intl`.
The server's ISO instants remain unchanged and semantic time attributes retain
them. Relative days use Jerusalem calendar dates, including midnight/DST edges,
not the host timezone. Missing/invalid dates have a safe Hebrew fallback.
Counts use complete plural messages; values and units retain their real limits.
Preview media remains 1 byte through 8 MiB, one station image/three report images.
Legacy frontend limits remain unchanged (station 25 MiB; report 50 MiB/six files).

## Browser evidence

Chrome used the actual Vite PostgreSQL mode at `127.0.0.1:5175`, the actual API at
`127.0.0.1:4001` and the preserved synthetic PostgreSQL preview database. API media
was explicitly disabled throughout. No API interception or fake Redux store was
used for the following cases:

| Case | Actual result |
| --- | --- |
| Authentication | Empty registration produced Hebrew field feedback; incorrect login produced Hebrew credential error; mixed Hebrew/English/Russian registration, logout and valid login passed |
| New synthetic data only | Created `ux1-20261025@ray.example.invalid`, `SYNTHETIC UX1` station, one water-only evening log, and one `SYNTHETIC UX1` report; claimed/resolved only that new report |
| Station/location/history | Map click selected real coordinates; blank-name validation, creation, marker/popup, empty/loading history, saved history and persistence after API restart passed |
| Report workflow | No-image creation at 390px, new -> in-progress -> resolved, assigned name/status and assigned-list wording passed |
| Local outage/retry | Stopped only this task's media-disabled API; both station/report loading errors appeared in Hebrew without false empty states; after restarting it, both Retry controls restored data |
| Navigation/focus | All existing actions reachable in 320px/390px frames; Escape closed menu and returned toggle focus; station details Escape returned focus to its station marker after a browser-found fix |
| Desktop/map | Actual viewport 1920px, document width 1920px, 12 loaded map tiles; Hebrew shell, unmirrored geography, cards, filters, image failure fallback inspected |
| Mobile geometry | Actual production app embedded in temporary same-origin 320px/390px iframes because Chrome's window resize clamps near 400px. At 320px client/scroll widths both 301px (19px vertical scrollbar); at 390px both 371px. Assigned list without scrollbar measured 390/390. No page-wide overflow hiding |
| Dialog geometry | 320px creation/details client/scroll widths 261/261; 390px details 331/331. Mixed notes and water-only history wrapped; exact log datetime `2026-10-25T14:38:56.500Z` retained |

Screenshots are in [desktop](evidence/ux1/desktop.jpg) and
[320px menu with 390px history](evidence/ux1/mobile-320-390.jpg). Initial CDP
evaluation/screenshot attempts timed out; recovery succeeded and these captures
were inspected. The temporary harness files were removed. Mobile evidence is
real CSS-size iframe rendering, not a physical-device certification.

Separate **explicitly labelled local media fixtures** rendered the actual
FilePreview component with a tiny synthetic PNG and a long Hebrew/English/Russian
filename. At 320px and 390px, client width equalled scroll width; filename contents
and parentheses/digits were preserved, direction was auto, and alt text Hebrew.
See [media fixture screenshot](evidence/ux1/media-fixtures.jpg). No upload API or
signed read was involved. Unit/SSR media failure/retry fixtures are also explicitly
mocked and make no real requests.

Existing S3 image references returned the disabled API's failure response and
showed the Hebrew image placeholder. No S3 upload, signed-read request, live
verification script, IAM/CORS operation or cloud cleanup was run. This is not new
S3 verification. Preview/development volumes and earlier records are preserved;
no seeds or migrations were rerun. Only task-owned processes/services were stopped.

## Validation and known limits

Commands ran from the repository root (PowerShell), unless indicated otherwise:

| Exact check | Final result |
| --- | --- |
| `npm.cmd run build --prefix client` | PASS |
| `npm.cmd run build:postgres --prefix client` | PASS |
| `node --test client/tests/*.test.cjs` | PASS 57/57, no skips |
| `npm.cmd run build --prefix server` | PASS |
| `npm.cmd test --prefix server` | PASS 189/189, no skips |
| `$env:RAY_TEST_DATABASE_URL='postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'; npm.cmd run test:postgres --prefix server` | PASS 122/122, no skips; existing guarded disposable workflow |
| Targeted ESLint command below | PASS, zero errors; existing Media.tsx Fast Refresh export warning |
| Tracked/new-file whitespace commands below | PASS, no whitespace diagnostics |

Test commands set `RAY_MEDIA_MODE=disabled`, `AWS_EC2_METADATA_DISABLED=true`,
`AWS_SHARED_CREDENTIALS_FILE` and `AWS_CONFIG_FILE` to nonexistent task-specific
temporary paths. Ordinary tests use synthetic storage/signing doubles and do not
resolve live credentials. PostgreSQL suites retained their cleanup identity and
advisory-lock guards and ran against only disposable `ray_test:55433`.

New focused coverage includes bundled initialization/document attributes,
source translation-key coverage, safe missing keys, enum labels, field/status
errors, unknown SQL/AWS/URL safety, Hebrew counts 0/1/2/several, winter/summer and
Jerusalem midnight, host timezones Los Angeles/Tokyo, unchanged auth/report/feeding
payloads, escaped mixed filenames and existing media retry/security invariants.
Only English presentation assertions were deliberately updated; ownership,
business-rule, timestamp, media and backend assertions remain intact.

Intermediate failures: new Object.hasOwn usage failed the ES2020 type target and
was replaced; concurrent map-helper editing briefly exposed a missing import;
one translated test expectation was mangled by shell encoding and corrected.
These were newly introduced and fixed before final checks. Initial npm/Docker
and Vite configuration access failed under sandbox permissions; authorized retries
succeeded. The PowerShell preview script was blocked by existing execution policy;
the existing container/image/binding/volume labels were checked directly instead,
then only the verified Compose services were started. Policy was not changed.
Stop-Process failed internally; verified task PIDs were stopped through .NET instead.
Final Vite builds warn about the >500kB bundle; no code-splitting redesign was added.

Remaining defects/unverified behavior:

- **My Reports refresh bug remains**: direct load/refresh has no report fetch;
  visiting Map then My Reports restores the assigned list. Reproduced against
  actual PostgreSQL. No dummy reports or fetch fix was added. Loaded-list empty
  text does not establish that the server has no assigned reports.
- Existing registration client gate remains six characters while server requires
  eight. Hebrew guidance says eight and server field errors explain it; password
  values, client gating and server validation rules remain unchanged.
- Native browser validation/file chooser UI, geolocation permission UI, external
  base-map place names and Leaflet/OpenStreetMap legal attribution are external
  text exceptions. Browser geolocation permission/success was NOT RUN; manual map
  selection was verified. Waze/Google destinations retain their brand names.
- No new live cloud media or comprehensive wire/HAR/security review. Physical
  mobile-device testing and exhaustive browser/browser-language combinations are
  NOT RUN. Existing S3 and dependency/security release gates in
  [S3.1](migrations/s3-media.md) and the
  [security triage](security/milestone-10b-audit-triage.md) remain open.
- No server production code, contracts, schema/migrations, selection mode, media
  protections, auth persistence or audit disposition changed. This milestone is
  not deployment clearance or a release-readiness claim.

Targeted lint (one line, uses only changed/new TS/TSX under client):

```powershell
$rayChanged = @(git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --name-only -- '*.ts' '*.tsx'); $rayNew = @(git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard -- '*.ts' '*.tsx'); $rayLintFiles = @($rayChanged + $rayNew | Where-Object { $_ -like 'client/*' } | ForEach-Object { $_.Substring(7) }); Push-Location client; & .\node_modules\.bin\eslint.cmd @rayLintFiles; $rayLintExit=$LASTEXITCODE; Pop-Location; exit $rayLintExit
```

Whitespace checks:

```powershell
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard | ForEach-Object { git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --no-index --check -- NUL $_ }
```

## Reviewed staging plan (shown only)

The exact file list below excludes temporary harnesses, build output, test logs,
environment files and secrets. Nothing has been staged. Suggested commit message:
`feat: add Hebrew-first localization and RTL layouts`.

```powershell
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray add -- client/index.html client/package-lock.json client/package.json client/src/App.css client/src/api/media.ts client/src/components/createFeedingStation/CreateFeedingStation.css client/src/components/createFeedingStation/CreateFeedingStation.tsx client/src/components/feedingStationDetails/FeedingStationDetails.css client/src/components/feedingStationDetails/FeedingStationDetails.tsx client/src/components/feedingStationMarker/FeedingStationMarker.css client/src/components/feedingStationMarker/FeedingStationMarker.tsx client/src/components/layout/Layout.css client/src/components/layout/Layout.tsx client/src/components/legend/Legend.css client/src/components/legend/Legend.tsx client/src/components/mapPreview/LocalizedMapControls.tsx
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray add -- client/src/components/mapPreview/MapPreview.tsx client/src/components/mapPreview/mapAccessibility.ts client/src/components/media/Media.css client/src/components/media/Media.tsx client/src/components/navbar/Navbar.css client/src/components/navbar/Navbar.tsx client/src/components/reportCard/ReportCard.css client/src/components/reportCard/ReportCard.tsx client/src/components/reportForm/ReportForm.css client/src/components/reportForm/ReportForm.tsx client/src/components/reportMarker/ReportMarker.css client/src/components/reportMarker/ReportMarker.tsx client/src/features/auth/authThunks.ts client/src/features/feedingLogs/feedingLogsThunks.ts client/src/features/feedingStations/feedingStationsThunks.ts client/src/features/reports/getAssigneeName.ts
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray add -- client/src/features/reports/getReporterName.ts client/src/features/reports/reportsThunks.ts client/src/i18n/errors.ts client/src/i18n/formatters.ts client/src/i18n/index.ts client/src/i18n/locales/he.ts client/src/i18n/locales/reports.ts client/src/i18n/locales/shell.ts client/src/i18n/locales/stations.ts client/src/main.tsx client/src/pages/about/About.tsx client/src/pages/login/Login.css client/src/pages/login/Login.tsx client/src/pages/mapPage/MapPage.css client/src/pages/mapPage/MapPage.tsx client/src/pages/myReports/MyReports.css
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray add -- client/src/pages/myReports/MyReports.tsx client/src/pages/register/Register.css client/src/pages/register/Register.tsx client/src/pages/report/Report.css client/src/pages/report/Report.tsx client/tests/feedingLogs.test.cjs client/tests/feedingStations.test.cjs client/tests/localization.test.cjs client/tests/media.test.cjs client/tests/mediaPresentation.test.cjs client/tests/preview.test.cjs client/tests/reportsLocalization.test.cjs client/tests/shell.test.cjs docs/evidence/ux1/desktop.jpg docs/evidence/ux1/media-fixtures.jpg docs/evidence/ux1/mobile-320-390.jpg
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray add -- docs/localization.md
```
