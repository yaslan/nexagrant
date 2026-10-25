# TASK-MVIB70K677R5M (FO-116): PR #147 yeniden inceleme (crw-fb, 2. tur)

**Hüküm: ONAY.** Bulgu 1 ve 2 kapandı, yeni regresyon bulunmadı, bloke eden bulgu yok. Bulgu 3 (fark payı için sayısal sınır testleri) bu PR'da ertelenebilir; ayrı ve küçük bir takip işi olarak açılması öneriliyor.

**İnceleyen:** CRW-FB · **PR:** #147 `be-fb/fo58-partner-search-dev` → `dev` · **Head:** `5c4a811c` · **Kapsam:** `match-pic.ts`, `match-pic.test.ts`, `docs/DATA_MODEL.md` ("PIC eşleme" maddesi). Migration, RLS ve schema bu turda yeniden doğrulanmadı; be-fb'nin ham kanıtı olduğu gibi bırakıldı.
**Platform:** mac (darwin). Kod saf TS; I/O, dosya yolu, süreç veya kabuk yok. Windows ve Linux'ta koşulmadı, platforma bağlı bir kod yolu da yok.
**Push / merge:** yapılmadı. Kod değiştirilmedi.

## Bulgu durumu

1. **Boş ad matchKey çakışması: KAPANDI.** `matchKeyFor` (`match-pic.ts:108-115`) PIC yoksa ve ham ad da boşsa (`''`, yalnız boşluk) `null` döner. `GmbH` gibi normalize olunca boşalan ama ham hali dolu adlar `name:DE:GMBH` anahtarını alır. Test: `gives no key to an organisation with neither a PIC nor a name` yeşil.
2. **Aday kapsamı belgesi (sözleşme): KAPANDI.** Modül docstring'i (`match-pic.ts:14-15`) adım 1'in ülkeden bağımsız, adım 2'nin yalnız aynı ülke olduğunu yazıyor. `DATA_MODEL.md:1013` aynı ayrımı içeriyor.
3. **Fark payı sayısal testleri: ERTELENDİ, kabul edilebilir.** Gerekçe aşağıda.

## Regresyon kontrolü

- **PIC önceliği:** `matchPic` (`match-pic.ts:151-153`) fuzzy dalını yalnız `!pic` iken çalıştırıyor. Bilinmeyen PIC → `unmatched` + `pic:<PIC>`, test yeşil.
- **Fark payı:** `DEFAULT_PIC_MATCH_MARGIN = 0.05`, `>=` ile kontrol ediliyor. Ölçüm: `UNIVERSIDAD POLITECNICA DE MADRID` ↔ {MADRID (1.0), MADRIX (0.97)} → `unmatched` (fark 0.03). Aynı organisationId iki satır rakip sayılmıyor (testte).
- **`tied` kaldırıldı:** kaynakta `tied` yok (grep: 0 eşleşme).
- **Token koruması:** `isSingleTypo` + `wordsCompatible` (`match-pic.ts`) çalışıyor; aşağıdaki prob tablosu bunu doğruluyor.
- **Boş ad:** `matchableName` boşsa raw fallback; `matchKeyFor` null dönüşü K2 için `UnmatchedOrganization` yazılmamasını gerektiriyor (DATA_MODEL'de yazılı).
- **Çağıran yok:** `src` ve `tests` içinde `matchPic` / `matchKeyFor` yalnız test dosyasından çağrılıyor; mevcut üretim yolu etkilenmiyor.

## Ham test çıktısı

Komut: `perl -e 'alarm 900;exec @ARGV' pnpm exec vitest run src/modules/m1/server/partner-search` (PR head `5c4a811c`'de, geçici worktree'de)

```
 RUN  v4.1.11 .../scratchpad/review-wt

 Test Files  1 passed (1)
      Tests  23 passed (23)
   Start at  18:01:50
   Duration  662ms (transform 108ms, setup 0ms, import 146ms, tests 16ms, environment 0ms)
```

## Prob tablosu (PR head, tek aday, aynı ülke)

Ham probe çıktısı `scratchpad/probe-out.txt` içinde. `bestScore`, reddedilen çiftlerde token kuralı yüzünden 0 raporlanıyor; ham Levenshtein oranı burada görünmüyor (kartta Pavia↔Padova için 0.906 ölçülmüş).

| Çift | Sonuç | bestScore |
|---|---|---|
| Pavia ↔ Padova (IT) | unmatched | 0 |
| Parma ↔ Pavia (IT) | unmatched | 0 |
| Surrey ↔ Sussex (GB) | unmatched | 0 |
| München ↔ Münster (DE) | unmatched | 0 |
| İTÜ ↔ İstanbul Ticaret (TR) | unmatched | 0 |
| Salamanca ↔ Salamanca (ES) | fuzzy | 1 |
| Orta Doğu Teknik Üniversitesi ↔ ORTA DOGU TEKNIK UNIVERSITESI (TR) | fuzzy | 1 |

Ek ölçümler:
- PIC `000000001` (CORDIS'te yok) + birebir ad → `unmatched`, `matchKey: pic:000000001`, `bestScore: 1` (bkz. N2).
- Ad `''` + PIC yok → `matchKey: null`. Ad `GmbH` → `name:DE:GMBH`.

## Bulgu 3'ün ertelenmesi: karar

Kabul edilebilir. Kuralın davranışı iki testle kapsanıyor: "a runner-up within the margin blocks the match" (MADRIX 0.97 yakın rakip → unmatched) ve "accepts a winner that is clearly ahead" (ayrık rakip → fuzzy). Eksik olan, kartın istediği sayısal sınır testleri: 0.95/0.93 → unmatched, 0.97/0.80 → fuzzy ve farkın tam 0.05 olduğu durumda kabul. Bu testler yoksa `>=` yerine `>` yazıldığında testler kırılmaz. Bu, bloke eden bir eksik değil; DoD'daki "Fark payı kuralı ve testleri yeşil" maddesi davranış düzeyinde karşılanıyor.

## Notlar (bloke etmeyen)

- **N1 (kart hatası):** Kart "Beklenen: yalnız son ikisi fuzzy" diyor, ama Salamanca ↔ Salamanca aynı ülkede birebir aynı ad ve tek aday; fuzzy 1.0 doğru davranış. Kartın beklenti satırı düzeltilmeli. Kodda değişiklik gerekmiyor.
- **N2 (K2 için):** PIC bilinmediğinde `bestScore`, ad benzerliğinin skorunu taşıyor (birebir ad için 1.0). K2 bunu bir güven ölçüsü gibi loglarsa yanıltır. K2 bağlanırken `bestScore`'un "PIC yokken en yakın ad" anlamında kullanıldığı yorum satırıyla yazılsın.
- **N3 (K2 entegrasyonu):** `matchKey` null olabilir; şemada `UnmatchedOrganization.matchKey` `@unique` ve null kabul etmez. K2 null anahtarda satır yazmamalı (DATA_MODEL'de yazılı, K2 kartında hatırlatılmalı).

## Ortam notu (dürüst beyan)

- Geçici worktree (`5c4a811c`, detached) açıldı ve `node_modules` ana ağaçtan symlink ile paylaşıldı. `pnpm exec` bu sırada bağımlılıkları yeniden bağladı (`+45 -30`). Ana ağacın `node_modules`'u bu yüzden değişmiş olabilir. Worktree kaldırıldı; ana ağaç dosyaları değiştirilmedi.
- Lint ve typecheck bu turda yeniden koşulmadı. be-fb 4. tur raporunda lint 0 hata (4 önceden var olan uyarı), `tsc --noEmit` çıkış 0.
