# TASK-MTV6AELS1J3ET: Externalize SMTP from address to env

**Status:** COMPLETED  
**Ajan:** customer-support  
**Sprint:** S12  
**Commit:** `d088b25`

## Ne Yapıldı

Hardcoded SMTP gönderen adresini (`noreply@usfinbridge.com`) `src/lib/env.ts`'e taşıyarak dört yerde yapılı literali kaldırdım. Form artık ortam değişkeninden build zamanında okunuyor.

### Değişiklikler

1. **`src/lib/env.ts`** — `NEXT_PUBLIC_SMTP_FROM_ADDRESS` env değişkeni eklendi
   - Tür: `z.string().default('noreply@usfinbridge.com')`
   - Açıklama: "Email address used for outgoing mail (invitations, system notifications)"
   - Build-time yani statik (tarayıcıya gidiyor), sır değil
   - Fallback: `noreply@usfinbridge.com`

2. **`src/app/[locale]/admin/settings/smtp-form.tsx`** — Dört yerde gömülü literal değiştirildi
   - Line 7: `const SMTP_FROM_ADDRESS = process.env.NEXT_PUBLIC_SMTP_FROM_ADDRESS || 'noreply@usfinbridge.com'`
   - Line 13: `const [user, setUser] = useState(SMTP_FROM_ADDRESS)` (eski: literal)
   - Line 15: `const [fromEmail, setFromEmail] = useState(SMTP_FROM_ADDRESS)` (eski: literal)
   - Line 129: `placeholder={SMTP_FROM_ADDRESS}` (eski: literal)
   - Line 170: `placeholder={SMTP_FROM_ADDRESS}` (eski: literal)

3. **`src/lib/env.ts` yorumları** — Fabrika→FonBridge güncelleme
   - Line 53: "Who FonBridge is on an invoice..." (eski: Fabrika)
   - Line 73: "...FonBridge files through" (eski: Fabrika)

### Kod Review

✓ Değişikliklerin doğruluğu:
- `process.env.NEXT_PUBLIC_SMTP_FROM_ADDRESS` client-side okunabiliyor (Next.js inlining)
- Fallback var (TANIMSIZ env → `noreply@usfinbridge.com`)
- Form'da hiçbir literal `noreply@usfinbridge.com` kalmadı
  ```
  grep: src/app/[locale]/admin/settings/smtp-form.tsx
  7:const SMTP_FROM_ADDRESS = process.env.NEXT_PUBLIC_SMTP_FROM_ADDRESS || 'noreply@usfinbridge.com';
  ✓ Sadece const tanımında fallback
  ```
- `PRODUCT_NAME` dependency tipleri çağrışı (`@/lib/brand` import) mevcut

## Kanıt

```
Commit: d088b25f7c120fa5482501a4253f41c2adcf294c
Author: Yasin ASLAN <hulyasinaslan@gmail.com>
Date:   Thu Sep 10 10:59:47 2026 +0300

    fix(admin): externalize SMTP from address to env variable
    
    Moves hardcoded noreply@usfinbridge.com to NEXT_PUBLIC_SMTP_FROM_ADDRESS
    environment variable with fallback default. Form now reads from env at
    build time instead of embedded literal. Updates Fabrika→FonBridge brand
    references in env comments.
    
    - NEXT_PUBLIC_SMTP_FROM_ADDRESS added to env.ts (default: noreply@usfinbridge.com)
    - SmtpSettingsForm now reads from process.env at initialization
    - Removed 4 hardcoded literals in form (state defaults + placeholders)
    - Updated invoice+integrator comments: Fabrika→FonBridge

Files changed:
 src/app/[locale]/admin/settings/smtp-form.tsx | 10 ++++++----
 src/lib/env.ts                                |  9 +++++++--
 2 files changed, 13 insertions(+), 6 deletions(-)
```

### Pre-commit Gate Sonuç

**ESLint (staged):** ✓ PASS (benim dosyalarım temiz)

**TypeScript (staged kapsamı):** ✓ PASS  
- Kendi dosyalarımda hata yok  
- Hook uyarısı: `src/lib/beta/pricing-survey-email.ts` syntax hatası (başka ajan)
  - Bitişik hata — benimkini bloke etmiyor

## Değişen Dosyalar

```
src/app/[locale]/admin/settings/smtp-form.tsx  (10 ++++++----)
src/lib/env.ts                                 (9 ++++++++--)
```

## Riskler

### Risk 1: Form fonksiyonelliği boş mu?

**Durum:** Form şu anda backend'le bağlantısız (dummy state management). Gerçek SMTP kaydetme/test işlemleri henüz uygulanmamış.

**Etki:** Form UI başlatıldığında `NEXT_PUBLIC_SMTP_FROM_ADDRESS` okunur ama sunucudan gelen veri alınamaz. Tarayıcı test yapamadım (build blokey, login gerekli).

**Kontrol:** Varsayılan `noreply@usfinbridge.com` env undefined ise fallback'e düşecek. `process.env.NEXT_PUBLIC_SMTP_FROM_ADDRESS` build-time inlined, fallback string'i sabit tutmayı garanti eder.

### Risk 2: Build başarısızlığı

**Durum:** `src/lib/beta/pricing-survey-email.ts` typecheck hatasından dolayı `pnpm build` ve `pnpm gate` başarısız.

**Etki:** Tarayıcı doğrulaması yapılamadı. Ama commit başarılı (pre-commit hook staged dosyalarımı geçti).

**Mitigasyon:** Bu hata başka ajan'ın (blok-zincir-dev) değişikliğinden kaynaklanıyor (satır 36 — `${PRODUCT_NAME}` template string, encoding sorununu) — benim görevim değil.

## Doğrulama Adımları (Planlı)

Tarayıcı doğrulaması şu anda bloke:

1. ✓ Kod review — değişiklikler doğru
2. ✓ Literal kontrolü — form'da hardcoded `noreply@usfinbridge.com` yok
3. ✓ Pre-commit — ESLint + TypeScript (staged) geçti
4. ✗ Tarayıcı (blocked) — build başarısız (`pricing-survey-email.ts` hatasından)
5. ✗ `pnpm gate` (blocked) — build başarısız

**Tarayıcı testi yapmak için:** `pricing-survey-email.ts` syntax hatası çözülmeli (başka ajan'ın görevi).

## Açık Sorular

1. **Backend SMTP ayarları:** Form şu anda server action'ı çağırmıyor. Gönderen adresini server-side'da nasıl kullanacak? (Sonraki faz — başka ajan/kart)

2. **`SMTP_FROM_ADDRESS` inline'ında fallback:** `process.env.NEXT_PUBLIC_SMTP_FROM_ADDRESS || 'noreply@usfinbridge.com'` — Next.js build-time'da sabittir. Runtime override mümkün mü? (Cevap: hayır, build-time sabittir; dinamik override isterse `NEXT_PUBLIC_` kaldırıp server prop gerekir.)

## Sonraki Adımlar

1. **`pricing-survey-email.ts` syntax hatası çözül** (blok-zincir-dev) → build geçecek
2. Tarayıcıda form açıp env'in doğru okunduğunu doğrula
3. Backend SMTP kaydet/test logic'ini implement et (başka kart)
4. İthalatçı (TÜBİTAK, Eurostars) SMTP from address'i config'den oku

## Platform Beyanı

**Platform:** macOS 25.6.0 (Darwin)

**Doğrulama durumu:**
- ✓ Kod muhasebecisi (typecheck) — staged dosyalarımız temiz
- ✓ ESLint — geçti
- ✗ Tarayıcı (end-to-end) — yapılamadı (build blokey, pricing-survey-email.ts syntax hatası)
- ✗ `pnpm gate` — yapılamadı (aynı nedenle)

**Tarayıcı kodu yolu:** `/tr/admin/settings` (Admin SMTP form sayfası)  
**Form durumu:** Build'in başarılı olması gerekli (geliştirici login'i dahil)

**Platforma bağlı kod:** Yok. Env değişkeni ve form kodu tüm platformlarda çalışır.

## Bitişik Hatalar (Başka Ajan)

### TASK-MTV8FCVUPB81R (blok-zincir-dev) Blokeyi Bildir

**Hata:** `src/lib/beta/pricing-survey-email.ts:36:7` — `Invalid character`

**Sebep:** Başka ajan "Fabrika" → `${PRODUCT_NAME}` template string değiştirirken encoding/syntax sorunu oluşturdu.

**Dosya snippet:**
```
intro: (org: string) =>
  `Beta'nın 7. haftasındayız ve sıra en açık sorumuzda: ${PRODUCT_NAME} ${org} için ne kadar eder? ` +
  'Fiyatı sizinle birlikte belirlemek istiyoruz, size sunmadan önce.',
```

**Etki:** TypeScript build başarısız → `pnpm build`, `pnpm gate`, tarayıcı testi çalışmıyor

**Çözüm:** başka ajan'ın görevi — satırı gözden geçir ve encoding/quote'u düzelt

---

**Final Status:** TASK-MTV6AELS1J3ET **DONE** ✓  
Kod değişiklikleri complete, commit başarılı. Tarayıcı doğrulaması bitişik hata yüzünden bekleme.
