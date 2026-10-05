---
name: removal-proof-is-an-inert-value-not-a-zero-grep
description: Bir ayarın kaldırıldığını `grep → 0` kanıtlamaz — ayarı saçma bir değere SET edip çıktının byte-identical kaldığını göster; ve her test kurulumunu silip testin yeşil kaldığını ölç
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

Bir ayarı/bayrağı **kaldıran** kartta `grep -rn "<AYAR>" src scripts tests` → 0 sonucu
gerekli ama yetersizdir: adın kaybolması, davranışın kaybolduğunu göstermez. Ada göre
temizlik yaparken bir okuma yolunu (başka bir isimle, `process.env` üzerinden, bir
varsayılan üzerinden) atlamış olabilirsin ve grep bunu hiç görmez.

**İki ölçüm gerçekten kanıtlar:**

1. **Değeri geri koy, çıktıyı diff'le.** Ayarı saçma bir değerle set ederek aracı/kapıyı
   koştur, set etmeden bir daha koştur, `diff` al. Byte-identical çıkıyorsa ayar
   gerçekten inert. (TASK-MTTTMECDO7RC8'de `INVOICE_VAT_RATE=99` ile preflight çıktısı
   birebir aynıydı — kaldırmanın kanıtı buydu, sıfır grep değil.)
2. **Test kurulumunu silmek ölçümün KENDİSİDİR.** `process.env.X = '...'` satırını bir
   testten silip testi **değiştirmeden** koştur. Yeşil kalıyorsa ayar o yolda ölüydü.
   **Kırmızıya dönerse ayar ÖLÜ DEĞİLDİR** — testi gevşetme, kaldırmayı durdur ve bildir.
   Bu, "önce sil sonra testleri uydur" refleksinin panzehiri.

Ayrıca: kaldırılan davranışı tarif eden testleri silerken yerine **daha geniş** bir iddia
koy (ör. "bu blok tek satır üretir ve o satır bir ortam değişkeni değildir"), yoksa
kapsam sessizce daralır ve kimse fark etmez.

`env -i PATH=... HOME=...` ile koşmak bunu güvenli yapar: gerçek `.env` hiç okunmaz,
çıktıya sır girmez, ölçüm de yalnız verdiğin değişkenleri görür.

Aynı ailenin diğer yüzü: [[brand-proof-needs-a-substitution-not-a-matching-string]]
(eşleşen string değil, ikame kanıtlar). Doküman yarısı:
[[fabrika-a-retired-setting-stays-required-in-the-docs]].
