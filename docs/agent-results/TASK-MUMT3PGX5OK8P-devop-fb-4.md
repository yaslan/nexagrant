# TASK-MUMT3PGX5OK8P — devop-fb (4): İNCELEME-44 N-1 düzeltmesi

**Durum:** TAMAM, crw incelemesine hazır.
**Ortam:** Doğrulama temiz, ayrık bir worktree'de yapıldı (`cf0edb99` artı yalnız bu yama). Kendi Postgres konteynerimi kullandım (`devopfb-n1`, `pgvector/pgvector:pg16`, `127.0.0.1:55493`). Kurulum CI sırasıyla yapıldı: `db push`, `db:rls-role`, `apply-migrations` ×2, `db:rls`, `db:seed`. Paylaşılan `fabrika-postgres`'e yazılmadı. Paralel çalışanların dosyalarına dokunulmadı: paylaşılan ağaçtaki `src/modules/m11/*` değişiklikleri başkasına ait ve commit'e girmedi.
**Platform:** yalnız macOS (Darwin 27, arm64) üzerinde koşuldu. Değişiklik saf SQL (Postgres 16) ve bir vitest testinden ibaret. Kabuk, yol ya da süreç gibi platforma bağlı bir kod yolu yok, bu yüzden Linux ve Windows'ta davranış aynıdır. CI Linux'ta (ubuntu-latest, aynı `pgvector:pg16` imajı) bu testi `pnpm test` ile koşar. Linux ve Windows'ta ben koşmadım, çünkü bu makinede o ortamlar yok.

## 1. Ne yapıldı
- **Kök neden (crw N-1):** Başlıktaki geri dönüş `DROP COLUMN "grantPeriod"` ile yeni işin kendi satırlarının ay damgasını da siliyor. Yeniden ileri alındığında eski-iş doldurması bu satırları atlıyor (`"refId" IS NULL` koşulu). `hasLegacyGrant` de onları görmüyor. Sonuçta o ay anahtarın dışında kalıyor ve aynı ay ikinci kez koşunca ikinci kredi yazılıyor.
- **Düzeltme** (`prisma/migrations/credit-ledger-grant-period.sql`): `ADD COLUMN` satırından sonra ve eski-iş doldurmasından **önce**, yeni işin kendi satırlarını `refId`'den yeniden damgalayan tek bir `UPDATE` eklendi. Bu, crw'nin önerdiği koşuldur.
  ```sql
  UPDATE "CreditLedger" c
     SET "grantPeriod" = substr(c."refId", 15)
   WHERE c.reason = 'monthly_grant' AND c."grantPeriod" IS NULL
     AND c."refId" ~ '^monthly_grant:[0-9]{4}-(0[1-9]|1[0-2])$'
     AND NOT EXISTS (SELECT 1 FROM "CreditLedger" x
                      WHERE x."tenantId" = c."tenantId" AND x."grantPeriod" = substr(c."refId", 15));
  ```
  - Yalnız yeni işin biçimindeki `refId`'ye dokunur (`monthly_grant:YYYY-MM`). iyzico ve Stripe etkinleştirme kredilerinin `refId`'si ödeme ya da abonelik kimliğidir. Desene uymadıkları için damgalanmazlar.
  - crw'nin taslağına bir ek yapıldı: `NOT EXISTS` koruması. O ayın zaten damgalı bir satırı varsa yeni satıra dokunulmaz. Bu sayede anahtarla çakışma (unique ihlali) hiçbir durumda olmaz ve dosya tekrar koşulabilir kalır.
  - Sıra bilerek böyle. Önce yeni satır damgalanır, sonra eski-iş doldurmasının `NOT EXISTS` koşulu aynı aydaki eski satırı atlar. Böylece iki işin de verdiği bir ayda anahtarı yeni satır tutar.
- **Başlık:** "Re-stamp (İNCELEME-44 N-1)" maddesi eklendi. Idempotent paragrafı güncellendi. Yanlış olan "(the backfill goes with the column; …)" cümlesi düzeltildi. Yeni metin: geri dönüş iki türün ay damgasını da siler ve dosya yeniden uygulandığında ikisi de geri gelir. Geri dönüş SQL'i değişmedi: `DROP INDEX` + `DROP COLUMN`, kredi tutarları değişmez.
- **Test** (`src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts`):
  - `backfill()` yardımcısı eklendi. Dosyadaki tüm `UPDATE "CreditLedger"` ifadelerini dosya sırasıyla koşar. Yorum satırları önce atılır, böylece başlık eşleşmez. Eski test yalnız ilk `UPDATE`'i alıyordu. Yeni sırada bu, doldurmanın kendisini testten düşürürdü.
  - Doldurma testine üç durum eklendi:
    - `oct-new`: `refId` dolu, `grantPeriod` NULL; beklenen `'2031-10'`. crw'nin önerisi.
    - `oct-b-set` + `oct-b-new`: ay zaten damgalı; yeni satır NULL kalır, çakışma olmaz.
    - `aug-b-old` + `aug-b-new`: aynı ay iki iş; anahtarı yeni satır tutar, eski satır NULL kalır.
  - **Yeni test** "rollback, re-apply and a re-run of the same month add no second grant (İNCELEME-44 N-1)":
    1. Eylül için eski-iş satırı eklenir, Ekim yeni işle verilir.
    2. Geri dönüşün satırlara etkisi uygulanır: tüm `grantPeriod` NULL yapılır.
    3. Dosyanın UPDATE'leri koşulur. Beklenen: `['2031-09','2031-10']`.
    4. Aynı ay yeniden koşulur. Beklenen: `grantedCount 0, alreadyGrantedCount 1`, Ekim toplamı `10` (tek kredi).

## 2. Kanıt

### Canlı senaryo: gerçek `pnpm jobs:worker` (`JOBS_CRON_ENABLED=false`) + `pnpm jobs:enqueue`, izole DB
Betik: R1 yeni iş Ekim'i verir → R2 başlıktaki geri dönüş SQL'i (gerçek `DROP INDEX` + `DROP COLUMN`) → R3 dosya iki kez yeniden uygulanır → R4 aynı ay yeniden koşar. Eylül'ün eski-iş satırı da tabloda.

**Mutant: eski dosya (`git show HEAD:…`, sha256 `7dbf6a673472`)**
```
R1  DONE job=1 {"period":"2026-10","grantedCount":1,"alreadyGrantedCount":0,"failedCount":0,"totalCreditsGranted":500}
R2  rollback (header SQL)
R3  re-apply: ALTER TABLE UPDATE 1 CREATE INDEX
    re-apply again: ALTER TABLE UPDATE 0 CREATE INDEX
    n1-old-sep|500|-|2026-09
    cmun6yqms00003hxkpomon8c7|500|monthly_grant:2026-10|NULL      ← damgasız
R4  DONE job=2 {"period":"2026-10","grantedCount":1,"alreadyGrantedCount":0,"failedCount":0,"totalCreditsGranted":500}
ekim_toplam=1000   eylul_toplam=500
```
**Düzeltme (sha256 `216ef3df0ce4`)**
```
R1  DONE job=3 {"period":"2026-10","grantedCount":1,"alreadyGrantedCount":0,"failedCount":0,"totalCreditsGranted":500}
R2  rollback (header SQL)
R3  re-apply: ALTER TABLE UPDATE 1 UPDATE 1 CREATE INDEX
    re-apply again: ALTER TABLE UPDATE 0 UPDATE 0 CREATE INDEX
    n1-old-sep|500|-|2026-09
    cmun6ysya00023hxk7z9ulsnq|500|monthly_grant:2026-10|2026-10
R4  DONE job=4 {"period":"2026-10","grantedCount":0,"alreadyGrantedCount":1,"failedCount":0,"totalCreditsGranted":0}
ekim_toplam=500    eylul_toplam=500
```
Worker'ı iş bitince SIGTERM ile kapattım. Log: "Global graceful shutdown complete". Kapatılan pid 33821 benim başlattığım süreçti.

### Test: önce RED, sonra GREEN
- Taban (`cf0edb99`): `Tests 13 passed (13)`.
- Yeni testler, eski dosyayla: `Tests 2 failed | 12 passed (14)`. Hata: `expected [ '2031-09', null ] to deeply equal [ '2031-09', '2031-10' ]`.
- Düzeltmeyle: `Tests 14 passed (14)`.

### Mutantlar
Her mutant tek değişiklik içerir. Her birinden sonra dosya geri yüklendi ve `cmp` ile doğrulandı.
| # | Mutant | Sonuç |
|---|---|---|
| MN1 | eski dosya: yeniden damgalama `UPDATE`'i yok (= eski geri dönüş davranışı) | ÖLDÜ `2 failed \| 12 passed` |
| MN2 | yeniden damgalamada `NOT EXISTS` koruması silindi | ÖLDÜ `1 failed \| 13 passed` |
| MN3 | yeniden damgalama eski-iş doldurmasının arkasına taşındı | ÖLDÜ `1 failed \| 13 passed` (`aug-b-old: '2031-08'`) |
| MN4 | `substr(…, 14)`: iki nokta üst üste değere giriyor | ÖLDÜ `2 failed \| 12 passed` |

MN3 ilk denemede sağ kaldı. Para açısından eşdeğerdi: sıra ters olsa da ay tek satırla kapsanıyordu. Ancak başlıkta "yeni satır tutar" yazıyordu, bu yüzden `aug-b-*` durumu eklendi ve mutant öldü. İlk MN2–MN4 denemesi hatalı tabanda koştu (yedek yanlış yere yazılmıştı) ve MN3'ün ilk koşusu mutantı başlık yorumunun içine koydu. İkisi de tekrarlandı. Yukarıdaki sonuçlar tekrarlanan koşulardır.

### Kapılar (temiz worktree, izole DB)
```
scripts/apply-migrations.sh ×2 (düzeltmeyle)   MIG3=0  MIG4=0  "apply-migrations: 35 files applied"
  [33/35] credit-ledger-grant-period.sql: column … already exists, skipping / relation … already exists, skipping
npx tsc --noEmit                                  TSC_EXIT=0
eslint cron-tenant-scope.test.ts                  LINT_EXIT=0
tam vitest 1. koşu  SUITE1_EXIT=1  Test Files 1 failed | 237 passed | 4 skipped · Tests 1 failed | 2797 passed | 25 skipped
  tek kırmızı: src/lib/billing/public-sector-assignment.test.ts "seeding twice leaves the same rows"
  ([6,8,4] vs [3,4,4]; plan özelliği seed'i. CreditLedger'a ve bu yamaya dokunmuyor). Tek başına: 6/6, 6/6.
tam vitest 2. koşu  SUITE2_EXIT=0  Test Files 238 passed | 4 skipped (242) · Tests 2798 passed | 25 skipped (2823)
```

## 3. Değişen dosyalar
- `prisma/migrations/credit-ledger-grant-period.sql`: yeniden damgalama `UPDATE`'i ve başlık.
- `src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts`: `backfill()` yardımcısı, üç yeni doldurma durumu ve N-1 testi.
- `docs/agent-results/TASK-MUMT3PGX5OK8P-devop-fb-4.md`: bu rapor.

## 4. Riskler
- **Geri dönüş ile yeniden ileri alma arasındaki pencere:** Geri dönüşten sonra eski Inngest işi aynı ay için koşarsa çift kredi oluşur. Bu durum bu dosyanın kapsamı dışında ve daha önce de böyleydi (başlıktaki "Not covered" maddesi, ADR-0008 §9.2). Yeniden ileri alındığında aynı ay için iki satır varsa anahtarı yeni satır tutar. Üçüncü bir kredi oluşmaz.
- **Geri dönüşten sonra yeni işin iki satırı:** Aynı kiracı ve aynı ay için iki yeni-iş satırı yalnız index yokken yazılabilir. Geri dönüşte yeni kod da geri alındığı için bu durum oluşmaz. Oluşursa `CREATE UNIQUE INDEX` yüksek sesle düşer (`ON_ERROR_STOP`) ve sessiz çift kredi olmaz.
- **Canlı veri:** Bu yama canlıya uygulanmadı. Canlıya geçiş ayrı ve açık onayla yapılacak. Dosya idempotent: canlıda şu an geri dönüş uygulanmış bir durum yoksa yeni `UPDATE`, `UPDATE 0` döner.

## 5. Açık sorular
- Yok. crw'nin alternatifi (geri dönüşte kolonu düşürmemek) uygulanmadı. Başlıktaki geri dönüş yazıldığı gibi koşulsa bile yeniden ileri alma artık doğru.
- İNCELEME-44'ün Ö-1, Ö-2 ve Ö-3 önerileri bu kartın kapsamı dışında bırakıldı. Görev yalnız N-1'i istiyordu.

## 6. Sonraki adım
- crw-fb yeniden incelemesi: N-1 kapanışı.
- **Geri alma talimatı (bu yamanın kendisi için):** `git revert <bu commit>`. Uygulanmış bir DB'de ek bir adım gerekmez, çünkü yeni `UPDATE` yalnız NULL `grantPeriod` değerini doğru aya yazar.
- **İzleme notu:** Canlıya geçişten sonra aşağıdaki sorgu boş dönmeli:
  ```sql
  SELECT "tenantId", "refId", count(*) FROM "CreditLedger"
   WHERE reason = 'monthly_grant' AND "refId" LIKE 'monthly_grant:%'
   GROUP BY 1, 2 HAVING count(*) > 1;
  ```
  Bu sorgu aynı ayın iki yeni-iş kredisini gösterir. İş özetindeki `alreadyGrantedCount` alanı zaten logda.
