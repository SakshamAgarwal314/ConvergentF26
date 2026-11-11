# SkinDex Backend Plan
Texas Convergent | Health Tech | Fall 2026

Status: Proposed architecture for team discussion.

## 1. Starting scope

Start with one backend application, a PostgreSQL database, and a small reviewed product catalog.

The first complete workflow is:

**Add products → build a routine → log symptoms → prepare a report → share it with an authorized dermatologist.**

The main design priorities are accurate historical records, controlled access, and trustworthy product checks.

For the first demo, use adult test accounts and synthetic patient data, with approximately 30–50 carefully documented products. Expand into minors, photos, OCR, scheduling, and EHR integration after the core workflow works.

## 2. Recommended stack

Assumption: The team is comfortable with JavaScript and TypeScript.

| Component | Starting choice | Purpose |
|---|---|---|
| Mobile app | React Native + Expo | Patient interface |
| Backend API | Node.js + TypeScript with Fastify | Validation, permissions, product checks, reports |
| Database | PostgreSQL through Supabase | Structured records and relationships |
| Authentication | Supabase Auth | Sign-in and sessions |
| File storage | Private Supabase Storage | Reports and, later, photos |
| AI | Server-side integration, added later | Explain reviewed results |

Organize the backend into modules within a single application. Separate deployed services are unnecessary for the initial version.

Supabase supports database row-level security and storage access policies. Use these as additional protection alongside API authorization. Policies must be explicitly configured and tested; hosting on Supabase does not automatically make patient records private.

Keep privileged credentials and AI provider keys on the server.

## 3. Backend modules

| Module | Responsibilities |
|---|---|
| Identity and access | Accounts, patient profiles, clinic membership, caregiver access, consent |
| Product catalog | Products, formulation versions, ingredients, sources, verification |
| Routine and treatment | AM/PM schedules, clinician instructions, dated changes |
| Progress | Check-ins, symptoms, completion records, timeline |
| Product checks | Apply reviewed rules; return concerns, explanations, and uncertainty |
| Reports and sharing | Generate selected summaries, preview them, authorize access, revoke access |

Keep the shared product catalog separate from private patient records. Product ingredients belong in the catalog; a patient's use of a product belongs in their private records.

## 4. Core database records

| Area | Main tables |
|---|---|
| Accounts | `users`, `patient_profiles`, `clinics`, `clinic_memberships` |
| Access | `access_grants`, `consent_events`, `audit_events` |
| Catalog | `products`, `formulations`, `ingredients`, `ingredient_aliases`, `formulation_ingredients`, `sources` |
| Product checks | `compatibility_rules`, `routine_checks` |
| Treatment | `treatment_plans`, `treatment_plan_versions` |
| Routine | `routines`, `routine_versions`, `routine_items` |
| Progress | `check_ins`, `routine_completions`, `product_usage_events` |
| Reports | `reports`, `report_shares` |

### Product identity and formulations

Separate a product from its formulation. The same product name can have different ingredients across markets or over time.

A patient's routine should reference the formulation they confirmed. Preserve its source, market, ingredient list, verification status, and relevant version information.

Store unavailable concentrations as unknown.

### Historical routines and treatment plans

Version routines and treatment plans. Editing today's routine must not rewrite what the patient was using last month.

Preserve the author, effective date, and previous version of treatment instructions. Distinguish clinician-entered instructions from patient-entered copies of instructions.

### Patient profiles and accounts

Separate a patient profile from a login. A parent may manage a child's profile, and an authorized caregiver may access another patient's records.

### Event dates

Record both when an event happened and when it was entered. For example, someone might log today that they stopped a product three days ago.

Associate routine completion with the relevant routine version and scheduled item so later edits do not distort adherence history.

## 5. Product-check engine

Use structured backend logic and reviewed rules.

For each check:

1. Load the confirmed formulations and applicable treatment plan.
2. Normalize ingredient names and aliases.
3. Evaluate applicable rules using available concentration, frequency, product type, and instructions.
4. Return findings and missing information.
5. Save the formulation and rule versions used.

Example finding shape:

```json
{
  "category": "potential_additive_irritation",
  "review_status": "expert_reviewed",
  "affected_routine_items": ["item_a", "item_b"],
  "explanation": "...",
  "missing_information": ["concentration"],
  "source_ids": ["source_123"],
  "rule_version": 2
}
```

This is an illustrative response structure, not a clinical rule.

Important behavior:

- Ordinary ingredient overlap is not automatically harmful.
- “No reviewed rule matched” is different from “safe to combine.”
- Missing ingredients or concentrations remain unknown.
- Clinician instructions are relevant context; contradictory findings should prompt clarification rather than silently changing treatment.
- Health-related rules need qualified review before release.

AI may translate structured findings into understandable language. It should not invent rules, clear uncertain combinations, or modify prescriptions. Preserve the underlying findings and supporting sources so explanations can be checked.

## 6. Permissions and sharing

Roles such as patient, dermatologist, and caregiver do not by themselves establish access to a particular patient.

Each access grant should identify:

- The recipient and patient.
- Which data categories the recipient may read.
- Which actions they may perform.
- When access expires or is revoked.

For example, a dermatologist could review shared routines and update treatment instructions without access to photos or private notes.

Check permissions on every backend request. Hiding a button in the app does not protect the endpoint. Clinician privileges require a verified onboarding process.

Audit sensitive reads, permission changes, sharing events, and treatment-plan updates without copying unnecessary health information into application logs.

### Reports

Generate a snapshot containing only the patient-selected information and date range. Let the patient preview that exact snapshot before approving sharing.

Distinguish access to a report from ongoing access to the patient's records.

Revocation can stop future in-app access; it cannot retract a copy already downloaded. Downloadable reports should make this consequence clear during sharing.

## 7. Build order

| Milestone | Working result |
|---|---|
| 1. Foundation | Sign-in, patient profile, database migrations, ownership checks |
| 2. Catalog and routine | Search a small verified catalog, confirm formulation, save routine |
| 3. Progress | Record check-ins and start/stop events; view historical changes |
| 4. Product checks | Run a small reviewed rule set with sources and uncertainty |
| 5. Reports | Preview and export a selected appointment summary |
| 6. Clinician connection | Accept an invitation, grant scoped access, update a versioned plan |

Build one working path through the app before expanding catalog coverage or adding optional features.

## 8. Verification before a real patient pilot

Verify:

- One patient cannot read or modify another patient's records.
- A clinician cannot access a patient without a valid grant.
- Data-category exclusions apply to endpoints, exports, and file access.
- Revocation blocks subsequent access.
- Report contents match the approved selection.
- Routine and treatment updates preserve historical accuracy.
- Product checks behave correctly on expert-reviewed cases and missing information.
- Export and deletion workflows cover related records and stored files, with clearly defined retention behavior.
- Operational logs avoid unnecessary health information.
- The selected hosting, authentication, AI, and storage arrangements are suitable for the intended clinical deployment.

Provider selection alone does not establish readiness to handle clinical data.

## 9. Immediate team deliverables

1. **Database schema:** Table definitions, relationships, constraints, and versioning.
2. **Permission matrix:** Who can read or change each data category under which grant.
3. **API contracts:** Request and response shapes for the first complete workflow.
4. **Initial catalog and rule set:** Documented sources, review status, and coverage limits.
5. **Acceptance checks:** Concrete examples demonstrating historical accuracy and access isolation.

## References

- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)

