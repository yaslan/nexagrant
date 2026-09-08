---
name: fabrika-two-rag-files-src-lib-rag-vs-ai-rag
description: İki ayrı RAG dosyası var — src/lib/rag.ts (concept-notes, admin/cordis) ve src/lib/ai/rag.ts (M2 server actions, admin/documents/upload) — llm.ts ikizi hikâyesine benzeyen henüz doğrulanmamış bir şüphe
metadata:
  type: project
  updatedAt: 2026-09-08
---

**Ölçüldü (2026-09-08, TASK-MTSWKDRJX456I sırasında, yan bulgu):** Repoda iki ayrı
RAG dosyası var, farklı çağıranlarla:

- `src/lib/rag.ts` → `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts`,
  `src/app/[locale]/admin/cordis/actions.ts`
- `src/lib/ai/rag.ts` → `src/app/api/admin/documents/upload/route.ts`,
  `src/modules/m2/server/actions.ts`, `src/lib/llm.embed.test.ts`

İkisi de muhtemelen `embedText()`/`retrieveChunks()` etrafında dönüyor (ikisi de
`src/lib/llm.ts`'teki tek `embedText` giriş noktasını kullanıyor olabilir — bu
DOĞRULANMADI, yalnız çağıran-dosya listesi çıkarıldı, içerik karşılaştırılmadı).

**Neden şüpheli:** CLAUDE.md kural 5'in anlattığı `src/lib/ai/llm.ts` ikizi hikâyesiyle
(TASK-MTSXGXBCJ007W — iki adaptör aynı çağrıyı 7 kat farklı fiyatlıyordu) aynı dosya
yolu deseni (`src/lib/ai/*` vs `src/lib/*`) tekrar ediyor. `src/lib/ai/` dizininin
kendisi hâlâ var olması, eski adaptörün tam temizlenmediğinin bir işareti olabilir.

**Bu kart bunu ÇÖZMEDİ** (doküman kartıydı, `src/`'a dokunma yasağı vardı) — yalnız
adıyla bildirildi. Bir sonraki dev/lead kartı şunu doğrulamalı: iki dosyanın içeriği
aynı mı / hangisi "canlı" mı / biri atıl mı, ve ATIL olan varsa CLAUDE.md kural 5'in
"ikinci adaptör dosyası açma" kuralına göre silinmeli.

İlgili: [[fabrika-m5-kpi-duplicate-implementations]] · [[fabrika-g0-scoring-three-implementations]]
(bu repoda tekrarlayan "aynı işi yapan iki dosya" deseni — üçüncü örnek olabilir, DOĞRULANMADAN önce).
