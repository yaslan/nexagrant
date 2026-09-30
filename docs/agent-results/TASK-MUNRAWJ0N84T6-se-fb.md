# TASK-MUNRAWJ0N84T6 — PDF açılmış bayt sınırı: pdf.js'in kendi decode çıkışını sayan tek sayaç (se-fb)

**Durum:** DEVAM EDİYOR
**Dal:** `se-fb/munraw-pdf-inflate-cap` (dev'den)

Plan: `inflateCheck` metin taramasını kaldırıp pdf.js `DecodeStream` tampon büyütmesine (tüm filtre zinciri) tek sayaç bağlamak; LZW / çok katmanlı Flate / ASCII85+Flate / ASCIIHex+Flate / sahte endstream atlatmalarını testle kapatmak.
