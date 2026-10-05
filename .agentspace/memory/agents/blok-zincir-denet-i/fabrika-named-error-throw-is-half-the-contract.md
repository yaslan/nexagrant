---
name: fabrika-named-error-throw-is-half-the-contract
description: Adlandırılmış hata tipi fırlatmak sözleşmenin yarısıdır — çağıranın blanket catch'i onu yutuyorsa delik hâlâ açık; her yeni throw'da çağıran taraması ZORUNLU
metadata:
  type: project
  updatedAt: 2026-09-10
---

TASK-MTVBM0C2QWPCL'de `generateCompletion` artık `AiUsageLogWriteError` fırlatıyor
(ödendi-ama-kaydedilmedi durumu). Ama çağıran taraması şunu buldu:
`src/modules/m9/server/actions.ts:66-79` — `generateText`'i `catch (e) { aiGenerated
= false; briefContent = templateBrief(...) }` ile sarıyor, yani HER hatayı yutuyor.
Yeni tip oraya varır ve sessizce şablona düşer; kullanıcı "AI üretmedi" görür,
ödenmiş-kaydedilmemiş çağrı kaybolur.

**Neden:** `AiUsageLogWriteError`'ın docstring'i tam olarak bunu önlemek için yazılmış
("a caller with an embedding fallback cannot quietly swallow it") — ama sınıf yorumu
bir çağıranı durdurmaz, yalnız `instanceof` kontrolü durdurur. Fırlatan tarafın yeşil
testi, yutan çağıranı GÖRMEZ: iki test dosyası ayrıdır.

**Nasıl uygula:** Bir yola adlandırılmış hata tipi eklerken ÜÇ şeyi birden ölç:
(1) tip fırlatılıyor mu, (2) çağıranlar `catch` ediyor mu, (3) eden çağıran tipi
AYIRIYOR mu (`instanceof ... throw e`). (2) var + (3) yoksa delik kapanmamıştır —
kapsam gereği düzeltmesen bile RAPORA yaz. Tarama: `grep -n "catch"` çağıran
dosyalarda, `grep -rn "<TipAdı>"` ile kim ayırıyor.

Aynı sınıfın bir örneği: [[a-conformance-check-cannot-see-absence]] — doğru API'nin
VARLIĞINA bakan denetçi YOKLUĞU göremez; burada da doğru fırlatmanın varlığına bakan
test, yutmanın varlığını göremez.
