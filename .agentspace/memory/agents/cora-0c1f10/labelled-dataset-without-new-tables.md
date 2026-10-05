---
name: labelled-dataset-without-new-tables
description: Etiketli bir değerlendirme/kalibrasyon veri seti için yeni tablo açma — Opportunity + Proposal.outcome + GateDecision.inputs zinciri zaten tahmin/gerçek/özellik taşıyor
metadata:
  type: project
  updatedAt: 2026-09-06
---

E11.3'te "20 örnek seed et, G0 skorunu gerçek sonuçla karşılaştır" işi için ilk refleks iki yeni
tablo açmaktı (`EsrCalibrationSample` + `EsrCalibrationVerdict`). Gerek yokmuş: Fabrika'nın mevcut
zinciri bir denetimli-öğrenme veri setinin üç parçasını da zaten taşıyor.

- **özellikler + tahmin** → `GateDecision`: `inputs` Json (yedi özellik, ağırlıklar, gerekçeler),
  `passed` (tahmin), `ruleVersion` (model sürümü). `id` alanına kendi deterministik anahtarını
  verebiliyorsun (`esr-cal-gd-<sampleId>`), böylece upsert edilebilir ve koşu başına satır birikmiyor.
- **gerçek etiket** → `Proposal.outcome` + `esrScores` Json.
- **skor** → `Opportunity.g0Score`.

Kazanç: migration yok, RLS politikası yok, `docs/DATA_MODEL.md`'de yeni tablo yok, paralel ajanların
düzenlediği `prisma/schema.prisma`'ya dokunmadan iş bitiyor
([[fabrika-parallel-agent-file-race]] riskinden tamamen kaçınılıyor).

Tek gereken izolasyon: tüm satırları **ayrı bir iç kiracıya** (`tenantId='esr-calibration'`) yaz.
Kiracıya-kapsamlı her sorgu (KPI panosu, pipeline) bunları görmez, ama `demo-tenant` sayımını
önce/sonra karşılaştırarak sızıntı olmadığını kanıtlaman gerekir.

**Why:** yeni tablo, CLAUDE.md'ye göre migration + RLS + seed + DATA_MODEL güncellemesi demek —
aynı işi mevcut şemayla yapabiliyorken bunun bedelini ödemek gereksiz ve geri alması zor.

**How to apply:** etiketli veri isteyen bir görevde önce "tahmin nerede saklanıyor, gerçek sonuç
nerede saklanıyor" diye sor; ikisi de varsa tablo açma, ayrı bir kiracıda seed et ve geri alma
yolunu (`--rollback`) aynı script'e koy. Benzer "önce mevcut şemayı genişlet" refleksi için
[[additive-table-extension-pattern]], idempotent seed deseni için [[seed-idempotency-pattern]].
