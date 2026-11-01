---
name: fabrika-vitest-runs-keyless-and-hides-console
description: Fabrika'da vitest .env'i process.env'e taşımaz — OPENAI_API_KEY tüm süitte unset, yani her "anahtar yoksa uydur" dalı sessizce koşuluyor ve testler ona bel bağlıyor; ölçmek için --reporter=verbose şart, varsayılan reporter geçen testin console çıktısını GİZLER
metadata:
  type: reference
  updatedAt: 2026-09-09
---

`.env` dosyasında `OPENAI_API_KEY` **tanımlı**, ama vitest onu `process.env`'e taşımıyor
(Vite yalnız `VITE_` önekli değişkenleri expose eder). Ölçüm:

```ts
// tests/__envprobe.test.ts
import { env } from '@/lib/env';
test('probe', () => console.log('PROBE', env.OPENAI_API_KEY ? 'SET' : 'unset'));
```
```
PROBE env.OPENAI_API_KEY = unset
```

**Sonucu:** bu depodaki her "anahtar yoksa mock'a düş" dalı, **tüm süit boyunca sessizce koşuluyor**.
Testler farkında olmadan üretimdeki uydurma fallback'in sırtına biner. TASK-MTUH5L8MJ6S8E'de
`getEmbedding`'in mock fallback'ini kaldırınca `tests/cordis-rag.test.ts`, `tests/cordis-delta.test.ts`
ve `tests/rag-ingest-silent-failure.test.ts` kırıldı — üçü de o fallback'e bel bağlıyormuş.

## Kaldırmadan ÖNCE nasıl ölçülür (asıl tuzak burada)

**Varsayılan reporter, GEÇEN testlerin `console.log`/`console.warn` çıktısını göstermez.**
Fallback'in tetiklenip tetiklenmediğini grep'lemeye çalışırsan boş sonuç alırsın ve
"demek ki fallback'e düşülmüyor" diye YANLIŞ sonuca varırsın:

```bash
npx vitest run | grep "using the mock embedding"     # ← HİÇBİR ŞEY döndürmez (yanıltıcı)
npx vitest run <dosya> --reporter=verbose 2>&1 | grep -i "stderr\|mock embedding"   # ← doğru yol
```

## Doğru çözüm: sahteyi sağlayıcı sınırına taşı

Üretim kodundan uydurmayı sil, testi `embedText`'i stub'layarak besle — sahtelik **adıyla** dursun:

```ts
import { fakeEmbedding } from './helpers/fake-embedding';   // tests/helpers/fake-embedding.ts
const embedTextMock = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/llm', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/llm')>('../src/lib/llm');
  return { ...actual, embedText: embedTextMock };
});
beforeEach(() => embedTextMock.mockReset().mockImplementation(async (t: string) => fakeEmbedding(t)));
```

Bu vektör anlam taşımaz; onunla **alaka/sıralama** iddiası kurulamaz, yalnız tesisat (attribution,
satır sayısı, tenant kapsamı) doğrulanabilir.

İlgili: [[fabrika-verification-recipe-mutation-and-counterfactual]] ·
[[fabrika-fallback-catch-swallows-the-fix-you-just-made]] · [[fabrika-grep-hits-can-be-all-comments]]
