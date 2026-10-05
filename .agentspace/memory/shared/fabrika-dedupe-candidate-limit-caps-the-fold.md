---
name: fabrika-dedupe-candidate-limit-caps-the-fold
description: recordAlert'in DEDUPE_CANDIDATE_LIMIT'i (5) mevcut eski yığın yüzünden DEĞİL, aynı (level,source) altında 5 DAHA YENİ satır oluşunca katlamayı kaçırır — ölçüldü
metadata:
  type: project
  updatedAt: 2026-09-10
---

`findOpenDuplicate` adayları `where {level, source, resolvedAt: null}`,
`orderBy createdAt desc`, `take: DEDUPE_CANDIDATE_LIMIT` (=5) ile çeker. "5'ten fazla
açık alarm varsa katlama kaçar" cümlesi **fazla kabadır** ve iki farklı durumu
karıştırır. TASK-MTVRBLKRUUEUM'da gerçek Postgres'e karşı ikisi ayrı ayrı ölçüldü:

**(a) Mevcut eski (anahtarsız) yığın katlamayı ENGELLEMEZ.**
Ölçüm anında `k1_daily_calls` warn'da **6** açık satır (limitin üstünde),
`k2_monthly_cordis` error'da **5** vardı. Yine de yeni `dedupeKey`'li alarm iki
oluşumda `rows=1, alertRepeatCount=2` verdi. Sebep: anahtarlı satır **en yeni** olarak
açılır ve `take: 5` penceresinin başında durur; eski yığın satırları daha eskidir,
pencereden onlar düşer. Yani "kaynakta zaten çok açık satır var, dönüştürmek işe
yaramaz" YANLIŞ bir gerekçedir.

**(b) Aynı `(level, source)` altında 5 DAHA YENİ satır oluşursa katlama KAÇAR.**
`persistCordisRecord` ile ölçüldü: hedef alarm açıldı → 5 farklı yeni drift anahtarı
açıldı → ilk problem tekrarlandı →

```
rows for key cordis-sync:schema-drift:alpha -> 2  repeatCount=[1,1]
ESCAPED — the fold was missed: a duplicate row opened
```

Katlanan satırın `createdAt`'i güncellenmez (yalnız meta'daki `alertLastSeenAt`), yani
bir anahtarlı satır zamanla pencereden düşebilir.

**Pratik sonuç:** risk yalnız **kardinalitesi yüksek** anahtarlarda var — anahtarın
içine değişken bir küme/kimlik gömdüysen (`cordis-sync:schema-drift:${alan kümesi}`
gibi). Sabit ya da küçük kapalı kümeden gelen anahtarlar (host, HTTP kodu, besleme adı,
belge türü) bu tavana çarpmaz. Anahtara değişken bir kümeyi gömmeden önce "bu kaç farklı
değer üretebilir?" diye sor.

Kalıcı çözüm mekanizma tarafında: `hasDedupeKey` durumunda aday sorgusunu
`meta.alertDedupeKey` üzerinden filtrelemek limiti bu yol için anlamsızlaştırır
(TASK-MTVRBLKRUUEUM raporunda ayrı kart olarak önerildi).

İlgili: [[fabrika-alert-dedupe-needs-stable-meta]] ·
[[fabrika-tests-leave-permanent-alerts-in-the-operator-console]] ·
[[fabrika-recordalert-is-not-the-only-writer]]
