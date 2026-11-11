# SkinDex implementation contracts

Status: proposed implementation design, based on `SkinDex_Backend_Plan.md`. These documents complete the design deliverables for step 1; they do not create a database or running API.

- [Database schema](database-schema.md): tables, relationships, constraints, and historical records.
- [Permission matrix](permissions.md): ownership, scoped grants, report access, and enforcement.
- [API contracts](api-contracts.md): requests and responses for the first complete workflow.
- [Acceptance scenarios](acceptance-scenarios.md): examples to verify during implementation.

Initial scope: adult test accounts, synthetic patient data, and a catalog of approximately 30–50 documented products. Photos, minors, insurance workflows, DAW-code validation, scheduling, OCR, and EHR integration are deferred. The older README's insurance and prescribing ideas are outside this first workflow.

Implementation sequence after this design: backend scaffolding and migrations → authentication and ownership policies → catalog and versioned routines → progress → reviewed checks → report snapshots → clinician invitations, grants, and versioned treatment plans. Define access structures now; implement and verify their policies alongside each feature.
