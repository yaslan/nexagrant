# Fabrika Beta Program — Design Partner Guide

> Version: 1.0 · Date: 2026-09-06 · Language: English (Turkish: [`BETA_GUIDE.md`](./BETA_GUIDE.md))
> Scope: E11 · Beta (10 design partners, 8 weeks) — see [`ROADMAP.md`](./ROADMAP.md) § E11

---

## 0. At a glance

| Item | Value |
|---|---|
| Program | Fabrika Beta — Design Partner Program |
| Duration | 8 weeks · **2026-09-07 → 2026-11-01** |
| Partners | 10 design partners (SME, university TTO, consultancy, research centre) |
| Cost | Free during the beta (Team plan entitlements + 500 AI credits) |
| Weekly rhythm | Thursday 14:00–14:45 (Europe/Istanbul) partner sync |
| Expected effort | About 1 hour per week: 1 sync + real usage on 1 live call |
| Output | Product feedback, issue triage, price validation, G0 calibration |

---

## 1. What the program is

Fabrika is a **multi-tenant project pipeline platform** for European funding (Horizon Europe, Digital
Europe, Eurostars): call intelligence, a stage-gate model, consortium matching, evidence management and
proposal production workflows in one place.

The goal of the beta is **not a feature demo. It is one real application cycle, end to end.** As a design
partner you work on a real call; each week we turn the friction you hit into product changes.

### Who it is for

| Profile | Typical use | Beta focus |
|---|---|---|
| SME R&D team | 1–3 concurrent proposals | G0 idea screening, M2 concept note |
| University TTO | 5–15 academics, many ideas | M4 Focal Point, gate discipline |
| Consultancy | Multi-tenant portfolio | Pipeline visibility, person-day measurement |
| Research centre | Consortium leadership | M1/M8 partner intelligence |

### Why ten partners

At least two partners per profile, so a piece of feedback can be told apart as "one user's taste" or "a
real need of that profile". Calibration (E11.3) also needs at least 10 real G0 scores.

---

## 2. Beta scope

### Modules in scope (MVP)

| Module | Name | What it does in the beta |
|---|---|---|
| M1 | Partner Intelligence Database | CORDIS partner profiles, past projects |
| M2 | Concept Note Architectures | Concept note draft (AI assisted, spends credits) |
| M3 | Evidence Pack | Evidence store; the source behind every figure |
| M4 | Focal Point | Internal idea intake and pre-screening |
| M5 | Proposal Production Workflows | Gate flow, task assignment, KPI dashboard |
| M8 | Consortium Matching | Partner search and role allocation |
| — | Admin console | User, role and module state management |

Modules held for v1.1 and later (M6 Evaluator Lens, M9 Meeting Briefs, M10, M11, M7) are **not** in the
beta. Their place in the plan is in [`ROADMAP.md`](./ROADMAP.md).

### Gate model (G0 → G4)

| Gate | Name | Condition to pass |
|---|---|---|
| G0 | Idea & concept | Idea screening and strategic fit |
| G1 | Call match | Horizon Europe fit score above threshold |
| G2 | Consortium | Partners and role split settled |
| G3 | Draft & review | Internal review complete |
| G4 | Official submission | Ready to upload to the EU portal |

### What the beta does **not** do

- **No automatic submission to the F&T Portal.** The official submission is always made by you, in the
  portal.
- **Assessment output is not an official score.** Every score is labelled "internal pre-assessment".
- **Payment flow is off.** Pricing is discussed only in the validation workshop (E11.4).
- **No SLA commitment.** The support figures in § 5 are targets, not a contract.

---

## 3. Onboarding, step by step

### Day 0 · Preparation (we do this)

- [ ] Tenant and workspace created; country and organisation type set.
- [ ] Team plan entitlements + 500 AI credits granted.
- [ ] Invitation e-mail: sign-in link + this guide + the data processing agreement (DPA).

### Day 1 · First sign-in (30 minutes, you do this)

1. Sign in with a corporate e-mail (Google / Microsoft Entra ID / e-mail) → `/en/giris`.
2. Set cookie preferences (analytics off means no usage metrics are collected).
3. Check profile and organisation details → `Settings`.
4. Review privacy settings and your data rights → `Settings → Privacy` (export, deletion request).
5. Invite teammates → `Admin Console` (role matrix in Appendix A).

### Week 1 · First real cycle (2–3 hours)

1. **Pick a call:** choose an open call that fits you (deadline at least 6 weeks out).
2. **Open an opportunity:** bring the call into the pipeline and assign an owner.
3. **Pass G0:** write the idea definition and the strategic fit note; record the gate decision.
4. **Add evidence:** put a source in the M3 evidence store for every figure you claim.
5. **Find partners:** produce at least 3 candidate partner profiles with M1/M8.
6. **Concept note:** generate a first draft with M2 (1 credit) and **edit it by hand** — raw output is
   never used as is.

> **Week 1 exit criterion:** at least one opportunity has moved to G1 and is visible on the dashboard.

### Weeks 2–8 · Ongoing use

Every week, at minimum: one gate decision, one feedback item, one sync attended.

---

## 4. Weekly rhythm and calendar

### Sync schedule (Thursday 14:00–14:45, Europe/Istanbul)

| Week | Date | Theme |
|---|---|---|
| 1 | 2026-09-10 | Setup, first call selection, blockers |
| 2 | 2026-09-17 | G0/G1 experience, quality of call intelligence |
| 3 | 2026-09-24 | M1/M8 partner matching accuracy |
| 4 | 2026-10-01 | Concept note (M2) output quality and credit usage |
| 5 | 2026-10-08 | Evidence discipline (M3) and reporting |
| 6 | 2026-10-15 | KPI dashboard: which metric changes a decision? |
| 7 | 2026-10-22 | **Price validation workshop** (E11.4) |
| 8 | 2026-10-29 | G0 calibration (E11.3) and beta close-out, next steps |

Calendar file: [`beta/beta-weekly-sync.ics`](./beta/beta-weekly-sync.ics) — importable into Google
Calendar, Outlook and Apple Calendar (Google Calendar: *Settings → Import & export → Import*). Automatic
calendar integration is v1.1 work; during the beta the calendar is distributed as a **static ICS**.

### Sync agenda template (45 minutes)

| Time | Section | Content |
|---|---|---|
| 5 min | Status | Live pipeline dashboard: how many opportunities, at which gate |
| 15 min | Friction | The 3 things that slowed you down this week (with screen or step) |
| 10 min | Theme of the week | Deep dive per the table above |
| 10 min | Triage | Prioritising the issues and requests opened |
| 5 min | Decisions | Who, what, by when — written down |

If you miss a week, fill in the **asynchronous form** (same five headings) before the sync; notes and the
recording are shared in the program channel.

---

## 5. Feedback and issue reporting

### How to report

Each item needs: **what you tried · what happened · what you expected · screenshot or URL.** The full
triage system is built in E11.2; during the beta, items are collected through the program channel.

### Priority and target times (targets, not commitments)

| Priority | Definition | First response | Target fix |
|---|---|---|---|
| P0 | Data loss / cannot sign in / suspected tenant leak | 2 hours | Same day |
| P1 | Main flow blocked (gate decision, proposal production) | 1 business day | 3 business days |
| P2 | Annoying but has a workaround | 2 business days | Next release |
| P3 | Improvement or request | At the weekly sync | Added to the roadmap |

> **If you suspect a P0, do not wait** — write directly to the support channel (§ 8).

---

## 6. Success measures

The program is measured with the same metrics the partners see on their dashboard (`Dashboard` → KPI
cards):

| Metric | Beta target | Where it shows |
|---|---|---|
| Total proposals (active opportunities) | ≥ 2 per partner | KPI card "Total Proposals" |
| Above-threshold rate | Becomes measurable (baseline) | KPI card "Above Threshold Rate" |
| Person-days per proposal | Down against baseline | KPI card "Person-Days / Proposal" |
| G0 → G2 duration | Shorter than baseline | KPI card "Avg. G2 Approval Time" |
| Active modules | ≥ 4 modules per partner | KPI card "Active Modules" |
| Weekly feedback | ≥ 1 item per partner per week | Triage records |

Values measured in week 1 are the **baseline**; the target is improvement against that line by week 8.
Every ratio on the dashboard is backed by a record; with no source, the metric shows as "no data".

---

## 7. Data, privacy and compliance

- **Tenant isolation:** every record belongs to a tenant, enforced with row-level security (RLS) in the
  database. One partner's data is not visible to another.
- **AI usage:** LLM calls are logged (module, purpose, model, tokens, credits). **Your data is not used
  to train models.**
- **Your rights:** data export and deletion requests directly in the product: `Settings → Privacy`.
- **Agreement:** Data Processing Agreement (DPA) → [`legal/dpa-en.md`](./legal/dpa-en.md) (Turkish:
  [`legal/dpa-tr.md`](./legal/dpa-tr.md)), in the product at `/en/compliance/dpa`.
- **Confidentiality:** please check with us before speaking publicly about unreleased features you see in
  the beta. Your project content is confidential to us and is not used as a reference without permission.

---

## 8. Support and contact

| Topic | Channel | Target response |
|---|---|---|
| Bug or blocker | Program channel (tag "P0" for P0) | § 5 table |
| Product question | Weekly sync or program channel | 1 business day |
| Account or permissions | Admin console → program channel if unresolved | 1 business day |
| Data or legal | Contact address in the DPA | 5 business days |

### Support addresses

| Purpose | Address |
|---|---|
| Support, bugs, account | **support@fabrika.dev** |
| Product feedback, feature requests | **feedback@fabrika.dev** |

> These addresses come from the `BETA_SUPPORT_EMAIL` / `BETA_FEEDBACK_EMAIL` environment
> variables ([`src/lib/beta/constants.ts`](../src/lib/beta/constants.ts)), so the invitation
> email and this guide cannot drift apart. The values above are the defaults when the
> variables are not set.

---

## 9. After the beta

- **Week 7:** price validation workshop — plans (Starter €59, Team €249, Business, Enterprise) and
  add-ons are tested with partners. Detail: [`BILLING.md`](./BILLING.md).
- **Week 8:** close-out — transition terms are given to beta partners in writing.
- **Data:** if you do not continue, your data is kept until you delete it; export stays available at all
  times. Deletion is requested from inside the product.

---

## Appendix A · Role matrix (summary)

| Role | Gate decision | Edit proposal | User management | Billing |
|---|---|---|---|---|
| Tenant Owner (TENANT_OWNER) | ✅ | ✅ | ✅ | ✅ |
| Tenant Admin (TENANT_ADMIN) | ✅ | ✅ | ✅ | — |
| Pipeline Manager (PIPELINE_MANAGER) | ✅ | ✅ | — | — |
| Writer (WRITER) | — | ✅ | — | — |
| Member (MEMBER) | — | view only | — | — |

> The KPI dashboard requires the `evaluate_gates` permission: Pipeline Manager and above can see it.

## Appendix B · FAQ

**Can I use it for a real application?** Yes, that is the point of the program. You make the official
submission yourself, in the portal.

**What happens when my credits run out?** AI features show a "top up credits" dialog; everything else
keeps working. Ask for more credits at the sync.

**How many people from my team can join?** No seat limit during the beta; fair use is expected.

**Can I work in Turkish?** Yes, the interface is TR/EN and the language switch is at the top right. The
Turkish version of this guide: [`BETA_GUIDE.md`](./BETA_GUIDE.md).

---

## Appendix C · Beta test accounts (development environment only)

The `fabrika-beta` tenant carries 10 fixed seats so the product can be exercised without real
partner data. **These are not real design partners** — real partners are provisioned into their
own tenants by `scripts/beta-onboarding.ts`.

| # | Email | Name | Role |
|---|---|---|---|
| 1 | alice@fabrika.test | Alice | PIPELINE_MANAGER |
| 2 | bob@fabrika.test | Bob | WRITER |
| 3 | charlie@fabrika.test | Charlie | MEMBER |
| 4 | dave@fabrika.test | Dave | MEMBER |
| 5 | eve@fabrika.test | Eve | MEMBER |
| 6 | frank@fabrika.test | Frank | MEMBER |
| 7 | grace@fabrika.test | Grace | MEMBER |
| 8 | heidi@fabrika.test | Heidi | MEMBER |
| 9 | ivan@fabrika.test | Ivan | MEMBER |
| 10 | judy@fabrika.test | Judy | MEMBER |

```bash
pnpm beta:seed-users              # create / converge (idempotent)
pnpm beta:seed-users --rollback   # delete only these 10 seats (tenant and demo data stay)
```

> **Why `.test`?** It is reserved by RFC 6761 and can never be delivered. `isPlaceholderEmail()`
> in `src/lib/beta/roster.ts` treats it as a placeholder, so the onboarding CLI's `--send` gate
> refuses to mail these seats. `.beta` is **not** a reserved TLD and would pass that gate.
