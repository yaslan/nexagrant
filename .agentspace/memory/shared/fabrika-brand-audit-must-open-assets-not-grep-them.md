---
name: fabrika-brand-audit-must-open-assets-not-grep-them
description: Marka/metin denetiminde public/ varlıklarını DOSYA ADINDAN değil İÇERİKTEN kontrol et — wordmark PNG baytlarında yaşar, hiçbir grep göremez; alt metni doğruyken görsel yanlış olabilir
metadata:
  type: project
  updatedAt: 2026-09-10
---

Fabrika'nın FonBridge→Fabrika yeniden adlandırması metin yolunu tamamen kapattı: iki katalogda
sıfır isabet, her marka cümlesi `{brand}` placeholder'ı, üretilen belgenin başlık/menşe/gövde/alt
bilgisi temiz. Buna rağmen **giriş ekranı eski markayı gösteriyordu**: `public/logo.png` (600x240)
eski wordmark'ın KENDİSİ. Dosya adı nötr ("logo.png"), metin araması sıfır isabet veriyor.

Daha ince olanı: 8 render noktasının `alt` metni zaten doğruydu
(`tCommon('logoAlt', { brand: PRODUCT_NAME })` → "Fabrika logosu"). Yani ekran okuyucu "Fabrika",
gören kullanıcı "FonBridge" alıyordu. Yeniden adlandırma **görselin açıklamasını** düzeltip
görselin kendisini bırakmıştı — ve giriş kartında eski wordmark "Fabrika Platformuna Giriş"
başlığının tam üstünde duruyordu.

**Why:** `grep -r` bir denetimin tamamı sanılıyor. Kullanıcıya görünen yüzey = metin + VARLIK;
ikili varlık grep'in kör noktası, dolayısıyla en uzun yaşayan sızıntı orada birikiyor.

**How to apply:** marka / kullanıcıya-görünen-metin denetiminde:
1. `find public -type f -exec file {} \;` → hangi varlık gerçekten görsel, boyutu ne.
2. Wordmark taşıyabilecek her rasterı **AÇ ve BAK** (Read aracı png/jpg'yi gösterir). `.ico` için
   önce dönüştür: `sips -s format png x.ico --out /tmp/x.png` (macOS; Linux'ta ImageMagick).
3. SVG'lerde `<text>`/`<title>` gerçekten grep'lenir — ama yalnız SVG'de.
4. Sonra varlığın nerede render edildiğini say (`grep -rn "logo.png" src/`) — etki yarıçapı budur.
5. Raporda temiz yüzeyin de karesini ver; "temiz" iddiası da kanıt ister.

Aynı denetimde metin tarafı için: `PRODUCT_NAME` bir İSİMDİR — adres (`noreply@...`), host
(`storage....app`) ve bucket adı ondan TÜRETİLEMEZ; onlar `src/lib/env.ts` üzerinden env
değişkeni ister ve gerçek alan adı bir ÜRÜN KARARIDIR, ajan tahmin etmemeli.
localStorage anahtarlarını (`fonbridge_cart_items_v2` vb.) toplu yeniden adlandırmaya KATMA —
her kullanıcının sepetini sessizce siler.

İlgili: [[fabrika-guard-test-scan-reach-is-the-first-thing-to-audit]] — bu sızıntıların hayatta
kalma sebebi, koruma testinin ikili varlıkları hiç açamamasıydı.
