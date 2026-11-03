# SEC.1B-3A - Hybrid feeding-station privacy and authorization design

Date: **2026-11-03, Asia/Jerusalem**. Status: **nine product decisions APPROVED;
engineering design revised after independent critical review; not implemented**.
Intended release scope: **Release Quality Gate level A, documentation only**.
The recommended next milestone is SEC.1B-3B, implemented in the small batches below.
This document does not clear a real-user pilot or production release.

## 1. Baseline, scope and evidence

Original drafting preflight found a clean working tree on **`ray-2-postgres`**, HEAD
**`9a5e646083110640bfa303d81f867b15ac636caa`**, commit
`fix: add scoped API abuse protection`. Its file list includes the SEC.1B-2 report
and implementation. Locally recorded `origin/ray-2-postgres` equals HEAD:
**0 ahead / 0 behind**. No fetch was performed; current remote freshness is unknown.
Only root [AGENTS.md](../../AGENTS.md) was found by the repository instruction scan.

Revision preflight on the same date verified the same branch/HEAD and tracking.
The expected existing uncommitted work was exactly
`?? docs/security/station-visibility-design.md`; the index was empty and there
were no unrelated changes. Its pre-revision SHA-256 was
`a2485b0f9867f4421717c6617e06ebf71875bc77d7f5779ce5dd42aab7e4fe00`.
This revision preserves and edits that document in place; it does not replace
the working tree or discard the existing draft.

Product-decision finalization preflight again verified the same branch, HEAD,
0/0 locally recorded tracking and empty index, with only that expected untracked
document and no unrelated changes. The product owner's latest instruction in this
conversation explicitly approves the nine decisions recorded in sections 2/14.
Approval is of those product principles only; this task authorizes documenting
them, not application changes, migrations, database/cloud operations or Git writes.

Reviewed the [Release Quality Gate](../RELEASE_QUALITY_GATE.md),
[readiness](../RELEASE_READINESS.md), [SEC.1A audit](pre-pilot-security-audit.md),
[SEC.1B-1 remediation](sec-1b-1-remediation.md),
[SEC.1B-2 protection report](sec-1b-2-abuse-protection.md),
[PostgreSQL preview](../migrations/postgres-preview.md),
[feeding persistence](../migrations/postgres-feeding.md),
[feeding boundaries](../migrations/feeding-persistence-boundaries.md),
[API compatibility history](../migrations/postgres-api-compatibility.md) and
[S3 media runbook/acceptance ledger](../migrations/s3-media.md), together with the
source and tests referenced below. Historical reports describe their own commits
and evidence dates. In particular, readiness's SEC.1B-2 uncommitted-tree wording
is historical: SEC.1B-2 is now committed at the HEAD above.

Read the complete independent critical review supplied in this conversation:
verdict **REVISE BEFORE IMPLEMENTATION**, REV-01 HIGH, REV-02/03 MEDIUM and REV-04
LOW. Its evidence is source review, not runtime verification. This revision adds
the missing design requirements and tests; it does **not** remediate application
code or claim that the proposed controls passed. Section 15 records each finding's
design disposition and the remaining implementation evidence.

This design milestone changes **only this file**. No application source, tests, dependency,
schema, migration, fixture, existing security history or readiness record changes.
No database connection, record rewrite/reset, browser workflow, application test,
AWS/Cloudinary request, credential resolution or cloud-resource change is part of
the work. No staging, commit, push, merge, branch switch or deployment is authorized.
Source inspection is evidence of current code, not runtime proof of the proposed policy.

## 2. Product policy and recommended defaults

### Approved policy supplied for this milestone

| Classification | Guest | Existing authenticated account | Creator | Explicit station grantee |
| --- | --- | --- | --- | --- |
| Regular | Cannot discover or read | Can discover and view | Can view; creator-management intent retained | Ordinary regular viewing; no inherited management right |
| Sensitive | Cannot discover or read | Cannot discover or read without ownership/grant | Can view; creator-management intent retained | Can view with explicit station authorization |

The product owner has now explicitly approved the nine principles below, including
the hybrid viewing audience. Section 14 separates these **APPROVED** decisions from
unspecified endpoint/field, invitation-lifecycle and operating details that remain
**OPEN / PROPOSED**. No approval of implementation behavior or test results is implied.

There is **no anonymous/public station classification** in this design. Historical
documents' term "public station" describes current behavior; the future regular
audience is authenticated accounts only. Authentication proves control of an
account, not trustworthiness, verified identity or an animal-welfare purpose.
Exact regular-station locations remain sensitive information and are obtainable
by a malicious registered account under the approved regular policy.

Inspectors and animal trappers must not have personal phone numbers exposed to
other users. Future provider communication belongs in the Report/case workflow
without personal-phone disclosure. No professional roles, verification, messaging,
municipal authority or case-management feature is implemented or added here.
Future verified professionals receive **exactly ordinary account access** unless
they are the creator or explicitly granted access to that station.

### APPROVED product decisions - explicit owner instruction, 2026-11-03

1. **New stations are sensitive by default.** Creators may deliberately publish
   them as regular. Never infer regular from missing/unknown visibility.
2. **Existing stations remain preserved and protected as sensitive** until their
   creators explicitly publish them as regular. Do not reset records or infer grants
   from past feeding activity.
3. **Guests cannot access stations; authenticated accounts can access regular
   stations; sensitive access requires creator ownership or an explicit station grant.**
4. **A sensitive-station grant permits viewing and recording feedings, not station
   administration.** It does not delegate grants, ownership or private Report rights.
5. **Shared feeding information is minimized to useful coordination summaries.**
   Other feeders' identities, precise timestamps and personal notes are not
   automatically disclosed. Authors retain appropriate access to their own logs;
   exact response fields and access after parent authorization loss remain open.
6. **Recipients use private, purpose-specific invitation references.** No public
   user directory or email disclosure. These grant-recipient references identify an
   intended recipient; possession alone does not self-authorize station access.
   Lifetime, reuse/acceptance mechanics and exact format are not approved by this principle.
7. **Suppress unsupported legacy external station image URLs from protected
   presentation without destructively rewriting records; reject new arbitrary
   external station URLs.** Independent report-media policy is not approved by this.
8. **Do not build a duplicate Mongo station authorization system.** Plan explicit
   safe retirement of legacy station routes. Exact refusal/cutover mechanics remain open.
9. **Summary-only ongoing coordination is sufficient for this milestone;
   station-note editing is out of scope.** Shared station instructions are creation-only;
   this does not remove the separate approved principle of appropriate author log access.

PostgreSQL remains the authoritative station store for the accepted architecture;
private S3, creator/explicit-grant access, server-side authorization, station-first
transactional locking, authoritative media-parent checks and separate Report
permissions are retained. Product choices below do not authorize a second legacy
security implementation or a production rollout.

Implement the approved principles without reopening their product approval. Resolve
only the remaining details needed by each dependent batch in section 14. There
must be no compatibility fallback that publishes an unclassified station. Invalid
stored classifications fail closed even for an
otherwise matching owner/grant; recovery is an explicit operator task, not a client
request choosing an owner or overwriting a record.

## 3. Existing implementation and exposure inventory

Source references below are relative to this document and refer to the baseline HEAD.
Line references identify useful entry points, not runtime verification.

| Surface | Actual implementation and exposure | Required change/boundary |
| --- | --- | --- |
| Station database | [Schema, line 58](../../server/db/schema.ts#L58) has exact PostGIS location, name, counts, image, notes, activity and timestamps. `created_by` at line 71 is already a non-null UUID FK to users with deletion restricted. No visibility or grants table exists. | Reuse creator as owner; append classification and grants. Preserve geometry/SRID, all old values and FK protections. |
| Mongo/interface | [Station interface, line 29](../../server/feedingStations/feedingStationStore.ts#L29) exposes actor-free `listActive`/`findByPublicId`; historical records allow missing/null creator. [Mongo store, line 44](../../server/feedingStations/mongoFeedingStationStore.ts#L44) likewise reads without a viewer. [Model](../../server/models/FeedingStationModel.ts) requires a creator on ordinary creation. | Presence of an owner field is not an authorization system. Unsupported/malformed legacy records must not become regular. |
| Station HTTP | [Router, line 19](../../server/routes/feedingStationRoutes.ts#L19) authenticates station/feed creation only; list, detail and history are public. [Controller, line 30](../../server/controllers/feedingStationController.ts#L30) lists all active stations; detail at line 40 includes inactive stations. | Authenticate and object-authorize direct requests. There is no station edit, delete, visibility or grant route today. |
| Station persistence | [PG store, line 32](../../server/feedingStations/postgresFeedingStationStore.ts#L32) joins creator public IDs, filters activity for lists and only ID for detail. Creation uses the supplied trusted creator reference. | Viewer-aware SQL queries; no fetch-all/filter-in-React or unrestricted store fallback. |
| Creation/validation | [Controller, line 10](../../server/controllers/feedingStationController.ts#L10) selects fields and derives `createdBy` from `req.user._id`; [schema](../../server/validation/feedingStationSchemas.ts) has no visibility. [Media station schema](../../server/media/validation.ts) is a distinct creation variant. | Preserve actor-derived ownership in both schemas and media wrapper; validate classification explicitly. Unknown actor/grant fields cannot acquire authority. |
| Station response | [Serializer, line 3](../../server/serializers/feedingStationResponse.ts#L3) returns coordinates, notes, image reference, counts, creator public ID, activity, exact creation/update times and optional `__v`. | Use audience-specific allowlists. Remove creator linkage and unnecessary metadata from discovery. A stable image URL is not permission. |
| Feeding history | [Controller, line 57](../../server/controllers/feedingLogController.ts#L57) reads all logs for any existing station, including inactive ones. [Serializer](../../server/serializers/feedingLogResponse.ts) exposes feeder `userId`, exact `fedAt`, period, food/water, note, event/station IDs, creation/update times and optional `__v`. It does not populate feeder names/email, but IDs can be joined with named public reports. | Protect history, summaries and their metadata by the same parent policy; minimize identity/routine exposure. |
| Feeding writes | [Controller, line 21](../../server/controllers/feedingLogController.ts#L21) checks only station existence/activity. [PG log store, line 29](../../server/feedingLogs/postgresFeedingLogStore.ts#L29) locks station `FOR SHARE`, rechecks active and inserts in a transaction. [Mongo log store](../../server/feedingLogs/mongoFeedingLogStore.ts) uses separate operations. [Log schema](../../server/validation/feedingLogSchemas.ts) rejects forged user/station fields. | Add authorization inside the PG transaction after lock acquisition. Preserve strict actor/path derivation and inactive rejection. Do not claim equivalent Mongo race protection. |
| Authentication | [Required auth, line 19](../../server/middleware/authMiddleware.ts#L19) verifies a Bearer JWT and reloads stored identity. [Optional auth](../../server/middleware/optionalAuthMiddleware.ts) currently falls back to guest for invalid report credentials. | Use required auth for station JSON operations; never apply report-style guest fallback to a station operation. Account identity confers no professional trust. |
| Client authentication race | [Auth thunks, line 82](../../client/src/features/auth/authThunks.ts#L82) and line 105 dispatch `setAuth` after awaited requests. [Auth reducer, line 49](../../client/src/features/auth/authSlice.ts#L49) also accepts every fulfillment; logout invalidates no pending authentication generation. | REV-01: fence login/register intent, dispatches, reducers, persistence, navigation and subsequent protected work, not just station responses. |
| Error contract | [Station thunk, line 20](../../client/src/features/feedingStations/feedingStationsThunks.ts#L20) and [log thunk, line 19](../../client/src/features/feedingLogs/feedingLogsThunks.ts#L19) reject with localized strings, losing status. | REV-03: bounded typed rejection metadata must survive until security/state decisions; localization is presentation only. |
| Map/discovery | [MapPage, line 107](../../client/src/pages/mapPage/MapPage.tsx#L107) fetches stations on mount regardless of auth. Coordinates also drive fit bounds, center, counts and markers. [Marker](../../client/src/components/feedingStationMarker/FeedingStationMarker.tsx) exposes name/count/location context. | Filter on the server before all discovery calculations; guests must not fetch restricted station data. |
| Derived map state | [Viewport, line 53](../../client/src/pages/mapPage/MapPage.tsx#L53) fits once using a ref; [MapContainer, line 267](../../client/src/pages/mapPage/MapPage.tsx#L267) remains mounted. Changing its center prop does not reset the existing Leaflet instance. | REV-02: explicitly reset camera/zoom/bounds/fit and picker overlays on session change or confirmed loss of station access. |
| Details/history UI | [Details, line 49](../../client/src/components/feedingStationDetails/FeedingStationDetails.tsx#L49) fetches unauthenticated history and renders station image/notes, latest exact feeding and ten history rows. The response/state contains more than the ten displayed rows. | Render authorized summary/own-history DTOs. A UI row limit is not a data limit or privacy control. |
| Client HTTP/state | [Station thunks](../../client/src/features/feedingStations/feedingStationsThunks.ts) and [log thunks](../../client/src/features/feedingLogs/feedingLogsThunks.ts) omit Bearer on reads; [HTTP client](../../client/src/api/http.ts) has no automatic auth interceptor. [Station slice](../../client/src/features/feedingStations/feedingStationsSlice.ts) and [log slice](../../client/src/features/feedingLogs/feedingLogsSlice.ts) do not fence by account/session. Logs merge old entries; rejected reads retain data. | Bind reads and all completions/errors to current actor/session; replace scoped snapshots and purge denied data. |
| Local UI/storage | [MapPage, line 75](../../client/src/pages/mapPage/MapPage.tsx#L75) separately retains selected and created station objects. [Store, line 26](../../client/src/app/store.ts#L26) persists auth only. No station/log browser persistence or service-worker cache was found in reviewed source. | Clear component state as well as Redux. Keep protected data out of persistent storage; existing persistent Bearer-session risk remains open. |
| Media | [Content route, line 20](../../server/media/routes.ts#L20) is public; [service, line 176](../../server/media/service.ts#L176) checks ready state and existing parent, then signs. It accepts no actor. [MediaImage, line 26](../../client/src/components/media/Media.tsx#L26) uses ordinary image URLs. | Parent-aware authorization plus an authenticated client image-resolution path are both necessary. See section 8. |
| Compositions | [Normal app, line 87](../../server/app.ts#L87) still selects Mongo. [Preview, line 24](../../server/preview/app.ts#L24) selects PG and media-wrapped station stores when enabled. Normal `dev`/`start` are not PG production entry points. | Cover plain PG, media-enabled PG and legacy/default paths; do not fix only the preview UI or bare PG adapter. |
| Reports | [Report schema, line 32](../../server/db/schema.ts#L32), [interface](../../server/reports/reportStore.ts), [Mongo model](../../server/models/ReportModel.ts) and [validation](../../server/validation/reportSchemas.ts) contain no station relation. [Report serializer](../../server/serializers/reportResponse.ts) exposes precise independently supplied location, text/media, reporter/assignee names/IDs and timestamps. | Keep domain permissions independent. Public reports can still reveal co-located or manually duplicated station information. |
| Logs/metadata | [Legacy logger, line 25](../../server/app.ts#L25) records raw request paths, potentially including station/media IDs. Lists/history lack pagination. Read limits in SEC.1B-2 do not confer authorization. | Redact route parameters in routine logs; scope all future count/search/paging metadata before response generation. |

There is currently no station-specific search, bounds API, cluster API, station
statistics endpoint or React station deep-link route. `/map-page` is public and
details are a selected-station dialog ([App](../../client/src/App.tsx)). Future
surfaces inherit this design; their absence is not a claim of implemented protection.

## 4. Authorization rules and endpoint matrix

### Principals, actions and failure semantics

Use the current stored authenticated identity, resolved to its internal user UUID
server-side. Do not accept ownership, grantor, role or effective permission from
the body, query, client state or a station serializer. Define:

- `canView`: authenticated, valid stored classification, and regular **or** creator
  **or** an active explicit care grant.
- `canFeed`: proposed implementation predicate `canView` and station active. The
  sensitive grant's view-and-feed scope is APPROVED; retaining feeding by all
  authenticated regular viewers preserves current behavior but was not separately
  approved by that grant decision. Record that remaining detail in section 14.
  A grant never confers administration. Authorize before disclosing active state.
- `canManage`: authenticated creator of a validly classified station. An explicit
  grant, past feeding, report assignment, company or future verified status is insufficient.

The database/query layer must receive the principal and enforce these predicates
on every operation. No route may retrieve an unrestricted station/history and
later rely on a component hiding it. IDs, including predictable fixture IDs, are
identifiers rather than security boundaries.

For station JSON routes, missing/invalid/expired Bearer or deleted identity gives
**401 before object lookup**. Authenticated missing, invisible or non-owned targets
use the same **404 `{message:"Feeding station not found"}`**, including management
attempts by visible non-owners. Keep malformed-ID **400** validation envelopes
after auth; syntax errors say nothing about existence. Inactive feeding gives
**409 only after authorization**. A visible empty list/history is **200 `[]`**, not
a fabricated success for a denied target. Keep bounded generic 500/503 failures
distinct from empty results. Set `Cache-Control:private,no-store` on protected
successes and errors, including 401/404; avoid ETag/304 reuse of protected bodies.
Existing ingress/read/write limits and safe 429/Retry-After remain in force.

### Actor matrix

`R` = regular; `S` = sensitive. "Own history" is the recommendation in section 7.
Future professionals follow the authenticated/grantee/creator columns, with no
additional entitlement. The matrix applies approved product principles; unspecified
operation/field details remain design proposals, not current implementation/test results.

| Operation | A: guest | B: authenticated non-owner, no grant | C: creator | D: active care grantee | E: revoked grantee | F: future verified professional |
| --- | --- | --- | --- | --- | --- | --- |
| List/map discovery | Neither R nor S | R only | Own R/S, plus ordinary R | R plus granted S | R; S omitted unless creator/separately authorized | Same as B, C or D by actual relation |
| Detail/exact coordinates/image | Neither | R only | Own R/S | R and granted S | R only; S denied | No professional bypass |
| Feeding coordination summary | Neither | R only | Own R/S | R and granted S | R only | Same station rule |
| Individual feeding history/notes | Neither | Own entries at viewable R | Own entries at own R/S, not all feeders by ownership | Own entries at viewable R/S | Own R entries; own S entries also denied after loss of station access | No additional individual-history permission |
| Record feeding | 401 | Active R | Active own R/S | Active R/granted S | Active R only | Same station rule |
| Create station | 401 | Allowed; creator fixed to caller | Allowed | Allowed | Allowed | Ordinary creation; no delegated authority |
| Change visibility | 401 | 404 | Own R/S only | 404 unless also creator | 404 unless creator | No professional bypass |
| List/add/revoke station grants | 401 | 404 | Own R/S only | 404; cannot delegate | 404 | No professional bypass |
| General edit/delete/transfer | No endpoint | No endpoint | No implemented endpoint; future owner checks need their own scope | No endpoint/right | No endpoint/right | No endpoint/right |
| Related reports/private reporter data | Independent report policy | Independent report policy | Station ownership adds no report right | Station grant adds no report right | Revocation does not alter independent report rights | No new report/professional rights |

Revocation removes the extra sensitive permission. It cannot ban an authenticated
account from regular-station viewing or its minimized summary. Under the separately
recommended regular-contributor policy, it would not ban their feeding action
either; that remaining detail is not approved by PD-04. To restrict its location audience, the owner must classify
the station as sensitive. A grantee is never automatically a grant manager.

### Endpoint-by-endpoint design

Paths include `/api`. **Existing** endpoints deliberately change their historical
public/field contracts; **new** endpoints below are proposals for 3B.

| Method/path | State | Required authentication/authorization and result | Rejection / privacy details |
| --- | --- | --- | --- |
| `GET /feeding-stations` | Existing | Required auth; SQL returns active stations satisfying `canView` only. Array uses discovery DTO below. | 401 guest; hidden records do not affect counts/order/cursors/bounds. No hidden-ID placeholders or total. |
| `GET /feeding-stations/:id` | Existing | Required auth plus `canView`; authorized inactive detail remains available. | 401/400/indistinguishable 404; same policy for direct requests without visiting map. |
| `POST /feeding-stations` | Existing | Required auth; server creator; validated `regular`/`sensitive`. Omitted visibility resolves to sensitive under the APPROVED default. Parent/image attachment stays atomic. | 401/400, existing bounded media failures; never accept body ownership/grants or publish on missing/unknown stored classification. |
| `GET /feeding-stations/:stationId/feedings` | Existing | Required auth plus parent `canView`; return caller's own entries only, ordered as today. | 401/400/404; no other feeder IDs, notes or timelines, including to creator. Apply own-user filter in SQL. |
| `GET /feeding-stations/:stationId/feeding-summary` | New | Required auth plus `canView`; aggregate food/water recency without individual events. | Same hidden-target 404; no raw timestamps/count/feeder linkage from aggregates. |
| `POST /feeding-stations/:stationId/feedings` | Existing | Required auth plus `canFeed`, rechecked in the insert transaction; actor/path-derived IDs. Return author's receipt DTO. | 401/400/404; authorized inactive 409; denied requests insert nothing. |
| `PATCH /feeding-stations/:id/visibility` | New | Creator only; strict body `{visibility}`; transactionally update classification. | 401/400/404; no general patch, owner reassignment or arbitrary fields. Return owner DTO after success. |
| `GET /feeding-stations/:id/access-grants` | New | Creator only; bounded owner view of active grants, minimal recipient display label/public reference and granted time. | 401/400/404; do not expose recipient email/phone or grant list to grantees. No global user search. |
| `POST /feeding-stations/:id/access-grants` | New | Creator only; strict `{recipientReference}`; validate purpose-bound existing-user reference; create/reactivate care grant idempotently. | Authorize station before recipient processing. Generic invalid/unavailable reference 400; no account-existence-specific errors; reject self-grant. |
| `DELETE /feeding-stations/:id/access-grants/:recipientId` | New | Creator only; revoke station-scoped grant; 204 also for already revoked/absent validly shaped recipient ID. | 401/400/404; no global recipient lookup on deletion, no self or other-user delegation. |
| `POST /station-access/recipient-reference` | New | Required auth; no target user field; mint only caller's short-lived grant-recipient reference. | 401, bounded fixed validation/errors and account rate limits; not a login credential or station invitation. |
| `GET /media/:assetId/content` | Existing, S3 PG | Asset's authoritative station FK requires `canView` before any redirect; valid Bearer can authorize station image. Public report images retain their separate current policy. | Shared-route exception: unauthenticated station, missing, unattached and unavailable assets return uniform generic 404, because anonymous report images still work. Any supplied malformed/expired/invalid Bearer or deleted identity gives 401 before asset lookup, on either parent branch. No redirect/signing for a denied precheck. |
| `POST /media/:assetId/read-url` | New, S3 PG | Required auth; station-parent `canView`; JSON `{url,expiresIn:60}` for protected image client. | 401 before lookup; 400 invalid UUID; uniform 404 for unavailable/unauthorized asset or report-parent asset. Short-lived capability stays in component memory only. |
| `POST /media/uploads`, `POST /media/:assetId/complete` | Existing | Existing authenticated upload-owner controls; completion is not permission to read an attached station. | Preserve owner/purpose/state/expiry/quotas/lease checks. A grant does not allow attachment of another user's asset or editing an existing station image. |
| `GET /media/capabilities` | Existing, PG | Public, configuration limits/enabled flag only. | No station IDs, counts, classifications or grant information. Disabled media remains unavailable. |
| Report list/create/assigned/statistics/claim/resolve and report media | Existing | Independent existing report authorization, unchanged by station relationship. | No automatic station embedding or grant-derived private report access. See section 9. |
| Retired `/upload` namespace | Existing | Remains unavailable under SEC.1B-1. | No alternate upload/read authorization path, no provider activation. |

For shared media, do not simply attach required auth to the whole existing
content route: that would silently change independent public-report policy.
Resolve an optional identity strictly when credentials are supplied, then apply
the authoritative parent policy. Station image denial must not say whether the
station exists, is sensitive, has a grant, or is owned by someone else.

### PROPOSED response projections

Discovery should include only `_id`, name, exact `{lat,lng}`, counts, classification,
and caller-relative `permissions` such as `canManage`/`canFeed`. The approved regular
audience can see exact coordinates; recommending a coarse public location does not
replace that decision. Do not return creator ID, grants, full notes, image capability,
creation/update times or `__v` in discovery. Fetch authorized detail on dialog open
instead of using an unrestricted full list record as detail.

Detail may add the station's care notes, stable application image reference and
active flag. All viewers receive no creator contact/ID or grant list. Notes/images
need owner guidance against personal routines, phone numbers, faces/home details
and publishing sensitive locations; no automatic text/photo detector is claimed.
Keep necessary internal timestamps/version/presence fields in persistence without
serializing them to every viewer. Permission flags are UI hints, never authority.
Creation returns the owner-view detail projection, not a less-restricted legacy
serializer. Summary and own-history are separate DTOs, not partially populated
objects falsely typed as the old full `FeedingLog` model.

## 5. Smallest PostgreSQL design, migration and concurrency

### Proposed additive schema

Reuse `feeding_stations.created_by` as immutable owner; do not add a competing
`owner_id`. Preserve its existing non-null FK and restricted user deletion.
No owner input, transfer, placeholder creator or automatic grant from past feedings.

Append a new migration after `0006_media_assets.sql` (expected next number `0007`,
verify journal immediately before implementation). Never edit SQL/snapshots/hash
history for migrations 0000-0006. Proposed additions:

| Object | Fields/constraints | Purpose |
| --- | --- | --- |
| `feeding_stations.visibility` | `text NOT NULL DEFAULT 'sensitive'`; CHECK in `('regular','sensitive')` | APPROVED product default and conservative existing-row classification; this SQL mechanism remains proposed and unexecuted. Encode at every writer boundary. |
| `station_access_grants` | `station_id` UUID FK to stations RESTRICT; `user_id` UUID FK to users RESTRICT; composite primary key `(station_id,user_id)` | One current grant state per station/recipient; no organization/role model. |
| Grant attribution/state | `granted_by` UUID NOT NULL user FK RESTRICT; `granted_at` timestamptz NOT NULL; nullable `revoked_at` timestamptz; CHECK `user_id <> granted_by`, CHECK revoked time >= granted time | Retain latest owner action/revocation instead of deleting evidence. Application checks grantor equals immutable owner inside the transaction; the FK alone does not enforce owner authority. |
| Active-grantee index | Partial `(user_id,station_id)` WHERE `revoked_at IS NULL` | Efficient actor-scoped existence checks. Primary key supports owner station grant listing/checks. |
| Discovery index | Candidate partial `(visibility,created_at DESC,id DESC)` WHERE active | Measure the actual regular/owner/grant query on disposable data before adding redundant indexes. Existing creator and geography indexes remain. |

Use database checks/FKs/uniqueness for structural integrity and application queries
for authorization. This is not implemented PostgreSQL RLS. The runtime's ability
to query the database does not itself create an administrative application role.
Server-only `granted_by` and fresh post-lock times are required on every grant write.
Regrant updates the one row to active with a new grant time; repeated active grant
is idempotent without unnecessary rewrites. Revoke stamps an active row once.
The row retains latest state, not a full immutable grant-event ledger. If incident
requirements need every historical transition, add an explicitly scoped durable
audit design rather than claiming latest-state columns are comprehensive auditing.

### Query/service boundary

Replace HTTP-facing actor-free station reads with principal-required operations
such as `listVisibleActive(principal)`, `findVisibleByPublicId(principal,id)` and
`listOwnFeedings(principal,stationId)`. Put grant/visibility/feed writes behind one
shared station authorization service/query helper. Separate genuinely internal
unrestricted migration/test access so controllers and media cannot call it by
accident. Resolve public ID to internal UUID once in the operation; do not join
email/hash/contact columns. Preserve current 24-hex public IDs/canonicalization and
media UUIDs; internal UUIDs do not enter general DTOs.

The SQL predicate is an explicit valid classification AND
`visibility='regular' OR created_by=:actor OR EXISTS(active grant for :actor)`.
Apply parentheses so the classification check covers every branch. List activity
is an additional condition, not an authorization condition. Filter in SQL **before**
ordering, limits, counts, search, spatial aggregation or paging. `EXISTS` avoids
duplicate stations and per-row grant queries. Detail/history/summary authorization
and their projections share one query snapshot or the locked transaction below;
never authorize in a controller and then call an unrestricted history method.
Fetch a summary when details open; do not launch one summary request per map marker.
Use grouped/filtered aggregates if a future list really needs summaries.

### Transactions and revocation ordering

All policy-changing transactions lock the **station first** `FOR UPDATE`, then
recheck owner, then change visibility/grants. Resolve/validate a recipient and
write their grant within that operation; do not permit target data from an earlier
untrusted lookup to become authority. Keep a consistent station-to-grant lock order.

Feeding takes the existing station `FOR SHARE` lock, **then** reads current
classification/owner/grant in a fresh statement under READ COMMITTED, then checks
active and inserts using that same transaction client. A predicate evaluated
before waiting on the lock must not be reused: a concurrent revoke may have
committed while it waited. Owner/grant checks cannot be only a middleware precheck.
Detail/history/summary use the same short station shared-lock/recheck pattern
where ordering against policy changes matters; single-query snapshots still must
never mix an old authorized parent with newly fetched unrestricted children.

The guarantee is: **after revocation commits, newly authorized operations for that
revoked sensitive user fail**. An operation admitted before revocation can complete;
serialize it before revoke, and do not call it unauthorized retroactively. Reads
already returned, downloaded pixels and previously signed capabilities cannot be
recalled. Do not hold database locks across network/image-processing operations.
For media, authorize before signing, perform signing outside long SQL transactions,
then revalidate under a short station shared lock immediately before releasing the
capability. Discard a signed result if the final authorization fails. Initial
denial must not call the signer; a racing final denial may discard an unexposed URL.
The final authorization is the capability issuance ordering point, not arrival of
bytes at the client. A revoke committing later cannot recall that in-flight result.

### Preserving synthetic preview data

Ray has no historical production/field users. The persistent local preview does
contain synthetic users/stations/logs/reports and retained media; preserve them.
Do not use destructive reset/import or rewrite owners to simplify the policy.

The proposed SQL constant-default mechanism implements the APPROVED sensitive
classification of existing PG records
without a blanket UPDATE of their old fields or firing their updated-at trigger.
Rehearse that claim on old-schema disposable fixtures: compare **every old column**,
timestamps, FK references, attached asset IDs, hashes and journal entries before
and after the additive migration. New grants start empty. Existing creators keep
access; previous non-owner feeders get no inferred grant from their logs. Unknown
or missing visibility in any adapter cannot be interpreted as regular.

[Seed logic, line 35](../../server/preview/seed.ts#L35) creates owner A's stations
and user B's logs without a classification. The later implementation may make new
test/demo fixtures deliberately regular or explicitly granted, clearly synthetic.
Repeated preview seed must continue to skip existing rows: no reclassification,
owner overwrite, password reset or grant replay that undoes an owner's revocation.
Existing preview rows become sensitive under the reviewed migration; granting B
or making a particular synthetic station regular is a separate explicit action,
not a hidden seed repair. No such migration/action is performed in this task.

Use the [preview runbook](../migrations/postgres-preview.md) for any later authorized
preserved-preview upgrade and the [guarded test setup](../migrations/postgres-local-foundation.md)
for rehearsal. Startup's [migration hash guard](../../server/preview/migration-state.ts)
must recognize the appended journal normally; never weaken it or migrate at startup.
Deploy schema and privacy-aware backend/client together inside a stopped local
preview boundary; **do not run an old public-read backend against the new schema**.
Do not make protected station JSON reachable while any old public station-media
issuer remains reachable. Complete both confidentiality boundaries, including
media-wrapped/default paths, before enabling access; otherwise keep affected
station routes/assets unavailable. Preserve preview rows, attachment identities
and retained objects: no reset, rekey, reupload, deletion or cache purge is implied.
Before real deployment, define forward recovery/rollback that retains restrictive
reads. Reverting to old public routes is not a safe privacy rollback. No production
composition or database deployment is established by this design.

## 6. Grants, recipient identification and minimal UX

Avoid email autocomplete, name search, account-existence checks and a public user
directory. Merely returning generic success for an exact-email/ID grant is
insufficient: an owner could inspect their grant list afterward to infer which
accounts exist. Rate limits alone do not remove that oracle. Existing public
report IDs also make a raw public user ID an inadequate consent mechanism.

Private purpose-specific invitation references and the absence of public-directory/
email disclosure are APPROVED. The following minimal implementation flow remains
PROPOSED; the approval does not fix lifetime, reuse, label or acceptance semantics:

1. An existing signed-in recipient chooses "קוד לקבלת גישה" from a small action
   in the existing MapPage toolbar, available even when they own/see no station.
   Do not put this recipient action only inside owner station controls or invent
   a profile-management system. The self-only
   endpoint mints a bounded signed account reference, recommended lifetime **15
   minutes**, containing only version, recipient public ID, expiry and a distinct
   station-grant-recipient purpose/audience. No email, phone, role or station ID.
   Use a distinct token format and a domain-derived signing key (for example,
   context `ray:station-grant-recipient:v1`), with a `recipientId` claim rather than
   login's `id`. Never sign this reference with the login key or use the login-token
   parser. Current required auth verifies a JWT signature and `decoded.id` without
   checking audience/purpose; adding a purpose claim alone to a login-shaped token
   would not prevent it from becoming a shareable login credential. Test both
   directions of token rejection. The reference cannot create a user or open a
   station and gives the holder no station permission. No extra lookup/token table
   is needed.
2. The recipient deliberately shares that reference with a station owner through
   an existing channel of their choice. Ray does not send a message or implement
   in-app contact sharing. Explain that a station owner using it can grant care
   access and see the agreed minimal account display label.
3. The authenticated owner opens their station's "ניהול גישה", pastes the
   reference and chooses "הענקת גישה". Server checks ownership first, then bounded
   reference syntax/signature/purpose/expiry and current recipient existence, then
   writes the grant. Invalid, expired, wrong-purpose or unavailable-recipient
   references have the same generic failure. There is no arbitrary-ID/email
   resolution endpoint. Successful output shows only the intentionally shared
   account label/reference and grant state, not email/phone.
4. Owner sees current authorized recipients with labelled "ביטול גישה" buttons.
   A clear confirmation explains loss of future sensitive access and the short
   signed-read limitation. A successful revoke updates the list only after commit.
   The recipient sees the station on their next authenticated list refresh; there
   is no notification/inbox or live revocation channel in this milestone.

This is a **recipient identification proof**, not a public station invitation
token: possession cannot self-authorize or accept a grant to any station. An owner
still cannot grant themselves a second identity's authority or select grantor/owner
fields. Owners cannot delegate grant management. A stolen/forwarded reference can
be used by an owner to grant that recipient access, but never gives the holder
access; expiry limits unsolicited reuse. Recipient acceptance/rejection, self-leave,
reference single-use and ownership recovery are additional product decisions, not
silently implemented features. The simplest recommendation treats deliberate
reference sharing as consent for this limited owner action; document that scope.

Rate-limit reference minting and grant attempts by the verified account using the
existing protected write budget; use bounded body validation. Owner grant lists
need bounded paging before exposing this workflow at scale; queries/counts remain
station-and-owner scoped. Audit successful grant/revoke/visibility actions with
actor/station/recipient identifiers, action, time and outcome in access-restricted
security records. Do not log recipient references, signed URLs, tokens, names,
email, coordinates or text. Replace routine raw path logging with route templates;
the latest-state grant row is the minimal durable attribution, not a complete
tamper-proof audit system. Decide full audit retention/access before real users.

PROPOSED grant-state lifecycle: grant rows may exist on regular stations so owners
can name the people who will
retain access if it becomes sensitive. Visibility switches preserve current
explicit grants, never create them for all viewers. The owner explanation must
show this list when restricting visibility. Publishing as regular warns that all
authenticated accounts gain exact location access, including previously revoked
grantees. Revocation does not delete historical feeding records or media objects.

## 7. Feeding history: coordination and personal routine privacy

Needed for coordination: whether food/water was **recorded**, a useful recency
indication, and the ability to record one's own care and confirm it persisted.
Unnecessary for ordinary discovery: named/stable feeder linkage, exact recurring
timelines, all free-text notes, creation/update instants and long per-person history.
Removing a name while leaving a stable user ID is not anonymization.

| Option for authorized station viewers | Benefit | Privacy/compatibility tradeoff |
| --- | --- | --- |
| A: current full history, identity and notes | Maximum detail | **Excluded as an automatic audience by APPROVED PD-05:** exposes routines/free text. Owner status does not imply every feeder's consent. |
| B: coarse food/water recency plus caller's own detailed entries | Supports avoiding repeated care while retaining personal receipts/history | **APPROVED principles:** minimized shared summary and appropriate author access, with no automatic other-person identity/timeline/note disclosure. Exact bucket widths, author DTO fields and post-revocation semantics remain PROPOSED; verify usability. |
| C: exact latest food/water time, no identity/history | More precise immediate coordination | **Not approved for 3B** as an automatic disclosure; changing PD-05 would require a separate explicit decision. Still enables live routine inference. |
| D: detailed shared care-team history for sensitive stations | Could support a deliberately trusted team | **Not approved for 3B**; any future detailed audience/permission/notice needs separate review. An approved care grant does not include automatic feeder identity/history disclosure. |

For B, new summary DTO is `{food:{recency},water:{recency}}`, with recommended
server-computed buckets `under-2h`, `2-to-6h`, `6-to-12h`, `12-to-24h`, `older`,
`no-record`. These bucket widths are a product recommendation to test, not a
clinical feeding schedule. Compute food from latest log with `food=true`, water
from latest `water=true`, independently, using server time and non-future `fedAt`.
Water-only never advances food; `food=false,water=false` advances neither. Do not
expose raw time, feeder ID, event ID, count, period or note in the summary.
Treat future-dated entries explicitly in the author's history; do not describe
them as a completed recent feeding. A future input-policy tightening is separate
from this summary rule and needs validation tests.

`GET .../feedings` remains an array but intentionally changes to **own entries
only**, after parent authorization. Author receipts/own history may retain `_id`,
`stationId`, exact `fedAt`, period, flags, own note and creation/update timestamps;
omit redundant `userId` and `__v` from the HTTP DTO. Keep complete internal records
for integrity. A later paged own-history contract must bound results and not expose
other-user counts; the current unbounded-list release finding is not closed by
changing visibility. Owners/grantees see the same minimized shared summary and
their own entries unless a separate detailed-team policy is approved.

PROPOSED secure station-endpoint default: after sensitive access is revoked, even
the revoked feeder's old station-specific history is unavailable there. Product
approval of appropriate author access does not settle this edge case; resolve
its exact scope before the affected history batch, including whether a redacted
author-only route is required. Do not let an own-history link
become a backdoor to sensitive coordinates/notes; future account exports need a
separate redaction decision. Keep records rather than destructively deleting them.

Update the current "I Fed Here" flow to show the shared summary and clearly label
"ההיסטוריה שלי בתחנה". Preserve food/water/period/note submission and Jerusalem
display of own exact instants. Explain that the note is private to its author
under this baseline; shared care instructions belong in owner station notes.
Those shared notes are **initial, creation-only instructions**: current routes
have no station-note edit operation and general editing remains outside 3B.
Summary-only ongoing coordination is now **APPROVED** for this milestone, and
station-note editing is explicitly out of scope. Here "summary-only" means no
shared individual-feeder timeline; it does not remove appropriate author access
to their own logs. Exact author DTO/access semantics remain open. Any later owner-
notes edit is a separate feature; do not expand 3B or expose private feeding notes.
On successful feeding, retain the confirmed own receipt and invalidate/refetch
that station's shared summary with current-session/request fencing. A summary
outage does not turn a saved feeding into failure or justify duplicate submission:
show the saved receipt and mark shared status unavailable/stale with explicit retry.
Record the summary's local receipt time in memory and label its freshness; as a
recommended initial rule, after 60 seconds mark it "update required" until refreshed.
Do not indefinitely present an old `under-2h` bucket as current or infer an exact
feeding time from that bucket. No background retry loop is required. Revalidation
on dialog/tab return and explicit refresh support current coordination.
"No recorded feeding" must never imply an animal was not fed, and "older" is not
a claim of present food availability. Near-real-time polling can still infer
activity and physical observers can identify feeders; buckets/limits reduce data
exposure without promising anonymity or animal safety.

## 8. Images, stable media references and indirect leaks

### Enforce the authoritative parent

Private S3 storage is not application authorization. The current service issues
read capabilities to guests for attached images. For station assets, require
ready state, valid attachment, existing parent and `canView` **before any readable
capability/redirect**. Use `media_assets.station_id`, never a caller-supplied station
ID, referrer, URL embedding, guessed purpose or ownership of the uploaded bytes.
An uploaded/complete asset's owner is not an alternative path to attached-parent
reading. Pending, processing, failed, deleted, ready-unattached and unavailable
parent cases have no publicly readable output; grant management does not change this.
Both GET content and POST read-URL must call the same parent-policy and final
station-authorization/issuance helper, with the latter explicitly station-only.
It returns 404 for a report-parent asset rather than creating another report read
policy. On shared GET, supplied invalid credentials return 401 before asset lookup;
do not reuse the existing forgiving report optional-auth middleware unchanged.

Preserve [locked attachment checks, line 43](../../server/media/service.ts#L43):
same upload owner, purpose, ready state, unexpired and unattached; one station
image/three report images; duplicate rejection; parent insert and asset claim in
one transaction. [Database attachment constraints, line 139](../../server/db/schema.ts#L139)
enforce single parent, purpose and uniqueness. Station access grants do not allow
reusing another user's asset. General image replacement/deletion is not introduced.
Current [normalization](../../server/media/image.ts#L24) removes output metadata,
but source originals remain private and retained. Station authorization does not
resolve original retention, operator access or attached-media takedown under SEC-010.

The S3-enabled schemas reject externally supplied station `image` and nonempty
report `media` URL arrays. Media-disabled PG/legacy currently accept arbitrary
strings. Copying a station content URL into a report/another station must never
make it readable: content service resolves the original FK every time. An external
image URL can already disclose its bytes/location independently of Ray; ACL cannot
recall that exposure. APPROVED 3B handling is to suppress unsupported external
station image URLs and reject new arbitrary station URLs in supported PG modes,
preserving stored strings for review without loading them. That suppression/
rejection policy is approved; any future host exception is unspecified and needs
its own decision. Do not silently proxy or fetch arbitrary hosts. Independent
report external-media policy remains SEC-012 and must
not be described as fixed by station work.

### Protected client image path

An ordinary `<img>` cannot add the current Bearer header. The recommended narrow
change is authenticated JSON read-URL issuance, then a separate credential-free
S3 fetch to an in-memory Blob/object URL. Send Ray Bearer only to the configured
Ray API origin and known media route, never an arbitrary `src`, redirect target
or S3 request. Fetch S3 with no Ray header/cookies, `credentials:'omit'`,
`referrerPolicy:'no-referrer'` and `cache:'no-store'`; bound bytes/type and request
lifetime using existing image limits. Display the object URL and revoke it on
unmount, account/session transition, source change or access loss. Do not fetch an
authenticated redirect automatically and assume the client stripped credentials.
Never put Bearer tokens or recipient references in URL parameters/paths.

Keep report-image rendering governed by its own current policy. Preserve explicit
single image retry; retry reauthorizes with the current actor, with no automatic
refresh loop. Do not persist signed URLs, blobs or object URLs in Redux persistence,
localStorage, sessionStorage, IndexedDB, CacheStorage, analytics or error reports.
No service-worker/offline sensitive cache is proposed. Clear decoded image elements
as well as URLs; client cleanup cannot erase information a viewer copied earlier.

### Expiry, caching and revocation limits

Retain the current **60-second** signed GET lifetime
([constant](../../server/media/types.ts#L14)); do not lengthen it for image UX.
Use no-store on stable redirects, issuance JSON, errors and station API responses.
Current [output metadata, line 84](../../server/media/s3.ts#L84) is
`private,max-age=60`, while signed reads at line 95 do not override cache headers.
A download near capability expiry can therefore remain fresh in a browser cache
beyond expiry. Recommend signing GET with `ResponseCacheControl:
'private, no-store, max-age=0'`, covering retained objects without rewriting them;
set the same policy for future output metadata. Verify generated request options
offline and browser mock headers; actual deployed/provider cache behavior remains
an environment-specific evidence requirement, not a reason for new live S3 calls
in station authorization regression work.

The new signed no-store override applies to newly issued reads; it cannot alter
previously issued URLs or remove existing cached responses. A stable Ray content
URL copied into another entity still resolves and authorizes against its original
media FK. A copied presigned S3 URL is different: its holder can use that bearer
capability directly until expiry without a fresh Ray access check.

Previously issued signed URLs remain usable until expiry; transfers started before
expiry may complete afterward. Old cacheable URLs/previously cached or saved bytes
cannot be revoked by a database grant update. A privacy cutover must acknowledge
the previous cache lifetime, stop old public issuers, and never promise immediate
erasure. New unauthorized requests cannot obtain fresh capabilities. An authorized
recipient can still intentionally share a capability or copy an image. If product
requires a tighter revocation boundary than this bounded capability model, choose
an authenticated streaming proxy in a separate scoped design; it still cannot
recall downloaded bytes. No S3 deletion/IAM/CDN mutation is proposed here.

### Indirect-leak controls

| Channel | Required invariant |
| --- | --- |
| JSON/metadata | Ray must not derive, join, auto-prefill or embed hidden station IDs, names, coordinates, image references, owner/grant markers, timestamps or existence flags through another entity's authorization or server-generated metadata/errors. Discovery counts reflect authorized rows only. This invariant does not promise semantic redaction of independently entered public report content or manual copies. |
| Search/filter/page results | Apply visibility predicate before filters/counts/limits; no global hidden total, gap placeholder, distinct hidden-match error or unfiltered cursor metadata. Existing lack of pagination remains a release issue. |
| Map/bounds/clustering | Fit bounds, center, counts, keyboard station list and any future server clusters derive only from authorized output. Hidden markers cannot influence the map extent or a legend count. |
| Feeding reads/summaries | Parent check covers raw history, own-history, last-food/water and aggregate responses; user having written a log is not a grant. |
| Reports/media references | No server-generated station field/image copy to public reports; application media resolution follows its real FK regardless of where the URL was pasted. Report assignment does not override station ACL. Manually entered station strings/photos/coordinates may remain in independent public reports; copied S3 capabilities and image bytes remain residual risks. |
| Client memory/persistence | Fence authentication attempts and accepted-session persistence before protected requests; ignore stale success/error effects. Clear entities, selected/created objects, history, summaries, grants, drafts, image URLs and station-derived Leaflet viewport/overlays on session change or confirmed station access loss. Do not persist protected state. |
| Errors/timing | Same 404 envelope for authenticated hidden/missing station and unavailable media; no raw SQL/storage keys, grant state or owner hints. Do not claim constant-time responses; review gross timing differences and bound probing. |
| Logging/observability | Route templates in ordinary request logs; protected IDs only in necessary restricted audit records. Never include locations, notes, recipient proofs, credentials or signed query strings. No private page/share metadata. |

## 9. Report domain and professional privacy boundaries

Reports remain the separate current `emergency`, `food`, `general` domain; future
sterilization/neutering will be a report type/workflow inside it. No new category,
case system, municipal role, professional verification or messaging is implemented
in 3A, and none is needed for minimal 3B station authorization.

There is no current station FK or typed reference in reports. Public reports can
still contain independently chosen coordinates near a station, identifying text,
photos and current reporter/assignee summaries. Neither `/reports/me` nor claiming
a report creates a private report tier. Station privacy must not be presented as
protection for that existing report information.

Do not auto-prefill sensitive station name, exact location, notes, feeder identity
or image into a public report or place them in report counts, search results or
page metadata. Preserve ordinary independent report creation/navigation, with
truthful Hebrew guidance that reports have their separate current audience.
Users can manually copy data into a public report or external channel; this remains
a real disclosure risk requiring guidance, moderation/takedown policy and later
report-audience work. Station ACL cannot prevent semantic duplication or location
inference from a co-located public incident.

The server-generated disclosure invariant in section 8 does not promise that an
independently authored public report will never contain the same coordinates,
name or pasted reference. Its input/output may retain those user-supplied strings
under the separate current report policy. Ray must enforce the original parent
when resolving a copied stable station-media URL; already copied pixels, cacheable
responses and previously issued S3 capabilities remain outside immediate recall.

Any future explicit station-report association must authorize each domain and each
field independently. Station access never grants private reporter information,
unrelated reports, personal contact data or report-management rights; report
assignment never grants sensitive station access. Current [user schema](../../server/db/schema.ts#L17)
and [Mongo user model](../../server/models/UserModel.ts) have no phone field. Preserve
that absence in station/grant serializers. Future inspector/trapper communications
must use a purpose-approved report/case channel without exposing personal phone
numbers; a professional flag/organization affiliation alone is not authorization.

## 10. Minimal Hebrew-first frontend changes

### REV-01 - authentication intent, accepted session and persistence

Authentication fencing is a mandatory client foundation, **before frontend privacy
acceptance**. The existing [thunk dispatches](../../client/src/features/auth/authThunks.ts#L82)
and [fulfilled reducers](../../client/src/features/auth/authSlice.ts#L49) are not
fenced. Protecting only station responses cannot stop an obsolete login restoring
A after B/logout and launching fresh, correctly authenticated requests as A.

Define one central `sessionGeneration` and one active authentication attempt ID
across **both login and registration**, not independent per-form counters. A new
auth intent invalidates earlier attempts and protected requests immediately;
logout, account switch, same-account reauthentication, current-session 401 and
observed cross-tab session change advance/invalidate that generation as well.
Token equality alone is insufficient, including when reauthentication returns
identical token bytes. While restoring/changing identity, gate protected rendering
and requests; do not silently fall back to the previous account on failure.

Each auth completion must match the current generation **and** active attempt ID
before publishing identity. Remove the duplicate unguarded thunk `setAuth` path,
or make it use the same central acceptance check as fulfilled/rejected reducers.
Fence success and failure effects: identity, token, loading/error state, persistence,
callbacks, progress, navigation and secondary dispatches. An obsolete success must
not navigate through a still-running [Login callback](../../client/src/pages/login/Login.tsx#L36)
or registration callback; an obsolete error must not clear B's loading/identity.
Best-effort abort is useful but never substitutes for acceptance checks.

The current [store](../../client/src/app/store.ts#L26) persists the whole auth
slice. Persist only the intended **committed** auth material, excluding transient
attempt/loading/error/request state. Restored data cannot restore an in-flight
attempt; create a fresh generation, reconcile the current session and revalidate
through authorized server requests before protected data is rendered. Guard queued
persistence writes as well as reducers: an obsolete A write must not recreate A
after logout/B, including after hard reload. Define and test logout/session-marker
ordering with the persistence adapter; removing a storage key once is insufficient.
No station/log/grant/proof/summary/media payload or request error is persisted.

Same-origin storage/BroadcastChannel signals carry only non-secret transition
identifiers, never credentials or private payloads. On a session change, other
tabs invalidate pending auth/actions **first**, hide/purge protected UI, then
reconcile the current shared session snapshot before revalidation. A tab-local
counter alone cannot establish cross-tab ordering: define a shared transition
marker/order, reject delayed/out-of-order signals/writes, and fail closed if the
current session cannot be established. Do not install stale event payloads over
newer storage. Test two tabs, queued writes and reload, not just event callbacks.
This client lifecycle does not revoke copied server JWTs; SEC-011 remains open.

Every protected action captures the accepted actor and generation and uses a
request ID scoped to its operation/target. Check that identity before starting
each request, publishing any success/error and continuing an async action chain.
For example, [station creation](../../client/src/components/createFeedingStation/CreateFeedingStation.tsx#L67)
awaits upload work before dispatching creation; A's old form must not resume and
submit its coordinates/notes under B's newly selected token. Stop obsolete upload,
normalization, read-URL and Blob continuations, callbacks and navigation. Preserve
server-derived ownership and existing media ownership checks regardless of client
fencing. Reuse assigned-report patterns only after closing this auth-intent gap.

### REV-03 - typed, bounded rejection metadata

Normalize API failures into a serializable rejection contract **before** discarding
transport metadata. Current station/log thunks' localized strings are insufficient.
Use a typed local presentation key/message plus machine fields; never compare
Hebrew error text to decide authorization, cleanup or retries. The existing
[assigned-report status handling](../../client/src/features/reports/reportsThunks.ts#L127)
is a starting pattern, not a complete solution for these operations.

| Field | Required contract/bound |
| --- | --- |
| `status` | Optional integer HTTP status 100-599 from the transport response; absent for network/timeout/abort. Do not invent a 401/404 from text or a failed S3 fetch. |
| `kind` | Closed local enum such as unauthorized, unavailable, validation, inactive, throttled, network, timeout, aborted, server, unknown. Derive from transport status and known operation context, not arbitrary backend strings. |
| Presentation | Typed local message key/allowlisted parameters; if retaining a rendered safe message, cap at 300 code points. Optional field feedback has at most eight known field entries with bounded local messages. No raw backend body, stack or reflected credentials. |
| `retryAfterSeconds` | Optional normalized positive integer 1-86,400, using the existing [Retry-After parser](../../client/src/api/retryAfter.ts). Invalid/missing values produce generic wait guidance; never auto-retry. |
| Request metadata | Keep internally generated `requestId`, `sessionGeneration`, captured actor and operation/target identity in trusted thunk metadata, not echoed server data. Opaque request/generation identifiers are bounded to 128 characters; known account/station/media IDs keep their validated forms. Do not add a raw token to errors. |

Do not retain raw Axios/fetch error objects, response/config/headers, request bodies,
signed URLs or credentials in Redux, logging or evidence. Keep successful current
auth material only in its existing intended credential boundary. Normalize retry
and known validation metadata selectively; never persist the rejection payload.

Apply the generation/actor/request check **before any state or error handling**:

| Current operation outcome | State/UX requirement |
| --- | --- |
| 401 on a Ray protected operation | Invalidate current session generation, purge protected data/viewport, stop follow-on requests and prompt reauthentication. A stale A 401 has no effect on B. |
| 404 on station detail/history/summary/feeding | Purge that station and its children, selected/created objects, protected drafts/images and derived map state; show generic unavailable text. Do not reveal hidden existence. |
| 404 on asset or grant-management operation | Remove the unavailable image or management state, then revalidate parent detail/permissions. An unavailable asset or owner-only operation alone does not prove loss of station viewing access. Purge the station if parent access is denied. |
| 400 / authorized inactive 409 | Show bounded validation/inactive feedback; preserve permitted input, disable the inactive feeding action and revalidate if needed. Never fabricate successful persistence. |
| 429 | Preserve the same-session permitted draft and selected files; show bounded wait guidance and explicit retry. No automatic retry or claim that the object is still authorized server-side. |
| Network/timeout/5xx | Preserve the same-session permitted draft, mark displayed status stale/unavailable and offer explicit retry. A saved feeding receipt remains saved if only summary refresh fails. |
| Aborted, obsolete or superseded response | No state, storage, progress, error, navigation or follow-on request effect on the current session. Cleanup its own resources safely without touching B's current resources. |

Preservation on recoverable failure never overrides logout/account-switch or
confirmed station-denial cleanup. Refreshed authorized snapshots replace removed
or redacted data instead of indefinitely merging the old fields back.

### REV-02 - protected state, actual map viewport and overlays

Clear station entities, summaries/history, grant state/input, selected/created
station objects, dialogs, drafts, image URLs/decoded elements and station-linked
focus targets on session changes and confirmed loss of station authorization.
Also reset the actual Leaflet **center, zoom, bounds, fit state and picker state**:
creation coordinates, picker marker/overlays and the one-shot `fitted` ref. The
[current viewport](../../client/src/pages/mapPage/MapPage.tsx#L53) and mounted map
hold mutable state outside Redux; changing the React `center` prop alone is not
cleanup. A removed station must not remain indirectly visible as the map's center.

At the transition, hide/remount the affected map or reset it without pan/fly
animation to neutral default bounds; refit only from the new authorized station/
report snapshot. Do not animate through the old sensitive position. Apply this
to same-account session changes, observed cross-tab invalidation, authoritative
refresh removing a station, and current parent 404/revocation as well as logout.
The neutral fallback must not derive from unauthorized cached entities. Cancel
old map work where possible; already requested tiles/copied pixels cannot be
recalled. Tile providers also receive viewed areas/network identity; include
that existing third-party flow in privacy review without assuming a new proxy.

Actual browser verification is required: inspect Leaflet `getCenter()`/`getBounds()`,
zoom, overlays/picker and subsequent tile requests after A-to-B/guest and denied
refresh, including two tabs. Tab return, back/forward and BFCache restoration
must hide/gate the protected view until session reconciliation/revalidation;
Redux/SSR assertions alone do not prove this. No remote screen-erasure guarantee.

### Hebrew owner/feeder experience after the client foundation

- Keep the existing guest map/report navigation usable. In the station area show
  "כדי לצפות בתחנות האכלה, יש להתחבר או להירשם" with login/registration links;
  do not fetch/show restricted markers, station counts or fitted bounds for guests.
  Wait for auth restoration before deciding the audience or issuing requests.
- Fetch only authorized stations with Bearer. On open, fetch authorized detail,
  summary and own history; do not trust a cached list object as authorization.
  Add typed visibility radios "תחנה רגישה" / "תחנה רגילה" and preselect sensitive
  under the APPROVED default. Explain: "תחנה רגישה גלויה רק לך ולמי שקיבל ממך הרשאת גישה" and
  "תחנה רגילה גלויה לכל משתמש מחובר, כולל המיקום המדויק". Explain that an account
  does not establish trust. These are draft strings for review, not implemented copy.
- Show owner controls only from current `canManage`, with server checks behind
  every action. Grant UX follows section 6; label input/revoke buttons explicitly,
  use `dir='ltr'` for opaque codes and `<bdi>`/`dir='auto'` for account/station text.
  Confirm publishing as regular and revoking access with accurate audience/residual
  URL wording. Do not suggest a grant includes private case data or contact details.
- Use the auth generation, typed failure and complete state/viewport rules above
  for station/list/detail/log/create/summary/grant/media. Scope selectors to the
  accepted actor/session; reuse the [assigned-report state pattern](../../client/src/features/reports/reportsSlice.ts#L211)
  without treating it as proof of authentication-completion safety.
- Revalidate on opening detail, refresh, returning to the tab and account/token
  transition. A revoked viewer's next server operation fails; a refreshed list
  removes the station and closes its stale dialog. No live push/polling removal
  feature or guaranteed remote screen erasure is claimed. Back/forward and browser
  restored-page state must trigger session-scoped revalidation before sensitive UI.
- There is no current station page route. Direct API access is covered now. If 3B
  adds a station deep link, load detail independently under auth, handle 401 and
  hidden/missing 404 without list fallback, and keep names/coordinates out of public
  metadata. Do not invent a deep-link route merely for this design milestone.
- Preserve RTL/logical CSS, existing mobile navigation/map usability, dialog Escape
  and focus return, visible focus, labelled controls, loading/status/error live
  regions, touch usability and mixed-language text. Include a keyboard location
  selection path: current [picker](../../client/src/components/createFeedingStation/StationLocationPicker.tsx)
  uses map clicks, so a labelled "use map center" action is a focused candidate.
  Test critical actions at 320px/390px and zoom/reflow; do not claim full accessibility
  from source/SSR checks or redesign unrelated pages.

## 11. Compatibility and legacy server decision

This is an intentional privacy/API change to the historical public-read contract,
not an adapter-only migration. Preserve ID forms, `{lat,lng}`, food/water semantics,
active behavior after authorization, safe validation envelopes and internal
timestamp/presence/version fidelity. Change exposed field allowlists deliberately:
discovery/detail separate, creator ID removed, own history only with no feeder ID,
and a new shared summary. Update typed client models/consumers and contract fixtures
together. Do not use `any`, dummy timestamps or empty fields to pretend old full DTOs
still apply. Older public-read clients will receive denial and require upgrade.

**APPROVED direction:** do not extend Mongo station handling with a duplicate ACL;
plan explicit safe retirement of its station routes. **PROPOSED mechanics:** fail
closed the legacy station
namespace with an explicit unavailable response (503, no-store), rather than build
a second grant system in Mongo. Normal backend `dev`/`start` currently use Mongo,
so this would make their station/log functionality unavailable until a reviewed
PostgreSQL composition is selected, rather than build a second authorization system.
Keep unrelated legacy auth/no-image report paths and retired upload refusal intact.
The section 4 success matrix describes the supported PG path; proposed legacy
namespace refusal returns 503 in that unsupported mode instead of a partial policy.
Retirement direction is approved, but precise response/namespace/startup behavior,
timing and operational cutover are not approved or executed by that decision.
Finalize those mechanics before their batch; do not reopen the decision by adding
a duplicate Mongo grant system. The default router and actual normal app must have
no public station/history fallback. Unsupported station features return refusal,
never "regular" or a fabricated authorized empty history. Preserve legacy records;
no deletion/import or whole-Mongo retirement is implied. No PG production cutover
or change to unrelated legacy report/auth functionality is authorized here.

## 12. SEC.1B-3B implementation plan

Each batch is independently reviewable and testable. Schema/service/UI batches
may be developed separately, but do not expose the combined system until every
reachable station read/media path enforces the accepted policy. **Never deploy
reachable protected station JSON while public station-media issuance remains
accessible**, even if the UI hides its URLs. Keep the affected routes/assets
unavailable or the local preview stopped until 3B.2, 3B.3 and the actual legacy/
default paths form one complete confidentiality boundary. No older client or
backend may fall back to public station/history/media reads. Public report media
retains its separate current policy; its current audience is not a real-data
privacy approval.

The mandatory frontend dependency is **3B.5 authentication/persistence/error
foundation -> 3B.6 protected client/map/media isolation -> 3B.7 Hebrew UX -> 3B.8
frontend privacy acceptance**. Starting isolated schema/backend work does not waive
this sequence. Backend and client changes remain unexposed until their complete
boundary is verified. The nine product principles in section 14 are APPROVED;
resolve only the listed remaining details before their dependent choices are
implemented. Engineering invariants REV-01 through REV-04 are mandatory, not new
product approval gates. No implementation or deployment is authorized by this task.

| Batch | Small change and likely files | Verification and acceptance |
| --- | --- | --- |
| **3B.0 - approved decisions and remaining contracts** | Use the nine recorded APPROVED principles; specify unresolved principal/DTO/history edges, invitation lifecycle, retirement mechanics, auth-attempt/session generation, typed errors, persistence/cross-tab ordering and viewport cleanup. Do not ask again for approval of sensitive defaults, minimized summaries or summary-only scope. | Review matrices and REV-01 through REV-04 coverage. Auth/client isolation remain mandatory before frontend privacy acceptance; resolve each remaining detail only before its dependent work. No schema/data change in this contract batch. |
| **3B.1 - additive schema/fixtures** | New migration/snapshot/journal, typed visibility/grants in `server/db/schema.ts`; necessary disposable fixtures. Preserve preview seed idempotence. | Fresh DB, old-chain upgrade, replay, FK/check/unique/index behavior and every-old-column comparison in guarded disposable PG. Missing classification fails closed. No preview reset/update. Schema alone is not privacy enforcement. |
| **3B.2 - complete station JSON boundary** | Principal-required station list/detail/create and projections, own-history/summary reads, feeding authorization inside its transaction; both creation schemas/media wrapper. Apply the accepted legacy/default refusal. | Direct guest/regular/owner/grantee/revoked matrix, actor forgery, counts, privacy, independent food/water and inactive/UTC/order behavior; real-PG parent checks/rollback. Keep unexposed until 3B.3 protects media too. |
| **3B.3 - complete station media boundary** | Parent-aware shared helper for content/read-URL, final authorization recheck, offline cache/signing options and accepted external-reference suppression/rejection. | Plain/media-wrapped PG parity, no initial-denial signing, paused-signer/revoke race, copied stable-reference denial, attachment/lifecycle regressions and 60-second/cache assertions with doubles. No live S3 requirement; 3B.2/3B.3 enable together only after verification. |
| **3B.4 - owner visibility and explicit grants** | Owner-only visibility PATCH, self-only recipient reference, station grant list/add/revoke and minimal security events using station-first locks. | Wrong owner/self-grant/proof confusion/expiry and generic errors; independent-pool revoke/feed/read/visibility races, idempotence and rollback on real PG. Reuse the complete server boundary; no role/directory expansion. |
| **3B.5 - mandatory authentication/error foundation** | Central login/register intent and session generation; remove/guard thunk `setAuth`, all completion reducers/callbacks/navigation; accepted identity persistence/restore/cross-tab ordering; typed bounded failures. | Both A/B completion orders, late login/register success/error after logout/B, identical-token reauth, queued write/reload and cross-tab ordering. No obsolete identity or follow-on request; typed 401/404/429/network cases. No PG schema change needed for this client boundary. |
| **3B.6 - mandatory protected client/map/media isolation** | Depends on 3B.5. Fence station/log/grant/summary/media and multi-step actions; replace snapshots; purge components/drafts/images and actual map center/zoom/bounds/fit/picker. Authenticated read resolution then credential-free Blob loading. | Deferred upload/read/blob and A-to-B continuations start no stale requests; error scoping/draft retention, URL disposal, two-tab/BFCache and real Leaflet viewport checks. No frontend privacy acceptance before these pass. |
| **3B.7 - Hebrew owner/feeder UX** | Depends on 3B.5/3B.6. Implement APPROVED audience/default/grant/summary principles and no-note-edit scope; finalize draft Hebrew wording, reference lifecycle feedback and exact history/freshness details. Typed i18n only. | Actual keyboard/reader/mobile/RTL, generic denied/loading/retry and successful saved-receipt behavior on browser/API/disposable PG with labelled media doubles; no claim of live S3 coverage. |
| **3B.8 - integration and privacy acceptance** | After all preceding dependencies, run affected suites, full authorization/REV regression matrix and actual browser/PG evidence; review stopped-preview upgrade/forward recovery separately before any authorized cutover. | Preserve preview rows/media; verify all routes/issuers and old-client denial together. Recovery remains fail closed, never old public reads. Record dates/tiers and open real-user blockers; no production/cloud/Git action is authorized by this document. |

**Readiness for the first implementation batch:** PD-01 through PD-09 remove the
previous product-principle gate. 3B.0 can now finalize the bounded technical
contracts using these approved inputs; 3B.1 can then implement the additive schema/
policy foundation and disposable migration tests. Invitation reuse, exact history
fields and retirement execution are resolved before their own dependent batches,
not treated as reasons to reapprove defaults or reset preview data. No application
implementation is performed or authorized by this documentation-only task.

## 13. Focused test and browser verification plan

**All tests below are planned, NOT_TESTED in 3A.** Use meaningful existing harnesses,
real guarded disposable PostgreSQL for SQL/transaction boundaries, and mocked S3
for normal regression tests. Never run ordinary checks against preserved preview
data or ambient cloud credentials. Follow existing runbooks/guards rather than
duplicating setup/cleanup procedures here. No new test framework is needed.

### Required cases

| Boundary | Assertions for 3B |
| --- | --- |
| Authentication/direct access | Guests and missing/invalid/expired/deleted identities cannot list/detail/history/summary/feed/manage stations. Missing versus hidden authenticated station gives identical 404. Direct API and any future client deep link work without map preloading. Malformed-ID 400 follows auth. |
| REV-01 auth lifecycle | Overlap login A/login B, login/register and register/login in both completion orders; delayed success/error after logout, new intent, current 401 and cross-tab B/logout. Assert accepted identity, loading/error, persisted snapshot and navigation stay B/guest; no obsolete A protected request. Include same-account reauth with identical token bytes, queued persistence write/hard reload, reordered cross-tab signals and auth restoration. |
| REV-01 action chains | Pause upload/completion/creation, read-URL issuance and Blob fetch; switch actor or invalidate session, then resume. No obsolete POST/read/callback/progress/navigation under the new actor. Existing attachment ownership checks remain tested, never bypassed. |
| REV-03 typed failures | Assert bounded status/kind/presentation/retry metadata and request/session/actor identity for list/detail/history/summary/feed/grant/media. Current Ray 401 purges; parent 404 purges that station; asset/management 404 revalidates parent; 429/network/5xx preserves only same-session permitted drafts. Stale errors and aborts have no current-session effects. Hebrew copy changes cannot change cleanup behavior. |
| Regular audience | A different authenticated account can discover/detail exact coordinates, get allowed image/summary and feed an active regular station. Creator linkage, grant list and other-user feeding history/notes remain absent. Guest remains denied. |
| Sensitive audience | Creator and active grantee see/read/feed; ordinary other user, revoked user and forged grantor cannot. Hidden stations absent from result set, counts/search/bounds and summaries. Writing a previous feeding/report assignment does not grant access. |
| Management/creation | Body owner/creator/grantor/role injection cannot assign authority. Missing visibility follows accepted secure default; explicit regular works; invalid/null/unknown classification rejected/denied. Only creator changes visibility/grants. General edit/delete absent. |
| Grant proof/enumeration | Self-only mint; no target user input/directory; wrong signature/purpose/login token, expiry, absent recipient all safe generic failures; valid proof adds only intended recipient. A proof never authenticates or self-authorizes. Owner listing reveals no email/phone; absent revoke idempotent without account lookup. |
| Feeding DTOs | Exact details limited to own entries; shared summary has only recency buckets; no other feeder names/IDs/notes/event counts/timestamps. Independent food/water recency, neither flag, no-record, old/future/backdated timestamps; own-history sorting and Jerusalem display remain correct. Successful food/water actions refresh only appropriate shared status; summary outage preserves saved receipt, stale views require refresh. |
| Revocation/concurrency | Independent PG pools: duplicate grants, grant-vs-revoke, revoke-vs-feed/read/image final check, regular-to-sensitive, rollback and retry. Observe actual lock blocking with bounded `pg_stat_activity` queries, not sleeps alone. Operations admitted after revoke commit fail; pre-revoke authorized work is ordered explicitly. |
| Images/direct content | Guest regular/sensitive and authenticated non-grantee sensitive cannot obtain image capability; test known stable URL and UUID. Creator/grantee succeeds; revoked fresh request fails, with no initial-denial signing. Pending/processing/failed/ready-unattached/missing-parent remain unavailable. Public report guest GET still works; invalid supplied credentials give 401, and station-only issuance rejects report parents. Wrong owner/purpose/reuse and transactional attachment rollback unchanged. |
| REV-04 indirect disclosure/media | Assert no server-generated hidden station joins, auto-prefill, thumbnails, fields or metadata in unrelated responses. Independently supplied report text/media may retain copied station strings under its separate policy; a copied stable Ray URL still checks its original parent and denies unauthorized signing. Distinguish a previously issued S3 URL's residual capability lifetime and copied/cached bytes without claiming recall. Asset upload ownership is no bypass; accepted station-host policy makes no unexpected remote loads. |
| Signing/cache | Offline SDK assertions: 60-second expiry, signed response no-store override, no source key exposed. API/redirect/error responses no-store/no-referrer; protected JSON no reusable ETag/304. Controlled signer clock models preissued residual lifetime without live S3 claims. |
| Account isolation | Deferred list/detail/create/log/grant/summary/image A completion after logout/B ignored; stale A error cannot clear B. Same-account reauth also invalidates old generation. Selector/session fencing and component selected/created state clear; refresh replaces rather than merges removed notes/stations. A second tab receives logout/account-change invalidation and cannot retain the first tab's protected view after refresh/restoration. |
| REV-02 actual viewport/overlays | In real browser, fit A's sole sensitive station in a distinct location; transition to B/guest, revoke/reload or restore a tab. Verify actual center/zoom/bounds, fit state, picker coordinates/overlays and station-linked focus targets reset to authorized/default state without animation through A's position. Cover two tabs and subsequent tile requests; do not claim erasure of previously downloaded tiles. |
| Browser storage/media | Only intended auth persistence remains; no station/history/grant/proof/signed URL/blob in storage/cache/logs. Protected media uses Ray auth resolution then credential-free fetch. Object URLs/decoded elements removed on logout/denial; no automatic expiry/retry loop. |
| Modes/integrity/regressions | Plain PG and media-wrapped PG have identical station policy. Actual legacy/default Mongo station paths refuse under the approved retirement direction; a separately selected PG composition must pass the supported policy. No duplicate Mongo ACL alternative. Preserve existing parsing, 429/recovery, auth, assigned isolation, report transitions, geometry/SRID, FK, presence/nulls, timestamp, media budgets/leases/cleanup tests. |

### Existing tests requiring deliberate updates

| Existing file(s) | Current assumptions to replace, preserving meaningful coverage |
| --- | --- |
| [Station contracts](../../server/tests/feedingStations.contract.test.mjs), [feeding contracts](../../server/tests/feedingBoundary.contract.test.mjs), [feeding-log tests](../../server/tests/feedingLog.test.mjs) | Public list/detail/inactive-history and full identity DTO assertions become authenticated audience cases with explicit visibility/grants. Current helpers mount the default Mongo router: move positive policy contracts to an injected supported store/router using real production handlers if legacy is refused, and separately verify actual default/legacy refusal. Keep malformed/uppercase IDs, missing/inactive behavior, ownership forgery, safe errors and internal historical-value fidelity in appropriate contract/adapter tests. |
| [PG feeding](../../server/tests/integration/postgresFeeding.test.mjs) | Public reads and B feeding A's newly created station need explicit regular classification/grant. Update HTTP key allowlists intentionally; retain all old-column upgrade preservation, spatial/FK/transaction/timestamp assertions and add authorization races to existing lock-observation tests. |
| [PG preview](../../server/tests/integration/postgresPreview.test.mjs), [PG reports](../../server/tests/integration/postgresReports.test.mjs) | Guest station/history snapshots and cross-domain fixtures need caller-specific expected station views. Preserve actual stored row counts/seed idempotence and independent report workflows; do not delete preview-like fixture records to pass counts. |
| [PG media, line 55](../../server/tests/integration/postgresMedia.test.mjs#L55) | Anonymous attached station redirect/inactive image assertions become authorized station matrix; public report image policy remains separately tested. Preserve attachment ownership/order/rollback/concurrency/cleanup guards. |
| [Offline media](../../server/tests/media.test.mjs), [abuse routes](../../server/tests/abuseRoutes.test.mjs), [parser survival helper](../../server/tests/helpers/parserSurvival.mjs), [legacy upload tests](../../server/tests/legacyUpload.test.mjs) | Add signing cache options; adapt formerly public station fixtures without bypassing auth or dropping no-side-effect/rate-limit coverage. Exercise actual app ordering and unchanged early upload retirement. |
| [Client station](../../client/tests/feedingStations.test.cjs), [client feeding](../../client/tests/feedingLogs.test.cjs), [preview tests](../../client/tests/preview.test.cjs) | Authenticate reads, use new DTOs/defaults and add session/request/selection fencing. Preserve POST allowlists, legitimate creation/log persistence and auth-only persistence checks. |
| [Auth/persistence fixtures](../../client/tests/assignedReportsPersistence.test.cjs), [auth form/thunk fixtures](../../client/tests/passwordValidation.test.cjs), [assigned isolation](../../client/tests/assignedReports.test.cjs) | Add real auth-thunk/reducer overlapping completion and queued persistence regressions, not only manually dispatched `setAuth` account changes. Assert obsolete navigation/error/identity rejection, current-generation restoration and no protected follow-on requests. Preserve password/raw-value and existing assigned-report isolation assertions. |
| [Client media](../../client/tests/media.test.cjs), [media presentation](../../client/tests/mediaPresentation.test.cjs), [rate-limit UX](../../client/tests/rateLimits.test.cjs), [localization](../../client/tests/localization.test.cjs) | Add protected read/cleanup/no-credential-forwarding assertions, typed Hebrew states and new summary labels. Preserve explicit upload retry, per-token isolation and 429 draft retention. SSR/callback/source fixtures are not browser access/cache evidence. |

Suggested 3B commands from repository root, **not run in 3A**:

```powershell
npm.cmd run build --prefix server
npm.cmd test --prefix server
# Prepare only guarded disposable test-db using the existing PostgreSQL runbook.
npm.cmd run test:postgres --prefix server
npm.cmd run build --prefix client
npm.cmd run build:postgres --prefix client
node --test client/tests/*.test.cjs
# Run existing ESLint against the actual changed frontend files.
```

### Real browser/API verification for 3B

Use task-owned synthetic users A (owner), B (recipient) and C (other account), the
actual Hebrew UI/API and guarded disposable PG; media uses a labelled controlled
storage/fetch double. This is browser/API/PG policy evidence, **not live S3 evidence**.
Do not activate S3 merely to test station grants; reuse the S3 ledger and leave
provider-specific acceptance gaps accurately open.

1. Guest opens map: report navigation still works; station prompt appears; inspect
   actual requests for no guest station data and directly request station endpoints.
2. Under the APPROVED default, A creates a sensitive station,
   verifies reload/own access; C
   sees neither station nor its counts/bounds and direct known IDs fail generically.
3. B obtains their recipient reference; A grants through labelled controls. B
   refreshes, reads image/summary, records water-only and food, and sees own history.
   Verify independent shared-summary refresh, stale label and summary-outage receipt
   preservation. A/C do not see B's individual note/timeline. A can inspect/revoke
   grants; B cannot. Recipient action works when B owns no station.
4. A revokes while B has details open. B refreshes/tries feeding/image refresh:
   denial purges sensitive state with no false success. Explain an already loaded
   image/capability residual rather than claiming remote pixels vanished at commit.
5. A deliberately publishes regular. B/C authenticated access works, guest remains
   denied. Switching back to sensitive retains only owner/active explicit grants;
   revocation did not become a ban on regular access.
6. Logout and switch A/B/C with a dialog/image/history request pending; back/forward,
   hard refresh, same-account reauth and tab return cannot restore stale protected
   state. Inspect storage, cache headers and requests without recording secrets,
   reference codes, private payloads or signed query strings in evidence artifacts.
7. Complete these flows with keyboard Tab/Enter/Escape/focus return and a screen
   reader where available; test 320px/390px/desktop, zoom/reflow, RTL/mixed names,
   clear radio labels, code input, revoke confirmation, loading/unavailable/429/
   outage/retry states and keyboard location choice. Record actual browser/reader,
   CSS emulation versus physical-device scope and failures; do not generalize one
   observed path into full accessibility conformance.
8. Open a second same-origin tab as A. Logout/switch to B in the first tab; verify
   the second tab purges its station/history/image/grant view and revalidates before
   rendering protected state, including tab return/back navigation. This is client
   isolation evidence, not proof of server-side Bearer revocation.
9. Through actual login/register UI, delay A's authentication response, start and
   complete B, then release A; reverse the order and repeat with logout and a
   second-tab session transition. Verify identity, persisted auth after hard reload,
   navigation and all protected requests remain tied to the accepted generation.
   Use controlled local response timing, not fabricated success state. Separately
   exercise late errors and queued persistence with the labelled fixture harness.
10. Fit A's sensitive-only location on the actual Leaflet map. Switch to B/guest
    or revoke and refresh; inspect center, zoom, bounds, fit/picker overlays and new
    tile requests, including the second tab and BFCache/tab return. The map must
    reset without animating through A's old location. Capture only sanitized results.
11. Exercise current 401, parent versus image 404, 429 and offline/5xx separately.
    Verify scoped purge versus draft preservation and saved-receipt handling;
    release stale A failures after B to prove they cannot alter B's view or map.

## 14. Decisions, assumptions and remaining risks

The supplied hybrid audience and professional-phone privacy are established inputs;
the architectural constraints retained in section 2 are accepted design constraints.
The latest product-owner instruction in this conversation, **2026-11-03**, explicitly
approves PD-01 through PD-09 below. This supersedes the previous draft's PROPOSED
status for those principles only. They are **not implemented or runtime-verified**.
Unspecified technical, lifecycle and operating details are separately OPEN/PROPOSED;
do not promote them through association with an approved principle. Responsible
roles remain TBD, not assigned people or application roles.

### APPROVED product decision register

| ID / decision | Status | Exact approved scope |
| --- | --- | --- |
| PD-01 New-station default | APPROVED | New stations are sensitive by default; creators may deliberately publish them as regular. |
| PD-02 Existing-station preservation/classification | APPROVED | Preserve existing stations and protect them as sensitive until explicitly published as regular. No destructive rewrite/reset. |
| PD-03 Hybrid station audience | APPROVED | Guests cannot access stations; authenticated accounts may access regular stations; sensitive access requires creator ownership or an explicit per-station grant. |
| PD-04 Sensitive grant scope | APPROVED | A sensitive-station grant permits viewing and recording feedings, not station administration. |
| PD-05 Shared feeding privacy and author access | APPROVED | Minimized useful coordination summaries; no automatic disclosure of other feeders' identities, precise timestamps or personal notes. Authors retain appropriate access to their own logs. |
| PD-06 Private recipient references | APPROVED | Identify recipients through private, purpose-specific invitation references; no public user directory or email disclosure. |
| PD-07 External station images | APPROVED | Suppress unsupported legacy external station image URLs from protected presentation without destructively rewriting records; reject new arbitrary external station URLs. |
| PD-08 Legacy Mongo station-route direction | APPROVED | Do not extend Mongo stations with a duplicate authorization system; plan explicit safe retirement of legacy station routes. |
| PD-09 Coordination scope | APPROVED | Summary-only ongoing coordination is sufficient for this milestone; station-note editing is out of scope. |

### Remaining details - not approved by PD-01 through PD-09

| Detail | Status | Required resolution / secure current recommendation | Owner role |
| --- | --- | --- | --- |
| Grant invitation lifecycle/reuse | OPEN / PROPOSED | Self-issued 15-minute reference, exact format/display label, forwarding/reuse limits, consent/acceptance, single-use and self-leave are proposals. Distinguish reference expiry from grant revocation: expiry does not remove an existing grant. | Product/privacy, Security, Engineering |
| Grant state across visibility changes | OPEN / PROPOSED | Recommend retaining only active explicit grants when switching sensitive/regular; decide precise lifecycle/regrant semantics. Never infer grants from past viewers/feeders. | Product, Engineering |
| Feeding/DTO detail | OPEN / PROPOSED | Set exact recency buckets, freshness threshold and discovery/detail/author DTO fields. Decide author access after sensitive parent revocation, preserving the approved appropriate-author-access principle without a sensitive-data backdoor. Automatic other-feeder disclosure is not an option under PD-05. | Product/privacy/care coordination, Engineering |
| Regular-station feeding detail | OPEN / PROPOSED | Keeping current authenticated regular feeding through `canFeed` is recommended; PD-04 specifically approves sensitive-grant contribution and does not separately approve every regular viewer's write rights. No extra administration is implied. | Product/care coordination |
| Owner/API surface | OPEN / PROPOSED | Finalize creator-only visibility/grant endpoint and DTO mechanics within accepted ownership constraints. General editing/deletion/transfer stays excluded; PD-09 specifically excludes station-note editing. | Engineering, Product |
| Audit logging/retention | OPEN / PROPOSED | Set event fields, access, durability and durations; latest grant state is not a complete audit ledger. Media/source/backup retention and removal/recovery remain separate release work. | Product/privacy, Operations, Security |
| Cross-tab authentication/session fencing | OPEN implementation specification; mandatory invariant | Define/test generation, shared transition ordering, queued persistence/restore, callbacks/navigation and stale action-chain handling under REV-01/02/03. No new product approval gate; no implementation or runtime evidence yet. Server JWT revocation remains SEC-011. | Engineering, Security |
| Revocation/cached capability limitations | OPEN operational risk disposition | Recheck every newly admitted operation; existing 60-second signed URLs, transfers, old cached responses and copied bytes cannot be recalled immediately. No approval of residual-risk tolerance, a longer expiry or a new proxy is inferred. | Product/privacy, Security, Operations |
| External image/report boundary | OPEN beyond PD-07 | Implement approved station suppression/rejection while preserving strings/objects. Host exceptions, report-media/audience policy, provider consent and retention/takedown remain unapproved; station approval does not change Report authorization. | Product/privacy, Engineering |
| Legacy retirement execution | OPEN / PROPOSED mechanics | Recommend namespace 503/no-store refusal, but finalize exact routes/startup behavior, compatibility timing and stopped-boundary cutover. No duplicate Mongo ACL, record deletion, whole-Mongo removal or production PG deployment. | Engineering, Operations |
| Real-pilot release gates | OPEN; pilot/production blocked | Existing security, password/session, media acceptance, accessibility/welfare, dependency, notice and operating gates remain; product decisions alone close none of their implementation/evidence requirements. | Product/privacy, Engineering, Security, Operations |

Assumptions: current required-auth identity lookup remains available; owner is
immutable; no production station records require classification inference; preserved
preview data is synthetic; no trusted professional authority is available. A later
ownership/account-deletion/retention feature must review restricted FKs and grants
explicitly. Direct database operators remain a separate privileged trust boundary.

Residual risks remain substantial: open account registration enables malicious
regular discovery/scraping; local rate limits are not distributed access control;
authorized users can share sensitive data; coarse recency still reveals activity;
public reports can disclose the same location; photo/text context can identify
people; copied sessions can exercise a valid user's grants. No claim is made that
authentication alone solves animal safety, verifies carers, prevents collusion or
provides emergency monitoring/intervention. Enrollment, moderation, discovery/result
bounds and privacy notices require their own reviewed policy and enforcement.

## 15. Release Quality Gate implications and 3A validation

Apply the [existing gate](../RELEASE_QUALITY_GATE.md), without a new approval service.
This Level A document can be reviewed independently of a real-user launch, which
remains blocked as recorded in [readiness](../RELEASE_READINESS.md).

| Requirement/scope | 3A evidence/status | 3B / release implication |
| --- | --- | --- |
| QG-01/03 authorization/privacy | **VERIFIED - source review:** public current routes/fields, approved audience and proposed matrix documented at HEAD above. **NOT_TESTED:** enforcement of this proposed design. | All object and indirect read/write/media boundaries need actual matrix results; privacy acceptance does not waive an exploitable implementation failure. |
| QG-10/11 credentials/integrity | **VERIFIED - source review:** server-derived actor, existing owner/FKs/media transactions and additive plan. No secret/config files read or credentials resolved. | Real disposable-PG migration preservation/races and safe logs; no ownership assignment from client; preserve media ownership/budgets/leases. |
| QG-02/04/06/09/12 critical Hebrew UX | **NOT_TESTED for proposed UX.** Existing frontend patterns inspected, changes/browser plan only. | Typed i18n, keyboard/reader/mobile, direct request, account switch, failed/revoked/429/retry behavior require actual evidence. |
| REV-01/02/03 client privacy acceptance | **VERIFIED - source review:** obsolete authentication dispatches, lost error status and retained map state identified. **NOT_TESTED:** the specified replacement behavior. | Authentication/persistence fencing, typed errors and complete client/map isolation are mandatory dependencies before frontend privacy acceptance. Real browser/two-tab and deferred-response evidence required; no server-session redesign is claimed. |
| QG-07/08 resource/discovery | **VERIFIED - source review:** unbounded lists and current map/count/metadata exposure identified. No performance/browser/load evidence produced. | Authorized counts/bounds only, no private indexing/share metadata; pagination/distributed abuse/load remain separate open work. |
| QG-13/14/15 dependencies/operations/lifecycle | **NOT_APPLICABLE to execute in documentation-only 3A**; existing unresolved release requirements remain applicable to C/D. | No dependency/cloud change; safe migration recovery, retention/takedown, production credentials/TLS/PG composition, backup/restore, monitoring and S3 acceptance still needed. |
| Documentation quality | Validate source references, local links/line anchors, package commands, UTF-8, whitespace/final newline, accidental credential/capability patterns and single-file scope. Actual final results are reported with handoff. | No application suite solely for prose. Do not label planned or historical evidence as current execution. |

Keep **SEC-006** bcrypt byte semantics, **SEC-011** password/session/logout/recovery
policy, remaining **SEC-013** controller/log errors, **SEC-014** enumeration,
**SEC-003/007** distributed abuse/media budgets and pagination, **SEC-008/009**
remaining report/identity/location audiences, **SEC-010/012** retention/takedown/
external media, **SEC-015** dependencies, **SEC-016** production/recovery controls,
**SEC-017** named S3 acceptance gaps and **SEC-018** coordinate validation explicitly
open. Preserve conditional **SEC-005** legacy report-claim integrity risk if Mongo
serves real reports. Existing SEC.1B-1/2 remediations and their dated evidence remain
valid only for their recorded scope; this document neither reruns nor supersedes them.
Applicable privacy, accessibility, animal-welfare wording, notice/qualified review
and operating BLOCKERs still prevent a real-user pilot/production launch.

### Disposition of the independent critical review

The independent review's verdict was **REVISE BEFORE IMPLEMENTATION**. This revision
addresses its design omissions; it does not replace that verdict with approval or
close an application finding through prose. The subsequent explicit product-owner
instruction approves PD-01 through PD-09, independently of those source findings;
remaining details stay open. REV-01 through REV-04 corrections are preserved in full.

| Finding | Revised design requirement / location | Evidence/status and next acceptance |
| --- | --- | --- |
| REV-01 HIGH | Section 3 source finding; section 10 central auth attempt/session generation, reducer/thunk/persistence/navigation/async-chain fencing; mandatory 3B.5 before 3B.6/7 acceptance; section 13 overlap/logout/cross-tab tests. | Design requirement specified; source defect remains. Implementation, persisted-identity races and browser/account-isolation behavior **NOT_TESTED**. |
| REV-02 MEDIUM | Section 10 actual center/zoom/bounds/fit/picker/overlay/focus cleanup, neutral nonanimated reset and restored-page gating; 3B.6 dependency and section 13 actual browser/multiple-tab checks. | Design requirement specified; source map behavior unchanged. Runtime cleanup/privacy **NOT_TESTED**; Redux tests alone cannot close it. |
| REV-03 MEDIUM | Section 10 typed bounded status/kind/presentation/retry metadata plus trusted request/session identity; current versus stale/scoped failure actions; 3B.5 and section 13 tests. | Contract specified; string-only thunks unchanged. Status-driven purge versus draft preservation **NOT_TESTED**; Hebrew copy never determines authority. |
| REV-04 LOW | Section 8 server-generated projection/embedding/metadata and original-parent resolution invariant; sections 8/9 explicit manual-copy/cache/preissued-S3 residual; section 13 distinct regression cases. | Claim narrowed in this document. No semantic detector or immediate-recall promise; original-parent enforcement remains **NOT_TESTED** until implementation. |

### Reproducible preflight and document validation

Read-only Git commands use the command-scoped ownership exception because Git
originally refused the workspace owner's SID; no global/repository config changed.
The revision additionally uses `--no-optional-locks` for status/HEAD/tracking/index
reads. Baseline and final outputs are compared without staging or a temporary
tracked snapshot:

```powershell
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray status --short
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray branch --show-current
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray rev-parse HEAD
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray status --branch --short
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray rev-list --left-right --count 'HEAD...@{u}'
git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray show --format=fuller --stat --oneline HEAD
```

Document validation uses a read-only local Node script supplied over stdin to
check this file's UTF-8 decoding, relative file targets and `#L` bounds, expected
package-script references, trailing whitespace, final LF and secret/capability
patterns, together with an independent design review. `git diff --check` is
supplemented by `git diff --no-index --check -- NUL
docs/security/station-visibility-design.md` because an untracked file is not
covered by ordinary tracked diff checks. Final `git status`, HEAD, tracking and
index checks establish the one-file scope. No application/browser/PG/provider
verification is represented as executed in 3A. Wait for design review and separate
implementation authorization before SEC.1B-3B; Git writes remain unauthorized.

Product-finalization validation record, **2026-11-03**, local documentation/source tier:

| Executed command/method | Actual result and limit |
| --- | --- |
| `node -` with the read-only PowerShell here-string validator described above | **PASS:** 102 relative file links, 45 source line bounds, four `npm.cmd run` references plus the backend `test` script, 15 required sections, consistent table columns, balanced fences, valid UTF-8 without replacement/NUL characters, no trailing whitespace and final LF. Five selected secret/capability patterns had no match; this is not a repository/history secret audit. |
| `git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check` | **PASS**, exit 0; tracked changes absent. |
| `git -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray -c core.safecrlf=false diff --no-index --check -- NUL docs/security/station-visibility-design.md` | Exit **1**, no whitespace diagnostics: the new file differs from NUL under no-index comparison. The separate Node whitespace/final-LF checks pass; do not report this command as exit 0. |
| Review evidence classification | The initial drafting review's "no blocking defect" assessment was superseded by the independent critical review (REV-01 through REV-04). The corrections remain specified, with no application remediation/runtime claim. The later product-owner instruction explicitly approves PD-01 through PD-09 only; remaining details are open. |
| Read-only approval/invariant text comparison against finalization preflight | **PASS:** exactly nine unique PD-01 through PD-09 rows marked APPROVED; no stale blanket PROPOSED/default-acceptance gate. REV-01/02/03 client requirements, station-first locking/revocation block, protected signed-read controls/residuals and the REV-01 through REV-04 disposition table remain text-identical to the corrected pre-finalization design. |
| Revised design/source review by backend, frontend and media/report reviewers | **PASS for documentation scope:** no remaining blocking design contradiction found; verified REV-01 through REV-04 coverage, retained architecture, separation of approved principles/open details, mandatory client dependencies and safe JSON/media rollout. Review adds no approval beyond the explicit owner instruction, application verification or release clearance. |
| Final read-only status/HEAD/tracking/index check | Only `?? docs/security/station-visibility-design.md`; HEAD unchanged, locally recorded tracking 0/0, index empty. No Git write, database or cloud action. |

Application suites, migration/PG integration, browser/accessibility behavior and
provider verification are **NOT_TESTED in this design milestone**. Their detailed
3B plan and historical evidence are not current execution results.

Reviewed single-file staging command, **shown only, not executed**:

```powershell
git add -- docs/security/station-visibility-design.md
```

Suggested commit message, **not executed**:
`docs: finalize station privacy product decisions`.

Wait for review and explicit Git-write authorization before executing it. This
document does not authorize staging, commit, push, production deployment, preview
migration or cloud operations.
