# TASK-MUN23L19681HC — cs-fb — Envanter §2 davet e-postası alıcısı (İNCELEME-26 Y-1)

Sprint FB-KAMU-2 · dal `dev` · belge commit'i `631c7d4c` · kanıt satırları `3bc74a7b`'ye göre (bu satırlara dokunan kod o tarihten sonra değişmedi, aşağıda).

## 1. Ne yapıldı
- **Envanter §2** (`docs/legal/processing-register.md`):
  - Alıcı satırındaki "Yok — yalnızca iç veritabanı" düzeltildi. Yerine: kendi SMTP sunucumuz (`fe9fd31c`'den beri). Sağlayıcı kurumsal e-posta hesabıdır, patron belirleyecek, ülkesi açık. Giden veri: davetlinin adresi, kurum adı, token'lı ve 7 gün geçerli bağlantı.
  - Veri kategorilerine şunlar eklendi: e-posta içeriği ve `AuditEvent` gönderim kaydı. Bu kayıtta davet edenin `actorId`'si ve hedef olarak davet id'si var, **adres yok** (crw-fb Ö-4).
  - Teknik tedbir satırına davet e-postası sınırı eklendi (`1c6b3e70`): aynı davete 10 dakikada bir, kiracı başına kayan 24 saatte en çok 50 e-posta. Sayım adres içermeyen `AuditEvent` satırlarıyla yapılır. Uygulama adresi yoksa ya da üretimde loopback ise e-posta hiç gitmez. Konu satırındaki kurum adı 80 karakterde kesilir ve HTML'de kaçışlanır.
  - Kaynak dosya satırına üç kod dosyası eklendi ve "satırlar `3bc74a7b`'ye göre" diye işaretlendi (crw-fb K-1).
- **§21:** SMTP satırının atfı "(§17, §18)" iken "(§2 davet e-postası, §17, §18)" oldu.
- **§22 md.14 (yeni) — doğrulama sırasında bulundu:** e-postadaki `/tr/accept-invite` sayfası kodda yok (kanıt §2). Envanterdeki "tek kullanımlık bağlantı" ifadesi bu yüzden yazılmadı, "token'lı" yazıldı. Ürün hatası olarak **TASK-MUN2793A57Z9I** kartı açıldı.
- **Kapsam genişletme, gerekçeli:** Inngest bu belgenin son commit'inden sonra `5ed2261a` ile koddan çıktı. Paketin kendi ölçütüne göre (§8 md.6, "kod düştükten sonra 'sürüyor' yazmak da yanlıştır") 1.6 sürümü "Inngest hâlâ duruyor" diyemezdi. Yapılan düzeltmeler:
  - HUKUK §5 md.3 ve §8 md.6'daki Inngest cümleleri.
  - Envanterdeki 5 `src/lib/inngest/jobs/…` yolu `src/lib/jobs/tasks/…` oldu (`fbf23850`). §8'deki eski "satır ~50" yerine `:121-123` yazıldı.
  - `docs/kamu/VERI-YERLESIMI.md` md.5 "Inngest Cloud" üstü çizildi.
- **HUKUK-SORULARI 1.6:** başlığa sürüm ve kart kodu eklendi. Değişiklik notunda (a)–(d) maddeleri var. §5 md.3'te Resend/SMTP maddesine davet e-postası eklendi. Kanıt satırına 1.6 eklendi. §8 md.6'ya "davet e-postası 1.4'te işlenmeliydi, 1.6'da işlendi" notu eklendi. Soruların hiçbiri değişmedi.

## 2. Kanıt
```
$ git merge-base --is-ancestor fe9fd31c HEAD && echo fe9-in-dev   → fe9-in-dev
$ git merge-base --is-ancestor 1c6b3e70 HEAD && echo 1c6-in-dev   → 1c6-in-dev
fe9fd31c 2026-09-29 14:38 feat(email): send mail over our own SMTP (nodemailer) instead of Resend
1c6b3e70 2026-09-29 15:50 fix(invitations): throttle invitation mail — 10 min per address, 50/day per tenant, no localhost link, 80-char subject name
```
Kod satırları (`3bc74a7b`, çalışma ağacı = HEAD: `git diff --quiet HEAD -- src/app/api/invitations src/lib/email` → temiz):
- `invitation-mail-policy.ts:30`: `INVITATION_MAIL_COOLDOWN_MS = 10 * 60 * 1000`. `:39`: `INVITATION_MAIL_DAILY_LIMIT = 50`. `:81-88`: 24 saatlik sayım. `:51-54`: advisory kilit. `:101-117`: base URL ve loopback kontrolü.
- `route.ts:128-132`: `auditEvent.create({ data: { tenantId, actorId: userId, type: INVITATION_MAIL_SENT, target: invitation.id } })`, yorumu "never the address". `:269`: `INVITATION_MAIL_FAILED` satırı, bunda `actorId` de yok. `:254`: `mailer(renderInvitationEmail(...))`. `:72`: 7 günlük `expires`. `:163`: `acceptPath = /tr/accept-invite?token=…`.
- `invitation-email.ts:6`: `SUBJECT_ORG_MAX = 80`. `:23-33`: satır sonu temizliği, kesme ve `escapeHtml`. İçerik: `org`, `inviteLink`, `until`, `to`.
- Inngest: `git grep -il inngest HEAD -- src package.json .env.example` → boş (rc=1). `src/lib/jobs/tasks/users-scheduled-deletion.ts:121-123`: `aiUsageLog.updateMany … userId: null`.
- `src/lib/env.ts:43-45`: `JOBS_DATABASE_URL` verilmezse DATABASE_URL kullanılır (VERI-YERLESIMI md.5 cümlesinin dayanağı).
- **Kabul sayfası yok:** `git ls-files src | grep -i accept` → boş. `git log --all -S "accept-invite" -- src` yalnız c915bc43, fe9fd31c ve 1c6b3e70'i gösteriyor; üçü de bağlantıyı üreten taraf. `tokenHash` ile arama yapan bir okuyucu da yok.
- Commit sonrası kontrol: `git diff --stat 3bc74a7b HEAD -- src/app/api/invitations src/lib/email src/lib/jobs src/lib/env.ts` → boş. Aradaki `c9133933` yalnız bir m9 testi.
```
$ git show --name-only --oneline 631c7d4c
631c7d4c docs(legal,kamu): İNCELEME-26 Y-1 — envanter §2 davet e-postası alıcısı … hukuk paketi 1.6 (TASK-MUN23L19681HC)
docs/kamu/VERI-YERLESIMI.md
docs/legal/HUKUK-SORULARI-2026-09.md
docs/legal/processing-register.md
```

## 3. Değişen dosyalar
- `docs/legal/processing-register.md` (§2, §8/§15/§17/§18 iş yolları, §21, §22 md.14)
- `docs/legal/HUKUK-SORULARI-2026-09.md` (sürüm 1.6)
- `docs/kamu/VERI-YERLESIMI.md` (md.5 Inngest)
- bu rapor

Kod dosyalarına dokunulmadı. Başkalarının commit'lenmemiş dosyaları (`FON_BRIDGE.md` ve m9 testi) commit'e girmedi.

## 4. Riskler
- **Davet akışı uçtan uca çalışmıyor** (TASK-MUN2793A57Z9I). Pilot kurum ekip üyesi davet ederse davetli bağlantıdan giremez. Envanter bunu §22 md.14'te açık boşluk olarak yazıyor. Kabul yolu yazılınca §2 yeniden güncellenmeli.
- Envanterin başlığı hâlâ "Versiyon 1.0 — 2026-09-08". Önceki kartlar da bu satırı güncellemedi, sürüm HUKUK paketinde izleniyor. Bu kartta ben de değiştirmedim.

## 5. Açık sorular
- Kabul yolu mu yazılsın, yoksa davetli Google girişinde e-postasıyla mı eşleşsin? Bu, yeni kartta lider ya da patron kararı. crw-fb Ö-1 (`recently_sent` durumunda token yenileniyor) aynı kararla birlikte ele alınabilir.
- Yeni kart `create_task` varsayılanıyla "agentdesk" projesine düştü. Lider isterse FB projesine taşıyabilir.

## 6. Sonraki adım
- İnceleme: crw-fb 1.6'yı koddan doğrulasın. Sonra paket hukukçuya gidebilir.
- TASK-MUN2793A57Z9I kodu `dev`'e düşünce envanter §2 ve §22 md.14 güncellenir (paket 1.7).

**Platform beyanı:** yalnız belge. mac (Darwin) üzerinde git ve grep ile doğrulandı. Kod yolu değişmediği için platforma bağlı bir davranış yok. Windows ve Linux'ta koşulacak bir şey yok.
