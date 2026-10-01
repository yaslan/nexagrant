---
sözleşme: 3
görev: TASK-MUOEJVUECL28A
kod: TASK-MUOEJVUECL28A
ajan: crw-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: ONAY (dal ucu rev. 4, b6799e7b) — İNCELEME-114'ün R2-Y1..Y3 ve R2-Ö1..Ö5 maddeleri ile Karar-1 C ve Karar-2 A uyumu belgede karara bağlanmış, kod çapaları dev'de doğrulandı. Rev. 3 tek başına R2-Y2 ve R2-Y3'ü kapatmıyordu; rev. 4 kapattı (İNCELEME-120 → 122). Bloke eden bulgu yok; dev'e alınmadı.
platform: mac (Darwin 27.0). Yalnız belge okuması ve dev'deki kod çapalarının kontrolü. Caddy/WebKit/Postgres ölçümleri yeniden koşulmadı: Docker'da veri yok (TASK-MUPL268JAAWHD) ve aynı ölçümler İNCELEME-120 ile İNCELEME-122'de Linux konteyneri ve macOS ikilisiyle iki kez yapıldı. Linux/Windows koşulmadı.
sürüm: 1
tarih: 2026-10-01T15:03:29.331Z
---

# FB REVIEW — KAMU B5 tasarım rev. 3 → İNCELEME-114 kapanışı (güncel dal ucu rev. 4)

**İncelenen:** `docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md`. Rev. 3 `1c88821b` (rapor `dc1c1baf`, fe-fb-2), rev. 4 `fc1217c7` (dal `fe-fb/b5-design-rev3` ucu `b6799e7b`, fe-fb-3). Ölçüt: İNCELEME-114 (se-fb, `95c5cbf3`).

## 0. Bağlam: kart bu turdan önce ilerlemiş
Bu tur "rev. 3"ü istiyordu, ama zincir çoktan ilerlemiş:
- **rev. 3** → **İNCELEME-120** (crw2-fb, `TASK-MUOK1S09J2W3C-crw2-fb.md`): DEĞİŞİKLİK GEREKLİ. Bulgular:
  - Y-1: eşitleyici `adapt`'ı eski dosyada koşuyordu, yani askıya alma Caddy'ye ulaşmıyordu.
  - Y-2: `no-referrer` → `Origin: null`, C yolu adım 2 kırılıyordu.
- **rev. 4** → **İNCELEME-122** (crw2-fb, `TASK-MUOEJVUECL28A-crw2-fb-inceleme122.md`): **ONAY**, açıkta Ö-6 kaldı.

Sonuç: **rev. 3, İNCELEME-114'ün R2-Y2 (eşitleyici güven sınırı) ve R2-Y3/R2-Ö4 (C yolu nonce + Origin) maddelerini kâğıt üstünde kapatıyordu, ama ölçünce çalışmıyordu.** Bu yüzden hükmü dal ucu olan rev. 4 için veriyorum. Kart statüsü bu sırayı yansıtmalı.

## 1. İNCELEME-114 maddeleri: rev. 4'teki yeri ve benim kontrolüm
| Madde | Belgedeki yeri (rev. 4) | Benim bağımsız kontrolüm | Hüküm |
|---|---|---|---|
| R2-Y1 `AUTH_URL`/`useSecureCookies` | §0-2, §3.2-1 (`AUTH_URL`/`NEXTAUTH_URL` üretimde yok, `useSecureCookies: NODE_ENV==='production'`, açılış kontrolü), §2.3 test satırı | `docker-compose.yml:39` gerçekten `NEXTAUTH_URL=http://localhost:${FABRIKA_WEB_PORT:-3000}` sabitliyor. `@auth/core@0.41.3/lib/utils/env.js:68` `envObject.AUTH_URL ?? envObject.NEXTAUTH_URL`. `src/lib/auth.ts`'te bugün `useSecureCookies` yok. Belgenin çıkış noktası doğru | KAPANDI (tasarım) |
| R2-Y2 Caddy askıya alma: yazım yetkisi + enjeksiyon | §2.1, §4.1, §4.3 (`fb-edge-sync` çekme modeli, web yalnız DB'ye yazar, admin soketi `0200`, 3 katman hostname, `adapt` değişmez denetimi, `env -u` + çalışan yapılandırma denetimi) | rev. 3'teki eski-dosya hatası İNCELEME-120'de ölçüldü, rev. 4 düzeltmesi İNCELEME-122'de 11 senaryoyla ölçüldü. `cobrand-store.ts:113-116` çapası doğru | KAPANDI (rev. 4) |
| R2-Y3 C yolu SameSite nonce | §3.3 iki adımlı iniş (`/api/auth/handoff` → aynı köken `/complete`), `SameSite=Lax` gerekçeli, `None` reddi | Mantık doğru: Lax çerez yalnız üst düzey GET'te siteler arası gider. Origin dalı rev. 4'te `strict-origin` + `Origin: null` = ret oldu | KAPANDI (rev. 4) |
| R2-Ö1 jwt sırası | §3.2-3, 3 test | belge | KAPANDI |
| R2-Ö2 `[locale]` + uzantılı yol | §2.2 | `src/proxy.ts:83` matcher uzantıyı gerçekten hariç tutuyor. Oturumsuz eylemler var: `fon-hazirlik/actions.ts:11` `submitReadinessLead`, `lib/actions/auth.ts:27,116,182` | KAPANDI |
| R2-Ö3 tek okuma noktası bekçisi | §3.2-5 | belge | KAPANDI |
| R2-Ö4 C aracı Origin | §3.3 adım 2 (üç dal) | İNCELEME-122: Chromium 151 + WebKit 26.6, HTTPS, üç kayıtlı alan | KAPANDI (rev. 4) |
| R2-Ö5 önbellek geçersizleştirme | §2.2 (tek örnek süreç içi + TTL 30 sn; `LISTEN` eşitleyicide) | belge | KAPANDI |
| Karar-1 C (HSTS yalnız Caddy) | §5 | dev'de uygulama başlığı kaldırılmış (`5c8361b6` "move HSTS header from app to Caddy"); `src/` ve `next.config`'te `Strict-Transport-Security` yok | UYUMLU |
| Karar-2 A (yalnız alt alan) | §0-4, §4.3-1 (`getDomain … d===null‖d===h` → ret) | belge | UYUMLU |

## 2. Bulgular
B ya da Y yok.

- **Ö-1: Dev'e alınmadı.** `fc1217c7` ve `b6799e7b` dev'in atası değil. Dev'de hâlâ rev. 2 var (`df56877b`). `git merge-tree --write-tree dev b6799e7b` → çakışma yok.
- **Ö-2: İNCELEME-122 Ö-6 açık.** Belgedeki GRANT bloğu depodaki boru hattında yazıldığı gibi çalışmıyor. Merge'den önce tek paragraflık bir belge düzeltmesi yapılmalı.
- **Ö-3: Rapor dağınıklığı.** İNCELEME-120 ve 122 raporları ile fe-fb-3 raporu `/Users/macbook/alan/docs/agent-results/` altında. fe-fb-3 dalda var, crw2-fb'nin iki raporu FONBRIDGE'de yok. Entegrasyonda toplanmalı.

## 3. Değişen dosyalar
Yalnız bu rapor.

## 4. Sonraki adım
1. fe-fb Ö-6 paragrafını düzeltir.
2. Entegrasyon `fe-fb/b5-design-rev3`'ü dev'e alır ve İNCELEME-120/122 raporlarını repoya kopyalar.
3. Uygulama kartları rev. 4'e göre açılır (efor B ≈25-36).
