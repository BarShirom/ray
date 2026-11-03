# SEC.1B-3C.3A — Read-only logout recovery

Evidence date: **2026-11-03, Asia/Jerusalem**. Intended release level:
**A — local development**. Branch `ray-2-postgres`; verified baseline HEAD
`5fa5cc73e7d7ec06885c706364c59862f86301af`. The working tree and index were
clean, SEC.1B-3C.2 was committed, and local `origin/ray-2-postgres` tracking was
0 ahead / 0 behind without fetching. This follow-up remains uncommitted.

Read root [AGENTS](../../AGENTS.md), the [Release Quality Gate](../RELEASE_QUALITY_GATE.md),
[readiness](../RELEASE_READINESS.md), and the
[3C.2 implementation/correction ledger](sec-1b-3c-2-client-integration.md).
The final independent 3C.2 review returned **APPROVE WITH CHANGES**: its five
original findings were resolved, with no confirmed commit blocker, but one Low
concurrent recovery issue remained. That review is evidence for the committed
baseline, not independent approval of this follow-up.

## Reproduced race and root cause

The baseline [persistence module](../../client/src/features/auth/authPersistence.ts)
checked the failed logout's recoverable authority and stored identity, then
called the ordinary shared publisher. Those separate localStorage operations are
not an atomic compare-and-swap across browser tabs.

Reproduced ordering using production persistence and store modules:

1. A's durable logout fails because writes/removals are denied; local identity
   and protected Redux data clear, but A's stored credentials remain.
2. Storage becomes usable. A starts the explicit recovery action and reads its
   old authority/identity.
3. Before that read returns to A, the controlled fixture lets B publish a newer
   authentication intent/identity through a separate production store.
4. A resumes and unconditionally publishes guest authority and identity.
5. Recovery reports success; B loses authority and clears on reconciliation.

The baseline Node-stdin probe reproduced this before editing. The new regression
`node --test --test-name-pattern='last ownership read' client/tests/logoutRecovery.test.cjs`
also failed against baseline source: B's expected generation was replaced by A's
guest generation. The demonstrated consequence is unexpected logout/availability
loss, with no credential adoption or disclosure established by that reproduction.

## Correction and guarantees

Explicit recovery (`logoutUser({retrySessionId})`) is now **read-only**:

- Block the failed tab's persistence writer before checking storage, and keep it
  blocked after every outcome, including successful verification.
- Never publish authority/identity, remove keys, commit identity or trigger a
  shared purge from the recovery branch. Queued Redux Persist writes remain
  blocked. A genuinely new explicit authentication intent can publish normally.
- Complete locally only when both `ray:auth-authority` and `persist:root` reads
  return exactly `null`, following external/manual site-data clearing.
- Retained credentials, inaccessible/corrupt/empty identity strings and known
  partial logout state remain failures with the persistent shell warning.
  Removing only the identity is insufficient: an old authority marker could
  still admit another old tab's queued identity write.
- An observed foreign marker or identity supersedes the old recovery. It does
  not copy foreign credentials, alter their authority or rebroadcast invalidation.

The concurrency guarantee follows from **no shared mutations by recovery**,
rather than from another ownership check. B remains authoritative even if it
publishes after A's final read. The two absent-key reads are observations, not a
transaction, a lock or a promise that a later fresh login cannot populate storage.
No new coordination API, dependency or browser compatibility requirement is added.

The existing [store middleware](../../client/src/app/store.ts) accepts successful
verification locally without calling another publisher. Its failure transitions
still purge protected state and retain safe typed errors. Existing request/session
fences, refresh restoration, storage/focus/pageshow reconciliation and ordinary
login, registration, logout and same-account reauthentication remain in place.
The strict absent-key rule deliberately does not automatically clean retained
credentials when storage access returns.

The existing accessible [Hebrew shell warning](../../client/src/components/navbar/LogoutStorageWarning.tsx)
and its [typed resources](../../client/src/i18n/locales/shell.ts) now direct the
user to clear browser site data, then check again. The check itself does not erase
another tab's login; manual site-data clearing affects shared site storage and
may sign out other tabs. The superseded message no longer implies that checking
would overwrite a newer login. Navigation does not conceal the warning. No new
screen or server JWT revocation claim is introduced.

## Deterministic tests and integrated QA

[Existing auth regressions](../../client/tests/authSessions.test.cjs) retain their
failure/purge/warning/normal-auth assertions. Recovery assertions now require
restored storage alone to keep failing, zero shared mutations on retry/flush,
and local completion after both keys are externally cleared.

[Focused recovery regressions](../../client/tests/logoutRecovery.test.cjs) execute
the production persistence/session/store/thunk modules. Controlled read hooks
inject newer authentication after a value has been captured, then resume A with
that older value. Tests inspect authority, identity, attempted writes/removals,
protected state, retry results and refresh behavior, rather than reimplementing
the persistence algorithm. No arbitrary sleeps are used.

The Map storage double has synchronous operations, one shared storage object and
manually delivered events. Real windows have separate Storage objects; native
events are asynchronous and exclude the originating window. Injected hooks model
adverse interleavings deterministically; they do not establish actual browser
scheduling, event delivery, suspension or BFCache behavior.

| Executed command / method | Result and evidence boundary |
| --- | --- |
| Baseline production-module Node-stdin reproduction and new focused regression | VERIFIED failure before correction, as described above. |
| `node --test client/tests/authSessions.test.cjs` | **43/43 PASS** after correction. Production modules with controlled storage/HTTP and shell fixtures; not browser evidence. |
| `node --test client/tests/logoutRecovery.test.cjs` | **25/25 PASS**, including the regression that failed before correction. |
| `node --test client/tests/authSessions.test.cjs client/tests/logoutRecovery.test.cjs` | **68/68 PASS**, zero failed/skipped. |
| `node --test client/tests/*.test.cjs` | Final frozen-source run **199/199 PASS**, zero failed/skipped. A preliminary run passed 194 before five further edge cases were added. Development-only Redux invariant timing warnings appeared in the concurrent focused run; guards were not disabled. |
| `npm.cmd run build --prefix client` | PASS: 265 modules, main JS **610.93 kB**, gzip **192.32 kB**, CSS 42.45 kB. |
| `npm.cmd run build:postgres --prefix client` | PASS: 265 modules, main JS **612.12 kB**, gzip **192.34 kB**, CSS 42.45 kB. Both builds retain the >500-kB chunk warning. |
| `client/node_modules/.bin/tsc.cmd -p client/tsconfig.app.json --noEmit --incremental false`; same command with `client/tsconfig.node.json` | Both PASS. |
| Cwd `client`: `node_modules/.bin/eslint.cmd src/features/auth/authPersistence.ts src/i18n/locales/shell.ts` | Two changed TS files PASS, zero errors/warnings; no repository-wide lint claim. |
| `node --check client/tests/authSessions.test.cjs`; `node --check client/tests/logoutRecovery.test.cjs` | Both PASS. Installed ESLint Node API with recommended rules, CommonJS and Node/browser globals also passes both changed CJS files with zero errors/warnings; no configuration/dependency changes. |
| Documentation/scope hygiene | PASS: ten relative links, balanced fences/table columns, UTF-8/no BOM/final-newline/trailing-whitespace checks on all five changed/new paths, selected credential/capability literal screening and `git diff --check`. No comprehensive secret-history audit claimed. Exactly three tracked modifications and two new files; 294 other baseline files unchanged. |

All checks use installed packages. The full frontend suite and builds used
process-local environment isolation:
inherited AWS, media, Cloudinary and database settings removed; media and EC2
metadata disabled; AWS config/credential paths verified nonexistent. No dotenv
provider or database credential resolution was used by these checks. Focused
client fixtures use controlled HTTP/storage implementations. Node
**22.22.0**, npm **9.6.5**.

The first normal build failed because sandboxed esbuild could not traverse an
ancestor directory. Automatic approval initially rejected the retry by applying
the previous read-only review's no-emit restriction. After re-reading this task's
explicit build requirements and verifying ignored/untracked output paths, approval
allowed both standard builds; both passed without source/configuration workarounds.
This was an execution boundary, not a source compilation failure.

No backend code, API/session policy, SQL/schema/migration, dependency, signing,
station/Report access, feeding privacy or map/media lifecycle change is included.
Backend and PostgreSQL reruns are not required for this client persistence-only
correction under the change-based gate; prior 3C.2 backend/PG evidence remains
historical, not a current rerun. Persistent preview records/media are untouched.

## Browser limits, release gate and review

Browser surface inventory returned no browser connection and reported
`The browser access host is unavailable`. No native browser input or alternate
automation bypass was attempted. Two-tab interaction, real storage denial/site-data
clearing, refresh/suspension/BFCache, Hebrew warning announcement, keyboard focus
and 320/390px rendering remain **NOT_TESTED**. Existing native dialog, Leaflet,
decoded image/CORS and object URL browser acceptance is also still open.

QG-01/03/04/12 apply to session isolation, truthful failure and safe recovery;
QG-02/06/09 browser/accessibility acceptance remains unverified. Static/build/test
results only support their stated local scope. The existing real-user readiness
decision does not change, so `RELEASE_READINESS.md` is not edited in this batch.
All applicable pilot/production gates remain open.

Client logout does not revoke copied, already issued seven-day server JWTs.
Unavailable storage may retain credentials and restore them after refresh until
site data is cleared; the warning is intentionally truthful about that limit.
Password/session/recovery policy, malicious enrollment and precise-location risk,
distributed abuse/resource budgets, personal-data retention/access/deletion,
notices, dependency disposition, S3 acceptance, welfare/accessibility, production
TLS/configuration, restore/recovery, monitoring and incident ownership remain
separate real-user release requirements in readiness. No broader atomicity or
immediate revocation guarantee is claimed for the existing ordinary publisher.

Separate independent critical **read-only** review after integrated QA returned
**APPROVE** on 2026-11-03: no confirmed finding, required fix or Level A commit
blocker. A fresh reviewer inspected production paths, dependencies and assertions,
independently reran the two focused suites (**68/68 PASS**) and whitespace checks,
and passed an additional production-module probe: even successful recovery keeps
commit/queued writes blocked, while fresh explicit authentication can publish.
The reviewer did not rerun full frontend/build/static QA and claimed no native
browser evidence. Review changed no files or external state. This approval covers
the scoped local correction; real-user release gates remain open.

Explicit Git approval remains required. No staging, commit, push, merge,
deployment, cloud operation, credentials change or database operation was performed
by this batch. The reviewed five-path staging command is shown only in the handoff.
