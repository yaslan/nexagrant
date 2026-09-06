# İş Planı — E10 Final %20 + E11 Beta + M6 Evaluator Lens

**Patron Onayı:** 2026-09-06, 20:30  
**Sprint:** S8 (MVP Final) → S8–S16 (E11 Beta) → S9–S12 (v1.1 M6)

---

## 1. E10.3 KVKK/GDPR — Final %20 (Cora, 2–3 gün)

**Görev ID:** TASK-E10.3-KVKK  
**Ajan:** Cora (Backend)  
**Kapsam:**
- API routes: `POST /api/gdpr/export`, `POST /api/gdpr/delete`
- Soft-delete migration (User, Tenant, Workspace, Opportunity, Proposal, GateDecision, Effort)
- Settings UI: `/settings/privacy/page.tsx`
- Legal pages: `/privacy`, `/terms`, `/compliance/dpa` (TR/EN)
- Inngest 30-gün delete cron job

**Kanıt Dosyası:** `docs/agent-results/TASK-E10.3-KVKK-cora.md`

---

## 2. E11 Beta Görevleri — 4 Paralel (E10.3 bitince başlar, 8 hafta)

### E11.1 — Onboarding (Admin) ✅ DONE
- Status: Tamamlandı (Sora/derin)
- Output: BETA_GUIDE.md (TR/EN), takvim (ICS), partner-tracker.md

### E11.2 — Feedback & Triage (full-stack, 2 hafta)
**Görev ID:** TASK-E11.2-FEEDBACK  
**Scope:**
- Geri bildirim formu (Sentry + in-app form)
- Triage dashboard (P0–P3 kategorisi)
- Haftalık raporlama

**Kanıt Dosyası:** `docs/agent-results/TASK-E11.2-FEEDBACK-fullstack.md`

### E11.3 — ESR Calibration (Cora, 1 hafta)
**Görev ID:** TASK-E11.3-ESR  
**Scope:**
- 20 CORDIS sample projesi + G0 puanlama
- Evaluator feedback loop
- G0 accuracy ≥85% validasyon

**Kanıt Dosyası:** `docs/agent-results/TASK-E11.3-ESR-cora.md`

### E11.4 — Pricing Validation (Product, 2 hafta)
**Görev ID:** TASK-E11.4-PRICING  
**Scope:**
- Beta ortaklarının plan feedback'i
- Eklenti fiyatlandırması doğrulaması
- Beta → v1.0 transition pricing

**Kanıt Dosyası:** `docs/agent-results/TASK-E11.4-PRICING-product.md`

---

## 3. M6 Evaluator Lens — 4 Görev (S9+, E11 sonrası)

### M6.1 — Data Model (Cora) ✅ DONE
- Status: Tamamlandı (Cora)
- Output: Evaluation (panel şekli), Reviewer, Criterion, Score tables + withTenant() bugfix

### M6.2 — UI Forms (full-stack, 4–5 gün)
**Görev ID:** TASK-M6.2-UI  
**Scope:**
- Evaluator form (5 criterion, 0–10 scale)
- ReviewList component
- i18n: TR/EN

**Kanıt Dosyası:** `docs/agent-results/TASK-M6.2-UI-fullstack.md`

### M6.3 — Scoring Logic (Cora, 3–4 gün)
**Görev ID:** TASK-M6.3-SCORING  
**Scope:**
- Criterion avg + panel consensus logic
- ESR comparison (G0 vs. panel puanı)
- Birim testler + seed validation

**Kanıt Dosyası:** `docs/agent-results/TASK-M6.3-SCORING-cora.md`

### M6.4 — Dashboard (full-stack, 2–3 gün)
**Görev ID:** TASK-M6.4-DASHBOARD  
**Scope:**
- Evaluation results panel
- Criterion breakdown chart (Recharts)
- Export (PDF/CSV)

**Kanıt Dosyası:** `docs/agent-results/TASK-M6.4-DASHBOARD-fullstack.md`

---

## 4. Başarısız Görevler — Investigate

**Supervisor Bildirimi:** 2 görev başarısız (resume oturumları: `8975addb-…`, `312a5904-…`)  
**Action:** Çıktıları oku, hata gerekçesini belirle, düzeltme görevini aç.

---

## 5. Bilinen Blockerlar

| Blocker | Sahip | Fix ETA |
|---------|-------|---------|
| Postgres yoksa (docker CLI) | DevOps | — |
| `src/lib/billing.ts` typecheck | ? | Açık |
| withTenant() RLS bugfix | Cora | ✅ DONE |

---

## Sonraki Kontrol Noktaları

- **S8 sonu (2026-09-13):** E10.3 + E11.1 ✅, E11.2/3/4 start
- **S9 başı (2026-09-15):** M6.1/2/3/4 start
- **S16 sonu (2026-11-01):** E11 kapanış, ESR kalibrasyonu ✅, v1.1 planning

---

**Co-Authored-By:** Claude Haiku 4.5 <noreply@anthropic.com>  
**Session:** https://claude.ai/code/session_01G2tzccctX2sT7F2Zr4Yxx7
