# SEC.1B-3A - Hybrid feeding-station privacy and authorization design

Date: **2026-11-03, Asia/Jerusalem**. Status: **nine product decisions APPROVED;
engineering design revised after independent critical review; SEC.1B-3B.0
contracts retained; SEC.1B-3B.2 implementation evidence recorded separately**.

**SEC.1B-3B.2 decision update, 2026-11-03:** the product owner additionally
approved authenticated viewing/feeding of active regular stations (no administration),
and the section 16.3 feeding contract: six shared recency buckets, separate
author-only logs, and current parent access for station-scoped own history (404
after sensitive access is revoked; stored logs preserved). C-03/C-04 below record
that scope. The [endpoint implementation report](sec-1b-3b-2-endpoint-privacy.md)
records current enforcement and verification separately. Earlier source inventories,
preflights and NOT_IMPLEMENTED/NOT_TESTED statements in this design describe their
named historical milestones; they are not a current implementation inventory.
Unspecified invitation, retention, client and operating decisions remain open.
Intended release scope: **Release Quality Gate level A, documentation only**.
The recommended next milestone is SEC.1B-3B, implemented in the small batches below.
This document does not clear a real-user pilot or production release.

## 1. Baseline, scope and evidence

**Current SEC.1B-3B.0 preflight, 2026-11-03:** branch `ray-2-postgres`, HEAD
`3c3f212dbc54381e8900c77df41e4170073831ac`
(`docs: finalize station privacy product decisions`). The approved design is
tracked in that commit. The working tree and index were clean; locally recorded
upstream tracking was **0 ahead / 0 behind**, without a fetch. Section 16 adds
implementation contracts after inspecting the current source/schema. All earlier
preflights and executed validation records below are historical **3A** evidence;
their untracked-file status is not the current baseline. The current task still
changes only this file and authorizes no implementation or Git writes.

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
is historical: SEC.1B-2 was committed at the original drafting HEAD above.

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
   section 16.3 feeding fields and access after parent authorization loss were
   additionally approved in SEC.1B-3B.2, as recorded above and in C-03.
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
| Feeding history | [Controller (historical baseline line 57)](../../server/controllers/feedingLogController.ts) read all logs for any existing station, including inactive ones at that baseline. [Serializer](../../server/serializers/feedingLogResponse.ts) exposed feeder `userId`, exact `fedAt`, period, food/water, note, event/station IDs, creation/update times and optional `__v`. It did not populate feeder names/email, but IDs could be joined with named public reports. | Protect history, summaries and their metadata by the same parent policy; minimize identity/routine exposure. |
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
- `canFeed`: `canView` and station active. The sensitive grant's view-and-feed
  scope and authenticated regular-viewer feeding are APPROVED. The latter was
  explicitly approved for SEC.1B-3B.2; it confers no administration.
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

`R` = regular; `S` = sensitive. "Own history" follows the approved section 7/C-03 policy.
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
account from regular-station viewing, its minimized summary or feeding an active
regular station (C-04 APPROVED in SEC.1B-3B.2). To restrict its location audience, the owner must classify
the station as sensitive. A grantee is never automatically a grant manager.

### Endpoint-by-endpoint design

This table summarizes the policy. Section 16 supplies exact proposed input/output,
pagination, lifecycle, error and concurrency contracts without adding product
approval beyond PD-01 through PD-09.

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
| B: coarse food/water recency plus caller's own detailed entries | Supports avoiding repeated care while retaining personal receipts/history | **APPROVED:** minimized shared summary and appropriate author access, with no automatic other-person identity/timeline/note disclosure. Section 16.3 bucket widths, author feeding DTO and parent-access-required post-revocation semantics additionally approved in SEC.1B-3B.2; client usability still requires verification. |
| C: exact latest food/water time, no identity/history | More precise immediate coordination | **Not approved for 3B** as an automatic disclosure; changing PD-05 would require a separate explicit decision. Still enables live routine inference. |
| D: detailed shared care-team history for sensitive stations | Could support a deliberately trusted team | **Not approved for 3B**; any future detailed audience/permission/notice needs separate review. An approved care grant does not include automatic feeder identity/history disclosure. |

For B, new summary DTO is `{food:{recency},water:{recency}}`, with approved
server-computed buckets `under-2h`, `2-to-6h`, `6-to-12h`, `12-to-24h`, `older`,
`no-record`. These bucket widths are approved coordination disclosure, not a
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

APPROVED in SEC.1B-3B.2: after sensitive access is revoked, even
the revoked feeder's old station-specific history is unavailable there (404).
Keep stored logs; no new redacted export is included in this milestone.
Do not let an own-history link
become a backdoor to sensitive coordinates/notes; future account exports need a
separate redaction decision. Future personal-data access/deletion processes remain
a separate release-readiness requirement; parent revocation does not implement
or waive them. Keep records rather than destructively deleting them.

Update the current "I Fed Here" flow to show the shared summary and clearly label
"ההיסטוריה שלי בתחנה". Preserve food/water/period/note submission and Jerusalem
display of own exact instants. Explain that the note is private to its author
under this baseline; shared care instructions belong in owner station notes.
Those shared notes are **initial, creation-only instructions**: current routes
have no station-note edit operation and general editing remains outside 3B.
Summary-only ongoing coordination is now **APPROVED** for this milestone, and
station-note editing is explicitly out of scope. Here "summary-only" means no
shared individual-feeder timeline; it does not remove appropriate author access
to their own logs. Section 16.3 author feeding DTO/access semantics are approved by C-03. Any later owner-
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
"No recorded feeding" means no qualifying food/water feeding was recorded in Ray;
it must never imply an animal was not fed. This meaning was explicitly reaffirmed
by the product owner with the section 16.3 approval. "Older" is not
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

Section 16.6 specifies the shared coordinator, admission/commit ordering and
retained-credential storage contract. Its guarantees require cooperating clients
and working shared storage: a failed durable logout write cannot guarantee a
future reload tombstone or immediate erasure in another tab. Fail closed locally,
report reconciliation failure and retain SEC-011; do not claim unconditional
cross-tab or server-session revocation through this mechanism.

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

**Readiness for the first implementation batch:** section 16 now specifies the
3B.0 contract targets and the executable 3B.1 schema/policy-foundation batch.
PD-01 through PD-09 are unchanged. The additive schema and disposable tests are
ready for implementation review; lifecycle/history proposals need a recorded
resolution before their dependent behavior is implemented. These details do not
require reapproval of defaults or a preview reset. No application implementation
is performed or authorized by this documentation-only task.

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
status for those principles only. Approval itself is **not implementation or
runtime verification**; current endpoint evidence is linked above.
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

Section 16 selects concrete **PROPOSED** targets for these open details, rather
than silently accepting them. Its decision ledger identifies the dependent batch;
the APPROVED register above is unchanged.

| Detail | Status | Required resolution / secure current recommendation | Owner role |
| --- | --- | --- | --- |
| Grant invitation lifecycle/reuse | OPEN / PROPOSED | Self-issued 15-minute reference, exact format/display label, forwarding/reuse limits, consent/acceptance, single-use and self-leave are proposals. Distinguish reference expiry from grant revocation: expiry does not remove an existing grant. | Product/privacy, Security, Engineering |
| Grant state across visibility changes | OPEN / PROPOSED | Recommend retaining only active explicit grants when switching sensitive/regular; decide precise lifecycle/regrant semantics. Never infer grants from past viewers/feeders. | Product, Engineering |
| Feeding/DTO detail | APPROVED feeding contract; remaining client mechanics PROPOSED | SEC.1B-3B.2 approves section 16.3 shared buckets and author-only feeding DTOs, with parent-access-required station history and preserved rows after revocation. Client freshness presentation and discovery/detail implementation mechanics are not product approvals by implication. Automatic other-feeder disclosure remains excluded by PD-05. | Product/privacy/care coordination, Engineering |
| Regular-station feeding detail | APPROVED | SEC.1B-3B.2 explicitly permits every authenticated account to view/feed active regular stations. Sensitive feeding remains creator/active-grantee only. Creator-only administration is unchanged. | Product/care coordination |
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

### Historical 3A preflight and document validation

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

Historical 3A product-finalization record, **2026-11-03**, local documentation/source tier:

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

Historical 3A suggested commit message:
`docs: finalize station privacy product decisions` (now the current committed baseline).

Wait for review and explicit Git-write authorization before executing it. This
document does not authorize staging, commit, push, production deployment, preview
migration or cloud operations.

## 16. SEC.1B-3B.0 implementation contracts

### 16.1 Status, evidence and common boundary

Contract baseline: **2026-11-03**, HEAD
`3c3f212dbc54381e8900c77df41e4170073831ac`, local source/document inspection.
This appendix makes the implementation target concrete; it does not describe
running functionality. **PD-01 through PD-09 remain APPROVED exactly as registered
in section 14.** Newly selected behavioral details below remain **PROPOSED**
except the C-03 feeding contract and C-04 regular feeding explicitly approved
subsequently in SEC.1B-3B.2.
Engineering authorization/isolation invariants remain mandatory. A proposed
mechanism is reviewable implementation guidance, not product-owner approval or
runtime evidence. Resolve the ledger in 16.10 before its affected behavior ships.

Sections 4-13 remain the policy/risk overview; this appendix refines their proposed
mechanics (including paging versus complete snapshots). It never overrides the
approved register or weakens an accepted authorization/isolation invariant.

The current implementation has no visibility/grant schema, summary/grant/reference
routes or session-validation route. Its public station reads and actor-free media
issuer remain source findings. Existing migrations end at `0006_media_assets.sql`.
Relevant boundaries are the [station router](../../server/routes/feedingStationRoutes.ts),
[station handlers](../../server/controllers/feedingStationController.ts),
[log handlers](../../server/controllers/feedingLogController.ts),
[PG station store](../../server/feedingStations/postgresFeedingStationStore.ts),
[PG log store](../../server/feedingLogs/postgresFeedingLogStore.ts),
[schema](../../server/db/schema.ts), [preview composition](../../server/preview/app.ts),
[legacy composition](../../server/app.ts) and [media service](../../server/media/service.ts).

All paths below have prefix `/api`. The principal comes only from required auth's
verified, currently existing account and server-resolved internal UUID. Public
station/user/log IDs remain canonical lowercase 24-hex; existing uppercase input
normalization remains. Asset IDs remain UUIDs. Never accept an actor, creator,
grantor, company, professional role or municipal claim from request data.
Assignment, feeding authorship and upload ownership are not station access grants.

Set `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer` before
station/reference/grant/media-read authentication, validation and error handling.
Disable conditional 304/ETag responses for these protected representations and
redirects, including unknown station children. These headers do not erase old
caches. Keep report-media audience checks separate. Route-template logs must omit
credentials, references, signed URLs, coordinates and free text. Existing global
parser/ingress/rate-limit failures may precede auth; tests must distinguish those
from object-policy failures, without leaking an object through either path.

### 16.2 Storage, query and locking contract

Append migration **0007**, subject to rechecking the journal before implementation:

- Add `visibility text NOT NULL DEFAULT 'sensitive'` and a two-value CHECK to
  `feeding_stations`. Use the constant ADD COLUMN default, no blanket row UPDATE.
  Leave all prior columns, identity, timestamps, geometry/SRID, owners, references
  and media strings unchanged. New grants start empty. No ownership backfill.
- Add `station_access_grants` with non-null `station_id`, `user_id`, `granted_by`
  UUID restricted FKs, primary key `(station_id,user_id)`, non-null `granted_at`
  timestamptz and nullable `revoked_at`. CHECK recipient differs from grantor;
  CHECK revocation is null or at/after grant time. Add the active recipient index
  from section 5. Do not add a reference/invitation table for the minimal proposal.
- Keep immutable `created_by` as sole owner. The application verifies owner equals
  grantor; FKs do not establish that relationship. No transfer, delete, station-note
  edit or general station PATCH route. Optional discovery indexes require query
  evidence, not speculative duplication of existing indexes.

Shared policy helper takes a required principal and the transaction client. Its
classification guard covers **every** audience branch:

```text
valid visibility AND (regular OR creator = actor OR active explicit grant to actor)
canManage = valid visibility AND creator = actor
canFeed = canView AND active                 [regular-viewer writes: APPROVED in 3B.2]
```

Missing/unknown classification fails closed even for an owner. Listing adds active
and applies this predicate in SQL before order/limit/cursors or spatial/count
derivation. No hidden totals or placeholder rows. Discovery may use one SQL
snapshot; a later fresh request must reauthorize. Detail, own history, summary and
grant lists materialize their complete projection within a short transaction:
resolve/lock the station by public ID **without a pre-wait grant predicate**,
`FOR SHARE`, then in a fresh READ COMMITTED statement reread policy/grant state.
Do not reuse a snapshot evaluated before a lock wait.

Every visibility/grant mutation locks station `FOR UPDATE`, checks current owner,
then resolves/locks any grant/recipient and changes state. Feeding uses station
`FOR SHARE`, fresh policy, active check and INSERT on the **same transaction client**.
Keep station-to-grant lock order throughout. Recipient FK/unique races are resolved
inside that transaction. Any failure rolls back both policy/feeding and associated
attachment work. No external HTTP, signing or image processing while holding locks.

Post-lock grant/reference time uses a fresh clock (`clock_timestamp()` or a fresh
server instant), not transaction-start `now()` after a wait. Duplicate active grant
returns the existing row without rewriting attribution/time; regrant updates that
one revoked row with current owner/new grant time and clears revocation. Revoke of
absent/already-revoked recipient is 204 with no rewrite. For a backward clock step,
stamp `GREATEST(granted_at, clock_timestamp())` to preserve the CHECK. Self-grants
fail generic validation. A repeated visibility value is a no-op. Visibility changes
preserve grant states; neither regular viewers nor historical feeders become
grantees. Revoking a grant on a regular station cannot remove regular access.

Do not turn authorization failures into infrastructure errors. The existing
[feeding error wrapper](../../server/feedingLogs/feedingPersistenceErrors.ts)
preserves only known missing/inactive errors, and the media wrapper preserves
`MediaError`. Map hidden/missing parent to the same safe missing error, or extend
their explicit safe error union. Plain and media-wrapped handlers must emit the
same denial; a database outage remains a bounded 500/503, never an empty authorized
list or an existence-dependent denial. No unrestricted store fallback is permitted.

### 16.3 Exact proposed DTOs, inputs and bounds

**Field allowlists**, not serializations of whole database/user records. The
feeding summary/author-log contract and author-access edge are **APPROVED by C-03
in SEC.1B-3B.2**; other DTO and engineering mechanics remain PROPOSED:

```ts
type Visibility = "sensitive" | "regular";
type PublicId = string; // canonical lowercase 24-hex, never internal UUID
type Permissions = { canManage: boolean; canFeed: boolean };
type StationDiscovery = {
  _id: PublicId; name: string; location: { lat: number; lng: number };
  estimatedCats: number; estimatedKittens: number;
  visibility: Visibility; permissions: Permissions;
};
type StationDetail = StationDiscovery & {
  active: boolean; notes?: string | null; image?: string;
};
type Recency = "under-2h" | "2-to-6h" | "6-to-12h" |
  "12-to-24h" | "older" | "no-record";
type FeedingSummary = { food: { recency: Recency }; water: { recency: Recency } };
type OwnFeedingLog = {
  _id: PublicId; stationId: PublicId; fedAt: string; food: boolean; water: boolean;
  period?: "morning" | "noon" | "evening" | null; note?: string | null;
  createdAt: string; updatedAt: string;
};
type Grant = { recipientId: PublicId; displayLabel: string | null; grantedAt: string };
type RecipientReference = { recipientReference: string; expiresAt: string };
type ReadUrl = { url: string; expiresIn: 60 };
```

Date strings are UTC ISO instants. Nullable/absent historical own-log period/note
and detail notes follow existing presence flags; do not fabricate defaults or
destructively normalize stored history. New writes use validated existing types.
`image` is omitted unless derived from a ready authoritative attached asset; its
value is the trusted stable application content URL. No raw stored external URL,
S3 key or signed capability in a station DTO. Discovery omits notes/images/times.
Detail omits creator ID/contact, creation/update times and `__v`. No DTO embeds a
user, grant list, feeding event or internal media row by spreading a record.

| Viewer | Station/detail | Shared feeding response | Individual history |
| --- | --- | --- | --- |
| Authenticated regular viewer | Discovery/detail if allowed; canManage false unless creator | `FeedingSummary` only | Own logs only, subject to parent access |
| Sensitive active grantee | Same DTO; canManage false, canFeed true only while active | Exactly the same summary | Own logs only, subject to parent access |
| Creator | Same DTO; canManage true; owner grant endpoint separate | Exactly the same summary; no extra feeder details | Own logs only; ownership does not expose other authors |
| Author without current sensitive access | No station DTO or shared summary | 404 | **APPROVED by C-03:** station-scoped own-history endpoint also 404; rows preserved, no new export/recovery endpoint in this milestone |

Use one captured post-lock instant T for independent `MAX(fed_at)` where food=true
and water=true and `fed_at <= T`. Bucket ages in `[0,2h)`, `[2h,6h)`, `[6h,12h)`,
`[12h,24h)`, `[24h,infinity)`, or no matching record. Water-only advances water only;
neither flag advances neither. Retain valid future events in own history but
exclude them from shared recency until eligible. Do not change existing accepted
feeding time semantics implicitly. Return no exact time, `asOf`, count, identity,
event ID, period, personal note or nested recent event in a summary. Coarse activity
remains a disclosed residual risk, not anonymity proof.

The product owner's approval explicitly excludes feeder identities, exact
individual timestamps and private notes from shared buckets. `no-record` refers
only to Ray's qualifying recorded history, not whether cats were actually fed.
The approved station-scoped own-history 404 preserves records after revocation;
future personal-data access/deletion processes remain separate release requirements.

Summary freshness is **PROPOSED** 60 seconds of monotonic elapsed time from local
receipt, stored in memory; restored/tab-return summaries are always stale.
On expiry or tab/dialog return mark refresh-needed and allow explicit fresh GET;
do not infer exact feeding times or silently retry writes. A successful feeding
receipt remains saved if summary refresh fails. Ambiguous POST failure needs a
fresh authorized own-history check; there is no new idempotency-key contract.

| Input name | Exact proposed request contract |
| --- | --- |
| Create station | Existing `name`, `location`, nonnegative integer counts, optional bounded `notes`; add optional two-value `visibility`, default sensitive. Preserve current trim/bounds/count defaults. Validate finite latitude -90..90 and longitude -180..180 at API boundary. Both plain and media creation schemas must match. Unknown actor/grant/role keys are stripped as today and never used. Explicit arbitrary `image` URL is rejected, even if a legacy string remains in storage. Optional `imageAssetId` UUID is allowed only by enabled media wrapper; disabled mode rejects it with bounded 503, never silently drops it. |
| Create feeding | Existing strict schema: optional offset-aware ISO `fedAt`, period enum, boolean food/water and bounded trimmed note; omitted defaults retain current store behavior. Actor/path station derived by server. Unknown keys rejected, including user/station IDs. No new requirement for food=true or water=true. |
| Change visibility | Strict object with only `visibility`, value sensitive or regular; no null/omission. |
| Mint / read URL / complete | Strict empty object `{}`; no target user, parent override, TTL, bucket or object key. Preserve existing completion output and lifecycle. |
| Create grant | Strict `{recipientReference: string}`; bounded at 1024 ASCII characters, exact reference grammar below. No user/email lookup input. |
| List query | Only optional `limit` positive decimal integer and `after` canonical public ID. Reject unknown query fields, invalid/oversized limit and invalid cursor with safe 400. No total, free-text user search or hidden-inclusive counts. |

Preserve array response bodies rather than introduce wrappers. **PROPOSED bounded
paging:** station list default 100/max 200; own logs and owner grants default 50/max
100. Use `X-Next-Cursor` only when another authorized row exists, expose that header
through application CORS, and return no total. Cursor is the last returned public
ID, resolved within the same authorized query scope; missing/hidden/out-of-scope
anchors all give the same 400 invalid-cursor error. Never inspect a hidden anchor
to disclose its sort tuple. Station sort is created_at DESC/internal id DESC;
own logs retain fed_at/created_at/internal id DESC; grant sort granted_at DESC/user
internal id DESC. A cursor is a navigation hint, never authority. Concurrent
mutations may require a restart; no snapshot pagination guarantee. Client loads
authorized pages deliberately with an accessible more action, without an unbounded
auto-fetch loop or hidden-inclusive map bounds. This bounds the selected APIs;
distributed abuse/load work remains open. Page-one refresh starts a new collection
epoch and clears its former page chain; more pages append only to that same epoch
with matching cursor/request lineage, replacing each returned row wholesale.
Never treat absence from a partial page as proof of parent authorization loss.
Clear stale map rows on refresh and independently revalidate selected detail;
only parent 404 or a complete authoritative authorized set establishes exclusion.

### 16.4 Private reference and grant lifecycle

**PROPOSED minimal flow:** no pending invitation, acceptance table or recipient
redemption endpoint. The recipient initiates self-identification, explicitly shares
the reference, and the owner redeems it to create the grant immediately. The
reference itself never opens a station. Deliberate sharing is proposed consent
for any holder who owns a station to grant that recipient view/feed access there,
with the minimum owner-visible label. Explain that scope before generation/copy.
If station-specific acceptance is required, stop this behavioral branch and record
the additional workflow; do not claim that an acceptance screen already exists.

1. Authenticated self-only POST mints `raygr1.<payload>.<signature>` in component
   memory. Payload is base64url (unpadded) UTF-8 JSON with exactly `v:1`,
   `purpose:"station-grant-recipient"`, canonical `recipientId`, integer UTC-second
   `iat`, `exp=iat+900` and `jti` (16 cryptographically random bytes, unpadded
   base64url). Signature is unpadded base64url of 32-byte HMAC-SHA256 over ASCII
   `raygr1.` concatenated with the encoded payload. Derive its key as
   HMAC-SHA256(PG auth secret, UTF-8 `ray:station-grant-recipient:v1`); never use
   that derived key as the login key. Verify `iat <= currentSeconds < exp` with
   no positive future skew and exactly 900 seconds lifetime. No JWT format/parser,
   `id` claim, email/phone, station, role or authorization claim. Require exact
   base64url round-trip/field allowlist/length bounds and constant-time signature
   comparison. Auth JWT and reference must reject one another in both directions.
2. Store no reference or token hash in PostgreSQL under this stateless proposal.
   Only grant state is durable. Keep reference out of Redux persistence, URLs,
   route history, analytics and logs. Copy/share is intentional; Ray sends no
   message. No public recipient search/validation endpoint is added.
3. Owner POST authenticates and validates station-ID syntax, locks station and
   verifies ownership **before** strict grant-body/reference validation or resolving
   a recipient. Generic transport/body-size limits may run earlier, but a router
   must not run reference schema/grammar validation before the owner check. Verify
   signature/purpose/time and current recipient
   existence inside the operation, including fresh expiry check **after lock wait**.
   Bad syntax, expiry, wrong purpose, deleted recipient and self-grant all yield the
   same safe 400; non-owner/missing station gets identical 404 before these checks.
   A valid reference plus an owner's chosen station is the only recipient lookup.
4. Grant succeeds immediately and returns `Grant`, using existing public user ID
   and **PROPOSED** first-name-only display label, bounded by existing user-name
   limits. A preserved missing/null/blank first name produces null and typed local
   generic-recipient fallback, never an email/phone substitute. Select fields
   explicitly: current identity lookup contains email, so
   never serialize it wholesale. No global name uniqueness or verified identity is
   claimed. Owner sees only active grants; revoke path recipient ID is meaningful
   only after ownership checks, not a public account lookup.
5. Reference expires after 15 minutes and is reusable until expiry for multiple
   owner-selected stations, duplicate grant and regrant. New mint does not cancel
   old references; there is no individual reference revocation or single-use
   guarantee. Closing the dialog/clearing local memory cannot revoke a copied
   reference. Existing grant persists after reference expiry until owner revokes;
   revoke does not invalidate the still-unexpired reference, which could regrant.
   Make this visible in copy. Self-leave/recipient rejection is not in this proposal.

Owner grant mutations use the existing verified-account write budget; no public
proof-check endpoint. Invalid references do not distinguish account existence.
Use generic denial bodies and preserve bounded errors. Never log the reference.
Latest-state attribution is not audit history. Proposed security events record
action, server actor/station/recipient IDs, time/outcome only; durability, access,
retention durations and removal remain OPEN before real users. Do not introduce
an unreviewed audit retention promise to complete this contract.

### 16.5 Protected media and endpoint matrix

Resolve the authoritative ready asset and its `station_id` FK, then the actual
parent station, never an image string or caller-provided parent ID. Both stable
content GET and signed-read POST call the same station policy. Initial denial
makes **zero signer calls**. Sign outside a long SQL transaction; then take a
short station shared lock, reread current policy and the same ready attachment,
and release the response only if both still match. A signed result rejected at
this final check is discarded without disclosure. An owner of the upload has no
read bypass after parent authorization is lost. Pending/unattached/deleted assets
are not public readable even to their uploader.

Existing nominal signed GET lifetime is **60 seconds**
([constant](../../server/media/types.ts), [signer](../../server/media/s3.ts)).
Add an internal signing receipt/expiry check so a long final lock wait cannot
release an already-expired URL. `expiresIn:60` describes nominal signing lifetime,
not a fresh 60 seconds after delivery. Discard expired results and require a fresh
currently authorized attempt; do not extend TTL automatically. API metadata,
read-url JSON and redirect use private/no-store/no-referrer with no 304. For new
signed GETs set S3 response-cache-control override to `private, no-store` so retained
objects also receive it; current output metadata uses private max-age=60 and is
not retroactively rewritten in this task. Test signing options locally without
AWS. Current storage adapter returns only a string: expiry receipt is proposed
implementation work, not an existing capability.

Authorized detail may expose only the derived stable application URL. Copying
that URL or embedding it through another server-generated projection cannot
bypass original-parent authorization. The protected client obtains read-url JSON
with its current Bearer, fetches signed bytes with `credentials: omit`, no Ray
Authorization/referrer, and displays an in-memory Blob URL. Dispose both capability
and Blob on context loss. Never put Bearer into an image URL or forward it to S3.
Extract the asset UUID only from a URL matching the configured API origin and
exact `/api/media/{UUID}/content` path, with no userinfo/query/hash. Construct the
read-url request against that trusted API base; never request a stored external
origin with credentials. The existing generic image component requires adaptation.
An anonymous browser img GET of a station stable URL receives 404; supplying a
bad credential receives 401 before asset resolution. Report content retains its
separate audience; the station-only POST refuses report-parent assets with 404.

Completion metadata `{assetId,state,expiresAt}` stays owner-authenticated; it is
not general metadata access to another attached station. No new general asset
metadata GET is added. Preserve upload/complete owner, purpose, expiry, checksum,
processing lease, retry and quota controls and atomic station-create attachment.
For E14 preserve the existing strict upload input exactly: `purpose` station/report,
`contentType` JPEG/PNG/WebP, integer `byteLength` 1..8388608 and canonical 44-character
base64 SHA-256 `checksum`. Upload 201 is `{assetId,state:"pending",expiresAt,url,
headers,uploadExpiresAt,expiresIn:300}`; headers are the existing signer-required
PUT headers and dates are ISO strings. Completion 200 is
`{assetId,state:"ready",expiresAt}`. These capabilities stay in the scoped form's
memory, not Redux/meta/errors. No source/output keys or parent/owner rows returned.
Carry new principal/visibility through the media creation wrapper; another user's
asset cannot be attached by a grantee or owner. Suppress legacy external `image`
strings from protected DTOs without altering stored strings or retained objects;
reject new arbitrary external station URLs in both plain/media modes. No arbitrary
URL fetch, re-upload or destructive cleanup is implied. Report external-image
policy remains independent and unresolved for real-data use.

**REV-04 boundary:** the enforceable indirect-information invariant covers
server-generated responses, references/embeddings and new access checks against
the original parent. It cannot prevent an authorized person manually copying
coordinates, text or pixels into a public report, sharing a screenshot, retaining
cached bytes or using a previously issued capability. Previously signed URLs and
in-flight transfers may work through their remaining lifetime after revocation;
neither cache headers nor removing DOM nodes can promise immediate recall. No
semantic detector, proxy revocation or new Report policy is asserted.

In the following matrix `A` means required valid existing-account authentication;
`O` means strict optional identity (missing allowed for report content, supplied
invalid credential 401). All DTO/input/lifecycle choices refer to 16.2-16.4 and
remain **PROPOSED** where not expressly approved by PD-01 through PD-09.

Error contract (fixed safe bodies, status-driven **local error kinds**, not a new
localized wire protocol): preserve required-auth `{error: ...}` 401; station
missing/hidden/not-owner all `{message: "Feeding station not found"}` 404; media
missing/unready/unattached/wrong-parent/denied all `{message: "Image not found"}`
404. New grant reference failures use `{message: "Invalid access reference"}` 400.
Existing validation `{message,errors}` envelopes remain bounded field feedback,
not raw database/provider errors. No distinction in headers/body for hidden versus
missing resources; do not promise constant-time execution. Same-caller malformed
ID 400 is syntax validation, not evidence of existence.

| Matrix shorthand (not a wire error code) | HTTP status / normalized client kind | Rule |
| --- | --- | --- |
| AUTH | 401 / unauthorized | Required or supplied-invalid auth; guest station JSON is denied before object lookup. |
| VALID | 400 (existing bounded media 413/415/422 where applicable) / validation | Invalid input/ID/cursor; never recipient-existence-specific. |
| PARENT | 404 / unavailable | Same station body for hidden/missing/non-owner; only current parent-operation denial proves loss of parent access. |
| IMAGE | 404 / unavailable | Same image body, including report asset on station-only POST; scope is image, not automatically station. |
| INACTIVE | 409 / inactive | Only after canView and valid feeding input; no feed INSERT. |
| MEDIA | 403 / forbidden; 404 / unavailable; 409 or 410 / validation | Existing upload-owner denial, missing asset, processing/lease/state conflict or expired intent. These are not parent-station denial or inactive-feed signals. Keep current bounded messages; preserve authorized draft and offer the appropriate explicit retry/reselection. |
| RATE | 429 / throttled | Existing limiter/media budget; bounded Retry-After 1..86400 seconds, no automatic write retry. |
| FAIL | 500/503 / server | Safe persistence/service failure; never return success/empty list as a substitute. |
| RETIRED | 503 / server | Fixed legacy station refusal; no fallback or lookup. |

RATE and FAIL are possible across applicable routes. The client distinguishes
network/timeout/aborted with **no invented HTTP status**. A surprise 403 normalizes
to forbidden, scoped to the operation; neither Hebrew nor backend message text
decides authority. Existing auth/controller envelopes need not be unnecessarily
replaced; typed client normalization provides the machine decision boundary.

The current required-auth middleware catches identity-store errors together with
JWT failures. Before these contracts are enforced, separate invalid/expired
credential or missing account (401) from identity-lookup infrastructure failure
(bounded 500/503). Test that an outage neither discloses a resource nor triggers
false session invalidation. Apply the same distinction in strict optional auth;
no silent anonymous fallback on supplied-invalid auth or lookup outage.

| ID / method and route | Auth / object authorization | Input | Success shape | Errors | Side effects / concurrency | Required later regression evidence |
| --- | --- | --- | --- | --- | --- | --- |
| E01 `GET /feeding-stations` | A; SQL active AND canView | Bounded list query | 200 `StationDiscovery[]`, optional next header | AUTH, VALID, RATE, FAIL | No writes; filter before paging/order/spatial output, one snapshot | V1: guest/cross-account matrix; hidden rows do not alter visible page/bounds; default-sensitive fixtures; plain/media composition parity |
| E02 `GET /feeding-stations/:id` | A; canView including inactive | Normalized ID; no extra query | 200 `StationDetail` | AUTH, VALID, PARENT, RATE, FAIL | Shared lock then fresh policy/projection | V1/V2: direct request, identical hidden/missing, revoked after lock wait, no identity/history/external-image fields |
| E03 `POST /feeding-stations` | A; actor becomes immutable creator | Create input, optional owned ready asset | 201 `StationDetail` | AUTH, VALID, bounded media errors, RATE, FAIL | Atomic create/attach; sensitive unless deliberately regular; media wrapper cannot drop actor/classification | V1/V3: forged owner/grants stripped, both schemas/defaults/coordinates/external URL rejection, foreign asset denial and rollback |
| E04 `GET /feeding-stations/:stationId/feedings` | A; canView AND log.user=actor | Station ID, bounded list query | 200 `OwnFeedingLog[]`, optional next header | AUTH, VALID, PARENT, RATE, FAIL | Shared parent lock/fresh policy and author-filtered SQL; no other-author events | V1/V4: creator has no other-author privilege; old values/presence/order retained, revoke denial, cursor scoped to actor |
| E05 `GET /feeding-stations/:stationId/feeding-summary` | A; canView | Station ID, no query | 200 `FeedingSummary` | AUTH, VALID, PARENT, RATE, FAIL | Shared parent lock; one T, independent food/water aggregates | V4: exact bucket boundaries, future/neither/water-only cases, no identity/time/note/count/event fields for any viewer |
| E06 `POST /feeding-stations/:stationId/feedings` | A; canView then active; regular writes C-04 APPROVED | Existing strict feeding input | 201 `OwnFeedingLog` | AUTH, VALID, PARENT, INACTIVE, RATE, FAIL | Existing shared station transaction, fresh policy, server actor/path and INSERT; no new idempotency guarantee | V1/V2/V4: independent-pool revoke/feed/visibility race, no denied insertion, inactive concealment, UTC/defaults/own receipt |
| E07 `PATCH /feeding-stations/:id/visibility` | A; creator only | Strict visibility | 200 `StationDetail` | AUTH, VALID, PARENT, RATE, FAIL | Station exclusive lock then owner; no-op keeps timestamps; grants preserved, no implicit grants | V2/V5: non-owner/grantee denied, concurrent feed/read ordered, repeat no rewrite, sensitive/regular transitions |
| E08 `GET /feeding-stations/:id/access-grants` | A; creator only | ID and bounded list query | 200 active `Grant[]`, optional next header | AUTH, VALID, PARENT, RATE, FAIL | Shared station lock then owner; explicit minimal recipient projection | V5: owner-only, no email/contact/user spread, no revoked rows/global lookup; bounded cursor behavior |
| E09 `POST /feeding-stations/:id/access-grants` | A; creator only before reference resolution | Strict recipient reference | 200 active `Grant` for new/duplicate/reactivated | AUTH, VALID, PARENT, RATE, FAIL | Exclusive station lock; post-wait proof expiry/recipient check; duplicate no rewrite, regrant same row | V2/V5: wrong owner first, token confusion, expiry while waiting, deleted/self recipient generic, duplicate/regrant concurrent ordering |
| E10 `DELETE /feeding-stations/:id/access-grants/:recipientId` | A; creator only | Two IDs, no body | 204 empty for revoked/absent grant | AUTH, VALID, PARENT, RATE, FAIL | Exclusive station lock, idempotent latest-state revoke; no recipient existence oracle | V2/V5: grantee cannot administer, absent/repeated revoke no rewrite, feed/read/sign races; regular access caveat |
| E11 `POST /station-access/recipient-reference` | A; self only | Strict `{}` | 201 `RecipientReference` | AUTH, VALID, RATE, FAIL | Random signed proof; no DB grant/invitation write, no station authorization; owner E09 is redemption, no recipient-accept route | V5: exact grammar/purpose/TTL, no user lookup input, both token-confusion directions, no persisted/logged reference |
| E12 `POST /media/:assetId/read-url` | A; ready attached station parent canView | UUID + strict `{}` | 200 `ReadUrl` | AUTH, VALID, IMAGE, RATE, FAIL | Initial auth before signing; final shared-lock recheck; expired signed result discarded | V3: initial denial zero signer calls, report asset denied, uploader no bypass, paused signer/revoke/lock wait, nominal 60s/options |
| E13 `GET /media/:assetId/content` | O; station canView required; independent current Report policy | UUID; accept/ignore bounded legacy `retry=1` query, no authority meaning; reject other query fields | 302 to signed URL only after relevant parent policy | Supplied-invalid AUTH; VALID; station guest/denial IMAGE; RATE, FAIL | Same final station authorization as E12; no anonymous station redirect or 304 | V3: guest/cross-account copied stable URL, valid/invalid supplied auth, unknown/unready parity; current report-image retry preserved independently |
| E14 `POST /media/uploads`; `POST /media/:assetId/complete` | A; existing upload owner/purpose/state rules | Exact existing upload schema above; UUID + strict `{}` on complete | Exact existing upload 201 / ready metadata 200 above | AUTH, VALID, MEDIA, RATE, FAIL | Existing issuance, processing leases and attachment safeguards; no read/admin grant from completion | V3: current media lifecycle/quotas/leases/foreign asset tests retained; no network under station lock; stale client stages rejected |
| E15 `GET /media/capabilities` | Current non-object capability policy | No body | Existing `{enabled:boolean,maxBytes:8388608,stationImages:1,reportImages:3}` | Existing bounded failure | No station/asset/identity metadata; disabled mode fails closed for media writes | V3: enabled/disabled compositions; no hidden object lookup or fallback |
| E16 `GET /auth/session` (new proposal) | A; self identity only | No query/body | 200 `{user:{id:PublicId}}` | AUTH, RATE, FAIL | Read-only identity validation for envelope restore; no refresh/token issuance or profile freshness claim | V6: wrong/deleted/expired token 401; restored actor mismatch purges; valid ID matches verified server principal |
| E17 all methods `/feeding-stations` and descendants; `/station-access` and descendants in legacy/default station mode | Explicit refusal before any station/user lookup | Ignored; no authority interpretation | No success, fixed 503 | RETIRED only after earlier global transport/CORS handling | No Mongo station/log reads/writes, no invitation/signing; namespace denial, not ACL duplication | V7: direct default export AND real legacy composition, unknown child/method/auth state all refused; unrelated auth/report/health preserved |
| E18 `POST /auth/login` | Existing credential validation, no station authority | Existing bounded email/password schema | Existing 200 auth response described below | Existing 400 / validation for invalid credentials or body; RATE; 500 / server | No station/grant write; client shared attempt coordinator alone accepts completion | V6: both login/register overlap orders, logout/B before completion, identical-token return, no stale persistence/navigation |
| E19 `POST /auth/register` | Existing registration validation, no station authority | Existing name/email/password/company schema | Existing 201 auth response described below | Existing 400 / validation (including current duplicate-account behavior); RATE; 500 / server | Existing account creation can finish even when client attempt becomes obsolete; no automatic deletion or implied station access | V6: obsolete registration cannot publish identity/continue station action; report server-side account side effect accurately |

Preserve E18/E19 wire response exactly as
[auth serializer](../../server/serializers/authResponse.ts): `{user:{id,firstName?,
lastName?,email?,company?},token}` with historical nullable profile fields.
Merge token into the intended envelope only after acceptance; do not put passwords
in thunk args/meta. Preserve [current validation](../../server/validation/authSchemas.ts)
without claiming that the existing password-byte/session/enumeration release
findings are resolved. Auth body failures use the current `{msg:...}` or bounded
validation envelope, mapped by status/context rather than literal text.

Every applicable E01-E19 object denial/error also needs no-store/no-referrer/no-304
assertions, bounded output and no raw secrets/capabilities in logs/errors. There is
no POST acceptance, public invitation lookup, general station edit/delete, other
feeder history or implicit privileged-role endpoint. A later route must join this
matrix before becoming reachable.

### 16.6 REV-01/03: auth coordinator and typed client failures

**PROPOSED technical mechanism, mandatory isolation result:** one same-origin
Web Locks exclusive lock `ray.auth.v1` plus one atomic localStorage auth-envelope
key; remove auth from the ordinary redux-persist writer. Store only committed
credentials and intended profile display hints in authenticated envelopes, never
transient requests/errors or protected entities. Example exact envelope states:

```ts
type SharedAuth = {
  schema: 1; epoch: string; revision: number;
} & (
  { phase: "signedOut" } |
  { phase: "transitioning"; attemptId: string } |
  { phase: "authenticated"; attemptId: string;
    user: { id: string; token: string; firstName?: string | null;
      lastName?: string | null; email?: string | null; company?: string | null } }
);
type Scope = {
  epoch: string; sharedRevision: number; localIncarnation: string;
  localFence: number; actorId: string;
};
```

`epoch` is a random UUID for a newly initialized envelope; `revision` is a
nonnegative safe integer incremented for **every** durable begin/terminal/logout
transition. Initial absence may create a signed-out envelope with a fresh epoch
under the lock; it never restores credentials or reuses an old epoch/revision.
This prevents deletion/reinitialization from matching old requests. Corrupt/unknown
schema, overflow, failed storage or unavailable Web Locks fails closed; do not
silently reset/recover an authenticated envelope or fall back to a tab counter.
Initialization/recovery always purges local work. A scope includes fresh random
local incarnation on bootstrap/restoration/BFCache reentry, so a previous page's
effects cannot match even if it sees the same committed credentials.
Keep id/token strict; bound/sanitize optional display hints with existing field
limits and local fallbacks. Historical absent/null names/email/company cannot
invalidate an otherwise valid authenticated identity or become policy inputs.

1. Every local login/register/logout/account-switch intent synchronously increments
   localFence and hides/purges protected UI **before the first await**. Login and
   register share one attempt namespace. Generate one fresh attempt ID (RTK
   request ID is sufficient); a queued begin rechecks localFence before writing,
   so an older same-tab intent cannot supersede a newer one while awaiting lock.
2. Under the exclusive lock, reread/validate the envelope. Begin login/register
   writes revision+1, transitioning and attempt ID, with **no previous credentials**.
   Remember this begin revision/epoch/attempt/fence; release the lock for HTTP.
   The previous session is not restored if auth fails or the page crashes here.
3. Completion reacquires lock and checks exact epoch/beginRevision/attempt,
   transitioning phase and local incarnation/fence. On mismatch discard success,
   error, loading/finally effects and callbacks. On match atomically persist
   revision+1 authenticated (validated result) or signedOut (failure). Only after
   that durable write succeeds publish accepted Redux auth **synchronously while
   still holding the lock**. No unguarded thunk `setAuth` or fulfilled reducer path.
4. Return a trusted accepted receipt containing terminal phase/revision/epoch and
   local attempt/incarnation/fence. Form `.unwrap()` alone does not authorize
   navigation: auth navigation/error/finally uses `runIfAuthResultCurrent` against
   that exact receipt. It checks current terminal revision/phase and local intent,
   including signedOut for a current failed login; it never permits protected
   data work. Logout writes signedOut
   at a new revision under the lock. Current-session 401 uses compare-and-set of
   its captured authenticated epoch/revision/actor; it cannot sign out a newer B.
5. Every protected request admission and result/error publication uses a short
   `runIfProtectedCurrent(scope, synchronousEffect)` lock check against ready local
   session and shared authenticated
   epoch/revision/actor plus local incarnation/fence. Start the request inside
   that guarded synchronous effect, release lock immediately and await outside it;
   reenter the guard to publish. Never hold a lock across HTTP/Blob/hash/signing.
   Async upload -> completion -> create, and read-url -> byte fetch -> Blob decode
   recheck at **each stage**, keeping the captured actor/token; never acquire B's
   latest token to continue A's payload. Redux reducers additionally reject
   mismatching trusted scope/request IDs; raw action payloads cannot install auth.
6. Storage/BroadcastChannel signals contain only schema/epoch/revision/transition
   identifiers. Upon observing a change, purge/hide first, then reread under lock;
   never install credentials from event payloads or decrement revision. Guard
   requests and publications by rereading even if a storage event is delayed.
   A delayed signal may cause a safe extra reconciliation, not resurrection.
7. Ignore legacy `persist:root` credentials entirely; remove that old auth material
   under coordinator control, without reading a fallback token. Stop auth's old
   persist writer. A delayed old writer to that key cannot affect the new key.
   **PROPOSED compatibility cost:** one-time sign-in for old persisted clients.
   Restore only a validated authenticated envelope and establish a fresh local
   restoration-candidate scope. A narrow `runIfRestoreCandidateCurrent` checks its
   epoch/revision/actor/incarnation/fence under lock and admits **only E16**, while
   UI and all other protected requests stay gated. Recheck the candidate and E16
   verified actor before publishing ready. A current 401/identity mismatch clears
   the candidate by CAS; 429/network/5xx stays restoring/gated with explicit retry.
   Compare its
   verified user ID; persisted names/company remain display hints, not freshly
   verified authorization. No auth/session endpoint exists today. Selectors must
   gate unknown/restoring/transitioning states, not merely test token presence.

These guarantees cover cooperating same-origin clients on the new build. Old
open tabs must close/reload at the stopped upgrade boundary. Operations admitted
before a later transition may finish server-side with their valid copied JWT;
client results are then discarded. Delayed cross-tab events cannot instantly erase
a remote screen. A failed durable logout write cannot guarantee another tab's
logout or future reload tombstone; fail closed in the active context, surface
reconciliation failure, and do not report durable/global logout success. Copied
JWT/server revocation, unsupported-browser policy and storage-failure recovery
remain explicit SEC-011/pilot questions. No unsafe counter-only fallback is accepted.

**Typed rejection contract:** normalize Axios and fetch/media into a serializable
bounded local type; use `rejectWithValue`, not Hebrew strings or raw transport Error.

```ts
type ApiFailure = {
  status?: number; // actual HTTP response only, integer 100..599
  kind: "unauthorized" | "forbidden" | "unavailable" | "validation" |
    "inactive" | "throttled" | "network" | "timeout" | "aborted" | "server" | "unknown";
  messageKey: ErrorMessageKey; // existing/new typed i18n key, never server text
  retryAfterSeconds?: number; // validated integer 1..86400
  fields?: Partial<Record<KnownInputField, ErrorMessageKey>>; // <=8 known fields
};
type RequestIdentity = Scope & {
  requestId: string; operation: ProtectedOperation; targetId?: string;
}; // trusted local thunk metadata, each string bounded at 128 characters
```

Allow only known operation/input/message-key enums and allowlisted scalar
interpolation parameters if a typed message needs them. Discard raw response bodies,
Axios config, headers, URLs, backend stack text and arbitrary validation fields;
no token/reference/coordinates/draft content in error/meta. HTTP status is preserved
when present; status-less timeout/network/abort stays status-less. Parse only bounded
Retry-After using the current helper's 1..86400 range. All handling first checks
scope **and operation request identity**; stale success and stale failure have
zero state/navigation/draft effects.

RTK `createAsyncThunk` puts its argument into `action.meta.arg`: a safe custom
metadata type alone does not remove sensitive inputs. Put auth credentials,
coordinates/notes, reference and upload/form inputs in a private operation context
keyed by an opaque request/context ID; dispatched thunk args/meta contain only
that bounded ID, safe target IDs and trusted scope. Clean context on current/stale
completion/cancel and session loss. Inspect pending/fulfilled/rejected action
metadata in tests. Intended accepted auth state/envelope remains a credential
boundary; no password/reference/draft or arbitrary response enters generic metadata,
logs or DevTools. Do not claim secrecy by merely sanitizing after dispatch.

| Current accepted failure | Required action |
| --- | --- |
| Ray protected 401 | Coordinator CAS invalidation, hide/purge all protected entities/forms/files/map/media, then sign-in feedback; stale 401 cannot clear B. |
| Parent station detail/history/summary/feeding 404 | Purge that station and children/draft/overlays; neutral map remount. Revalidate discovery. Never keep a forbidden location because a local entity exists. |
| Image/read-url or management 403/404 | Purge that image/management state and revalidate parent through an authorized endpoint; it is not itself proof of parent denial. |
| S3 byte-fetch 403/404 | Dispose expired/failed capability, keep permitted form/parent; explicit fresh read-url request through current scope. Never interpret S3 status as Ray-session 401. |
| Validation 400/413/415/422 or authorized inactive 409 | Bounded typed feedback, preserve same-scope permitted draft; disable inactive feed action. No fabricated saved receipt. |
| 429, network, timeout, 5xx | Preserve same-scope draft/files and already-confirmed feeding receipt, mark unavailable/stale, bounded retry hint and explicit retry; no automatic POST replay. |
| Abort/obsolete scope or request | No error/cleanup/navigation in newer context. Abort is best effort, not the acceptance fence. |

### 16.7 REV-02: entity, draft, media and Leaflet isolation

Use complete allowlisted **row** replacement, not merges retaining fields the
server removed. Page-one refresh replaces the collection epoch; more appends only
under the current page/cursor lineage as in 16.3, with whole-row replacement.
Off-page absence is not revocation. Each operation/target has its own request fence as well as session
scope. A successful create/feed invalidates an earlier in-flight list/own-history
snapshot, may immediately upsert its accepted detail/own receipt, then fetches a
new authoritative snapshot. Fresh collection refresh drops the former page chain,
and current parent denial or a complete authorized set removes excluded entities
and children; a single bounded page does not prove exclusion. This preserves confirmed
receipts without allowing `createdDuringFetch` or log merge logic to resurrect
removed/redacted records. No station/grant/log/reference/summary/media persistence.
Assigned report data joins the common session fence without changing Report policy.

On any session transition/current 401, purge station lists/details, own logs,
summaries, grant lists, reference input/output, selection, upload caches, Files,
previews, signed URLs and Blob URLs. Unmount decoded image nodes and revoke URLs;
abort pending stages. Clear dialogs, picker coordinates/bounds/marker, focus targets
and station-owned drafts. Never transfer a draft to another actor. On parent access
loss do the same for that parent; during a current 429/outage preserve draft/files
only within the still-accepted scope, gate stale protected display and revalidate
before using it. Previously copied pixels remain outside recall guarantees.

Key the protected map subtree by accepted session scope plus `authorizationViewEpoch`.
On session loss, current parent 404 or an authoritative snapshot removing a displayed
station, hide/unmount it before the next protected paint, increment view epoch and
remount at the **PROPOSED** fixed neutral center lat 32.0853/lng 34.7818, zoom 13.
Reset center, zoom, actual bounds, fit-once flag, fit inputs, selected marker,
popups/tooltips, picker state, overlays, cluster state and pending focus/fit tasks.
Fit only fresh authorized coordinates once; no animation through the previous
sensitive viewport. Report layers continue under their own policy and cannot be
used to preserve station-derived map bounds. Do not assume replacing React marker
arrays resets Leaflet's actual viewport or earlier tile requests.

On pagehide/hidden, gate and purge protected presentation; quarantine permitted
draft/files locally with their shared epoch/revision/actor, cancel old continuations
and do not render them. On pageshow/BFCache/focus/visibility return, reconcile with
a fresh local incarnation and authorized server snapshots before restoring map/details.
Rebind quarantined drafts only after proving the **same shared epoch/revision/actor**
and current parent authorization; never rebind old request identities. Any auth
intent/actor/revision change or parent denial purges them. Real-browser evidence must inspect actual
Leaflet center/zoom/bounds/fit and overlays, sensitive tile requests, keyboard focus,
Blob disposal, two cooperating tabs, delayed signals and BFCache/tab return.
Redux/SSR tests alone cannot establish this. Previously requested tiles/cache
cannot be recalled, and no storage event implies immediate remote screen erasure.

### 16.8 Explicit legacy refusal and confidentiality cutover

Replace the default Mongo-bound station router export with a refusal router, and
make actual `createLegacyApp` mount the same refusal for `/api/feeding-stations`
and **every descendant/method**, plus `/api/station-access` and descendants. Use
fixed 503 `{message: "Station service unavailable"}`, private/no-store/no-referrer,
no retry-to-public fallback, no station/log/user lookup and no Mongo ACL. Mount
after existing CORS/Helmet and before ingress/body parsers/domain auth/storage, as
existing retired-upload handling does. Earlier CORS preflight/transport handling may answer without domain
execution; it must not reach a station handler. Test unknown nested paths too.
Do not leave the old default export usable by an incidental import/test composition.

Supported PostgreSQL composition must explicitly inject principal-aware handlers,
both plain and media-wrapped. Switch positive station contract tests away from
the default Mongo helper to real supported handlers with an injected policy store;
keep separate historical Mongo adapter/serialization fidelity tests and explicit
actual-legacy refusal tests. Do not delete local Mongo records, change unrelated
report/auth/health routes, or imply the entire legacy app is safely retired.

Safe local sequence is additive development behind an unavailable/stopped station
boundary, followed by joint JSON/media/legacy-path integration. Schema installation
alone never protects an old backend. No preview migration/start or deployment is
authorized here. A later authorized persistent-preview upgrade uses the existing
runbooks inside a stopped boundary, verifies the appended journal and preserved
rows/assets, and enables only the complete privacy-aware build after local tests.
Close/reload older clients first. If any boundary fails, keep affected station
JSON/assets unavailable or stop the local preview; retain PostgreSQL/media data
and diagnose/forward-fix. Never roll back to old public routes, drop the grants
table, reset seeds/owners or delete/rekey/reupload media as a privacy recovery.

### 16.9 Executable batches and review evidence

Every test/command in this subsection is **PLANNED / NOT_RUN in SEC.1B-3B.0**.
Use the [guarded disposable-PG setup](../migrations/postgres-local-foundation.md),
[preview runbook](../migrations/postgres-preview.md) and
[media evidence ledger](../migrations/s3-media.md), rather than duplicate their
operating procedures. Local media doubles prove application decisions/signing
options, not live S3/IAM/CORS. Ordinary checks must not contact persistent preview
or cloud. Review actual package scripts before execution; client tests use Node's
test runner, not an invented package test script.

| Batch / exact scope | Likely files (new files explicitly proposed) | Acceptance and required tests/evidence | Compatibility / recovery boundary |
| --- | --- | --- | --- |
| **3B.1 Schema and policy foundation** | `server/db/schema.ts`; new `server/db/migrations/0007_station_visibility.sql` and generated snapshot/journal entry; proposed principal/policy types under `server/feedingStations`; `server/tests/integration/database.mjs`, `server/tests/integration/postgresFeeding.test.mjs`, proposed PG policy tests | Disposable fresh install, 0000-0006 upgrade and replay; CHECK/FK/PK/index tests; every-old-column/media/journal comparison; missing classification denies all branches. Shared policy signature requires principal/transaction; no new reachable route. Reviewer receives exact generated diff, test commands/results, preservation comparisons and guard/refusal results. | Additive only, no old migration/hash edits, seed replay or preview operation. Schema does not protect old handlers. Keep station boundary stopped/unavailable. Forward-fix with a new reviewed migration, never destructive down migration or public-backend rollback. |
| **3B.2 Protected station/feeding JSON + legacy refusal** | `server/routes/feedingStationRoutes.ts`; station/log controllers, stores/interfaces and serializers; both `server/validation/feedingStationSchemas.ts` and `server/media/validation.ts`; `server/feedingLogs/feedingPersistenceErrors.ts`; required/optional auth middleware error classification; `server/app.ts`, `server/preview/app.ts`; station/log contract helpers/tests and PG feeding tests | E01-E06, E17 and V1/V2/V4/V7: required auth, all audience branches, all exact allowlists and paging, bucket edge cases, own-history filtering, safe errors/headers, no denied INSERT, station-first races on independent PG pools, default AND real legacy refusal. Use SQL fixture grants only within disposable tests until 3B.4. Reviewer receives route wiring inventory and plain/media parity evidence. | Own-history projection/privacy field removals are intentional; old anonymous/full-history assertions become audience tests, historical adapter fidelity remains. No external exposure until 3B.3 is complete. Never substitute empty success on policy/persistence failure. |
| **3B.3 Protected station media** | `server/media/service.ts`, `routes.ts`, `types.ts`, `s3.ts`, media store/wrappers; shared station policy; `server/preview/app.ts`; media contract/unit/PG integration tests; station image projection schemas | E12-E15/V3: actual PG authoritative parent, both issuers, no initial-denial signer calls, paused signer/final-lock revoke races, expiry receipt/cache override assertions with doubles, uploader no bypass, external suppression/rejection, create/attach rollback and all existing owner/lease/quota protections. Reviewer receives signer-call counts, header options and unchanged report-domain cases. | JSON + media + all default/legacy paths form one confidentiality unit before reachability. No S3 implementation/IAM/config operation now; later source changes tested locally do not prove cloud acceptance. Retained assets/keys/strings untouched; failure keeps station JSON/assets unavailable. |
| **3B.4 Owner visibility and reference/grant management** | Proposed policy/grant store/reference modules and routes under `server/feedingStations`; station serializers/router; `server/preview/app.ts`; account write limiter reuse; proposed grant/reference unit/PG tests | E07-E11/V2/V5: owner-before-recipient checks, exact reference grammar/derived-key rejection both ways, after-lock expiry, generic invalid/deleted/self failures, bounded label/list, no email enumeration, duplicate/regrant/revoke concurrency and rollback; minimal safe event tests. Reviewer gets selected lifecycle decision, same-row/no-rewrite results and independent-pool races. | Resolve reference consent/reuse/label and grant persistence choices in 16.10 first. No invitation table, pending/accept route, messaging, self-leave or directory. Keep unavailable if paired policy incomplete; preserve all rows/media on recovery. |
| **3B.5 Mandatory authentication and typed errors** | Proposed `client/src/features/auth/sessionCoordinator.ts`, `client/src/api/apiFailure.ts`; auth slice/thunks/selectors, store, main, Login/Register; existing report session consumers; `server/routes/authRoutes.ts` for proposed E16 using injected required auth and safe identity-store errors; proposed `client/tests/authSessionIsolation.test.cjs`, existing auth/report persistence/password/media/rate-limit tests | V6: real thunk/reducer/coordinator harness with two independent tab runtimes and controllable lock/storage/signals; both completion orders of login/login, login/register, register/login; delayed success/error/finally/navigation after logout/current401/B; identical-token reauth; stale queued begin/commit, delayed signals, legacy queued writer, reload/crash/epoch reinit/corruption/overflow/no-lock/storage-failure cases. Verify E16 and all status-less/401/404/429 distinctions. Reviewer gets interleaving traces and exact guarantee limits. | Retain committed-envelope credentials only; one-time old-key sign-in proposed. No auth slice redux-persist writer or local-counter fallback. Client isolation does not revoke server JWT. Failed durable logout is not reported as globally durable success. Mandatory before 3B.6/7/8 privacy acceptance. |
| **3B.6 Mandatory protected state/map/media isolation** | Station/log types/thunks/slices/selectors; proposed summary/grant modules; `client/src/pages/mapPage/MapPage.tsx`; CreateFeedingStation, FeedingStationDetails, StationLocationPicker; `client/src/api/media.ts`, `client/src/components/media/Media.tsx`; affected report session consumers; existing station/log/media presentation tests | After 3B.5: trusted scope/request metadata, authoritative replacement with mutation/read fencing, parent-vs-asset failure cleanup, draft/receipt preservation, deferred upload/complete/create/read-url/blob stages, URL disposal. Actual two-tab/Leaflet/BFCache/browser evidence required for viewport/overlay/focus reset; synthetic harness alone insufficient. Reviewer receives state/field absence assertions plus sanitized actual browser results. | No protected entities/drafts/files/capabilities persisted or transferred between actors. Neutral reset before paint, fresh authorized fit. If browser boundary fails, keep protected station UI unavailable; do not restore old public fetching/media embedding. |
| **3B.7 Hebrew UX and accessibility** | Existing map/create/detail/media components and styles; typed `client/src/i18n` schema/keys/Hebrew strings; chosen reference/grant/visibility/own-history presentation; focused localization/accessibility tests | After 3B.5/6: deliberate publish, reference consent/reuse explanation, owner-only grant/revoke, private own history, independent food/water summaries, saved receipt plus failed refresh, inactive/401/404/429/offline behavior; keyboard/focus/reader, RTL at actual 320px and 390px, mobile overflow and recovery. Reviewer receives screenshots/sanitized interaction evidence with date/browser/viewport and local/double limitations. | Resolve dependent UI behavior in 16.10. No station-note editing, professional role, messaging or public directory. Untranslated/raw technical status is not user-facing authority feedback. Keep scope within current milestone. |
| **3B.8 Integrated security/PG/browser acceptance** | Affected backend/client suites, actual route compositions and local browser harness/evidence; later documentation updates only when separately scoped | Run full V1-V7 matrix plus all section 13 cases, actual disposable PG races/migration, real-browser two-tab/auth/deferred response/map/media/RTL/a11y flows. Check every reachable issuer/legacy route jointly, no secret evidence, release gate classification and remaining blockers. Independently review read-only; implement confirmed fixes, then rerun affected integration/browser evidence. | Stopped-preview upgrade rehearsal is separate and requires its own operation authorization. Preserve data/assets and restrict access on failure; no public rollback. Test pass is integration evidence, not real-pilot/production or cloud clearance. |

**3B.1 disposable-harness details are part of the batch:** the shared integration
helper's known-object refusal probe must include `station_access_grants`; an
unexpected pre-existing grant table must cause refusal rather than adoption.
Suite-owned cleanup drops the grant table before stations/users, preserving URL,
database-identity, advisory-lock and `ownsObjects` guards. Never add broad CASCADE
or allow cleanup to touch persistent preview. All PG suites using that helper
must still pass. Existing old-chain feeding tests must explicitly separate the
new visibility assertion from comparisons of **all previous fields**, not weaken
the preservation check to selected columns. Add a 0000-0006 -> 0007 fixture with
users/stations/logs/reports and station/report attached media, comparing original
columns/geometry/SRID/FKs/times and old migration hashes/journal before/after/replay.
Seed rerun must skip existing rows and cannot undo revocation or classification.

Planned command families, subject to the changed-file scope and existing scripts:

```powershell
npm.cmd run build --prefix server
npm.cmd run test --prefix server
npm.cmd run test:postgres --prefix server
npm.cmd run build --prefix client
npm.cmd run build:postgres --prefix client
node --test client/tests/*.test.cjs
```

Use existing guarded PG test runner configuration only; do not infer a safe target
from a command name or invent environment credentials. Run the affected server
integration script actually present in its package manifest if its name differs
at implementation time. Add targeted client ESLint against changed files using
the installed local executable. Do not run cloud acceptance as an ordinary test.
Backend build verifies types, not authorization; PG doubles/unit tests cannot
replace real PostgreSQL locks, and DOM/reducer fixtures cannot replace Leaflet or
browser persistence evidence. Full tests are appropriate at 3B.8; earlier batches
use meaningful affected checks before broader integration.

For each implementation batch retain the established sequence: implementation ->
integrated QA -> independent **read-only** review -> confirmed fixes -> affected
revalidation -> explicit Git-write approval. Reviewer evidence includes source
diff, actual commands/exit results, date/HEAD/tree, target tier, sanitized fixtures,
limitations and unresolved findings. Reviewers do not silently patch the batch or
promote planned/double/historical evidence to current runtime verification.
No staging/commit/push/merge/deploy follows automatically from a pass.

### 16.10 Remaining decisions and first-batch readiness

These selected defaults remain **PROPOSED** except the explicit **C-03/C-04
APPROVED** scope recorded below. No other product approval is implied:

| ID / selected target | Remaining resolution / dependent batch |
| --- | --- |
| C-01 Self-issued reference consent | Product/privacy to accept or replace the 15-minute reusable identification reference, deliberate sharing as consent across holder-owned stations, no pending recipient acceptance/self-leave, no individual proof revocation, regrant after owner revoke while proof valid; first-name label. Required before 3B.4/7. PD-06 private references/no-directory stays approved. |
| C-02 Grant lifecycle | Product/Engineering to confirm same-row duplicate/regrant behavior and persistence through regular/sensitive switches; revocation on regular does not remove regular audience access. Required before 3B.4/7. No change to PD-04 scope. |
| C-03 Coordination and author edge | APPROVED in SEC.1B-3B.2 by explicit owner reply: section 16.3 feeding contract, shared six buckets, separate author-only logs, parent-access-required station history (404 after sensitive revocation; stored rows preserved). No new redacted export. Client 60s freshness/presentation and paging mechanics remain engineering proposals requiring validation in 3B.6/7; no unspecified detail is approved. |
| C-04 Regular feeding writes | APPROVED in SEC.1B-3B.2: every authenticated active regular viewer may record feedings; sensitive creator/active-grantee feeding remains PD-04. No administration or professional-role entitlement is added. |
| C-05 Client persistence/compatibility | Engineering/Security to validate Web Locks + atomic envelope/CAS algorithm and supported-browser evidence; one-time legacy-key sign-in and retained credentials are proposed compatibility choices. Storage-failure recovery and remote-screen/server-JWT limits stay explicit. Required before 3B.5/6 acceptance; no new gate to approve the mandatory REV isolation invariant. |
| C-06 API/retirement mechanics | Engineering/Operations to review exact endpoints/projections/paging/headers/error normalization and namespace refusal/cutover; selected conservative implementation targets, not proof of deployment. Legacy direction is PD-08 APPROVED. Required before 3B.2/3/8 reachability. |
| C-07 Audit and retention | Product/privacy/Security/Operations to set event access/durability/duration, media/source/backup retention/removal and incident ownership. Latest-state grant table is not full audit. Unresolved before real users, not a reason to reset schema/data. |
| C-08 Revocation and external/report risk | Product/privacy/Security/Operations disposition of 60-second preissued URLs, caches/manual copies, independent report/external image policy, public report location and operating notices/takedown. No impossible immediate-revocation promise or approval of this risk by implication. Required for real-data release. |
| C-09 Remaining pilot gates | The complete section 15/readiness blockers, named real S3 acceptance gaps, password/session policy, distributed abuse/pagination/load, dependencies, accessibility/welfare/legal/privacy notices, production/backup/recovery and named operations remain OPEN. No real-pilot readiness from this contract. |

**First implementation batch:** 3B.1 is concretely scoped and ready for review and
separate implementation authorization: additive classification/grant schema,
principal-aware policy foundation and guarded disposable migration evidence.
PD-01/02/03/04/08 already supply its product constraints. No cloud, preview-data
operation, irreversible ownership repair or remaining reference/UI preference is
needed to prepare that batch. The selected grant schema must still pass engineering
review before edits; do not represent this documentation task as authorization to
start implementation. C-01 through C-06 must be recorded before their dependent
behavior, rather than silently promoted from PROPOSED. Local partial work stays
unavailable. Integrated privacy acceptance requires **3B.2 + 3B.3 + legacy refusal**,
then the full **3B.5 -> 3B.6 -> 3B.7 -> 3B.8** client/evidence chain and applicable
grant work. All source enforcement/browser behavior remains **NOT_IMPLEMENTED /
NOT_TESTED for this design**.

### 16.11 Current documentation validation and handoff

SEC.1B-3B.0 validation is local documentation/source tier only, separate from the
historical 3A table in section 15. Check UTF-8, final newline/whitespace/fences/table
shape, all local links/line bounds and referenced package commands; compare all
nine approved PD rows exactly with the committed baseline and retain REV-01
through REV-04, station-first locks, original-parent media and stopped-cutover
invariants. Scan this document for selected credential/signed-capability patterns.
That scan is bounded document hygiene, not a repository/history secret audit.

Executed contract-finalization record, **2026-11-03**, documentation/source tier:

| Executed command/method | Actual result / limitation |
| --- | --- |
| Read-only `node -` document validator | **PASS:** 119 local file links, 45 source line bounds, nine package-script references; sections 1-16, consistent table columns, balanced fences, UTF-8/no NUL or replacement characters, no trailing whitespace and final LF. Five selected credential/capability patterns had no match. Bounded document scan only. |
| Read-only `node -` baseline/invariant comparison using `git show HEAD:<this file>` | **PASS:** all nine PD rows exact, all four independent-review disposition rows exact, complete sections 5/8/9 text-identical; 19 unique endpoint rows, 11 contract subsections and required coordinator/locking/media markers present. Text comparison is not enforcement proof. |
| Backend, client and grant/media independent read-only source/document reviews | Corrections incorporated: existing denial/capabilities shapes, owner-before-reference validation, scoped pagination, auth-result/restore guards, draft rebinding, RTK metadata isolation, identity-outage distinction, exact reference grammar, report retry compatibility and historical nullable display hints. No remaining blocking contract contradiction reported; no product approval or runtime clearance added. |
| `git --no-optional-locks -c safe.directory=C:/Users/97254/Desktop/projects-2025/ray diff --check` | **PASS**, exit 0. Git's LF-to-CRLF working-copy policy notice is not a whitespace error; no config change made. |
| Read-only branch/HEAD/tracking/status/index checks | `ray-2-postgres`; HEAD `3c3f212dbc54381e8900c77df41e4170073831ac`; locally recorded tracking 0/0 without fetch; index empty; only ` M docs/security/station-visibility-design.md`. No unrelated changes. |

No application test/build, browser, database/provider check or new runtime result
was executed in this contract task. The planned checks above remain NOT_RUN.
No unrelated document/implementation file changed, and no Git write occurred.
Any unrelated change requires stopping and preserving it, never stash/reset/restore.

Reviewed staging command, **shown only; not executed**:

```powershell
git add -- docs/security/station-visibility-design.md
```

Suggested commit message: `docs: finalize station privacy implementation contracts`.
Wait for review and explicit Git-write authorization. No staging, commit, push,
merge, deployment, database or cloud operation is authorized by this document.
