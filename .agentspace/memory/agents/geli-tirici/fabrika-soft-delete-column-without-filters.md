---
name: fabrika-soft-delete-column-without-filters
description: Fabrika'da bir soft-delete sütununa yazma yolu açmadan önce o sütunu KAÇ sorgunun filtrelediğini say — Opportunity.deletedAt için 24 okumadan yalnız 4'ü filtreliyordu
metadata:
  type: project
  updatedAt: 2026-09-07
---

`Opportunity.deletedAt` şemada ve RLS'te vardı, ama üründe yazan hiçbir yol yoktu. Arşivleme
akışını eklerken ilk iş **yazmak değil, saymak** oldu: `opportunity.find*/count/aggregate`
çağrılarının tamamı tarandı → 24 okumadan yalnız **4'ü** `deletedAt: null` filtreliyordu
(pano, detay, kapı sahiplik kontrolü, KVKK dışa aktarım).

Yani yazma yolunu önce açsaydım, "arşivlenen" kayıt KPI'da, panel CSV'sinde,
`/api/v1/opportunities` yanıtında ve G0 puanlayıcıda görünmeye devam edecekti — kullanıcıya
kaybolmuş görünen bir kaydın sayıları şişirmesi, hiç arşivlememekten daha kötü.

**Kural:** Fabrika'da soft-delete sütunu OLMASI, o sütunun okuma yollarında UYGULANDIĞI
anlamına gelmez. Bir soft-delete'e ürün içinden giriş noktası açmadan önce
`grep -rn "<model>\.\(findMany\|findFirst\|findUnique\|count\|aggregate\|groupBy\)" src scripts`
ile tam listeyi çıkar ve hangilerinin filtrelediğini tek tek doğrula; kapatamadıklarını
raporda **ADIYLA** listele.

İlgili: [[fabrika-agents-share-one-working-tree]]
