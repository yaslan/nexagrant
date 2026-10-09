---
sözleşme: 3
biçim: html
sayfa: TASK-MV14L1MA361XL-be-fb.html
görev: TASK-MV14L1MA361XL
kod: TASK-MV14L1MA361XL
ajan: be-fb
motor: claude
tip: ölçüm
okur: ekip
hüküm: Bitti: tam pnpm test (CI eşdeğeri ortamda), M7 e2e 14/14 ve TR/EN/mutlu yol gerçek tıklama görüntüleri yeşil; PR #68 draft'tan çıkarıldı, merge edilmedi.
platform: mac (Darwin, Chromium headless 1234). Kod platforma bağlı değil (sunucu eylemi + React istemcisi); Windows/Linux koşulmadı, çünkü bu makinede yalnız mac var. Platforma özgü kod yolu yok.
sürüm: 2
tarih: 2026-10-09T15:52:17.058Z
---

# CE-690 · M7 "modül kullanılamıyor" mesajı: yerel DB ile tam doğrulama

Yerel test DB'si (fabrika-postgres, :5433) ile CE-690 doğrulaması tamamlandı.
- lint 0 hata, typecheck exit 0.
- pnpm test: 319 dosya ve 4072 test geçti, exit 0. EVIDENCE_S3_TEST_* tanımsızken koşuldu; CI'da da bu değişkenler tanımlı değil.
- .env.test olduğu gibi kullanılınca 1 dosya hatası çıkıyor (user-erasure-object-store): S3 test servisi kapalı. Aynı hata origin/dev'de de var, M7 ile ilgisi yok.
- M7 e2e: 14/14 geçti.
- Gerçek tıklama: M7 kapalıyken TR ve EN ret mesajı, M7 açıkken mutlu yol. 4 ekran görüntüsü.
- PR #68 ready for review durumuna alındı, merge edilmedi.

## Ne yapıldı
1. Ortam: `.env.test` kopyalanmadan `set -a; . .env.test` ile yüklendi. `DATABASE_URL` yalnız host:port kontrol edildi: `127.0.0.1:5433/fabrika`. 5432'deki `yuyt-postgres`'e bağlanılmadı.
2. Migration: `prisma migrate status` 6 dizini "uygulanmamış" gösteriyor. Ancak proje şemayı `prisma db push` + `scripts/apply-migrations.sh` ile kuruyor (`ci.yml`), `migrate dev` ile değil. Salt-okunur `prisma migrate diff --from-config-datasource --to-schema` çalıştırıldı. Tek fark, dev'de modelden kaldırılmış `EvidenceReminder` tablosunun DB'de hâlâ durması. Bu tablo M7'yi etkilemiyor. `migrate dev` drift gördüğünde reset ister; tablo düşürmek de yıkıcı bir işlem. Bu yüzden **migration ve reset yapılmadı**.
3. Tam `pnpm test` (`perl -e 'alarm 900;exec @ARGV'`) iki kez koşuldu (aşağıda).
4. İlk e2e koşusu 13/14 kırmızıydı. Neden ortamdı: `chromium_headless_shell-1234` kurulu değildi, önbellekte yalnız 1243 vardı. `pnpm exec playwright install chromium` ile kuruldu ve ikinci koşu 14/14 yeşil oldu.
5. Gerçek tıklama görüntüleri için geçici bir spec yazıldı (`tests/e2e/zz-evidence-ce690.spec.ts`). Spec kendi kiracısını (`e2e-ce690-tenant`) kullanıyor ve afterAll'da temizliyor. `E2E_SHOTS_ROOT` ile görüntüler ekler klasörüne yazıldı. Spec koşudan sonra silindi, commit edilmedi; worktree `git status` temiz.
6. PR #68'in açıklaması kanıtlarla güncellendi ve `gh pr ready 68` çalıştırıldı. Durum: `isDraft=false`, `OPEN`, merge edilmedi.

## Kanıt (ham çıktı)
- `pnpm lint` → `✖ 4 problems (0 errors, 4 warnings)`, exit 0
- `pnpm typecheck` → exit 0
- `pnpm test` (`.env.test` olduğu gibi) → `Test Files 1 failed | 318 passed | 18 skipped (337)`, `Tests 4072 passed | 447 skipped (4519)`. Hata: `FAIL tests/user-erasure-object-store.test.ts … Error: connect ECONNREFUSED 127.0.0.1:<S3 test portu>`
- Aynı dosya temiz `origin/dev` (`4875ee4b`) geçici worktree'sinde → `Test Files 1 failed (1)`, aynı ECONNREFUSED. Hata **önceden var**, M7 kaynaklı değil.
- `pnpm test` (`EVIDENCE_S3_TEST_*` unset, CI ile aynı; test değiştirilmedi) → `Test Files 319 passed | 18 skipped (337)`, `Tests 4072 passed | 447 skipped (4519)`, exit 0
- `pnpm exec playwright test tests/e2e/m7-tto-accelerator.spec.ts` → `14 passed (19.9s)`, exit 0
- Kanıt spec'i → `3 passed (9.7s)`. Sunucu logu: `ModuleAccessError: Module M7 is not available (OFF/MODULE_OFF)`. Ret sunucuda oluşuyor ve ekranda gösteriliyor.

## Ekran görüntüleri
- `TASK-MV14L1MA361XL-be-fb-ekler/01-m7-off-tr-refusal.png`: TR ret bandı
- `TASK-MV14L1MA361XL-be-fb-ekler/02-m7-off-en-refusal.png`: EN ret bandı
- `TASK-MV14L1MA361XL-be-fb-ekler/03-m7-on-item-created.png`: M7 açık, formla öğe oluşturuldu
- `TASK-MV14L1MA361XL-be-fb-ekler/04-m7-on-match-result.png`: M7 açık, eşleştirme modalı açıldı, ret bandı yok

## Değişen dosyalar
- Kodda değişiklik yok (PR #68, `becbd68c` aynen duruyor).
- Yeni: bu rapor ve `TASK-MV14L1MA361XL-be-fb-ekler/` (4 PNG + rapor.html).

## Eksik değişken
- Yok. `.env.test` içindeki `EVIDENCE_S3_TEST_ENDPOINT` tanımlı ama gösterdiği yerel S3 servisi çalışmıyor. Bu bir değişken eksiği değil, servis eksiği.

## Riskler
- TTO sayfasının büyük kısmı hâlâ sabit Türkçe metin (form etiketleri, başlıklar); EN ekranında görünüyor. Bu eski bir borç ve kapsam dışı; ayrı bir i18n kartı önerilir. CLAUDE.md kural 8'i ihlal ediyor.
- Yerel DB'de artık kullanılmayan `EvidenceReminder` tablosu duruyor. Zararsız, ama `migrate diff` temiz görünmüyor.
- GitHub Actions ödeme sorunu nedeniyle çalışmıyor; PR'da CI durumu yok.

## Sonraki adım
- PR #68 incelenip merge edilmeli (lider/insan). Ben merge etmedim.
- İsteğe bağlı: TTO sayfası i18n kartı; yerel S3 test servisinin (`EVIDENCE_S3_TEST_*`) ayağa kaldırılması ya da `.env.test`'ten çıkarılması.

## Definition of Done
- [x] Yeni dal güncel `dev` tabanında; yalnız delta taşındı (`becbd68c`)
- [x] i18n anahtarı tr ve en'de var
- [x] lint, typecheck, unit (tam) ve M7 e2e yeşil; ham çıktılar yukarıda
- [x] TR/EN mesaj ve mutlu yol ekran görüntüleri raporda
- [x] PR açık ve ready for review: https://github.com/yaslan/fonbridge/pull/68
- [x] Platform: web; mac'te tarayıcıda doğrulandı, kod platforma bağlı değil

Bu raporun sayfası: TASK-MV14L1MA361XL-be-fb.html (AgentSpace Raporlar sekmesinde açılır).
