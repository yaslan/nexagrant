---
name: fabrika-two-rag-files-src-lib-rag-vs-ai-rag
description: KAPANDI (d27d8f4) — src/lib/ai/rag.ts silindi, src/lib/ai/ dizini yok; tek arama fonksiyonu (retrieveChunks, withTenant içinde), tek chunker iki boyutla; kalıcı ders, fiyat ayrışması şüphesi ÇÜRÜMÜŞTÜ
metadata:
  type: project
  updatedAt: 2026-09-09
---

**DURUM: KAPANDI** — 2026-09-09, commit `45580ed` (birleştirilmiş `rag.ts`, kardeş kartın geniş
`git add`'i içine aldı) + `d27d8f4` (ikizin silinmesi + çağıranlar). `src/lib/ai/` dizini artık YOK.
Denetim raporu: `…-blok-zincir-denet-i.md` · uygulama raporu: `…-blok-zincir-denet-i-2.md`.

## Ne yapıldı (Seçenek A)
- `src/lib/ai/rag.ts` silindi; `processPdfAndStore` + `discardPartialDocument` `src/lib/rag.ts`'e taşındı.
- **`semanticSearch` taşınmadı, KALDIRILDI** — birleştirmeden sonra `retrieveChunks` ile aynı sorguydu.
  Depoda artık **tek** benzerlik araması var ve `withTenant` içinde: aşağıdaki (1) numaralı gizli RLS
  kırılması bu adımda kapandı.
- `processPdfAndStore` da `withTenant`'a alındı ama **tek uzun transaction'a değil** — her yazma kendi
  kısa transaction'ında, çünkü chunk başına bir sağlayıcı çağrısı Prisma'nın interactive-transaction
  timeout'unu tetikler. Bu, TASK-MTSZ0AL4QP2CT boşluğunu da kapatır.
- Chunk boyutu ikiliği **bilerek korundu** (CORDIS 1500, PDF 1000), ama tek `chunkText(text,size,overlap)`
  parametresi olarak. Tek boyuta inmek bir korpusu yeniden gömmeyi gerektirir — maliyet kararı, ayrı kart.
- Uydurma CORDIS fallback'i ve `mockEmbedding` gitti → [[fabrika-rag-fabricated-fallback-survived-the-sweep]].

## Aşağısı denetim turunun ölçümüdür (tarihsel, hâlâ doğru)

`src/lib/rag.ts` (280 satır) ve `src/lib/ai/rag.ts` (204 satır) — **ikisi de canlı, ölü kod YOK**:
- `src/lib/rag.ts` → `cordis-sync.ts:368`, `cordis-delta.ts:298` (`ingestDocument`),
  `admin/cordis/actions.ts:83-84`, `concept-notes/actions.ts:99` (`buildRagPrompt`, GERÇEK kiracı)
- `src/lib/ai/rag.ts` → `api/admin/documents/upload/route.ts:31` (`processPdfAndStore`, tenantId=null),
  `modules/m2/server/actions.ts:103` (`semanticSearch`, **GERÇEK kiracı**)

**ÇÜRÜTÜLEN kısım — `llm.ts` ikizine benzemiyor:** İkisi de `src/lib/llm.ts`'teki tek `embedText`
tıkacından geçiyor (`rag.ts:82`, `ai/rag.ts:106` ve `:164`), aynı model (`text-embedding-3-large`),
aynı 1536 boyut, aynı `module:'K6'`/`purpose` sabitleri, aynı `credits: 0` (`llm.ts:558`).
**Kredi/kullanım kaydı bakımından AYNI** — TASK-MTSXGXBCJ007W'deki "7 kat farklı fiyat" deseni
burada TEKRARLANMIYOR. Benzer dosya yolu deseni gördüğünde eski ikizin hata biçimini varsayma.

**DOĞRULANAN kısım — dizin gerçekten artık:**
`git show --name-status b6f1642` → `D src/lib/ai/llm.ts`, `rag.ts`'e DOKUNULMAMIŞ.
`src/lib/ai/` dizininde başka dosya yok; ikiz temizliği yarım kalmış.

**Gerçek ayrışma (birleştirme kartının asıl gerekçesi):**
1. `ai/rag.ts` **global `prisma`** kullanıyor (`:90,:117,:145,:176`), `rag.ts` **`withTenant`** (`:142,:207`).
   Bugün etkisiz (ana rol BYPASSRLS — [[fabrika-main-db-connection-bypasses-rls]]), ama ana bağlantı
   `fabrika_app`'e çevrilirse `semanticSearch(query, tenantId)` **hata vermeden** kiracının kendi
   belgelerini kaybeder (`rls.sql:43-45` politikası yalnız `tenantId IS NULL` satırlarını gösterir).
   `ai/rag.ts:60-63`'teki "known gap" yorumu yalnız `processPdfAndStore`'u kapsıyor, `semanticSearch`'ü DEĞİL.
2. `retrieveChunks` hata yolunda **uydurma CORDIS verisi** döndürüyor —
   [[fabrika-rag-fabricated-fallback-survived-the-sweep]].
3. Chunk boyutu **1500/200** (`rag.ts:23-24`) vs **1000/200** (`ai/rag.ts:81`) — aynı `Chunk` tablosuna.

**Ölçülen yan gerçek:** bugün hiçbir üretim yolu `Chunk.tenantId`'yi NULL dışında yazmıyor
(üç ingest çağıranının üçü de paylaşımlı korpusa yazıyor) — yani kiracı filtresi doğru ama
filtrelenecek kiracı verisi yok. [[a-conformance-check-cannot-see-absence]]

**Kalıcı ders:** Benzer yol deseni (`x.ts` + `ai/x.ts`) gördüğünde eski ikizin HATA BİÇİMİNİ
varsayma — burada "aynı işi iki farklı fiyatla yapıyor" şüphesi ÇÜRÜDÜ, gerçek gerekçe RLS bağlantı
ayrışması ve uydurma veriydi. [[a-a-twins-failure-mode-does-not-repeat]]

**Kapanışta ÖLÇÜLMEDEN kalan (bir sonraki tur):** `withTenant`'a alınan PDF yazma yolu **canlı
Postgres'e karşı hiç koşmadı** (o turda e2e/DB yasaktı) ve `SELECT count(*) FROM "Chunk" WHERE
"tenantId" IS NOT NULL` sayımı hâlâ yapılmadı — "bugün kiracıya-özel chunk yok" iddiası kod
okumasına dayanıyor. [[a-conformance-check-cannot-see-absence]]
