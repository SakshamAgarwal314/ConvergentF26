# Database schema

Proposed PostgreSQL logical schema. Convert this design into SQL migrations during foundation work. All tables are in an application schema unless explicitly identified as Supabase-managed.

## Conventions

- IDs are UUIDs with server-generated defaults. `auth.users.id` is the exception: authentication supplies it.
- Every table has `created_at timestamptz NOT NULL DEFAULT now()`. All fields below are required unless marked `?`.
- `?` means nullable; `[]` means a PostgreSQL array; `jsonb` means a validated JSON object or array with a documented shape.
- Timestamps use `timestamptz`. Clients send ISO 8601 timestamps with offsets; the database stores instants. Schedules additionally preserve an IANA timezone.
- Foreign keys use `ON DELETE RESTRICT` by default. Account erasure is a separate explicit process covering rows and files, not an automatic cascading deletion.
- Version rows, findings, reports, consent events, and audit events are append-only. Corrections create successor records. Mutable lifecycle fields are called out below.
- Use text columns with CHECK constraints for enumerated values. Validate JSON shapes at the API boundary and enforce critical types/limits in SQL.
- Every patient-owned relationship must enforce the same patient through composite foreign keys, not just API validation. Add `UNIQUE(id, patient_id)` to referenced patient-owned tables. For version links include their parent ID in composite keys as described below.
- Add indexes for all foreign keys and patient timelines, plus indexes for normalized catalog search and active recipient grants. Do not put health data in index names or application logs.

## Identity and access

| Table | Fields and relationships | Constraints / behavior |
|---|---|---|
| `users` | `id → auth.users.id` PK; `display_name text`; `clinician_status text = unverified`; `verified_at timestamptz?`; `verified_by → users.id?` | Status: `unverified`, `pending`, `verified`, `suspended`. Only trusted onboarding administration can set verification. No client-controlled global patient/clinician role. |
| `patient_profiles` | `id` PK; `owner_user_id → users.id`; `display_name text`; `timezone text` | Adult synthetic profiles only in demo. Ownership is immutable through ordinary APIs; no birth date needed for this demo. |
| `clinics` | `id` PK; `name text` | Membership does not grant patient access. |
| `clinic_memberships` | `id` PK; `clinic_id → clinics.id`; `user_id → users.id`; `membership_role text`; `revoked_at timestamptz?` | Role: `member`, `admin`. Partial unique `(clinic_id, user_id)` where not revoked. |
| `access_grants` | `id` PK; `patient_id → patient_profiles.id`; `recipient_user_id → users.id`; `granted_by → users.id`; `expires_at timestamptz`; `revoked_at timestamptz?` | Recipient differs from owner. Expiry is after creation. Identity, patient, and scopes are immutable; revocation is one-way. Scope changes require a new grant. Owner-only issuance/revocation. |
| `access_grant_scopes` | `grant_id → access_grants.id`; `category text`; `action text` | Composite PK `(grant_id, category, action)`. Allowed pairs are defined in the permission matrix. At least one scope is required, enforced within grant creation transaction. |
| `invitations` | `id` PK; `patient_id → patient_profiles.id`; `invited_by → users.id`; `recipient_email_normalized text`; `token_hash text UNIQUE`; `expires_at timestamptz`; `grant_expires_at timestamptz`; `accepted_by → users.id?`; `accepted_at timestamptz?`; `revoked_at timestamptz?`; `grant_id → access_grants.id?` | Store a hash, never a raw invitation token. Expiry after creation; grant expiry after invitation expiry. Accepted fields and grant ID become non-null together. Single-use redemption in a transaction with row locking. Grant patient/recipient must match acceptance. |
| `invitation_scopes` | `invitation_id → invitations.id`; `category text`; `action text` | Same allowed pairs as grant scopes. Immutable requested scopes approved by the owner at invitation creation. |
| `consent_events` | `id` PK; `patient_id → patient_profiles.id`; `actor_user_id → users.id`; `event_type text`; `grant_id → access_grants.id?`; `report_share_id → report_shares.id?`; `policy_version text`; `details jsonb` | Types: `grant_issued`, `grant_revoked`, `report_shared`, `report_share_revoked`. Validate required target by type and same patient. Details contain selected scopes or report ID, not symptom text. |
| `audit_events` | `id` PK; `actor_user_id → users.id?`; `patient_id → patient_profiles.id?`; `action text`; `resource_type text`; `resource_id uuid?`; `outcome text`; `request_id uuid` | Outcome: `allowed`, `denied`. Server-only insert; no ordinary API update/delete/read. Record identifiers and category, not report contents, bearer tokens, or health notes. |

Owner authority derives from `patient_profiles.owner_user_id`, not a grant. Clinician verification and grants are separate conditions. Caregiver scopes are defined but caregiver onboarding is deferred.

## Shared product catalog

| Table | Fields and relationships | Constraints / behavior |
|---|---|---|
| `products` | `id` PK; `brand text`; `name text`; `product_type text`; `archived_at timestamptz?` | Product type from a controlled vocabulary, initially `cleanser`, `moisturizer`, `sunscreen`, `treatment`, `other`. Names need not be globally unique. |
| `sources` | `id` PK; `url text?`; `title text`; `publisher text`; `retrieved_at timestamptz`; `citation_text text?` | At least URL or citation text. Preserve citation records used in published versions. |
| `ingredients` | `id` PK; `canonical_name text`; `normalized_name text UNIQUE` | Canonical ingredient identity; no clinical claims stored in aliases. |
| `ingredient_aliases` | `id` PK; `ingredient_id → ingredients.id`; `alias text`; `normalized_alias text UNIQUE` | Case/spacing normalization must be identical in ingestion and checks. Ambiguous aliases require review instead of arbitrary matching. |
| `formulations` | `id` PK; `product_id → products.id`; `version int`; `market text`; `label_text text`; `ingredients_complete boolean`; `verification_status text`; `verified_by → users.id?`; `verified_at timestamptz?`; `supersedes_id → formulations.id?` | `UNIQUE(product_id, market, version)`; version > 0. Status: `draft`, `reviewed`. Reviewed rows are immutable. Reviewed requires reviewer, timestamp, and at least one source. Superseded formulation belongs to same product and market, with lower version. |
| `formulation_ingredients` | `id` PK; `formulation_id → formulations.id`; `ingredient_id → ingredients.id?`; `label_name text`; `position int`; `concentration_value numeric?`; `concentration_unit text?` | `UNIQUE(formulation_id, position)`; position > 0. Null ingredient preserves an unresolved label ingredient. Concentration value/unit are both null or both set; value ≥ 0; percentage ≤ 100. Units initially `percent`, `mg_per_g`. Null means unknown, never zero. |
| `formulation_sources` | `formulation_id → formulations.id`; `source_id → sources.id` | Composite PK. Immutable once formulation is reviewed. |

The application may only add reviewed formulations to patient routines. Reviewed means catalog provenance was checked; it does not establish that a combination is safe. Formulation publication must atomically validate its ingredients and sources.

## Routines and treatment

| Table | Fields and relationships | Constraints / behavior |
|---|---|---|
| `routines` | `id` PK; `patient_id → patient_profiles.id`; `name text`; `archived_at timestamptz?` | Stable identity across edits. Archive preserves history. One routine can contain AM and PM items. |
| `routine_versions` | `id` PK; `patient_id`; `routine_id`; `version int`; `previous_version_id uuid?`; `authored_by → users.id`; `effective_at timestamptz`; `timezone text` | FK `(routine_id, patient_id) → routines`. Unique `(routine_id, version)` and `(routine_id, effective_at)`. First version has no predecessor; later versions reference the immediately prior version of this routine. Initial API accepts present-time changes only; server assigns effective time under lock. |
| `routine_items` | `id` PK; `patient_id`; `routine_id`; `routine_version_id`; `formulation_id → formulations.id`; `slot text`; `position int`; `days_of_week smallint[]`; `instructions text?` | FK `(routine_version_id, routine_id, patient_id) → routine_versions`. Slot `am`/`pm`; position > 0; unique `(routine_version_id, slot, position)`. Days are a nonempty, duplicate-free subset of 1–7 (Monday–Sunday). Each new version gets new item IDs. |
| `treatment_plans` | `id` PK; `patient_id → patient_profiles.id`; `title text`; `archived_at timestamptz?` | Stable plan identity. |
| `treatment_plan_versions` | `id` PK; `patient_id`; `treatment_plan_id`; `version int`; `previous_version_id uuid?`; `authored_by → users.id`; `author_kind text`; `effective_at timestamptz`; `instructions text` | FK `(treatment_plan_id, patient_id) → treatment_plans`. Unique `(treatment_plan_id, version)` and `(treatment_plan_id, effective_at)`. Kind: `clinician_entered`, `patient_copied`. Clinician entry requires verification and active write scope at creation. Predecessor rules match routine versions. |

Add unique composite keys necessary to enforce predecessor parent/patient matches. Transactional procedures enforce predecessor sequencing and append-only effective dates while locking the parent row. Versions never update existing children. The version in effect at instant T is the latest version with `effective_at <= T`.

All version appends use optimistic concurrency: the caller supplies the current version ID; a stale ID fails with HTTP 409. Backdated progress events are allowed, but backdated routine/plan edits are deferred to avoid rewriting historical interpretation.

## Progress and product checks

| Table | Fields and relationships | Constraints / behavior |
|---|---|---|
| `check_ins` | `id` PK; `patient_id → patient_profiles.id`; `recorded_by → users.id`; `occurred_at timestamptz`; `symptoms jsonb`; `notes text?`; `supersedes_id uuid?` | Symptoms maps allowed keys (`dryness`, `redness`, `itching`, `burning`) to integers 0–4, with at least one key. Superseded record must belong to same patient; only one successor per record. Reports distinguish missing symptoms from zero. |
| `routine_completions` | `id` PK; `patient_id`; `routine_id`; `routine_version_id`; `routine_item_id`; `scheduled_date date`; `status text`; `occurred_at timestamptz`; `recorded_by → users.id`; `supersedes_id uuid?` | Composite FK to the exact routine item/version/routine/patient. Status: `completed`, `skipped`. Validate scheduled date/day/slot against the version's saved timezone and effective interval. One current record per `(routine_item_id, scheduled_date)` via transaction; append corrections with a unique predecessor. |
| `product_usage_events` | `id` PK; `patient_id → patient_profiles.id`; `formulation_id → formulations.id`; `event_type text`; `occurred_at timestamptz`; `recorded_by → users.id`; `supersedes_id uuid?` | Type: `started`, `stopped`. Corrections append and must preserve patient. These are patient-reported events, not inferred from routine edits. |
| `compatibility_rules` | `id` PK; `rule_key text`; `version int`; `review_status text`; `reviewed_by → users.id?`; `reviewed_at timestamptz?`; `definition jsonb`; `explanation_template text` | Unique `(rule_key, version)`; version > 0; status `draft`/`expert_reviewed`. Published versions immutable. Definition is a validated, versioned rule DSL, never executable code. Qualified rule review is separate from ordinary clinician verification. |
| `rule_sources` | `rule_id → compatibility_rules.id`; `source_id → sources.id` | Composite PK. Expert-reviewed rules require at least one source. |
| `routine_checks` | `id` PK; `patient_id`; `routine_id`; `routine_version_id`; `treatment_plan_version_id uuid?`; `engine_version text`; `evaluated_at timestamptz`; `coverage_status text`; `input_snapshot jsonb`; `findings jsonb`; `missing_information jsonb` | Composite FKs enforce routine and optional treatment version patient match. Coverage: `evaluated`, `insufficient_information`, `no_reviewed_rules`. Snapshot includes exact formulations, ingredients, schedule, rule IDs/versions, and any plan used. Findings follow API contract. No result claims a routine is safe. |
| `routine_check_rules` | `routine_check_id → routine_checks.id`; `rule_id → compatibility_rules.id` | Composite PK; records every evaluated rule, including rules that produced no finding. |

`created_at` is entry time for progress; `occurred_at` is the reported event time and cannot be in the future. A historical completion may be entered later, but must point to the item scheduled on that date. A correction must reference a current leaf record, enforced transactionally with a row lock. Queries use the leaf of each correction chain; saved reports preserve their original snapshots.

## Reports and sharing

| Table | Fields and relationships | Constraints / behavior |
|---|---|---|
| `reports` | `id` PK; `patient_id → patient_profiles.id`; `created_by → users.id`; `period_start timestamptz`; `period_end timestamptz`; `selected_categories text[]`; `snapshot_schema_version int`; `snapshot jsonb`; `content_sha256 text`; `generation_status text`; `storage_object_path text?`; `failure_code text?` | Start < end; interval is `[start, end)`. Categories are a nonempty unique subset of `routines`, `treatment_plans`, `progress`, `product_checks`, `private_notes`. Snapshot/selection/hash are immutable. Status `pending`, `ready`, `failed`; only status/file/failure fields change during rendering. Private notes require separate explicit selection. |
| `report_shares` | `id` PK; `patient_id`; `report_id`; `recipient_user_id → users.id`; `shared_by → users.id`; `approved_content_sha256 text`; `expires_at timestamptz`; `revoked_at timestamptz?` | Composite FK `(report_id, patient_id) → reports`. Only owner can create/revoke. Recipient must be verified clinician for this demo. Approved hash must equal the report hash. Expiry > creation. No ongoing patient access follows from a report share. |

Report generation captures its selected source records in one consistent database snapshot. Every included patient-data field must belong to a selected category. Check-in notes appear exclusively under `private_notes` when explicitly selected; they never appear inside `progress`. Catalog citations needed to interpret selected records can be included, but unrelated profile or patient data cannot.

For the approval hash, serialize the snapshot deterministically (object keys sorted recursively, array order preserved, UTF-8 encoding, no insignificant whitespace) and store the SHA-256 hex digest. Rendering and preview must use this same immutable snapshot, including the snapshotted patient display name. Changing the renderer must not change the selected data.

Store generated files in a private bucket with server-selected object paths. Preview and export use the same snapshot and hash. Recipient downloads are streamed through an authorization-checking endpoint; do not issue durable public links or recipient storage URLs that would bypass revocation. A downloaded copy cannot be recalled.

## Enforcement and deferred decisions

Implement patient RLS and private storage policies alongside migrations. A privileged backend connection can bypass RLS, so it must still perform authorization for every request. Never expose service credentials to clients. Catalog writes, clinician verification, and rule publication use separate trusted administration paths, outside the public API here.

Before a real patient pilot, define retention periods, deletion/export procedures, clinician onboarding evidence, qualified rule-review criteria, clinical hosting requirements, and correction/withdrawal behavior for published clinical content. These are open deployment decisions, not implied by this draft schema.
