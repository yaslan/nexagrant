# E10: i18n Denetimi Tamamlama Spec'i

**Görev:** i18n anahtar denetimini CI'ya entegre etme ve eksik anahtarlar bulma  
**Tarih:** 2026-09-06  
**Tasarımcı:** DSE-EN (blok-zincir-dse)  
**Durum:** Sistem mevcut; spec/dokumentasyon yazıldı

---

## 1. Sorun ve Bağlam

ROADMAP E10: "i18n denetimi (`/i18n-check`), Lighthouse a11y ≥ 90, ..."
- Durum: Script (`scripts/i18n-check.ts`) var, Workflow (`.github/workflows/i18n-check.yml`) var, çalışıyor
- İssue: Denetim kuralları dokümante edilmemiş, yeni anahtar ekleme flow'u açık değil
- Hedef: Her PR'da Türkçe-İngilizce anahtar simetrisi doğrulanır, eksik unsur bloke eder

---

## 2. i18n Denetim Sistemi (Mevcut Durum)

### 2.1 Script: `scripts/i18n-check.ts`

**Giriş:**
```typescript
pnpm i18n:check
```

**Nasıl Çalışır:**

1. **Kod Taraması:** `src/` altındaki tüm `.ts` ve `.tsx` dosyasında `useTranslations` bulur
2. **Namespace Çıkarması:** Her dosyada `useTranslations('Namespace')` çekirir
3. **Anahtar Çıkarması:** `t('key')` pattern'i regex ile bulur
4. **Birleştirme:** Namespace ile anahtar birleştirilir (yani `Dashboard.title`)
5. **Karşılaştırma:**
   - Code'da bulunan anahtarlar (`codeKeys`)
   - `messages/tr.json`'daki anahtarlar (`turkishKeys`)
   - `messages/en.json`'daki anahtarlar (`englishKeys`)
6. **Rapor:** JSON ve human-readable format'ta çıktı

**Çıktı Türleri:**

```json
{
  "timestamp": "2026-09-06T...",
  "summary": {
    "totalKeysInCode": 145,
    "totalKeysInTurkish": 145,
    "totalKeysInEnglish": 145,
    "missingInTurkish": [],
    "missingInEnglish": [],
    "unusedInTurkish": [],
    "unusedInEnglish": [],
    "missingInBoth": []
  }
}
```

---

### 2.2 CI Workflow: `.github/workflows/i18n-check.yml`

**Tetikleyici:** PR açıldığında `src/` veya `messages/` değişirse
```yaml
on:
  pull_request:
    paths:
      - 'src/**'
      - 'messages/**'
      - 'package.json'
```

**Adımlar:**
1. Kod checkout
2. pnpm kurulumu
3. `pnpm i18n:check` koşturuluyor
4. Hata varsa PR'a comment yazıyor
5. Fail ediyor (PR merging'i bloke eder)

**PR Yorum Örneği:**
```
## 🌍 i18n Translation Audit

### ❌ Missing in BOTH languages (2)
- Dashboard.newFeature
- Settings.advancedOption

### ⚠️ Missing in Turkish (1)
- Help.faqLink

**Stats:** 145 used | 144 TR | 144 EN
```

---

## 3. Anahtar Adlandırma Pattern'i (Kural)

### 3.1 Format: `Namespace.key`

```typescript
// ✅ Doğru (namespace ile)
const t = useTranslations('Dashboard');
const title = t('title');  // → Dashboard.title

// ✅ Doğru (nested namespace)
const t = useTranslations('Settings.Account');
const label = t('label');  // → Settings.Account.label

// ❌ Yanlış (namespace olmadan root t() — kaçınılacak)
const t = useTranslations();
const msg = t('someKey');  // → someKey (pattern dışı)
```

### 3.2 Kebab-Case Kuralı

```typescript
// ✅ Doğru
t('accessDeniedTitle')  // Camel case (JS convention)
t('primary_button')     // Snake case (JSON dosyasında da aynı)

// ❌ Yanlış
t('access denied title')  // Boşluk
t('Access-Denied-Title')  // Upper case + dash (inconsistent)
```

### 3.3 Dosya Yapısı: `messages/{tr,en}.json`

```json
{
  "Dashboard": {
    "title": "...",
    "subtitle": "...",
    "kpiCard": {
      "totalProposals": "...",
      "hitRate": "..."
    }
  },
  "Settings": {
    "profile": "...",
    "billing": "..."
  }
}
```

**Kuralı:** Her `t('Namespace.key')` çağrısı `messages/tr.json` ve `messages/en.json`'de **aynı yolda** aynı yapıda olmalı.

---

## 4. Yeni Anahtar Ekleme Flow'u

### 4.1 Senaryo: "Yeni Dil Tanısalama" Özelliği Ekliyorum

**Adım 1:** Kod yazıyorum (component'te)

```tsx
// src/app/[locale]/(app)/[workspace]/settings/languages.tsx
export default function LanguagesPage() {
  const t = useTranslations('Settings.Languages');
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <button>{t('detectLanguage')}</button>
      <select>
        <option>{t('languageOptions.turkish')}</option>
        <option>{t('languageOptions.english')}</option>
      </select>
    </div>
  );
}
```

**Adım 2:** `messages/tr.json`'e ekliyorum

```json
{
  "Settings": {
    "Languages": {
      "title": "Dil Tercihleri",
      "detectLanguage": "Dili Otomatik Algıla",
      "languageOptions": {
        "turkish": "Türkçe",
        "english": "İngilizce"
      }
    }
  }
}
```

**Adım 3:** `messages/en.json`'e **aynı yapıda** ekliyorum

```json
{
  "Settings": {
    "Languages": {
      "title": "Language Preferences",
      "detectLanguage": "Detect Language Automatically",
      "languageOptions": {
        "turkish": "Turkish",
        "english": "English"
      }
    }
  }
}
```

**Adım 4:** Local test

```bash
pnpm i18n:check
# Çıktı: ✅ All translation keys are present in both languages!
```

**Adım 5:** PR aç

Workflow otomatik çalışır, rapor yok → ✅ CI pass

---

### 4.2 HATA: Sadece Türkçe eklemeyi unuttum

```json
// messages/tr.json
{
  "Settings": {
    "Languages": {
      "title": "Dil Tercihleri",
      "detectLanguage": "Dili Otomatik Algıla"
    }
  }
}

// messages/en.json → tanımlamadım ❌
```

PR açarım → Workflow koşar:

```
### ⚠️ Missing in English (1)
- Settings.Languages.detectLanguage

**Stats:** 45 used | 44 TR | 43 EN
```

**PR blocklı** ⛔ Merging engellendi. Çözüm: `messages/en.json`'e eklemeliyim.

---

## 5. Kontrol Listesi (CI Denetim Kuralları)

### 5.1 Fail Koşulları (PR Bloklama)

PR fail eder eğer:

- [ ] **missingInBoth.length > 0** — Anahtar kodda var ama ne Türkçe'de ne İngilizce'de. **Acil düzeltiş gerekli.**
- [ ] **missingInTurkish.length > 0** — Anahtar kodda ve İngilizce'de var ama Türkçe'de yok. **Çeviriye beklenildi.**
- [ ] **missingInEnglish.length > 0** — Anahtar kodda ve Türkçe'de var ama İngilizce'de yok. **İngilizce çevirisine beklenildi.**

### 5.2 Uyarılar (Bilgilendirme, Fail Değil)

PR pass eder ama PR'da comment:

- **unusedInTurkish.length > 0** — `messages/tr.json`'de var ama kodda kullanılmıyor (dead code/eski anahtar)
  - Eğer intentional ise (örn. "future feature") → yorum yaz
  - Eğer eski ise → cleanup PR'ından silinebilir

- **unusedInEnglish.length > 0** — `messages/en.json`'de var ama kodda kullanılmıyor

---

## 6. Workflow Yapılandırması (mevcut, verify)

### 6.1 Package.json Script

```json
{
  "scripts": {
    "i18n:check": "ts-node scripts/i18n-check.ts"
  }
}
```

✅ Mevcut ve çalışıyor.

### 6.2 CI Tetikleyici

```yaml
on:
  pull_request:
    paths:
      - 'src/**'      # Kod değişse (useTranslations çağrıları)
      - 'messages/**' # Dil dosyası değişse
      - 'package.json' # Anahtar alma dışında değiştirmedik, güvenlik için
  workflow_dispatch  # Manuel tetikleme
```

✅ Doğru scope. Gereksiz trigger'lar (CSS, Markdown) filtrelendi.

### 6.3 PR Yorum

Script fail ise GitHub Action'da:

```yaml
- name: Comment on PR
  if: github.event_name == 'pull_request' && steps.audit.outcome == 'failure'
```

✅ Fail durumunda yorum yaz.

---

## 7. Local Debugging

Geliştirici bir anahtarı eksik bırakmış olabilir. Ne yapıp?

```bash
# Adım 1: Scripti lokal koştur
pnpm i18n:check

# Çıktı örneği:
# ❌ Missing in BOTH languages (2):
#    - Dashboard.newFeature
#    - Settings.advancedOption

# Adım 2: messages/tr.json ve messages/en.json düzenle

# Adım 3: Tekrar koştur
pnpm i18n:check
# Çıktı: ✅ All translation keys are present in both languages!

# Adım 4: Git add + commit + push
git add messages/tr.json messages/en.json
git commit -m "feat(i18n): add Dashboard.newFeature and Settings.advancedOption translations"
```

---

## 8. Kontrol Listesi (Kanıt Disiplini)

- [ ] `scripts/i18n-check.ts` local'de çalışıyor (`pnpm i18n:check` → JSON output)
- [ ] `.github/workflows/i18n-check.yml` fail koşulları net (missingInBoth/Turkish/English)
- [ ] Tüm namespace'ler kod'da namespace ile başlatılıyor (`useTranslations('Namespace')`)
- [ ] `messages/tr.json` ve `messages/en.json` **simetrik** (aynı anahtar yapısı)
- [ ] CI: Eksik anahtar varsa PR fail ediyor ✅
- [ ] Dokümantasyon: Yeni anahtar eklenme flow'u açık

---

## 9. Ek: Unused Anahtar Temizliği (Optional)

Zaman zaman `unusedInTurkish`/`unusedInEnglish` listesi büyüyebilir. 

Temizlik PR'ı (cleanup, ayrı görev olabilir):

```bash
# Script ile kullanılmayan anahtarları listele
pnpm i18n:check

# Eski anahtarları messages/tr.json ve messages/en.json'den sil

# Commit: chore(i18n): remove unused translations
```

**Kural:** Unused anahtar = dead code. Denetimde uyarı olur, fakat PR pass eder (kill blocker değil).

---

## 10. Kaynaklar

- **Script:** `scripts/i18n-check.ts`
- **Workflow:** `.github/workflows/i18n-check.yml`
- **i18n Framework:** next-intl (`next-intl/server`)
- **Message Dosyaları:** `messages/tr.json`, `messages/en.json`
- **Package Script:** `pnpm i18n:check`

---

## 11. Sonuç

i18n denetim sistemi **tamamlandı ve çalışıyor**:
- ✅ Script: `scripts/i18n-check.ts` — anahtar çıkarma + raporlama
- ✅ Workflow: `.github/workflows/i18n-check.yml` — CI fail condition
- ✅ Kural: Namespace.key pattern, kebab-case
- ✅ Flow: Yeni anahtar ekleme adımları
- ✅ Dokumentasyon: Bu spec

**Mühendise:**
1. Workflow'un test ortamında çalıştığını doğrula (`workflow_dispatch` ile)
2. Test case: Kasıtlı olarak İngilizce çevirisi eksik bırak → PR fail olmalı
3. Cleanup: Unused anahtar uyarılarını ara sıra gözden geçir

