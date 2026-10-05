---
name: fabrika-public-route-can-serve-the-stale-duplicate
description: "Fabrika'da bir belge/sayfa iki nüsha olabilir ve HERKESE AÇIK rota çoğu kez BAKIMI YAPILMAYANI sunar — 'içerik doğru mu' sorusunu dosyaya değil, footer'ın gittiği URL'e sor"
metadata:
  type: project
  updatedAt: 2026-09-08
---

TASK-MTPZF8X1W8WCU'da bulundu. Depoda **iki DPA** vardı:

- `src/app/[locale]/dpa/page.tsx` — copy koda gömülü, veri işleyeni **"FonBridge"** (ürünün
  artık taşımadığı ad) olarak adlandırıyor, sayfada 6 kez.
- `src/app/[locale]/compliance/dpa/page.tsx` — `docs/legal/dpa-{tr,en}.md`'yi render ediyor;
  hukuki dayanak tablosu, alt işleyenler, 72 saat ihlal bildirimi. Sürüm 1.0, bakımı yapılan nüsha.

**Herkese açık footer birincisine bağlanıyordu** (`PublicFooter.tsx` → `getPublicRoute('dpa')`;
TR'de `next.config.ts` rewrite'ı `/tr/veri-isleme-sozlesmesi → /tr/dpa`). Bakımı yapılan nüsha
yalnız uygulama içinden (`settings/privacy/client.tsx`) erişilebiliyordu. Yani sözleşmeyi
okuyacak taraf, bakımsız metni görüyordu — `docs/legal/` güncellenmiş olmasına rağmen.

**Why:** Bu depoda "aynı şeyin iki uygulaması" tekrar eden bir desen
([[fabrika-m5-kpi-duplicate-implementations]], [[fabrika-g0-scoring-three-implementations]]).
Yeni ve doğru olan yazılırken eskisi **silinmiyor**, sadece link verilmemesi bekleniyor —
ama rota tablosu (`src/lib/routes.ts`) ve `next.config.ts` rewrite'ları eski yola bakmaya
devam ediyor. `docs/`'u güncellemek de yetmiyor: markdown'ı render eden sayfa ile herkese
açık URL'in aynı sayfa olduğu **varsayım**dır, kanıt değil.

**Nasıl uygulanır:**

1. "Şu metin/sayfa doğru mu" sorusunda dosyayı okumakla YETİNME. `curl` ile **herkese açık
   URL'i** çek ve `<h1>`'i + bir içerik imzasını karşılaştır. İki nüsha genelde başlıklarından
   ayrılır (bizde: "DPA Şablonu" vs "DPA").
2. Giriş noktasını geriye yürü: `PublicFooter.tsx` / `getPublicRoute()` / `next.config.ts`
   rewrites → hangi dosyaya iniyor? `grep -rn "'/dpa" src/` gibi bir arama, rewrite katmanını
   ATLADIĞI için yanıltır; rewrite'ları ayrıca oku.
3. Düzeltirken eski URL'i kırma: eski yolu yeni sayfaya **rewrite** et, sonra eski dosyayı sil.
4. **Gotcha:** bir sayfa dosyasını silince `.next/types/validator.ts` bayat kalır ve
   `tsc --noEmit` hayali bir `Cannot find module '../../src/app/[locale]/<yol>/page.js'`
   hatası verir. `.next` gitignore'lu üretilmiş bir artefakt — dosyayı sil, sayfayı bir kez
   iste, hata kaybolur. Bunu gerçek bir kırılma sanma.

Aynı desende hâlâ AÇIK: "FonBridge" adı 17+ yerde (giriş kartı, admin düzeni,
`terms/page.tsx`, kullanıcıya görünen i18n dizeleri) ve `terms/page.tsx` copy'si hâlâ
`isTr ? … : …` olarak gömülü (CLAUDE.md §8).
