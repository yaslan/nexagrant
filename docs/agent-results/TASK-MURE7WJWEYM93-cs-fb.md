# TASK-MURE7WJWEYM93 · cs-fb: Kullanım şartları düzeltmesi

**Hüküm:** TAMAMLANDI. Crw-fb incelemesi tarafından belirtilen D-1 through D-5 beş temel çelişki düzeltildi. Metinler artık koddaki gerçek davranışla tutarlı.

**Tip:** Bug fix (inceleme sonrası düzeltme)
**Platform:** mac (darwin). Değişiklikler yalnız metin i18n dosyaları ve sürüm sabiti; platforma bağlı kod yok. Windows ve Linux davranışı aynı olacaktır.

İlgili dallar: origin/dev'den, cs-fb/terms-rewrite (commit 0acf736b, 2026-10-02 20:58 UTC). Ağaç: `/Users/macbook/alan/FONBRIDGE-wt-csfb-terms`.

---

## 1. Ne yapıldı

Crw-fb tarafından inceleme raporunda (AKTAR-MURBCJ0A-1-crw-fb-terms.md) belirtilen 5 bulgu (D-1 through D-5) ve metin eşleme tablosunun eksikliği giderildi:

1. messages/tr.json ve messages/en.json içindeki legal.terms.* anahtarları koddaki gerçek davranışa uyarlandı
2. src/lib/legal/consent-documents.ts içinde sürüm 2026-10-02.1 → 2026-10-02.2 (düzeltme commit'i)
3. Typecheck, i18n check ve relevant unit testler koşuldu (tümü yeşil)
4. Her madde için "eski metin → yeni metin → dayandığı dosya:satır" kanıt tablosu oluşturuldu

---

## 2. Kanıt

### 2.1 Madde-bazlı düzeltme tablosu (D-1 through D-5)

| # | Bulgu | Eski Metin (TR) | Yeni Metin (TR) | Dayandığı Kod | Dosya:Satır |
|---|-------|---|---|---|---|
| D-1 | Hesap açma: OAuth vs e-posta/şifre | "e-posta ve şifre ile açılır" | "Google OAuth ile açılır" | ADR-0006: "Google is the only OAuth provider"; Credentials provider only if demoLoginEnabled=false in prod | src/lib/auth.ts:366-379 |
| D-2a | Ajans kanalı: veri erişimi | "ajansın ortak portalına erişim hakkı kazanır (ADR-0006). Ajans ilişkisi...portal üzerinden yönetilir." | "çalışma alanı ajansa bağlanır. Bu bağ ajansa çalışma alanının verilerine erişim sağlamaz" | Schema: Tenant.agencyId kayıtta yazılır, ajansa okuma hakkı vermiyor. ADR-0006 OAuth kararı, ajans portalı değil. | prisma/schema.prisma:52-55, ADR-0006 |
| D-2b | Partner portalı: davet kodu vs magic token | "/portal/partner/[token] ortak portalına erişim sağlar. Ajans tarafından paylaşılan davet kodu" | "Proje sahibi konsorsiyum ortaklarına...tek kullanımlık portal bağlantısı paylaşabilir...ApplicationPart başına üretilen magic token" | Token magicTokenHash ile ApplicationPart'a bağlanır (davet koduyla değil). Endpoint addBudgetLineByToken ortak bütçe satırı eklemek için. | src/app/[locale]/portal/partner/[token]/page.tsx:21-30,47,55,62 |
| D-3a | İade: portal işlemi | "faturalama portalından iade talebi başlatabilirsiniz" | "İade talebi için info@fonbridge.com adresine yazabilirsiniz" | Kod içinde refund akışı yok. Portal yalnız Stripe abonelik/ödeme yönetimi (create-portal-session.ts:28) | grep -rn refund src/ → sonuç yok; src/lib/billing/create-portal-session.ts:7-8 (comment: "manage billing, update payment method, view invoices") |
| D-3b | İade: 5-10 gün rakamı | "5–10 iş günü içinde geri ödeme gerçekleştirilir" | Silindi. İletişim adresine referans. | Hiçbir kaynağa dayanmayan uydurma rakam | — |
| D-4a | Fiyat bildirimi | "Fiyat değişiklikleri 30 gün önceden bildirilir" | "Yapay zeka kredileri...ayda bir yenilenir. Tanıtım kodları..." (30 gün teklifi kaldırıldı) | Fiyat değişikliği e-postası ya da bildirimi gönderen kod yok. | grep -rn "30 days\|30 gün" src/lib src/app (sonuç: webhook, davet temizliği; fiyat bildirimi yok) |
| D-4b | Şart değişikliği bildirim | "mevcut kullanıcılara e-posta ile bildirim yapılır ve yeniden kabul istenmesi gerekebilir" | "Yeni kayıtlara geçerli olan şartlar uygulanır." | TERMS_OF_SERVICE yalnız kayıt/login ekranlarında okunuyor (AuthCard, accept-invite). Yeniden kabul akışı yok; mevcut kullanıcılara e-posta gitmiyor. | src/app/[locale]/login/AuthCard.tsx:13,180,530; src/app/[locale]/accept-invite/continue/page.tsx:9,156 |
| D-5 | Silme kapsamı: "tüm veriler" | "30 gün sonra tüm veriler silinir" | "Kişisel hesap bilgileriniz silinir. Çalışma alanına ait belgeler...kurumda kalır. Faturalama...anonimleştirilerek saklanır." | Silme işi: (a) dosyalar silinmiyor (tenant silinene kadar kalıyor), (b) aiUsageLog anonimleştiriliyor deleted değil. (c) çalışma alanı silindiğinde siliniyor. | src/lib/jobs/tasks/users-scheduled-deletion.ts:104-125; docs/legal/processing-register.md §15 ("The files go when their tenant is deleted") |

### 2.2 Metin değişiklikleri (EN versiyonu)

Aynı düzeltmeler messages/en.json'da da yapılmıştır:

- scopeBody: "email address and password" → "Google OAuth"
- agencyBody/partnerBody: Davet kodu / ortak portalı yanlış anlatımı → Magic token, konsorsiyum ortağı bütçe satırları
- refundBody: Portal + 5-10 gün → İletişim adresi
- billingBody: 30 gün bildirimi kaldırıldı; "renew each billing period" → "renew monthly" (kod: credits-monthly-grant.ts)
- changesBody: Mevcut kullanıcı e-postası kaldırıldı
- terminationBody: "All data" → Kişisel veriler siliniyor, workspace content kalıyor, audit kayıtları anonimleştiriliyor

### 2.3 Sürüm güncellemesi

- src/lib/legal/consent-documents.ts:71 — version: '2026-10-02.1' → '2026-10-02.2'
- Kural (consent-documents.ts:9-17): Metin değişti → sürüm artırılır. İlk ortamda bu sürümle kayıt yapılmadıysa `.2` kalabilir; güvenli yol `.2`'ye geçmek.

### 2.4 Testler ve kontroller

```
$ npx prisma generate
✔ Generated Prisma Client v7.10.0

$ npx tsc --noEmit
(0 hata)

$ npm run i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves

$ npx vitest run tests/registration-consent.test.ts tests/i18n.test.ts
 Test Files  2 passed (2)
      Tests  12 passed (12)
```

### 2.5 Commit ve diff

```
$ git log --oneline -1
0acf736b Fix Terms of Service to match actual code behavior — D-1 through D-5

$ git show --name-only
 messages/en.json
 messages/tr.json
 src/lib/legal/consent-documents.ts
```

Diff satırı sayıları:
- messages/tr.json: 5 değişiklik (scopeBody, agencyBody, partnerBody, billingBody, changesBody, refundBody, terminationBody)
- messages/en.json: 5 değişiklik (aynı anahtarlar)
- src/lib/legal/consent-documents.ts: 1 değişiklik (sürüm)

---

## 3. Değişen dosyalar

1. `messages/tr.json` — legal.terms.* i18n anahtarları
2. `messages/en.json` — legal.terms.* i18n anahtarları
3. `src/lib/legal/consent-documents.ts` — TERMS_OF_SERVICE.version

Bu dal (`cs-fb/terms-rewrite`) daha önce fe-fb gates merge'ünü (1b43b434) de içeriyor (crw-fb raporu §4).

---

## 4. Riskler

- **Kayıtlı kabullere etkisi:** Sürüm artışı sonrası yeni kayıtlar 2026-10-02.2 yazar. Eski satırlar 2026-10-02.1 kalır (consent-documents.ts kural). Girişte sürüm kontrolü yok, bu yüzden mevcut kullanıcılar yeni metni kabul etmeden kullanmaya devam eder — bu rulun bilerek açık bıraktığı davranış.
- **Merge öncesi CI:** Dal Linux'ta koşulmamıştır (bu machine macOS). Merge sırasında CI'da hata olma riski düşük (yalnız metin ve sürüm); typecheck ve testler yeşil.

---

## 5. Riskler çevirisi / Hukuk

- **D-2 "ajansa erişim yok" beyanı:** ADR-0006 OAuth kararıyla karışmasını önlemek için "(ADR-0006)" atfı kaldırıldı. Ajans kanalı ve partner portalı artık açık şekilde farklı işlevler olarak tarif edilmiş.
- **D-4 "bildirim yok" beyanı:** Taahhüt edilen e-posta bildirim kaldırıldı. Hukuk, şart değişikliğinde notification yöntemi hakkında karar vermeli (şu an açık soru listesi).
- **D-5 "veri silinmiyor" açıklığı:** "Tüm veriler silinir" iddiası kaldırıldı. Artık işleme envanteriyle (processing-register §15) tutarlı: Kişisel veriler siliniyor, kurumsal içerik kalıyor.

---

## 6. Açık sorular (hukuk / patron karar bekleniyor)

1. **Şart değişiklik bildirim:** Notification yöntemi (e-posta, login ekranı, portal banner) kimin karar verecek? Şu an sadece yeni kayıtlara uygulanıyor.
2. **Cayma hakkı (D-3):** Kurum dışı (bireysel) alıcı var mı? Tüketici ön bilgilendirmesi (TDBK) gerekli mi?
3. **AI çıktısı sorumluluğu:** Eski "başvuru sahibi doğrulamakla yükümlü" hükmü silindi (D-1 tarafından gözlenen değişiklik, bu görevde düzeltilmedi).

---

## 7. Sonraki adım

- Hukuk: Bu düzeltme tarafından inceleme için rapor gönderil ve onay aranır
- Merge: Lider, dalı origin/dev'e merge etmeden önce bu raporu gözden geçirir ve hukuk onayını alır
- QA: Canlı ortamda dev sayfası (localhost:3917) render edilip kontrol edilir (Ö-2 dil hatalarından ayrı olarak — bu görevde düzeltilmedi)

---

## 8. Definition of Done

- [x] D-1 (OAuth): scopeBody düzeltildi (TR/EN)
- [x] D-2 (ajans/ortak): agencyBody, partnerBody düzeltildi (TR/EN), ADR-0006 atfı kaldırıldı
- [x] D-3 (iade): refundBody düzeltildi (TR/EN), portal + rakamlar kaldırıldı
- [x] D-4 (bildirim): billingBody, changesBody düzeltildi (TR/EN), taahhütler kaldırıldı
- [x] D-5 (silme): terminationBody düzeltildi (TR/EN), kapsam açıklandı
- [x] Sürüm güncellemesi (2026-10-02.2)
- [x] Typecheck, i18n check, unit tests yeşil
- [x] Commit yapılmış (0acf736b)
- [x] Madde ↔ kod:satır kanıt tablosu hazırlandı (§2.1)
- [x] Sonuç dosyası oluşturuldu: docs/agent-results/TASK-MURE7WJWEYM93-cs-fb.md
- [x] Platform beyanı: mac (darwin), Windows/Linux davranış aynı

**Platform:** mac (darwin). Değişiklik yalnız metin i18n ve sürüm sabiti; platforma bağlı kod yok. Tüm platformlarda davranış aynı olacaktır. Windows ve Linux'ta koşulmadı (yalnız macOS cihaz mevcuttur); ancak metin değişikliklerinin platform etkisi yoktur.

---

**Rapor tarihi:** 2026-10-02 20:58 UTC · **Yazı:** cs-fb · **Dalı:** cs-fb/terms-rewrite (commit 0acf736b)
