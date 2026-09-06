# Data Processing Agreement (DPA)

Version 1.0 — Effective date: 2026-09-06

## 1. Parties and Roles

This agreement is between the organisation using the Fabrika SaaS platform (the "Controller") and Fabrika, which operates the platform (the "Processor").

The Controller determines the purposes and means of processing the personal data it uploads. The Processor processes that data only on the Controller's documented instructions.

## 2. Subject Matter and Duration

Processing continues for the term of the Controller's active subscription. On termination, the return and deletion terms in section 6 apply.

## 3. Categories of Data Processed

| Category | Example fields | Legal basis |
|---|---|---|
| Identity and contact | name, email, language preference | Performance of a contract (GDPR art. 6(1)(b)) |
| Organisation profile | organisation name, country, PIC, capability text | Performance of a contract |
| Usage records | session times, module access, audit events | Legitimate interest (art. 6(1)(f)) |
| Project and proposal data | opportunities, proposals, consortium seats, person-days | Performance of a contract |
| Billing | plan, subscription status, payment provider identifiers | Legal obligation (art. 6(1)(c)) |
| AI usage log | model, token counts, credits, prompt hash | Legitimate interest, transparency |

Authentication secrets (OAuth and session tokens) are excluded from data subject exports.

## 4. Data Subject Rights

Users of the Controller can exercise the following rights directly in the product:

- **Access and portability:** `Settings → Privacy & My Data → Export My Data` (JSON)
- **Erasure:** `Settings → Privacy & My Data → Request Account Deletion` — the account is closed immediately and permanently deleted after 30 days
- **Withdrawal of an erasure request:** cancel from the same screen within the 30-day window

Rectification and objection requests are handled through the Controller's tenant administrator.

## 5. Security Measures

- Tenant data is isolated at row level using PostgreSQL Row Level Security.
- File attachments are stored in encrypted, S3-compatible object storage.
- Access is role-based; sensitive operations require dual approval.
- Audit events are recorded in the `AuditEvent` table.
- Customer data is never used to train AI models.

## 6. Return and Deletion of Data

On termination the Controller may export all data within 30 days. After that period the data is permanently deleted. Billing and audit records are retained in de-identified form for the duration of statutory retention periods.

## 7. Sub-processors

The Processor uses sub-processors in the following categories: hosting and database, object storage, email delivery, payment infrastructure, AI model providers, and error monitoring. The Controller is notified in advance of any change to sub-processors.

## 8. Breach Notification

On becoming aware of a personal data breach, the Processor notifies the Controller without undue delay and no later than 72 hours, describing the scope of the breach, the categories of data affected, and the measures taken.

## 9. Audit

The Controller may, once per year and with reasonable notice, request documentation and reports concerning the processing activities.
