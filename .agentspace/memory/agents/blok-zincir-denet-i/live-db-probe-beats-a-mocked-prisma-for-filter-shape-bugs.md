---
name: live-db-probe-beats-a-mocked-prisma-for-filter-shape-bugs
description: Fabrika'da sorgu-şekli kusurlarını yalnız canlı Postgres sondası yakalar — kalıcı `*.live.test.ts` kalıbı, kendi fixture'ı, `describe.skipIf(!HAS_DB)`, sonda kalıntısı bırakma
metadata:
  type: project
updatedAt: 2026-09-08
---

Fabrika'da "sorgu doğru satırı buluyor mu" sorusunu mock'lu Prisma cevaplayamaz;
yalnız gerçek Postgres cevaplar. Depoda bunun yerleşik bir kalıbı var
(`tests/*.live.test.ts` — `gdpr-data-subject.live.test.ts`,
`calendar-token-db.live.test.ts`, TASK-MTSY88Q6AMCGB'de eklenen
`stripe-webhook-idempotency.live.test.ts`). İskelet:

```ts
const CONNECTION = process.env.DATABASE_URL || 'postgresql://fabrika:fabrika@localhost:5432/fabrika';
const HAS_DB = await dbReachable();          // pg.Pool + 'select 1', 2s timeout
describe.skipIf(!HAS_DB)('...', () => { ... });
```

Uyulması gereken kurallar (hepsi acıyla öğrenildi):

- **Kendi fixture'ını üret, seed'e yaslanma.** Her koşuda rastgele bir sonek
  (`t-idem-<rand>`) ile kendi Tenant + Plan satırını yarat; paylaşılan dev DB'de
  başka ajanların satırlarına dokunma.
- **`afterAll`'da temizle ve KANITLA.** İş bitince `select count(*) ... where id
  like 't-idem-%'` → 0 çıktısını rapora koy. Paylaşılan DB'de kalıntı bırakmak
  başka ajanın testini bozar.
- **Yalnız taşımayı mock'la.** Stripe SDK'sı gibi ağ istemcisi `vi.mock`'lanır
  (`class MockStripe { subscriptions = { retrieve: async () => ... } }`,
  `default` export); altındaki her şey üretim kodu kalır. `@/lib/db` ASLA
  mock'lanmaz — ölçülen şey odur.
- **`console.log` görmek için** `npx vitest run <file> --disableConsoleIntercept
  --reporter=verbose`; düz `pnpm test` çıktıyı yutar.
- **Ölçüm sondası ile kalıcı test ayrı şeylerdir.** Önce sayıları basan geçici
  bir sonda koş (BEFORE tablosu), sonra aynı senaryoyu assert eden kalıcı testi
  `tests/` altına bırak. Geçici sondayı repo'dan sil — ama vitest yalnız proje
  kökü altındaki dosyaları görür, scratchpad'deki dosyayı koşmaz: geçici olarak
  `tests/zz-*-tmp.test.ts` adıyla koy, koş, sil.

İlgili: [[prisma-json-equals-compares-the-whole-document]],
[[shared-worktree-red-must-be-attributed-before-it-is-reported]]
