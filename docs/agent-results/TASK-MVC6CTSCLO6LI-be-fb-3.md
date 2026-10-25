---
sözleşme: 3
görev: TASK-MVC6CTSCLO6LI
kod: TASK-MVC6CTSCLO6LI
ajan: be-fb
motor: claude
tip: ölçüm
okur: ekip
hüküm: Bitti: Y-1 ve Y-2 testleri eklendi, iki mutant da KIRMIZI oldu, geri alınınca YEŞİL; tam pre-push gate izole DB'de yeşil geçti, normal push 69ed2dfc..33f444a8 tamam ve PR #87 MERGEABLE (merge yapılmadı).
platform: macOS (darwin 27), Node + pnpm, izole Homebrew PG16 kümesi 127.0.0.1:55321 (kendi rolleriyle; paylaşılan :5433 `fabrika` üzerinde hiçbir şey koşulmadı, yalnız salt okunur `pg_dump --schema-only`). Windows/Linux koşulmadı: değişiklik yalnız bir vitest canlı test dosyası, platforma bağlı yol yok. GitHub CI koşulamadı: hesap faturalaması yüzünden işler başlatılmıyor.
sürüm: 1
tarih: 2026-10-17T19:58:03.195Z
---

# FO-45 · PR #87 Y-1/Y-2 testleri + push (be-fb, 3. tur)

## Ne yapıldı
1. **Ön kontrol:** worktree `fo45-prereg-rls`, dal `be-fb/fo45-prereg-rls`, yerel head `bc05c016`, temiz. Uzak `69ed2dfc`; `git merge-base --is-ancestor 69ed2dfc HEAD` → ANCESTOR. Aynı dalda başka canlı oturum yok (`git worktree list`, `ps`).
2. **Y-1** (`tests/expert-prereg-app-role.live.test.ts`): `Number.isInteger(seats)` kaldırıldı. Yerine `expect(seats).toBeLessThanOrEqual(Math.max(0, FOUNDER_SEAT_LIMIT - (verified.founderNumber ?? FOUNDER_SEAT_LIMIT)))` geldi. Paralel koşuya dayanıklı: başka koşular yalnız numara alabilir, bu da sınırı daha da sağlar. Kapsam düşerse RLS altında max=NULL → 100 → kırmızı.
3. **Y-2:** yeni senaryo. Hata atan bir mailer ile `registerExpertPreRegistration(db: rls)` → `{kind:'unavailable', error:'mail_failed'}`. Sonra **sahip rolüyle** `count({email})` = 0 olmalı.
4. **DB güvenliği:** paylaşılan `.env` hedefi `fabrika@localhost:5433/fabrika` idi. Testi oraya koşmadım. Bunun yerine kendi Homebrew PG16 kümemi açtım (:55321). Bu kümede `fabrika` SUPERUSER ve `fabrika_app` NOSUPERUSER NOBYPASSRLS rolleri var; rol bu kümeye ait, paylaşılan rolün parolasına dokunulmadı. Şema paylaşılan DB'den salt okunur `pg_dump --schema-only` ile alındı. Üstüne izole DB'de dalın `expert-prereg-rls-mail-quota.sql`'i iki kez uygulandı (iki koşu da ok), sonra `pnpm db:rls` ve `pnpm db:seed` koşuldu. Paylaşılan DB'de down, migration ya da db:rls-role **koşulmadı**. Gate'in kendi `db:rls-role` adımı da izole kümeye gitti.
5. Commit, normal push, PR durumu.

## Kanıt (ham çıktı)
### Hedef
```
HEDEF: postgresql://fabrika:***@127.0.0.1:55321/fabrika postgresql://fabrika_app:***@127.0.0.1:55321/fabrika
(paylaşılan .env: postgresql://fabrika:***@localhost:5433/fabrika postgresql://fabrika_app:***@localhost:5433/fabrika — kullanılmadı)
```
### Mutant M4: seats.ts:14 `withSystemScopeOn(db,'platform-aggregate','expert-prereg.seats', (tx) =>` → `db.$transaction((tx) =>`
```
 × registers, verifies, lists, exports and counts seats through the RLS role 42ms
   → expected 100 to be less than or equal to 99
 ✓ removes the new row when the mail fails, through the RLS role
 ✓ sees no row of the table without a scope, while the owner sees the row
      Tests  1 failed | 2 passed (3)
=== M4 geri alındı ===
      Tests  3 passed (3)
```
### Mutant M5: register.ts:278 `withSystemScopeOn(db,'public-intake','expert-prereg.rollback', async (tx) =>` → `db.$transaction(async (tx) =>`
```
[ERROR] expert pre-registration rollback failed after a mail error
 ✓ registers, verifies, lists, exports and counts seats through the RLS role
 × removes the new row when the mail fails, through the RLS role 11ms
   → expected 1 to be +0 // Object.is equality
      Tests  1 failed | 2 passed (3)
=== M5 geri alındı ===
      Tests  3 passed (3)
```
Mutantlar dosya yedeğinden geri yüklendi. Commit öncesi `git status --short src/` boştu.

### Commit + push
```
pre-commit: ✓ Kapı temiz (staged kapsamı).
33f444a8 test(expert-prereg): app-role guards for seats and mail rollback (FO-45)
  tests/expert-prereg-app-role.live.test.ts
To https://github.com/yaslan/fonbridge.git
   69ed2dfc..33f444a8  be-fb/fo45-prereg-rls -> be-fb/fo45-prereg-rls
push rc=0
```
### Pre-push gate (`pnpm gate`, tamamı, izole DB)
```
lint: 0 error (yalnız var olan unused-var uyarıları)   typecheck: geçti
vitest: Test Files 351 passed | 7 skipped (358) · Tests 4576 passed | 120 skipped (4696)
✅ i18n check passed
✅ rls:check — 47 tenant-scoped model; CHECK 4c: BlogPost, ExpertPreRegistration, PublicLead
✅ rls:bypass-check — 0 new tenant bypass, 44 sanctioned
✅ rls:verify --require-db — 47 tablo fabrika_app ile ölçüldü
   ✓ ExpertPreRegistration: sistem kapsamı dışında okuma 0 satır · INSERT reddedildi · içeride 0/0
✅ db:rls-role — fabrika_app already exists … Password left unchanged (izole küme)
e2e: 336 passed, 8 skipped (6.6m)  (port 3000 boştu)
✅ alerts:check — öksüz alarm yok
```
Not: 120 vitest skip, gate'in her zamanki yerel skip'leri. Log'daki `[alerts-sweep] failed` satırları e2e/test senaryolarının bilerek ürettiği çıktı; gate rc=0.

### PR #87
```
gh pr view 87 --json headRefOid,mergeable,mergeStateStatus
{"baseRefName":"dev","headRefOid":"33f444a8facf31f971030fb167b5b3c740ae3cb2","mergeStateStatus":"UNSTABLE","mergeable":"MERGEABLE","state":"OPEN"}
gh pr checks 87 → build-and-test / i18n-audit / lighthouse-a11y / rls-check: fail, 2s
annotation: "The job was not started because recent account payments have failed or your spending limit needs to be increased."
```
`UNSTABLE` CI'nin başlatılamamasından kaynaklanıyor, koddan değil. CONFLICTING/DIRTY durumu kapandı. **Merge yapılmadı.**

## Değişen dosyalar
- `tests/expert-prereg-app-role.live.test.ts` (+24/−1): `FOUNDER_SEAT_LIMIT` import, Y-1 assert, Y-2 senaryosu.

## Riskler
- GitHub CI faturalama yüzünden koşmuyor. Tek gerçek kapı yerel pre-push gate; o da tam ve yeşil.
- Y-2 yalnız yeni kayıt dalını kilitliyor. Yeniden gönderim dalı (`previous` token geri yükleme) aynı `withSystemScopeOn` çağrısını paylaştığı için M5 onu da kapsıyor. Ayrı bir canlı senaryosu yok (5 dk cooldown nedeniyle `now` kaydırmak gerekirdi).

## Açık sorular
- Sonuç yolu çelişkisi: teslim metninde iki yol vardı, `/Users/macbook/alan/docs/agent-results/TASK-MVC6CTSCLO6LI-be-fb-2.md` ve `/Users/macbook/alan/FONBRIDGE/docs/agent-results/TASK-MVC6CTSCLO6LI-be-fb-3.md`. `-2.md` benim 2. tur raporum ve crw-fb ona atıf yapıyor. Üzerine yazmadım; bu raporu görev metnindeki `-3.md` yoluna yazdım.

## Sonraki adım
- Lider/se-fb: #87'yi merge'e alabilir. Ardından #92 (FO-50) dev'i merge edip yalnız DATA_MODEL §22'yi elle çözmeli (crw-fb-2 notu).
- Scratchpad'deki durdurulmuş izole PG veri dizini (`…/scratchpad/pgdata`) oturuma özel; silme komutu izinde reddedildi, zararsız.
