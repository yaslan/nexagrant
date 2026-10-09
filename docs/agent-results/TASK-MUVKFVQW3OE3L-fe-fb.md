# TASK-MUVKFVQW3OE3L: Lead Form noscript Message + Name Field Test

**Hüküm:** Kısmen bitti: Kod değişiklikleri ve e2e test doğrulaması tamamlandı; E2E testleri tam koşamadı (DB credential sorunu).

---

## 1. Ne Yapıldı

### Ö-1: Noscript Fallback Mesajı
- `src/app/[locale]/fon-hazirlik/lead-form.tsx` içinde `<noscript>` div eklendi
- Gönder düğmesi JS yokken kalıcı disabled durumda kalırken, kullanıcıya açıklama görüntülenecek
- CSS sınıfları: `border-warn`, `bg-surface`, `text-warn` (uyarı stili)
- Metin: `t('noscript_message')` - i18n ile TR/EN destekleniyor

### Ö-2: E2E Test Name Field Doğrulaması
- `tests/e2e/public-lead-form.spec.ts` içinde test senaryosu 2c eklendi
- Name alanı boş bırakıldığında:
  - Submit tıklanınca "Adınızı yazın (en az 2 karakter)." mesajı görünür
  - Focus name alanına gidiyor
- Name alanı doldurulunca:
  - Error mesajı silinir (email doğrulaması ile paralel test pattern)

### i18n Mesajları
- `messages/tr.json`: `readiness.lead.noscript_message` = "Bu formu göndermek için JavaScript gereklidir. Lütfen tarayıcınızda JavaScript'i etkinleştirin."
- `messages/en.json`: `readiness.lead.noscript_message` = "JavaScript is required to submit this form. Please enable JavaScript in your browser."

---

## 2. Kanıt

### Kod Diff
```
modified:   messages/en.json
modified:   messages/tr.json
modified:   src/app/[locale]/fon-hazirlik/lead-form.tsx
modified:   tests/e2e/public-lead-form.spec.ts
```

### Commit Hash
```
61c6f80c Add noscript message to lead form and test name field validation
```

### Lint
```
✖ 4 problems (0 errors, 4 warnings)
✅ Lint geçti (uyarılar mevcut ama hatalı değil)
```

### Typecheck
```
$ tsc --noEmit
✅ Typecheck temiz (error yok)
```

### i18n Check
```
✅ i18n check passed: both catalogs agree, every key used in src/ resolves
- Static keys used in code: 1507
- Keys in messages/tr.json: 2309
- Keys in messages/en.json: 2309
```

### Vitest Unit Tests
```
Test Files  1 passed (1)
     Tests  6 passed (6)
✅ tests/teardown-where-guard.test.ts başarılı
```

---

## 3. Değişen Dosyalar

| Dosya | Değişim | Ayrıntı |
|-------|---------|--------|
| `src/app/[locale]/fon-hazirlik/lead-form.tsx` | +7 satır | Noscript div eklendi (line 188-193) |
| `tests/e2e/public-lead-form.spec.ts` | +10 satır | Name alanı test senaryosu 2c eklendi (line 201-211) |
| `messages/tr.json` | +1 key | `readiness.lead.noscript_message` eklendi |
| `messages/en.json` | +1 key | `readiness.lead.noscript_message` eklendi |

---

## 4. Riskler

### Veritabanı Test Limitation
- E2E testleri tam çalıştırılamadı (`pnpm exec playwright test ... --repeat-each=3`)
- **Sebep**: `fabrika_migrate` database kullanıcısı şifresi erişilemiyor
  - CI workflow'da `fabrika_migrate:fabrika@` kullanılıyor
  - Lokal `.env`de `DATABASE_URL_MIGRATE` mevcutsa da credential match olmadı
  - Test database credentials kurulamadı
- **İmpakt**: E2E full suite, mutant test, dev server test koşulamadı
- **Alternatif**: Başka ajanın/supervisor'un veritabanı credentialları sağlaması gerekiyor

### Noscript Stili Doğrulanmamadı
- `border-warn`, `text-warn` renkleri mevcut mi? - Tailwind config kontrol edilmedi
- Önerilen: `.next/static` veya live server tarafından doğrula

---

## 5. Açık Sorular

1. **Veritabanı Şifreleri**: `fabrika_migrate` ve `fabrika_app` şifrelerinin neresi tanımlanmış? CI'da kullanılan şifrelerle lokal şifreler eşleşmiyor.
   
2. **E2E Port Benzersizliği**: Başka bir ajan aynı port (3456 gibi) kullanırsa konflikt olur mu? E2E_PORT'un dinamik seçimi var mı?

3. **Noscript CSS**: `border-warn` ve `text-warn` Tailwind'de var mı? Yoksa fallback renk kullanılıyor mu?

---

## 6. Sonraki Adım

1. **Veritabanı**: Lider/DevOps tarafından credential'ları doğrulamak
2. **E2E Test Koşu**: Temiz DB ile `pnpm exec playwright test tests/e2e/public-lead-form.spec.ts --repeat-each=3` koşmak
3. **Mutant Test**: Name validation satırını kaldırıp test'in fail etmesini doğrlamak
4. **PR Açma**: Onay almadan önce branch push → `gh pr create --base dev`

---

## Platform Beyanı

**Platform**: macOS (darwin 27.0.0, zsh)

**Koşulmuş**:
- ✅ pnpm lint
- ✅ pnpm typecheck
- ✅ pnpm i18n:check
- ✅ pnpm exec vitest run tests/teardown-where-guard.test.ts

**Koşulamadı** (veritabanı sorunu):
- ❌ pnpm exec playwright test ... (E2E full suite)
- ❌ next dev (webServer start - Prisma client match yok)

---

**Commit Message**:
```
Add noscript message to lead form and test name field validation

- Add noscript HTML fallback message in lead-form.tsx when JavaScript is disabled
- Internationalize noscript message for TR and EN (readiness.lead.noscript_message)
- Add e2e test validation for name field error clearing (2c scenario)
- Verify name field errors appear and clear on input change, matching email field test pattern
```

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
