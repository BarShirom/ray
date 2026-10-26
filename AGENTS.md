# Ray engineering instructions

Ray is a Hebrew-first community cat care platform for feeders and volunteers,
with future animal-welfare organization and municipal use. Prioritize reliable,
safe care coordination over portfolio presentation. Future roles and workflows
must not be described as already implemented.

- For release-oriented work, read [the Release Quality Gate](docs/RELEASE_QUALITY_GATE.md)
  and [current readiness](docs/RELEASE_READINESS.md). Apply checks proportionate
  to the change and intended release level; do not create extra approval steps.
- Follow the recorded security/privacy decisions and open findings in
  [SEC.1A](docs/security/pre-pilot-security-audit.md) and
  [SEC.1B-1](docs/security/sec-1b-1-remediation.md). Do not infer private access
  from assignment or private S3 storage; visibility changes need explicit product decisions.
- Prefer modular, maintainable changes and meaningful existing tests. Preserve
  Hebrew/RTL, typed i18n, account isolation, report transitions, PostgreSQL
  transactions and media ownership protections. Do not weaken tests or guards.
- Preserve unrelated work. Inspect Git state before editing; never discard,
  reset, stash or overwrite someone else's work to obtain a clean tree.
- Use the guarded disposable database for integration tests. Keep persistent
  preview data separate; ordinary checks must not invoke live cloud services.
- Report actual commands, results, limitations and evidence dates/tiers. Do not
  label unrun tests, mocks, historical checks or planned capabilities as current verification.
- Do not stage, commit, push, merge, deploy, modify cloud resources or perform
  destructive data operations without explicit authorization for that action.
  Existing task/session authorization counts; do not request it again unnecessarily.

Read and honor applicable nested `AGENTS.md` instructions; this file does not
replace their more specific guidance. Link to existing runbooks rather than
duplicating their operational procedures.
