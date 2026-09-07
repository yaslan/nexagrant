---
name: fabrika-shared-dev-db-can-be-reset-under-you
description: Paylaşılan dev veritabanı başka bir ajanın prisma migrate dev'i altında sıfırlanabilir — CLI boş DB'yi, çalışan :3000 sunucusu hâlâ eskisini görür
metadata:
  type: reference
  updatedAt: 2026-09-07
---

2026-09-07'de paylaşılan dev DB (`fabrika@localhost:5432`) **sıfırlandı**: `public` şemasında
39 kiracı tablosundan geriye yalnız `CalendarConnection`, `MeetingBrief` ve `_prisma_migrations`
kaldı, `prisma/migrations` 2 migration'a düştü. Sebep: yeni bir tablo ekleyen ajanın
`prisma migrate dev`'i, sürüklenmiş (drifted) şema karşısında sıfırlama teklif edip uygulaması.

**Belirtileri — bunları KENDİ değişikliğine yorma:**
- `pnpm rls:verify` "Şemada olup veritabanında olmayan tablo (migration bekliyor): <37 tablo>"
- `prisma migrate status` yine de **"Database schema is up to date!"** der (migration klasörü de
  yeniden yazıldığı için tutarlı görünür — yanıltıcıdır)
- CLI'dan `prisma.opportunity.findMany()` → `relation "public.Opportunity" does not exist`

**En kafa karıştırıcı kısmı:** ÇALIŞAN `pnpm dev` sunucusu etkilenmez. `:3000` hâlâ giriş
kabul eder ve gerçek veri gösterir, çünkü süreç sıfırlama öncesi `DATABASE_URL`/bağlantıyı
tutar. Yani CLI ile tarayıcı **farklı veritabanına** bakar. Sonuçları:
- Tarayıcı doğrulaması için CLI'dan fixture SEED EDEMEZSİN (yanlış DB'ye yazarsın).
- **Dev sunucusunu yeniden başlatma** — başlatınca uygulama boş DB'ye düşer ve herkesin
  e2e'si gider. (Env değiştirmek için yeniden başlatma tarifi:
  [[fabrika-env-flip-restarts-shared-dev-server]] — bu durumda geçerli değil.)

**Ne yap:** DB gerektiren e2e'yi BLOKE olarak, kanıtıyla raporla (tablo listesi + rls:verify
çıktısı); kırmızı kapıyı kendi işinden ayır ([[fabrika-red-gate-may-be-a-live-worker-wip]]);
sıfırlamayı takıma acil olarak bildir. Sessizce yeniden migrate/seed ETME — diğer ajanın
yarım işini de silersin.
