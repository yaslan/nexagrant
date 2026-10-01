# TASK-MUPUHPTNIULIX — fe-fb: "fabrika" kalıntıları

**Hüküm: TAMAM (2 madde bilerek açık bırakıldı, aşağıda soru olarak)** · dal `fe-fb/rebrand-leftovers` · kod SHA `7a09909d` · push yok.
**Platform: mac (Darwin) — yalnız burada doğrulandı.** Kod yolu platforma bağlı değil (dosya adı string'i, JSX); Windows/Linux koşulamadı (makine yok), farkı beklenmez. Tarayıcı: Google Chrome (Playwright channel).

## 1. Ne yapıldı
1. `fabrika-data-export-*` → `fonbridge-data-export-*` (4 dosya: settings/privacy/client.tsx, api/gdpr/export, api/user/export-data, api/user/export).
2. `docs.fabrika.app`: depoda FonBridge yardım adresi TANIMLI DEĞİL (grep) → alan adı uydurmadım, iki bağlantıyı (admin/layout.tsx altbilgi, UserMenu "Yardım & Dokümantasyon") kaldırdım + kullanılmayan `ExternalLink`/`HelpCircle` import'ları.
3. Landing mock adres çubuğu `fabrika.eu/tr/default/pipeline` → `fonbridge.com/tr/default/pipeline`.
4. `support@fabrika.dev`: dev'de zaten `info@fonbridge.com` (src/lib/beta/constants.ts:50-51) — doğrulandı, değişiklik yok.
5. Tarama: kalan görünen/yarı-görünen öğeler aşağıda.

## 2. Kanıt
- `git grep -n -i fabrika -- src messages public` satır sayısı: ÖNCE 85 → SONRA 78 (messages/public: 0). Çıkan 7: 4 dosya adı + 2 docs bağlantısı + 1 landing.
- `npx tsc --noEmit` → çıkış 0.
- `npm test` (DB :5433 açık): `Test Files  305 passed | 6 skipped (311)` · `Tests  4105 passed | 119 skipped (4224)`. Eski dosya adını sabitleyen test yoktu (grep boş), güncelleme gerekmedi.
- Gerçek indirme (yerel `next dev :3999`, demo giriş, /tr/default/settings/privacy, "Verilerimi İndir" tıklaması): `RESP 200 /api/user/export attachment; filename="fonbridge-data-export-2026-10-01.json"` ve `FILENAME fonbridge-data-export-2026-10-01.json` (Playwright download olayı). Ekran görüntüsü: /tmp/fefb/privacy.png, /tmp/fefb/after.png (yerel, depoya eklenmedi).
- Not: ilk deneme çerez bandı yüzünden zaman aşımına uğradı; bandı kapatınca geçti (test düzeneği, ürün hatası değil).

## 3. Değişen dosyalar
src/app/[locale]/(app)/[workspace]/settings/privacy/client.tsx · src/app/api/gdpr/export/route.ts · src/app/api/user/export-data/route.ts · src/app/api/user/export/route.ts · src/app/[locale]/admin/layout.tsx · src/components/UserMenu.tsx · src/app/[locale]/page.tsx

## 4. Riskler
- Yardım menüsü öğesi kalktı; yeni adres gelince geri eklenmeli.
- İç tanımlayıcılar bilerek DOKUNULMADI: ICS UID `@fabrika.app` (calendar.ts, briefs/client.tsx + test — değişirse kullanıcıların içe aktardığı takvim olayları çiftlenir), cookie `fabrika-theme`, iyzico `fabrika` conversation prefix, KEY_LABEL'lar, `fabrika` DB rolü, brief şablon işareti, externalId.

## 5. Açık sorular (patrona)
1. FonBridge yardım/doküman adresi nedir? (verilirse iki bağlantı geri eklenir)
2. `BETA_MEETING_URL` varsayılanı `https://meet.google.com/fabrika-beta-checkin` (constants.ts:53) ve m10 sahte belge URL'si `storage.fabrika.app` (modules/m10/server/actions.ts:145,250) kullanıcıya görünebilir; doğru Meet odası / depolama alan adı verilmedi, uydurmadım. Kapsam dışı bıraktım.

## 6. Sonraki adım
Yanıt gelince 5.1/5.2 küçük takip kartı; dal incelemeye hazır (dev'e merge sizde).

## Ek (patron yanıtı sonrası)
- Soru 1 → yardım bağlantıları `https://fonbridge.com/yardim` ile geri eklendi (admin altbilgi + UserMenu), import'lar geri geldi.
- Soru 2 → `BETA_MEETING_URL` varsayılanı `https://meet.google.com/eio-ftwm-wak` (constants.ts + .env.example); ayrıca `scripts/beta-onboarding.ts` ics dosya adı `fonbridge-beta-checkins.ics`.
- `storage.fabrika.app` (m10 sahte belge URL'si) için yanıt gelmedi, dokunulmadı.
- `npx tsc --noEmit` 0; ilgili vitest (tests + src/lib/beta): 241 passed | 6 skipped dosya, 2914 passed | 119 skipped test.
