# Data Processing Agreement (DPA)

**Version:** 1.4 · **Text date:** 2026-11-02 · **Effective date:** the date of the last signature in section 12

## Version History

| Version | Date       | Change                                                                                                                                      |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-09-06 | First publication (template, no signature block)                                                                                            |
| 1.0     | 2026-09-08 | Section 7 changed; version number and date were not updated                                                                                 |
| 1.1     | 2026-10-01 | Parties, notices, signature and effective-date sections added; section 6 aligned with the code; sub-processors listed by name in Annex 1 |
| 1.2     | 2026-10-01 | Section 13 (language precedence, governing law, jurisdiction) added; GDPR art. 28(3) and KVKK art. 12 elements and the international transfer basis added to sections 4, 5, 7, 8, 9; basis for the "no model training" statement explained in section 5; sections 7.2/7.3 aligned with the actual state (sub-processor contracts and transfer basis as of today); 13.3 jurisdiction set to Samsun; processor legal name added |
| 1.3     | 2026-10-02 | Y-2: Section 13 (language, governing law, jurisdiction) converted to placeholders and choice lists (law choice deferred to counsel); conflict of laws risk in section 3 noted in 13.1. Y-3: sections 7.2 (art. 28(4) objection rights and sub-processor obligations detail) and 8 (DPIA and prior consultation assistance detail) expanded. Ö-1: section 5 model training provider basis made reference-ready; docs/SECURITY_COMPLIANCE.md:140 verification pending. Ö-2: processing-register.md "Fabrika" role names changed to "NexaGrant". |
| 1.4     | 2026-11-02 | 01.11.2026 — product name NexaGrant (owner decision): the product name "FonBridge" became "NexaGrant"; the first mention now states that NexaGrant is a product of Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti. and that this company is the Processor. Legal name, address, tax number and notice address are unchanged. |

## 1. Parties and Roles

This agreement is made between the two parties whose details are set out in the table below.

| Detail                     | Controller (customer organisation) | Processor                       |
| -------------------------- | ---------------------------------- | ------------------------------- |
| Name                       | ...............................    | NexaGrant                       |
| Registered legal name      | ...............................    | Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.             |
| Address                    | ...............................    | Karasamsun Quarter, İlkadım, SAMSUN [to be completed] |
| Tax office / tax number    | ...............................    | 29120352230                     |
| Trade registry (MERSİS) no | ...............................    | ............................... |
| Notice email address       | ...............................    | info@nexagrant.com              |

The Processor is Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti. NexaGrant is a product of that company. The Controller is the organisation that uses the NexaGrant platform (the "Platform") operated by the Processor. The Controller determines the purposes and means of processing the personal data it uploads to the Platform. The Processor processes that data only on the Controller's documented instructions.

## 2. Subject Matter and Duration

Processing continues for the term of the Controller's active subscription. On termination, the return and deletion terms in section 6 apply.

## 3. Categories of Data Processed

| Category                  | Example fields                                          | Legal basis                                   |
| ------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| Identity and contact      | name, email, language preference                        | Performance of a contract (GDPR art. 6(1)(b)) |
| Organisation profile      | organisation name, country, PIC, capability text        | Performance of a contract                     |
| Usage records             | session times, module access, audit events              | Legitimate interest (art. 6(1)(f))            |
| Project and proposal data | opportunities, proposals, consortium seats, person-days | Performance of a contract                     |
| Billing                   | plan, subscription status, payment provider identifiers | Legal obligation (art. 6(1)(c))               |
| AI usage log              | model, token counts, credits, prompt hash               | Legitimate interest, transparency             |

Authentication secrets (OAuth and session tokens) are excluded from data subject exports.

## 4. Data Subject Rights

Users of the Controller can exercise the following rights directly in the Platform:

- **Access and portability:** `Settings → Privacy & My Data → Export My Data` (JSON)
- **Erasure:** `Settings → Privacy & My Data → Request Account Deletion` — the account is closed immediately and permanently deleted after 30 days
- **Withdrawal of an erasure request:** cancel from the same screen within the 30-day window

Rectification and objection requests are handled through the Controller's tenant administrator.

**Assistance with data subject requests:** Taking into account the nature of the processing, the Processor assists the Controller by appropriate technical and organisational measures in fulfilling the Controller's duty to respond to data subject requests (GDPR arts. 12-22; KVKK arts. 11 and 13). A data subject request that reaches the Processor directly is not answered unless the Controller instructs it; it is forwarded without delay to the address in section 10.

## 5. Security Measures

- Tenant data is separated at the application layer: queries that access tenant data are restricted to the tenant identifier; a defined, limited set of system operations (platform administration, data-subject requests, scheduled jobs) may operate across tenants. PostgreSQL Row Level Security policies are defined in the database but are not in effect on the application's database connection.
- File attachments are stored in encrypted, S3-compatible object storage.
- Access is role-based; sensitive operations require dual approval.
- Audit events are recorded in the `AuditEvent` table.
- The Processor ensures that its personnel who process personal data are bound by a duty of confidentiality, which continues after their engagement ends (GDPR art. 28(3)(b); KVKK art. 12(1) and 12(4)).
- The Processor takes the technical and organisational measures needed to ensure a level of security appropriate to the processing (GDPR art. 32; KVKK art. 12(1)).
- That customer data is not used to train AI models rests on the AI providers' (Annex 1: Anthropic, OpenAI) published commercial terms of service, not on a separate agreement signed between the Processor and those providers. **Basis:** Anthropic's commercial terms state "Customer Content will not be used to train our models"; OpenAI's terms state "As of March 1, 2023… your Customer Content will not be used for model training except with your explicit opt-in." These commitments remain consistent with API practice; providers may change their terms. Under their own terms, providers may retain the content sent for a limited period; for example, OpenAI retains text embedding requests for up to 30 days today. **A retention period of zero is not promised.** These retention periods are managed by the providers independently and are outside the Processor's control.

## 6. Return and Deletion of Data

- **6.1 Export on termination:** On termination the Controller may ask for its data to be exported within 30 days of the termination date. An organisation-wide export is not a self-service function of the Platform today; the request is sent in writing to the address in section 10 and the Processor carries it out. A user-level export is made from the screen in section 4.
- **6.2 Deletion on termination:** When the agreement ends, the data is returned or deleted at the Controller's choice (GDPR art. 28(3)(g)). At the end of the 30-day period the Processor permanently deletes the data, except for the records listed in 6.4. Organisation-wide deletion is not an automatic process of the Platform today; the Processor carries it out and confirms in writing to the address in section 10 when it is complete.
- **6.3 Deletion of a user account:** When an account is deleted under section 4, the records that belong to the Controller and must be kept (audit events, the AI usage log, opportunities, feedback, proposal usage and relationship records) are not deleted; the link to the user's identifier in those records is removed. The free-form content field of an audit event is not changed by this step and may contain personal data. The deletion itself is recorded with a one-way hash of the user's identifier.
- **6.4 Records kept without de-identification:** The following records are not de-identified and are kept for as long as their reason applies: (a) issued invoices — the buyer's legal name, tax or national identity number, tax office and address, as they stood when the invoice was issued, for the retention period set by the applicable tax law; (b) the identity and name of the approver on a dual-approval step, because the approval has the character of a signature; (c) records showing that the user was informed and gave consent, because of the duty to demonstrate compliance.

## 7. Sub-processors

The Processor uses the sub-processors listed in Annex 1 with their name, service, location and the data they process. The Controller gives general authorisation for the use of these sub-processors.

- **7.1 Prior notice and objection:** The Controller is notified through the address in section 10 at least 30 days before any sub-processor is added or replaced. In that period the Controller may object in writing on reasonable data protection grounds. If it objects, the parties discuss a solution in good faith; if none is found, the Controller may terminate the service that involves the sub-processor concerned, and the return and deletion terms in section 6 apply.
- **7.2 Sub-processor contracts:** Today the relationship with sub-processors rests on the sub-processors' published commercial terms of service; the Processor has no separate data processing agreement signed with them in addition to those terms (see the last bullet of section 5). When a separate written agreement reflecting the obligations in this agreement is put in place with a sub-processor, the Processor notifies the Controller; on the Controller's request the Processor states in writing which agreement exists with which sub-processor. If a sub-processor fails to meet its obligations, the Processor remains liable to the Controller (GDPR art. 28(4); KVKK art. 12). **In addition (per art. 28(4)):** the Controller may object in writing to the Processor's use of a particular sub-processor, providing a reasonable and data protection ground; the Processor and Controller shall discuss a solution in good faith; if no solution is reached, the Controller may terminate the service involving that sub-processor (see 7.1). The Processor ensures that sub-processors are bound by the same obligations as this agreement specifies (security, confidentiality, data subject rights) through written contract or terms of service. A data subject request that reaches the Processor directly is forwarded to the Controller with reasonable assistance from the Processor (see section 4).
- **7.3 International transfers:** Personal data may be transferred to the sub-processors located in the USA in Annex 1 (Anthropic, OpenAI, Stripe, Google). The intended transfer basis is: for data coming from the European Union, either the provider's certification under the EU-US Data Privacy Framework (DPF), which relies on the European Commission's adequacy decision under GDPR art. 45, or, where there is none, Standard Contractual Clauses (SCC) under GDPR art. 46; for data coming from Türkiye, an adequacy decision or appropriate safeguards under KVKK art. 9 (signing the standard contract and notifying it to the Personal Data Protection Authority within the legal period after signature). The Processor has not verified that these bases are in place today for every sub-processor; the standard contract has not been signed and notified to the Authority. On the Controller's request the Processor states in writing which basis is actually in place for each sub-processor and, where one is not, when it will be.

Error monitoring is not sub-processed to any third party today; errors are kept only in the Platform's own `SystemAlert` mechanism. The product analytics provider listed in Annex 1 is integrated into the Platform but switched off; the notice in this section is given before it is switched on.

## 8. Breach Notification and Assistance Obligations

On becoming aware of a personal data breach, the Processor notifies the Controller without undue delay and no later than 72 hours, describing the scope of the breach, the categories of data affected, and the measures taken. Taking into account the nature of the processing and the information available to it, the Processor also assists the Controller by appropriate technical and organisational measures in the following matters: (1) security obligations (GDPR art. 32, KVKK art. 12); (2) notification of the breach to the supervisory authority (data protection authority) and affected individuals (GDPR arts. 33-34, KVKK art. 12(5)); (3) conducting or completing a Data Protection Impact Assessment (DPIA); in this connection, the Processor shall provide all information necessary to support the Controller's DPIA regarding the technical and administrative nature of the processing (GDPR art. 35); (4) prior consultation of the supervisory authority, where required, by assisting the Controller to carry out such consultation and providing necessary details about the Processor's operations (GDPR art. 36); (5) other mandatory reporting obligations under applicable law.

## 9. Audit

The Processor makes available to the Controller all information necessary to demonstrate compliance with the obligations in this agreement. The Controller may, once per year and with reasonable notice, request documentation and reports concerning the processing activities; it may also carry out an audit, itself or through an auditor it appoints, with reasonable notice and without unreasonably disrupting the Processor's operations. If a breach is suspected or a competent authority requests it, the Controller may carry out this audit more than once per year (GDPR art. 28(3)(h); KVKK art. 12(3)).

## 10. Contact and Notices

Notices under this agreement (breach notifications, sub-processor changes, export and deletion requests, forwarding of data subject requests) are made in writing to the notice email addresses in the table in section 1. The Processor's notice address is **info@nexagrant.com**. Each party tells the other in writing if its address changes.

## 11. Version and Amendment

The current text of this agreement is identified by the version number and text date written on it. Every change to the text gets a new version number and date and is entered in the Version History table.

## 12. Entry into Force and Signature

This agreement enters into force on the later of the dates on which the parties sign below and remains in force for the term in section 2.

| Field             | For the Controller              | For the Processor               |
| ----------------- | ------------------------------- | ------------------------------- |
| Full name         | ............................... | ............................... |
| Title / position  | ............................... | ............................... |
| Date              | ....../....../..........        | ....../....../..........        |
| Signature         |                                 |                                 |

## 13. Language Precedence, Governing Law and Jurisdiction

- **13.1 Language:** This agreement is made in Turkish and English. If the two texts conflict or differ in interpretation, the Turkish version shall prevail. **Note:** Section 3 (categories of data processed) cites KVKK art. 5 in the Turkish text and GDPR art. 6 in the English text; these bases belong to different legal systems and a conflict of laws may arise. In such a case, the law designated in section 13.2 (governing law) shall apply.
- **13.2 Governing law:** [COUNSEL: Options — (A) the law of the Republic of Türkiye, (B) the law of the Controller's place of establishment, (C) the law of the Controller's principal place of business, or (D) the law of an EU Member State. Write chosen option on this line: ..................]
- **13.3 Jurisdiction:** [COUNSEL: Options — (A) the Samsun Courts and Enforcement Offices, (B) the courts of the Controller's place of establishment, (C) the competent court of an EU Member State, or (D) the Personal Data Protection Authority. Write chosen option on this line: ..................]

## Annex 1: Sub-processors

| Sub-processor         | Service                                                              | Location       | Data processed                                                                                     | Status                                   |
| --------------------- | -------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Vulut                 | Hosting: application server, PostgreSQL database, job queue, email server | Türkiye        | All data on the Platform; content and recipient address of outgoing email                          | In use                                   |
| Cloudflare, Inc. (R2) | Object storage | Amsterdam (Western Europe) | File attachments, evidence files, organisation logos | In use |
| Anthropic PBC         | AI language model                                                    | USA            | Prompt text sent by AI features                                                                    | In use                                   |
| OpenAI, L.L.C.        | AI language model and text embedding                                 | USA            | Prompt text; document text embedded for search                                                     | In use                                   |
| Stripe, Inc.          | Payment infrastructure                                               | USA            | Payment details entered on the payment page; organisation and subscription identifiers             | In use                                   |
| iyzico | Payment infrastructure (TRY) | Türkiye | Buyer's first name, last name, email address, identity number, address, IP address; payment details | Integrated; no payments are taken this way today; the notice in section 7 is given before it is switched on |
| Google LLC | Sign-in with a Google account; Google Calendar sync | USA | For sign-in: name, email address, Google account identifier; for calendar sync: meeting title (the partner organisation's name) and the first 500 characters of the meeting note | If the user chooses this sign-in method or connects a calendar |
| PostHog Inc.          | Product analytics                                                    | EU             | After consent, a random per-browser identifier and product usage events (no user id, email or name is sent; the request's IP address reaches the provider) | Integrated, switched off (section 7)     |
