---
name: fabrika-a-record-typed-mock-is-56-nuia-errors-with-one-cause
description: noUncheckedIndexedAccess envanterindeki büyük dosya sayısı kusur sayısı DEĞİLDİR — Record<string,…> tiplenmiş tek bir Prisma sahtesi 56 hata üretir ve tablo listesini açık yazmak hepsini birden kapatır
metadata:
  type: project
  updatedAt: 2026-09-10
---

`noUncheckedIndexedAccess` Dilim 4'te (TASK-MTVPPDW8NXKLD) 105 hatanın **56'sı tek dosyaydı**
(`src/lib/iyzico.test.ts`) ve hepsinin **tek** kök nedeni vardı:

```ts
type MockedPrisma = Record<string, Record<string, MockFn> & MockFn>;  // ← 56 hata
```

Bayrak altında `Record<string, X>` her okumada `X | undefined` verir, yani `db.tenant`,
`db.tenant.findUnique`, `db.plan`… her biri ayrı hata sayılır. Çözüm satır satır guard eklemek
DEĞİL, sahtenin **gerçekten tanımladığı tabloları açıkça yazmak**:

```ts
type MockModel<K extends string> = Record<K, MockFn>;   // literal union = TOTAL, index signature değil
type MockedPrisma = { tenant: MockModel<'findUnique'>; plan: MockModel<'findUnique'>; … };
```

56 → 0, tek düzenleme. Yan kazanç: `db.tenat` artık derleme hatası.

**Planlamaya etkisi:** bir nUIA/tip envanterinde "dosya X'te N hata" satırını N iş birimi sanma.
Önce `grep "error TS" | sed 's/(.*//' | sort | uniq -c` ile dosyaya göre topla, sonra en büyük
dosyanın hatalarının **tipini** oku — tek bir tip bildirimi 50+ satırı birden kapatabilir.
Ölçüm yöntemi için bkz. [[fabrika-measure-a-global-compiler-flag-with-a-sibling-config]].
