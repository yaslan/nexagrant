---
name: fabrika-a-retired-setting-stays-required-in-the-docs
description: Kodda emekliye ayrılan bir ayar dokümanda "zorunlu" kalır — hiçbir kapı dokümanı ölçmez, ve patronun toplantıya götürdüğü dosya yanlış olur
metadata:
  type: project
updatedAt: 2026-09-09
---

`INVOICE_VAT_RATE` 2026-09-08'de emekliye ayrıldı: KDV oranı artık alıcının ülkesinden
(`src/lib/billing/vat-rates.ts`) geliyor, ayar hiçbir şeye karar vermiyor. Emeklilik kodda
düzgün ve GÜRÜLTÜLÜ yapılmıştı (preflight "yok sayılıyor" diye raporluyordu). Ama bir gün
sonra `docs/EFATURA_SETUP.md` hâlâ şunu diyordu: **"zorunlu: evet — boşken fatura kesilmez."**
Patron 12-13 Eylül entegratör görüşmesine tam da o dokümanla gidiyordu.

**Neden kaçtı:** `pnpm gate` kodu ölçer — lint, typecheck, test, i18n, RLS. Dokümanın kodla
uyuşup uyuşmadığını ölçen hiçbir kapı yok. Kod tarafı yeşil olduğu için emeklilik "bitmiş"
göründü; işin doküman yarısı hiç sorulmadı.

**Nasıl uygularım:** Bir ayarı/alanı/bayrağı emekliye ayıran ya da kaldıran her kartın DoD'unda
`grep -rn "<AYAR_ADI>" docs/` maddesi olsun — kod duraklarının yanında doküman durakları da
sayılsın. Özellikle operatörün/patronun ELİNE ALDIĞI dosyalar (kurulum kılavuzu, go-live
kontrol listesi, değişken tablosu) kod referansı değil, **talimat**tır: yanlışsa saat yakar.
Tarihsel kayıtlar (`docs/agent-results/`, `.agentspace/memory/`) bunun dışındadır — onlar
o günün gerçeğini anlatır, güncellenmez.

Bkz. [[fabrika-preflight-gate-must-mirror-what-the-code-blocks]] — kapının kod yollarını
yansıtması gerektiğini söyler; bu not aynı sorunun doküman yüzüdür.
