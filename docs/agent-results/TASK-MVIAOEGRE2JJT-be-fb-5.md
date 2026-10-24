# TASK-MVIAOEGRE2JJT (FO-113) — be-fb, düzeltme turu 5

**Platform:** mac (darwin, Darwin 27.0.0). Windows ve Linux'ta koşulmadı.

**Hüküm:** DONE:st1 — tam `pnpm gate` yeşil (exit 0), `--no-verify` kullanılmadı, PR base `dev`, merge yapılmadı.

## Ne yapıldı

1. **Rebase:** `be-fb/fo113-interreg-review` (@7f15859c) yeni worktree'ye (`.claude/worktrees/fo113-rebase3`, dal `be-fb/fo113-rebase3`) alındı ve `origin/dev` üstüne rebase edildi. 147 commit temiz geçti.
2. **Kırmızı e2e kökü (`tests/e2e/module-entry-points.spec.ts:77`):** Kök neden dalın kendisiydi — partners sayfasının `<h1>` başlığı “Partner Intelligence” ifadesini içermiyordu. Düzeltme `7228f09f` ile yapıldı: başlık `partnersPage.title` i18n anahtarına geri alındı (TR “…CORDIS Ortak Arama”, EN “…CORDIS Search”). Test gevşetilmedi. Kırmızı→yeşil: isolated DB'de bu spec 4/4 geçti.
3. **D1 (sabit metin):** `PartnerFilters.tsx` placeholder ve faaliyet tipi seçenekleri `t()` anahtarlarına taşındı (tr+en). `page.tsx` filtre chip'leri de `t('chipSearch'|'chipCountry'|'chipType'|'minProjectsTag')`. Partners dosyaları için `i18n-baseline.json` girişi yok; sayı 0.
4. **D2 (ICU plural):** Sayılar `count` olarak sayı tipiyle geçiliyor, `foundAll` ve `minProjectsOption` ICU `plural` kullanıyor. EN'de “Found 0 Interreg Partner Profiles”, “Min. 1 Project”.
5. **Gerçek tarayıcı kontrolü:** `/en/<ws>/partners?q=metu&country=DE&activity_type=HES` (is_interreg + min_projects=1) — Türkçe metin yok, “Min. 1 Project” görünüyor. `/tr` doğru Türkçe (`Arama: "metu"`, `Ülke: DE`). Ekran görüntüleri: `docs/agent-results/TASK-MVIAOEGRE2JJT-evidence/en-partners-filters-chips.png`, `tr-partners-filters-chips.png`.
6. **Tam gate:** Aşağıdaki Kanıt bölümü.

## Kanıt (ham çıktı)

Tam gate, izole ortam: Postgres `127.0.0.1:5620` (kendi konteynerim `fo113-rebase3-pg`), MinIO `127.0.0.1:9100` (kendi konteynerim `fo113-rebase3-minio`, `test-evidence` + `test-public` bucket'ları, CI'daki gibi anonim okuma), `CI=true`, `KEEP_EU_LIVE=1`, `E2E_PORT=3111`. Paylaşılan :5433 ve paylaşılan MinIO/Redis dokunulmadı.

```
Test Files  390 passed | 2 skipped (392)
     Tests  5149 passed | 54 skipped (5203)
  2 skipped
  398 passed (7.4m)
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
GATE_EXIT=0
```

Log: `$TMPDIR/gate3.log` (proje kökünde değil, `/private/tmp/claude-501/...` altında).

**e2e skipped sayısı: 2.** Kaynaklar:
- `tests/e2e/admin-documents-upload.spec.ts:152` — “LIVE: … uploads a small PDF …”; `test.skip(process.env.E2E_LIVE_EMBED !== '1', 'spends OpenAI embedding calls; opt in with E2E_LIVE_EMBED=1')`. Bilinçli opt-in, CI'da da bu değişken set edilmiyor.
- `tests/e2e/price-lock-deeper-campaign.spec.ts:303` — “the locked tenant is quoted the deeper campaign…”. Atlanma nedenini doğrulamadım (testin kendi koşulunda açık bir `test.skip` satırı görmedim); açık soru olarak bırakıldı.

Gate sırasında `pnpm test` içinde `keep-eu-sync.live` önceki turdaki hatayı vermedi (`KEEP_EU_LIVE=1` ile geçti). İlk denemedeki kırmızı nedenler: (a) `KEEP_EU_LIVE` eksikti; (b) MinIO env yoktu, 5 e2e blog-görsel testi `R2_*`/“CI must run this against the MinIO public bucket” ile düştü. (b) için izole MinIO kaldırılıp CI'daki bucket düzeni kuruldu; sonra gate yeşil geçti.

Typecheck, lint (0 hata, 4 önceden var olan uyarı), i18n:check, rls:check, rls:bypass-check, rls:verify --require-db, db:rls-role, alerts:check — hepsi zincirde çalıştı, gate exit 0.

## Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/partners/page.tsx` — chip ve sayım i18n'e taşındı (5a6c12fd, 7228f09f ile birlikte)
- `partners/PartnerFilters.tsx` — placeholder ve faaliyet tipi seçenekleri (5a6c12fd)
- `messages/en.json`, `messages/tr.json` — `partnersPage.title`, chip ve ICU plural anahtarları
- `docs/agent-results/TASK-MVIAOEGRE2JJT-evidence/*.png` — ekran görüntüleri (yeni)
- `docs/agent-results/TASK-MVIAOEGRE2JJT-be-fb-5.md` — bu rapor

## Riskler

- **Paylaşılan DB'ye yazım riski (dürüst not):** Önceki bir `db:rls-role` çağrısı `DATABASE_URL_RLS_TEST` ile `localhost:5433` üzerinde bağlantı denetimi yaptı. Yalnız bağlantı kontrolü olduğunu ve yazmadığını düşünüyorum; kanıtlamadım. Bundan sonraki tüm koşular yalnız `127.0.0.1:5620` ile yapıldı.
- Partners sayfasında iki kozmetik sorun var, engelleyici değil: veri kaynağı etiketinde ham tanımlayıcı (`cordis_organization…`) görünüyor; faaliyet seçici “HES (Higher Educatio…” şeklinde kırpılıyor.
- İzole MinIO ve Postgres konteynerleri hâlâ çalışıyor (kendi konteynerlerim).

## Açık sorular

- `price-lock-deeper-campaign.spec.ts:303` neden atlandı? Testin kendi koşulunu ayrıca incelemek gerekiyor.
- Kozmetik iki sorun (kaynak etiketi ve kırpılan seçici) bu dalda mı, ayrı bir işte mi düzeltilecek?

## Sonraki adım

1. Bu raporu ve yeni ekran görüntülerini commit'le (`git commit -- <yollar>`; `git add -A` yok).
2. `be-fb/fo113-rebase3` dalını `be-fb/fo113-interreg-review`'a `--force-with-lease=be-fb/fo113-interreg-review:7f15859c` ile it.
3. PR'ı base `dev` ile aç veya güncelle. Merge yok.
4. Kartı `review`'a al.
