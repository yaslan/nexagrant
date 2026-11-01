# TASK-MVIB70K677R5M (FO-116) — Kod incelemesi: 37efa245 `fix(m1): tighten partner-search PIC fuzzy matching (FO-58 D1)`

**İnceleyen:** CRW-FB · **Dal:** `be-fb/fo58-partner-search-model` (worktree `.claude/worktrees/fo58-ps-model`, HEAD `37efa245`, üstünde `0a654b99`) · **Kapsam:** `match-pic.ts`, `match-pic.test.ts`, `docs/DATA_MODEL.md`
**Platform:** mac (darwin). Kod saf TS, I/O ve platforma bağlı yol yok; diğer platformlar için ek risk yok.
**Push / merge:** yapılmadı.

## Hüküm

**Düzeltme gerekli — bloke eden yok.** D1 ve Ö-1 kapanmış; token koruması ve fark payı beklenen davranışı veriyor. Kartın DoD'undaki "boş ad matchKey çakışması giderildi" maddesi tam kapanmadı (bulgu 1). Bu küçük bir düzeltme; K2 bağlanmadan önce yapılmalı.

## Ham test çıktısı

Komut: `perl -e 'alarm 900;exec @ARGV' pnpm exec vitest run src/modules/m1/server/partner-search`

```
 RUN  v4.1.11 /Users/macbook/alan/FONBRIDGE/.claude/worktrees/fo58-ps-model

 Test Files  1 passed (1)
      Tests  22 passed (22)
   Start at  23:21:45
   Duration  168ms (transform 33ms, setup 0ms, import 43ms, tests 6ms, environment 0ms)
```

Ek kontroller (çıkış kodları ayrı alındı):
- `pnpm exec eslint src/modules/m1/server/partner-search/match-pic.ts src/modules/m1/server/partner-search/match-pic.test.ts` → `ESLINT_EXIT=0`, çıktı boş
- `pnpm typecheck` → `TYPECHECK_EXIT=0`

## Prob tablosu (kendi probelarım, `tsx` ile, repo dışı scratchpad'de)

Kaynak: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/5b50bdf1-66ac-4e94-8cb0-69a438637ea0/scratchpad/probe-match-pic.ts`

| Çift (tek aday, aynı ülke) | Sonuç | Skor |
|---|---|---|
| Pavia ↔ Padova | unmatched | 0.000 |
| Parma ↔ Pavia | unmatched | 0.000 |
| Surrey ↔ Sussex | unmatched | 0.000 |
| München ↔ Münster | unmatched | 0.000 |
| İTÜ ↔ İstanbul Ticaret | unmatched | 0.000 |
| Salamanca ↔ Salamanca | fuzzy | 1.000 |
| Orta Doğu Teknik Üniversitesi (TR yazım) ↔ ORTA DOGU TEKNIK UNIVERSITESI | fuzzy | 1.000 |

Beklenen sonuç (yalnız son ikisi `fuzzy`) tutuyor.

Pozitifler (bozulmamış):
- `Madird` yazım hatası → fuzzy 0.939
- `Madrd` (silme) → fuzzy 0.970
- `MADIRD` (komşu harf değişimi) → fuzzy 0.939
- Türkçe/aksan (`UNIVERSITE BOGAZICI`) → fuzzy 1.000
- `GmbH` / `S.A.` / `Ltd` / `Limited` hukuki ek farkları → fuzzy 1.000
- `UNIVERSITI` ↔ `UNIVERSITY` (tek harf) → fuzzy 0.941

Bilinen kayıplar (muhafazakâr, bulgu değil, bilinçli takas):
- `DE LA` ↔ `DELA` → unmatched (kelime sayısı tutmuyor)
- Kelime sırası farklı (`Politecnica Universidad de Madrid`) → unmatched (skor 0.515)
- Kısa kelime yazımı (`DE` ↔ `DA`) → unmatched (4 harften kısa kelime birebir olmalı; tasarım böyle)

## Kontrol listesi

1. **D1 — kapandı.** Bilinmeyen PIC → `unmatched` + `pic:<PIC>`, isim düşüşü yok (`match-pic.ts:113-117` exact, `:143-144` yalnız `!pic` iken fuzzy). Probe: PIC `123456789` + birebir isim → `unmatched`, skor 1.000.
2. **Ö-1 — kapandı.** `tied` kaldırıldı; yerine `DEFAULT_PIC_MATCH_MARGIN = 0.05` (`:18`, `:141`). Dup + rakip senaryosunda (aynı `organisationId` iki satır + 0.97 rakip) marj doğru şekilde kırıyor.
3. **Token koruması — doğru.** `wordsCompatible` (`:90-97`) yalnız birebir-tek-yazım çiftlerini kabul ediyor; Pavia/Padova, Parma/Pavia, Surrey/Sussex red. Pozitif regresyon testleri geçiyor.
4. **Fark payı — doğru.** Runner-up izleme (`:123-137`) elle ve probe ile kontrol edildi (dup org'un kendi skoru rakip sayılmıyor; best değişince eski best rakibe geçiyor). Karşı örnek bulamadım.
5. **Saflık — tamam.** Tek import `normalizeOrgName` (saf fonksiyon); DB/I/O yok.
6. **DATA_MODEL — tutarlı.** "PIC eşleme" maddesi üç kuralı ve `MADIRD`/`PAVIA` örneklerini kodla aynı söylüyor; `tied` ifadesi kalkmış.

## Bulgular

**1. [düzeltme, DoD'u kapatmıyor] Boş ad anahtarı hâlâ çakışıyor — `match-pic.ts:104-105`**
- Senaryo: `matchKeyFor({ name: '', country: 'DE' })` ve `matchKeyFor({ name: '   ', country: 'DE' })` ikisi de `name:DE:` döner (probe: `COLLIDE`). İki ayrı, adsız kurum aynı `UnmatchedOrganization` satırına yazılır ve `resolvedPic` iki kuruma birden gider.
- Commit yalnız `GmbH` gibi "normalize boş ama ham dolu" adları düzeltti (`GMBH` anahtarı). Ö-3'ün asıl kapsamı ham adı da boş olanlar.
- Öneri: `matchKeyFor` içinde ham ad da boşsa anahtar üretme yerine açık bir sentinel kullan (ör. ad boşken `pic` de yoksa çağırana hata/`null` dön) ya da en azından `name:<ÜLKE>:` boşken `name:<ÜLKE>:<boş>` yerine ayrı bir önek. Seçimi test ile sabitle.
- Test eksikliği: `match-pic.test.ts:159-165` yalnız `GmbH` / `Ltd.` / `GMBH` kapsıyor; boş/boşluk adı yok.

**2. [öneri, doc] Aday listesi sözleşmesi — `match-pic.ts:12-13`, `:115`**
- Senaryo: K2 aday listesini "aynı ülke" ile yüklerse (yorum bunu öneriyor), PIC'i CORDIS'te başka ülkede kayıtlı bir kurum artık exact bulunamaz ve `unmatched` döner. Eski kod da fuzzy ile bulamıyordu, yani bu regresyon değil; ama PIC önceliği bunu kesinleştiriyor.
- Öneri: yorumda "step 1 tüm kurumlara karşı; step 2 yalnız aynı ülke" diye ayır.

**3. [test boşluğu] Kartın fark payı örnekleri birebir test edilmemiş — `match-pic.test.ts`**
- Kart: 0.95/0.93 → unmatched; 0.97/0.80 → fuzzy. Dosyada bu skor çiftleri yok (`:103-110` iki rakip, `:112-121` MADRIX ile tek ayrık rakip). Davranış doğru görünüyor, ama sayılarla sabitlenmemiş.

## Risk özeti

- Bloke eden: yok.
- Düzeltme (bulgu 1): boş-ad çakışması, DoD maddesi kapanmıyor.
- Öneri (bulgu 2, 3): doc sözleşmesi ve test sabitleme.

## Hafıza

Bu incelemeden kalıcı yeni bilgi yok (probe yöntemi repo dışında `tsx` ile yapıldı; genel bir tuzak değil). Hafızaya yazılmadı.
