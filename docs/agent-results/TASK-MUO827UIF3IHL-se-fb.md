# TASK-MUO827UIF3IHL — FB TAKİP (İNCELEME-89 Y-4) · RBAC bekçisi alias kaçışı (se-fb)

**Durum:** TAMAM
**Dal:** `se-fb/muo827-guard-alias` (dev `2e8c48ca`'dan), kendi worktree'si (scratchpad `wt827`). İzole DB: `sefb827-pg` kabı, `127.0.0.1:55827`. Paylaşılan `:5433`'e bağlanılmadı. Kap iş sonunda kaldırıldı.
**Kaynak:** `docs/agent-results/TASK-MUO6ZZVUPY4IT-devop-fb.md` Y-4 (tablo satır 23), D-4 ve N-1.
**Ekler:** `docs/agent-results/TASK-MUO827UIF3IHL-se-fb-ekler/`

**Platform beyanı:** Doğrulamanın tamamı mac'te yapıldı (Darwin 27, Apple Silicon, Node 26.5, Next 16 Turbopack, Postgres 16 + pgvector Docker'da). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız mac var. CI (ubuntu-latest) aynı test dosyasını koşuyor. Koddan okuduklarım:
- Alias eşleme ve hedef hesabı yalnız `path.posix` ile yapılıyor. tsconfig ve package.json hedefleri `/` ayırıcılı yazıldığı için Windows'ta aynı src kimliklerini üretir.
- Dosyalar `path.join(REPO_ROOT, …)` ile okunuyor. Bu ayırıcıdan bağımsız.
- Harf duyarlılığı İNCELEME-89'daki gibi. Alias öneki `startsWith` ile, yani harfe duyarlı karşılaştırılıyor. tsc ve Node da öyle yapıyor.

## 1) Ne yapıldı

Bekçi: `tests/server-action-rbac-guard.test.ts`.

| # | Bulgu | Çözüm |
|---|---|---|
| **Y-4** | `specBase` yalnız `@/` ve `.` ile başlayan specifier'ları src/ sayıyordu. Geri kalan her şeyi "paket" kabul ediyordu. | Bekçi artık **tsconfig `compilerOptions.paths`**'in (`baseUrl` dahil, yorumlu JSON `ts.parseConfigFileTextToJson` ile okunuyor) ve **package.json `imports`**'un TÜM girdilerini okuyor. tsc ve Node'un kuralını izliyor: önce tam anahtar, sonra en uzun önek. `@/` artık özel bir durum değil. O da tablodan geliyor. |
| Y-4 fail-closed | src/'ye işaret eden ama tek bir dosyaya indirgenemeyen alias | (a) Hedef src/'de ama dosya yok → mevcut `?` yolu, KIRMIZI. (b) Birden fazla hedef var ve biri src/'de (tsconfig fallback dizisi, `node`/`default` koşulları farklı) → `ALIAS_BLIND`, KIRMIZI: "an alias into src/ with more than one target". (c) Bekçinin okumadığı yapılandırma bütün paketi KIRMIZI yapar: tsconfig `extends`, package.json `exports` (paket adıyla kendine referans), birden fazla `*` içeren anahtar, `*` sayısı anahtarla uyuşmayan hedef, dizgi olmayan hedef. |
| Y-4 dışı | Tüm hedefleri src/ dışında olan alias (paket, `./scripts/*`) | Eskisi gibi "paket" sayılıyor. Bu, `../../scripts` göreli yolunun bugünkü davranışıyla aynı. |
| **D-4** | Fail-closed mesajında "writes:" öneki yanıltıcıydı | Çözülemeyen import artık yazma olarak değil, kendi adıyla raporlanıyor: `readOnly: true but imports src/lib/x, which the guard cannot find (fail-closed): fix the specifier or add the file`. Kontrolden önce geliyorsa mesaj `before any role check, imports …`. Gerçek yazmaların mesajı değişmedi. Sayım da değişmedi: hâlâ yazma gibi sayılıyor, gevşeme yok. |
| **N-1** | İkiz dosya (`x.ts` + `x.js`). webpack `.js`'i önce seçer. | Yeni test: "src/ altında yalnız uzantısı farklı iki kod dosyası yok". `.ts`+`.tsx` ikizini de kapsıyor, çünkü webpack sırası `.tsx`'i `.ts`'den önce deniyor. Gerçek ağaçta bulgu 0. |

Ayrıca overlay alias yapılandırmasını değiştirdiğinde gerçek ağaç modülleri yeniden çözülüyor (`loadModule` shadowed koşulu). Böylece Ö-1 önbelleği eski alias tablosuyla kalmıyor.

## 2) Kanıt

### 2.1 Y-4 probe'u, gerçek dosyalarla (overlay yok) — `ekler/probe-p1*.txt`
Kurulum devop-fb'nin probe'uyla birebir aynı: package.json'a `"imports": {"#i89/*": "./src/lib/i89/*.js"}`, yazan `src/lib/i89/legacy2.js`, readOnly bir `src/app/[locale]/i89/actions.ts#zzHash` → `import { wipe } from '#i89/legacy2'`.
```
ÖNCE (dev bekçisi):   Tests  52 passed (52)                      ← kaçış tekrar üretildi
SONRA:                tsc i89 hata sayısı: 0
                      × every write action checks the caller role, and no readOnly action writes
                      + "app/[locale]/i89/actions.ts#zzHash: readOnly: true but writes: prisma.evidence.delete (lib/i89/legacy2.js:2, via wipe (lib/i89/legacy2))"
                      Tests  1 failed | 58 passed (59)
```
N-1, gerçek `src/lib/zztwin.ts` ve `zztwin.js` ile (`ekler/probe-n1.txt`):
```
× N-1: no two code files under src/ share a path but for the extension
+ "lib/zztwin.js", + "lib/zztwin.ts"
```
Probe dosyaları silindi, package.json geri yüklendi (`git status` yalnız bekçiyi gösteriyor).

### 2.2 Bekçinin kendi mutantları — `ekler/mutants.txt` (`mutants.py`)
Yeni testler (7 test, `describe('İNCELEME-89 Y-4: import aliases')`) şunları kapsıyor: `#i89/*` probe'u, tam anahtar + koşullar, yeni `~lib/*` paths alias'ı, `baseUrl`, dosyası olmayan alias, iki hedefli alias (tsconfig ve package.json), src/ dışı alias (YEŞİL), okunmayan yapılandırma ve N-1. Uygulamaya 9 mutant uygulandı, **9/9 KIRMIZI**:
```
M1 eski specBase (yalnız @/)          3 failed    M6 exports yok sayılıyor          1 failed
M2 package.json imports okunmuyor     3 failed    M7 tsconfig paths okunmuyor      38 failed
M3 çok hedef → ilk src hedefi         1 failed    M8 çoklu * kabul                  1 failed
M4 extends yok sayılıyor              1 failed    M9 hedef * sayısı denetlenmiyor   1 failed
M5 baseUrl yok sayılıyor              1 failed
```
M8 ilk turda hayatta kaldı. Sebebi test girdisiydi: hedefin `*` sayısı da uyuşmuyordu, bu yüzden hatayı başka bir koşul yakalıyordu. Girdiyi yalıttım (`'~a/*/b/*': ['./src/*/*']`) ve M9'u ekledim. İkisi de artık KIRMIZI. Test gevşetilmedi.

### 2.3 Gerçek ağaçta FP — `ekler/gates.txt`
`SCAN: files=37 keys=128 findings=0`. Bekçi 59/59. `aliasProblems(real) = []`. N-1 gerçek ağaçta 0 ikiz.

### 2.4 Süre — `ekler/timing-ab.txt`, `timing-forks.txt`
Dev ve yeni bekçi dönüşümlü koşuldu, aynı yük altında (load 13–20, 12 çekirdek). `process.cpuUsage`, `scanSrc()` çevresinde ölçüldü:
```
threads: dev 1017/1073/1259/1192/1241/1234 ms (ort. ≈1169) · yeni 1114/1215/1062/1248/1122/1195 ms (ort. ≈1159)
forks:   dev 1026/1158/1201/1521/1482        · yeni 1029/1134/1495/1484/1569
```
**Değişikliğin maliyeti ölçülemiyor; A/B aynı bantta.** Mutlak değer bu yükte ≈1.0–1.5 sn. Yani ≤1 sn hedefini bu anki makine yükünde **dev'in kendisi de tutmuyor**. devop-fb aynı algoritmayı İNCELEME-89'da 0.58–0.82 sn ölçmüştü. Alias eşleme `specBase` başına tek bir döngü (bugün 1 alias). Tablo her overlay için bir kez kuruluyor. `/usr/bin/time`: bekçi dosyasının tamamı user 2.35 s, real 1.94 s.

### 2.5 Kapılar, temiz ağaç — `ekler/gates.txt`, `fullrun-summary.txt`, `build-tail.txt`, `db-prep.txt`
DB CI sırasıyla hazırlandı: `db push` → `db:rls-role` → 40 migrasyon ×2 → `db:rls` (28 → 112 politika) → `db:generate` → seed. `CI=true`, `AUTH_SECRET` ci.yml fixture'ı. Bu makinede `psql` yok, bu yüzden `PSQL=` kaba yönlendiren bir sarmalayıcıya verildi.
```
VITEST_EXIT=0   Test Files 296 passed | 2 skipped (298) · Tests 3708 passed | 41 skipped (3749)
LIVESKIP_EXIT=0 (atlamaların hepsi "allowed")
✓ tests/server-action-rbac-guard.test.ts (59 tests) 1087ms
TSC_EXIT=0   LINT_EXIT=0   BUILD_EXIT=0 ✓ Compiled successfully
```
Kapılardan sonra yalnız bir yorum satırı ve bir test başlığı değişti. Son dosyada bekçi 59/59, eslint 0, tsc 0 olarak yeniden koşuldu.

## 3) Değişen dosyalar
- `tests/server-action-rbac-guard.test.ts`: alias tablosu (`aliasTableOf`/`aliasBase`), `specBase(from, spec, overlay)`, D-4 mesajı, 7 yeni test, belge satırı.
- `docs/agent-results/TASK-MUO827UIF3IHL-se-fb.md` ve `…-se-fb-ekler/`.

## 4) Riskler
- **Bilinçli fail-closed katılık:** Node'un geçerli saydığı `"#a/*": "./src/lib/a.js"` (yıldızsız hedef) ve tsconfig `extends` bugün paketi KIRMIZI yapar. Bu yanlış pozitif güvenli tarafta. Gelirse mesaj ne yapılacağını söylüyor.
- **Kapsam dışı kalanlar (belgelendi):** bundler düzeyindeki alias'lar (`next.config` `turbopack.resolveAlias` / webpack `alias`) ve `rootDirs` okunmuyor. Bugün `next.config.ts`'de hiçbiri yok (grep). Göreli ya da alias yoluyla src/ dışına giden (ör. `scripts/`) kod, önceden olduğu gibi yürünmüyor.
- `loadModule`'deki "overlay alias tablosunu değiştirdiyse gerçek modülleri yeniden çöz" koşulu doğrudan bir testle kilitli değil. Gerçek ağaç yolu P1 probe'uyla doğrulandı.

## 5) Açık sorular
- Bundler alias'ları (`resolveAlias`) için de bir "yok" beyanı testi istenir mi? Bugün tetiklenmiyor. Ucuz bir metin denetimi yeter.

## 6) Sonraki adım
- Dal dev'e merge edildi. Push yok. İnceleme: bir sonraki FB inceleme turu.
