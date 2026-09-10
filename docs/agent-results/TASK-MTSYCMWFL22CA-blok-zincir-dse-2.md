# TASK-MTSYCMWFL22CA — ek kanıt: §5.1 karara bağlandı (TASK-MTVBN6YXERLHO)

**Ajan:** se-yuyt (CA-EN, Güvenlik Mühendisi) · **Tarih:** 2026-09-10 · **Branch:** `dev`
**Platform:** macOS (darwin 25.6.0). Platforma bağlı kod yolu yok — çıktılar `grep`/`git`/Postgres sorgusu.

## Bu dosya neden var

TASK-MTVBN6YXERLHO'nun görev metni, sonucun `TASK-MTSYCMWFL22CA-blok-zincir-dse.md`'ye
yazılmasını istiyordu. Ancak o dosya **aynı görevin kaynağı** (§5.1, §6) ve blok-zincir-dse'nin
`8ba1545` ile commit'lenmiş 400 satırlık raporu. Üzerine yazmak kanıt yok etmek olurdu.
Deponun kendi `pre-commit` hook'u da bunu bağımsız olarak reddetti ve `-<n>.md` sonekini
şart koştu — bu dosya o kuralın gereğidir. **Orijinal rapor değiştirilmedi** (400 satır, `git diff` boş).

**Asıl karar notu:** `docs/agent-results/TASK-MTVBN6YXERLHO-blockzincir-pm.md`
**Karar maddeleri:** `docs/ROADMAP.md` "Açık kararlar" **18, 19, 20**

## Ana raporu ilgilendiren iki ölçüm

**1. §5.1'in konusu olan üretim fallback'i kapandı — ama şema açığı sürüyor.**
`mockEmbedding` ve uydurma CORDIS sonuçları `45580ed` (TASK-MTUH5L8MJ6S8E) ile kaldırıldı;
`getEmbedding` (`src/lib/rag.ts:134-139`) bugün koşulsuz `embedText`'e gidiyor. Kalan açık
kodun değil **şemanın** eksiği: `Chunk`'ta köken alanı yok (`createdAt` bile yok), yani
fallback'ten önce yazılmış satırlar sorgu anında gerçek chunk'tan ayırt edilemiyor.

**2. Ana raporun DoD'undaki "Sonda satırları silindi" maddesi kendi kartı için doğru, ama
paylaşılan dev korpusu temiz değil.** 2026-09-10 ölçümü (`localhost/fabrika`, repodaki `pg`
sürücüsü):

```
Document satırı        : 109
Chunk satırı           : 10
Chunk.embedding IS NULL: 0
ÖZET → negatif bileşeni HİÇ olmayan (sahte imzası): 10 / 10
EK BULGU → hiç chunk'ı olmayan Document: 99
```

10/10 sentetik: gerçek bir OpenAI `text-embedding-3-*` vektöründe bileşen işaretleri
karışıktır, hiç negatif içermeyen bir satır provider'dan gelmiş olamaz. Bunların 3'ü tam
olarak eski `mockEmbedding` imzasını taşıyor (90 karakterlik metin → 1536 boyutun 1448'i
sıfır). Kaynağı bulundu:

```
$ grep -rn "policy document text for testing" . | grep -v node_modules
docs/agent-results/TASK-MTSWVADF7RQ1B-evidence/closing-verification.mts:49
```

Yani sonda temizliği kart-kart yapılıyor ve paylaşılan korpusta kalıntı birikiyor — bir
doğrulama script'i dev korpusuna 10 işaretsiz chunk bıraktı ve `formatRagPrompt`
(`src/lib/rag.ts:420`) bunları `[Source N | Score: %]` etiketiyle modele "kanıt" diye verir.

**Yanlış detektör uyarısı:** vektör normu ayırt edici DEĞİL — eski `mockEmbedding` çıktısını
kendisi normalize ediyordu (`git show 45580ed^:src/lib/rag.ts`, satır 100-102), norm ikisinde de 1.
Geçerli imza "negatif bileşen yok" + "boyutların çoğu sıfır".

**Üretim DB'si ölçülemedi** — bu makinede tanımlı tek `DATABASE_URL` `localhost`, `psql` kurulu
değil. "Muhtemelen yoktur" denmedi; çalıştırılabilir SQL reçetesi karar notu §K1'de.

## Değişen dosyalar

- `docs/agent-results/TASK-MTSYCMWFL22CA-blok-zincir-dse-2.md` — bu dosya (yeni)
- `TASK-MTSYCMWFL22CA-blok-zincir-dse.md` — **değiştirilmedi**

## Sonraki adım

Karar notundaki öneri: **K1=C** — `Chunk`'a köken sütunları (`embeddingModel`, `chunkSize`,
`source`, `createdAt`) + `retrieveChunks`'ta `source='test'` filtresi + dev korpusundaki 10
satırın silinmesi + üretimin §K1 SQL'iyle ölçülmesi. Kart taslağı hazır, **kart açılmadı**.
