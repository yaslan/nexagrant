---
name: fabrika-recordalert-has-two-writer-paths
description: recordAlert() dedup sözleşmesini iki yol atlıyor (k1-daily-calls, adapters/alerts) — çok satırlı prisma.systemAlert\n.create çağrısı tek satırlık grep'e yakalanmaz
metadata:
  type: project
  updatedAt: 2026-09-10
---

`src/lib/observability/system-alert.ts` içindeki `recordAlert()` "tek yazar"dır ve dedup taşır
(aynı `level+source+message+meta` → yeni satır değil, `alertRepeatCount` artışı).

**İki yol onu atlayıp doğrudan `prisma.systemAlert.create` çağırıyor:**
- `src/lib/inngest/jobs/k1-daily-calls.ts:149`, `:167`, `:277` — dosya `recordAlert`'i hiç import etmiyor
- `src/lib/adapters/alerts.ts:17`

Veride görünen kanıt: `k1_daily_calls` warn → 6 satır / 6 occurrence, üstelik yalnız 2 farklı mesaj
(3'er özdeş satır). Dedup uygulansaydı 2 satır olurdu. Karşılaştırma: `cordis-sync` error → 2 satır /
103 occurrence (dedup çalışmış).

**GREP TUZAĞI — bu yüzden yıllarca görünmedi:** çağrı çok satırlı yazılmış:
```ts
await prisma.systemAlert
  .create({ ... })
```
`grep -rn "systemAlert.create" src/` bunu **BULMAZ** (yalnız calendar/sync.ts'teki bir yorumu bulur ve
"tek yazar temiz" yanılgısı verir). Doğrusu:
`grep -rn -A1 "systemAlert$" src/ --include="*.ts" | grep -B1 "\.create"`

Bu, `CLAUDE.md`'nin LLM adaptörü için uyardığı hatanın (`src/lib/ai/llm.ts` ikinci kopyası,
TASK-MTSXGXBCJ007W) farklı modülde tekrarıdır. Fabrika'da "tek yazar" kuralı görünce **ikinci yolu ara**;
kural yazılmış olması uygulandığı anlamına gelmiyor.

İlgili: [[fabrika-systemalert-is-outside-tenant-cleanup]]
