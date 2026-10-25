---
sözleşme: 3
görev: TASK-MVC91K7JYOWQC
kod: TASK-MVC91K7JYOWQC
ajan: be-fb
motor: claude
tip: yayın
okur: ekip
hüküm: Bitti: origin/dev (7bf972c9) PR #92'ye merge edildi, tek çakışma DATA_MODEL §22 elle çözüldü, izole DB'de tam pre-push gate yeşil, normal push d1c4876f, PR MERGEABLE (CI işleri GitHub faturalama limiti yüzünden başlamadı); merge yapılmadı.
platform: mac (Darwin 27, yerel Postgres :5433, izole DB fabrika_fo50_be). Değişiklik yalnız doküman birleştirmesi + sunucu tarafı kod; platforma bağlı kod yolu yok. Windows/Linux koşulmadı: gerek yok, CI (Linux) GitHub faturalama limiti yüzünden başlamadı.
sürüm: 1
tarih: 2026-10-17T21:56:19.314Z
---

# FO-50 · PR #92 güncel dev'e merge edildi (FO-45 #87 sonrası)

## Ne yapıldı

1. `git fetch origin`. `7bf972c9` (#87 merge) origin/dev'de. Dal, dev'in 5 commit önündeydi (FO-50 commit'leri). #87'nin eski head commit'leri dev'de zaten vardı, bu yüzden diff'e girmediler.
2. `git merge --no-ff origin/dev`. Otomatik birleşen dosyalar: `prisma/migrations/apply-order.txt`, `prisma/schema.prisma`, `scripts/tenant-bypass-baseline.json`, `src/lib/expert-prereg/server/constants.ts`, `tests/expert-prereg-reissue.live.test.ts`, `tests/expert-prereg.live.test.ts`. Tek çakışma `docs/DATA_MODEL.md`'deydi.
3. **Çakışmanın çözümü (§22, tek hunk, iki madde):**
   - **Kurucu Uzman numarası:** HEAD'in (FO-50) metni kaldı: ayrı sayaç, `max(lastNumber, max(founderNumber))`, koltuk `100 − lastNumber`. Dev'in metni `max(founderNumber)+1` diyordu; FO-50 bu davranışı değiştirdiği için o metin artık geçersiz.
   - **Spam ve sınır:** dev'in metni kaldı. F6 listesinde "unvan, **kurum**, il" yazıyor (FO-45, organization). FO-50 bu maddeyi değiştirmemişti.
   - "Alanlar" satırı (organization dahil) ve "DB seviyesi (FO-45)" RLS maddesi çakışmadan geldi. Saklama maddesi (1 yıl, sayaç) ve §22a da yerinde duruyor.
   - Başka dosyada çakışma yok.
   - `git diff origin/dev -- docs/DATA_MODEL.md` artık yalnız FO-50'nin değişikliklerini gösteriyor: kurucu maddesi, saklama kararı, §22a.
4. Merge commit: `d1c4876f merge: origin/dev into be-fb/fo50-prereg-retention (FO-45 merged; keep counter text, F6 names kurum)`.

## Migration apply-order

`prisma/migrations/apply-order.txt`, merge sonrası:
```
58: add-expert-pre-registration.sql
...
69: add-expert-pre-registration-organization.sql   (FO-25)
70: expert-prereg-rls-mail-quota.sql               (FO-45, #87)
71: add-expert-founder-counter.sql                 (FO-50, #92)
```
Sıra doğru:
- Önce tablo, sonra kolon, sonra FO-45'in RLS'i ve kota kolonları, en son sayaç.
- Sayaç migration'ı başlangıç değerini `ExpertPreRegistration`'dan okur. `system_scope` politikası 70'te kurulmuş olmalı; sayaç da aynı politika gövdesini taşıyor.
- Saklama (`expert-prereg-cleanup`) yalnız koddan oluşan bir gece işi; ayrı migration'ı yok.

## DB güvenliği

```
DATABASE_URL (kabukta, .env yüklenmeden)=          ← boş
DATABASE_URL (.env yüklendi)=postgresql://fabrika:***@localhost:5433/fabrika   ← paylaşılan
override:
DATABASE_URL=postgresql://fabrika:***@localhost:5433/fabrika_fo50_be
DATABASE_URL_MIGRATE=postgresql://fabrika_migrate:***@localhost:5433/fabrika_fo50_be
DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@localhost:5433/fabrika_fo50_be
push DB: postgresql://fabrika:***@localhost:5433/fabrika_fo50_be
```
- Paylaşılan `fabrika` DB'sine migration, down, `db:rls` ya da `db:rls-role` koşulmadı. Yalnız bir kez salt-okunur `SELECT count(*)` ile seed karşılaştırması yapıldı: `fabrika|104|8|35|11` ve `fabrika_fo50_be|13|7|1|11`.
- İzole DB'nin şeması dalla aynıydı. Dev'den gelen tek şema değişikliği `organization` kolonuydu ve izole DB'de zaten vardı: `organization+verifyMailCount = 2`, `relrowsecurity = t`. Bu yüzden izole DB'ye de yeni migration koşmadı.
- Gate'in `db:rls-role` adımı izole DB'de koştu: `✅ fabrika_app already exists; DATABASE_URL_RLS_TEST logs in as fabrika_app. Password left unchanged.` Rol küme genelinde, ama parola değişmedi (0b116622'den beri). Yetkiler DB'ye özgü olduğu için yalnız `fabrika_fo50_be`'yi etkiledi.

## Kanıt (ham çıktı)

Push'tan önce, izole DB'de expert birim + canlı testleri:
```
Test Files  13 passed (13)
     Tests  112 passed (112)
```
Normal push, tam pre-push `pnpm gate`, `push_rc=0`:
```
$ pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check && pnpm rls:check && pnpm rls:bypass-check && pnpm rls:verify --require-db && pnpm db:rls-role && pnpm test:e2e && pnpm alerts:check
 Test Files  360 passed | 2 skipped (362)
      Tests  4668 passed | 54 skipped (4722)
✅ i18n check passed
✅ SUCCESS: All 47 tenant-scoped models have RLS policies registered. (+2 SUCCESS)
✅ SUCCESS: no new tenant bypass. 0 … allowed with a recorded reason, 45 on the sanctioned cross-tenant path, 0 still owed.
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ ExpertFounderCounter: sistem kapsamı içinde 1/1 satır görüldü
   ✓ ExpertFounderCounter: sistem kapsamı dışında okuma 0 satır (tabloda 1)
   ✓ ExpertFounderCounter: sistem kapsamı dışında INSERT reddedildi
   ✓ ExpertFounderCounter: ölçüm rolünde DELETE ve TRUNCATE yetkisi yok
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
✅ fabrika_app already exists; … Password left unchanged.
  344 passed (6.6m)   8 skipped        (e2e)
✅ Öksüz alarm yok
   f3e1fbfe..d1c4876f  be-fb/fo50-prereg-retention -> be-fb/fo50-prereg-retention
```
E2E logundaki `[WebServer] ⨯ uncaughtException: Error: aborted` satırları test sırasında yarıda kesilen isteklerden geliyor; hiçbir test düşmedi (344 passed).

```
$ gh pr view 92 --json headRefOid,mergeable,mergeStateStatus
{"baseRefName":"dev","headRefOid":"d1c4876ffcc1a597460438114e06014d1d0e95ab","mergeStateStatus":"UNSTABLE","mergeable":"MERGEABLE","state":"OPEN"}
$ gh pr checks 92
build-and-test fail 2s · i18n-audit fail 2s · lighthouse-a11y fail 2s · rls-check fail 2s
annotation: "The job was not started because recent account payments have failed or your spending limit needs to be increased."
```
`UNSTABLE` = CI işleri GitHub faturalama limiti yüzünden **hiç başlamadı**. Dev'deki son 3 CI koşusu da aynı sebeple `failure`. Kodla ilgisi yok; yerel tam gate yeşil.

## Typecheck tuzağı (çözüldü)

Merge'den sonra `pnpm typecheck` worktree'deki eski `.next/dev/types/validator.ts` yüzünden kırıldı. FO-68 sayfaları `(marketing)` altına taşıdığı için eski üretilmiş tipler artık olmayan `page.js`'leri gösteriyordu. `tsconfig` `.next/dev/types/**` dizinini içeriyor. Dizin gitignore'lu bir derleme artığı. Worktree'de dev sunucusu çalışmadığı doğrulandı. `rm -rf` izinle reddedildi, bu yüzden dizini silmek yerine şuraya taşıdım: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/d48a254a-b126-4763-be5e-4994639dbd62/scratchpad/fo50-next-dev-stale`. Sonra typecheck temiz geçti.

## Değişen dosyalar

- `docs/DATA_MODEL.md`: merge çakışma çözümü (§22).
- Merge commit `d1c4876f`: dev'den gelen değişiklikler, FO-50 kodu değişmedi.

## Riskler

- CI hiç koşmadı (faturalama). Merge kararı yalnız yerel gate'e dayanacak.
- İzole DB `fabrika_fo50_be` paylaşılan :5433 kümesinde duruyor; ayrı bir DB, ama ayrı bir küme değil. Rol işlemi parolayı değiştirmedi.

## Açık sorular

Yok.

## Sonraki adım

- crw-fb / lider: #92'yi incelesin ve merge kararını versin (merge yapılmadı).
- GitHub Actions faturalaması düzelince CI yeniden koşturulmalı.
