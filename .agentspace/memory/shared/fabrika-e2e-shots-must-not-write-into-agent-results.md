---
name: fabrika-e2e-shots-must-not-write-into-agent-results
description: Fabrika e2e spec'inde ekran görüntüsünü asla docs/agent-results/ altına yazma — tests/e2e/fixtures/shots.ts'in shotsDir()'ünü kullan; o klasörler commit'li KANIT ve koşu onları sessizce eziyordu
metadata:
  type: project
updatedAt: 2026-09-08
---

Yeni bir Fabrika e2e spec'i yazarken kareyi `docs/agent-results/TASK-…-screenshots`
altına YAZMA. O klasörler kapanmış kartların **commit'li kanıtı**; 32 spec bunu
yapıyordu ve tek bir tam koşu 27 izlenen dosyayı değiştiriyordu — hepsi PNG gürültüsü
de değildi (`02-empty-tenant-dashboard-en.png` 74 927 → 41 503 bayt: başka bir ekran).

Doğrusu (TASK-MTSHUZUMVLTBF, commit `71781c5`):

```ts
import { shotsDir } from './fixtures/shots';
const SHOTS = shotsDir('TASK-XXX-screenshots');   // → test-artifacts/ (git yok sayar)
```

Kareyi kartının klasörüne **bilerek** yayımlamak istiyorsan:
`E2E_SHOTS_ROOT=docs/agent-results npx playwright test …`

`shotsDir()` dizini kendisi açar — `page.screenshot()` üst dizinleri yaratır ama
`writeFileSync` yaratmaz.

Doğrulama: tam koşudan sonra `git status --porcelain -- docs/agent-results` hiçbir
` M` satırı göstermemeli. Daha sıkısı: `find … | xargs shasum` ile koşu öncesi/sonrası
karşılaştır — yalnız `>` (yeni dosya) satırları kalmalı, hepsi paralel ajanların işi.

Kural `docs/E2E_TESTING.md` §3.5'te. Yine de kopyalanmaya devam ediyor: bu iş
sırasında YENİ yazılan bir spec aynı anti-deseni yeniden üretmişti.
İlgili: [[fabrika-e2e-red-check-module-lock-first]]
