---
name: fabrika-env-ts-is-consumed-as-a-flat-string-map
description: src/lib/env.ts'e string OLMAYAN bir alan eklemek pnpm typecheck'i alakasız bir dosyada kırar — efatura-preflight tüm env'i Partial<Record<string,string|undefined>> olarak alır; sayıyı string doğrula, sayısal görünümü ayrı export et
metadata:
  type: project
  updatedAt: 2026-09-10
---

`src/lib/env.ts`'teki her alan bugün `string` (ya da `string | undefined`). Bu bir
üslup tercihi değil, **bir tüketicinin dayandığı sözleşme**:

```ts
// scripts/efatura-preflight.ts
export function evaluatePreflight(
  envSource: Partial<Record<string, string | undefined>> = env
): PreflightReport
```

Şemaya `z.coerce.number()` (ya da boolean) bir alan eklediğin anda `env` bu parametreye
atanamaz olur ve **kapı, dokunmadığın bir dosyada** kırmızıya döner. TASK-MTVRC1UGA3B6Y'de
ölçüldü — `ALERTS_SWEEP_FAILURE_THRESHOLD` sayı olarak eklenince:

```
scripts/efatura-preflight.ts(86,35): error TS2322: … Property
  'ALERTS_SWEEP_FAILURE_THRESHOLD' is incompatible with index signature.
  Type 'number' is not assignable to type 'string'.
scripts/efatura-preflight.ts(244,36): error TS2345: … (aynı)
```

**Yapılacak:** doğrulamayı zod'da bırak ama tipi string tut, sayısal görünümü ayrı bir
export ver:

```ts
ALERTS_SWEEP_FAILURE_THRESHOLD: z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().regex(/^[1-9][0-9]*$/, '…').default('3')
),
// …
export const alertsSweepFailureThreshold = Number(env.ALERTS_SWEEP_FAILURE_THRESHOLD);
```

Regex hem `0`'ı hem sayı olmayan metni **boot'ta** reddeder (ölçüldü:
`❌ Invalid environment variables: … Too small` yerine desen hatası), yani doğrulamadan
taviz verilmiyor — yalnız tip yüzeyi korunuyor.

Alternatif "preflight'ın parametre tipini genişlet" yolu kapsam dışıydı (`scripts/`);
ayrıca o fonksiyon değerlerde `val.trim()` çağırıyor, yani gevşetmek orada da düzeltme
ister. Aynı ailedeki diğer tuzaklar: [[fabrika-env-ts-cannot-be-read-from-a-client-component]],
[[fabrika-dotenv-after-imports-never-reaches-env-ts]], [[fabrika-unset-config-degrades-to-nothing]]
