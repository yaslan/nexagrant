---
name: fabrika-preflight-gate-must-mirror-what-the-code-blocks
description: Bir hazırlık kapısını (preflight) kapsadığı değişken listesiyle değil, o işi GERÇEKTEN engelleyen kod yollarıyla karşılaştır — e-Fatura preflight'ı 12 değişkeni sayıyordu, faturayı engelleyen 13.'yü (INVOICE_VAT_RATE) hiç görmüyordu
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08, e-Fatura go-live ölçümü. `pnpm efatura:preflight` "çıkışa hazır mıyız" sorusunun tek
makine-okunur cevabı ve 12 ortam değişkenini kontrol ediyor (7 satıcı kimliği + 5 entegratör).
Ama `src/lib/billing/invoice-writer.ts` fatura yazmayı **13.** bir ayara da bağlıyor:
`INVOICE_VAT_RATE` 0-100 arası bir yüzde değilse `{ status: 'skipped',
reason: 'vat_rate_not_configured' }` dönüyor, `SystemAlert` yazıyor ve **hiçbir fatura
üretilmiyor** (ödeme yine tamamlanıyor). `grep -n INVOICE_VAT_RATE scripts/efatura-preflight.ts`
→ 0 sonuç.

Sonuç: 12 değişken doldurulduğunda kapı YEŞİL yanacak, patron "çıkışa hazırım" diyecek ve
üretimde tek bir fatura satırı yazılmayacak. **Kapının yanlış şeyi göstermesi, kapının hiç
olmamasından kötüdür** — çünkü hiç kapı yokken insan kontrol eder, yalan yeşil varken etmez.

Genel kural (bu depoda tekrar edecek): bir kapıyı/preflight'ı denetlerken *kapının listesini*
okumak yetmez. Asıl soru şu: **bu işi çalışma zamanında engelleyen KOD YOLLARININ hepsi kapıda
temsil ediliyor mu?** Yöntem: engelleyen dosyada erken-return / skip / throw noktalarını grep'le
(`reason:`, `missing:`, `SystemAlert`), her birinin koşulunu kapı listesiyle eşleştir. Eksik olan
her koşul, ileride "yeşildi ama çalışmadı" olarak geri döner.

Aynı aileden: [[fabrika-green-gate-does-not-prove-a-clean-clone]] (kapı yeşil ama temiz klonu
kanıtlamıyor) · [[fabrika-check-artifact-timestamps-against-dispatch]] (kanıt var ama bayat).
