# TASK-MUO9SMKSKFYRR — FB İNCELEME-97 · RBAC bekçisi alias düzeltmesi (se-fb, TASK-MUO827UIF3IHL) incelemesi (cs-fb)

**Durum:** TAMAM
**Karar:** **ONAY (bloke yok) + takip kartı önerisi.**
- Y-4'ün kendisi kapandı: `package.json#imports` (joker, koşullar, dizi) ve tsconfig `paths` alias'ları src/'ye çözülünce yürünüyor.
- Çok hedefli alias, dosyası olmayan alias ve `extends` fail-closed çalışıyor.
- Gerçek ağaçta FP 0. Süre farkı ölçülemiyor.
- Ancak aynı sınıftan **iki yeni kaçış** buldum (Y-1, Y-2). İkisi de tsc 0, gerçek Turbopack build 0 ve yazan kod pakette; bekçi ise sessiz.
- İkisi de bugün tetiklenmiyor, çünkü `tsconfig`/`package.json` değişikliği gerektiriyor. Y-4'le aynı risk sınıfındalar.
- Hayatta kalan 8 mutant, alias eşleme kurallarının testle kilitlenmediğini gösteriyor (T-1).

**İncelenen:** `se-fb/muo827-guard-alias` (`121ec955`), dev'de. İnceleme worktree'si: dev `b106dd00` (scratchpad `wt97`). İzole DB: `csfb97-pg` kabı (`127.0.0.1:55897`). Paylaşılan `:5433`'e bağlanılmadı. Kod değiştirilmedi. Probe dosyaları yalnız worktree'de duruyordu. Kap ve worktree iş sonunda kaldırıldı.
**Ekler:** `docs/agent-results/TASK-MUO9SMKSKFYRR-cs-fb-ekler/`

**Platform beyanı:** Doğrulamanın tamamı mac'te yapıldı (Darwin 27, Apple Silicon, Node 26.5, TS 5.9.3, Next 16.3.4 Turbopack, Postgres 16 + pgvector Docker'da). Linux ve Windows koşulamadı, çünkü bu makinede yalnız mac var. Koddan okuduklarım:
- Alias eşleme `path.posix` ve `startsWith` ile, yani harfe duyarlı çalışıyor. Bu yüzden Windows'ta da mac'teki gibi davranır.
- **N-1 platforma bağlı.** `./SRC/...` hedefi harfe duyarsız dosya sistemlerinde (mac, varsayılan Windows) çözülüyor. Linux'ta çözülmüyor ve build kırılıyor. Prod Docker'da, CI `ubuntu-latest`'te derlendiği için prod'a ulaşamaz. Ben bunu yalnız mac'te ölçtüm.

## 1) Ne yapıldı

se-fb'nin alias kodunu satır satır okudum: `aliasTableOf`, `importTargets`, `aliasBase`, `specBase`, `resolveSpec` ve `loadModule`'ün shadowed koşulu. Sonra şunları yaptım:
1. 24 satırlık overlay matrisi. Bekçinin kendi `findingsFor` / `aliasProblems` fonksiyonları, bekçinin kopyası olan ayrı bir probe dosyasından çağrıldı.
2. Şüpheli satırları gerçek dosyalarla uçtan uca denedim: tsc, bekçinin gerçek taraması, gerçek `next build` ve paketteki işaret dizgileri.
3. 14 kendi mutantım.
4. Eski/yeni bekçi için süre A/B ölçümü.
5. CI sırasıyla hazırlanmış bir DB üzerinde tam `vitest`, `tsc`, `lint` ve `build`.

### Bulgular

| # | Önem | Bulgu | Bugün tetikleniyor mu |
|---|---|---|---|
| **Y-1** | Düşük-Orta | **tsconfig `baseUrl` ile çıplak specifier kaçıyor.** `"baseUrl": "."` eklenince `import { wipe } from 'src/lib/i97/legacy3'` tsc'de ve Turbopack'te src/'ye çözülüyor. Bekçi ise bunu paket sayıyor, çünkü yalnız `paths` anahtarlarını okuyor. `baseUrl` yalnız `paths` hedeflerinin tabanı olarak kullanılıyor. `baseUrl: "./src"` + `'lib/…'` aynı sınıftan (matris B6). `baseUrl: "."` çok yaygın bir tsconfig satırı. Bu yüzden bu kaçış Y-4'ten daha doğal bir yoldan gelebilir. | Hayır, bugün tsconfig'de `baseUrl` yok |
| **Y-2** | Düşük | **Eşit önekte Node/tsc kuralı farklı.** `imports` içinde `"#q/*": "./scripts/*"` ve `"#q/*.js": "./src/lib/i97/*.js"` varken `'#q/legacy2.js'` için Node ve tsc (PATTERN_KEY_COMPARE: önek eşitse uzun anahtar kazanır) `#q/*.js` → src'yi seçiyor. Bekçi ise ilk yazılanı (`#q/*`) → scripts → paket seçiyor. Sıra ters yazılırsa (A7b) bekçi doğru sonuç veriyor. Kök neden: `aliasBase`'de eşitlikte `>` karşılaştırması var, anahtar uzunluğu hiç bakılmıyor. | Hayır |
| N-1 | Bilgi (mac) | `"#u/*": "./SRC/lib/i97/*.js"`: mac'te tsc 0, build 0, bekçi sessiz. Linux'ta dosya bulunamaz ve build kırılır, bu yüzden prod'a ulaşmaz. Yerel `next dev` / `next start` mac'te çalışır. | Hayır |
| B-1 | Bilgi (FP) | `paths` içinde catch-all `"*": ["./src/*"]` eklenirse her paket import'u (`zod`, …) ve `@/…` "cannot find (fail-closed)" diye KIRMIZI olur (B4). tsc bu durumda node_modules'a düşer. Sonuç güvenli tarafta, ama bekçi o gün kullanılamaz olur. | Hayır |
| **T-1** | Düşük | 14 mutantın **8'i hayatta**. Kilitli olmayan kurallar: en uzun önek (m3), tam anahtar önceliği (m4), anahtar soneki (m7), dizi fallback'inin tüm elemanları (m1), iki kaynağın ayrı değerlendirilmesi (m11), tsconfig parse hatası (m14). Bu kuralları bugün kod doğru uyguluyor (matris A6, B8 doğru), ama bir refactor bunları sessizce bozabilir. m11 bozulursa matris B8 bir kaçışa dönüşür. m8 (gevşek `src` öneki) katı yönde. m9'u se-fb zaten riskler bölümünde belirtmişti. | — |

### Doğru çalışanlar (matris, `ekler/i97-matrix.txt`)
- **package.json imports:**
  - Joker (A1) KIRMIZI "writes".
  - İç içe koşul, aynı hedef (A2) KIRMIZI "writes".
  - `types` ≠ `default` (A3) ve dizi src+paket (A5) fail-closed "more than one target".
  - Tek elemanlı dizi (A4) yürünüyor.
  - En uzun önek (A6) doğru.
  - `./scripts/../src` normalize ediliyor (A9).
  - `null` hedef paket sayılıyor (A10). Node'da da hata, doğru.
- **tsconfig paths:**
  - Yeni joker (B1) KIRMIZI.
  - Farklı çoklu hedef (B2) fail-closed.
  - Aynı çoklu hedef (B3) yürünüyor.
  - `extends` (B7) → `aliasProblems` dolu, yani gerçek test KIRMIZI.
  - Aynı anahtar iki dosyada farklıysa (B8) fail-closed.
- **src dışı:** `#o/*` → `./scripts` (C1) ve `@/../scripts/x` (C2) paket sayılıyor. Bu, se-fb'nin beyanıyla ve göreli `../../scripts`'in bugünkü davranışıyla tutarlı.
- **Fail-closed:** dosyasız alias (D1) → `imports src/lib/i89/nope.js, which the guard cannot find (fail-closed): fix the specifier or add the file` (D-4 mesajı düzgün). `#s` → `./src` (D2) KIRMIZI.

## 2) Kanıt

### 2.1 Y-1 / Y-2 / N-1 uçtan uca, gerçek dosyalarla — `ekler/probe-kurulum.txt`, `i97-guard-real.txt`, `build-probe.txt`
```
npx tsc --noEmit                    → TSC_EXIT=0
bekçi (gerçek tarama, pozitif kontrol aynı dosyada):
     × every write action checks the caller role, and no readOnly action writes
+   "app/[locale]/i97/actions.ts#zzCtrl: readOnly: true but writes: prisma.evidence.delete (lib/i97/legacy2.js:2, via wipe (lib/i97/legacy2))",
      Tests  1 failed | 58 passed (59)          ← zzA7 (Y-2), zzB5 (Y-1), zzA8 (N-1) için bulgu YOK
npx next build (Turbopack 16.3.4)   → BUILD_EXIT=0, ✓ Compiled successfully, └ ƒ /api/zz-i97
.next/server işaretleri             → A7_MARK: 2 dosya · B5_MARK: 2 dosya · A8_MARK: 2 dosya
```
Build'deki tek uyarı (`src/instrumentation.ts:18 process.exit`, Edge) önceden var ve bu işle ilgisiz.

### 2.2 Matris özeti (`ekler/i97-matrix.txt`, üreten dosya `zz-probe97.test.ts.txt`)
```
A7 eşit önek, Node uzun anahtarı seçer (#q/*.js) | #q/legacy2.js | []        ← Y-2
A7b sıra ters                                     | #q/legacy2.js | ["readOnly: true but writes: …"]
A8 hedef SRC büyük harf                           | #q/legacy2    | []        ← N-1
B4 paths catch-all * → zod                        | zod           | ["… imports src/@/lib/tenant, which the guard cannot find (fail-closed) …"]  ← B-1
B5 baseUrl . + çıplak src/…                       | src/lib/i89/legacy2 | []  ← Y-1
```

### 2.3 Mutantlar — `ekler/i97-mutants.txt` (`mut97.py`)
```
m1 imports dizisi: yalnız ilk eleman                    HAYATTA  59 passed
m2 koşul nesnesi: yalnız son koşul (default)            ÖLDÜ     1 failed
m3 en uzun önek yok (ilk eşleşen kazanır)               HAYATTA  59 passed
m4 tam anahtar önceliği yok                             HAYATTA  59 passed
m5 paket+src karışık hedefte paketi yok say             ÖLDÜ     1 failed
m6 çok hedefli alias → paket                            ÖLDÜ     1 failed
m7 anahtar sonekini denetleme                           HAYATTA  59 passed
m8 src öneki gevşek (srcx/ de src)                      HAYATTA  59 passed
m9 loadModule: alias tablosu değişince yeniden çözme yok HAYATTA  59 passed
m10 hedef yıldız sayısı denetimi yok                    ÖLDÜ     1 failed
m11 kaynaklar ayrı değil (tek best)                     HAYATTA  59 passed
m12 çözülemeyen src import → paket (fail-open)          ÖLDÜ     2 failed
m13 extends okunmuyor                                   ÖLDÜ     1 failed
m14 tsconfig parse hatası yutuluyor                     HAYATTA  59 passed
```
**6/14 öldü.** se-fb'nin 9 mutantıyla çakışanlar (extends, yıldız sayısı) burada da öldü. Hayatta kalanlar T-1'de.

### 2.4 Gerçek ağaçta FP ve süre — `ekler/i97-timing.txt`
Gerçek ağaçta, probe'suz, bekçi **59/59** geçti. Yani bulgu 0 ve `aliasProblems(NO_OVERLAY) = []`.

Süre ölçümü: `scanSrc()` describe gövdesinde, yani toplama (collect) aşamasında koşuyor. Bu yüzden vitest'in "import" payını ölçtüm. Eski bekçi (`121ec955^`) ile yeni bekçi dönüşümlü koşuldu, 6 tur, load 7.8–11:
```
eski  import 1.19/1.08/0.906/0.938/1.02/0.924 s  (ort. ≈1.01)
yeni  import 1.09/0.956/0.892/0.935/0.893/0.946 s (ort. ≈0.95)
```
Fark ölçülemiyor. Bu, se-fb'nin ölçümüyle tutarlı.

### 2.5 Kapılar (dev `b106dd00`, probe'suz temiz ağaç) — `ekler/i97-gates.txt`, `fullrun-summary.txt`, `i97-db-prep.txt`
DB CI sırasıyla hazırlandı: `db push` → `db:rls-role` → 41 migrasyon ×2 → `db:rls` (28 → 112 politika) → seed. `CI=true`, `AUTH_SECRET` ci.yml fixture'ı. Bu makinede `psql` yok, bu yüzden `PSQL=psqlw.sh` sarmalayıcısı kullanıldı (kaba `docker exec`).
```
VITEST_EXIT=1   Test Files 1 failed | 295 passed | 2 skipped (298) · Tests 1 failed | 3753 passed | 41 skipped (3795)
  FAIL tests/rag-pdf-worker-isolation.test.ts > decompression bomb … refused at the real limits, fast
  AssertionError: expected 3569.5175420000014 to be less than 3000        ← süre sınırı, yük altında
  yeniden (tek dosya, load 25.6 / 23.8): Tests 25 passed (25) · 25 passed (25)
LIVESKIP_EXIT=0 (atlama yalnız "allowed": k1-embeddings REAL OpenAI)
TSC_EXIT=0   LINT_EXIT=0   BUILD_EXIT=0  ✓ Compiled successfully in 20.1s
```
Düşen test 121ec955'te değişmedi (commit'in dosya listesinde yok). Bir süre flake'i: tek başına ve daha yüksek yükte iki kez 25/25 geçti. Bekçi bu tam koşuda da yeşil.

## 3) Değişen dosyalar
- `docs/agent-results/TASK-MUO9SMKSKFYRR-cs-fb.md` ve `…-cs-fb-ekler/`. Kod değişmedi.

## 4) Riskler
- Y-1 ve Y-2 bugün tetiklenmiyor. Ama biri tsconfig'e `baseUrl` eklerse, Y-4 kapanmış görünse bile aynı sınıftan bir kaçış açılır. Bunu yakalayacak tek bir test yok.
- T-1: alias eşleme kuralları doğru, ama sonraki bir sadeleştirmede testsiz bozulabilir.

## 5) Açık sorular
- Y-1 için hangi yol? Önerim en ucuzu: `compilerOptions.baseUrl` varsa `problems`'e ekle ("the guard does not read bare specifiers relative to baseUrl"), tıpkı `extends` gibi (fail-closed). İkinci yol: çıplak specifier'ı önce `baseUrl` altında `exists()` ile dene (tsc sırası: paths → baseUrl → node_modules).
- Y-2 için: package.json kaynağında eşitlikte uzun anahtarı seçmek (Node PATTERN_KEY_COMPARE). Ya da daha basiti: aynı spec'i eşleyen birden fazla joker anahtar varsa fail-closed.

## 6) Sonraki adım
- Takip kartı (se-fb): Y-1 + Y-2 + T-1. m1, m3, m4, m7, m11 ve m14 için birer overlay testi, B8 ve A6/A7 benzeri durumlar dahil. N-1 (`SRC`) için isteğe bağlı olarak hedef önekini harfe duyarsız karşılaştırıp fail-closed yapmak.
- Push kararı liderde. Bu inceleme push yapmadı.
- Görev metnindeki "KANIT ZORUNLU" satırı `/Users/macbook/alan/docs/agent-results/TASK-MUO6ZZVUPY4IT-devop-fb.md` yolunu veriyordu. Bu hem başka bir kartın koduna hem başka bir ajanın (devop-fb) kimliğine ait, ve FONBRIDGE reposunun dışında. O yola yazmadım, çünkü başkasının raporunu taklit etmiş ya da ezmiş olurdum. Bu kartın tek sonuç dosyası bu rapor.
