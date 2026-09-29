# TASK-MUMNAUBUDL5E7 — cs-fb: Outlook ve SSO kaldırma kararları belgelere işlendi

**Sprint:** FB-KAMU-2 · **Dal:** dev · **Tarih:** 29.09.2026 · **Platform:** yalnız belge (macOS'ta düzenlendi; kod yolu yok, platform farkı yok)

## 1. Ne yapıldı

Patronun 29.09 kararları belgelere işlendi: (1) M9 takvimde Outlook kaldırıldı, yalnız Google Takvim + `.ics`. (2) Kurumsal SSO / SAML tamamen kaldırıldı (ayar yalnız `Tenant.settings.sso`'ya yazılıyordu, girişte okunmuyordu).

**Önemli dil değişikliği:** Görev "uygulama <kart>'ta sürüyor" dilini istiyordu. Belgeyi yazarken iki kaldırmanın kodu dev'e düştü:
- Outlook: `15313bc6` (15:02), `4dc067ef` (15:04). Kart TASK-MUMMIHYY2F4KB panoda hâlâ `in_progress`.
- SSO: `0fdbcb8d` (15:24, ben belgeyi yazarken düştü). Kart TASK-MUML0QZAZ5M80 panoda hâlâ `in_progress`.

Bu yüzden "sürüyor" yerine **"kodda kaldırıldı (`<commit>`); kart inceleme bekliyor"** yazdım. Kod varken "sürüyor" demek belgeyi yanlış yapardı.

Aynı grep (`microsoft`) Microsoft girişi satırlarının da bayat olduğunu gösterdi: `acc35b07` (TASK-MUMLFLB2OPLY3, `review`) sağlayıcıyı zaten sildi. Hukuk paketi §2.0 hâlâ "`89eab729`'da Microsoft sağlayıcısı hâlâ duruyor" diyordu; düzelttim.

| Belge | Değişiklik |
| --- | --- |
| `docs/ROADMAP.md` | Başa "Patron kararları — 29.09 gece, ikinci tur" bloğu, (7) Outlook, (8) SSO, (5) için Microsoft kod durumu. Faz B başlığında SSO üstü çizili. M9 "Açık kalan" satırı ve takvim alt maddesi: Outlook kaldırıldı. SSO maddesi `[x]` + üstü çizili, kaldırıldı. Admin action satırında self-servis iptal. **Açık karar #12**: Outlook çıktı, `MICROSOFT_OAUTH_*` artık gerekmiyor, kalan Google anahtarı. §8.3 taramasına Microsoft girişi notu. |
| `docs/legal/HUKUK-SORULARI-2026-09.md` | **Sürüm 1.2 → 1.3**, başlık satırı + değişiklik notu (a)(b)(c). §2.0'a Outlook ve SSO maddeleri + kanıt, Microsoft kanıt satırı `acc35b07`'ye göre. §2.3 SSO alanı notu. §5 madde 3 "çıkanlar"a Outlook (Microsoft), Microsoft girişi kod durumu, kanıt satırı notu. §8 madde 6: Microsoft kısmı kapandı. **Sorular değişmedi.** |
| `docs/legal/processing-register.md` | §1 alıcı: yalnız Google, Microsoft ve SSO notu, kaynak satırı `auth.ts:2-3`. §11 başlığı ve alıcı: yalnız Google, Outlook kaldırıldı. §21 Microsoft satırı: "Alıcı değil (29.09)". |
| `docs/legal/agency-channel-notice-addendum.md` | "Google / Microsoft ile kayıtta" → "Google ile kayıtta" (2 yer) + başlıkta değişiklik izi. |
| `docs/SECURITY_COMPLIANCE.md` | §2 "SSO (SAML/OIDC) Kurumsal" üstü çizili; altına 29.09 karar maddesi (yalnız Google, Microsoft girişi, SSO, Outlook). |
| `docs/adr/ADR-0006-oauth-only-sign-in.md` | "Kapsam dışı" maddesinin altına yalnız istenen kısa not: kurumsal SSO/SAML kaldırıldı (29.09, `0fdbcb8d`). |

## 2. Kanıt

Kod durumu (her iddianın dayanağı):

```
$ git log --oneline -1 acc35b07   → feat(auth): remove Microsoft sign-in — Google is the only OAuth provider (TASK-MUMLFLB2OPLY3)
$ git show --stat 15313bc6        → src/lib/calendar/outlook.ts | 47 ------ (silindi), factory.ts, provider.ts …
$ git show --stat 0fdbcb8d        → src/lib/sso.ts 177 ---, sso.test.ts 227 ---, admin/billing/actions.ts 20 --, tests/billing-iyzico-sso.test.ts 67 --
$ git grep -nIiw "sso\|saml" 0fdbcb8d -- src          → (boş, 0 geçiş)
$ /usr/bin/grep -rn "MICROSOFT_OAUTH" src .env.example → (boş)
$ /usr/bin/grep -rniI outlook src   → yalnız "removed" yorumları + provider.test.ts'deki "outlook reddedilir" testi
```

SSO'nun girişte kullanılmadığı (`9a9aa6ef`, kaldırmadan önce):

```
$ git grep -n "resolveSsoProviderForDomain" 9a9aa6ef -- src tests
src/lib/sso.ts:133 (tanım), src/lib/sso.test.ts, tests/billing-iyzico-sso.test.ts  → auth.ts / oauth-registration.ts'de 0 çağrı
src/lib/sso.ts:15-16, :49-59 → ayar Tenant.settings.sso JSON alanına yazılıyor
```

`9a9aa6ef`'te `auth.ts`: `2: import Google`, `3: import Credentials`, `300: Google({` — Microsoft yok. `AuthCard.tsx:159` `showOAuth = oauthProviders.google`.

Pano (list_tasks, 29.09): TASK-MUMMIHYY2F4KB `in_progress`, TASK-MUML0QZAZ5M80 `in_progress`, TASK-MUMLFLB2OPLY3 `review`.

Kalan-grep (düzenlenen 6 dosya; karar/commit/kart içermeyen satırlar):

```
$ /usr/bin/grep -niI "outlook\|microsoft\|\bsso\b\|saml" <6 dosya> | grep -v "29.09\|acc35b07\|15313bc6\|TASK-MUML0QZAZ5M80\|TASK-MUMMIHYY2F4KB\|kaldır"
ROADMAP.md:77  (E0 Auth.js satırı — hemen altındaki 29.09 satırları zaten Microsoft kararını anlatıyor)
ROADMAP.md:186 (07.09 takvim ölçümü — hemen altına "karar 29.09 — Outlook kaldırıldı" eklendi)
ROADMAP.md:363 (§21 paragrafı — aynı paragrafta "karar 29.09: Microsoft … üründen çıkıyor")
privacy-notice-gap-analysis.md:102/170/398 (sürüm 1.0, 10.09 tarihli ÖLÇÜM; bilerek değiştirilmedi)
SECURITY_COMPLIANCE.md:94 (üstü çizili; altında karar)
ADR-0006:21, 27-30, 33 (tarihî ilk karar + Güncelleme 2 metni)
```

Prettier: `SECURITY_COMPLIANCE.md` ve `processing-register.md` uyarı veriyor; HEAD sürümleri de aynı uyarıyı veriyor (önceden var, bu değişiklik getirmedi). Repoda prettier betiği yok.

## 3. Değişen dosyalar

- `docs/ROADMAP.md`
- `docs/legal/HUKUK-SORULARI-2026-09.md`
- `docs/legal/processing-register.md`
- `docs/legal/agency-channel-notice-addendum.md`
- `docs/SECURITY_COMPLIANCE.md`
- `docs/adr/ADR-0006-oauth-only-sign-in.md`
- `docs/agent-results/TASK-MUMNAUBUDL5E7-cs-fb.md` (bu rapor)

Kod dosyasına dokunulmadı. Çalışma ağacındaki başkasına ait değişiklikler (ör. `FON_BRIDGE.md`) commit'e girmedi.

## 4. Riskler

- İki kaldırma kartı henüz `review`/`done` değil. İncelemede geri alınırsa (düşük olasılık) belgelerdeki "kodda kaldırıldı" satırları geri çevrilmeli.
- Envanter §1, §11, §21 Microsoft satırları kod düştüğü için güncellendi. Hukuk paketi §8 madde 6 eskiden "kart `done` olunca" diyordu; ölçütü "kod dev'e düşünce" olarak uyguladım ve maddede belirttim.
- Resend (`fe9fd31c` ile SMTP'ye geçti) ve Sentry satırları da benzer biçimde bayat olabilir (hukuk paketi §5 madde 3 kanıt satırı "Resend kodu hâlâ duruyor" diyor). Bu kartın kapsamı dışında, **dokunmadım**.

## 5. Açık sorular

- Yok (kararlar net). Hukukçu için yeni soru eklenmedi; 1.3 yalnız durum güncellemesidir.

## 6. Sonraki adım

- Kapsam dışı kalan, hâlâ Outlook/Microsoft/SSO geçen belgeler (sayılar `grep -ci`): `docs/DATA_MODEL.md` 6, `docs/API.md` 2, `docs/BETA_GUIDE.md` 2, `docs/BETA_GUIDE.en.md` 2, `docs/kamu/VERI-YERLESIMI.md` 1, `docs/MODULES.md` 1, `docs/BUSINESS_MODEL.md` 1, `docs/MALI_MUSAVIR_SORULARI.md` 1. Ayrı bir belge kartıyla taranmalı (ADR-0006:33 `VERI-YERLESIMI.md`'yi zaten cs-fb'ye bırakıyor).
- Resend/Sentry satırları için hukuk paketi ve envanter §17/§18/§19a'yı `fe9fd31c` / `89eab729`'a göre güncelleyen bir kart.
- `prisma/schema.prisma:1326` ve migration yorumunda `'outlook'` değeri geçiyor (yalnız yorum) — fe-fb kartına not.

**Platform beyanı:** yalnız belge değişikliği; macOS'ta düzenlendi ve grep ile doğrulandı. Çalışan kod yolu yok, Windows/Linux'ta farklı davranacak bir şey yok.
