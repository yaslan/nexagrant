---
name: a-method-chain-split-across-lines-hides-callers-from-grep
description: Bir kullanım denetiminde satır-bazlı grep, iki satıra kırılmış metot zincirlerini KAÇIRIR — metodu değil nesneyi ara; Fabrika'da alarm yazan iki bypass böyle görünmezdi
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

TASK-MTVRBLKRUUEUM kartı ölçülmüş bir zeminle geldi: "depoda 17 dosyada 39 `recordAlert`
çağrısı var (`grep -rn "recordAlert(" src scripts`)". Sayı **doğruydu** ama zemin
**eksikti**: alarm yazan iki dosya bu grep'e hiç görünmüyordu, çünkü `recordAlert`'i
değil `prisma.systemAlert.create`'i çağırıyorlardı — üstelik şöyle yazılmış olarak:

```ts
await prisma.systemAlert
  .create({ data: { ... } })
  .catch(() => {});
```

`grep "systemAlert\.create"` de bunu bulmaz: `prisma.systemAlert` ile `.create({`
**ayrı satırlarda**. Grep satır-bazlıdır; zincir kırıldığı anda desen ikiye bölünür.
Kaçan iki yazar (`src/lib/inngest/jobs/k1-daily-calls.ts` ×3,
`src/lib/adapters/alerts.ts` → 3 adaptörden 6 çağrı) üretimdeki **açık alarmların
%21'ini** üretiyordu ve hiçbir dedup/sanitizasyon almıyordu. `system-alert.ts`'in kendi
başlığındaki "The single writer for operator-visible alerts" iddiası bu yüzden yanlıştı.

**Why:** Bir grep, deseni bulamadığında "çağıran yok" ile "çağıran başka biçimde
yazılmış"ı ayırt edemez. Prettier/ESLint uzun zincirleri satıra böler, yani bu biçim
kaza değil, **kod tabanının normali**. Kartın verdiği "ölçülen zemin" de bir kaynaktır,
kesin hüküm değil.

**How to apply (bir "kim X'i kullanıyor" denetimine başlarken):**

1. **Metodu değil nesneyi/tabloyu ara.** `grep -rn "systemAlert" src scripts` — 45
   noktanın hepsini buldu; `grep "recordAlert("` 39'unu buluyordu.
2. Sarmalayıcıyı bulduğunda **onun çağıranlarını da** ara: `createAdapterAlert` tek
   satırdı ama 3 dosyadan 6 kez çağrılıyordu.
3. Yazma yolunu ararken **hem tek yazarı hem ORM'i** tara: `recordAlert(` ∪
   `prisma.<model>` ∪ `tx.<model>`. Aradaki fark bypass'tır ve genelde en kötü
   davranan çağıran oradadır.
4. Bulduğun sayı kartın sayısından farklıysa **raporun ilk bölümünde düzelt** ve nasıl
   kaçtığını yaz; yoksa bir sonraki ajan aynı eksik zemini kanıt sanır.
5. Sayım tamamlandığında bir de **ters yönden doğrula**: üretim verisinde hangi
   `source` değerleri var? Kodda karşılığını bulamadığın bir `source` (`k1_daily_calls`
   böyleydi) doğrudan bir bypass işaretidir.

İlgili: [[fabrika-hardcoded-copy-defeats-grep-audit]] ·
[[removal-proof-is-an-inert-value-not-a-zero-grep]] ·
[[fabrika-recordalert-is-not-the-only-writer]]
