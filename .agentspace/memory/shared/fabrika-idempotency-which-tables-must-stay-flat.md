---
name: fabrika-idempotency-which-tables-must-stay-flat
description: "İşi iki kez koştur, satır sayısı değişmesin" testinde Fabrika'da yalnız normalize tablolar sabit kalır — RawFetch gün-aşırı büyür, SystemAlert artık aynı meta'da katlanır ama meta değişince yeni satır açar; ölçümü arka arkaya yap ve dünün sayısına karşı okuma
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
3. **`SystemAlert` artık aynı olayda büyümüyor — ama koşulu `meta`.**
   *(2026-09-08'e kadar büyüyordu; TASK-MTS80DUAF39Z8 / commit `f79156d` kapattı.
   Eski not "dedupe yok" diyordu, o artık YANLIŞ.)* `recordAlert()` **çözülmemiş** ve
   `(level, source, message, çağıranın meta'sı)` olarak aynı bir uyarı bulursa yeni satır
   yazmaz; o satırı `alertRepeatCount` / `alertLastSeenAt` ile günceller.
   Doğrudan sonucu: **kimliğin bir parçası `meta`.** Meta'sına her koşuda değişen bir alan
   koyan çağıran (zaman damgası, deneme sayısı, rastgele id, farklı host/ay) dedupe'u
   SESSİZCE devre dışı bırakır ve eski sonsuz-büyüme davranışına döner. Ölçülmüş örnek:
   aynı `CORDIS worker unreachable` metni `{"host":"localhost:8000","month":"2026-09"}`
   ile tek satırda `×6` katlanırken, `{"host":"127.0.0.1:8123","month":"2026-12"}` ayrı
   satır açtı — bu doğru davranış, kaçak değil.
   Uyarıyı **çözmek** pencereyi kapatır: sonraki oluş taze satır açar (bilerek).
   Düzeltmeden ÖNCE yazılmış özdeş satırlar geriye dönük birleştirilmedi; hâlâ orada
   (2026-09-08 ölçümü: 3 yinelenen grup, 7 satır). Saklama politikası hâlâ YOK.

**Nasıl uygula:** idempotans iddiasını ölçerken (a) iki koşuyu **arka arkaya** yap,
(b) `SystemAlert`'ten "satır sayısı sabit" bekle ama yalnız `meta` da sabitse — değilse
sayım artar ve bu ihlal değildir, (c) `RawFetch`
büyüdüyse önce "üst kaynak değişti mi" diye ikinci bir koşuyla ayır — üçüncü koşuda da
büyüyorsa o zaman gerçek hatadır (bu hata bir kez oldu: SEDIA aynı identifier'ı tek
koşuda iki kez döndürüyordu, `k1-daily-calls.ts:87` tekilleştirmesi bunun için var).

İlgili: [[fabrika-db-mock-invents-the-model]] ·
[[fabrika-schema-contract-guard-misses-relation-names]] ·
[[fabrika-no-sentry-systemalert-decision]]
