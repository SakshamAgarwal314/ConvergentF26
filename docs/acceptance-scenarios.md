# Acceptance scenarios for implementation

These are required behavior examples, not claims that a running implementation has passed tests. Use synthetic patients P and Q, verified clinicians C and D, and unverified account U. Implement API and direct-user-database checks as the corresponding modules are built.

| Scenario | Expected outcome |
|---|---|
| P creates a patient profile while submitting Q's user ID as an extra field | Reject unknown field; successful creation always derives ownership from session. |
| Q guesses P's routine, check-in, report, or storage path | API returns 404; direct user database/storage access returns no unauthorized data. |
| C belongs to P's clinic but has no grant | No patient-record access. |
| P invites C with routine/progress read, and treatment read/write | Acceptance creates exactly those scopes, once; attempts to replace scopes fail validation. |
| U accepts an invitation, or D submits C's invitation token | No grant; verify clinician status and matching verified email before acceptance. |
| Two requests simultaneously redeem C's token | Exactly one grant and one grant-issued consent event; second request gets 409. |
| C reads progress without private-note scope | Structured symptoms are visible; notes are absent from response bodies and nested data. |
| C reads a saved check without treatment or routine read scopes | Findings are visible with check scope; raw input snapshots and treatment instructions are absent. |
| P edits a routine after logging a completion | New version/item IDs; old completion still references the original schedule and formulation. |
| P logs a completion today for a scheduled item from three days ago | Allowed with original version/item, historical date, and distinct entry time; wrong historical version rejected. |
| Two requests append to the same routine predecessor | One succeeds; other returns 409; version sequence has no fork. |
| P corrects a symptom score | New check-in supersedes original; timeline uses correction, original remains stored, existing report is unchanged. |
| P selects an ingredient whose concentration is unavailable | Concentration remains null; checks preserve uncertainty rather than treating it as zero. |
| No reviewed compatibility rule applies | `no_reviewed_rules`, empty findings, no safety clearance. |
| A rule does not match but was evaluated | Saved check records that exact rule ID/version anyway. |
| P changes a routine while a report renders | Report contains one consistent snapshot, never a mixture of versions. |
| P previews a report excluding private notes and treatment plans | Neither appears in snapshot/PDF, nested check inputs, metadata summaries, or attachment contents. |
| P submits a hash different from the previewed report hash | Share creation fails with 409; no consent event indicates successful sharing. |
| C has a general patient grant but no report share | Cannot preview/export P's report. |
| P shares one report with C but gives no current general grant | C can access that snapshot only; patient APIs remain inaccessible. |
| P revokes C's general grant while report share is active | Future patient-record requests fail; separately shared report remains available. |
| P revokes or expires the report share | Subsequent preview/export requests fail; no public storage URL bypass exists. A previously downloaded file is outside recall. |
| C's clinician verification is suspended | Subsequent grant-based patient access and report-share access fail. |
| C submits treatment `author_kind` manually | Reject field; server assigns provenance. Owner-created copies remain `patient_copied`. |
| C appends treatment instructions while P revokes the grant | Transactions serialize at the grant lock; writes authorized after revocation fail. |
| Audit/consent records are inspected after the workflow | Actor/resource/action/outcome present; raw invitation tokens, symptom text, report bodies, and secrets absent. |

Before a real patient pilot, additionally implement and verify full export/deletion with related files, retention behavior, reviewed clinical-rule fixtures, operational recovery, and deployment suitability as required by the backend plan.
