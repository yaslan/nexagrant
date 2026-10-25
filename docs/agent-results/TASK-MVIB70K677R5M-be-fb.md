---
sözleşme: 3
görev: TASK-MVIB70K677R5M
kod: TASK-MVIB70K677R5M
ajan: be-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: matchPic'te bilinmeyen PIC artık unmatched (pic:<PIC>), kazanan fark payı 0.05 ve kelime-tipo koruması eklendi; commit 37efa245 yerel (push yok), lint ve typecheck temiz, partner-search 22/22 yeşil, tam suite'te 1 kırmızı (api-error-body-guard, bu değişiklikle ilgisiz).
platform: mac (darwin, bu makine) koşuldu. Saf TS: süreç, yol, ikili veya kısayol bağımlılığı yok; Windows ve Linux'ta aynı kod yolu çalışır (String.normalize + Levenshtein). Windows ve Linux koşulmadı: bu makinede yok.
sürüm: 1
tarih: 2026-10-21T20:15:27.667Z
---

# FO-116: match-pic bulanık eşleme sıkılaştırıldı (FO-58 D1)

## Ne yapıldı
- **PIC önceliği:** portal PIC'i gelmişse ve CORDIS'te yoksa bulanık eşlemeye düşülmez; `unmatched` + `pic:<PIC>` döner. `suggestedPic` eklenmedi (kart isteğe bağlı diyordu; K2 tarafı bekleyebilir).
- **Fark payı:** `DEFAULT_PIC_MATCH_MARGIN = 0.05`. Kazanan ile ikinci en iyi aday arasındaki fark bunun altındaysa `unmatched`. Aynı `organisationId` iki kez gelirse rakip sayılmaz. `tied` mantığı kaldırıldı; eşit iki aday fark 0 olduğu için zaten reddedilir.
- **Token koruması:** ortak olmayan kelimeler sırayla eşleşir ve her çift tek bir yazım hatası olmalı (4+ harf; ekleme, silme, yer değiştirme veya tek harf değişimi). `MADIRD`/`MADRID` kabul; `PAVIA`/`PADOVA` ve `SURREY`/`SUSSEX` red. Kısa kelimeler (`A`/`B`) yalnız tam eşleşir.
- **Boş ad:** ad normalize olunca boşsa (`GmbH`) `matchKeyFor` ham adı büyük harfle kullanır (`name:DE:GMBH`); `name:DE:` boş anahtarı üretilmez.
- **Testler:** "falls back to fuzzy when the PIC is unknown" → "does not fuzzy-match when the PIC is unknown to CORDIS" (değişti). Eklenenler: IT şehir isimleri, GB Surrey/Sussex, fark payı (0.970 vs 0.939 → unmatched), net kazanan, aynı organizasyonun iki satırı, boş ad anahtarı. Mevcut pozitif testler aynen geçti.
- **DATA_MODEL:** "PIC eşleme" maddesi üç yeni kuralla güncellendi.

## Kanıt (ham çıktı)
Commit: `37efa24565c45b441e27f966f7586ddae282f93d` (`be-fb/fo58-partner-search-model`, üstünde `0a654b99`). Push yok.

vitest (`perl -e 'alarm 900;exec @ARGV' pnpm exec vitest run src/modules/m1/server/partner-search`):
```
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

Tam suite (`pnpm test`): `Test Files 1 failed | 334 passed | 7 skipped (342)`, `Tests 1 failed | 4477 passed | 120 skipped (4598)`. Tek kırmızı:
```
FAIL  tests/api/api-error-body-guard.test.ts > server action error returns > no server action returns what it caught (beyond the known list)
AssertionError: expected { …(1) } to deeply equal {}
+ "src/app/[locale]/admin/interreg/actions.ts": ["line 20 ← src/lib/keep-eu-sync.ts#syncKeepEuData ← fetchKeepEuOpenData() (line 435)"]
```
Bu test `match-pic` dosyalarını içermez; değişmiş üç dosya dışında bir server-action sızıntı listesi. Base commit'te yeniden koşulmadı, yani "önceden kırmızı" hükmü analize dayanır, kanıtlı değildir.

`pnpm exec eslint` (iki dosya): çıkış 0. `pnpm typecheck` (`tsc --noEmit`): çıkış 0.

Prob tablosu (`tsx` ile, tek aday, aynı ülke; ham skor = eski `nameSimilarity`):

| Çift | Ham skor | Yeni sonuç |
|---|---|---|
| Pavia ↔ Padova (IT) | 0.906 | unmatched |
| Parma ↔ Pavia (IT) | 0.935 | unmatched |
| Surrey ↔ Sussex (GB) | 0.850 | unmatched |
| München ↔ Münster (DE) | 0.523 | unmatched |
| İTÜ ↔ İstanbul Ticaret (TR) | 0.793 | unmatched |
| Salamanca ↔ Salamanca (ES) | 1.000 | fuzzy (1.000) |
| ODTÜ (TR yazım) ↔ ORTA DOGU TEKNIK UNIVERSITESI (TR) | 1.000 | fuzzy (1.000) |

Beklenen: yalnız son ikisi `fuzzy`. Sonuç: aynen. Ham skorlar kartın ölçümleriyle eşleşiyor (0.906, 0.935).

## Değişen dosyalar
- `src/modules/m1/server/partner-search/match-pic.ts`
- `src/modules/m1/server/partner-search/match-pic.test.ts`
- `docs/DATA_MODEL.md`

## Riskler
- **Kelime sayısı eşit değilse reddedilir:** CORDIS adı ilanın adından bir kelime fazla ya da eksikse (ör. "ACME ROBOTICS" / "ACME ROBOTICS HOLDING") eşleşme düşer. Bu muhafazakâr bir tercih; yanlış bağlamaktan iyidir, ama gerçek eşleşmeleri kaçırabilir. Gerçek veride ölçülmedi.
- **Dolu PIC + eksik CORDIS kaydı:** artık her zaman unmatched. CORDIS'in PIC'i geç ekleniyorsa kayıt yeniden eşleştirilmeden kalır. Mevcut akış bunu zaten tek sefer yapıyor mu, bilmiyorum; K2 ingestor'ı bağlanınca kontrol edilmeli.
- **Kısa kelime istisnası:** 4 harften kısa kelimeler tipo sayılmaz (`A`/`B` tipo değil). Bu kasıtlı.

## Açık sorular
- Yok. `suggestedPic` (isteğe bağlı) eklenmedi; K2 ingestor'ı bağlanırken gerekirse eklenir.

## Sonraki adım
- K2 ingestor'ı `matchPic`'i bağlamadan önce bu commit'in ana dala alınması (kart bağımlılığı).
- Gerçek CORDIS verisinde unmatched oranını ölçmek (eksik-kelime riski için).

## Platform
mac (darwin) koşuldu. Windows ve Linux koşulmadı; kodda platforma bağlı yol yok.
