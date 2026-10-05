---
name: fabrika-k1-upstream-sources
description: K1'in üç dış kaynağının 2026-09-06'da ölçülmüş gerçek durumu — SEDIA arama yanıtı açıklamayı zaten taşır (topicDetails çağrısı gereksiz), Eurostars portalı 403, TÜBİTAK /en/funding 404
metadata:
  type: reference
  updatedAt: 2026-09-06
---

2026-09-06'da üçü de canlıya karşı ölçüldü (`pnpm jobs:k1 -- --dry-run`).

## SEDIA (F&T Portal) — tek gerçek hacim kaynağı

`POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=100&pageNumber=N`
multipart: `query` (bool/terms: `type:["1"]` hibe, `status:["31094501" forthcoming,"31094502" open]`)
+ `languages` — ikisi de `application/json` tipli Blob olarak. **200, 1214 konu / 13 sayfa / ~12 sn.**
Kabul kriteri "≥500 konu" tek başına SEDIA'dan karşılanıyor.

**En önemli bulgu: arama yanıtı zaten `metadata.descriptionByte` (Expected Outcome + Scope, HTML) ve
`metadata.topicConditions` (uygunluk koşulları, HTML) taşıyor.** Bu yüzden konu-başına
`topicDetails/<id>.json` çağrısı GEREKSİZ — eski kod bunu yapıyordu ve günlük iş 1214 ardışık HTTP
isteğine (her biri 5 sn zaman aşımlı) dönüşüyordu. Kaldırıldı → 12 sn.

Diğer işe yarar alanlar: `startDate` = açılış tarihi · `deadlineDate` (00:00 UTC, kaba) ·
`metadata.budgetOverview[0]` JSON string → `deadlineDates` (asıl son tarihler, 17:00 Brüksel'e
normalize edilmeli), `deadlineModel` ("single-stage"/"two-stage"), `budgetYearMap`, `plannedOpeningDate`.

## Eurostars — eski portal ölü

`eurostars-eureka.eu` (tüm alan adı) tarayıcı-dışı istemciye **403** döner; UA değiştirmek yetmiyor.
Çalışan kaynak: `https://eurekanetwork.org/programmes/eurostars/` (200).
Yapı: `<span>Deadline 10 September 2026</span> … <a>Eurostars Call 11 for projects …</a>` kartları.
Az kayıt (2 açık çağrı) ama gerçek. Env: `K1_EUROSTARS_URL`.

## TÜBİTAK — İngilizce yol ölü

`/en/funding/research-projects-funding` **404**. Çalışan kaynak:
`https://www.tubitak.gov.tr/tr/destekler` (200) — program kataloğu:
`<a href="/tr/destekler/<kategori>/…/1501-…">1501 - TÜBİTAK Sanayi Ar-Ge …</a>`, 54 program.
**Dikkat:** bu sayfa PROGRAM listeler, tarihli ÇAĞRI değil — son tarih yok, hepsi `FORTHCOMING`.
Gerçek tarihler program alt sayfalarında. Env: `K1_TUBITAK_URL`.

## Şema kayması ≠ içerik değişikliği

`RawFetch.hash` karşılaştırması "API şeması değişti" DEĞİLDİR — bir son tarih güncellenince tetiklenir
ve her gece sahte alarm üretir (eski kodun hatasıydı). Doğrusu: ham yanıtı **gevşek** bir zod zarfına
(`z.looseObject`, yalnız vazgeçilmez alanlar) karşı doğrulamak. Zarf kırılırsa `SystemAlert`, iş devam.

İlgili: [[fabrika-dev-postgres-is-up]]
