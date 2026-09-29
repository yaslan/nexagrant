# TASK-MUMMIHYY2F4KB — FB Outlook takvim bağlantısı kaldırıldı (fe-fb)

Sprint FB-KAMU-2 · patron kararı 29.09: M9'da yalnız Google Takvim + .ics · dal `dev`
Commit'ler: `15313bc6` (sağlayıcı + UI + testler), `4dc067ef` (çalışma zamanı katalogu + e2e iddiası)

## 1. Ne yapıldı
- `src/lib/calendar/outlook.ts` silindi. `provider.ts`: `CalendarProviderType` / `CalendarProviderSchema` artık `'google' | 'ics'`. `factory.ts`: `outlook` dalı ve `microsoftClientId/Secret` seçenekleri silindi. `errors.ts` yorumu güncellendi (`SELF_SERVE_PROVIDERS` zaten `['ics']`).
- Ayar ekranı (`settings/calendar/client.tsx`): `PROVIDERS` içinden Outlook kartı silindi. Artık yalnız Google Calendar + .ics.
- `calendar-actions.ts`: Outlook için ayrı bir kod dalı yoktu; Outlook, Google ile aynı `CALENDAR_OAUTH_NOT_CONFIGURED` yolundan geçiyordu. Artık şema `'outlook'` değerini tanımıyor, bu yüzden `CALENDAR_UNKNOWN_PROVIDER` ile reddediliyor. Başlık yorumu güncellendi.
- `users-scheduled-deletion.ts`: Outlook dalı yoktu, yalnız bir yorumda adı geçiyordu ("Google/Outlook token"). Yorum düzeltildi. `calendarConnection.deleteMany({ where: { userId } })` sağlayıcıdan bağımsız, bu yüzden silme akışı Google/ICS için aynı kaldı.
- i18n: Outlook geçen iki metin küçük, hedefli düzenlemelerle değiştirildi. Her düzenlemeden hemen önce dosya yeniden okundu, dosyalar baştan yazılmadı:
  - `messages/{tr,en}.json` → `settings.calendar.infoText`. **Çalışma zamanında yüklenen katalog budur** (`src/i18n/request.ts:15`).
  - `src/locales/{tr,en}/settings.json` → `settings.calendar.description`. Kartta adı geçen dosya buydu, ama bu dosya çalışma zamanında yüklenmiyor. Outlook metni tarayıcı karesinde yine görünüyordu; kaynağı `messages/` çıktı ve orada da düzeltildi.
  - Anahtar eklenmedi ve silinmedi. `pnpm i18n:check` geçti, baseline artmadı.
- `.env.example`: içinde `MICROSOFT_OAUTH_*` satırı **yoktu** (`grep` 0 sonuç), silinecek bir şey çıkmadı.
- Testler:
  - `provider.test.ts`: Outlook sınıf testleri yerine iki test kondu: "Outlook sağlayıcı tipi değil" (`options === ['google','ics']`) ve "factory reddeder".
  - `tests/m9-calendar-connect.test.ts`: `outlook` artık `CALENDAR_UNKNOWN_PROVIDER` ile reddediliyor.
  - `tests/calendar-token-db.live.test.ts`: düz metin kapısı örneğinde `'outlook'` yerine `'google'` kullanıldı.
  - `tests/e2e/m9-calendar-connect.spec.ts`: tr/en ekranında Google + .ics var, `Outlook|Microsoft` metni yok iddiası eklendi.

## 2. Kanıt
- **Envanter** (`/usr/bin/grep -rni "outlook\|microsoft" src tests .env.example`): Outlook yalnız calendar lib, ayar ekranı, iki locale açıklaması ve testlerde geçiyordu. Microsoft eşleşmelerinin geri kalanı SSO/Entra ile ilgiliydi (`sso`, `admin/billing`, `auth*`); bu dosyalara dokunulmadı.
- **DB sayımı** (yalnız SELECT, `fabrika-postgres` süper kullanıcısı `fabrika`, `rolsuper=t` yani RLS atlanıyor):
  `select provider,count(*) from "CalendarConnection" group by 1` → `ics|1`
  `... where lower(provider)='outlook'` → **0**. Hiçbir satır silinmedi.
  Ayrıca koddan: ileride bir `outlook` satırı çıkarsa `sync.ts` bu satırda factory'nin attığı `Unknown calendar provider` hatasını yakalar ve SystemAlert yazar, çökmez. Ayar ekranı da bu satırı göstermez (yalnız `PROVIDERS` kartlarını çizer).
- **typecheck**: `tsc --noEmit` exit 0.
- **lint**: tam `pnpm lint` exit 0.
- **vitest**: `Test Files 216 passed | 2 skipped (218)`, `Tests 2470 passed | 8 skipped (2478)`.
  - Atlanan testler bu işle ilgisiz: `tests/adapters.test.ts` 2, `tests/k1-daily-calls.test.ts` 4, `tests/sedia-adapter.test.ts` 2.
  - Canlı DB testi `calendar-token-db.live.test.ts` 2/2 gerçekten koştu, atlanmadı.
- **i18n**: `✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.`
  Rapor `smtp-form.tsx 13 → 6` düşüşünü de gösterdi. O dosya başka bir ajanın; baseline'ı güncellemedim.
- **Temiz worktree build**: HEAD `4dc067ef`, ayrı worktree'de `pnpm install --frozen-lockfile` → `pnpm db:generate` → `pnpm build` **exit 0**.
  - Route listesinde `ƒ /[locale]/[workspace]/settings/calendar` var.
  - Tek uyarı `instrumentation.ts` içindeki `process.exit`; önceden de vardı.
  - İlk denemede `.prisma/client/index-browser` bulunamadı. Sebebi taze worktree'de Prisma client'ın üretilmemiş olmasıydı, kodla ilgisi yok.
- **Mutasyon**: `'outlook'` şemaya ve factory'ye geri eklenince 3 test kırmızı oldu (`is not a provider type`, `is refused by the factory`, `rejects outlook as an unknown provider`), sonuç `Tests 3 failed | 26 passed`. Değişiklik `git checkout HEAD --` ile geri alındı, sonuç `29 passed`. İş mutasyondan önce commit'lendi.
- **Gerçek tarayıcı, :3000** (bu repodan çalışan `next dev`; AgentSpace iç tarayıcısı; e-posta formuna gerçek yazma ve gerçek tıklama ile giriş). Geçici M9 fixture'ı kuruldu, iş bitince silindi (`Tenant m9-e2e-tenant` sayısı 0). Kareler `docs/agent-results/TASK-MUMMIHYY2F4KB-screenshots/`:
  - `01-tr-before-infotext-fix.png`: Outlook kartı yok, ama bilgi kutusu hâlâ "Google ve Outlook" diyordu. `messages/` düzeltmesi bu kareyle bulundu.
  - `02-tr-calendar-settings.png`: tr ekranı. Kartlar Google Calendar + .ics File Import; bilgi metni "Google Takvim bağlantısı…"; sayfa metninde Outlook yok (readPage).
  - `03-en-calendar-settings.png`: en ekranı. Kartlar Google Calendar + .ics; metin "Google Calendar connection is not enabled…"; Outlook yok.
  - `04-tr-brief-ics-clicked.png`: brif ekranında `[data-testid="m9-ics-download"]` gerçek tıklamayla basıldı. Ardından `[role=alert]` aranınca bulunamadı, yani `ics.noScheduleError` çıkmadı ve işleyici blob indirme adımına geçti.
    **Sınır:** iç tarayıcı indirilen dosyayı dışarı vermiyor (`~/Downloads`'ta yeni `.ics` yok). Bu yüzden dosya baytları bu turda okunamadı. Bayt düzeyindeki kanıtı `tests/e2e/m9-ics-download.spec.ts` üretir; o dosyada bu işle değişen bir şey yok.
- **Playwright e2e koşturulamadı**: `npx playwright test` komutunu AgentSpace kill-guard (`R8-canli-app-varken-acilis`) reddetti, çünkü canlı AgentSpace açıktı. Guard atlatılmadı. Yeni e2e testi lint ve typecheck'ten geçti, ama Playwright runner'ı altında **koşmadı**. Aynı iddialar (Google + .ics var, Outlook/Microsoft yok, tr + en) iç tarayıcıda elle doğrulandı.

## 3. Değişen dosyalar
`src/lib/calendar/outlook.ts` (silindi), `src/lib/calendar/{factory,provider,errors}.ts`, `src/app/[locale]/(app)/[workspace]/settings/calendar/client.tsx`, `src/modules/m9/server/calendar-actions.ts`, `src/lib/inngest/jobs/users-scheduled-deletion.ts`, `src/locales/{tr,en}/settings.json`, `messages/{tr,en}.json`, `src/lib/calendar/__tests__/provider.test.ts`, `tests/m9-calendar-connect.test.ts`, `tests/calendar-token-db.live.test.ts`, `tests/e2e/m9-calendar-connect.spec.ts`, `docs/agent-results/TASK-MUMMIHYY2F4KB-screenshots/*`, bu rapor.

## 4. Riskler
- Veritabanında `CalendarConnection.provider` sütunu serbest `String`. İleride elle bir `outlook` satırı yazılırsa sync bunu SystemAlert olarak kaydeder, ayar ekranı da göstermez. Bugün böyle bir satır yok (0).
- Outlook adı hâlâ şu yorumlarda geçiyor: `prisma/schema.prisma:1326-1329` (sağlayıcı yorumları) ve `tests/gdpr-data-subject.live.test.ts:553`. İkisi de görev kapsamı dışında kaldığı için dokunmadım, davranışa etkileri yok.
- `src/locales/**` çalışma zamanında yüklenmiyor gibi görünüyor, çünkü `request.ts` yalnız `messages/` yüklüyor. Bu ikili yapı ileride aynı "düzelttim ama ekranda yok" durumunu yeniden üretebilir.

## 5. Açık sorular
- `src/locales/` ölü bir katalog mu? Kaldırılması ya da `messages/` ile birleştirilmesi ayrı bir kart olabilir.
- Prisma şemasındaki Outlook yorumları temizlensin mi? Şema dosyası ortak kullanılıyor, bu yüzden bunu ayrı bir onayla yapmak daha uygun.

## 6. Sonraki adım
- Canlı AgentSpace kapalıyken ya da patron onayıyla (`MURAT_LIVE_OK=1`) şunu koşun: `npx playwright test tests/e2e/m9-calendar-connect.spec.ts tests/e2e/m9-ics-download.spec.ts`. Böylece yeni e2e iddiası ve ICS bayt kanıtı runner altında da görülür.
- crw-fb incelemesi.

**Platform beyanı:** Doğrulama **macOS**'ta (Darwin 27, Chromium tabanlı AgentSpace iç tarayıcısı, :3000 `next dev`) yapıldı.
- Değişiklik saf TS/React/JSON: sağlayıcı listesi, zod enum'u ve i18n metni. Süreç, dosya yolu, kabuk ya da ekran/DPI yoluna dokunmuyor, dolayısıyla Windows ve Linux'ta davranış aynı olmalı.
- `.ics` üretimi tarayıcıdaki Blob ile yapılıyor, işletim sisteminden bağımsız.
- Windows ve Linux'ta ayrıca **koşulamadı**, çünkü bu makinede bu platformlar yok.
