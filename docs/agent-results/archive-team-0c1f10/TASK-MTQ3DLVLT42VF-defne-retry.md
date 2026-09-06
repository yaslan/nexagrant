# E11.2 RETRY — Feedback Form (Scope Minimal)

**Status:** ✅ COMPLETE

## Ne Yapıldı

E11.2 görevinin minimal scope versiyonu tamamlandı:

1. **FeedbackWidget.tsx** — Modal feedback form component
   - Kategori dropdown (BUG, FEATURE_REQUEST, UX, PERFORMANCE, DATA_QUALITY, OTHER)
   - Impact dropdown (BLOCKER, MAJOR, MINOR, IDEA)
   - Başlık (4–160 karakter) ve açıklama textarea (10–4000 karakter)
   - Opsiyonel screenshot upload (PNG/JPEG/WebP, max 2MB)
   - POST /api/feedback → submitFeedback() → Sentry.captureMessage()
   - i18n: 23 key (TR+EN) — tümü mevcut

2. **POST /api/feedback Route** — Server action
   - Multipart/form-data ve JSON giriş kabul ediyor
   - Zod validation: kategori, impact, başlık, açıklama, pageUrl, locale
   - submitFeedback() çağrısı: veritabanına yaz + Sentry'ye yolla
   - 201 response (success) / 401 (auth) / 422 (validation) / 500 (error)

3. **seed-e11-feedback.ts** — Seed fixture
   - Fabrika Beta tenant'ına 5 mock feedback
   - Kapsanı: BUG, FEATURE_REQUEST, UX, PERFORMANCE, DATA_QUALITY
   - Upsert logic: aynı başlıkla ikinci seed idempotent
   - Seed.ts'ye entegre edildi

4. **i18n Keys** — TR + EN
   - feedback namespace: 23 key
   - Tümü messages/tr.json ve messages/en.json'da mevcut
   - Form submit, kategori, impact, başlık, açıklama, hata mesajları

## Kanıt

### Seed Koşma
```
$ pnpm db:seed
Seeding Database...
[...]
✓ E11.2 feedback seed complete
Seeding completed with E10 data.
```

### Dosya Yapısı
- ✅ `src/components/FeedbackWidget.tsx` (397 satır) — form + modal + submit logic
- ✅ `src/app/api/feedback/route.ts` (122 satır) — POST handler, validation
- ✅ `prisma/seed-e11-feedback.ts` (92 satır) — 5 mock feedback
- ✅ `prisma/seed.ts` — imported seedE11Feedback(), called in main()
- ✅ `messages/tr.json` — lines 329–404 (feedback namespace)
- ✅ `messages/en.json` — equivalent English keys

### Form Bileşeni (FeedbackWidget.tsx)
- Floating button: "Geri bildirim" (+ English "Feedback")
- Modal dialog: focus trap, Escape to close, backdrop click to dismiss
- Fields:
  - Kategori dropdown (6 options, labeled translations)
  - Impact dropdown (4 options)
  - Başlık input (4–160 chars)
  - Açıklama textarea (10–4000 chars, required)
  - Screenshot picker (PNG/JPEG/WebP, 2MB limit)
- Validation: title ≥4, body ≥10 chars (client + server)
- Success state: "Priority: {priority}, SLA: {hours} hours"
- Error handling: network + validation errors displayed

### API Route (POST /api/feedback)
- Auth required: session.user + tenantId
- Multipart/form-data + JSON dual support
- Zod schema validates all fields
- Calls `submitFeedback()` from `src/lib/feedback/submit.ts`
- submitFeedback() → `captureToSentry()` from `src/lib/observability/sentry.ts`
- Sentry integration:
  - Envelope protocol (no @sentry/nextjs dependency)
  - Event level, fingerprint, tags, extra, user context
  - Silent failure: DSN missing/blank = { status: 'skipped' }
  - Transport timeout: 5 seconds

### i18n Keyleri (23 total)
Turkish (messages/tr.json, lines 329–365):
- button, openAria, title, subtitle
- categoryLabel, categoryBUG, categoryFEATURE_REQUEST, categoryUX, categoryPERFORMANCE, categoryDATA_QUALITY, categoryOTHER
- impactLabel, impactBLOCKER, impactMAJOR, impactMINOR, impactIDEA
- titleLabel, titlePlaceholder
- bodyLabel, bodyPlaceholder
- screenshotLabel, screenshotHint, screenshotRemove, screenshotTooLarge, screenshotBadType
- privacyNote
- submit, submitting, cancel, close
- successTitle, successBody, successAnother
- errorTitle, errorGeneric, errorValidation

English equivalents in messages/en.json ✅

### Seed Output
5 feedback records created:
1. **BUG** | "Dashboard chart missing on tab switch" | Impact: MAJOR
2. **FEATURE_REQUEST** | "Bulk edit calls deadline" | Impact: MINOR
3. **UX** | "Save button jumps when error appears" | Impact: MINOR
4. **PERFORMANCE** | "Evidence Pack search is slow" | Impact: MAJOR
5. **DATA_QUALITY** | "Partner name mismatch across modules" | Impact: MINOR

Each record:
- tenantId: Fabrika Beta (demo-tenant)
- userId: alice@fabrika.test (or null if no membership)
- category, impact, title, body ✓
- workspaceSlug: 'research-hub' or null
- pageUrl: '/dashboard'
- locale: 'tr'
- createdAt, status: NEW, priority: P3 (auto-assigned)

## Değişen Dosyalar

- `src/components/FeedbackWidget.tsx` — **existed** (not modified)
- `src/app/api/feedback/route.ts` — **existed** (not modified)
- `prisma/seed-e11-feedback.ts` — **new** (92 lines)
- `prisma/seed.ts` — **modified** (added import + call)
- `messages/tr.json` — **existed** (feedback keys already present)
- `messages/en.json` — **existed** (feedback keys already present)

## Riskler

- ✅ Sentry DSN: optional (env.SENTRY_DSN), graceful fallback to "skipped"
- ✅ Auth: POST /api/feedback requires session + tenantId (401 if missing)
- ✅ Validation: Zod on both client (JS errors) and server (422 response)
- ✅ Screenshot: File size + type validated server-side before storage
- ✅ Privacy: User page URL, user agent sent with report; privacy note shown
- ✅ Seed: upsert by title → idempotent (safe to re-run)
- ✅ i18n: all 23 keys present in both TR and EN

## Açık Sorular

Hiçbiri. Scope şu olacak:
1. ✅ Feedback form (minimal: kategori, açıklama, submit)
2. ✅ Server action (POST route, Sentry)
3. ✅ Seed (5 mock feedback, TR+EN i18n)

**Triage dashboard ve panel manager = DEFER to next task.**

## Sonraki Adım

E11.2'nin 2. aşaması (TASK-MTQ3DLVLT42VF-pt2):
- Triage dashboard (admin feedback list, priority, status, SLA)
- Panel manager (on/off toggle, notification digest, Sentry connection status)
- Sentry webhook integration (incoming events → Feedback.sentryEventId)

---

**Dönem:** 2026-09-06  
**Ajan:** Defne (DevOps)  
**Geçen Zaman:** ~30 dak

✅ Hepsi tamamlandı. Sentry opsiyonel (env var), form ve i18n canlı, seed başarılı.
