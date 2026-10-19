# TASK-MVFDP0EEK0DX7 (FO-99) — ADR-0009 public-intake tablo listesi

**Hüküm:** KISMEN TAMAM — doküman değişikliği yapıldı ve commit'lendi (`2e6bed09`); push ve PR **açılamadı**. Pre-push kapısı (`pnpm gate`) test adımını geçti (363 dosya, 4798 test), ama `rls:verify` adımında durdu: `tenant-discovery` ve `subject-scoped` kapsamları `ExpertPreRegAttempt` ve `ExpertPreRegistration` tablolarında 0 satır görüyor. Kapı atlanmadı. Görev tamamlanmış sayılmaz, DONE yazılmadı.
**Tip:** bug (doküman kayması)
**Platform:** mac (darwin, bu makine). Değişiklik yalnız `.md`; platforma bağlı kod yolu yok.

## Ne yapıldı
- `docs/adr/ADR-0009-signed-system-scope.md:50`: public-intake amacının açtığı tablo listesine `ExpertPreRegAttempt` eklendi (FO-26, PR #95, dev'de `9166a99d`). Karar (K-569554=C) ve kapsam değişmedi. Listenin kopyaları da satıra yazıldı.
- Kart önkoşulu doğrulandı: `git log origin/dev` içinde `d8b97f7e` ve `9166a99d` görünüyor.
- Ayrık worktree: `/Users/macbook/alan/FONBRIDGE-wt-fo99`, dal `se-fb/fo99-adr0009-public-intake` (origin/dev `80271979`'dan). Paylaşılan ağaca dokunulmadı.

## Kanıt (ham çıktı)
Dört kopya (`git grep -n -e "public-intake" -e "ExpertPreRegAttempt" -- docs/adr prisma/rls.sql scripts/check-rls-live.ts src/lib/system-scope.ts`):
```
docs/adr/ADR-0009-signed-system-scope.md:50: ... amaç `public-intake` ise yalnız `ExpertPreRegistration`, `ExpertFounderCounter` ve `ExpertPreRegAttempt` açılır (FO-26 ...)
prisma/rls.sql:327: to_regclass('public."ExpertPreRegAttempt"'))) IS TRUE)))
prisma/rls.sql:331: ... Purpose public-intake opens only ExpertPreRegistration, ExpertFounderCounter and ExpertPreRegAttempt (FO-52, FO-26).
scripts/check-rls-live.ts:631: const PUBLIC_INTAKE_TABLES = new Set([EXPERT_TABLE, 'ExpertFounderCounter', 'ExpertPreRegAttempt']);
src/lib/system-scope.ts:110: * The database opens only ExpertPreRegistration, ExpertFounderCounter and ExpertPreRegAttempt for it (FO-52,
```
Dört yer aynı üç tabloyu gösteriyor.

Test koşuları (worktree):
- İlk koşu (yük ~47, `.env` yüklü): `Test Files 3 failed | 360 passed`, `Tests 6 failed | 4792 passed` — 3 form testi ve 1 hata-gövdesi testi 30 sn zaman aşımı, 2 PDF testi süre eşiği.
- İzole yeniden koşu (3 dosya): `Tests 4 failed | 62 passed (66)` — zaman aşımı/eşik tipinde.
- Push denemesi 1 (`.env` yüklenmeden): hook DB kimlik doğrulamasında başarısız, `Test Files 18 failed | 320 passed`, `Tests 60 failed` — ortam eksiği.
- Push denemesi 2 (`.env` yüklü, normal push): `Test Files 363 passed | 7 skipped (370)`, `Tests 4798 passed | 120 skipped (4918)`. Testler geçti.

Kapı, testlerden sonra `rls:verify` (`tsx scripts/check-rls-live.ts --require-db`) adımında durdu. Ham çıktının önemli satırları:
```
⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
❌ KİRACI İZOLASYONU UYGULANMIYOR — bu bir ortam gürültüsü değil, güvenlik durumu.
   • tenant-discovery: daraldı, tüm satırları görmüyor: ExpertPreRegAttempt=0, ExpertPreRegistration=0
   • subject-scoped: daraldı, tüm satırları görmüyor: ExpertPreRegAttempt=0, ExpertPreRegistration=0
   Onarım: pnpm db:rls   (gerekirse önce pnpm db:rls-role)
```
Diğer ölçümler geçti: public-intake yalnız ExpertPreRegistration, ExpertFounderCounter, ExpertPreRegAttempt'i açıyor (51 system_scope tablosu kapalı, sahte kapsam denemeleri 0 satır).

Makine yükü ilk koşuda: `load averages: 47.23 45.23 32.15`.

**Yorum:** Bu değişiklik yalnız `.md`; test edilen kod origin/dev ile birebir aynı (`git diff --stat origin/dev HEAD`: 1 dosya). `rls:verify` çıktısının dev'de de aynı olup olmadığı ölçülmedi. Yerel veritabanının RLS sürümünün güncel olmaması ya da `ExpertPreRegistration`/`ExpertPreRegAttempt` kapsam tanımının dev ile uyuşmaması mümkün, doğrulanmadı. Onarım (`pnpm db:rls`) bu kartın kapsamı dışında ve veritabanına dokunduğu için çalıştırılmadı.

## Neden değerlendirme
- Commit yalnız `docs/adr/ADR-0009-signed-system-scope.md` içeriyor (`git diff --stat origin/dev HEAD`: 1 dosya, 1+/1-). Test edilen kod origin/dev ile birebir aynı; kırılmalar bu değişiklikten gelmiyor.
- Kırılmalar zamanlama tabanlı (zaman aşımı, ms eşiği) ve yüksek yük altında koşuldu. Dev'de aynı kırılma olup olmadığı bu koşuda ölçülmedi (dev ağacında ayrı koşu yapılmadı).

## Riskler
- Pre-push kapısı geçmediği için branch uzakta yok; PR açılmadı.
- Güvenlik riski (ayrı konu): yerel veritabanında kiracı izolasyonu `tenant-discovery` ve `subject-scoped` kapsamlarında uygulanmıyor görünüyor (`ExpertPreRegistration` ve `ExpertPreRegAttempt` için 0 satır). Ölçüm rolü `fabrika` süper kullanıcı; `rls:verify` bunu uyarıyor. Doğrulanmadan kesin "açık" denemez, ama kapının durdurduğu bir sinyal.
- `--no-verify` ile atlamak proje kuralına aykırı; yapılmadı.

## Açık sorular
- `rls:verify` dev koduyla aynı veritabanında koşulunca da aynı sonucu veriyor mu?
- `pnpm db:rls` (veritabanına yazar) çalıştırılsın mı, yoksa sahip bu veritabanını ayrıca mı ele alacak?

## Sonraki adım
1. `rls:verify` sorunu netleşince (yerel DB onarımı, sahip onayıyla, ya da dev baseline karşılaştırması) gate'i yeniden koş.
2. Gate geçince `git push -u origin se-fb/fo99-adr0009-public-intake` ve PR (base `dev`, merge yok).
3. Ardından DONE.
