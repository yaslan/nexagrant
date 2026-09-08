---
name: fabrika-idempotency-which-tables-must-stay-flat
description: "İşi iki kez koştur, satır sayısı değişmesin" testinde Fabrika'da yalnız normalize tablolar sabit kalır — RawFetch gün-aşırı büyür, SystemAlert HER koşuda büyür; ölçümü arka arkaya yap ve dünün sayısına karşı okuma
metadata:
  type: project
  updatedAt: 2026-09-08
---

Bir işin idempotan olduğunu "iki kez koştur, sayım değişmesin" ile ölçerken Fabrika'da
üç tablo sınıfı üç farklı davranır. Karıştırılırsa doğru kod bozuk, bozuk kod doğru görünür.

**Ölçüm (TASK-MTRK9FMKE3GSB doğrulaması, 2026-09-08, `pnpm jobs:k1` üç kez üst üste):**

```
BEFORE       {"Call":430,"Topic":1288,"RawFetch":1274,"SystemAlert":7,"Programme":9}
AFTER RUN 1  {"Call":430,"Topic":1288,"RawFetch":2486,"SystemAlert":8,"Programme":9}
AFTER RUN 2  {"Call":430,"Topic":1288,"RawFetch":2486,"SystemAlert":9,"Programme":9}
AFTER RUN 3  {"Call":430,"Topic":1288,"RawFetch":2486,"SystemAlert":10,"Programme":9}
```

1. **Normalize tablolar (`Call`, `Topic`, `Programme`, `Cordis*`) SABİT kalmalı.**
   Gerçek idempotans testi budur. Oynuyorsa hata vardır.
2. **`RawFetch` arka arkaya koşuda sabit, gün aşırı DEĞİL.** Yazar "değiştiğinde yaz"
   (`(source,key)` + hash — `src/lib/k2-cordis/raw-fetch.ts`). Üst kaynak gerçekten
   değişince yeni satır yazar: yukarıda RUN 1 bir günlük SEDIA değişimi yüzünden
   **+1212** satır yazdı, RUN 2–3 hiç yazmadı. Yani **dünkü sayıya karşı ölçme** —
   büyümeyi regresyon sanarsın. Günde ~1200 satır; saklama politikası hâlâ yok.
3. **`SystemAlert` HER koşuda büyür — tekrar koruması yoktur.**
   `src/lib/observability/system-alert.ts:139` düz `systemAlert.create`; ne dedupe ne
   throttle. Aynı metin + aynı `meta` her koşuda yeni satır: ölçümde 3 özdeş
   "CORDIS worker unreachable" ve 3 özdeş "K1 … more than once" satırı çıktı.
   **Bir alert satırının artması idempotans ihlali DEĞİLDİR** — ama gece koşan bir iş
   için sonsuz büyüme yoludur ve `/admin/alerts` ekranını gömer.

**Nasıl uygula:** idempotans iddiasını ölçerken (a) iki koşuyu **arka arkaya** yap,
(b) sabit kalmasını beklediğin tablo listesine `SystemAlert`'i KOYMA, (c) `RawFetch`
büyüdüyse önce "üst kaynak değişti mi" diye ikinci bir koşuyla ayır — üçüncü koşuda da
büyüyorsa o zaman gerçek hatadır (bu hata bir kez oldu: SEDIA aynı identifier'ı tek
koşuda iki kez döndürüyordu, `k1-daily-calls.ts:87` tekilleştirmesi bunun için var).

İlgili: [[fabrika-db-mock-invents-the-model]] ·
[[fabrika-schema-contract-guard-misses-relation-names]] ·
[[fabrika-no-sentry-systemalert-decision]]
