---
name: fabrika-dev-corpus-holds-unmarked-synthetic-chunks
description: Doğrulama script'leri gerçek dev DB'sine yazıyor ve işaretsiz Chunk bırakıyor — Chunk'ta köken sütunu olmadığı için bu satırlar retrieval'da gerçek korpustan ayırt edilemiyor
metadata:
  type: project
  updatedAt: 2026-09-10
---

Dev DB'sindeki (`localhost/fabrika`) RAG korpusu **temiz değil** ve temizliği kart-kart
yapıldığı için kalıntı birikiyor.

## Ölçüm (2026-09-10)

```
Document satırı        : 109
Chunk satırı           : 10
Chunk.embedding IS NULL: 0
negatif bileşeni HİÇ olmayan (sahte imzası): 10 / 10
hiç chunk'ı olmayan Document                : 99
```

**10 chunk'ın 10'u da sentetik.** 3'ü tam olarak eski `mockEmbedding` imzalı. Kaynağı:
`docs/agent-results/TASK-MTSWVADF7RQ1B-evidence/closing-verification.mts:49` — kapanış
doğrulaması için yazılmış bir script, gerçek dev DB'sine `POLICY_DOC` belgeleri yazmış ve
satırları bırakmış. İlgili kartın raporu DoD'unda "sonda satırları silindi" diyor ve **kendi
kartı için doğru**; sorun, paylaşılan korpusta başka koşumların kalıntısının kalması.

## Neden önemli

`Chunk` şemasında köken alanı **yok** — `id, documentId, tenantId, ordinal, text, embedding`,
`createdAt` bile yok. Yani bu satırlar `retrieveChunks` için gerçek chunk'lardan ayırt
edilemez ve `formatRagPrompt` (`src/lib/rag.ts:420`) onları `[Source N | Score: %]` etiketiyle
modele "kanıt" diye verir → CLAUDE.md kural 7.

Üretim fallback'i (`mockEmbedding`) `45580ed` ile kaldırıldı, ama **fallback'in kaldırılması
geçmiş satırları temizlemez** ve yeni script'lerin yazmasını da engellemez: kanıtı bu ölçümün
kendisi — fallback kaldırıldıktan sonra bile korpusta 10 işaretsiz satır var.

## Ne yapmalı

- Doğrulama/sonda script'i yazarken: kendi kiracını/belgeni kullan ve **koşum sonunda sil**;
  paylaşılan korpusa yazma.
- Bir RAG ölçümü yapmadan önce korpusun sentetik olup olmadığını ölç —
  [[fabrika-fake-embedding-detector-norm-is-not-a-tell]] (norm testi işe yaramaz).
- Şema kararı `docs/ROADMAP.md` "Açık kararlar" madde 18'de açık: `Chunk`'a
  `embeddingModel`/`chunkSize`/`source`/`createdAt` eklenecek mi. Karar notu:
  `docs/agent-results/TASK-MTVBN6YXERLHO-blockzincir-pm.md`.
- Üretim DB'si HENÜZ ÖLÇÜLMEDİ — bu makinede yalnız `localhost` `DATABASE_URL`'i var.
