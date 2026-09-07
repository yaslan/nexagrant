---
name: fabrika-prisma-mock-makes-green-tests-for-crashing-calls
description: vi.mock ile elle yazılan prisma sahtesi, şemada OLMAYAN bir delegate'i mock'larsa çöken çağrıyı yeşil geçirir — sahte yalnız gerçek delegate'leri açmalı ve upsert'ü PK semantiğiyle uygulamalı
metadata:
  type: project
  updatedAt: 2026-09-07
---

`pnpm typecheck`'in DB çağrılarına kör olduğu biliniyordu
([[fabrika-typecheck-is-blind-to-db-calls]]). Testlerin de kör olduğu bilinmiyordu.

2026-09-07, TASK-MTRK9FMKE3GSB: `tests/cordis-rag.test.ts` ve `tests/cordis-delta.test.ts`
şunu yapıyordu —

```ts
vi.mock('../src/lib/db', () => ({
  prisma: { organization: { upsert: vi.fn().mockResolvedValue({ id: 'org-1' }) } },
}));
```

`prisma.organization` **gerçek istemcide `undefined`** (şemada `Organization` yok, `CordisOrganization`
var). Yani üretimde `TypeError: Cannot read properties of undefined (reading 'upsert')` atan çağrı,
testte mock'landığı için sorunsuz çalışıyordu. İki test dosyası aylarca yeşildi.

**Kalıcı kural: mock, şemanın söylemediği bir delegate'i ASLA icat etmemeli.** Elle yazılan
prisma sahtesi yalnız `prisma/schema.prisma`'da gerçekten var olan modelleri açmalı; testin
kendisi de bunu doğrulamalı:

```ts
expect(db.prisma.organization).toBeUndefined();  // şemada yok — sahte de uydurmasın
```

**İkinci kural: `vi.fn()` idempotency'yi ölçemez.** `upsert: vi.fn()` çağrı sayar, satır saymaz;
"aynı kaydı iki kez yaz → tek satır" sorusunu cevaplayamaz. Bunun yerine tabloları GERÇEK
birincil anahtarına göre `Map`'te tutan, `upsert`'ü gerçek upsert semantiğiyle uygulayan
bellek-içi bir sahte kullan. Örnek hazır: `tests/helpers/cordis-prisma-stub.ts`
(`cordisProject.id`, `cordisOrganization.organisationId`,
`cordisParticipation(projectId, organisationId)` bileşik anahtar dahil) — yeni bir DB testi
yazarken bunu yeniden kullan ya da örnek al.

**Üçüncü kalıp — yutan `catch` + artan sayaç:** aynı dosyalarda hata bloğu TypeError'ı yutuyor
**ve `syncedCount++` yapmaya devam ediyordu**. Ekran "3 proje senkronlandı" derken tabloya sıfır
satır yazılıyordu. Uydurma veri avında değerlerin yanı sıra bunu da ara:
`grep -n "catch" -A 4 <dosya>` → `catch` içinde sayaç artıyorsa, o sayaç bir İDDİADIR ve
hiçbir kayda dayanmaz. Başarısız kayıt `skipped`'a gider, `synced`'e değil.

İlgili: [[fabrika-typecheck-is-blind-to-db-calls]] · [[fabrika-done-reports-can-be-wrong]]
