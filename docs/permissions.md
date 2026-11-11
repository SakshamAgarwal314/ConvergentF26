# Permission matrix

All access requires an authenticated user except sign-in handled by Supabase Auth. Deny anything not explicitly allowed. A role or clinic membership alone grants no patient access.

## Category and action pairs

These are the only valid `access_grant_scopes` / `invitation_scopes` pairs:

| Category | Allowed grant actions | Owner | Verified clinician with scope | Caregiver |
|---|---|---|---|---|
| `profile` | `read` | Read/update own profile | Read | Deferred |
| `routines` | `read` | Read/create/append/archive | Read | Deferred |
| `treatment_plans` | `read`, `write` | Read; create/append patient-copied instructions | Read with `read`; create/append clinician instructions with both `read` and `write` | Deferred |
| `progress` | `read` | Read/create/correct symptoms, completions, usage events | Read structured progress | Deferred |
| `private_notes` | `read` | Read/create/correct check-in notes | Read only with both `progress:read` and `private_notes:read` | Deferred |
| `product_checks` | `read` | Run/read checks | Read saved findings with scope | Deferred |

`write` treatment scope requires `read` treatment scope. `private_notes:read` requires `progress:read`. Validate these combinations on grant/invitation creation. Reject unknown pairs instead of silently ignoring them.

Patient owners cannot label their own instructions `clinician_entered`. Clinicians cannot edit routines, progress, or profile data through these grants. The initial invitation API accepts verified clinicians only; caregiver access is modeled for later implementation.

## Other resources

| Resource | Owner | Other users |
|---|---|---|
| Reviewed catalog | Read | All authenticated users read |
| Catalog drafts and rule administration | No authority from ownership | Trusted administrators only, outside public API |
| Report creation, selection, preview, export | Create/read/export own snapshots | No authority from patient grants |
| Shared report | Read own report | Named verified recipient reads/downloads only while that report share is active |
| Invitations and patient grants | Create/list/revoke | Recipient may accept invitation addressed to their verified email; read grants addressed to them |
| Consent history | Read own patient's history | No ordinary recipient access |
| Audit log | No public API access | Trusted operational access only |
| Clinician verification / clinic membership | No self-elevation | Trusted onboarding administration only |

## Authorization algorithm

1. Validate the authentication token; derive actor ID from it. Ignore actor/owner IDs supplied in request bodies.
2. Load the requested resource and resolve its patient from the database. For collections, constrain the query before reading any rows.
3. If actor owns the patient, apply the owner operations above. Otherwise require current clinician verification and a grant to this exact patient where `revoked_at IS NULL` and database time is strictly before `expires_at`.
4. Require each category/action needed by the operation. An excluded field must never leak through a nested response, timeline, search, report, export, or file endpoint. Responses for progress omit `notes` entirely unless permitted.
5. Perform authorization and sensitive writes together transactionally. Lock the applicable grant row during clinician treatment writes so revocation and writes have a defined order. An operation already authorized before revocation may finish; subsequent requests must fail.
6. Record sensitive reads, writes, grant/share changes, and denied attempts in audit events without copying request bodies or health text. Grant/share creation and their consent events commit together.

Recheck grants on every request. Do not cache an allow decision beyond its grant lifetime or retain an allow result across revocation. RLS helpers must implement equivalent patient/category rules; storage stays private. Test both direct database access under user credentials and API access.

For resource IDs the actor cannot access, return `404 RESOURCE_NOT_FOUND`. Use `403 ACTION_NOT_ALLOWED` when the actor can already see the resource but lacks the requested operation. Lists return authorized rows only.

## Snapshots and report access

- Only owners select patient data for reports in the initial API. Sharing requires the hash of the exact snapshot previewed by the owner.
- A report share authorizes the complete approved snapshot, including any explicitly selected notes. It does not depend on or create a general patient grant.
- Revoking a patient grant stops ongoing patient-record access. Revoke a report share separately to stop future access to that report; show both independently in the owner interface.
- Every preview/export request checks ownership or its named recipient's active share. Recipient access additionally requires current verified clinician status.
- Export responses use `Cache-Control: private, no-store`. Storage paths are internal and never appear in public response bodies. Downloaded copies remain outside revocation control; sharing must disclose this.

## Example

Patient P grants clinician C `routines:read`, `progress:read`, `treatment_plans:read`, and `treatment_plans:write`.

C can see P's routines and structured symptoms and append a treatment plan version. C cannot see check-in notes, run a new product check, open an unshared report, or access another patient's data. Clinic membership adds no permissions. When P revokes the grant, C loses future patient-record access; a separately approved report remains accessible until its own share expires or is revoked.
