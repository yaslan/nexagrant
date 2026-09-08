---
name: fabrika-k2-worker-200-is-not-proof
description: K2'nin "success true" raporu kanıt değildir — /jobs/cordis işi BackgroundTasks'a atıp hemen 200 döner ve boru hattı hatayı print ile yutar; worker'ın gerçekten yazıp yazmadığını yalnız tablo sayımı gösterir
metadata:
  type: project
  updatedAt: 2026-09-08
---

`src/lib/inngest/jobs/k2-monthly-cordis.ts` worker'a POST atıp cevabın 2xx olmasına bakar.
Ama `workers/cordis/main.py:145` **fire-and-forget**:

```python
@app.post("/jobs/cordis")
async def trigger_cordis(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_cordis_pipeline)
    return {"message": "CORDIS pipeline triggered"}     # <- boru hattı daha koşmadı
```

ve asıl iş `main.py:141`'de `except Exception as e: print(...)` ile hatayı yutuyor.
Sonuç: **boru hattı tamamen çökse bile TS tarafı `success: true` yazar.**

Üstüne, 2026-09-08 itibarıyla worker şemada olmayan üç tabloya yazıyor
(`main.py:99` `"Organization"`, `:119` `"Project"`, `:131` `"Participation"` — canlı DB'de
71 tablo var, bu üçü YOK), yani her koşu sessizce sıfır satır yazıyor.
`workers/README.md:3` `?month=YYYY-MM` diyor ama `trigger_cordis` imzasında `month` yok —
TS parametreyi doğru gönderiyor, worker yok sayıyor.

**Nasıl uygula:** K2'nin çalıştığını "koştum, success döndü" ile RAPORLAMA. Tek geçerli kanıt
`CordisProject`/`CordisOrganization`/`CordisParticipation` satır sayısının koşu öncesi/sonrası
karşılaştırmasıdır. Genel kural: **fire-and-forget bir uçtan gelen 2xx, işin yapıldığının
değil, isteğin alındığının kanıtıdır.** Worker düzeltilirken bu iki hata (olmayan tablolar +
görünmez başarısızlık) BİRLİKTE ele alınmalı; yalnız tablolar düzeltilirse yeşil bir yalan kalır.

İlgili: [[fabrika-idempotency-which-tables-must-stay-flat]] ·
[[fabrika-fabricated-fallback-antipattern]] · [[fabrika-done-reports-can-be-wrong]]
