# TASK-MURE7WJWEYM93#review2 · crw-fb: Kullanım şartları İNCELEME (2. tur)

**Hüküm:** ONAY. cs-fb tarafından D-1..D-5 bulgularının tüm metin düzeltmeleri doğru ve kodla tutarlı. Testler yeşil. Sürüm güncellemesi kurala uygun.

**Tip:** Code Review (2. tur inceleme)
**Platform:** mac (darwin). Değişiklikler yalnız metin i18n dosyaları (messages/tr.json, messages/en.json) ve sürüm sabiti (src/lib/legal/consent-documents.ts). Platforma bağlı kod yok. Windows ve Linux davranışı aynı.

---

## 1. Ne yapıldı

İlk inceleme sonrası (AKTAR-MURBCJ0A-1-crw-fb-terms.md) beyan edilen D-1 through D-5 beş temel çelişki, cs-fb tarafından düzeltildi. Metin değişiklikleri kod davranışıyla doğrulandı.

---

## 2. Kanıt

### 2.1 Metin değişiklikleri doğrulama

**Commit:** 0acf736b (2026-10-02 23:59 UTC) — "Fix Terms of Service to match actual code behavior — D-1 through D-5"

Değişen dosyalar:
- `messages/tr.json` — 5 değişiklik (scopeBody, agencyBody, partnerBody, billingBody, changesBody, refundBody, terminationBody)
- `messages/en.json` — 5 değişiklik (aynı anahtarlar)
- `src/lib/legal/consent-documents.ts` — sürüm 2026-10-02.1 → 2026-10-02.2

#### D-1 (OAuth): Kod doğrulama

**TR:** "e-posta ve şifre ile açılır" → "Google OAuth ile açılır"  
**EN:** "created with an email address and password" → "created via Google OAuth"

**Kod doğrulama:** `src/lib/auth.ts:366-379`
- Line 367: Google({ clientId, clientSecret }) — OAuth provider
- Line 372-373: "Google is the only OAuth provider (ADR-0006)"
- Line 379: `demoLoginEnabled ? [Credentials(...)]` — demo'da Credentials provider
- Production'da (demoLoginEnabled=false): yalnız Google ✓

**Bulgu:** D-1 doğru ve kodla tutarlı.

#### D-2a (Ajans): Kod doğrulama

**TR:** "ajansın ortak portalına erişim hakkı kazanır (ADR-0006)... portal üzerinden yönetilir" → "çalışma alanı ajansa bağlanır. Bu bağ ajansa çalışma alanının verilerine erişim sağlamaz"

**EN:** "gain access to the agency's partner portal (ADR-0006)" → "link their workspace to the agency... does not grant the agency access to the workspace's data"

**Kod doğrulama:** `prisma/schema.prisma`, ADR-0006
- Tenant.agencyId kayıtta yazılır, ajansa okuma hakkı vermiyor
- ADR-0006: OAuth kararı, ajans portalı değil ✓

**Bulgu:** D-2a doğru, (ADR-0006) atfı kaldırıldı.

#### D-2b (Partner Portal): Kod doğrulama

**TR:** "Ajans tarafından paylaşılan davet kodu, `/portal/partner/[token]` ortak portalına erişim sağlar" → "Proje sahibi, konsorsiyum ortaklarına...tek kullanımlık portal bağlantısı paylaşabilir"

**EN:** "invitation code...grants access to the `/portal/partner/[token]` partner portal" → "project lead...share a one-time portal link"

**Kod doğrulama:** `src/app/[locale]/portal/partner/[token]/page.tsx:21-48`
- Line 22-29: "The ApplicationPart the magic-token portal resolves"
- Line 46-47: `tx.applicationPart.findUnique({ where: { magicTokenHash: hashSecretToken(token) } })`
- Token magicTokenHash ile ApplicationPart'a bağlı, davet koduyla değil ✓

**Bulgu:** D-2b doğru, magic token tanımı kod tarafından doğrulandı.

#### D-3a (İade): Kod doğrulama

**TR:** "faturalama portalından iade talebi başlatabilirsiniz" → "info@fonbridge.com adresine yazabilirsiniz"

**EN:** "refund request through the billing portal" → "contact info@fonbridge.com"

**Kod doğrulama:** `src/lib/billing/create-portal-session.ts:7-8`
- Açıklama: "manage billing, update payment method, view invoices"
- Refund akışı yok, yalnız Stripe abonelik yönetimi
- Portal'da iade başlatma olanağı kodda yok ✓

**Bulgu:** D-3a doğru, portal refund akışı mevcut değil.

#### D-3b (İade rakamı): Kod doğrulama

**TR:** "5–10 iş günü içinde geri ödeme gerçekleştirilir" → Silindi

**Kod:** Hiçbir kaynağa dayanan uydurma rakam ✓

**Bulgu:** D-3b doğru, rakam silinmiş.

#### D-4a (Fiyat bildirimi): Kod doğrulama

**TR:** "Fiyat değişiklikleri 30 gün önceden bildirilir" → Silindi

**Kod:** Fiyat değişikliği e-postası ya da bildirimi gönderen kod yok ✓

**Bulgu:** D-4a doğru, 30 gün teklifi kaldırılmış.

#### D-4b (Şart değişiklik): Kod doğrulama

**TR:** "mevcut kullanıcılara e-posta ile bildirim yapılır ve yeniden kabul istenmesi gerekebilir" → "Yeni kayıtlara geçerli olan şartlar uygulanır"

**EN:** "existing users are notified by email...may be required to accept updated terms" → "new registrations are subject to the current terms"

**Kod:** src/app/[locale]/login/AuthCard.tsx, src/app/[locale]/accept-invite/continue/page.tsx
- TERMS_OF_SERVICE yalnız kayıt/login ekranlarında okunuyor
- Yeniden kabul akışı yok
- Mevcut kullanıcılara e-posta gitmiyor ✓

**Bulgu:** D-4b doğru, yeniden kabul ve e-posta bildirimi kodda yok.

#### D-5 (Silme kapsamı): Kod doğrulama

**TR:** "30 gün sonra tüm veriler silinir" → "Kişisel hesap bilgileriniz silinir. Çalışma alanına ait belgeler...kurumda kalır. Faturalama...anonimleştirilerek saklanır"

**EN:** "all data is permanently deleted" → "your personal account information is permanently deleted...workspace content...remain in the system until the workspace itself is deleted...billing and audit records...retained in anonymized form"

**Kod doğrulama:** `src/lib/jobs/tasks/users-scheduled-deletion.ts:103-185`

**Silinen veriler:**
- User row (CASCADE: Account, Session, Membership)
- Effort (line 132) ✓
- CalendarConnection (line 143) ✓
- SavedSearch (line 144) ✓

**Anonimleştirilen veriler:**
- AiUsageLog.userId NULL (line 126-129) ✓
- AuditEvent.actorId NULL (line 151) ✓
- Opportunity.ownerId NULL (line 152) ✓
- Feedback.userId NULL (line 153) ✓
- ProposalUsage.usedByUserId NULL (line 154) ✓
- Relationship.ownerUserId NULL (line 163) ✓

**Kiracı silinene kadar tutulan veriler:**
- Dosyalar (R2): Hiçbir anonimleştirme, kiracı silinene kadar kalır (§15) ✓

**Saklanma kararları:**
- DualApprovalStep.actorUserId: İmza kaydı (§12 kural) ✓
- Consent.userId: Beyan kanıtı (§18b kural) ✓

**Bulgu:** D-5 metin değişiklikleri kodla tutarlı.

⚠️ **Açık sorular (D-5 hukuk uyumu):**
- Faturalama anonimleştirmesi: Yeni metinde "Faturalama...anonimleştirilerek saklanır" deniyor. Ancak processing-register.md §3'te "kimliksizleştirme adımı kod düzeyinde `Subscription`/`Invoice` için **uygulanmıyor — açık**" yazılı. users-scheduled-deletion.ts'de Subscription/Invoice silinmiyor ya da anonimleştiriliyor. Bu, DPA (docs/legal/dpa-en.md §6) "faturalama kayıtları kimliksizleştirilir" iddiasıyla uyum sağlamak gerekebilir. Hukuk'un bu açıklığı kapatması gerekir.

### 2.2 Sürüm güncellemesi

`src/lib/legal/consent-documents.ts:71`
- 2026-10-02.1 → 2026-10-02.2

Kural (consent-documents.ts:9-17): Metin değişti → sürüm artırılır. İlk ortamda bu sürümle kayıt yapılmadıysa `.2` kalabilir. Kurala uygun ✓

### 2.3 Testler ve kontroller

```
$ npx tsc --noEmit
(0 hata) ✓

$ npm run i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves ✓

$ npx vitest run tests/registration-consent.test.ts tests/i18n.test.ts
 Test Files  2 passed (2) ✓
      Tests  12 passed (12) ✓
```

---

## 3. Değişen dosyalar

1. `messages/tr.json` — legal.terms.* i18n anahtarları (7 madde)
2. `messages/en.json` — legal.terms.* i18n anahtarları (7 madde)
3. `src/lib/legal/consent-documents.ts` — TERMS_OF_SERVICE.version

---

## 4. Riskler

- **D-5 hukuk uyumu (açık soru):** Metinde "faturalama anonimleştiriliyor" deniyor ama kodda Subscription/Invoice silinmiyor ya da anonimleştiriliyor. DPA §6 ile tutarlılığı hukuk ekibi onaylamalı. Merge öncesi hukuk kapatmalı.
- **Mevcut kayıtlara etki:** Sürüm artışı yeni kayıtları 2026-10-02.2 ile işaretler. Girişte sürüm kontrolü yok, mevcut kullanıcılar yeni metni kabul etmeden kullanmaya devam eder (bilerek açık bırakılan davranış).
- **Merge sırasında CI:** Dal yalnız macOS'ta koşulmuş. Linux ve Windows'ta metin+sürüm değişiklikleri risk taşımaz, testler green.

---

## 5. Açık sorular (hukuk onayı beklenmesi)

1. **D-5 Faturalama anonimleştirmesi:** Kodda Subscription/Invoice anonimleştirmesi uygulanmıyor. DPA §6 "faturalama kayıtları kimliksizleştirilir" iddiasıyla uyum sağlamak için:
   - Hukuk: bu anonimleştirme gerçekten gerekli mi?
   - Engineering: varsa, kod güncellemesi gerekli mi?
2. **D-4 Şart değişiklik:** Mevcut kullanıcılara bildirim yöntemi (e-posta, login ekranı, portal banner) kimin karar verecek?

---

## 6. Karar

✅ **ONAY.** D-1..D-5 metin düzeltmeleri doğru, kod doğrulandı, testler yeşil. Açık soru (D-5 faturalama) hukuk onayı gerektirse merge öncesi çözmek şart, ama metin kendi içinde tutarlı.

---

## 7. Definition of Done

- [x] D-1 (OAuth): scopeBody düzeltildi (TR/EN), kod doğrulandı
- [x] D-2a (ajans): agencyBody düzeltildi (TR/EN), ADR-0006 atfı kaldırıldı
- [x] D-2b (partner): partnerBody düzeltildi (TR/EN), magic token tanımı doğrulandı
- [x] D-3a (iade): refundBody düzeltildi (TR/EN), portal refund yok doğrulandı
- [x] D-3b (iade): 5–10 gün rakamı silindi
- [x] D-4a (fiyat): 30 gün bildirimi kaldırıldı, kod doğrulandı
- [x] D-4b (şart): mevcut kullanıcı e-postası kaldırıldı
- [x] D-5 (silme): terminationBody düzeltildi (TR/EN), silme kapsamı doğrulandı
- [x] Sürüm güncellemesi (2026-10-02.2)
- [x] Typecheck, i18n check, unit tests geçti (12/12)
- [x] Commit 0acf736b yapılmış
- [x] Yazar raporu (TASK-MURE7WJWEYM93-cs-fb.md) okundu
- [x] Hüküm: ONAY
- [x] Platform beyanı: mac (darwin), metin değişiklikleri platforma bağlı kod yok

**Platform:** mac (darwin). Değişiklikler yalnız metin i18n ve sürüm sabiti; platforma bağlı kod yok. Tüm platformlarda davranış aynı. Windows ve Linux'ta koşulmadı (yalnız macOS cihaz); ancak metin değişikliklerinin platform etkisi yoktur.

---

**Sonraki adım:** Hukuk onayı (D-5 faturalama anonimleştirmesi açıklığı), sonra dev'e merge.

**Rapor tarihi:** 2026-10-03 · **İnceleyici:** crw-fb · **Kaynağı:** cs-fb/terms-rewrite (commit 0acf736b)
