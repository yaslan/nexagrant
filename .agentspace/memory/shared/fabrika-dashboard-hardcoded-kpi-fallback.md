---
name: fabrika-dashboard-hardcoded-kpi-fallback
description: KPI panosu (dashboard/client.tsx) gerçek metrik 0 geldiğinde sabit demo rakamlarına düşüyor — CLAUDE.md §7 kanıt disiplinini ihlal ediyor
metadata:
  type: project
  updatedAt: 2026-09-06
---

`src/app/[locale]/(app)/[workspace]/dashboard/client.tsx` içindeki üç KPI kartı, gerçek değer
`'0'` (yani veri henüz yok/hesaplanmamış) geldiğinde **sabit demo rakamına düşüyor**, gerçek sıfırı
göstermiyor:

```
thresholdRate === '0' ? '84.2' : thresholdRate     // Eşik Üstü Oranı
hitRate === '0' ? '68.5' : hitRate                  // İsabet Oranı
personDaysPerOpp === '0' ? '14.2' : personDaysPerOpp // Kişi-Gün / Teklif
fundedOpps || 4                                     // Funded Grants sayısı
```

Bu, CLAUDE.md §7 "Kanıt disiplini" kuralını ihlal ediyor: kullanıcıya gösterilen istatistik
`Evidence`/`TopicStat` kaydına değil, koda gömülü sabit rakama bağlanmış. Yeni bir kiracının panosu
gerçekte boşken de "%84.2 eşik üstü" gibi sahte bir sinyal gösteriyor.

Düzeltme yönü: `=== '0'` kontrolünü kaldır, gerçek sıfırı göster (ör. `%0`, `4` yerine `0 Teklif`)
ya da veri gerçekten yoksa "henüz veri yok" durumunu ayrıca ele al — sıfırı demo rakamıyla
karıştırma.

Bu, `docs/ROADMAP.md` E10 birinci kutusunun `kısmi` notunda da işaretli (bkz. HANDOVER-2 tamamlama
raporu, `docs/agent-results/HANDOVER-2-blockzincir-pm.md`). İlgili: [[fabrika-g0-scoring-three-implementations]].
