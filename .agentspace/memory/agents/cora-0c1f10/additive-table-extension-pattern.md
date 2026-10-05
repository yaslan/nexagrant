---
name: additive-table-extension-pattern
description: When a spec asks for a table that already exists in another shape, extend it with a discriminator column instead of rewriting — pattern used for Fabrika's Evaluation table
metadata:
  type: feedback
  updatedAt: 2026-09-06
---

Bir görev "şu tabloyu şu şekilde oluştur" dediğinde, o tablo **zaten farklı bir şekilde
var ve kullanılıyor** olabilir. Fabrika M6.1'de (2026-09-06) tam bunu yaşadım:
`Evaluation` zaten `Opportunity` üzerinde tek-okuyucu merceğiydi ve iki dosya onu
yazıyordu; görev ise `Proposal` üzerinde çok-değerlendiricili panel istiyordu.

**Yaklaşım — ayırt edici sütun (discriminator) ile additive genişletme:**

1. Mevcut tabloyu OKU + `grep -rn "<Model>" src/` ile **çağıranları bul**. Kullanımda
   olan bir tabloyu yeniden yazmak sessiz regresyondur.
2. Yeni şekli ayırt eden bir sütun seç (burada mevcut `readerType`: `HUMAN|AI` → `PANEL`).
3. Yeni sütunların **tamamı** nullable ya da DEFAULT'lu olsun.
4. Mevcut NOT NULL sütunlara **DEFAULT ekle** ki yeni şekil onları atlayabilsin.
   `ALTER COLUMN ... SET DEFAULT` mevcut satırlara dokunmaz, yalnız gelecek INSERT'i
   etkiler — nullable yapmaktan iyidir, çünkü mevcut TS kodunun tipini bozmaz.
5. **Geri uyum regresyon testi yaz:** eski yazma yolunun geçtiği alan kümesiyle birebir
   bir INSERT çalıştır, yeni sütunların doğru varsayılandığını doğrula, satırı sil,
   sayımın geri geldiğini göster. "Bozmadım" iddiası değil, çıktı.

**Neden:** mevcut veri ve çağıranlar korunur, DoD'daki "regresyonsuz" maddesi kanıtlanır,
ve tek migration ile geri alınabilir kalır.

Ayrıca: Prisma **CHECK constraint üretemez**. 1..5 gibi aralıklar yalnız elle yazılan
migration SQL'inde yaşar ve `prisma migrate reset` / sıfırdan `db push` sonrası
**kaybolur**. Bunu riskler bölümüne yaz ve uygulama tarafına da bir guard koy.

İlgili: [[seed-idempotency-pattern]] · [[fabrika-rls-bypass-local-dev]]
