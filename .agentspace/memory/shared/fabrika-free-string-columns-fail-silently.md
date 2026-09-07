---
name: fabrika-free-string-columns-fail-silently
description: Serbest string sütunu literal ile karşılaştırmak sessizce 0 üretir — tarama tarifi ve Fabrika'daki 9 sütunun sonucu (ölçüldü 2026-09-07)
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Prisma `enum`'u olmayan bir `String` sütununu koddan literal ile karşılaştırdığında, kasa
farkı **istisna atmaz**: filtre hiçbir satırla eşleşmez, sayım 0 çıkar, KPI güvenle yanlış
bir rakam söyler. Bu yüzden "UI'da 0 görünüyor" şikâyetinde önce veriyi değil
**karşılaştırmayı** kontrol et.

**Tarama tarifi** (yamamadan önce ölç): sütun sütun canlı değerleri çıkar, sonra koddaki
literallerle diff'le.

```sql
select distinct "<col>"::text from "<Table>" where "<col>" is not null order by 1;
```

`pg` + `dotenv` ile depo kökünden bir tek-seferlik `.mjs` yeterli (scratchpad'ten çalışmaz —
`dotenv`/`pg` çözülmüyor; kökte çalıştır, sonra SİL).

**2026-09-07 ölçümü — literal ile karşılaştırılan 9 sütun:**

| sütun | DB | kod | |
|---|---|---|---|
| `Opportunity.stage` | `G0..G4` | `'G0'..'G4'` | ✅ |
| `Opportunity.status` | `ACTIVE` | `'ACTIVE'/'FUNDED'/'REJECTED'/'WITHDRAWN'` | ✅ |
| `Opportunity.intendedRole` | `coordinator` | `'coordinator'` (+`.toLowerCase()`) | ✅ |
| `Proposal.outcome` | `above_threshold` | `'ABOVE_THRESHOLD'` | ❌ tek uyuşmazlık |
| `ModuleState.status` | `ON` | `'ON'`, `['ON','PILOT']` | ✅ |
| `Evaluation.status` | `draft` | `'draft'`, `'completed'` | ✅ |
| `Evaluation.readerType` | `PANEL` | `'PANEL'` | ✅ |
| `GateDecision.gate` | `G0..G4` | `['G0','G2']` | ✅ |
| `Reviewer.status` | `pending` | `'pending'`, `'completed'` | ✅ |

Yakın isimli ama AYRI tablolar birbirine karıştırılmasın: `MarketplaceListing.status='active'`
(küçük) ≠ `Opportunity.status='ACTIVE'` (büyük) — çapraz bir hata değil.

Bir uyuşmazlık bulursan yamama: sözlüğü tek dosyaya al ve okuyucuları oraya bağla
(örnek: [[fabrika-dashboard-outcome-case-mismatch]]). İkinci bir kopya bırakırsan hata geri gelir.
