---
name: fabrika-consolidation-test-needs-equality-and-an-oracle
description: İki kopyayı tek kurala indiren refactor'ün testi hem eşitlik hem bağımsız oracle iddiası içermeli — ve iddia SIRASI hangi mutasyonun hangisini kanıtladığını belirler
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

Bu depo sürekli "aynı kuralın N kopyası → tek fonksiyon" refactor'ü yapıyor
(`vatOnNetMinor`, `withholdingOnVatMinor`, `creditsForUsage`, `llm.ts`). Böyle bir işin
regresyon testinde **iki farklı iddia** gerekir, çünkü her biri tek başına atlatılabilir:

* **Eşitlik** (`panel === document`) → *kopyayı* yakalar. Biri dosyalardan birine yerel bir
  yuvarlama adımını geri koyarsa iki taraf ayrışır.
* **Bağımsız oracle** (beklenen değeri testte kendin yaz, implementasyondan import ETME)
  → *kuralın kendisinin* değişmesini yakalar. Paylaşılan helper bozulursa **iki taraf
  birlikte kayar**, eşitlik HÂLÂ TUTAR ve test yeşil kalır — her rakam yanlışken.

Yalnız eşitlik yazmak en sık yapılan hata: konsolidasyonun tüm amacı iki tarafı aynı
fonksiyona bağlamak olduğu için, o fonksiyonu bozan mutasyona karşı eşitlik testi
**tanım gereği kör**.

**Sıra önemli — mutasyonla kanıtlarken.** Oracle iddiası eşitlikten ÖNCE gelirse her yanlış
değeri o yakalar ve eşitlik iddiasının canlı olduğunu HİÇ kanıtlayamazsın
([[fabrika-mutation-red-may-fire-on-another-assertion]]). TASK-MTTT8H82Y7P1E'de tam bu oldu:
iki mutasyon da oracle satırında ateşledi. İddia sırası **önce eşitlik, sonra oracle** olarak
değiştirilince her mutasyon farklı bir satırı ateşledi ve ikisinin de canlı olduğu ölçüldü:

| Mutasyon | Ateşleyen iddia |
|---|---|
| tek çağrı yerine yerel `Math.floor` kopyası geri kondu | eşitlik (`:75 panel vs document`) |
| paylaşılan helper `Math.floor`'a çevrildi | oracle (`:84`), eşitlik yeşil kaldı |

Kural: konsolidasyon testini **iki mutasyonla** doğrula (bir çağrı yeri + paylaşılan kural) ve
rapora hangi satırın ateşlediğini yaz. Tek mutasyon "kırmızı oldu" demek yarım ölçümdür.

Yan not: negatif olmayan değerlerde `Math.round(x)` ile `Math.floor(x + 0.5)` **aynıdır**, yani
böyle bir konsolidasyon çoğu zaman davranışı hiç değiştirmez. Kusur yanlış rakam değil,
**kaymaya açık ve testsiz** olmasıdır; raporda bunu böyle söyle, "bug düzelttim" deme.

İlgili: [[fabrika-mutation-red-may-fire-on-another-assertion]] ·
[[fabrika-a-refactor-docstring-claims-work-that-may-not-exist]] · [[fabrika-agents-share-one-working-tree]]
