# TASK-MUMLFVDX85O4M — cs-fb — 29.09 patron kararları ROADMAP'e ve hukuk paketine (1.2)

**Kart:** TASK-MUMLFVDX85O4M (FB-KAMU-2) · **Dal:** dev · **Taban:** `e46d9798`

> **Kart tanımı okunamadı.** Worker pane'de `list_tasks` yalnız başlığı döndürüyor. İş, kart başlığına, delegasyon metnine ve board'daki ilgili kartların başlıklarına göre yapıldı. Kaçırdığım bir madde varsa lider bildirsin (§5).

## 1. Ne yapıldı

Altı kararın her biri iki belgeye işlendi. Kod kartları sürdüğü için "uygulama <kart>'ta sürüyor" dili kullanıldı. "Kaldırıldı" yalnız karar için yazıldı, kod için yazılmadı.

| Karar (patron, 29.09) | Kaynak kart | Uygulama kartı (board durumu) | ROADMAP | Hukuk paketi 1.2 |
| --- | --- | --- | --- | --- |
| #16 çalışma zamanında RLS → **HAYIR** | TASK-MULQM9UCIRY1A (`done`) | — (kod değişmiyor) | Başlık notu, E1 satırı, Pilot kapıları altı, Açık karar #16 → KAPANDI | Pakette RLS iddiası yok, değişiklik gerekmedi |
| Sentry kaldırılıyor | TASK-MULQM3LFB4KRA daraltması | TASK-MUMLEUIQWSI59 (in_progress, se-fb) | Başlık, E0, FB-GAP-1, E10 §21 notu | §5 md.3 "çıkanlar"; 1.1'deki Sentry açıklaması geçersiz |
| Resend → kendi SMTP | aynı | TASK-MUMLF57HOYFSB (in_progress, be-fb) | Başlık, E4 SavedSearch satırı, FB-GAP-1, §21 notu | §5 md.3 "çıkanlar" |
| Inngest → kendi iş kuyruğu | aynı | TASK-MUMLFDTNQ53VJ (todo, devop-fb; önce ADR + spike) | Başlık, FB-GAP-1, Açık karar #3 → KARAR | §5 md.3 "çıkanlar" |
| Microsoft (Entra) girişi kaldırıldı | aynı | TASK-MUMLFLB2OPLY3 (in_progress, fe-fb; ADR-0006 güncellemesi de orada) | Başlık, E1, Pilot kapısı (c), Açık karar #21 | §2.0 giriş satırı + kanıt, §5 md.3 "çıkanlar" |
| Embedding OpenAI ile kalıyor | aynı | — | Başlık, E4, Açık karar #4 → KAPANDI | §5 md.3 "kalanlar" |

Hukuk paketi ayrıca:
- Başlık **Sürüm 1.2** oldu. Kanıt satırı notu güncellendi.
- §5 madde 3 "kalanlar / çıkanlar" diye yeniden yazıldı. Hukukçuya bir ek soru eklendi: kendi SMTP ve iş kuyruğumuzun barındırma sağlayıcısı (ülkesi belli değil) ayrıca alıcı/işleyen olarak yazılmalı mı?
- §8'e madde 6 eklendi: envanter (`processing-register.md` §1, §17, §18, §19a, §21) kararların gerisinde. Kod kartları `done` olunca güncellenmeli.
- Kanıt satırlarındaki kod yolları `84d11af4..e46d9798` arasında tarandı. Yalnız `oauth-registration.ts` kaymıştı (228→236, 231→239); düzeltildi.

## 2. Kanıt

Kanıt satırı taraması (hukuk paketindeki bütün `src/...` yolları):
```
$ git diff --stat 84d11af4 HEAD -- <paketteki bütün kanıt yolları> messages/tr.json
 messages/tr.json                             |  7 ++++-   (yalnız settings.modules + applicationPartA; paketin andığı Auth.* anahtarları değişmedi)
 src/lib/agency/registration-invite-cookie.ts | 42 +++++  (paket bu dosyayı anmıyor)
 src/lib/auth.ts                              |  9 ++++++  (ekleme 170. satırdan sonra; paketin andığı 126-135 aynı)
 src/lib/oauth-registration.ts                | 12 ++++++-- → satır kayması
 src/lib/observability/sentry.ts              | 46 +++++  (paketteki Sentry kanıt satırı 1.2'de kaldırıldı)
$ grep -n "Organization\`\|orgType: 'SME'" src/lib/oauth-registration.ts
236:      name: `${input.userName || 'My'} Organization`,
239:      orgType: 'SME',
```

Microsoft sağlayıcısı bugün kodda, anahtara bağlı ve kapalı (paketteki cümlenin kaynağı):
```
src/lib/auth.ts:3    import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
src/lib/auth.ts:316  ...(configuredOAuthProviders().microsoft ? [
src/lib/auth.ts:317    MicrosoftEntraID({
AuthCard.tsx:158     const showMicrosoft = oauthProviders.microsoft;
.env içinde AUTH_MICROSOFT_ENTRA_ID_ID dolu satır sayısı: 0
```

Resend / Sentry / Inngest kodu `e46d9798`'de hâlâ duruyor ("sürüyor" dilinin gerekçesi): `src/lib/email/resend-mailer.ts`, `src/lib/observability/sentry.ts`, `src/lib/inngest/`. `withTenant` `src/lib/db.ts`'de var (ROADMAP #16 satırı).

Biçim kontrolü: her iki dosyanın HEAD hâli prettier-temizdi. Düzenlemeden sonra `prettier --write` koşuldu:
```
$ npx --no-install prettier --check docs/ROADMAP.md docs/legal/HUKUK-SORULARI-2026-09.md
All matched files use Prettier code style!
```

Board durumları 29.09 gece `list_tasks` çıktısından alındı (yukarıdaki tablo).

## 3. Değişen dosyalar

- `docs/ROADMAP.md`
- `docs/legal/HUKUK-SORULARI-2026-09.md`
- `docs/agent-results/TASK-MUMLFVDX85O4M-cs-fb.md` (bu dosya)

Dokunulmadı: ADR-0006 (TASK-MUMLFLB2OPLY3'ün işi), kod dosyaları, `processing-register.md`. Çalışma ağacındaki başka ajanların commit'siz değişiklikleri (`.env.example`, `package.json`, `pnpm-lock.yaml`, `src/lib/env.ts`, `src/lib/observability/system-alert.ts`) commit'e alınmadı.

## 4. Riskler

- **Envanter ve SECURITY_COMPLIANCE bugünkü kodu anlatıyor**, kararları değil. Hukukçu paketle envanteri yan yana okursa Microsoft/Resend/Sentry iki belgede farklı görünür. Paket §5'te bunu açıkça söylüyor ("kod değişince güncellenecek").
- ROADMAP FB-KAMU-2 başlığındaki kart sayısı (61) güncellenmedi. Bu karta ve TASK-MUMLFLB2OPLY3'e göre sayı arttı, ama bütün sprintin sayımını yeniden yapmadım.
- Barındırma sağlayıcısı (SMTP + iş kuyruğu) belli olmadan "dış hizmet yok" demek erken. Pakette açık soru olarak duruyor.

## 5. Açık sorular

1. Kart tanımında bu raporda olmayan bir madde var mı? (Tanım okunamadı.)
2. `processing-register.md` ve `docs/SECURITY_COMPLIANCE.md` güncellemesi için ayrı kart açılsın mı, yoksa her kaldırma kartı kendi envanter satırını mı güncellesin?
3. M9 takvim entegrasyonundaki Outlook (Microsoft) OAuth da kaldırılıyor mu? Karar yalnız girişten söz ediyor; ROADMAP Açık karar #12'de Outlook duruyor, dokunmadım.

## 6. Sonraki adım

- Dört kaldırma kartı `done` olunca: envanter §1/§17/§18/§19a/§21 ve paket §5'teki "sürüyor" ifadeleri "kaldırıldı + commit" diye güncellenir.
- TASK-MUMLFDTNQ53VJ ADR'si çıkınca Açık karar #3'e araç seçimi yazılır.
- İnceleme: crw-fb.

**Platform beyanı:** Yalnız belge değişikliği; macOS'ta (Darwin 27) `git`, `grep` ve `prettier` ile doğrulandı. Platforma bağlı kod yolu yok. Windows ve Linux'ta koşulmadı, çünkü değişen dosyaların hepsi Markdown ve davranış değiştirmiyor.
