# Milestone 10B dependency audit triage

Audit date: **2026-09-21**, Asia/Jerusalem (UTC+03:00). Branch `ray-2-postgres`;
baseline `230762322d16038a7ce65f3aa291ff2311ce94ad`. Node **22.22.0**, npm **9.6.5**.
This is a report and recommendations for review, not risk acceptance or deployment
approval. No dependencies, overrides, lockfiles or system software were changed
during closeout. Changing `engines` to `>=22.22.0 <23` in 10B did not upgrade Node;
the installed runtime has not been asserted to be the latest patched release.

## Commands and current results

Executed from `server/`:

| Exact command | Observed exit code | Current registry result |
| --- | --- | --- |
| `npm.cmd audit --json` | **0** | 12 affected package entries: 6 high, 6 moderate |
| `npm.cmd audit --omit=dev --json` | **0** | 8 affected package entries: 6 high, 2 moderate |

Initial sandbox attempts could not reach the registry and returned an endpoint
error (npm exit 1). Approved execution outside the sandbox returned valid current
audit JSON. Both commands were repeated directly to confirm the unexpected exit
0 despite findings; `npm.cmd config get audit-level` reported `null`. The cause
of the zero exit status was not established. The JSON findings remain actionable:
do not interpret this environment's exit status as a clean audit or rely on it
alone as a future CI security gate. No automatic fixes were run.

The full report contains **16 distinct GHSA identifiers across eight underlying
packages**. Four other entries propagate dependency risk (`drizzle-kit`, its two
esbuild-kit ancestors, and `multer-storage-cloudinary`); they are not independent
advisories. Production-only has 15 of those identifiers across seven underlying
packages plus the Cloudinary adapter entry. No finding in these results names
`drizzle-orm`, `pg`, or `@types/pg`; that is not a comprehensive security guarantee.

## Dependency provenance

Read-only evidence: `git show 2307623:server/package.json`,
`git show 2307623:server/package-lock.json`, current package/lock metadata, and:

```powershell
npm.cmd explain body-parser cloudinary multer-storage-cloudinary jws lodash mongoose path-to-regexp qs esbuild @esbuild-kit/core-utils @esbuild-kit/esm-loader
```

Every affected production package below has the same installed version and path
at baseline and in 10B. Comparing all pre-existing lockfile package paths found no
version changes. This is a comparison against the baseline files using current
advisories, not an assertion that a historical audit was run at that commit.

| Installed package(s) | Direct/transitive dependency path | Scope and 10B origin |
| --- | --- | --- |
| body-parser **2.2.0** | Transitive: Ray -> express 5.1.0 -> body-parser | Runtime; unchanged baseline path |
| qs **6.14.0** | Transitive: Ray -> express 5.1.0 -> qs; also express -> body-parser 2.2.0 -> qs | Runtime; both paths unchanged |
| cloudinary **1.41.3**, multer-storage-cloudinary **4.0.0** | Both direct; adapter also has peer `cloudinary ^1.21.0` | Runtime upload stack; unchanged |
| lodash **4.17.21** | Transitive: Ray -> cloudinary 1.41.3 -> lodash; also cloudinary -> cloudinary-core 2.14.0 -> lodash peer | Runtime; both paths unchanged |
| jws **3.2.2** | Transitive: Ray -> jsonwebtoken 9.0.2 -> jws | Runtime authentication; unchanged |
| mongoose **8.16.1** | Direct: Ray -> mongoose | Runtime live persistence; unchanged |
| path-to-regexp **8.2.0** | Transitive: Ray -> express 5.1.0 -> router 2.2.0 -> path-to-regexp | Runtime routing; unchanged |
| esbuild **0.18.20**, @esbuild-kit/core-utils **3.3.2**, @esbuild-kit/esm-loader **2.6.5**, drizzle-kit **0.31.10** | Direct dev drizzle-kit -> esm-loader -> core-utils -> nested esbuild | Development only; entire affected path introduced by 10B |

The vulnerable esbuild is specifically at
`server/node_modules/@esbuild-kit/core-utils/node_modules/esbuild`. The pre-existing
root esbuild **0.25.5** remains unchanged and outside this advisory's range. The
new Drizzle-local tsx **4.23.15** / esbuild **0.28.2** path is also outside the range;
the pre-existing direct tsx remains **4.20.3**. Do not conflate these copies.

## Advisory inventory and fixes

Each identifier links to its official GitHub Advisory Database entry, reviewed
during closeout. Severities are per advisory, including low findings rolled up
under a moderate package entry. Fixed versions below address these advisories;
they are candidates for a separate remediation change, not verified upgrades.

| Affected package | Advisory and severity | Relevant exploit condition | First fixed version |
| --- | --- | --- | --- |
| body-parser | [GHSA-wqch-xfxh-vrr4](https://github.com/advisories/GHSA-wqch-xfxh-vrr4), moderate | Large numbers of URL-encoded parameters consume CPU/memory. | 2.2.1 |
| body-parser | [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6), low | Invalid computed/configurable `limit` silently disables size enforcement. | 2.3.0 on the installed major |
| qs | [GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p), moderate | Bracket arrays bypass `arrayLimit`; normal `parameterLimit` bounds the practical impact. | 6.14.1 |
| qs | [GHSA-w7fw-mjwx-w883](https://github.com/advisories/GHSA-w7fw-mjwx-w883), low | Non-default `comma: true` parsing bypasses array limits. | 6.14.2 |
| qs | [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26), moderate | `stringify` with comma arrays and `encodeValuesOnly: true` throws on null/undefined elements. | 6.15.2 |
| qs | [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), moderate | `stringify` invokes a hostile non-callable `constructor.isBuffer`; parsing with `allowPrototypes`/`plainObjects` can produce the object. | 6.16.0 |
| cloudinary | [GHSA-g4mf-96x5-5m2c](https://github.com/advisories/GHSA-g4mf-96x5-5m2c), high | Attacker-controlled parameter values containing ampersands inject additional arguments. | 2.7.0 |
| lodash | [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), high | Untrusted template import keys, including inherited polluted keys, reach generated code. | 4.18.0 |
| lodash | [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg), moderate | Crafted paths to `unset`/`omit` delete prototype properties. | 4.17.23 |
| lodash | [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh), moderate | Array-wrapped path components bypass the earlier prototype-deletion fix. | 4.18.0 |
| jws | [GHSA-869p-cjfg-cm3x](https://github.com/advisories/GHSA-869p-cjfg-cm3x), high | HMAC `createVerify()` plus secret lookup influenced by token header/payload. The advisory explicitly excludes the `verify()` API / jsonwebtoken users. | 3.2.3 on the installed major |
| mongoose | [GHSA-wpg9-53fq-2r8h](https://github.com/advisories/GHSA-wpg9-53fq-2r8h), high | Raw attacker-controlled `$nor` filters bypass enabled `sanitizeFilter`. | 8.22.1 on the installed major |
| mongoose | [GHSA-664h-wqgq-64gw](https://github.com/advisories/GHSA-664h-wqgq-64gw), moderate | Attacker-controlled dotted `__proto__` update paths pollute prototypes during casting. | 8.24.1 on the installed major |
| path-to-regexp | [GHSA-j3q9-mxjg-w52f](https://github.com/advisories/GHSA-j3q9-mxjg-w52f), high | Sequential optional route groups generate exponentially growing regexes. | 8.4.0 |
| path-to-regexp | [GHSA-27v5-c462-wpq7](https://github.com/advisories/GHSA-27v5-c462-wpq7), moderate | Multiple wildcards plus a parameter, with the second wildcard not terminal, permit backtracking DoS. | 8.4.0 |
| esbuild | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), moderate | A running esbuild serve server permits a malicious website to read served files, even over localhost. | 0.25.0 |

Grouped same-major candidate fixes are body-parser **2.3.0**, qs **6.16.0**,
lodash **4.18.0**, jws **3.2.3**, mongoose **8.24.1**, and path-to-regexp **8.4.0**.
Their immediate parent/current declaration ranges permit these versions without
a semver-major change, but lockfile updates and regression tests still need a
separate reviewed task. Passing the current tests does not validate those upgrades.

Cloudinary **1.x -> 2.7.0+** crosses a major and conflicts with the adapter's
`^1.21.0` peer range; the upload integration needs a compatibility/remediation plan.
Audit suggests cloudinary **2.11.0** and adapter **2.2.1** (a major downgrade), not
a tested migration plan. Do not apply those suggestions automatically.

The esbuild fix **0.18.20 -> 0.25.0+** is outside core-utils' `~0.18.20` range and
crosses potentially breaking 0.x minor versions. Audit's Drizzle suggestion is
**0.18.1**, a downgrade marked `isSemVerMajor: true`; it is not a suitable assumed
fix for this foundation. A compatible fixed Drizzle/loader dependency path has
not been established here. Review an upstream-supported tooling update separately;
do not force an override or replace the migration framework to hide the finding.

## Ray applicability and recommended handling

These are source-based assessments of current usage, not exploit tests against
the application. No live MongoDB or Cloudinary calls were made.

- **body-parser:** `server/server.ts` globally enables
  `express.urlencoded({ extended: true, limit: "10mb" })` before routes/auth.
  Installed 2.2.0 uses `body.split('&')` before enforcing its parameter limit, so
  the many-parameter input path is present. Prioritize remediation before public
  deployment; do not expose the current server to untrusted traffic for local
  testing. The invalid-limit advisory's prerequisite is absent in the inspected
  literal `"10mb"` configuration; no claim is made about unseen deployments.
- **qs:** the same parser reaches qs with `allowPrototypes: true`, but retains
  `parameterLimit = 1000`, reducing the bracket-array risk as the advisory explains.
  It does not enable comma parsing. No application `qs.stringify` call or vulnerable
  parse-to-stringify round trip was found; Express's default query parser is
  `simple`, and inspected Express/body-parser code uses qs parsing. The two
  stringify conditions are not established. Review/update qs with the parser
  remediation before deployment; no remote DoS reproduction was performed.
- **Cloudinary/adapter:** `server/routes/uploadRoutes.ts` mounts an unauthenticated
  `/api/upload/media` route and uses CloudinaryStorage with fixed folder,
  resource type and overwrite options. Its installed adapter forwards these
  options and file streams; the inspected callback does not copy body fields or
  original filenames into those options. This limits the obvious argument-input
  path, but complete SDK/upload error-path reachability is unverified. Resolve
  the advisory and peer compatibility, or obtain an explicit security review,
  before public upload deployment. No real upload was attempted.
- **Lodash:** Ray has no direct template/unset/omit calls. Inspection of Cloudinary
  utilities found other Lodash helpers; cloudinary-core's `omit` is a separate
  local helper, not proof of a Lodash vulnerable call. No attacker-controlled
  template imports or deletion paths were established. Update the transitive
  package in the separate upload/dependency remediation; lack of a found call is
  not proof of absence through every SDK path or another pollution chain.
- **jws:** both auth middleware modules call `jwt.verify` with a configured secret;
  installed `jsonwebtoken/verify.js:165` calls `jws.verify`, not `createVerify`.
  This matches the advisory's explicit exclusion. Recommend deferral for this
  specific exploit path pending reviewer agreement, with the 3.2.3 patch in a
  maintenance change. This does not certify the rest of authentication.
- **Mongoose:** validation parses email as a string; controllers construct filters
  from selected fields/IDs. No `sanitizeFilter` configuration, raw `$nor` input,
  or request-controlled update object was found. Report updates assign fixed
  fields then save. Both advisory preconditions are absent from the inspected
  routes, so a bounded deferral may be reviewed; schedule the same-major fix
  before deployment or any new query/update feature. MongoDB remains the live
  persistence layer, and no real data was inspected.
- **path-to-regexp:** routes are static literals with simple `:id` parameters;
  no active sequential optional groups or multiple-wildcard pattern was found.
  The commented-out wildcard example in `server.ts` is not an active route.
  Recommend reviewed deferral for current routes and a same-major maintenance
  update before deployment or route-pattern expansion.
- **Drizzle/esbuild:** the affected path is development tooling. The documented
  generation command generates files; migration application runs compiled Node
  code, and tests use pg/Drizzle without an esbuild serve server. No serve command
  is configured in this workflow. Recommend bounded deferral for this local
  foundation only, subject to review: do not use the vulnerable copy's serve
  feature. Binding such a server to localhost would not remove the advisory's
  malicious-website condition. Other tooling/server modes were not assessed.

**Local-work recommendation:** no finding establishes a blocker for the isolated
synthetic-data migration/build/test workflow that was run. Do not extend that
conclusion to running the API with untrusted traffic or enabling esbuild serving.

**Public-deployment recommendation:** block deployment clearance on remediation
of the reachable URL-encoded parser issue and resolution/review of the upload
stack and remaining runtime findings. Separately review the Node patch level,
frontend dependency tree, deployed configuration, TLS, secrets and live-data
operations; those were not audited here. No risk exception was approved.

**Checkpoint recommendation:** the verified PostgreSQL local foundation is ready
for a checkpoint commit with these documented findings, independently of public
deployment readiness. Existing tests passed (backend 88, PostgreSQL 16, frontend
feeding 30, both builds); these prove behavior, not vulnerability absence. This
closeout changes documentation only and performs no staging, commit or push.
