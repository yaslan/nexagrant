# TASK-MULSMUB1XU9 — B1 canlı testi ortak rol doğrulama yardımcısına geçti (fe-fb)

## Ne yapıldı

`tests/agency-invite.live.test.ts` içindeki kendi BYPASSRLS kontrolü (eski satır 91-95: `skipReason = …; return;` → sessiz atlama) kaldırıldı; K-6'nın `tests/helpers/live-db-role.ts` yardımcıları kullanılıyor. Kalıp `tests/registration-consent.live.test.ts`'ten alındı:

- `requireRlsTestUrl(RLS_URL, SUITE)` — `try` dışında; CI'da `DATABASE_URL_RLS_TEST` yoksa dosya kırmızı, yerelde uyarı + atlama.
- `DATABASE_URL` yoksa / veritabanına bağlanılamazsa `skipOrFailInCi` (CI'da kırmızı, yerelde atlama).
- `assertRlsSubjectRole(rls, SUITE)` — `try` dışında; BYPASSRLS ya da SUPERUSER rol her ortamda dosyayı düşürür.
- Testlerin `if (!ready) return expect(skipReason).toBeTruthy()` gövdelerine dokunulmadı.

## Kanıt

fabrika_app (`.env` içindeki `DATABASE_URL_RLS_TEST`), macOS:

```
npx vitest run tests/agency-invite.live.test.ts src/lib/agency/invite-code.test.ts
 Test Files  2 passed (2)
      Tests  21 passed (21)
```

(21 = 16 canlı + 5 `invite-code` birim testi; be-fb'nin TASK-MULRQJQYM0NAM raporundaki sayıyla aynı. Verbose koşuda 16 canlı testin tamamı gövdesini koştu, atlama yok.)

Mutasyon: `DATABASE_URL_RLS_TEST` geçici ortamla `fabrika`ya (SUPERUSER + BYPASSRLS) yönlendirildi; `.env` değiştirilmedi:

```
 FAIL  tests/agency-invite.live.test.ts
Error: agency-invite.live: connected as "fabrika" (rolsuper=true, rolbypassrls=true). RLS does not apply to this role, so every isolation assertion here would pass vacuously. Point DATABASE_URL_RLS_TEST at the NOBYPASSRLS role (`pnpm db:rls-role`).
 ❯ tests/agency-invite.live.test.ts:104:3
 Test Files  1 failed (1)
      Tests  16 skipped (16)
exit=1
```

Aynı ortamda ESKİ dosya (stash ile geri alınmış halde): `Test Files 1 passed (1) · Tests 16 passed (16)`. Yani eski dosya BYPASSRLS rolde yeşil gösteriyordu; yeni dosya kırmızı.

`npx eslint tests/agency-invite.live.test.ts` temiz · `npx tsc --noEmit -p .` 0 hata.

`.env` source edilmedi: `envValue` önce `process.env`'e bakıyor, geçici ortam değişkeni yetti.

## Değişen dosyalar

- `tests/agency-invite.live.test.ts`
- `docs/agent-results/TASK-MULSMUB1XU9-fe-fb.md`

## Riskler

- **CI bu dosyayı hâlâ ölçmüyor.** `.github/workflows/ci.yml` "Prepare database" adımı `prisma/migrations/add-agency-invite-code.sql` dosyasını uygulamıyor (`db push` + `db:rls-role` + `db:rls` + `db:seed`). `redeem_agency_invite` yoksa dosya uyarı verip atlıyor. Bu kontrolü `skipOrFailInCi`'ye çevirmek CI'ı kırar, o yüzden kart kapsamı dışında bırakıldı ve eski davranışı korudum.
- CI'da env yokken kırmızı olma dalı yerelde koşulmadı: `envValue` boş `process.env` değerini atlayıp `.env`'e düştüğü için env'i yok göstermek `.env`'e dokunmayı gerektiriyordu. Dal, yardımcının kendi kodu (`requireRlsTestUrl`) ve registration-consent ile aynı kalıpta.

## Açık sorular

- `add-agency-invite-code.sql` CI hazırlık adımına eklensin mi? (be-fb / CI sahibi.) Eklenirse migration yok dalı da `skipOrFailInCi`'ye alınmalı.

## Sonraki adım

Yukarıdaki CI kararı için ayrı kart.

## Platform beyanı

macOS'ta doğrulandı (Darwin, yerel docker-compose Postgres). Değişiklik yalnız test kodu. Dosya yolu, süreç ya da kabuk çağrısı yok; Linux CI'da da aynı davranır. Windows'ta koşulmadı çünkü o ortam yok. Platforma bağlı bir kod yolu da yok.
