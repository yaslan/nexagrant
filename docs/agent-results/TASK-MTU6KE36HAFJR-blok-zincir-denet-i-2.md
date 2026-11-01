# TASK-MTU6KE36HAFJR — İki RAG yolu birleştirildi (Seçenek A uygulandı)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tip:** refactor + davranış kararı · **Tarih:** 2026-09-09
**Önceki tur:** `docs/agent-results/TASK-MTU6KE36HAFJR-blok-zincir-denet-i.md` (salt-okunur denetim). Bu dosya uygulama turudur.

**Platform beyanı:** macOS (Darwin 25.6.0, zsh). `pnpm typecheck` ve `npx vitest run` (tam paket) burada koşuldu ve yeşil.
Dokunulan kod yolunda **platforma bağlı hiçbir şey yok**: değişen dosyalar saf TypeScript/SQL — süreç öldürme, kabuk/ikili adı, dosya yolu ayracı, ekran/DPI ya da izin diyaloğu içermiyor. `pdf-parse` saf JS ve zaten mevcut bağımlılık. Windows ve Linux'ta **aynı sonucu verir**; farklı davranacak bir dal yok.
**Koşulamayan:** `pnpm test:e2e`, `pnpm gate` ve veritabanına dokunan hiçbir komut — **sebebi: çakışma kuralı** (bu turda TASK-MTUH7CF87SGRR kartıyla birlikte gelen ÇAKIŞMA KURALI bunları açıkça yasakladı). Dolayısıyla admin PDF yükleme akışının **gerçek tıklamayla e2e doğrulaması bu turda YAPILMADI** ve aşağıdaki karar bunu hesaba katıyor.

---

## 0. Tek cümle

`src/lib/ai/rag.ts` **silindi**, iki fonksiyonu `src/lib/rag.ts`'e taşındı, `src/lib/ai/` dizini **ortadan kalktı**; iki arama fonksiyonu **tek**e indi ve gizli RLS kırılması kapandı; uydurma CORDIS fallback'i üretim kodundan **kaldırıldı**. `pnpm typecheck` temiz, **1649 birim testi geçiyor, 0 kırmızı**.

---

## 1. Ne yapıldı

### 1.1 Patron kararları (bu turda soruldu, üçü de "önerilen" seçildi)

| Bulgu | Karar | Uygulama |
|---|---|---|
| BULGU-1 — `retrieveChunks` hata yolunda 3 sahte CORDIS projesi döndürüyor | **Tamamen silinsin** | fallback + onu gizleyen `catch` kaldırıldı; hata artık fırlıyor, boş korpus boş dizi |
| BULGU-3 — aynı `Chunk` tablosuna 1500 ve 1000'lik chunk'lar | **Her yol kendi boyutunu korusun** | tek `chunkText(text, size, overlap)`; CORDIS 1500, PDF 1000 — **yeniden ingest gerekmiyor** |
| BULGU-2 — `mockEmbedding` anahtarsız ortamda kalıcı satır yazıyor | **Ingest'te fırlatsın, aramada kalsın** | ⚠ **BU KARAR AŞILDI — §4'e bakın** |

### 1.2 Yapılan taşıma

- **`src/lib/ai/rag.ts` silindi** (`git rm`). Dizin boşaldığı için `src/lib/ai/` de yok oldu — TASK-MTSXGXBCJ007W temizliğinin yarım kalan yarısı kapandı.
- `processPdfAndStore` + `discardPartialDocument` → `src/lib/rag.ts`.
- **`semanticSearch` taşınmadı, KALDIRILDI.** Birleştirmeden sonra `retrieveChunks` ile aynı sorguyu yapıyordu (tek fark: skor sütunu adı `similarity` vs `score`). Tek çağıranı `src/modules/m2/server/actions.ts:103` artık `retrieveChunks(searchQuery, 3, tenantId, { userId })` çağırıyor. **Depoda tek bir benzerlik araması kaldı.**
- **Gizli RLS kırılması kapandı.** Eski `semanticSearch` gerçek bir `tenantId` alıyor ama global `prisma` üzerinden koşuyordu; ana bağlantı `fabrika_app` (NOBYPASSRLS) rolüne çevrildiği gün hata vermeden kiracının kendi belgelerini düşürecekti. Yeni yol `withTenant` içinde.
- **`processPdfAndStore` de `withTenant`'a alındı** — ama **tek uzun transaction'a DEĞİL**: her yazma kendi kısa transaction'ında. Eski dosyanın "uzun HTTP döngüsü Prisma interactive-transaction timeout'una takılır" gerekçesi korundu; kaybolan tek şey, o gerekçenin yan etkisi olarak `app.tenant_id`'nin hiç ayarlanmamasıydı. Bu, fonksiyonun yorumunda **TASK-MTSZ0AL4QP2CT** olarak taşıdığı bilinen boşluğu da kapatır.
- Tek chunker: `chunkText(text, size, overlap)`; `splitText` onun 1500/200 sarmalayıcısı. `overlap >= size` artık sonsuz döngü değil, açık hata.
- `pdf-parse` **modül tepesinden dinamik import'a** alındı: `src/lib/rag.ts` artık CORDIS senkron işlerinin ve concept-note action'larının da yolunda, hiçbiri PDF ayrıştırmıyor.

---

## 2. Kanıt (kopyalanmış çıktı — iddia değil)

Ölçüm anındaki dosya kimliği: `src/lib/rag.ts` **md5 `dbb496e077c57b602022e0b224971458`, 447 satır**.

```
=== SNAPSHOT 22:23:55 ===
src/lib/rag.ts md5: dbb496e077c57b602022e0b224971458  satır:      447
src/lib/ai dizini: YOK

$ pnpm typecheck
$ tsc --noEmit
        (hata yok)

$ npx vitest run  (tam paket)
 Test Files  137 passed | 2 skipped (139)
      Tests  1649 passed | 8 skipped (1657)
   Duration  6.58s
```

Etkilenen 7 dosyanın hedefli koşusu:
```
$ npx vitest run src/lib/rag.test.ts tests/rag-pdf-ingest-partial.test.ts \
    tests/rag-ingest-silent-failure.test.ts tests/cordis-rag.test.ts \
    tests/admin-upload-authz.test.ts src/modules/m2/server/actions.test.ts \
    src/lib/llm.embed.test.ts

 Test Files  7 passed (7)
      Tests  57 passed (57)
```

Birleştirmenin gerçekten olduğu:
```
$ ls src/lib/ai
ls: src/lib/ai: No such file or directory

$ git status --short -- src/lib/ai
D  src/lib/ai/rag.ts

# import/mock yolu olarak lib/ai/rag kaldi mi?
(hic import/mock yolu kalmadi)

# semanticSearch cagrisi kaldi mi?
(fonksiyon yok - tek arama yolu retrieveChunks)
```

Lint:
```
$ npx eslint src/lib/rag.ts src/modules/m2/server/actions.ts \
    src/app/api/admin/documents/upload/route.ts src/lib/llm.ts src/lib/env.ts
        (çıktı yok — temiz)
```

**Testler gevşetilmedi.** Değişen üç test çifti yalnız modül sınırına uyarlandı: `vi.mock` yolları (`@/lib/ai/rag` → `@/lib/rag`), `tests/rag-pdf-ingest-partial.test.ts`'in db sahtesine `withTenant` eklendi (`processPdfAndStore` artık ondan geçtiği için) ve llm sahtesi `importActual` ile genişletildi (`PLATFORM_SCOPE_TENANT_ID` gerektiği için). Hiçbir iddia zayıflatılmadı, hiçbir test silinmedi.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/ai/rag.ts` | **silindi** (dizin de kayboldu) |
| `src/lib/rag.ts` | birleştirme hedefi: `processPdfAndStore`, `discardPartialDocument` taşındı; tek `chunkText`; uydurma fallback kaldırıldı; `semanticSearch` `retrieveChunks`'a indirgendi |
| `src/modules/m2/server/actions.ts` | import + çağrı: `semanticSearch(q, tenantId, 3, …)` → `retrieveChunks(q, 3, tenantId, …)` |
| `src/app/api/admin/documents/upload/route.ts` | import yolu + eskiyen yorum |
| `src/modules/m2/server/actions.test.ts` | mock yolu ve sembolü |
| `tests/admin-upload-authz.test.ts` | mock yolu + eskiyen yorum |
| `tests/rag-pdf-ingest-partial.test.ts` | import yolu, db sahtesine `withTenant`, llm sahtesine `importActual` |
| `src/lib/llm.ts`, `src/lib/env.ts`, `src/lib/llm.embed.test.ts` | silinen dosyaya atıf yapan yorumlar |

`docs/agent-results/TASK-MTSYCMWFL22CA-probes/probe3-upload.ts` **bilerek değiştirilmedi**: tarihsel kanıt betiği, `tsconfig.json` `exclude`'unda, typecheck'e girmiyor.

---

## 4. ⚠ Patron kararının AŞILDIĞI tek nokta — okunması gereken

BULGU-2 için verdiğiniz karar **"ingest'te fırlatsın, aramada mockEmbedding kalsın"** idi. **Uygulanan davranış daha sert: `mockEmbedding` üretim kodundan tamamen kalktı, arama da anahtarsız ortamda fırlatıyor.**

Sebep, benim tercihim değil: ben çalışırken **kardeş bir kart (TASK-MTUH5L8MJ6S8E) aynı fonksiyonu paylaşılan ağaçta yeniden çiviledi** — `src/lib/rag.test.ts` ve `tests/cordis-rag.test.ts` güncellendi, sahte vektör `tests/helpers/fake-embedding.ts` altında **sağlayıcı sınırına** taşındı ve `tests/fabricated-fallbacks.test.ts`'e `expect(source).not.toContain('mockEmbedding')` koruması eklendi. Sizin kararınızı uygulasaydım o üç test dosyası kırmızıya düşerdi; kırmızıyı yeşile çevirmenin tek yolu kardeş kartın testlerini gevşetmek olurdu ki bu yasak.

Seçilen yol, kararınızın **ingest yarısını harfiyen** karşılıyor ve yalnız **arama** yarısında daha muhafazakâr. Etkisi: `OPENAI_API_KEY` tanımsız bir dev/demo ortamında RAG araması artık sessizce anlamsız sonuç dönmek yerine hata veriyor. **Bunu geri istiyorsanız tek satır** — söyleyin, `getEmbedding`'e `allowMockFallback` parametresini geri koyarım; ama o zaman TASK-MTUH5L8MJ6S8E ile birlikte karara bağlanması gerekir. **Not:** o kart bu arada `45580ed` ile commit'lendi, yani daha sert davranış artık ağaçta yerleşiktir; geri dönüş ayrı bir düzeltme kartı gerektirir.

---

## 5. Riskler

1. **PAYLAŞIMLI AĞAÇ OYNAK.** Bu tur boyunca `src/lib/rag.ts` iki kez altımdan değişti ve **ikisinin de sebebi sonradan açıklandı — hiçbiri hata değildi.** Kardeş kart TASK-MTUH5L8MJ6S8E aynı dosyada, aynı saatlerde çalışıyordu: (a) yazdığım birleştirmenin bir kez tamamen geri alınması, onların kendi işlerinden önce dosyayı temiz duruma çekmesiydi; (b) uydurma CORDIS fallback'inin birleştirilmiş dosyaya **yeniden enjekte edilmesi** ise bir regresyon değil, onların **mutasyon testiydi** — kusuru bilerek geri koyup korumanın gerçekten kırıldığını ölçüyorlardı (kendi hafıza kartlarında belgeli: "sahte kayıtları geri koymak 7 testi, `mockEmbedding`'i geri koymak 9 testi kırıyor"). **Bunu ilk yazdığımda regresyon sandım; yanlıştı ve düzeltiyorum.** Kalıcı ders yine de duruyor: paylaşımlı ağaçta yeşil bir koşu bir DOSYAYA değil, bir dosya DURUMUNA aittir — bu yüzden yukarıdaki yeşil md5 `dbb496e0…` ile çivilendi.
2. **Commit — ne olduğu (GÜNCELLENDİ).** Önce commit atmamaya karar vermiştim; **durum değişti ve atmak zorunlu hâle geldi.** Kardeş kartın commit'i `45580ed`, geniş bir `git add` ile **benim birleştirdiğim `src/lib/rag.ts`'i de içine aldı** (`fabrika-agents-share-one-working-tree` kartındaki paylaşımlı-indeks tuzağı). Sonuç: HEAD'de birleştirilmiş `rag.ts` (içinde `processPdfAndStore`) **ve** hâlâ silinmemiş `src/lib/ai/rag.ts` yan yana kaldı — yani bu kartın kapattığı yinelenme HEAD'de geri gelmişti. Tamamladım: **`d27d8f4`**, yalnız 10 yol, pathspec'li `git commit <yol…> -F -` biçimiyle (indeksin geri kalanına dokunmadan; pre-commit kapısı temiz geçti). `src/lib/llm.ts` **bilerek dışarıda bırakıldı** — içinde bana ait olmayan bir değişiklik var (`export const DEFAULT_MODELS`), onu kendi mesajımla yutmadım; oradaki tek değişikliğim bir yorum ve ağaçta bekliyor.
3. **Gerçek e2e doğrulaması yapılmadı.** Admin PDF yükleme akışı (`POST /api/admin/documents/upload`) bu turda **gerçek tıklamayla koşulmadı** — çakışma kuralı e2e ve DB'yi yasakladı. Birim seviyesinde dört senaryosu geçiyor (mutlu yol, metinsiz PDF, yarıda kalan gömme, temizlenemeyen yetim), ama `withTenant`'a alınan PDF yazma yolu **canlı Postgres'e karşı hiç koşmadı**. `processPdfAndStore` artık chunk başına kısa bir transaction açıyor; bu davranışın gerçek DB'de doğrulanması **kapı açıldığında yapılacak ilk iş olmalı**.
4. **Kiracıya-özel `Chunk` sayımı hâlâ ölçülmedi.** Önceki tur raporunun §9'unda açık bırakılan `SELECT count(*) FROM "Chunk" WHERE "tenantId" IS NOT NULL` yine koşulamadı (DB yasağı). Kod okumasına göre bugün hiçbir üretim yolu NULL dışında yazmıyor, ama bu **ölçülmüş değil, çıkarsanmış** bir iddiadır.
5. Chunk boyutu ikiliği (1500/1000) **bilinçli olarak duruyor**. Tek boyuta inmek bir korpusun yeniden gömülmesini gerektirir; bu bir maliyet kararı ve ayrı bir kart.

---

## 6. Açık sorular

1. §4 — arama yolunda mock fallback gerçekten gitsin mi, yoksa kararınıza dönülsün mü?
2. ~~§5.2 — commit kim tarafından alınacak?~~ **ÇÖZÜLDÜ:** `45580ed` (kardeş kart, `rag.ts`'i de aldı) + `d27d8f4` (bu kartın geri kalanı).
3. ~~§5.1 — uydurma fallback'i yeniden enjekte eden değişikliğin kaynağı belirlenmeli.~~ **ÇÖZÜLDÜ:** kaynak TASK-MTUH5L8MJ6S8E'nin mutasyon testiydi, regresyon değil.

## 7. Sonraki adım

Kapı (e2e/DB) açıldığında: `pnpm gate` + admin PDF yüklemenin gerçek tıklamayla doğrulanması + `Chunk` kiracı sayımı. Bunlar temiz gelene kadar bu iş **`review`'da tutulmalı, `done` işaretlenmemeli**.

---

**Karar: yayına uygunluk — KOŞULLU HAYIR.** Birim seviyesinde tam yeşil (1649/1649) ve typecheck temiz, ama `withTenant`'a alınan PDF yazma yolu canlı veritabanına karşı hiç koşmadı ve e2e kapısı bu turda yasaktı. **Kod birleşti ve doğrulanabilir durumda; "yayına uygun" demek için eksik olan tek şey gerçek DB/e2e koşusu.** Kanıtsız yeşil iddia etmemek için bunu açıkça yazıyorum.
