---
name: fabrika-dev-server-stale-prisma-client
description: Fabrika'da uzun süredir ayakta olan dev sunucusu şema değişikliğinden sonra BAYAT Prisma istemcisi taşır — özellik sessizce çalışmaz, "Unknown field" hatası yutulur; sunucuyu öldürmeden ayırt etme yöntemi
metadata:
  type: project
  updatedAt: 2026-09-07
---

`prisma db push` (ya da `migrate deploy`) dev sunucusu **ayaktayken** koşulursa, Next.js
süreci bellekte eski Prisma istemcisini tutmaya devam eder. Şema ve veritabanı yeni alanları
bilir, **çalışan uygulama bilmez**. Sonuç: özellik uçtan uca çalışmaz ama kod, typecheck,
birim testler ve taze süreçler hepsi yeşildir.

2026-09-07'de M9 (Meeting Briefs) tam olarak buna takıldı: `MeetingBrief.partnerName`,
`meetingScheduledAt`, `meetingScheduledTz` şemada ve DB'de vardı; ayaktaki sunucu
`Unknown field \`partnerName\` for select statement on model \`MeetingBrief\`` veriyordu.
Brief oluşturma `{"success":false,"error":"BRIEF_NOT_PERSISTED"}` dönüyor, istemci bunu
yuttuğu için kullanıcı **hiçbir şey** görmüyordu. (Rapor:
`docs/agent-results/TASK-MTQU053U24RYH-customer-support.md` §P0-1.)

**Why:** Bu hata sınıfı hem statik kontrollerden hem de `npx tsx` ile yapılan doğrulamadan
kaçar — taze süreç diskteki güncel istemciyi yükler, ayaktaki sunucu yüklemez. "Kod doğru"
ile "ürün çalışıyor" burada ayrışır; yalnız gerçek tarayıcı + ayaktaki sunucu yakalar.

**How to apply:**

1. Şema değiştiren bir işten sonra `pnpm prisma generate` koş **ve dev sunucusunu yeniden
   başlat**. Yeniden başlatmadan "çalışıyor" deme.
2. Bir özellik "hiçbir şey olmuyor" diye başarısızsa, sunucuyu öldürmeden ayırt et
   (başkasının pane'ini düşürmemek için — bkz. [[agent-exit-129-sighup]],
   [[fabrika-worker-panes-die-uncommitted]]):
   - Ham `pg` ile tabloya bir **probe satırı** yaz;
   - Sayfayı gerçek oturumla aç → satır görünmüyorsa ayaktaki istemci bayattır;
   - Aynı yazma/okumayı `npx tsx` ile taze bir süreçte yap → çalışıyorsa kod doğru,
     sorun süreçtedir.
3. Ayaktaki sunucunun kendi hatası `.next/dev/logs/next-development.log` içindedir, ama
   **log akmayı durdurmuş olabilir**; son satırın zaman damgasına bak, sessizliği "hata yok"
   sanma.

İlgili: [[fabrika-migrations-are-not-prisma-migrate]] · [[fabrika-runtime-verification-recipe]] ·
[[fabrika-prisma7-driver-adapter]]
