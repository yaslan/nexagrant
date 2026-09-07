---
name: fabrika-verify-what-a-gate-measures
description: Yeşil bir kapı, koruduğu şeyi ölçemiyor olabilir — kapıyı eklemeden ÖNCE script'i aç ve neye baktığını gör
metadata:
  type: feedback
updatedAt: 2026-09-07
---

2026-09-07: patron "RLS durumunu kapının parçası yap" dedi. Hazır bir komut vardı
(`pnpm rls:check`) ve yeşildi. Kapıya öylece eklemek doğru görünüyordu.

Script'i açtım: `schema.prisma` ile `rls.sql` **metnini** karşılaştırıyordu, veritabanına
hiç bakmıyordu. O gün veritabanında 38 politikadan 1'i vardı ve script kesintisiz ✅ diyordu.
Kapıya o hâliyle eklemek, tam da o gün sızan şeyi "korunuyor" diye işaretlerdi.

**Genel kural:** bir kontrolü kapıya koymadan önce ÜÇ soruyu sor —
1. Neyi ölçüyor: dosyayı mı, çalışan sistemi mi?
2. Ölçemediği durumda ne diyor — "atlandı" mı, "geçti" mi? ("Ölçülmedi" asla yeşil okunmamalı.)
3. Bozulmayı GERÇEKTEN yakalıyor mu? Kasten boz, kırmızıya döndüğünü gör, sonra onar.

Üçüncüsü pazarlık konusu değil: bu turda `MeetingBrief` politikasını kasten düşürdüm,
kapı tablo adını vererek kırmızıya döndü, `pnpm db:rls` ile geri döndü. Aynı yöntemi
pre-commit hook'unda da uygulamıştım (kasten tip hatası → bloke, temiz → geçti).
Kanıtlanmamış kapı, kapı değildir.

**İkinci vaka (2026-09-07 akşamı) — kör kapının farklı bir mekanizması: gölgeleme.**
`pnpm typecheck` aylardır yeşildi. Sebebi kodun doğru olması değildi:
`src/types/prisma-override.d.ts` bir **ambient module declaration** (`declare module
'@prisma/client'`) ve gerçek üretilmiş tipleri GÖLGELİYOR. Override kaldırılınca 144 hata /
51 dosya çıktı; içinde şemada hiç olmayan tabloya/alana/ilişkiye yapılan 15 CANLI çağrı vardı
(4'ünde try/catch bile yok: M2 konsept not üretimi her çağrıda patlıyor, alerts-daily cron'u her
sabah ölüyor). Ölçülen ikinci gerçek: `prisma generate`'i kuruluma/kapıya eklemek TEK BAŞINA
sıfır fayda — gölge kalktığında değil, override SİLİNDİĞİNDE koruma başlıyor.
Ders: "yeşil kapı" üçüncü bir soruyu daha hak ediyor — **kapının baktığı tipleri/veriyi
üreten şey gerçek mi, yoksa elle yazılmış bir vekil mi?**
Karşı-önlem olarak seçilen kapı, tsc değil: schema.prisma'yı okuyup prisma çağrı literallerini
doğrulayan DB'siz, 130 ms'lik `schema-contract` testi (TASK-MTRKVWOGQFSO3).

Bkz. [[fabrika-verify-each-claim-not-the-headline]]

Bkz. [[fabrika-rls-can-silently-disappear]] · [[fabrika-ci-has-no-remote]]
