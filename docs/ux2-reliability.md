# UX.2: assigned reports and registration validation

Date: 2026-10-25, Asia/Jerusalem. Branch: `ray-2-postgres`.
Clean baseline/unchanged HEAD: `8d1bb5e5d073f0053a32828d8943d13cc6641a1e`
(`feat: add Hebrew-first localization and RTL layouts`). S3.1 checkpoint
`a0dccb8733229fbca47c700bdacb67657ce6c9f2` remains an ancestor. No applicable
AGENTS.md was found. Locally recorded tracking is `origin/ray-2-postgres`,
0 ahead / 0 behind; no fetch or Git ref write was performed.

## Assigned reports: cause and fix

Before: MyReports only filtered the shared `Report[]` populated by MapPage.
Redux persistence restores auth only, so a direct load/refresh restored a user
and an empty report array. The page rendered a false final empty result without
requesting data. The existing `GET /api/reports/me` endpoint and PostgreSQL
`listAssignedTo` query already correctly selected the authenticated assignee.
No server/API change was needed.

After: MyReports dispatches the existing `fetchMyReports` thunk on authenticated
mount, independent of MapPage. Its effect depends on stable dispatch, user ID,
token and authentication-loading values, not list contents/request status.
Pending duplicate requests are suppressed; Retry explicitly dispatches another
request. Empty/count text appears only after successful loading.

The reports state now contains separate public `items` and `assigned` state.
Assigned state records idle/loading/succeeded/failed/unauthorized, safe error,
identity/token scope and request ID. `selectAllReports` preserves the public-map
selector interface; loading `/me` never replaces all map reports with a subset.
Assignee strings, `_id` objects and `id` objects are supported. Membership uses
`assignedTo`, never reporter identity. Sorting uses updatedAt, falling back to
createdAt, with safe handling for invalid timestamps. Existing cards/media stay.

Auth/session boundaries:

- PersistGate continues to hide the app until storage restoration finishes, now
  with Hebrew status text. Before lifting, `finishAuthRestoration` clears only a
  cached transient auth.loading flag from an interrupted login. User identity,
  token, storage key and auth-only persistence whitelist are unchanged.
- The protected route shows Hebrew status while login/registration is pending.
  Assigned selectors additionally require matching current user/token and resolved
  auth state. Login/register pending, logout and changed credentials clear the
  assigned collection and pending request/mutation IDs.
- Late responses from an earlier account/token cannot repopulate assigned data.
  Repeated setAuth for the same identity/token does not unnecessarily reset it.
- `/me` retains a safe structured HTTP status; 401 becomes an explicit expired/
  invalid-auth state and clears cards. Resolve/claim 401 is handled likewise.
  The reauthentication button uses existing logout behavior before navigating to
  `/login`, so the public-route guard cannot redirect a stale token back to Map.
  A stale earlier 401 never logs out a newly authenticated account.
- Claim/resolve updates both appropriate collections. IDs changed during an
  in-flight public/assigned fetch retain the newer mutation when its older
  snapshot arrives. Request fencing also prevents late snapshots from undoing
  newer unauthorized state. No report collection is persisted in browser storage.

## Password mismatch

Before: Register blocked only `password.length < 6`, while the server's existing
Zod schema required at least 8. UX.1's Hebrew guidance already said 8, so six and
seven characters could reach the server despite the form's guidance.

The installed Zod 4.6.5 implementation counts Unicode code points. JavaScript
UTF-16 `.length` also differs for astral symbols: four cat symbols have eight code
units but only four code points, and the actual server rejects them.

After: `validateRegistrationPassword` rejects empty values with the existing
Hebrew required-field message and values with fewer than eight code points with
the existing Hebrew minimum message. Register uses this helper before dispatch.
It inspects `Array.from(password).length` without trimming/normalizing/rewriting
the password. No browser-native validation bubble is required.

The server remains authoritative. Its schema has no maximum, trim or complexity
rule, so none was invented. Tests cover 7/8, Unicode, spaces, combining marks,
72/73/256 characters and UTF-8 byte boundaries against the actual server schema.
Login's existing nonempty rule and existing-account compatibility remain intact.
Hashing, JWTs, authorization and token storage are unchanged. Existing bcrypt
truncation beyond 72 UTF-8 bytes remains an unchanged security limitation requiring
separate policy review; this milestone does not silently add a new maximum.

## Browser evidence

All ordinary flows below used actual Chrome, Vite PostgreSQL mode at
`127.0.0.1:5175`, the real local API at `127.0.0.1:4001`, and preserved PostgreSQL
preview data. Media was explicitly disabled; there were no S3/cloud operations,
new signed-read requests, live activation scripts, migrations or seed reruns.

| Case | Result |
| --- | --- |
| Direct load without Map | Opened a fresh `/my-reports` tab with the persisted synthetic UX.1 account; its existing assignment loaded immediately |
| Hard refresh | Browser hard-refresh chord and full page loads preserved correct assignments without loading Map first; no report collection was restored from storage |
| Registration | At 390px, 7 ASCII characters and 4 astral symbols showed masked-input Hebrew field feedback; 8 ASCII characters and 8 astral symbols registered successfully through the real API |
| Synthetic scope | Created only `ux2-a-20261025@ray.example.invalid`, `ux2-b-20261025@ray.example.invalid`, and one clearly labelled `SYNTHETIC UX2 report` with no image |
| Ownership/zero | A's newly created report did not appear in A's assigned list; B claimed it, and it appeared in B's list. A's later fresh login/direct load returned a genuine successful zero |
| Claim/resolve | B resolved that new report from My Reports at 390px; status changed without reload and remained resolved on a fresh direct desktop load |
| Failure/retry | Stopped only the task-owned, media-disabled API. Refresh showed Hebrew network error and Retry, with zero cards and no empty-state claim. Restart plus Retry restored the same B assignment |
| Invalid authentication | A temporary, explicitly seeded invalid-token fixture called the real API, producing 401. Cards/empty state were absent; the real reauthentication button cleared the fixture credentials and reached Login. This used fixture credentials, not a timed live JWT expiration |
| Account switch/logout | Reauthenticated as A; B's assignment was absent. Logout followed by direct `/my-reports` navigation showed the existing public route, without protected cards |
| Hebrew/RTL/layout | Desktop 1920px and actual 390px same-origin app frame inspected. Document lang=he, dir=rtl; 390px client/scroll widths both 390; keyboard focus/error labels remained visible |

Screenshots: [desktop assigned report](evidence/ux2/direct-assigned.jpg),
[390px assigned report](evidence/ux2/assigned-390.jpg),
[390px masked password validation](evidence/ux2/password-boundary-390.jpg).
The temporary frame used the actual app/API, not mocked responses; it provides
390 CSS-pixel rendering evidence rather than physical-device certification.
Temporary frame/invalid-auth fixture files were removed after verification.
Passwords, tokens and signed URLs are absent from screenshots and test output.

Controlled delayed requests, account/token races, restoration pending state,
duplicate-effect replay and exact request counts use labelled synthetic
Axios/storage/SSR fixtures. The production-store test uses real redux-persist
bootstrap/flush. Captured actual effect/button callbacks supplement SSR; they
are not claimed as a browser mount lifecycle. A true timed JWT-expiry browser
test and physical-device testing were NOT RUN. The real API invalid-token 401
path and the browser reauthentication action were verified separately above.

## Validation

Exact final checks from repository root, PowerShell:

| Command | Result |
| --- | --- |
| `npm.cmd run build --prefix client` | PASS |
| `npm.cmd run build:postgres --prefix client` | PASS |
| `node --test client/tests/*.test.cjs` | PASS 76/76, no skips |
| `npm.cmd run build --prefix server` | PASS |
| `npm.cmd test --prefix server` | PASS 189/189, no skips |
| `$env:RAY_TEST_DATABASE_URL='postgresql://ray_test:ray_test_only@127.0.0.1:55433/ray_test'; npm.cmd run test:postgres --prefix server` | PASS 122/122, no skips; existing disposable DB identity/cleanup guards retained |
| Targeted ESLint below | PASS, zero errors/warnings |
| Tracked/new-file whitespace below | PASS, no whitespace errors |

Nineteen focused regressions were added. Existing tests were retained; only three
existing report-test state-array accesses changed to the explicit `.items` shape.
Coverage includes independent loading, persisted auth bootstrap, initial/loading/
success-zero/failure/retry/401 presentation, ID normalization/sorting, ownership,
account/token changes, stale success/error/mutation fencing, late snapshot merges,
claim/resolve, no pending duplicate storm and accurate password boundaries.

Test shells explicitly set `RAY_MEDIA_MODE=disabled`,
`AWS_EC2_METADATA_DISABLED=true`, and AWS config/credential file paths to nonexistent
task-specific temporary paths; inherited AWS access-key/session/profile variables
were removed in those shells. Existing signing/storage tests use synthetic
credentials/doubles, not live credential resolution. No dependencies were added
or changed. Backend production code and all migrations/media protections remain
unchanged. Preview/development records and volumes are preserved; only task-owned
processes and the preview/test services started here were stopped.

An intermediate TypeScript action-overload error was corrected before final
checks. There are no remaining test failures. The existing Vite >500kB bundle
warning remains; no unrelated bundle redesign was added. Previous historical
verification documents were not rewritten.

Targeted lint, single line:

```powershell
$rayChanged = @(git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --name-only -- '*.ts' '*.tsx'); $rayNew = @(git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard -- '*.ts' '*.tsx'); $rayLintFiles = @($rayChanged + $rayNew | Where-Object { $_ -like 'client/*' } | ForEach-Object { $_.Substring(7) }); Push-Location client; & .\node_modules\.bin\eslint.cmd @rayLintFiles; $rayLintExit=$LASTEXITCODE; Pop-Location; exit $rayLintExit
```

Whitespace checks:

```powershell
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray ls-files --others --exclude-standard | ForEach-Object { git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --no-index --check -- NUL $_ }
```

UX.2 fixes the two named defects. Existing [S3 acceptance/release gates](migrations/s3-media.md)
and [security triage](security/milestone-10b-audit-triage.md) remain open. This is
not security closeout, pilot/public release approval, or deployment clearance.

## Reviewed staging plan (shown only)

No staging, commit, push, merge, deployment or Git write was performed. Suggested
commit message: `fix: restore assigned reports on refresh and align password validation`.
The exact reviewed commands below exclude temporary fixtures, logs, environment
files, dependencies and build output.

```powershell
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray add -- client/src/features/auth/authSlice.ts client/src/features/auth/validateRegistrationPassword.ts client/src/features/reports/getAssigneeName.ts client/src/features/reports/reportsSelectors.ts client/src/features/reports/reportsSlice.ts client/src/features/reports/reportsThunks.ts client/src/i18n/locales/reports.ts
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray add -- client/src/i18n/locales/shell.ts client/src/main.tsx client/src/pages/myReports/MyReports.css client/src/pages/myReports/MyReports.tsx client/src/pages/register/Register.tsx client/src/routes/UsersRoutes.tsx client/tests/assignedReports.test.cjs
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray add -- client/tests/assignedReportsPersistence.test.cjs client/tests/passwordValidation.test.cjs client/tests/reportsLocalization.test.cjs docs/evidence/ux2/assigned-390.jpg docs/evidence/ux2/direct-assigned.jpg docs/evidence/ux2/password-boundary-390.jpg docs/ux2-reliability.md
```
