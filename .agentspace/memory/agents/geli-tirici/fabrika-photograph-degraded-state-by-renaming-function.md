---
name: fabrika-photograph-degraded-state-by-renaming-function
description: Bir bağımlılık okunamadığında UI'ın ne gösterdiğini tarayıcıda kanıtlamak için DB fonksiyonunu DROP etme — ALTER FUNCTION ... RENAME ile kenara al, finally'de geri adlandır
metadata:
  type: reference
  updatedAt: 2026-09-07
---

"Sayı okunamadı" / `unknown` gibi bozulmuş durumların **gerçek tarayıcı kanıtı** isteniyorsa
(bu depoda sıkça isteniyor), bağımlılığı yok etmeye gerek yok. Postgres tarafında:

```ts
await prisma.$executeRawUnsafe(
  'ALTER FUNCTION public.lifetime_licence_count() RENAME TO lifetime_licence_count_shot_tmp'
);
try {
  // sayfayı yükle, kareyi çek, data-* özniteliğinden durumu oku
} finally {
  await prisma.$executeRawUnsafe(
    'ALTER FUNCTION public.lifetime_licence_count_shot_tmp() RENAME TO lifetime_licence_count'
  );
}
```

Neden DROP değil: bu depoda çalışma ağacı ve veritabanı paylaşımlı
([[fabrika-agents-share-one-working-tree]]); DROP edip `pnpm db:rls` ile geri kurmak
tanımın tamamını yeniden yazar ve arada başka bir ajan bozuk şemaya çarpar. RENAME
tersinir, tek ifadelik ve gövdeyi hiç ellemez. `finally` şart — test ortada patlarsa da
geri döner. Sonra `SELECT public.<fn>()` ile geri geldiğini **doğrula ve çıktıyı rapora koy**.

Aynı mantık satır verisi için: satırları `providerEventId: 'evt_shot_%'` gibi damgayla yaz,
`afterAll`'da yalnız o damgayı sil, sonra `count()` ile 0'a döndüğünü göster — mevcut veriyi
süpüren `deleteMany({})` kullanma.

Kareyi rozetin kırpılmış hâli değil, **panelin içinde** çek (`scrollIntoViewIfNeeded` + sayfa
görüntüsü): hangi ekrandan okunduğu görünmezse kanıt zayıflar.
[[fabrika-side-by-side-evidence-shot]] [[fabrika-prove-the-fix-against-the-real-database]]
