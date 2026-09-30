# TASK-MUOF809Z8YSVO — FB İNCELEME-113 (cs-fb): be-fb test borcunun hedef mutantları

**Ajan:** cs-fb · **Sprint:** FB-GAP-1 · **Sonuç:** 34 mutant gerçekten koşuldu. Güçlendirme öncesi 8'i SURVIVED kaldı; biri de flake yüzünden sahte KILLED göründü. Güçlendirmeden sonra **32 KILLED**, **2 kanıtlı eşdeğer**. Kapıların hepsi 0.
**Entegrasyona hazır:** `cs-fb/i113-test-debt` `cfedd305` (tek test commit'i; bu rapor ve ekleri dalda ayrı bir docs commit'inde). Entegratör: devop-fb. Dev'e merge ve push yapılmadı.

## 1. Ne yapıldı
- `dev` HEAD `d6d12b8d` üzerinde (a89fdef6 bunun atası) scratchpad'de ayrı bir worktree açtım, dal `cs-fb/i113-test-debt`. Ana checkout'ta çalışmadım, commit atmadım.
- İzole Postgres `csfb-i113-pg` (pgvector:pg16) 127.0.0.1:55136'da. Kurulum CI sırasıyla yapıldı: `db push` → `db:rls-role` → `apply-migrations.sh` ×2 (41/41, iki kez) → `db:rls` (28→112 politika) → `db:generate` → `db:seed` (`ekler/db-setup.log`). Worktree'de `.env` yok; ortamı yalnız kabuk verdi. Her koşuda `CI=true DATABASE_URL=…55136…` basıldı. Koşucu, URL'de 55136 yoksa ya da CI≠true ise koşmayı reddediyor. :5433'e hiç bağlanılmadı.
- Mutant koşucusu: `ekler/mut113.py`. Regex yerine **literal** değiştirme kullandı (be-fb'nin sed kaçış sorununu önlemek için). Desen dosyada tam 1 kez geçmezse N/A veriyor. Her mutantta ilgili test takımını koştu, sonra dosyanın bayt kopyasını geri yükledi. Her turdan sonra `git diff --quiet` kontrol edildi, 34/34'te `restored_clean=True`.
- SURVIVED kalan mutantlar için yalnız **yeni assertion ya da yeni test** eklendi. Hiçbir mevcut assertion gevşetilmedi, üretim kodu değişmedi.

## 2. Dev'deki durum tablosu (c1a249e9 = a89fdef6 içeriği, dev'de değişmemiş)
| Öneri | Dev'de | Hüküm |
|---|---|---|
| Ö-1 yarış testi `k1-embeddings-unlock.live`'a taşınmış mı | **Var** (`a row re-embedded between the listing and the clear…`) | Doğru hedef: profil LIKE ve Topic LIKE mutantlarını öldürüyor |
| Ö-2 uzun metinde 429 testi | **Var** (`el-16k`, `fetchMock` 1 kez) | Doğru hedef |
| Ö-3a `JSON.stringify` + warn/error | **Kısmen yanlış hedef**: `JSON.stringify` eklenmiş, ama warn/error yalnız **susturulmuş** ve sızıntı taramasına alınmamış. Warn/error'daki bir sızıntı artık görünmüyordu bile | Güçlendirildi |
| Ö-3b mock'ta e-posta/ad + sızıntı listesi | **Var** | Doğru hedef |
| Ö-3c reason ilk satır + 200 | **Kısmen yanlış hedef**: tek fixture 250×`x` + `\n…`. "İlk satır" ile "ilk 200 karakter" aynı sonucu veriyor, satır kesimi sabitlenmemiş | Güçlendirildi |
| Ö-4 LE fixture | **Var** (6, 7, 8, 10, 11, 12 bayt) | Doğru hedef |
| Ö-4 7 bayt | **Var** (LE listesinde) | Doğru hedef |
| Ö-4 count≠1 | **Yanlış hedef**: 12 baytlık tam girişle count=2/3/5 kullanılıyor. Orada count kontrolü ile `>= 10` aynı sonucu veriyor ve beklenen değer sabitlenmemiş | Güçlendirildi |
| Ö-5 rakam, `/`, noktalama | **Var** (`2030`, `///`, `!…`, `.hidden`) | Doğru hedef. be-fb'nin "slash SURVIVED" sonucu sed hatasıydı |
| Ö-6 silinmiş kiracı | **Var ama zararlı**: `unlockRejected`'i `topicIds` vermeden çağırıyor, bu yüzden DB'deki **bütün** `rejected:` Topic işaretlerini siliyor. Paralel koşan `k1-embeddings.live` dosyasını kırıyor (kanıt §3.3) | Düzeltildi (`topicIds: []`) |
| Ö-6 isMain | **Yok** | Eklendi |

**be-fb 3. teslim raporuyla ilgili not:** Özet "6 KILLED / 7 SURVIVED" diyor, tablosu ise 7 KILLED / 6 SURVIVED. "7. SURVIVED" diye bir satır yok. be-fb'nin 13 mutantının hepsini (JPEG-bound için iki varyant, MAX_DEPTH için 16 ve 33 ile) yeniden koştum. be-fb yalnız 2 test dosyası koşmuştu. `docx-safe-html.test.ts` ve `route.edge.test.ts` de dahil edilince MAX_IMAGE, MAX_TOTAL ve GIF-87a mutantları **zaten KILLED** çıktı. `O5-slashes-block` da KILLED; be-fb'deki SURVIVED sonucu sed kaçış hatasından geliyordu.

## 3. Kanıt
### 3.1 Baseline (değişiklik yok, CI=true, :55136)
```
BASE emb: rc=0 Tests  122 passed | 1 skipped (123)     # skip = REAL OpenAI testi (izinli)
BASE doc: rc=0 Tests  95 passed (95)
```
### 3.2 34 mutant: önce (dev testleri) → sonra (dal testleri)
Tam tablo: `ekler/once/mutants-before.csv`, `ekler/sonra/mutants-after.csv`. Mutant başına log: `ekler/{once,sonra}/logs/<id>.log`; her log başlığında `-`/`+` satırları ve `restored_clean` var.

| Mutant | Grup | Önce | Sonra | Öldüren test (sonra) |
|---|---|---|---|---|
| O1a-profile-LIKE | Ö-1 | KILLED | KILLED | yarış testi |
| O1b-topic-LIKE | Ö-1 | KILLED | KILLED | yarış testi |
| O2-429-prefix-retry | Ö-2 | KILLED | KILLED | 429 uzun metin |
| O3a-warn-inner-text | Ö-3a | **sahte KILLED** (§3.3) | KILLED | `--apply …` sızıntı taraması |
| O3a-error-inner-text | Ö-3a | **SURVIVED** | KILLED | `--apply …` sızıntı taraması |
| O3a-log-object-arg | Ö-3a | KILLED | KILLED | `--apply …` |
| O3b-log-user-email | Ö-3b | KILLED | KILLED | route "no sensitive data" |
| O3b-log-user-name | Ö-3b | KILLED | KILLED | aynı |
| O3c-reason-200-400 | Ö-3c | KILLED | KILLED | "capped at 200" |
| O3c-no-first-line-cut | Ö-3c | **SURVIVED** | KILLED | yeni "short first line…" |
| O4-LE-count-read-BE | Ö-4 | KILLED | KILLED | LE 8 bayt |
| O4-LE-u16-read-BE | Ö-4 | KILLED | KILLED | LE 6/7/8 |
| O4-count-ne1-check-removed | Ö-4 | **SURVIVED** | KILLED | yeni count≠1 kısa giriş (6 vaka) |
| O4-count-ne1-returns-false | Ö-4 | KILLED | KILLED | count≠1 |
| O4-7byte-entry | Ö-4 | KILLED | KILLED | LE 7 bayt |
| O5-digit-gate-letters-only | Ö-5 | KILLED | KILLED | `2030` |
| O5-slash-not-unsafe | Ö-5 | KILLED | KILLED | 4 test |
| O5-punct-start-fallback | Ö-5 | KILLED | KILLED | `!Important…` |
| O6-deleted-tenant-filter | Ö-6 | KILLED | KILLED | silinmiş kiracı |
| O6-isMain-always-true | Ö-6 | **SURVIVED** | KILLED | yeni isMain "imported…" |
| O6-isMain-always-false | Ö-6 | **SURVIVED** | KILLED | yeni isMain "run as tsx…" |
| B-O1-JPEG-not | be-fb | KILLED | KILLED | — |
| B-O1-PNG-header | be-fb | KILLED | KILLED | — |
| B-O2-JPEG-bound-removed | be-fb | SURVIVED | **EŞDEĞER** | §3.4 |
| B-O2-JPEG-bound-ge | be-fb | SURVIVED | **EŞDEĞER** | §3.4 |
| B-O4-LE-byteAlign | be-fb | KILLED | KILLED | — |
| B-O4-orientation-count | be-fb | KILLED | KILLED | — |
| B-O4-entry-bytes | be-fb | KILLED | KILLED | — |
| B-O3-MAX_IMAGE-halved | be-fb | KILLED (be-fb'de SURVIVED) | KILLED | route "B-1 K4" |
| B-O3-MAX_TOTAL-halved | be-fb | KILLED (be-fb'de SURVIVED) | KILLED | route "B-1 K4" |
| B-O6-MAX_DEPTH-16 | be-fb | **SURVIVED** | KILLED | yeni "exactly 32 levels" |
| B-O6-MAX_DEPTH-33 | be-fb | KILLED | KILLED | — |
| B-O5-MAX_NAME-60 | be-fb | KILLED | KILLED | — |
| B-O4-GIF-sig-no-87a | be-fb | KILLED (be-fb'de SURVIVED) | KILLED | "keeps … GIF87a" |

Sayım: önce 26 KILLED (biri sahte) / 8 SURVIVED. Sonra **32 KILLED / 2 SURVIVED = 2 kanıtlı eşdeğer**.

### 3.3 Ö-6 testinin yarattığı flake
`ekler/once/logs/O3a-warn-inner-text.log`: mutant, kendi testiyle değil başka bir dosyadaki testle "öldü":
```
FAIL  tests/k1-embeddings.live.test.ts > … refused rows (İNCELEME-55 B-1) > a new text lifts the mark…
-   "previouslyRejected": 2,      +   "previouslyRejected": 0,
```
Kök neden şu: `deleted tenants are not unlocked (Ö-6)` testi `unlockRejected({ tenantIds: […], apply: true })` çağırıyor. `topicIds` verilmediği için betik "her satırı al" moduna geçiyor (`UnlockScope` yorumu: *"Leave a list out to take every row"*). Paralel dosyanın `rejected:` işaretli Topic'leri siliniyor ve o dosyanın testi kırmızıya dönüyor. Bu zamanlamaya bağlı bir flake. Paylaşılan bir DB'de koşulursa oradaki bütün red işaretlerini de siler. Düzeltme: `topicIds: []` verildi, sonuca `topics: [], clearedTopics: 0` assertion'ı eklendi. Düzeltmeden sonra emb seti 3 kez üst üste yeşil (`ekler/sonra/emb-stability.txt`: 3× `124 passed | 1 skipped`), mutant turunda da çapraz dosya ölümü görülmedi.

### 3.4 JPEG sınırı eşdeğerlik kanıtı (B-O2)
`if (i > buffer.length || buffer[i] !== 0xff) return false;`: Buffer'da sınır dışı indeks `undefined` döndürür, `undefined !== 0xff` her zaman doğrudur. `i` bir `readUInt16BE` değeri olduğu için negatif olamaz. Bu yüzden `i > len`, `i >= len` ya da hiç sınır kontrolü olmaması, her girdi için aynı boolean değeri verir. Mantıksal olarak bir fark yaratamaz. Aynı sonucu ampirik olarak da doğruladım: orijinal ve iki mutant `safeInlineImageSrc` üzerinden diferansiyel fuzz ile koşuldu. Tohumlu PRNG kullanıldı; girdiler gerçek Exif JPEG'in her kesimi, 20k rastgele bayt değişikliği ve 20k rastgele marker yürüyüşüydü:
```
{"cases":40720,"keptByOriginal":18046,"differs_removed":0,"differs_ge":0}
```
(`ekler/sonra/jpeg-bound-equivalence-fuzz.log`; geçici `.mutfuzz/` klasörü silindi.) Test yazılamaz, çünkü sınır kontrolü gereksiz. Kodda sadeleştirme ayrı bir iş olur (§5).

### 3.5 Tam kapılar (dal, `CI=true`, `DATABASE_URL=…127.0.0.1:55136/fabrika`)
```
vitest exit=0   Test Files  303 passed | 2 skipped (305)   Tests  4041 passed | 51 skipped (4092)
live-skip-gate exit=0   (yalnız izinli skip'ler: evidence-upload-s3 ×4, REAL OpenAI ×1)
tsc exit=0 lines=0
lint exit=0
build exit=0   (/api/concept-notes/[id]/export route'u derlendi)
```
Ham çıktı: `ekler/sonra/{gates.txt,vitest-full.log,tsc.log,lint.log,build.log}`.

## 4. Değişen dosyalar (dal `cs-fb/i113-test-debt`, `cfedd305`; yalnız testler)
- `tests/k1-embeddings-unlock.live.test.ts`: warn/error spy'ları değişkene alındı, `printedOutput()` sızıntı taramasına log, warn ve error kanallarının üçünü birden alıyor. Ö-6 testi `topicIds: []` ile daraltıldı ve assertion'ı sıkılaştırıldı.
- `tests/k1-embeddings-unlock.ismain.test.ts` (yeni): DB mock'lu iki test. Betik import edilince hiçbir şey koşmamalı ve `$disconnect` çağrılmamalı; `tsx …` ile koşunca dry run yapıp bağlantıyı kapatmalı.
- `src/app/api/concept-notes/[id]/export/route.edge.test.ts`: kısa ilk satırlı hata testi eklendi. `failureError` artık `beforeEach`'te sıfırlanıyor (önceden assertion patlarsa sonraki teste sızıyordu).
- `src/lib/docx-safe-html.image-size.test.ts`: count∈{0,2} ile 8 ve 9 baytlık kesik girişler BE ve LE için eklendi (6 vaka). Her vakada `kept === library` ve `kept === true` sabitlendi.
- `src/lib/docx-safe-html.test.ts`: 32 seviye aynen korunuyor, 33. seviye metne düzleştiriliyor.

## 5. Riskler / açık sorular
- `jpegSizeable` içindeki `i > buffer.length ||` kontrolü gereksiz. Kaldırmak davranışı değiştirmez, ama bu bir üretim kodu değişikliği; kapsam dışı bıraktım. Karar be-fb'nin ya da sahibinin.
- be-fb'nin 3. teslim raporu (`8ad7b66c`) yalnız `be-fb/g1-pool-timeout` dalında, dev'de yok. Raporun özet satırı ile tablosu da çelişiyor (§2).
- Ö-6 flake'i dev'de hâlâ duruyor. Bu dal merge edilene kadar `k1-embeddings.live` ara sıra kırmızı dönebilir.

## 6. Sonraki adım
devop-fb `cs-fb/i113-test-debt` dalını dev'e alsın. Push yok.

## Temizlik
Konteyner `csfb-i113-pg` ve scratchpad worktree'si kaldırıldı; kanıtı aşağıda.

## Platform beyanı
**mac (darwin 27.0.0, Node 26, pnpm 11.25, Docker pgvector:pg16).** Windows ve Linux'ta koşulamadı, çünkü bu makinede yoklar. Değişen kod yalnız test kodu ve platforma bağlı değil: süreç öldürme, kabuk ya da dosya yolu ayrımı yok. `isMain` testi `process.argv[1]`'e POSIX biçimli bir yol veriyor. Betik yalnız `includes('k1-embeddings-unlock-rejected')` ile bakıyor, bu yüzden bir Windows yolunda (`C:\…\scripts\k1-embeddings-unlock-rejected.ts`) da aynı sonuç çıkar. CI (ubuntu-latest) aynı adımları koşuyor.
