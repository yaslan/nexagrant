---
name: fabrika-guard-test-scan-reach-is-the-first-thing-to-audit
description: Yeşil bir kaynak-koruma testi ürün hakkında değil, testin TARAMA ERİŞİMİ hakkında kanıttır — büyük/küçük harf, uzantı filtresi ve kök listesi üçünü de ölç
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

TASK-MTTUTNGF1MO9P'de `tests/retired-brand-name.test.ts` **5/5 yeşilken** giriş ekranı emekli
markanın (FonBridge) logosunu gösteriyordu. Test bozuk değildi; yanlış yerlere bakıyordu.

Bir kaynak-koruma testinin ("şu dizge canlı kodda geçmesin") üç sessiz kör noktası var. Yeşil
gördüğünde üçünü de ÖLÇ, yoksa yeşili ürün kanıtı sanarsın:

1. **Büyük/küçük harf.** `const RETIRED = 'FonBridge'` + `.includes(RETIRED)` → `fonbridge.app`,
   `fonbridge-evidence`, `fonbridge_cart_items_v2` hepsi geçer. Bu taskta **8 dosya** yalnız
   küçük harfli biçimi taşıdığı için görünmezdi. Ölçüm:
   ```bash
   for f in $(grep -rliE "<ad>" src/ prisma/); do grep -q "<Ad>" "$f" || echo "  $f"; done
   ```
2. **Uzantı filtresi.** `/\.(ts|tsx|json)$/` → hiçbir ikili varlık açılamaz. En kötü bulgu
   (`public/logo.png` = eski wordmark'ın kendisi) tasarımı gereği testin dışındaydı.
3. **Kök listesi.** Yalnız `src/` + `next.config.ts` yürünüyordu; `public/` ve `prisma/` hiç
   taranmıyordu (`schema.prisma` hem kök hem uzantı yüzünden iki kez dışarıda).

**Why:** bu depoda "yeşil kapı, kırık yüzey" tekrar eden bir arıza sınıfı
([[fabrika-negative-only-assertions-pass-on-a-screen-that-never-opened]] iddia biçiminden,
bu ise erişim genişliğinden). İkisi de aynı yanılgıyı üretir: kapı ürünü değil kendini doğrular.

**How to apply:** bir guard test'e güvenmeden önce testi AÇ ve şunu sor: "bulmam gereken şey bu
testin taradığı küme içinde mi?" Denetim raporunda kapının yeşil çıktısını, ne taradığı ölçümüyle
BİRLİKTE ver — çıplak "5 passed" satırı kanıt değildir. Genişletme önerirken üçünü ayrı ayrı yaz;
ikili varlıklar grep'lenemediği için oraya "gözden geçirilmiş varlık manifesti + hash" gerekir.

Ters yön (yorumlar yüzünden yanlış KIRMIZI): [[fabrika-source-guard-tests-must-strip-comments]]
