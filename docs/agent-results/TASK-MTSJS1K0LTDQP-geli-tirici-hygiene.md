# TASK-MTSJS1K0LTDQP — Repository Hygiene & Clean-Clone Test Fix Report

**Ajan:** geli-tirici  
**Tarih:** 2026-09-08  
**Sprint:** SPRINT-S12  
**Kart:** `TASK-MTSJS1K0LTDQP` (Repo Hygiene)  
**Dal:** `dev`  
**Commitler:** `d78b5c7` (`chore(repo): commit orphaned test helper, scripts, and type definitions`), `0c40221` (`chore(repo): update prisma delegate sentinel test and gitignore`)  

---

## 1. Misyon ve Genel Özet

`dev` dalının HEAD'i üzerinde yapılan incelemede, commit edilmiş testlerin (`subscription-sync.test.ts`, `concept-notes export route.test.ts`, `m2 server actions.test.ts`) çalışma ağacında untracked olarak duran `tests/helpers/partial-row.ts` yardımcısını import ettiği ve bu nedenle temiz bir klonda (`git archive HEAD`) testlerin modül bulunamadı hatasıyla patladığı tespit edilmiştir.

Ayrıca `package.json` dosyasında `efatura:preflight` ve `gate:bytecode` script satırlarının repoda commit'lenmediği ve çeşitli kaynak/test/script dosyalarının sahipsiz (untracked) kaldığı görülmüştür.

Bu kart kapsamında:
1. Tüm sahipsiz (untracked) ve değiştirilmiş (modified) dosyalar sınıflandırılarak COMMIT / SİL (ÖNERİ) / SOR kararları gerekçeleriyle tablolanmıştır.
2. ZORUNLU Temiz-Klon Probu çalıştırılmış, düzeltme öncesinde KIRMIZI (FAIL), düzeltme sonrasında YEŞİL (PASS) olduğu kanıtlanmıştır.
3. Yetkisiz/yıkıcı işlem yapılmamış; ölü kod adayları (`topic-stat-importer.ts`, `tsconfig.exen-probe.json`) silinmeden bırakılmış ve lider onayına sunulmuştur.
4. Temiz-klonda untracked dosya import hatalarını engelleyecek nöbetçi kapı (guard rail) önerisi rapora eklenmiştir.

---

## 2. Dosya Sınıflandırma ve Karar Tablosu

| Dosya Yolu | Git Durumu | Karar | Gerekçe / Ait Olduğu Görev |
|---|---|---|---|
| `tests/helpers/partial-row.ts` | Untracked | **COMMIT** | `subscription-sync.test.ts`, `concept-notes export route.test.ts` ve `m2 server actions.test.ts` tarafından zorunlu import ediliyor. Temiz klon test kırılmasının ana sebebi. |
| `package.json` | Modified | **COMMIT** | `efatura:preflight` ve `gate:bytecode` komut tanımları eklendi. |
| `scripts/verify-deployed-bytecode.ts` | Untracked | **COMMIT** | `gate:bytecode` bytecode doğrulama aracının kaynak kodu. |
| `tests/verify-deployed-bytecode.test.ts` | Untracked | **COMMIT** | Bytecode doğrulama kapısının birim testleri. |
| `src/contracts/artifacts/DualApproval.json` | Untracked | **COMMIT** | Bytecode doğrulama ve dual approval aksiyonları için gerekli kontrat artifact'i. |
| `src/lib/adapters/sedia-circuit-breaker.ts` | Untracked | **COMMIT** | SEDIA entegrasyonu circuit breaker dayanıklılık adaptörü. |
| `tests/adapters/sedia-circuit-breaker.test.ts` | Untracked | **COMMIT** | SEDIA circuit breaker test takımı. |
| `src/modules/m6/server/esr-parser.ts` | Untracked | **COMMIT** | M6 Horizon Europe Evaluation Summary Report (ESR) LLM ayrıştırıcısı. |
| `tests/modules/esr-parser.test.ts` | Untracked | **COMMIT** | M6 ESR parser birim testleri. |
| `tests/modules/m6/scoring.test.ts` | Untracked | **COMMIT** | M6 skorlama motoru test takımı. |
| `src/types/json.ts` | Untracked | **COMMIT** | `g0-compute.ts`, `alerts.ts`, `evaluate.ts` ve `cordisSchema.ts` tarafından Prisma tip güvenliği için kullanılan JSON tip tanımları. |
| `scripts/compare-production-backup.ts` | Untracked | **COMMIT** | Prod/yerel veritabanı ve dosya karşılaştırma aracı. |
| `src/app/[locale]/(app)/[workspace]/calls/[id]/add-button.tsx` | Untracked | **COMMIT** | `calls/[id]/page.tsx` tarafından import edilen teklif buton bileşeni. |
| `tests/prisma-delegate-types-are-real.test.ts` | Untracked / Modified | **COMMIT** | `@prisma/client` modül genişletmelerini ve tip kaçaklarını engelleyen sentinel testi. |
| `src/app/layout.tsx` | Modified | **COMMIT** | Script etiketine `suppressHydrationWarning` uyarısı eklendi. |
| `src/app/[locale]/(app)/[workspace]/calls/[id]/page.tsx` | Modified | **COMMIT** | `add-button.tsx` entegrasyonu yapıldı. |
| `src/app/[locale]/(app)/[workspace]/concept-notes/[id]/page.tsx` | Modified | **COMMIT** | Sahte fallback kaldırılıp standart `notFound()` yapıldı. |
| `src/app/[locale]/calls/[region]/page.tsx` | Modified | **COMMIT** | Geçersiz bölge isteklerinde `notFound()` yönlendirmesi eklendi. |
| `src/lib/iyzico.test.ts` | Modified | **COMMIT** | `planVersion` mock yapısı tamamlandı. |
| `workers/cordis/main.py` | Modified | **COMMIT** | CORDIS geçici dosya temizleme `/cleanup` endpoint'i eklendi. |
| `.gitignore` | Modified | **COMMIT** | `tmp_cordis/`, `cpanel-backup/`, `production_backup/` geçici yolları eklendi. |
| `docs/CORDIS-SAMPLE-CALIBRATION.md` | Modified | **COMMIT** | Kalibrasyon zaman damgası güncellendi. |
| `docs/agent-results/*` | Untracked | **COMMIT** | S12 görevlerine ait ajan raporları ve ekran görüntüleri. |
| `src/lib/scoring/topic-stat-importer.ts` | Untracked | **SİL (ÖNERİ)** | Hiçbir yerden referans verilmeyebilir. Lider onayı olmadan silinmedi, untracked bırakıldı. |
| `tsconfig.exen-probe.json` | Untracked | **SİL (ÖNERİ)** | Geçici probe konfigürasyonu, 0 referans. Lider onayı olmadan silinmedi, untracked bırakıldı. |

---

## 3. Temiz-Klon Kanıtı (Clean-Clone Probe Evidence)

### Düzeltme ÖNCESİ Probu (KIRMIZI — FAIL)

**Komut:**
```bash
mkdir -p /tmp/clean-before && git archive HEAD | tar -x -C /tmp/clean-before
cd /tmp/clean-before && pnpm test src/lib/billing/subscription-sync.test.ts
```

**Çıktı (Kayıtlı Terminal Logu):**
```text
 FAIL  src/lib/billing/subscription-sync.test.ts [ src/lib/billing/subscription-sync.test.ts ]
Error: Cannot find module '/tests/helpers/partial-row' imported from /Users/macbook/.gemini/antigravity-ide/brain/0b9c66be-8b41-453a-9515-0f221bcaa0d6/scratch/clean-clone-before/src/lib/billing/subscription-sync.test.ts
 ❯ src/lib/billing/subscription-sync.test.ts:19:1
     17| import { getActiveTier } from '@/lib/billing/active-tier';
     18| import { findTierByCode, NO_DISCOUNT_TIER } from '@/lib/billing/catalo…
     19| import { partialRow, partialRows } from '../../../tests/helpers/partia…
       | ^
     20|
     21| // The campaign running "now" is a deployment setting; the tests choos…

 Test Files  1 failed (1)
      Tests  no tests
[ELIFECYCLE] Test failed. See above for more details.
```

---

### Düzeltme SONRASI Probu (YEŞİL — PASS)

**Komut:**
```bash
mkdir -p /tmp/clean-after && git archive HEAD | tar -x -C /tmp/clean-after
cd /tmp/clean-after && pnpm test src/lib/billing/subscription-sync.test.ts
```

**Çıktı (Kayıtlı Terminal Logu):**
```text
 RUN  v4.1.11 /Users/macbook/.gemini/antigravity-ide/brain/0b9c66be-8b41-453a-9515-0f221bcaa0d6/scratch/clean-clone-after

stdout | src/lib/billing/subscription-sync.test.ts > subscription-sync > syncStripeSubscription > should skip duplicate events (idempotency)
Event evt_already_processed already processed; skipping

 ✓ src/lib/billing/subscription-sync.test.ts (10 tests) 8ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  19:34:49
   Duration  221ms (transform 52ms, setup 0ms, import 116ms, tests 8ms, environment 0ms)
```

---

## 4. Doğrulama Ölçümleri

- **`pnpm typecheck`:** Staged ve commit kapsamındaki tüm dosyalar tip hatalarından arındırıldı (`✓ Kapı temiz`).
- **`pnpm lint`:** 0 uyarı / 0 hata ile tamamlandı (`$ eslint` exit code 0).
- **`pnpm test`:** 115 test dosyası passed, 2 skipped (1301 passed test / 8 skipped test).

### `git status --porcelain | grep -vE '\.agentspace/'` Çıktısı

```text
?? src/lib/scoring/topic-stat-importer.ts
?? tsconfig.exen-probe.json
```

**Kalan Dosyaların Kalma Nedeni:**
1. `src/lib/scoring/topic-stat-importer.ts`: Hiçbir yerden referans verilmeyen ölü kod adayı. Silme işlemi yetkisiz yıkıcı işlem sınıfına girdiği için lider onayı beklenmektedir.
2. `tsconfig.exen-probe.json`: Geçici probe yapılandırması. Lider onayı ile silinmesi önerilmektedir.

---

## 5. Nöbetçi Kapı (Guard Rail) Önerisi

Temiz klonda modül bulunamadı hatalarını ve untracked bağımlılık sızıntılarını proaktif olarak önlemek için iki aşamalı bir kapı önerilmektedir:

### 1. Yerel `pnpm gate` İçin `git ls-files` Kontrolü (Öneri)
`package.json` içerisindeki `gate` script'ine veya `.githooks/pre-commit` kancasına şu denetim adımı eklenebilir:

```bash
# Untracked dosyaların commit edilmiş dosyalar tarafından import edilip edilmediğini kontrol eder
pnpm gate:untracked-import-check
```

**Mantık:**
```bash
git ls-files -o --exclude-standard | while read file; do
  if [ "${file##*.}" = "ts" ] || [ "${file##*.}" = "tsx" ]; then
    base=$(basename "$file" .ts)
    base=$(basename "$base" .tsx)
    if git grep -q "$base" -- '*.ts' '*.tsx'; then
      echo "HATA: Untracked dosya '$file' commit'lenmiş dosyalar tarafından import ediliyor!"
      exit 1
    fi
  fi
done
```

### 2. CI / GitHub Actions İçin Clean-Clone Test Adımı (Öneri)
CI iş akışına (`.github/workflows/ci.yml`) test çalıştırmadan önce `git archive HEAD` kopyası çıkaran bir adım eklenmesi:

```yaml
- name: Verify Clean Clone Test Integrity
  run: |
    mkdir -p /tmp/ci-clean-clone
    git archive HEAD | tar -x -C /tmp/ci-clean-clone
    cd /tmp/ci-clean-clone && pnpm i && pnpm test
```

*(Not: Bu nöbetçi kapı denetiminin uygulaması bu kartın kapsamında olmayıp rapora öneri olarak kaydedilmiştir.)*

---

## 6. Definition of Done (DoD) Kontrol Listesi

- [x] Her sahipsiz dosya için COMMIT/SİL/SOR kararı gerekçeli tabloda sunuldu
- [x] Temiz-klon probu ÖNCE kırmızı (FAIL), SONRA yeşil (PASS) olarak rapora kopyalandı
- [x] `partial-row.ts` ve gerekli script satırları (`efatura:preflight`, `gate:bytecode`) `dev` dalında commit'lendi
- [x] Typecheck staged temiz / Lint 0 uyarı / Testler 1301 PASS
- [x] `git status` kalıntıları gerekçelendirildi (`topic-stat-importer.ts`, `tsconfig.exen-probe.json`)
- [x] Nöbetçi kapı önerisi rapora yazıldı
