# FO-363 — keep.eu RAG: kişi adı geçen 5 projenin gömmeden dışlanması

kart: TASK-MVZIT4NY39WD2 (FO-363) · ajan: be-fb · tip: feature · PR: draft, base `be-fb/fo360-keep-eu-skip-unchanged`
hüküm: Kısmen bitti — kod, testler, dışlama ve veritabanı kanıtı tamam; tam pre-push gate henüz koşmadı (ortak gate kilidi bekleniyor), push ve draft PR bu yüzden açılmadı.
platform: mac (Darwin 27.2, Docker Desktop, Node). Windows ve Linux koşulmadı: makinede yok. Dokunulan kod platforma bağlı değil (süreç öldürme, dosya yolu, kabuk yok).

## 1. Ne yapıldı

- **Dışlama listesi (kod sabiti):** `RAG_EXCLUDED_PROJECT_IDS` (`src/lib/keep-eu-sync.ts`), beş kimlik: BGTR0300118, BGTR0300121, BGTR0300153, BGTR0300155, BGTR0300162. Kişi adı yazılmadı.
- **Neden koşu parametresi değil, kod sabiti:** Parametre unutulursa dışlama sessizce kapanır. Sabit ile varsayılan "dışla" olur; unutmak dışlamayı kapatamaz. Testte boş dizi geçilerek atlanabilir.
- **Davranış:** Proje kaydı (`CordisProject`) yazılır; yalnız gömme adımı (`ingestDocument`) atlanır. Dışlanan proje `ragExcludedCount` ile sayılır.
- **Eksik kimlik:** Kimlik upstream veride yoksa `SystemAlert` (`keep-eu-sync:rag-exclusion-missing`) üretilir, koşu durmaz. `--limit` ile kesilen koşuda ve DB kaynağında uyarı üretilmez (eksiklik orada kanıt değildir). Upstream kesintisinde de uyarı üretilmez (düzeltme: `6fede6f1`).
- **Koşu özeti:** CLI `RAG excluded (names): N` satırını yazar; eksik kimlik varsa ayrıca uyarı satırı.
- **Tekrar tarama belgesi:** `docs/KEEP-EU-RAG-EXCLUSION.md` — dışlama, tarama yöntemi, önceden gömülmüş parça için salt-okunur sorgu.

## 2. Bağımlılık (FO-360)

FO-360 (`76bb8866`, PR #254) henüz `dev`'de değil; PR açık. Bu iş FO-360 dalının üstüne kuruldu. Draft PR'ın base'i FO-360 dalı olacak; FO-360 merge edilince base `dev`'e çevrilecek.

## 3. Kanıt

### 3.1 Birim testler (`tests/keep-eu-sync.test.ts`)

```
Tests  28 passed (28)          # son durum, düzeltme sonrası
```

Yeni 6 test: dışlanan proje kaydedilir ama gömülmez; varsayılan 285 içinden 280 gömülür; boş liste dışlamayı kapatır (yalnız test kaçış yolu); eksik kimlik uyarısı; limit kesintisinde uyarı yok; upstream kesintisinde uyarı yok.

**Kırmızı kontrolü (mutasyon):** `RAG_EXCLUDED_PROJECT_IDS` boşaltılınca 4 dışlama testi kırmızı düştü (`4 failed | 1 passed`). Upstream kesinti testi, düzeltme öncesi kodda kırmızıydı (`× an upstream outage does not raise the missing-id alert`).

### 3.2 Gerçek veritabanı (izole pgvector, port 55363, konteyner kaldırıldı)

Gerçek Prisma ve pgvector; şema `prisma migrate diff` ile kuruldu, ardından 61 migration dosyası uygulandı (`apply-migrations: 61 files applied as postgres`). Upstream keep.eu verisi çekilemedi (aşağı).

Koşu sonucu (sentetik kayıt, gerçek kişi verisi yok; yalnız beş gerçek kimlik):

```
syncedProjectsCount: 285   ragEmbeddedCount: 280   ragExcludedCount: 5
ragExclusionMissingCount: 0   skippedCount: 0   success: true   embedTextCalls: 280
```

SQL kontrolü (aynı DB):

```
excluded_id_chunks=0          # beş kimlikten hiçbiri gömülmedi
cordis_keepeu_rows: CordisProject toplam = 285  (anahtar biçimi KEU:BGTR03001xx)
INTERREG_PROJECT dokümanları = 1120 (dört koşu × 280; her koşuda 280)
```

Not: düzeltme (`6fede6f1`) öncesi kodla koştu. Düzeltme yalnız eksik-kimlik uyarı yolunu değiştirir; bu koşuda eksik kimlik 0'dı, sonuç etkilenmez.

### 3.3 Çalışma kontrolleri

```
pnpm typecheck      exit 0 (prisma generate sonrası; önce 685 hata vardı, prisma client üretilmemişti)
eslint (değişen 3 dosya)  exit 0
pnpm test (tüm suite)     29 dosya kırmızı — AYNI 29 dosya temel commit'te de kırmızı (önce/sonra karşılaştırıldı, fark yok). Keep-eu dosyası listede yok.
```

## 4. Upstream: koşulamadı

Canlı keep.eu verisi çekilemedi: `fetchKeepEuOpenData` → `ok=false error=missing_api_key`. Bu kabukta `KEEP_EU_API_KEY` yok. Ana repo `.env` dosyasını okumadım (erişim kuralı). Sonuç: 285 gerçek kaydın canlı koşusu yapılmadı; sayılar sentetik kayıtlarla kanıtlandı. Canlı koşu için anahtar gerekir.

## 5. Önceden gömülmüş parça (madde 4)

- Bu kodda beş kimlik için hiçbir zaman gömme yapılmadı; izole koşuda 0 chunk.
- Canlı üretim veritabanında gömme olup olmadığı **ölçülemedi**: FO-354 kaydına göre paylaşılan Supabase `CordisProject` tablosu boş; yerel `:5433` kapalı ve kullanılmadı.
- Kod, dışlanan projenin mevcut dokümanını **silmez**. Silme onaylı ayrı adımdır; sorgu ve gerekçe `docs/KEEP-EU-RAG-EXCLUSION.md` içinde.

## 6. Tarama betikleri (madde 5)

FO-359 betikleri repoda değil; FO-359 raporuna göre iş bitince silindi. **Repoya alınmadı:** betikler kişi verisi işler ve NER modeli indirir; kayıtlı yöntem belgede. Tam koşu öncesi tarama elle tekrarlanır.

## 7. Açık kalanlar

- Pre-push tam gate (`pnpm gate`) henüz koşmadı. Gate ortak kilitle sıraya girdi (diğer ajanların işleri öndeydi). Push, gate yeşil olunca yapılacak; sonra draft PR (base FO-360 dalı).
- Canlı upstream koşusu için `KEEP_EU_API_KEY` gerekir.
- Canlı veritabanında gömme varlığı ölçülmedi (bkz. §5).

## 8. Değişen dosyalar

- `src/lib/keep-eu-sync.ts` — sabit, seçenek, sayaçlar, eksik-kimlik uyarısı
- `tests/keep-eu-sync.test.ts` — 6 yeni test
- `scripts/run-keep-eu-sync.ts` — CLI özet satırları
- `docs/KEEP-EU-RAG-EXCLUSION.md` — yeni runbook
- `docs/agent-results/FO-363-be-fb.md` — bu rapor

Commit'ler (dal `be-fb/fo363-keep-eu-exclude-persons`, FO-360 üstünde): `2493b148`, `6fede6f1`.

## 9. Riskler

- Dışlama listesi elle doğrulandı; otomatik tarama 5 vakadan 3'ünü yakaladı (FO-359). Yeni vaka çıkarsa liste genişletilmeli.
- Önceden gömülmüş doküman varsa kalır (bkz. §5).

## 10. Sonraki adım

Gate yeşil → push → draft PR (base: FO-360 dalı, açıklamada bağımlılık yazılı) → FO-360 merge edilince base `dev`.
