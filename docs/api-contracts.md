# API contracts

Proposed JSON API under `/v1`. Authentication uses a Supabase access token in `Authorization: Bearer <token>`; sign-in/session endpoints are provided by Supabase Auth rather than duplicated here. All examples use symbolic IDs for readability; actual IDs are UUIDs.

## Common behavior

- Validate bodies, path IDs, enumerations, timezone names, and timestamps; reject unknown fields. Limit bodies to 64 KiB, free-text notes/instructions to 4,000 characters, routine items to 100, and page size to 100 (default 25).
- Singular responses: `{ "data": { ... } }`. Collections: `{ "data": [ ... ], "next_cursor": null }`. Opaque cursors preserve stable ordering by `(created_at, id)`; event timelines order by `(occurred_at, id)` descending. Each list may accept `limit` and `cursor`.
- Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "request_id": "uuid", "fields": [{ "path": "symptoms.redness", "message": "Must be an integer from 0 to 4" }] } }`. Omit `fields` when irrelevant; never include internal SQL or another patient's data.
- Status codes: `200` read/action success; `201` synchronous creation; `202` pending report; `204` successful revocation/archive; `400` invalid input; `401` invalid/missing session; `403` visible resource but forbidden operation; `404` missing/inaccessible resource; `409` stale version, duplicate current completion, or consumed invitation; `422` valid shape but unusable formulation/date/selection. Use `429` with `Retry-After` for rate limits.
- IDs, entry timestamps, author identity/kind, verification status, report hashes, and generated filenames are server assigned. Do not accept them as client assertions, except version preconditions and preview approval hashes explicitly described below.
- A timeout does not mean a write failed. No automatic POST retry until idempotency is implemented; callers should refresh state before retrying. Version appends and invitation redemption remain protected by their concurrency rules.
- List/detail endpoints require the permissions matrix. Report and saved-check responses are immutable snapshots; ordinary record responses return current correction leaves unless history is explicitly requested.

## 1. Patient foundation

| Method and path | Input | Result / access |
|---|---|---|
| `GET /me` | None | `200` user ID, display name, clinician status; current actor only |
| `POST /patients` | `{ "display_name": "Demo patient", "timezone": "America/Chicago" }` | `201` `{ id, display_name, timezone, created_at }`; owner derived from session |
| `GET /patients` | Pagination | `200` owned profiles and profiles with active `profile:read` grant |
| `GET /patients/:patientId` | None | `200` same profile fields; owner or `profile:read` |
| `PATCH /patients/:patientId` | Display name and/or timezone | `200` updated profile; owner only. Changes do not alter saved routine timezone/history. |

## 2. Catalog and routines

| Method and path | Input | Result |
|---|---|---|
| `GET /products` | `q` optional, `market` optional, pagination | Product summaries `{ id, brand, name, product_type }` with at least one reviewed formulation |
| `GET /products/:productId/formulations` | `market` optional, pagination | Reviewed formulations `{ id, product_id, version, market, verification_status, verified_at, ingredients_complete }` |
| `GET /formulations/:formulationId` | None | Above plus `label_text`, `ingredients[] { ingredient_id, label_name, position, concentration_value, concentration_unit }`, `sources[] { id, title, url, publisher, retrieved_at, citation_text }`; unknowns are `null` |
| `POST /patients/:patientId/routines` | Initial version body below plus `name` | `201` routine identity and saved version; owner only, creates both atomically |
| `GET /patients/:patientId/routines` | Pagination | Routine summaries `{ id, name, archived_at, current_version_id }`; owner or `routines:read` |
| `GET /patients/:patientId/routines/:routineId/versions` | Pagination | Full versions; owner or `routines:read` |
| `GET /patients/:patientId/routines/:routineId/versions/:versionId` | None | Full saved version; owner or `routines:read` |
| `POST /patients/:patientId/routines/:routineId/versions` | Version body below | `201` full new version; owner only; stale predecessor → `409 STALE_VERSION` |
| `POST /patients/:patientId/routines/:routineId/archive` | Empty body | `204`; owner only; preserves versions |

Initial routine body:

```json
{
  "name": "Daily routine",
  "timezone": "America/Chicago",
  "items": [
    {
      "formulation_id": "formulation_a",
      "slot": "am",
      "position": 1,
      "days_of_week": [1, 2, 3, 4, 5, 6, 7],
      "instructions": null
    }
  ]
}
```

Append body uses `expected_previous_version_id`, `timezone`, and the complete replacement `items` array. An empty array explicitly clears the routine. Require a reviewed formulation ID for each item; confirmation is the patient's explicit choice of that formulation. Return `{ id, name, version: { id, version, previous_version_id, effective_at, timezone, authored_by, items: [{ id, ...submittedItem }] } }` for creates and `{ id, version, previous_version_id, effective_at, timezone, authored_by, items }` for version reads/appends. Initial effective time is server time; later versions use server time while holding the routine lock.

## 3. Progress

Owner-only writes; owner or `progress:read` for reads. Notes additionally require `private_notes:read` for recipients.

| Method and path | Input | Result |
|---|---|---|
| `POST /patients/:patientId/check-ins` | `{ "occurred_at": "2026-11-10T08:00:00-06:00", "symptoms": { "dryness": 2, "redness": 1 }, "notes": "Synthetic example" }` | `201` `{ id, occurred_at, created_at, recorded_by, symptoms, notes, supersedes_id }` |
| `GET /patients/:patientId/check-ins` | `from`, `to` optional, pagination | Current check-ins; redact `notes` by omission when excluded |
| `POST /patients/:patientId/routine-completions` | `{ "routine_id": "routine_a", "routine_version_id": "version_a", "routine_item_id": "item_a", "scheduled_date": "2026-11-10", "status": "completed", "occurred_at": "2026-11-10T08:00:00-06:00" }` | `201` record with IDs, dates, status, `created_at`, `recorded_by`, `supersedes_id`; duplicate current occurrence → `409 COMPLETION_EXISTS` |
| `GET /patients/:patientId/routine-completions` | `from`, `to` optional, pagination | Current completion records; date filtering applies to `occurred_at` |
| `POST /patients/:patientId/product-usage-events` | `{ "formulation_id": "formulation_a", "event_type": "started", "occurred_at": "2026-11-07T08:00:00-06:00" }` | `201` submitted fields plus `id`, `created_at`, `recorded_by`, `supersedes_id` |
| `GET /patients/:patientId/product-usage-events` | `from`, `to` optional, pagination | Current start/stop records |
| `POST /patients/:patientId/check-ins/:recordId/corrections` | Complete replacement check-in fields | `201` successor with `supersedes_id` set server-side |
| `POST /patients/:patientId/routine-completions/:recordId/corrections` | Complete replacement completion fields | `201` successor; corrected date/item validated against schedule |
| `POST /patients/:patientId/product-usage-events/:recordId/corrections` | Complete replacement usage-event fields | `201` successor |

All date filters use `[from, to)` instants; validate `from < to` when both are present. Symptom keys are `dryness`, `redness`, `itching`, `burning`, each an integer 0–4; omit unreported keys. Reject future event times. Correcting an already superseded record returns `409 RECORD_SUPERSEDED` with the current successor ID only when authorized. No update/delete endpoint rewrites historical events.

## 4. Product checks

`POST /patients/:patientId/routine-checks` (owner only):

```json
{
  "routine_version_id": "version_a",
  "treatment_plan_version_id": null
}
```

The treatment version must be explicitly selected or null; do not silently attach a newer plan to an old routine. This response represents the submitted context, and reports must disclose when no treatment plan was supplied.

Return `201`:

```json
{
  "data": {
    "id": "check_a",
    "routine_version_id": "version_a",
    "treatment_plan_version_id": null,
    "engine_version": "1",
    "evaluated_at": "2026-11-10T14:00:00Z",
    "coverage_status": "insufficient_information",
    "evaluated_rules": [{ "id": "rule_a", "version": 2 }],
    "findings": [
      {
        "category": "potential_additive_irritation",
        "review_status": "expert_reviewed",
        "affected_routine_items": ["item_a", "item_b"],
        "explanation": "Illustrative fixture only; actual text comes from reviewed rules.",
        "missing_information": ["concentration"],
        "source_ids": ["source_a"],
        "rule_id": "rule_a",
        "rule_version": 2
      }
    ],
    "missing_information": [
      { "routine_item_id": "item_a", "field": "concentration" }
    ]
  }
}
```

This is a contract fixture, not an approved clinical rule. `coverage_status` is `no_reviewed_rules` when no applicable reviewed rules exist, otherwise `insufficient_information` if any required information is missing, otherwise `evaluated`. An empty findings array never means “safe.”

`GET /patients/:patientId/routine-checks` lists saved result summaries with pagination; `GET /patients/:patientId/routine-checks/:checkId` returns the saved result above. Owner or `product_checks:read`; do not embed raw treatment instructions or private routine notes into a recipient response. Snapshotted internal inputs remain server-side.

## 5. Report preview and export

`POST /patients/:patientId/reports` (owner only):

```json
{
  "period_start": "2026-11-01T00:00:00-06:00",
  "period_end": "2026-11-11T00:00:00-06:00",
  "selected_categories": ["routines", "progress", "product_checks"]
}
```

Return `202` `{ id, generation_status: "pending", period_start, period_end, selected_categories }`. Snapshot selected records transactionally before rendering. Include routine/plan versions overlapping the selected interval, current progress correction leaves whose `occurred_at` falls within it, and saved checks whose `evaluated_at` falls within it. Include start/stop events in range; do not infer an earlier product start from absence of events. Excluded categories must not appear through nested records or summaries. `private_notes` requires `progress` in the selection.

| Method and path | Result / access |
|---|---|
| `GET /patients/:patientId/reports` | Paginated report metadata; owner only |
| `GET /reports/:reportId` | Metadata `{ id, period_start, period_end, selected_categories, generation_status, content_sha256, failure_code }`; owner or active named report-share recipient |
| `GET /reports/:reportId/preview` | `200` `{ report_id, content_sha256, snapshot_schema_version, snapshot }` when ready; `409 REPORT_NOT_READY` while pending; `409 REPORT_GENERATION_FAILED` on failure |
| `GET /reports/:reportId/export` | `200 application/pdf` attachment rendered from the approved snapshot; same access and readiness rules as preview; `Cache-Control: private, no-store` |

Snapshot shape: `{ patient: { display_name }, period_start, period_end, categories: { ... } }`. Only selected category keys exist: `routines: [{ routine_id, name, versions: [...] }]`, `treatment_plans: [{ treatment_plan_id, title, versions: [...] }]`, `progress: { check_ins: [...], routine_completions: [...], product_usage_events: [...] }`, `product_checks: [...]`, `private_notes: [{ check_in_id, notes }]`. Use the field shapes defined above, with check-in notes removed from `progress`. Include only catalog identity/citations needed for selected records. Version lists contain immutable versions effective in the interval, including one effective before the interval if it overlaps it. Renderer must preserve this selection exactly.

## 6. Invitations, grants, and treatment plans

Owner creates an invitation with `POST /patients/:patientId/invitations`:

```json
{
  "recipient_email": "clinician@example.test",
  "expires_at": "2026-11-12T14:00:00Z",
  "grant_expires_at": "2026-12-10T14:00:00Z",
  "scopes": [
    { "category": "routines", "action": "read" },
    { "category": "progress", "action": "read" },
    { "category": "treatment_plans", "action": "read" },
    { "category": "treatment_plans", "action": "write" }
  ]
}
```

Return `201` `{ id, expires_at, grant_expires_at, scopes, invitation_token }`. Token appears once to the owner for manual sharing in this demo; do not implement email delivery yet or put the token in logs. Store its hash. Invitation listing excludes tokens.

`POST /invitations/accept` takes `{ "token": "opaque-secret" }`. Require authenticated verified clinician, verified account email matching the normalized invited address, unexpired/unrevoked invitation, and unconsumed token. Atomically create the preapproved grant and consent event; return `201` `{ grant_id, patient_id, expires_at, scopes }`. Invalid/expired/revoked tokens return `404 INVITATION_NOT_FOUND`; consumed token → `409 INVITATION_CONSUMED`. The actor cannot change scopes or expiry on acceptance.

| Method and path | Result / access |
|---|---|
| `GET /patients/:patientId/invitations` | Paginated `{ id, recipient_email, expires_at, grant_expires_at, scopes, accepted_at, revoked_at }`; owner only |
| `POST /patients/:patientId/invitations/:invitationId/revoke` | `204`; owner; accepted invitation → `409 INVITATION_CONSUMED` and use grant revocation |
| `GET /patients/:patientId/access-grants` | Paginated grants `{ id, patient_id, recipient_user_id, expires_at, revoked_at, scopes }`; owner only |
| `GET /me/access-grants` | Same grant shape, restricted to current recipient; allows discovery of patients without requiring profile access |
| `POST /patients/:patientId/access-grants/:grantId/revoke` | `204`, idempotent; owner; records consent/audit on first transition |
| `GET /patients/:patientId/consent-events` | Paginated consent records without raw tokens/health text; owner only |
| `POST /patients/:patientId/treatment-plans` | `{ title, instructions }`; `201` plan plus initial version; owner creates `patient_copied`; verified clinician with treatment read/write scopes creates `clinician_entered` |
| `GET /patients/:patientId/treatment-plans` | Paginated `{ id, title, current_version_id, archived_at }`; owner or treatment read scope |
| `GET /patients/:patientId/treatment-plans/:planId/versions` | Paginated versions `{ id, version, previous_version_id, effective_at, authored_by, author_kind, instructions }`; owner or treatment read scope |
| `POST /patients/:patientId/treatment-plans/:planId/versions` | `{ expected_previous_version_id, instructions }`; `201` version shape above; owner or clinician with treatment read/write; stale predecessor → `409 STALE_VERSION` |

Server assigns `author_kind` from the actor's authority for this operation. A patient copying instructions cannot alter prior clinician-authored versions. No medication ordering, dosage calculation, DAW validation, or prescription transmission is implemented by these text instructions.

## 7. Share the approved report

Owner calls `POST /reports/:reportId/shares` after preview:

```json
{
  "recipient_user_id": "clinician_a",
  "expires_at": "2026-12-10T14:00:00Z",
  "approved_content_sha256": "hash-returned-by-preview",
  "acknowledge_download_retention": true
}
```

Require ready report, matching hash, verified recipient, future expiry, and explicit acknowledgment that downloaded copies cannot be retracted. Return `201` `{ id, report_id, recipient_user_id, expires_at, revoked_at: null }`; mismatch → `409 REPORT_APPROVAL_MISMATCH`. Resolve recipient ID from an existing accepted invitation/grant for this patient, including revoked historical grants; the report share is a fresh explicit permission and does not reactivate the grant. No public user-directory endpoint is required.

| Method and path | Result / access |
|---|---|
| `GET /reports/:reportId/shares` | Paginated share records above; owner only |
| `GET /me/shared-reports` | Paginated `{ share_id, report_id, expires_at }` for currently active shares to a currently verified recipient |
| `POST /reports/:reportId/shares/:shareId/revoke` | `204`, idempotent; owner only; consent/audit event on first transition |

Recipient uses the report metadata/preview/export endpoints above. A report share does not enable any `/patients/:patientId/...` endpoints.
