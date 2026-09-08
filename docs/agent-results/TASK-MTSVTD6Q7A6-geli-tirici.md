# TASK-MTSVTD6Q7A6 — HEAD kendi kendine tutarsız: temiz-klon doğrulaması

**Ajan:** geli-tirici (Backend Mühendisi) · **Tip:** bug / repo hijyeni · **Sprint:** SPRINT-S12 · **Dal:** `dev`
**Tarih:** 2026-09-08 · **Ölçülen HEAD:** `dcd308a` · **Kartın taban aldığı commit:** `1af95e4`

---

## 1. Ne yapıldı

### 1.1 Önce: kartın tabanı yeniden ölçüldü — ve ARTIK GEÇERLİ DEĞİL

Kart `dev @ 1af95e4` durumunu tarif ediyor. Koda dokunmadan önce durumu yeniden ölçtüm: kartın
saydığı sahipsiz dosyaların **13'ü 14'ünden fazlası zaten commit'lenmiş**. Bu iş, kart açılmadan
önce `TASK-MTSJS1K0LTDQP` kapsamında yapılmış:

- `d78b5c7` — `chore(repo): commit orphaned test helper, scripts, and type definitions`
- `0c40221` — `chore(repo): update prisma delegate sentinel test and gitignore`

Dolayısıyla bu kartta yapılan iş **düzeltme değil, bağımsız doğrulama** oldu: düzeltmenin gerçekten
tuttuğunu kanıtlayan yanlışlanabilir bir temiz-klon probu koşturdum. (Kart metnindeki "yerelde
1299 PASS" tabanı da eskimiş; güncel ölçüm 1301.)

### 1.2 Sahipsiz dosya sınıflandırması (kartın listesindeki HER dosya)

`git ls-files --error-unmatch` ile tek tek ölçüldü:

| Dosya | Kartta | ŞU ANKİ durum | Karar |
|---|---|---|---|
| `tests/helpers/partial-row.ts` | untracked | **TRACKED** (`d78b5c7`) | COMMIT ✅ yapılmış |
| `src/lib/adapters/sedia-circuit-breaker.ts` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `tests/adapters/sedia-circuit-breaker.test.ts` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `src/modules/m6/server/esr-parser.ts` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `tests/modules/esr-parser.test.ts` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `tests/modules/m6/scoring.test.ts` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `src/types/json.ts` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `scripts/verify-deployed-bytecode.ts` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `tests/verify-deployed-bytecode.test.ts` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `scripts/compare-production-backup.ts` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `src/contracts/artifacts/DualApproval.json` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `src/app/[locale]/(app)/[workspace]/calls/[id]/add-button.tsx` | untracked | **TRACKED** | COMMIT ✅ yapılmış |
| `src/lib/scoring/topic-stat-importer.ts` | untracked | **UNTRACKED** | **SİLİNMESİ ÖNERİLİR** (aşağıda §1.3) |
| `tsconfig.exen-probe.json` | untracked | **UNTRACKED** | **SİLİNMESİ ÖNERİLİR** (aşağıda §1.3) |

`package.json` script satırları — kartın "repoda YOK" dediği iki satır artık **commit'li**:

```
$ git show HEAD:package.json | grep -nE 'efatura:preflight|gate:bytecode'
13:    "efatura:preflight": "tsx scripts/efatura-preflight.ts",
37:    "gate:bytecode": "tsx scripts/verify-deployed-bytecode.ts",
```

`git diff -- package.json` **boş** → çalışma ağacı ile HEAD aynı. `TASK-MTSJS1K0LTDQP`'nin DoD'undaki
`pnpm efatura:preflight` komutu artık temiz klonda çalışır.

Kartın "commit'lenmemiş MODIFIED ürün dosyaları" listesi (`src/app/layout.tsx`,
`workers/cordis/main.py`, `.gitignore`, `docs/CORDIS-SAMPLE-CALIBRATION.md` vb.) de tümüyle
commit'lenmiş — `git status` bugün bu dosyaların hiçbirini göstermiyor. **SOR** olarak işaretlenecek
sahipsiz ürün dosyası kalmadı.

### 1.3 Ölü kod adayları — SİLME YAPILMADI (patron kararı bekliyor)

Kartın kuralı gereği silme işlemi yapmadım; öneri olarak bırakıyorum:

- **`src/lib/scoring/topic-stat-importer.ts`** (75 satır) — `importTopicStatsBatch()` export ediyor.
  Depoda **0 referans** (kod, test, config, doküman — hiçbiri import etmiyor; tek "eşleşme" önceki
  hijyen raporunun kendisi). Untracked olduğu için temiz klonda zaten yok, yani bir zararı yok;
  ama çalışma ağacında `tsc` tarafından derleniyor. **SİLİNMESİ ÖNERİLİR.**
- **`tsconfig.exen-probe.json`** (4 satır) — `{"extends": "./tsconfig.json", "compilerOptions": {"incremental": false}}`.
  ex-en ajanının bir kereye mahsus typecheck probundan kalma geçici konfig, **0 referans**.
  **SİLİNMESİ ÖNERİLİR.**

Not: ikisi de untracked olduğu için `git clean` gerektirmez, düz dosya silme yeterlidir — ve ikisi de
temiz-klon tutarlılığını **etkilemez** (repoda olmadıkları için klonda da yoklar).

---

## 2. Kanıt

### 2.1 Temiz-klon probu — ÖNCE (KIRMIZI)

Kartın taban aldığı `1af95e4` commit'i salt kaynak olarak çıkarıldı (`git archive`), bağımlılıklar
ana depodan link'lendi (node_modules zaten git'te değil; kusur kaynak-seviyesinde):

```
$ git ls-tree 1af95e4 -- tests/helpers/partial-row.ts
(boş çıktı — o commit'te dosya YOK)

$ git ls-tree 1af95e4 -r --name-only | grep -E 'subscription-sync\.test\.ts|export/route\.test\.ts|m2/server/actions\.test\.ts'
src/app/api/concept-notes/[id]/export/route.test.ts
src/lib/billing/subscription-sync.test.ts
src/modules/m2/server/actions.test.ts
(üç importer da o commit'te COMMIT'Lİ — yardımcıları ise değil)
```

```
$ cd <tmp>/cleanclone/before && npx vitest run src/lib/billing/subscription-sync.test.ts

 RUN  v4.1.11 .../cleanclone/before

 ❯ src/lib/billing/subscription-sync.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/billing/subscription-sync.test.ts [ src/lib/billing/subscription-sync.test.ts ]
Error: Cannot find module '/tests/helpers/partial-row' imported from
.../cleanclone/before/src/lib/billing/subscription-sync.test.ts
 ❯ src/lib/billing/subscription-sync.test.ts:19:1
     19| import { partialRow, partialRows } from '../../../tests/helpers/partia…
       | ^

 Test Files  1 failed (1)
      Tests  no tests
```

**Prob yanlışlanabilir ve gerçekten kırmızı yandı** — tam olarak kartın öngördüğü hata.

### 2.2 Temiz-klon probu — SONRA (YEŞİL)

Aynı prob, `HEAD` (`dcd308a`) kaynağı üzerinde:

```
$ cd <tmp>/cleanclone/after && npx vitest run src/lib/billing/subscription-sync.test.ts

 RUN  v4.1.11 .../cleanclone/after

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  180ms
```

### 2.3 Gerçek `git clone` üzerinde TAM süit (probun genellemesi)

`git archive` yönteminin bir sınırı var: `.git` üretmediği için `schema-contract.test.ts`'in kendi
boşluk-koruması ("git ls-files answered nothing — the scope check is vacuous") haklı olarak patlıyor.
Bu bir HEAD kusuru değil, prob ortamının kusuru. Bu yüzden probu **gerçek yerel klonla** tekrarladım
(yalnız commit'li durum gelir, untracked dosyalar gelmez):

```
$ git clone --no-hardlinks /Users/macbook/AgentSpace/fabrika <tmp>/cleanclone/realclone
$ cd <tmp>/cleanclone/realclone && git checkout dev && git log --oneline -1
dcd308a docs(TASK-MTSJHTJZSCILI): verify prisma-override removal with a falsifying probe
$ git status --porcelain
(boş — klon tertemiz)

$ npx vitest run --passWithNoTests
 Test Files  115 passed | 2 skipped (117)
      Tests  1280 passed | 29 skipped (1309)
CLONE_TEST_EXIT=0
```

**Temiz klonda 0 başarısızlık.** HEAD artık kendi kendine tutarlı — bu kartın çekirdek iddiası
doğrulandı.

### 2.4 Çalışma ağacı kapısı

```
$ pnpm typecheck   → TYPECHECK_EXIT=0   (tsc --noEmit, çıktı yok)
$ pnpm lint        → LINT_EXIT=0        (eslint, çıktı yok)
$ pnpm test        → TEST_EXIT=0
 Test Files  115 passed | 2 skipped (117)
      Tests  1301 passed | 8 skipped (1309)
```

Kartın istediği eşik "1299+ PASS" → **1301 PASS**, düşüş yok.

### 2.5 `git status` kalıntıları — her satır için gerekçe

```
$ git status --porcelain
 M .agentspace/memory/agents/ex-en/MEMORY.md
 M .agentspace/memory/shared/MEMORY.md
?? .agentspace/memory/agents/ex-en/type-gate-proof-needs-a-rejection-not-zero-errors.md
?? .agentspace/memory/shared/fabrika-tsbuildinfo-lies-after-ambient-type-change.md
?? docs/agent-results/TASK-MTSJS1K0LTDQP-geli-tirici-hygiene.md
?? src/lib/scoring/topic-stat-importer.ts
?? tsconfig.exen-probe.json
```

| Satır | Neden kaldı |
|---|---|
| `.agentspace/memory/agents/ex-en/*` (2 satır) | **Başka bir ajanın** (ex-en) hafızası, benim kartımın kapsamı dışı. Ona dokunmak eşzamanlı çalışan ajanla yarış yaratır. Sahibi commit'ler. |
| `.agentspace/memory/shared/*` (2 satır) | Aynı gerekçe — ex-en'in bu turda yazdığı paylaşılan hafıza. Kart `\.agentspace/` yollarını zaten kapsam dışı bırakıyor. |
| `docs/agent-results/TASK-MTSJS1K0LTDQP-geli-tirici-hygiene.md` | Asıl düzeltmeyi yapan kartın kanıt raporu, commit'lenmemişti. **Bu turda commit'lendi** (kartın 4. maddesi). |
| `src/lib/scoring/topic-stat-importer.ts` | Ölü kod adayı — silme yetkim yok, **SİLİNMESİ ÖNERİLİR** olarak bırakıldı (§1.3). |
| `tsconfig.exen-probe.json` | Ölü kod adayı — aynı gerekçe (§1.3). |

---

## 3. Değişen dosyalar

Ürün kodu **değişmedi** (kartın kuralı). Bu turda yalnız:

- `docs/agent-results/TASK-MTSJS1K0LTDQP-geli-tirici-hygiene.md` — sahipsiz kanıt raporu commit'lendi
- `docs/agent-results/TASK-MTSVTD6Q7A6-geli-tirici.md` — bu rapor (yeni)

Hiçbir test silinmedi/gevşetilmedi, hiçbir dosya silinmedi, `git stash`/`checkout --` kullanılmadı.

---

## 4. Riskler

1. **Yol üstünde bulunan kusur — DÜZELTİLMEDİ, kartın kuralı gereği raporlanıyor:**
   Temiz klonda **21 test sessizce SKIP** oluyor, çalışma ağacında ise koşuyor (29 skip vs 8 skip).
   Fark tamamen şu üç dosyada:
   - `tests/rls.spec.ts` (6 test) — kiracı izolasyonu
   - `tests/plan-visibility-rls.spec.ts` (5 test) — özel plan RLS görünürlüğü
   - `tests/plan-storefront.spec.ts` (10 test) — vitrin/fiyat RLS

   Kök neden: `.env` `.gitignore:34` ile (doğru şekilde) commit'lenmiyor, dolayısıyla temiz klonda
   `DATABASE_URL` yok ve bu testler kendilerini atlıyor. **Sonuç: DB'siz bir CI, deponun en
   güvenlik-kritik testleri (kiracı izolasyonu) hiç koşmadan `exit 0` verir — sahte yeşil.**
   Bu, tam olarak bu kartın avladığı kusur sınıfının ikinci yüzü. Ayrı kart açılmasını öneriyorum.

2. Ölü kod adayları (§1.3) untracked bırakıldı; kimse temizlemezse çalışma ağacında birikmeye
   devam eder.

3. Bu deponun git remote'u yok (`.github/workflows/ci.yml` hiç koşmuyor) — yani "temiz klonda
   yeşil" güvencesi şu an **hiçbir otomatik kapı tarafından** korunmuyor; yalnız bu manuel probla
   ölçüldü.

---

## 5. Açık sorular

1. `src/lib/scoring/topic-stat-importer.ts` silinsin mi, yoksa gerçekten bir yere bağlanacak
   yarım kalmış bir iş mi? (0 referans, TopicStat içe aktarımı — M6 puanlama ile ilgili görünüyor.)
2. `tsconfig.exen-probe.json` silinsin mi? (ex-en'in geçici probu, 0 referans.)
3. §4.1'deki "DB'siz CI'da 21 RLS testi sessizce atlanıyor" bulgusu için ayrı kart açılsın mı?

---

## 6. Sonraki adım — nöbetçi kapı önerisi (UYGULANMADI, kartın kapsamı dışı)

Bu kusuru bir daha insan gözüne bırakmamak için üç seçenek, ucuzdan pahalıya:

**A) `git ls-files` tabanlı statik kontrol (en ucuz, saniyeler).**
`pnpm gate` içine bir adım: commit'li her `.ts/.tsx` dosyasının göreli import'larını çözümle;
hedef `git ls-files` çıktısında yoksa (ama diskte varsa) hata ver. Bu tam olarak bu kartın
kusurunu yakalar ve DB/kurulum gerektirmez. Not: depoda zaten benzer bir desen var —
`src/modules/m8/server/schema-contract.test.ts` çalışma ağacı yerine **git index'ini** okuyor ve
kendi boşluk-korumasını taşıyor (`expect(TRACKED, 'git ls-files answered nothing…')`). Aynı
kalıp yeniden kullanılabilir, sıfırdan icat edilmemeli.

**B) Kapının içinde gerçek temiz-klon koşusu (orta maliyet).**
`git clone --no-hardlinks . <tmp>` + `node_modules` link'i + `vitest run`. Bu turda elle
yaptığım şeyin betikleştirilmiş hali; ~6 saniye sürüyor. A'dan daha güçlü, çünkü yalnız
import'ları değil her türlü "yalnız çalışma ağacında var" bağımlılığını yakalar.

**C) Gerçek CI (en pahalı, şu an imkânsız).**
Depoda remote olmadığı için `.github/workflows/ci.yml` hiç koşmuyor; önce remote gerekir.

**Önerim: A + B birlikte** — A her commit'te (pre-commit, ucuz), B `pnpm gate` içinde (nadir,
kapsamlı). B'nin ek faydası: §4.1'deki sessiz-skip sorununu da görünür kılar, çünkü temiz klon
koşusundaki skip sayısı çalışma ağacınınkiyle karşılaştırılabilir hale gelir.

---

## Definition of Done

- [x] Her sahipsiz dosya için COMMIT/SİL/SOR kararı gerekçeli tabloda (§1.2, §1.3)
- [x] Temiz-klon probu ÖNCE kırmızı (§2.1), SONRA yeşil (§2.2) — iki çıktı da kopyalanmış
- [x] `tests/helpers/partial-row.ts` ve iki `package.json` script satırı `dev`'de commit'li (§1.2)
- [x] typecheck 0 / lint 0 / test 1301 PASS (§2.4) — taban 1299'un üstünde
- [x] `git status` kalıntıları tek tek açıklandı (§2.5)
- [x] Nöbetçi kapı önerisi yazıldı, uygulanmadı (§6)
- [x] Sonuç raporu: `docs/agent-results/TASK-MTSVTD6Q7A6-geli-tirici.md`
