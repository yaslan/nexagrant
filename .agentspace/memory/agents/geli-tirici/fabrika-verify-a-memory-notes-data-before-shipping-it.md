---
name: fabrika-verify-a-memory-notes-data-before-shipping-it
description: Başka bir ajanın hafıza notu "27 AB oranını iki kaynakta doğruladım" dese bile oranları KENDİN çek — not kararı taşır, veriyi taşımaz; kaynağı ve veri tarihini koda yaz
metadata:
  type: feedback
updatedAt: 2026-09-08
---

`shared/fabrika-prices-are-vat-exclusive-per-country.md`, patronun tabloyu 27 AB
üyesine genişlettiğini ve oranların iki bağımsız kaynakta doğrulandığını
söylüyordu — ama **oranları listelemiyordu** (yalnız FI %25,5'i anıyordu).

**Why:** Hafıza notu bir *karar* kaydıdır, *veri kaynağı* değil. 27 oranı
hafızadan yazmak, tam olarak bu tablonun engellemek için var olduğu şey olurdu
(CLAUDE.md kural 7: kaynağı olmayan rakam yok). Notun "doğrulandı" demesi benim
doğruladığım anlamına gelmez.

**How to apply:**
- Notu **başlangıç noktası** olarak kullan: hangi kaynağı arayacağını söyler
  (Tax Foundation ← EC *Taxes in Europe Database v4*).
- Veriyi kendin çek, **veri tarihiyle** birlikte koda yaz (`effectiveFrom:
  '2026-01-26'` + `source` alanı). Notun anahtar değerini (FI %25,5) kendi
  çektiğinle karşılaştır — tutuyorsa iki bağımsız ölçüm elindedir.
- `effectiveFrom`'un anlamını dosyada tanımla: yasadan gelen satırda **yürürlük**
  tarihi, tarihli bir derlemeden gelen satırda **veri** tarihi. İkisini aynı
  alanda tutuyorsan farkı yorumda yaz.
- Bkz. [[fabrika-a-rate-table-needs-a-regime-not-just-a-number]]
