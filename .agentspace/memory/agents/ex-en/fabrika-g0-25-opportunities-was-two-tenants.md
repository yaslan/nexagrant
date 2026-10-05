---
name: fabrika-g0-25-opportunities-was-two-tenants
description: "25 fırsat 18 alıyor" kartı yanıltıcıydı — sadece demo-tenant'ın 5'i öyleydi; esr-calibration'ın 20'si ayrı bir fixture mekanizmasından zaten farklılaşmıştı. Ayrıca G0 demo-tenant tavanı yapısal olarak 75/100'de kilitli.
metadata:
  type: project
  updatedAt: 2026-09-07
---

TASK-MTQW90XSQ1SU1'i çalışırken kartın "25 fırsatın HEPSİ 18/100 alıyor" iddiasını DB'ye karşı
doğruladım (önce ölç, sonra dağıt dersi — [[fabrika-board-cards-go-stale]]). Gerçek durum:

- `demo-tenant`: 5 fırsat, hepsi `g0Score=18` — kartın anlattığı buydu.
- `esr-calibration`: 20 fırsat, `scripts/esr-calibration.ts`'in sabit fixture'ından skorlanmış
  (35–81 arası, `topicId=null`), DB kanıt tablolarından tamamen bağımsız. `scripts/rescore-g0.ts`
  bu tenant'ı varsayılan olarak atlıyor. Toplam = 25, ama ürün içinde hiçbir operatör (RLS ile
  kendi tenant'ına scoped) bu 25'i bir arada göremez — "25" yalnız ham `SELECT COUNT(*)`'ın sonucu.

**Why:** Kart muhtemelen ham bir COUNT sorgusuyla yazılmış, per-tenant kırılım kontrol edilmemiş.
Kartı olduğu gibi uygulamaya çalışsaydım (25 fırsatın hepsini "düzeltmeye" çalışmak) hem
esr-calibration'ın kalibrasyon amaçlı sabit verisini bozardım hem de gerçek kapsamı (demo-tenant'ın
5'i) yanlış büyütürdüm.

**Ayrı, kalıcı bulgu — G0 tavanı demo-tenant'ta yapısal olarak 75/100'de kilitli:** `coordinatorHistory`
(ağırlık 15) ve `networkCentrality` (ağırlık 10), `CordisParticipation`'ı `Tenant.pic` üzerinden
okuyor; bu DB'de `CordisOrganization` ve `CordisParticipation` **0 satır** (yalnız 20 iskelet
`CordisProject`, katılımcısız). Gerçek bir K2 CORDIS import'u olmadan bu 25 puanlık bileşen için
"gerçekçi" veri üretilemez (sahte PIC/participation icat etmek CLAUDE.md §7'yi ihlal eder). Bu yüzden
`TopicMatch`+`TopicStat`+`ConsortiumSeat` seed'lense bile azami ulaşılabilir skor 75/100 — iyi
hizalanmış bir fırsat bile (fit=81, tüm sert kurallar geçti) sadece bu boşluk yüzünden NO_GO kalabilir.

**How to apply:** Bir sonraki G0/kapı görevinde demo-tenant'ın skorlarını yorumlarken bu 75'lik
tavanı unutma — K2 CORDIS import'u (gerçek `CordisOrganization`/`CordisParticipation`) çalışmadan
`coordinatorHistory`/`networkCentrality` hiçbir seed ile "measured" olamaz. Kart yazarken/okurken
"N fırsat X alıyor" gibi toplu bir istatistik görürsen tenant kırılımını DB'den doğrula, tek
`COUNT(*)` toplamına güvenme.

İlgili: [[fabrika-g0-score-never-computed]], [[fabrika-g0-evidence-placeholder-laundering]],
[[fabrika-g0-scoring-three-implementations]]
