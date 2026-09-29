# TASK-MUN7B4ZIEBJML — FB KARARSIZ TESTLER (fe-fb)

Sprint FB-GAP-1 · Kaynak: `docs/agent-results/TASK-MUN66PFFWT9MA-fe-fb.md` K-2/K-3/K-4 · Kod commit'i: **`90007fe3`** (13 dosya, yalnız test ve test yardımcıları, ürün kodu değişmedi).

## Özet

| | |
|---|---|
| Kök neden | 5 flake'in 4'ü aynı sınıftan: **paralel test dosyaları aynı DB nesnesini paylaşıyor** (bir sayaç satırı, bir tablonun DDL kilidi, seed satırları). Beşincisi: test, bekleyen transition yüzünden hâlâ **disabled** olan butona tıklıyor ve React tıklamayı yutuyor. |
| Düzeltme | Paylaşılan DB nesneleri için dosyalar arası Postgres advisory lock (`tests/helpers/test-db-lock.ts`). Buton için "tıklamadan önce açık olmasını bekle". **Hiçbir beklenti gevşetilmedi.** Önceden eklenmiş, sorunu örten 5 sn beklemeler kaldırıldı. |
| Seed | Seed referans verisi (ModuleCatalog, Topic, demo tenant) yoksa test yerelde `run pnpm db:seed` nedeniyle atlanıyor, CI'da düşüyor (`tests/helpers/seed.ts`). CI'daki `db:seed` adımıyla uyumlu. |
| Sonuç | Seed'li izole DB'de tam süit **art arda 10/10 yeşil**: `Tests  2866 passed \| 8 skipped (2874)`. |

## Ne yapıldı

Çalışma ortamı: scratchpad'de `dev`'den `git worktree add --detach` ile temiz kopya. İzole DB `fefb_flaky` CI sırasıyla kuruldu (push → rls-role → migrations ×2 → rls → seed). İkinci izole DB `fefb_noseed` ise seed'siz kuruldu. Paylaşılan `fabrika` DB'sine dokunulmadı. İş bitince iki DB de `DROP` edildi ve worktree silindi.

### A. `agency-invite.live` "a revoked code is filed…": `expected 1 to be greater than or equal to 2` (kartın K-3'ü)
- **Kök neden:** `tests/oauth-registration.live.test.ts` ("an unknown code and a revoked code…") aynı paylaşılan `SystemAlert` sayaç satırını (`agency.invite.rejected.unknown`) okuyor, artırıyor ve geri koyuyor. Satırı kendisi açtıysa en sonda siliyor. Paralel koşuda agency-invite bu satırı `counterBefore` (1) olarak okuyor, oauth satırı siliyor, agency-invite'ın artırımı da **yeni bir satırı 1'den** açıyor. Sonuç: `1 >= 2` başarısız. Bu durumda agency-invite'ın `afterAll`'u silinmiş satırı güncellemeye çalıştığı için yeni satır da sızıyordu.
- **Düzeltme:** İki test de okuma → işlem → geri koyma adımlarını `withTestDbLock(…, UNKNOWN_INVITE_COUNTER_LOCK)` içinde yapıyor. agency-invite'ın geri koyması `afterAll`'dan testin kendi `finally`'sine, kilidin içine taşındı. Beklenti aynen korundu (`>= +1`, oauth'ta `toBe(+1)`).

### B. `pilot-expired-write-paths` "Invite: a refused invite (success: false)…": `Test timed out in 5000ms` (kartın K-4'ü)
- **Kök neden:** Bu bir yavaşlık sorunu değil. `ConsortiumManager.handleFindCandidates` aday listesini çiziyor, ardından aynı transition içinde `await getConflicts()` yapıyor. React 19'da `await`'ten sonraki `setState` transition dışında çiziliyor. Bu yüzden "Invite" butonu önce `disabled={isPending}` hâlinde görünüyor. Test bu anda tıklıyor, React disabled butondaki tıklamayı yutuyor, `assignSeat` hiç çağrılmıyor ve `waitFor(… 5000)` testin 5 sn sınırına takılıyor. Önceki "generous waits: 5000" yorumu aynı belirtiyi örtmeye çalışmıştı.
- **Düzeltme:** Tıklamadan önce butonun açılması bekleniyor (`enabled()` yardımcısı). 5 sn'lik özel beklemeler kaldırıldı, varsayılan 1 sn yetiyor.

### C. (yeni görüldü) `agency-invite.live` "after the function fails mid-call…": `55P03 canceling statement due to lock timeout`
- 10 koşuluk ilk turda ortaya çıktı.
- **Kök neden:** `oauth-registration.live`'ın `withCodeDyingAfterProbe` yardımcısı `CREATE/DROP TRIGGER … ON "AgencyInviteCode"` koşuyor. `DROP TRIGGER` ACCESS EXCLUSIVE kilidi istiyor. agency-invite'ın bu testi satırı 800 ms tutarken bu istek kuyruğa giriyor. Kuyrukta onun arkasına düşen düz `count()` da `lock_timeout = 100ms` altında 55P03 alıyor.
- **Düzeltme:** Trigger oluşturma ve silme ile bu `lock_timeout` testi `AGENCY_INVITE_CODE_DDL_LOCK` altında serileştirildi.

### D. (yeni görüldü) `pilot-expired-write-paths` "Davet Et (en)…": `expected <p role="alert"> to be null`
- **Kök neden:** B ile aynı sınıf. İlk reddin uyarısı `pending` bayrağı temizlenmeden çiziliyor, ikinci tıklama disabled butona düşüyor ve yutuluyor.
- **Düzeltme:** İkinci tıklamadan önce `enabled()` bekleniyor. Aynı açık "Aday Bul" ikinci tıklamasında da vardı (bekleme sırasında buton adı "computing" oluyor), o da düzeltildi.

### E. (yeni görüldü) `public-sector-assignment` "seeding twice leaves the same rows": `expected [ 6, 4, 4 ] to deeply equal [ 3, 4, 4 ]`
- **Kök neden:** `upsertPublicSectorPlans` her sürüm için önce `planFeature.deleteMany`, sonra `createMany` yapıyor ve bunu atomik yapmıyor. 4 dosya (`pilot`, `pilot-gates`, `public-sector-assignment`, `settings-modules-plan`) bu fonksiyonu `beforeAll`'da paralel çağırıyor. İki yazar iç içe geçince sonuç 6 satır oluyor, ya da silme ile yazma arasında okununca 0.
- **Düzeltme:** 5 çağrı yeri `PUBLIC_SECTOR_PLANS_LOCK` altında. Idempotency testinde okuma adımı da kilidin içinde.

### F. Seed'siz DB'de düşen 7 test (kartın K-2'si)
Seed'in kurduğu referans verisine bağlılar:
- `cron-tenant-scope` ×4: Topic
- `plan-admin` ×2: ModuleCatalog M6
- `stripe-webhook-tenant-scope` ×1: ModuleCatalog
- `double-charge-prevention`: `demo-tenant` + `demo-opp-1`

**Karar: atla, fixture kurma.** Bu satırlar global. Test başına ModuleCatalog ya da Topic satırı açıp silmek, paralel dosyaların sayımlarını değiştirir ve A/E sınıfında yeni bir flake üretir. `double-charge` ise demo verisine derinden bağlı. `skipUnlessSeeded` / `seededOrSkipping` yerelde `… : run \`pnpm db:seed\`` nedeniyle atlıyor, CI'da `refusing to skip in CI` diye düşüyor. Bu, repodaki `skipOrFailInCi` deseninin seed karşılığı.

## Kanıt

### Düzeltme öncesi yeniden üretim (hedefli)
Paralel komşuyu taklit eden betiklerle, aynı hata metinleri:

| Flake | Yöntem | Önce | Sonra |
|---|---|---|---|
| A | oauth testinin sayaç yaşam döngüsünü (aç → sil) döngüde yapan komşu + `vitest run tests/agency-invite.live.test.ts -t "revoked code is filed"` ×10 | **5/10 kırmızı**: `expected 1 to be greater than or equal to 2` | kilitli komşu: **10/10** `Tests  1 passed \| 17 skipped (18)`, sızan sayaç satırı `DELETE 0` |
| A (mutasyon) | `pg_advisory_lock` → `SELECT hashtext` (kilit etkisiz) | – | 6 koşuda 1 kırmızı `expected 1 to be greater than or equal to 2` → kilit yük taşıyor. Geri alındı (`diff` boş). |
| B | tanı kopyası: `getConflicts` 50 ms gecikmeli | `DIAG invite.disabled at click = true` → `× … 5009ms` · `Error: Test timed out in 5000ms.` | 0/50/300 ms gecikmeyle 3/3 `Tests  1 passed \| 11 skipped (12)` |
| D | eski test, 8 paralel süreç ×3 tur (24 koşu) | 1/24 kırmızı `to be null`, o anda `DIAGD disabled-when-alert-shown=true` | tam süit 10/10 (aşağıda) |
| E | kilitsiz döngüde `upsertPublicSectorPlans` komşusu + eski test ×8 | **3/8 kırmızı**: `expected [ 3, +0, 4 ] to deeply equal [ 3, 4, 4 ]` (×2), `[ 3, 4, +0 ]` | kilitli komşu çalışırken (260→660 upsert) **8/8** `Tests  1 passed \| 5 skipped (6)`. DB sonra `3/4/4`. |
| F | 4 dosya, seed'siz DB | `Tests  7 failed \| 37 passed \| 5 skipped (49)` | yerel: `Tests  37 passed \| 12 skipped (49)`, çıkış 0 · `CI=true`: `Tests  7 failed \| 37 passed (44)`, `refusing to skip in CI — no Topic rows… (×4) / ModuleCatalog has no M6 row (×2) / ModuleCatalog is empty (×1) / the demo tenant 'demo-tenant' is missing` · seed'li: `Tests  49 passed (49)` |

### Tam süit, seed'li izole DB
**Ara tur** (yalnız A+B düzeltilmiş, 5 koşu): 2 koşuda yeni flake çıktı. Koşu 1'de C (`55P03`), koşu 3'te D (`to be null`). Ardından 10 koşuluk ikinci turda 9 yeşilden sonra E düştü (`[ 6, 4, 4 ]`, 36 sn, makine yüklü). Bunlar yukarıda düzeltildi.

**Son tur** (`90007fe3` ile aynı içerik), art arda 10 koşu:
```
full run 1 exit=0 22s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
full run 2 exit=0 18s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
full run 3 exit=0 19s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
full run 4 exit=0 19s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
full run 5 exit=0 20s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
full run 6 exit=0 19s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
full run 7 exit=0 19s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
full run 8 exit=0 20s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
full run 9 exit=0 19s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
full run 10 exit=0 18s | Test Files  244 passed | 2 skipped (246) |      Tests  2866 passed | 8 skipped (2874)
SAME_TENANT_SET
```
- 8 skipped = `RUN_LIVE_ADAPTER_TESTS` kapılı canlı adaptör testleri. Önceki ölçümle aynı, yeni bir skip yok.
- Tenant `id||slug` md5'i koşulardan önce ve sonra aynı: `SAME_TENANT_SET`.

### Diğer kapılar (aynı worktree)
- `npx tsc --noEmit -p .` → `tsc exit=0`
- `pnpm lint` → `lint exit=0 warnings=0`
- `pnpm rls:bypass-check` → `✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed with a recorded reason, 36 on the sanctioned cross-tenant path, 0 still owed.`
- `pnpm i18n:check` → `✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.`
- `where-guard-src` / `teardown-where-guard` tam süitin içinde yeşil.

### Commit
`git show --stat --oneline 90007fe3` → 13 dosya, `324 insertions(+), 188 deletions(-)`. Paylaşılan ağaçtaki başkalarının dosyaları (`src/modules/m11/**`, `FON_BRIDGE.md`, be-fb raporu) commit'e girmedi.

## Değişen dosyalar
- **Yeni:**
  - `tests/helpers/test-db-lock.ts`: `withTestDbLock` + 3 kilit adı
  - `tests/helpers/seed.ts`: `skipUnlessSeeded`, `seededOrSkipping`
- **Kilit:**
  - `tests/agency-invite.live.test.ts`
  - `tests/oauth-registration.live.test.ts`
  - `src/lib/billing/public-sector-assignment.test.ts`
  - `src/lib/billing/pilot.test.ts`
  - `src/lib/billing/pilot-gates.test.ts`
  - `tests/modules/settings-modules-plan.test.ts`
- **Buton bekleme:** `tests/pilot-expired-write-paths.test.tsx`
- **Seed kapısı:**
  - `src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts`
  - `src/lib/billing/plan-admin.test.ts`
  - `tests/stripe-webhook-tenant-scope.live.test.ts`
  - `tests/double-charge-prevention.test.ts`
- agency-invite ve oauth diff'leri büyük görünüyor çünkü içerik bir girinti içeri kaydı. Mantıksal değişikliği görmek için `git show -w 90007fe3` kullanın.

## Riskler
- **R-1 (ürün kodu, düzeltilmedi):** `upsertPublicSectorPlans` (`src/lib/billing/public-sector-plans.ts:128-137`) eşzamanlı iki çağrıda `PlanFeature` satırlarını çoğaltır. Üretimde yalnız seed ve `scripts/seed-public-sector-plans.ts` çağırıyor, eşzamanlılık beklenmiyor. Bu yüzden kapsam dışı bıraktım. Kalıcı çözüm: sürüm satırını `FOR UPDATE` ile kilitleyen bir transaction.
- **R-2 (gizli zamanlama varsayımı):** agency-invite'ın iki yarış testi, tutan bağlantının satırı kilitlemiş olacağını `setTimeout(150)` / `setTimeout(100)` ile varsayıyor (`tests/agency-invite.live.test.ts:215, :313`). Bu işteki 25 tam koşuda hiç düşmedi, dokunmadım. Çok yüklü bir makinede tetiklenebilir. Deterministik hâli: `pg_stat_activity`'de tutan oturumun `pg_sleep`'te olduğunu yoklamak.
- **R-3:** Yeni bir test paylaşılan bir satırı ya da tabloda DDL'i kilitsiz kullanırsa aynı sınıf flake geri gelir. Kilit adları ve gerekçeleri `test-db-lock.ts` başlığında yazılı.
- **R-4:** Seed'siz yerel DB'de 7 test artık **yeşil değil, atlanmış** görünür. Yerelde "tam yeşil" için hâlâ `pnpm db:seed` gerekir. CI davranışı değişmedi.

## Açık sorular
- R-1 için ürün kodunda transaction + `FOR UPDATE` kartı açılsın mı? (be-fb alanı)

## Sonraki adım
- CI'da ilk birkaç `dev` koşusunda bu 5 testin kırmızısı görülmemeli. Görülürse yeni bir paylaşılan nesne vardır, `test-db-lock.ts`'e eklenir.
- İsteğe bağlı: R-2 için deterministik bekleme.

## Platform beyanı
**macOS (Darwin 27.0.0, arm64)**, Node v26.5.0, pnpm 11.25.0, Postgres docker `fabrika-postgres` (:5433). Bu makinede `psql` yok. Migration betiği `PSQL=` docker sarmalayıcısıyla koşuldu.
- **Linux:** CI (ubuntu-latest) aynı vitest'i koşuyor. Değişiklikler platformdan bağımsız: advisory lock Postgres tarafında, `pg` istemcisi Node'da, jsdom beklemeleri saf JS. Linux'ta koşulmadı. Kanıt yalnız macOS'tan.
- **Windows:** koşulamadı, makine yok. Dokunulan kodda dosya yolu, kabuk ya da süreç öldürme yok, bu yüzden davranış farkı beklenmez. İzole DB kurulum reçetesi (`apply-migrations.sh`) bash istediği için WSL ya da Git Bash gerekir.
