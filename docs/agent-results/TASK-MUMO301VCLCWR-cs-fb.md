# TASK-MUMO301VCLCWR — cs-fb: Resend kalıntıları belgelerden temizlendi (İNCELEME-21 K-4)

**Sprint:** FB-GAP-1 · **Dal:** dev · **Tarih:** 29.09.2026 · **Platform:** yalnız belge (macOS'ta düzenlendi ve grep ile doğrulandı; kod yolu yok, Windows/Linux'ta farklı davranacak bir şey yok)

## 1. Ne yapıldı

Resend `fe9fd31c` ile koddan çıktı; e-posta `SMTP_*` env + nodemailer (`src/lib/email/mailer.ts`) ile gidiyor. Belgelerdeki Resend / `RESEND_API_KEY` satırları güncel duruma çevrildi. SMTP sağlayıcısı her yerde "kurumsal e-posta hesabı, patron belirleyecek" diye yazıldı. Tarihli karar satırları silinmedi; altlarına/yanlarına "güncel 29.09" notu eklendi.

| Belge | Değişiklik |
| --- | --- |
| `README.md` (53-57) | "e-posta yalnız Resend API'siyle, `RESEND_API_KEY` boşsa gönderilmez" → kendi SMTP, `SMTP_*`, yerelde Mailpit `localhost:1025`, `SMTP_HOST` boşsa gönderim yok + üretimde `SystemAlert`. |
| `docs/INNGEST.md` | env bloğu `RESEND_API_KEY` → `SMTP_HOST`/`SMTP_PORT`; alerts-daily ve feedback digest "via Resend" → SMTP; digest teslim paragrafı (`SMTP_HOST` yoksa üretimde `failed` + `SystemAlert`, değilse `skipped` — `digest-run.ts:131-142`); "Common issues" satırı. |
| `docs/ARCHITECTURE.md` | Diyagram "Resend (e-posta)" → "SMTP (e-posta, kendi)"; uyarı akışı satırı. |
| `docs/ROADMAP.md` | Başa "Güncel 29.09 — Resend kodda kaldırıldı" notu; E1 SavedSearch karar satırının altına "güncel 29.09 — kodda kaldırıldı"; §21 paragrafına envanter güncellendi notu. Eski karar satırları duruyor. |
| `docs/SECURITY_COMPLIANCE.md` | Alt işleyici listesinde ~~Resend~~ + güncel not (sağlayıcı belli olunca listeye yazılır); §3.2 silme akışı madde 3. |
| `docs/legal/processing-register.md` | §17, §18 alıcı satırı: kendi SMTP, sağlayıcı patron belirleyecek (açık), "29.09'a kadar Resend" izi; §18 kaynak yoluna `mailer.ts`; ajans satırındaki "§21 Resend satırı" → "e-posta sağlayıcısı satırı"; §21: ~~Resend~~ "alıcı değil" + yeni "SMTP sağlayıcısı — açık" satırı. |
| `docs/legal/HUKUK-SORULARI-2026-09.md` | **Sürüm 1.3 → 1.4**, başlık + değişiklik notu; §5 madde 3 Resend maddesi ve kanıt satırı; §8 madde 6 Resend kısmı kapandı. **Sorular değişmedi.** |
| `docs/legal/agency-channel-notice-addendum.md` | HUKUK-6 satırı: sağlayıcı artık kendi SMTP, ülke belli değil. |
| `docs/kamu/VERI-YERLESIMI.md` | E-posta satırı + "görüşmeden önce kapanması gerekenler" madde 3 (Resend bölgesi → SMTP sağlayıcısı/ülke). |
| `docs/kamu/ILKADIM-PILOT.md` | R3 riskinde Resend'in kaldırıldığı notu. |
| `docs/MALI_MUSAVIR_SORULARI.md` | KDV-2 sorusunun altına güncel not (Microsoft, Resend çıktı). |

**Kapsam notu:** Görev 4 dosya adı verdi ama "tüm kalıntıları bul" dedi; grep 7 dosya daha gösterdi. Envanter kuralı "kod düşmeden değiştirme" idi — kod `fe9fd31c` ile düştüğü için envanter ve hukuk paketi de güncellendi (önceki Microsoft kartındaki TASK-MUMNAUBUDL5E7 yöntemiyle aynı).

## 2. Kanıt

```
$ /usr/bin/grep -rniE "resend|RESEND_API_KEY" src scripts package.json .env.example
  → yalnız yorumlar ("no Resend" mailer.ts:6, digest.ts:4, saved-search-filters.ts:8, saved-searches/route.ts:20)
    ve scripts/esr-calibration.ts'deki ilgisiz --resend bayrağı. Import/env yok.
$ /usr/bin/grep -n "SMTP_" .env.example → 104-117 (SMTP_HOST, PORT, SECURE, USER, PASS, FROM)
$ mailer.ts:63-64 smtpConfigFromEnv: SMTP_HOST yoksa null; :149 MAIL_ALERT_SOURCE='mail'; :160 yalnız production'da SystemAlert
$ çağıranlar: request-deletion.ts:7,205 · alerts-daily.ts:5,143 · invitations/route.ts · admin/settings
$ git log --oneline --grep=MUMLF57HOYFSB → fe9fd31c feat(email)…, c6ebd7aa (rapor)
Pano: TASK-MUMLF57HOYFSB review; TASK-MUMO2XIQEHGUD (İNCELEME-21 SMTP düzeltmeleri) in_progress.
```

Kalan-grep (`/usr/bin/grep -rni resend README.md docs --exclude-dir=agent-results`, "29.09 / fe9fd31c / kaldır / ~~" içermeyenler):

```
MALI_MUSAVIR_SORULARI.md:70   → aynı paragrafın sonuna güncel not eklendi
ROADMAP.md:54                  → yeni not (paket/anahtar silindi diyor)
ROADMAP.md:115, :369           → tarihli kayıt; altında/aynı paragrafta güncel not
privacy-notice-gap-analysis.md:102/172/254/398 → sürüm 1.0, 10.09 tarihli ÖLÇÜM; bilerek değiştirilmedi (TASK-MUMNAUBUDL5E7'de de aynı)
ADR-0008:11                    → karar gerekçesi ("Resend üründen çıkıyor"), doğru
```

## 3. Değişen dosyalar

`README.md`, `docs/INNGEST.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/SECURITY_COMPLIANCE.md`, `docs/legal/processing-register.md`, `docs/legal/HUKUK-SORULARI-2026-09.md`, `docs/legal/agency-channel-notice-addendum.md`, `docs/kamu/VERI-YERLESIMI.md`, `docs/kamu/ILKADIM-PILOT.md`, `docs/MALI_MUSAVIR_SORULARI.md`, bu rapor. Kod dosyasına dokunulmadı; çalışma ağacındaki başkasına ait `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts` ve `FON_BRIDGE.md` commit'e girmedi.

## 4. Riskler

- TASK-MUMLF57HOYFSB henüz `review`. İncelemede geri alınırsa "kodda kaldırıldı" satırları geri çevrilmeli (düşük olasılık).
- SMTP sağlayıcısı belli değil. Yabancı bir sağlayıcı (ör. Google Workspace) seçilirse envanter §17/§18/§21'de yurt dışı aktarım yine doğar; satırlar "açık" diye işaretli.
- Markdown tablolarında bazı satırlar sütun hizasını bozuyor (görüntüyü etkilemez; repoda prettier betiği yok).

## 5. Açık sorular

- Patron: canlı SMTP sağlayıcısı hangi kurumsal e-posta hesabı, hangi ülke? Cevap gelince envanter §17, §18, §21, SECURITY_COMPLIANCE alt işleyici listesi ve VERI-YERLESIMI e-posta satırı doldurulmalı.

## 6. Sonraki adım

- Sağlayıcı kararı sonrası yukarıdaki satırların doldurulması (küçük belge kartı).
- Sentry satırları (`89eab729`) için benzer tarama: envanter §19a, hukuk paketi §5 kanıt satırı.

**Platform beyanı:** yalnız belge değişikliği; macOS'ta düzenlendi ve grep ile doğrulandı. Çalışan kod yolu yok; Windows/Linux'ta farklı davranacak bir şey yok.
