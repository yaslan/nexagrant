---
name: fabrika-fake-embedding-detector-norm-is-not-a-tell
description: Chunk'ta sahte gömme vektörünü ayırt etmenin doğru imzası "hiç negatif bileşen yok" — vektör NORMU ayırt etmez, eski mockEmbedding çıktısını kendisi normalize ediyordu
metadata:
  type: reference
  updatedAt: 2026-09-10
---

`Chunk.embedding` satırının gerçek OpenAI vektörü mü yoksa sahte mi olduğunu ölçerken
**norm testi kullanma — yanlış cevap verir.**

## Neden norm işe yaramaz

Kaldırılmış `mockEmbedding` (`git show 45580ed^:src/lib/rag.ts`, satır 95-103) çıktısını
**kendisi normalize ediyordu**:

```ts
const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
return vec.map(v => v / norm);
```

Yani sahte vektörün de normu 1. "norm ≠ 1 olanı sahte say" filtresi sahtelerin tamamını
**kaçırır**. Aynı aritmetik bugün `tests/helpers/fake-embedding.ts`'te yaşıyor, dolayısıyla
test fixture'ları da norm 1 üretir.

## Doğru imza

`(charCodeAt(i) % 100) / 100` asla negatif üretmez, ve metin uzunluğundan sonrası sıfır kalır:

1. **Birincil (tek başına yeter): hiç negatif bileşen yok.** Gerçek `text-embedding-3-*`
   vektöründe bileşen işaretleri karışıktır; negatifi sıfır olan bir satır sağlayıcıdan gelmiş olamaz.
2. **İkincil (eski `mockEmbedding`'i diğer sahtelerden ayırır): boyutların çoğu tam sıfır** —
   90 karakterlik metin için 1536 boyutun ~1448'i sıfır.

```sql
WITH v AS (
  SELECT c.id,
         (SELECT count(*) FROM unnest(c.embedding::real[]) x WHERE x < 0) AS neg,
         (SELECT count(*) FROM unnest(c.embedding::real[]) x WHERE x = 0) AS zero
  FROM "Chunk" c WHERE c.embedding IS NOT NULL
)
SELECT count(*) FILTER (WHERE neg = 0)                 AS sahte_kesin,
       count(*) FILTER (WHERE neg = 0 AND zero > 1000) AS eski_mockembedding,
       count(*)                                        AS toplam
FROM v;
```

Bu sorgu salt-okunur ve üretimde de çalıştırılabilir. `psql` kurulu değilse repodaki `pg`
sürücüsüyle Node'dan koş (`NODE_PATH=$(pwd)/node_modules node script.cjs`) — Prisma 7
istemcisi artık driver adapter istediği için `new PrismaClient()` tek başına bağlanmaz.

Ölçüm bağlamı ve karar: [[fabrika-dev-corpus-holds-unmarked-synthetic-chunks]],
[[fabrika-rag-fabricated-fallback-survived-the-sweep]].
