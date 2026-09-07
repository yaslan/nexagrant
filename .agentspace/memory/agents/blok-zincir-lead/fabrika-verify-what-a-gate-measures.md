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

Bkz. [[fabrika-rls-can-silently-disappear]] · [[fabrika-ci-has-no-remote]]
