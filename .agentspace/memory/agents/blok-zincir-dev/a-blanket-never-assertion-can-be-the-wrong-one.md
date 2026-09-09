---
name: a-blanket-never-assertion-can-be-the-wrong-one
description: "`not.toContain(X)` görünüşte en güçlü iddiadır ama alan kuralı X'i ZORUNLU kılıyorsa en yanlışıdır — doğru düzeltme silmek değil, 'X tam bir kez, kendini gerekçelendiren yerde' demektir"
metadata:
  type: feedback
updatedAt: 2026-09-09
---

Bir test `expect(doc).not.toContain('₺')` gibi **battaniye bir olumsuz iddia** taşıyorsa,
bu iddia mantıken en güçlü görünen ama alan kuralı o sembolü **zorunlu** kıldığı anda en
yanlış olanıdır. Fabrika'da tam bu oldu: VUK 215 / 385 yabancı para faturasında TL
karşılığını belge üzerinde şart koşuyor, `src/lib/efatura.ts` bunu **iki yönde** uyguluyor
(`foreignCurrencyFilingBlock` TL rakamı olmayan USD belgesini GİB'e göndermeyi reddediyor,
renderer da rakamı basıyor) — yani "belgede hiç ₺ olmasın" iddiası özelliğin kendisinden
eskiydi ve `test.skip()` altında yıllarca görünmemişti.

**Kural:** böyle bir iddia düştüğünde üç seçenek vardır ve ikisi tuzaktır — (a) iddiayı sil
= yeşile boyama, (b) uygulamayı iddiaya uydur = mevzuatı kır, (c) **iddiayı daha keskin
yaz**. Doğrusu (c): "X hiç geçmesin" yerine **"X tam bir kez geçsin ve kendini
gerekçelendiren satırın içinde olsun"**:

```ts
expect(occurrences(usd, '₺')).toBe(1);
const rows = rowsMentioning(usd, '₺');       // html.split('<tr').slice(1).filter(...)
expect(rows[0]).toContain('TL karşılığı');    // KONUM
expect(rows[0]).toContain('₺4.082,22');       // DEĞER, satırdaki kayıttan
for (const a of ['99,00','19,80','118,80']) expect(usd).not.toContain(`₺${a}`);
```

Bu, orijinal regresyonu (her para hücresinin sabit ₺ ile basılması) hâlâ yakalar — çünkü o
durumda sayım 1 olmaz ve `₺99,00` bulunur — ama artık **hangi** kuralı koruduğunu söyler:
yasak "sembol" değil, **para birimi karışması**.

**Karar prosedürü (hangi taraf yanlış):** ürün kodunu ve o satırı ekleyen commit'i oku.
Kodun kendi yorumu ve commit mesajı çoğu zaman kuralı açıkça yazar — Fabrika'da `8118b54`
birebir "that row is the only place a lira sign may appear" diyordu. Kaynak bunu söylüyorsa
uygulama doğrudur, test eskidir; **tersini** söylüyorsa dur ve lidere bırak (mevzuat kararı,
mühendis kararı değil).

Yan not: bir belge iddiasının beklenen değerini üretim kodundan değil, o özelliğin **kanıt
dosyalarından** ölç (`docs/agent-results/<TASK>-evidence/*.html`) — `grep -o '₺' | wc -l` ile
sayım, `sed -n` ile `<tr>` yapısı; böylece iddia varsayıma değil ölçüme dayanır.

İlgili: [[reuseExistingServer-symptom-masking]] · [[fabrika-two-way-evidence-for-guard-tests]] ·
[[fabrika-a-count-is-not-coverage]]
