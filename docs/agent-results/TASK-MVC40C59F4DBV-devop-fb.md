---
sözleşme: 3
kod: FO-36
kart: TASK-MVC40C59F4DBV
ajan: devop-fb
motor: claude
tip: runtime
okur: kullanıcı
hüküm: Tamam: parola kayması kanıtlandı (db:rls-role parolayı checkout'lar arasında eziyordu); script artık mevcut rolün parolasını değiştirmez, uyuşmazlıkta açık kırmızı verir. pnpm gate yeşil (GATE_EXIT=0).
platform: mac (darwin 27.0, Postgres 16 konteyneri localhost:5433 paylaşımlı DB + geçici postgres:16-alpine kanıt konteyneri). Linux/CI: koşulamadı (CI iş akışı GitHub kullanım limiti nedeniyle çalışmıyor); betik platforma bağlı değil (pg istemcisi, yol: process.cwd()). Windows kapsam dışı.
sürüm: 1
---

# FO-36 · fabrika_app parola kayması: kök neden ve gate düzeltmesi

Dal: `devop-fb/fo36-rls-role-drift` (`origin/dev` 7f8d3de4 tabanlı). PR `--base dev`, merge edilmedi.

## Kök neden (ölçüldü)

- Rol küme-geneli: iki checkout aynı Postgres'i (5433, `fabrika`) paylaşır, `fabrika_app` tek bir roldür.
- Parola ise her checkout'un kendi `.env` dosyasındaki `DATABASE_URL_RLS_TEST` değerindedir.
- `scripts/setup-rls-role.ts` rol varken de `prisma/rls-app-role.sql` içindeki `ALTER ROLE … PASSWORD` bloğunu çalıştırıyordu. Yani her `db:rls-role` çalıştırması, o checkout'un `.env` parolasını cluster'daki rolün parolası yapıyordu.
- `pnpm gate` zincirinde `db:rls-role` her koşuda çalışıyordu. Bir checkout'un koşusu diğerlerini sessizce 28P01'e düşürüyor, sonra gate kendi koşusunda parolayı yeniden yazıp bunu gizliyordu.
- Başka parola yazan betik yok (`grep` ile doğrulandı). Tek yazıcı bu script'in SQL'i. Ek risk: `.env`'de anahtar yoksa betik rastgele yeni parola üretip rolü değiştiriyordu.

### Yeniden üretim (geçici Postgres 16 konteyneri, paylaşımlı DB'ye dokunulmadı)

```
== step1: A runs db:rls-role
✅ fabrika_app connects as fabrika_app ...
A login OK
== step2: B runs db:rls-role (its own .env)
✅ fabrika_app connects as fabrika_app ...
B login OK
A login FAIL 28P01
== step3: A re-runs db:rls-role (gate in A)
A login OK
B login FAIL 28P01
```

## Düzeltme

`scripts/setup-rls-role.ts`:
- Rol yoksa: eski davranış (oluştur, `.env` parolası ya da üretilmiş parola).
- Rol varsa: parola DEĞİŞMEZ. `.env` parolasıyla giriş doğrulanır. Uyuşmazlıkta (28P01) açık hata: "password does not match … Copy DATABASE_URL_RLS_TEST from that checkout's .env, or rotate with rollback + create".
- Rol varsa ama `.env`'de anahtar yoksa: açık hata (parola bilinmiyor), rastgele parola üretilmez.
- Rotasyon artık bilinçli bir işlem: `pnpm db:rls-role:rollback` + `pnpm db:rls-role`; diğer checkout'lar yeni değeri kopyalar.
- `README.md` satır 30 yeni davranışa göre güncellendi.
- `package.json` gate zinciri ve `CLAUDE.md` gate satırı DEĞİŞMEDİ (ikisi birebir aynı, hizalı). `db:rls-role` gate'te kalır, artık yalnız doğrular.

## Doğrulama (ham çıktı)

Betik senaryoları (geçici konteyner, 5 senaryo):
```
S1 A creates role           ✅ fabrika_app connects as fabrika_app ...  | A login OK
S2 B (different pw)         ❌ DATABASE_URL_RLS_TEST password does not match the fabrika_app role on this database. ...   rc=1 | A login OK, B login FAIL 28P01
S3 A re-runs (unchanged)    ✅ fabrika_app already exists; DATABASE_URL_RLS_TEST logs in as fabrika_app. Password left unchanged.
S4 A's .env without key     ❌ fabrika_app already exists but DATABASE_URL_RLS_TEST is not set in this .env ...
S5 rollback + create (C)    ✅ fabrika_app removed → ℹ️ generated a password → ✅ connects; C login OK
```
Paylaşımlı DB (5433), salt okunur:
```
pnpm db:rls-role (eşleşen .env)           ✅ fabrika_app already exists; ... Password left unchanged.
yanlış parola (env override)              ❌ DATABASE_URL_RLS_TEST password does not match ...
```
Tam `pnpm gate` (fo36 worktree, shared DB 5433, GATE_EXIT ham çıktı `scratchpad/fo36/gate.log`):
```
✖ 4 problems (0 errors, 4 warnings)                       ← lint (uyarı; hata 0)
 Test Files  344 passed | 7 skipped (351)                  ← vitest
      Tests  4510 passed | 120 skipped (4630)
✅ i18n check passed
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
$ tsx scripts/setup-rls-role.ts
✅ fabrika_app already exists; DATABASE_URL_RLS_TEST logs in as fabrika_app. Password left unchanged.
   331 passed (8.0m)                                      ← e2e (playwright)
✅ Öksüz alarm yok
GATE_EXIT=0
```

## Değişen dosyalar

- `scripts/setup-rls-role.ts` — mevcut rolde parola değiştirilmez; doğrulama ve açık hata
- `README.md` — satır 30 davranış notu
- `docs/agent-results/TASK-MVC40C59F4DBV-devop-fb.md` — bu rapor

Hafıza: `fonbridge-local-e2e-db-and-rls-role-traps.md` güncellendi (kök neden artık kanıtlı).

## Riskler

- Mevcut diğer checkout'ların `.env` değerleri bu PR öncesinde ezilmiş olabilir. Bu worktree'deki `.env` ile giriş OK; diğer checkout'lar eşleşmezse yeni hata mesajı rehberi kullanmalı.
- CI koşulamadı (GitHub kullanım limiti). CI'da rol her seferinde temiz DB'de oluşturulur; yeni dal sadece "rol yok → oluştur" yolunu etkiler, orada değişmez.
- Gate'teki 4 lint uyarısı (`src/lib/invitations/accept.ts`, iki test dosyası) bu işle ilgisiz, önceden var.

## Açık sorular

1. Diğer checkout'ların (`.claude/worktrees/*`) `.env` parolaları hâlâ eşleşiyor mu? Bu PR birleşince her birinde `pnpm db:rls-role` bir kez doğrulasın; uyuşmayan olursa değeri ana checkout'tan kopyalamak gerekir.

## Sonraki adım

PR `--base dev` açıldı; merge edilmedi.

## Platform

mac (darwin 27.0). Linux/CI: koşulamadı (GitHub kullanım limiti). Windows: kapsam dışı.
