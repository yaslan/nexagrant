# TASK-MUOEPL87MCXJH — fe-fb — FB MOBİL TAKİP, yeniden kanıt (2. teslim)

**Durum:** TAMAM. **Entegrasyona hazır: `fe-fb/muoepl-mobile` — kod `da9a90f8`; dal ucu = bu raporu ve eklerini ekleyen tek commit (`da9a90f8`'in çocuğu, `git log -1 fe-fb/muoepl-mobile`).** Push yok. Dev'e merge yok.

**Özet:** İlk teslim (de0dd66d) ölçülünce üç iddiası tutmadı ve düzeltildi:
1. **"96/96 korunur" yanlıştı.** de0dd66d, kartı `lg:flex-row`'a çevirmiş ama metin bloğunun `md:w-auto`'sunu bırakmıştı. Sonuç: 768'de `<main>` +359 taşıyor (kelime) ve +159 (Türkçe). Ölçülen matris 92/96. Düzeltmeden sonra **96/96**.
2. **B-1 fixture'ı hiç satır ekleyemiyordu.** Reddedilen talebe `requesterId` olarak e-posta verilmişti, bu yüzden `plant()` `ApprovalRequest_requesterId_fkey` hatasıyla düşüyordu. `beforeAll` patlayınca bekçinin 12 testi de koşmuyordu. Commit mesajındaki "passes 12 scenarios" ölçülmemişti.
3. **Yeni gerçek bulgu (dev'de de var).** Adı olmayan talep edenin **tiresiz** e-postası 320'de `<main>`'i **+321** taşırıyor. Talep eden `<span>`'ı bir flex öğesi ve `min-width:auto`. İNCELEME-109'daki e-posta tireli olduğu için bu görünmemişti. Düzeltmeyi yeni fixture'ın bekçisi buldu.

**K3 hükmü (tek ve net):** **KILLED.** İki bağımsız yoldan da ölüyor: e-posta (K3) ve yalnız red gerekçesi (K3b).

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı: Darwin 27, gerçek Google Chrome (`channel:'chrome'`, headless). Değişiklik yalnız Tailwind sınıfları ve e2e fixture/spec. Süreç, dosya yolu, kabuk, DPI ya da izin kullanan kod yolu yok.
- **Windows ve Linux: koşulamadı**, bu makinede yoklar. Koda göre davranış farkı beklemiyorum: `min-width:0`, `overflow-wrap:break-word` ve media query bütün motorlarda standart.
- Kelime bölünmesinin olduğu genişlik aralığı (Y-2) yazı tipi metriğine bağlı. Bu yüzden başka bir sistemde birkaç px kayabilir.
- Firefox ve Safari koşulmadı.

## Ortam

| | |
|---|---|
| ÖNCE | detached worktree `wtonce` = dev `3dfa77c1`. Bu, görev sırasındaki güncel dev. `git diff e860b035 3dfa77c1 -- src/app` boş, yani ÖNCE = düzeltmesiz UI. |
| de0dd66d | `wtmob` ilk hâli: ilk teslimin kendisi, ayrıca ölçüldü |
| SONRA | `wtmob` = `fe-fb/muoepl-mobile`. Ölçüm ve mutantlar `60d6300c`'de koşuldu. Kapılar güncel dev merge'ünden sonra `da9a90f8`'de. `git diff 60d6300c da9a90f8 -- <UI dosyaları, spec, fixture>` boş (`kapilar.txt` öncesi kontrol). `git diff --stat dev da9a90f8` yalnız 4 dosya: approvals/client.tsx, pipeline/[id]/client.tsx, fixture, spec. |
| DB | İzole `fefb-mob-pg` (pgvector pg16), 127.0.0.1:55118. CI sırası: db push → rls-role → apply-migrations ×2 (41/41) → rls → seed (`db-hazirlik.log`). Merge'den sonra DB silinip sıfırdan aynı sırayla kuruldu. Her koşudan önce echo: `DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55118/fabrika`. İki `.env`'de `5433` sayısı 0. |
| Sunucular | `next build` + `next start`: SONRA :3181, ÖNCE :3182 (`DEMO_LOGIN_ENABLED=false`, çerezle oturum). Spec ve mutantlar: `next dev` :3183 (`DEMO_LOGIN_ENABLED=true`, e2e test anahtarı). |
| Koşucu | Playwright CLI'si kill-guard R8 ile engelli. Spec, se-fb'nin shim koşucusuyla koşuldu: kaynak olduğu gibi yükleniyor, `expect` gerçek kütüphanenin (`betikler/specrun.mts.txt`, `pw-shim.mts.txt`). |

## 1. Ne yapıldı

1. İNCELEME-109 ölçüm betiğini (`measure.mts`) üç ağaçta koştum: ÖNCE, de0dd66d ve SONRA.
   - Betiğe **arşiv bandının kendi taşmasını** ekledim: bant `scrollWidth−clientWidth` ve metnin bandın iç kenarını aşması. Gerekçe: İNCELEME-109, 390'da `<main>` eşitken metnin amber kutudan taştığını görmüştü.
   - Beşinci bir varyant ekledim: `eposta2`, tiresiz e-posta.
2. **Kod düzeltmeleri** (dalda, 2 commit):
   - `319c387c`: approvals metin bloğu `md:w-auto`→`lg:w-auto`, aksiyon çubuğu `md:self-center`→`lg:self-center`. Arşiv bandı `span`'ı tırnak stiline uyduruldu ve gerekçe yorumu eklendi.
   - Aynı commit'te B-1 fixture'ı baştan yazıldı:
     - Adı olmayan talep eden id ile yaratılıyor, e-postası tiresiz ve kırılma fırsatı yok.
     - Reddedilen talep adminin kendi talebi, bu yüzden "Taleplerim"de gerekçesiyle görünüyor. Gerekçe = alt çizgili, boşluksuz kelime.
     - Fırsat başlığına da aynı kelime eklendi. URL `/` ve `-` işaretlerinde kırıldığı için arşiv bandını tek başına taşırmıyordu.
     - `remove()` kullanıcıyı da siliyor (`requireId`). `PLANTED_ROWS = 5`.
   - Spec:
     - e-posta ve red gerekçesi ekranda olmalı.
     - Detay modalı `.first()` ile değil, bekleyen talebin kendi kartından açılıyor (İNCELEME-109 O-2).
     - Fırsat testi "Arşivle"yi gerçek tıklamayla açıp her genişlikte `<main>`'i ve bandın kendisini ölçüyor.
   - `60d6300c`: approvals talep eden `<span>` → `min-w-0`, e-posta bulgusu.
   - `da9a90f8`: güncel dev **dalıma** merge edildi. Çakışma yok. Amaç kapıların güncel tabanda koşması.
3. Mutantlar: uygula → 20 sn HMR → spec → geri al. Son adımda `git diff --quiet`.
4. Kapılar: lint, tsc, i18n, tam vitest (CI eşdeğeri), live-skip bekçisi, `next build`.

## 2. Kanıt

Ekler: `docs/agent-results/TASK-MUOEPL87MCXJH-fe-fb-2-ekler/`

### 2a. Y-1: arşiv onayı bandı, 320–1280 (`y1-arsiv-bandi-tablo.txt`)

Hücre = `<main>` taşması / bandın kendi `sw−cw` değeri (px):

```
varyant      |   320    |   360    |   390    |   472    |   640    |   768    |  1024    | 1280
ÖNCE url     |  +53/81  |  +13/41  |   +0/11  |   +0/0   |   +0/0   |   +0/13  |   +0/0   | +0/0
ÖNCE kelime  | +387/415 | +347/375 | +317/345 | +235/263 | +105/171 | +257/347 |   +1/91  | +0/0
ÖNCE eposta  |   +0/14  |   +0/0   |   +0/0   |   +0/0   |   +0/0   |   +0/0   |   +0/0   | +0/0
ÖNCE turkce  | +232/260 | +192/220 | +162/190 |  +80/108 |   +0/16  | +102/192 |   +0/0   | +0/0
ÖNCE eposta2 | +444/472 | +404/432 | +374/402 | +292/320 | +162/228 | +314/404 |  +58/148 | +0/0
SONRA (5 varyantın hepsi, 40 ölçüm)                                                   0/0 her hücre
```

- **ÖNCE +387 → SONRA 0** (kelime, 320). Arşiv bandı temiz ölçüm sayısı: ÖNCE 14/32 → SONRA **32/32**, eposta2 ile birlikte 1/8 → 8/8.
- Kare: `kareler/montaj-kelime-firsat-arsiv-onay-320-once-sonra.png`. ÖNCE'de başlık bandın sağından dışarı çıkıyor. SONRA'da bandın içinde kırılıyor.

### 2b. Y-2: 768 ve 768–1023'te kelime ortası bölünme (`y2-kelime-bolunmesi.log`)

Veri: gerçekçi kısa metinli kart, "WP3 bütçe revizyonu onayı" ve 2 satır açıklama (`pxdata.mts`). Her kelime için `Range.getClientRects()` ile birden fazla satır top'u var mı diye bakıldı.

```
once  768 metin=79  aksiyon=295 bölünen=[revizyonu,konsorsiyum]
once  776…1280  bölünen=[]
sonra 768 metin=390 aksiyon=295 bölünen=[]
sonra 776 / 784 / 792 / 800 / 850 / 900 / 950 / 1000 / 1023  metin=398…645  bölünen=[]
sonra 1024 metin=335 / 1280 metin=591  bölünen=[]   (lg satırı, ÖNCE ile aynı)
TOPLAM bölünen kelime (768–1280, 12 genişlik): {"once":2,"sonra":0}
```

- 768–1023'te kart artık sütun düzeninde. Metin 79 px'ten 390 px'e çıktı, düğmeler altta sağa hizalı.
- Kare: `kareler/montaj-Y2-768-approvals-once-sonra.png`.

**Piksel regresyonu** (`px-diff.txt`, 6 ekran × 768/1024/1280):
- 1024 ve 1280'de 12/12 ekran `maxdelta=0`.
- 768'de fırsat ekranları 0. Fark yalnız approvals ekranlarında (approvals, onay-merkezi, taleplerim; modalın bulanık arka planı). Bu, amaçlanan sütun düzeni.

### 2c. 4 × 8 uzun veri matrisi (`matris-ozet.txt`, `olcum-*.log`)

Kapsam: onayımı-bekleyen, taleplerim ve fırsat-detay; 4 varyant × 8 genişlik = 96 ölçüm. Temiz ölçümün koşulları:
- `main.sw == cw`
- `doc == innerWidth`
- `main.ox=auto`, yani taşma gizlenmemiş.
- metin görünür: ellipsis yok, kırpan ata yok.

| ağaç | liste + detay | arşiv bandı | detay modalı 320 |
|---|---|---|---|
| ÖNCE dev 3dfa77c1 | 96/96 | 14/32 | 4/4 OK |
| **de0dd66d (ilk teslim)** | **92/96**: kelime ve Türkçe, 768'de onayımı-bekleyen ve taleplerim +359 / +159 | 32/32 | 4/4 OK |
| **SONRA 60d6300c** | **96/96** | **32/32** | 4/4 OK, × kapandı=true |
| ÖNCE, eposta2 | 18/24 (onayımı-bekleyen 320–768: +321…+39, 768'de +167) | 1/8 | OK |
| SONRA, eposta2 | 24/24 | 8/8 | OK |

de0dd66d'nin 768 hatası:

```
sonra0 kelime onayimi-bekleyen 768 main 871/512 TAŞMA +359 metin=h3 right=1127>768  <- div.space-y-2 w-full md:w-auto flex-1 min-w-0 break-wo +359
```

Neden: sütunda `items-start` ve `w-auto` birlikte, blok en uzun kelimesi kadar genişliyor. İNCELEME-109'da `w-full md:w-auto` çiftinin gerekçesi zaten buydu. Satır `lg`'ye taşınınca `md:w-auto` da taşınmalıydı.

Kareler: `kareler/montaj-{url,kelime,eposta,turkce,eposta2}-{onayimi-bekleyen,taleplerim,firsat-detay,firsat-arsiv-onay}-{320,390}-once-sonra.png` (40 montaj).

### 2d. B-1 fixture'ı: de0dd66d gerçekten satır ekliyor muydu? (`de0dd66d-fixture-plant.log`)

de0dd66d'deki fixture dosyasını aynen yükleyip `plant()`'i koştum:

```
plant: HATA -> Foreign key constraint violated on the constraint: `ApprovalRequest_requesterId_fkey`
temizlik: approval=0 opp=1 user=1
```

Yani ilk teslimde bekçinin `beforeAll`'u düşüyordu ve 12 testin hiçbiri koşmuyordu. Ayrıca `afterAll` hâlâ `toBe(3)` bekliyordu, oysa 4 satır ve 1 kullanıcı ekleniyordu.

Yeni fixture ile temel koşu, `da9a90f8`'de (`specrun-temel.log`): **12 passed, 0 failed, 0 skipped**. Koşudan sonra DB'de `mobile-long-%` ve `fefbmob-%` satırı approval 0 / opp 0 / user 0 (`db-temizlik-spec-sonrasi.log`).

### 2e. Mutantlar (`mutants.log`, `mutants-K3b.log`, `mutant-loglari/mut-*.log` + `.diff`)

Temel koşu 12/0. Her mutant tek değişiklik, `60d6300c` üzerinde.

| # | Mutant | Bekçi | Öldüren adım |
|---|---|---|---|
| M1 | fırsat başlığı `min-w-0` sil | **KILLED** | opportunity detail 640px `<main>` |
| M2 | gates iki `min-w-0` sil | **KILLED** | gate settings 320px |
| M7 | fırsat satırı `sm:flex-wrap` sil | **KILLED** | actions at 640px below the title |
| M12 | cordis `onFocus` scrollIntoView sil | **KILLED** | cordis tab 2 fully inside the strip |
| **K3** | `break-words` bloktan alınıp yalnız h3+p'ye | **KILLED** (3 test) | approvals / actionable 320 (e-posta), /approvals, /onay-merkezi 320 |
| **K3b** | K3 + e-posta span'ına `break-words` geri: **yalnız red gerekçesi** korumasız | **KILLED** | **approvals / my requests 320** |
| **Y1** (yeni) | arşiv bandı başlık `span`'ının `min-w-0`'ını sil | **KILLED** | **opportunity archive confirmation at 320px** |
| E1 (yeni) | talep eden `span`'ın `min-w-0`'ını sil | **KILLED** (4 test) | approvals 320 (×3) |
| Y2w (yeni) | `lg:w-auto` → `md:w-auto` (de0dd66d hâli) | **KILLED** | approvals / actionable **768** |
| Y2md | kart, blok ve çubuk `lg:` → `md:` (dev hâli) | hayatta | Beklenen, bkz. §4 |

- Son satır: `git diff --quiet: TEMİZ (rc=0)`, iki koşuda da.
- E1 koşusunda cordis testi bir kez "must render → 200" ile düştü. Bu, `next dev`'in mutant sonrası yeniden derlemesi. E1 zaten üç approvals testiyle ölmüştü, o düşüşe güvenmiyorum.

**K3 hükmü: KILLED.** İlk rapordaki "yakalanır" ve "hayatta mı? Evet" çelişkisi burada kapanıyor. Ölüm sebebi iki ayrı yoldan ölçüldü:
- K3 → e-posta satırı taşıyor.
- K3b → e-posta korunsa bile red gerekçesi Taleplerim'de taşıyor.

### 2f. Kapılar (`kapilar.txt`, HEAD `da9a90f8`, izole DB)

```
lint exit=0     tsc exit=0     i18n exit=0 ("both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text")
vitest(CI=true) exit=0 — Test Files 302 passed | 2 skipped (304) · Tests 4031 passed | 51 skipped (4082)
live-skip gate exit=0 (yalnız izinli k1-embeddings REAL OpenAI)
next build exit=0
```

- `CI` ayarsız ilk koşu: 3966 passed, 0 failed, live-skip exit 1. Tek atlanan `topic-match-nightly.live`. Bu test, DB adı `fabrika` ve `CI` ayarsızken paylaşılan DB'yi korumak için kendini atlıyor (`tests/topic-match-nightly.live.test.ts:59`). DB izole olduğu için `CI=true` ile yeniden koştum; CI'daki koşu budur. İki çıktı da `kapilar.txt`'te.
- 4031/0, devop-fb'nin dev için bildirdiği sayıyla aynı.

## 3. Değişen dosyalar (dal `fe-fb/muoepl-mobile`, de0dd66d'nin üstüne)

- `src/app/[locale]/(app)/[workspace]/approvals/client.tsx`:
  - blok `lg:w-auto`, çubuk `lg:self-center`
  - talep eden `span.min-w-0`
  - yorumlar
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx`: arşiv bandı `span` tırnak stili ve yorum. `min-w-0 break-words` de0dd66d'den geliyor.
- `tests/e2e/fixtures/mobile-long-content.ts`:
  - `LONG_WORD`, id ile yaratılan talep eden ve tiresiz e-posta
  - reddedilen talep adminin
  - `remove()` kullanıcıyı da siliyor
  - `PLANTED_ROWS`
- `tests/e2e/mobile-main-overflow.spec.ts`: e-posta ve gerekçe görünürlüğü, kartına göre modal, arşiv bandı adımı.
- `docs/agent-results/TASK-MUOEPL87MCXJH-fe-fb-2.md` ve `-ekler/`: loglar, `betikler/*.txt`, 42 montaj karesi, 768 piksel kareleri, `mutant-loglari/`.

Ana checkout'a commit yok. Ana checkout'taki `TASK-MUOEPL87MCXJH-fe-fb.md`'ye dokunulmadı. Ana checkout'a yalnız bu raporun **birebir kopyası** untracked olarak kondu, çünkü görev bu yolu istiyor. Aynı dosya dalda da commit'li. devop-fb'nin §9 prosedürü (`git checkout dev -- <yeni yollar>`) bu dosyayı sorunsuz üzerine yazar.

## 4. Riskler

- **Y2md hayatta:** bekçi `<main>` taşmasını ölçer, kelime bölünmesini ölçmez. Kart `md:flex-row`'a geri dönerse Y-2 geri gelir ve spec yeşil kalır. Bugün bunu yalnız bu rapordaki ölçüm yakalıyor (`words.mts`).
- Spec gerçek Playwright koşucusunda değil, shim ile koşuldu (R8). Koşucuya özgü farklar yalnız CI'da görünür.
- 768–1023 arası artık sütun düzeninde. Bu, tablet dikey ve küçük yatay pencerelerde kartı uzatır. Görsel olarak `montaj-Y2-768-*` karelerinde kontrol edildi.

## 5. Açık sorular

- Y-2 için bekçiye bir "768'de gerçekçi kısa metin bölünmesin" testi eklensin mi? Bunun için fixture'a kısa metinli bir satır ve spec'e `Range` ölçümü gerekir, ayrı küçük bir kart olur. Önerim evet: Y2md'yi öldürür.
- Detay modalında × düğmesinin `aria-label`'ı yok, modal Escape ile kapanmıyor ve odak tuzağı yok. İNCELEME-109'dan beri açık, bu kartın kapsamı dışında.

## 6. Sonraki adım

- devop-fb: `fe-fb/muoepl-mobile`'ı dev'e alabilir. Dal `d6d12b8d`'ye kadar dev'i içeriyor. Rapor yazılırken dev `bbababe7`'ye ilerledi (migration işi). `git merge-tree dev dal` çakışmasız, `dev...dal` farkı yalnız 4 kod/test dosyası artı bu rapor.
- Push'tan sonra CI e2e'de `mobile-main-overflow.spec.ts`'nin gerçek koşucudaki ilk koşusuna bak (12 test).

## Temizlik

- Kendi sunucularım (:3181/:3182/:3183) kapatıldı. `lsof` ile dinleyen port kalmadı.
- Ölçüm ve fixture satırları kendi silme adımlarıyla temizlendi (0/0/0). `fefb-mob-pg` konteyneri silindi.
- `wtonce` ve `wtmob` worktree'leri bu commit'ten SONRA `git worktree remove` ile kaldırılır; kanıtı (git worktree list) görev kapanış mesajında.

## Dal durumu (commit öncesi)

```
$ git log --oneline -5 fe-fb/muoepl-mobile
da9a90f8 Merge branch 'dev' into fe-fb/muoepl-mobile — TASK-MUOEPL87MCXJH: güncel tabanda kapılar
d6d12b8d docs(agent-results): TASK-MUOG51GJ3PUOG devop-fb — R-1 go-live ön kontrolü hazır (d8a7e8a5, merge 65c
65c7637c Merge branch 'devop-fb/r1-golive-check' into dev — TASK-MUOG51GJ3PUOG R-1 go-live ön kontrolü
d8a7e8a5 feat(golive): TASK-MUOG51GJ3PUOG devop-fb — R-1 TopicMatch K1 anahtarı salt-okur ön kontrolü
60d6300c fix(approvals): TASK-MUOEPL87MCXJH — a nameless requester's e-mail wraps in the card
$ git diff --stat dev...HEAD   (dev şimdi bbababe7)
 .../(app)/[workspace]/approvals/client.tsx         | 18 ++++---
 .../(app)/[workspace]/pipeline/[id]/client.tsx     |  6 ++-
 tests/e2e/fixtures/mobile-long-content.ts          | 61 ++++++++++++++++------
 tests/e2e/mobile-main-overflow.spec.ts             | 36 +++++++++++--
 4 files changed, 92 insertions(+), 29 deletions(-)
$ git merge-tree --write-tree dev HEAD
çakışma yok (rc=0)
$ docker ps -a --filter name=fefb-mob-pg
(boş = silindi)
$ lsof -iTCP:3181,3182,3183 -sTCP:LISTEN | wc -l
0
```
