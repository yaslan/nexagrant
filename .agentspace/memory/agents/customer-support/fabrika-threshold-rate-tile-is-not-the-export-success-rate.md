---
name: fabrika-threshold-rate-tile-is-not-the-export-success-rate
description: Fabrika panosunda "Eşik Üstü Oranı" kutucuğunun paydası GÖNDERİLEN TEKLİFLER, dışa aktarımdaki "Başarı Oranı"nınki FIRSAT SAYISI — iki farklı sayı, kart metinleri bunları sürekli karıştırıyor
metadata:
  type: project
  updatedAt: 2026-09-08
---

Fabrika panosunda eşik-üstü iki ayrı yerde, **iki ayrı paydayla** raporlanıyor. Bir
kart "şu oran yanlış" dediğinde ÖNCE hangisini kastettiğini ölç, yoksa doğru yapılmış
bir işi yarım sanırsın (2026-09-08'de tam bu oldu, TASK-MTS9CEDCWKQQK).

- **Pano kutucuğu "Eşik Üstü Oranı"** — `src/modules/m5/server/queries.ts:192`
  `thresholdRate(aboveThresholdProposals, submittedProposalsInRange)`.
  Paydası **`submittedAt != null` olan Proposal sayısı**. Etiketin altındaki açıklama
  da bunu söylüyor: *"Gönderilen teklifler içinde eşik üstü puanlandırılanların oranı"*.
- **Dışa aktarım (`/api/dashboard/export-csv`) "Başarı Oranı"** — paydası **pencere
  içindeki Opportunity sayısı**. `tests/e2e/dashboard-outcome-case.spec.ts` bunu ölçer.

2026-09-08 demo-tenant ölçümü — aynı veriden iki farklı doğru sayı:
`above=1, submitted=2, opportunities=5` → kutucuk **%50,0**, CSV **%20,0**.
Kalıntı iki fırsat varken (7) CSV **%14,3** oluyordu; kutucuk yine %50,0 idi çünkü o iki
fırsatın hiç `Proposal`'ı yoktu — paydayı da payı da hiç etkilemiyorlardı.

**Nasıl uygula:** "%X yerine %Y görünüyor" diyen bir kartta payda ne olursa olsun önce
`(above, submitted, opportunities)` üçlüsünü SQL'le çek ve hangi bölmenin kartın sayısını
verdiğini bul. Kartın etiketi yanlışsa raporda ADIYLA düzelt — sonraki okuyan aynı yanlış
okumayı tekrar eder.

İlgili: [[fabrika-board-cards-are-not-db-rows]] ·
[[fabrika-opportunity-delete-has-two-fkless-children]]
