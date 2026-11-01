# TASK-MUN2FJ4R24QPT — İNCELEME-28 B-1..B-6 belge düzeltmesi, hukuk paketi 1.7 (cs-fb)

Kaynak: `docs/agent-results/TASK-MUN2AKGX5HOXN-se-fb.md` §3 (631c7d4c'nin incelemesi). Kanıtlar `dev` dalı `a40b6bf4`'e göre. Güncelleme ölçütü: kodun `dev`'e düştüğü commit. Bu turda kod değişmedi, eksik ya da yanlış yazılmış olgular düzeltildi.

## 1. Ne yapıldı

| Bulgu | Düzeltme | Yer |
| --- | --- | --- |
| **B-1** (olgu hatası) | `email_sent`: davet eden `actorId` + davet id'si. `email_failed`: yalnız davet id'si, `actorId` yok. İki satır ayrı yazıldı. | envanter §2 Veri kategorileri; HUKUK 1.6 (b) düzeltildi + 1.7 (a) |
| **B-2** | §21'e "Barındırma sağlayıcısı (uygulama, `fabrika-worker`, Postgres) — Açık, patron belirleyecek; tüm tablolar" satırı eklendi. §2 ve §8/§12'deki "yalnız iç veritabanı" → "kendi veritabanımız (barındırma sağlayıcısı açık, §21)". §22 md.15 eklendi. VERİ-YERLEŞİMİ md.5'e "worker aynı barındırmada koşar" eklendi. | envanter §2, §8, §12, §21, §22; VERI-YERLESIMI md.5; HUKUK 1.7 (b) |
| **B-3** | "Kendi SMTP sunucumuz" ifadesi envanterden ve VERİ-YERLEŞİMİ'nden kalktı. Tek ifade kullanılıyor: "kurumsal e-posta hesabının SMTP sunucusu (sağlayıcı ve ülke açık — patron karar verecek)". §21 SMTP satırında iki seçenek "karar bekliyor" olarak yazıldı: (a) üçüncü taraf kurumsal e-posta hesabı → ayrı veri işleyen, yurt dışı aktarım olabilir; (b) kendi sunucumuz → barındırma sağlayıcısında işlenir. HUKUK §5 md.3'teki ek görüş sorusu iki seçenekle yeniden yazıldı; **bu soru değişti** (1.7 notunda yazılı). §22 md.17 eklendi. | envanter §2, §17, §18, §21, §22; VERI-YERLESIMI tablo + md.3; HUKUK §5 md.3, 1.7 (c) |
| **B-4** | §2 tedbir satırına taşıma koşulu eklendi: TLS yalnız kimlik bilgisi varken zorunlu (`requireTLS`, `mailer.ts:89`). Kimlik doğrulamasız relay üretimde kullanılmaz (`.env.example:107-111`). Bu bir işletim kuralıdır, kod kilidi değildir. §2 alıcı satırına şu eklendi: token bir giriş kimlik bilgisidir ve token'lı bağlantı üçüncü taraftan geçer. | envanter §2; HUKUK 1.7 (f) |
| **B-5** | Belgeye gerçek durum yazıldı: `Invitation` satırları **süresiz** kalıyor. Temizlik işi yok, yeniden davet satırı yalnız günceller. `AuditEvent` gönderim satırları §13'e tabi. Ayrı kart açıldı: **TASK-MUN2J9LLXNREG** (backlog, FB-KAMU-2, cekirdek). §22 md.16 eklendi. HUKUK §5 md.6'ya altıncı saklama kalemi eklendi. | envanter §2, §22; HUKUK §5 md.6, 1.7 (d) |
| **B-6** | §14 alıcı satırına haftalık özet e-postası eklendi: başlık + kurum adı (+ öncelik, durum, tarih), SMTP ile iç alıcıya (`FEEDBACK_DIGEST_TO`). Başlığın kişisel veri içerebileceği _varsayım_ olarak işaretlendi. §14 kaynak satırına digest dosyaları eklendi. §21 SMTP atfına §14 eklendi. | envanter §14, §21; HUKUK 1.7 (e) |

Ek olarak `fc763927` ile kayan satır numaraları güncellendi: `route.ts:72,168,261`, `:133-137`, `:276`; `invitation-mail-policy.ts:32,41`. HUKUK 1.6'da yazılan eski numaralar 1.7 kanıt satırında eşlendi. Hukuk paketi sürüm 1.7'ye çıktı, değişiklik notu (a)–(f) eklendi, §8 md.6'ya 1.7 satırı eklendi.

B-1, B-2 ve B-3 (hukukçuya gitmeden önce şart olanlar) kapandı.

## 2. Kanıt

```
$ git rev-parse --short HEAD   → a40b6bf4 (düzenleme öncesi)
== B-1  (src/app/api/invitations/route.ts)
136:  data: { tenantId, actorId: userId, type: INVITATION_MAIL_SENT, target: invitation.id },
276:  tx.auditEvent.create({ data: { tenantId, type: INVITATION_MAIL_FAILED, target: invitationId } })
== B-2
docs/ARCHITECTURE.md:7   Next.js 15 (Vercel) ──▶ Postgres 16
docs/SECURITY_COMPLIANCE.md:103  alt işleyiciler: Vercel, Neon/Supabase, Fly.io, ...
docker-compose.yml:42 fabrika-worker: · Dockerfile:52 FROM base AS worker
== B-3  mailer.ts:5-7 "Outgoing mail over our own SMTP server ... through the organisation's mail account"
kalıntı taraması: grep -n -i "kendi SMTP\|iç veritabanı" processing-register.md VERI-YERLESIMI.md → boş
  (HUKUK:10'da yalnız tarihsel 1.4 değişiklik notunda geçiyor; 1.7 notu bunu düzeltiyor)
== B-4  mailer.ts:89  requireTLS: !config.secure && config.auth !== null,
        .env.example:107-111 "PRODUCTION: do not use a relay without SMTP_USER/SMTP_PASS ... token is a login credential — travels in plain text"
== B-5  route.ts:126  update: keepToken ? { role, expires } : { tokenHash, role, expires },  (silme yok)
        git ls-files src/app | grep -c accept → 0   (kabul yolu hâlâ yok)
== B-6  digest.ts:13 title / :17 tenantName / :100-101 escapeHtml(r.title), escapeHtml(r.tenantName)
        digest-run.ts:120 const recipient = options.to || env.FEEDBACK_DIGEST_TO;  :146 await sender({ to: recipient, subject, html });
        digest.ts:80 "report titles are attacker-controlled free text"
git diff --check → temiz
```

Değişiklikler iki Python betiğiyle yapıldı. Her değiştirme, eski metnin tam bir kez geçtiğini doğruladı. Eşleşme yoksa betik durdu. Hiçbir değiştirme körlemesine yapılmadı.

## 3. Değişen dosyalar

- `docs/legal/processing-register.md` (§2, §8, §12, §14, §17, §18, §21, §22)
- `docs/legal/HUKUK-SORULARI-2026-09.md` (sürüm 1.7, 1.6 (b) düzeltmesi, §5 md.3 ve md.6, §8 md.6)
- `docs/kamu/VERI-YERLESIMI.md` (e-posta satırı, md.3, md.5)
- `docs/agent-results/TASK-MUN2FJ4R24QPT-cs-fb.md` (bu rapor)

Kod dosyasına dokunulmadı.

## 4. Riskler

- Hukuk paketindeki e-posta ek görüş sorusu 1.7'de değişti. Hukukçuya 1.6 gittiyse 1.7 ayrıca bildirilmeli.
- Barındırma ve SMTP modeli patron kararına bağlı. Karar gelene kadar §21'de iki satır "açık" kalıyor.
- B-6'daki "başlık kişisel veri içerebilir" ifadesi varsayımdır. Gerçek geri bildirim içeriği denetlenmedi.

## 5. Açık sorular (patron)

1. Barındırma firması ve bölgesi (VERİ-YERLEŞİMİ md.1).
2. SMTP modeli: üçüncü taraf kurumsal e-posta hesabı mı, kendi kurduğumuz sunucu mu? Firma ve ülke ne?
3. Davet satırları için saklama süresi (TASK-MUN2J9LLXNREG).

## 6. Sonraki adım

- İnceleme: İNCELEME-28 kapanış kontrolü (se-fb).
- TASK-MUN2793A57Z9I (kabul sayfası) ve TASK-MUN2J9LLXNREG (temizlik) `dev`'e düşünce envanter §2 ve §22 md.14 ile md.16 güncellenecek.

**Platform beyanı:** yalnız belge. Değişiklik macOS'ta yapıldı ve grep/git ile doğrulandı. Kod yolu yok, bu yüzden platforma bağlı bir davranış da yok.
