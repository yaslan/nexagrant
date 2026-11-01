---
name: fabrika-roadmap-section-conventions
description: docs/ROADMAP.md'de bulgu türüne göre hangi bölüme yazılacağı — modül durum satırı, Açık kararlar, Riskler (teknik)
metadata:
  type: project
  updatedAt: 2026-09-07
---

`docs/ROADMAP.md` üç ayrı yeri farklı amaçlarla kullanıyor; bir dogfood/doğrulama raporunu
dokümana işlerken bulguyu doğru bölüme yazmak önemli (hepsini tek yere yığmak yerine):

1. **Modül durum satırı** (`Faz B` altındaki `[ ]`/`[x]` maddeler, örn. "M9 Meeting Briefs") —
   o modülün *şu an ne durumda olduğunun* özeti: çalışıyor mu, hangi kanıt/rapor/commit'e dayanıyor,
   board kart id'leri. Buraya P0/P1 bulguların kısa özeti + kanıt yolu gider, tam liste değil.
2. **"Açık kararlar" (dosya sonu, numaralı liste)** — *insan kararı bekleyen* sorular: ürün kararı
   (ör. uydurma fallback veri kalsın mı), şema kararı (ör. `opportunityId` eklensin mi), sahiplik
   belirsizliği. Her madde soru cümlesiyle başlar, kanıt satırıyla biter. [[fabrika-m6-disclaimer-surfaces]]
   ile aynı depoda bu listeye üç yeni madde eklendi (TASK-MTQUYMIVFHYCO, 2026-09-07).
3. **"Riskler (teknik)" (dosya sonu)** — *tekrar eden operasyonel desenler*, tek bir modüle özgü
   olmayan, ileride başka bir ajanın da düşeceği tuzaklar (ör. `src/locales/*.json` ölü katalog
   tuzağı, `prisma db push` + migration dosyası çakışması). Kararlan gereken bir soru değil,
   "bunu bilerek çalış" notu.

Bir agent raporunu ROADMAP'e işlerken önce bulguyu bu üç kategoriden hangisine ait olduğunu
sınıflandır, sonra ilgili bölüme ekle — hepsini modül satırına sıkıştırmak dosyayı okunmaz yapar.

Ayrıca: PM/doğrulayıcı ajanların (`blockzincir-pm` gibi) kendi review-kartı kararları çoğu zaman
**zaten** ROADMAP'e önceden yazılmış oluyor (kendileri ya da önceki bir blog-yazar turu yapmış) —
yeni bir dogfood raporunu işlemeden önce ilgili modül bloğunu oku, sıfırdan yazma, yalnız YENİ
bulguyu (bu turda: `TASK-MTQU053U24RYH`) ekle.
