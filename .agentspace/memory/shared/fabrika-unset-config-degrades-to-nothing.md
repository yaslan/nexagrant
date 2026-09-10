---
name: fabrika-unset-config-degrades-to-nothing
description: Fabrika'da yapılandırılmamış bir entegrasyon MAKUL bir varsayılana değil, YOKLUĞA düşer — env değeri yoksa null döndür/işi reddet, asla inandırıcı bir yer tutucu üretme
metadata:
  type: project
  updatedAt: 2026-09-10
---

`src/lib/env.ts` bir kural taşıyor ama hiçbir yerde kural olarak yazmıyor: **bir
ayar tanımsızsa, o ayarı gerektiren şey YAPILMAZ — yerine geçen makul görünen bir
değer üretilmez.** Dosyadaki yorumlar bunun üç ayrı olayını anlatıyor:

- `INVOICE_SUPPLIER_VKN` yoksa fatura ihraç rotası belge ÜRETMİYOR (bir zamanlar
  VKN 3810459281 ve "Maslak Vergi Dairesi" gömülüydü — TASK-MTRD9QBJ2G32E).
- `OPENAI_API_KEY` yoksa RAG yolu REDDEDİYOR (bir zamanlar deterministik sahte
  embedding gerçek `Chunk` tablosuna yazıyordu — TASK-MTUH5L8MJ6S8E).
- `IYZICO_*` yoksa webhook her teslimatı reddediyor; demo anahtara düşmüyor.

**Why:** bu üç olayın hepsinde hata "yanlış değer" değil, **doğru görünen değer**
idi. Yer tutucu, sistemin geri kalanı için gerçek veriden ayırt edilemez; bir
sonraki okuyucu (kod ya da insan) onu ölçüm sanır. Yokluk gürültülüdür, sahte
değer sessizdir.

**How to apply:** yeni bir env değeri eklerken "tanımsızken ne olacak?" sorusuna
"şu makul varsayılana düşer" diye cevap veriyorsan DUR. Doğru cevaplar: `null`
döndür ve çağıran UI o ögeyi hiç göstermesin · işi reddet ve NEDEN'i söyle ·
import anında gürültülü patla (`optionalUrl` bunu yapıyor: bozuk bir değer
değişkeni ADIYLA anıp uygulamayı açılışta düşürüyor — bunu bilerek seç).
`R2_PUBLIC_HOST` (TASK-MTV5ESBVAHUEV) tam olarak böyle eklendi: yoksa
`publicObjectUrl()` **null** döner, `Evidence.fileUrl` NULL yazılır, kullanıcıya
indirme düğmesi HİÇ gösterilmez — hiçbir yere çıkmayan bir bağlantı yerine.
Eski hali altı yerde gömülü bir alan adıydı ve tam da bu yüzden fark edilmedi.

İlgili: [[fabrika-guard-test-scan-reach-is-the-first-thing-to-audit]]
