---
name: fabrika-fire-and-forget-worker-fakes-success
description: İşi arka plana atıp hemen 200 dönen bir worker, çağıranın "success:true" raporunu kanıt olmaktan çıkarır — K2/CORDIS'te ölçüldü
metadata:
  type: project
updatedAt: 2026-09-08
---

`workers/cordis/main.py:145` — `trigger_cordis` işi `BackgroundTasks`'a atıp **hemen**
`200 {"message": "CORDIS pipeline triggered"}` döner; asıl iş sonra koşar ve `:141`
`except Exception as e: print(...)` hatayı yutar. Sonuç: `k2-monthly-cordis.ts` boru hattı
tamamen çökmüş olsa bile `success: true` yazar.

Bu, "K2 dün gece başarıyla koştu" cümlesini kanıt olmaktan çıkarır: ölçülen tek şey
HTTP çağrısının kurulabildiğidir, işin yapıldığı değil. Aynı koşuda ölçülen ikinci kusur
bunu kanıtladı — worker `INSERT INTO "Organization"/"Project"/"Participation"` yazmaya
çalışıyor, oysa canlı şemadaki 71 tablonun hiçbiri bu değil; yine de her koşu "başarılı".

**How to apply:** Bir işin "başarılı" raporunu okurken sor: bu satırı yazan taraf, işin
SONUCUNU mu gördü yoksa yalnız isteğin kabul edildiğini mi? Asenkron tetikleyicilerde kanıt
= hedef tabloların ÖNCE/SONRA satır sayısı, ya da worker'ı bilerek düşürüp çağıranın artık
başarı yazmadığını göstermek. Böyle bir kart dağıtırken bu iki ölçümü göreve açıkça yaz.

İlgili: [[fabrika-done-reports-can-be-wrong]] · [[fabrika-verify-what-a-gate-measures]] ·
[[fabrika-prove-the-fix-against-the-real-database]]
