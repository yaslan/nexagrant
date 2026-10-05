# TASK-MUO12FXI8LDXJ — FB İNCELEME-80 (devop-fb) · RBAC bekçisi fail-closed + yalnız oturum rolü (TASK-MUNY0V7B590EI, se-fb, 8a4382bd + merge 235e3162)

**Durum:** TAMAM
**Karar:** **ONAY (bloke yok).** Y-1 ve Y-2 için bir takip kartı açılmalı. Bunlar bugün gerçek ağaçta tetiklenmiyor, ama "fail-closed" iddiası sanıldığından daha dar. Ö-1 (bekçinin maliyeti 4.5 katına çıktı) aynı karta ya da ayrı bir karta yazılabilir.
**İncelenen:** dev `2b0bbae8`. `235e3162` bu commit'in atası. Scratchpad'de ayrı bir worktree kullandım (`wt80`, detached). İzole DB: `devopfb80-pg` konteyneri, `127.0.0.1:55580`. Paylaşılan `:5433`'e hiç bağlanmadım.
**Kod değişmedi.** Mutant ve probe dosyaları yalnız worktree'de koşuldu, sonra silindi. `git status` temiz. Düzenekler `ekler/` altında.
**Ekler:** `docs/agent-results/TASK-MUO12FXI8LDXJ-devop-fb-ekler/`

**Platform beyanı:** Her şeyi mac'te doğruladım (Darwin 27, Node, vitest 4.1.11, Postgres 16 + pgvector Docker'da, APFS büyük/küçük harfe duyarsız).
- Windows ve Linux'ta koşmadım, çünkü bu makinede yalnız mac var. CI (ubuntu-latest) aynı dosyayı koşuyor. Diğer platformlarda ne olacağını koddan okudum:
- **Yol ayırıcı.** `scanSrc` `path.sep`'i `/`'ye çeviriyor. `resolveSpec` göreli yolu `path.posix` ile çözüyor. Dosya varlığını `path.join(SRC, …)` ile, yani platformun ayırıcısıyla soruyor. Bu yüzden Windows'ta da aynı modül kimliklerini üretmesi gerekir. Specifier içinde `\` kullanmak TS/Next'te zaten geçerli değil.
- **Büyük/küçük harf** (§1.4). mac'te `@/lib/I80/RealImpl` dosyayı buluyor ve bekçi yazmayı KIRMIZI gösteriyor. Linux'ta aynı specifier çözülemez: bekçi onu src/ dışı sayar ve sessiz kalır. Ama o durumda Linux'ta tsc ve build de modülü bulamayıp kırılır. mac'te de tsc TS1261 veriyor (kanıt aşağıda). Yani harf farkı bir kaçış değil, en fazla mac'te bir FP.

## Özet

| # | Önem | Bulgu | Bloke? |
|---|---|---|---|
| Y-1 | Orta | `allowJs: true` ve `include: **/*.mts` açık. Buna rağmen bekçi src/ altındaki `.js`, `.jsx`, `.mjs` ve `.mts` kaynaklarını görmüyor. (a) Böyle bir modüle giden import "src dışı" sayılıyor, fail-closed yerine sessiz geçiyor. (b) `.js` bir `'use server'` dosyası hiç taranmıyor. Gerçek ağaçta probe'la kanıtladım: tsc 0, eslint 0, bekçi 44/44 YEŞİL | Hayır. Bugün src/ altında `.js`/`.mts` kaynak yok (yalnız `.json`) |
| Y-2 | Orta-Düşük | Dinamik `import()` specifier'ı sabit metin olsa bile, izlenen üç biçimin dışında sessiz kalıyor. Kaçan biçimler: koşullu `flag ? await import(a) : await import(b)` (C1), `await (flag ? import(a) : import(b))` (C4), üst düzey `const lazy = import(…)` (C5), `Promise.all([import(…)])` (C6). Belge yalnız "hesaplanmış specifier"ı kapsam dışı sayıyor | Hayır. Gerçek ağaçta 'use server' modüllerinde tek dinamik import var: m11 → `lib/system-scope` (TRUSTED) |
| D-1 | Düşük | FP: bütün değer yürüyüşü. readOnly action `repo.find()` ya da `Repo.find()` çağırıyor ve aynı nesnede ya da sınıfta bir `save()` yazması da var. Bekçi bunu KIRMIZI gösteriyor (F1/F2). Namespace biçimi (`ns.read()`) ise doğru sonuç veriyor (F3) | Hayır. Güvenli taraf, gerçek ağaçta FP 0 |
| D-2 | Düşük | `@/` specifier'ı normalize edilmiyor. `can`'i `'@/lib/./rbac'`'tan import etmek meşru bir TS; bekçi bunda kontrolü tanımıyor. Mesaj da yanıltıcı: "write action without a role check" (P6). Göreli yollar `path.posix.normalize` ile çözülüyor, alias çözülmüyor | Hayır. Güvenli taraf |
| D-3 | Düşük | Geliştirici mesajı. Fail-closed yolu `via ?wipe (lib/x)`, `via ?then`, `via ?*` gibi etiketler basıyor. "Bekçi `wipe`'ı çözemedi, modülün tamamını gezdi" demiyor | Hayır |
| Ö-1 | Öneri | Maliyet. Gerçek ağaç taraması düzeltmeden önce ~1.8 sn CPU sürüyordu, şimdi ~6.7–8.8 sn (≈4.5×). Tam koşuda bekçi dosyası 38 ile 74 sn sürdü. En yavaş tek test 13.4 sn, `testTimeout` ise 30 sn. se-fb'nin "1.35 sn" ölçümünü tekrar üretemedim: kendi commit'i `8a4382bd`'de de 7.9–8.8 sn çıkıyor | — |
| ✓ | — | Kendi 45 mutantımın 35'i beklendiği gibi. Barrel/`export … from`: 9/9 KIRMIZI. Tip-only: 6/6 FP yok. JSON: 3/3 FP yok. Oturum rolü: 5/5 KIRMIZI. S6 belgedeki kapsam dışı kalan biçim | — |
| ✓ | — | İstisna listesi dar. Bekçinin atladığı yerler dört tane: `ALLOWED`, `TRUSTED` (5 dosya), `'use server'` modülleri ve src/ dışı modüller. TRUSTED içinde gerçek Prisma yazması yalnız `lib/auth.ts` oturum açma callback'lerinde var (§3) | — |
| ✓ | — | Tam `vitest run` iki kez yük altında koşuldu. Bekçi (44) ve `server-action-rbac` (65) iki koşuda da yeşil. Kırmızılar yüke bağlı bütçe testleri, tek başına koşunca 3/3 yeşil. tsc, lint ve build EXIT=0 | — |

## 1) Kendi mutantlarım

Düzenek bekçinin export ettiği `findingsFor(file, text, overlay)`'i çağırıyor. Üç düzenek dosyası var:
- `ekler/zz-devopfb-i80-mutants.test.ts` (45 satır, overlay'le).
- `ekler/zz-devopfb-i80-real.test.ts` (gerçek dosyalarla, overlay yok).
- Çıktılar: `ekler/m1.txt` ve `ekler/real.txt`.

Her satır ya **açık** (KIRMIZI beklenir) ya **meşru** (YEŞİL beklenir, yani FP olmamalı) olarak işaretli. Pozitif kontroller: K1 (readOnly doğrudan yazma) KIRMIZI, K2 (iyi biçim) YEŞİL.

### 1.1 Barrel ve `export … from`: 9/9 KIRMIZI, bekçi sağlam
```
B1 export { default as w } from './impl' (anonim default fn)  → KIRMIZI … via default (lib/i80/b1impl)
B2 iki export * barrel, ad ikincide                            → KIRMIZI … via wipe (lib/i80/b2b)
B3 iç içe export * (3 kat)                                     → KIRMIZI
B4 export { wipe as default } from + import w from             → KIRMIZI
B5 import * as ns + barrel export * → ns.wipe()                → KIRMIZI
B6 barrel alias yolu: export { wipe } from '@/lib/…'           → KIRMIZI
B7 barrel export type {…} + değer export                       → KIRMIZI
B8 export * → export * as ns → import {ns}; ns.wipe            → KIRMIZI
B9 döngüsel barrel (a→b→a), ad yok → fail-closed               → KIRMIZI … via ?wipe (lib/i80/b9a)
```

### 1.2 Dinamik ve koşullu import (Y-2)
```
C1 koşullu: const m = flag ? await import(a) : await import(b) → YEŞİL (kaçtı)
C2 import(…).then((m) => m.wipe(id))                           → KIRMIZI … via ?then   (tesadüfen: `.then` bilinmeyen ad → tüm modül)
C3 let m = await import(…); m.wipe()                           → KIRMIZI … via ?*
C4 const { wipe } = await (flag ? import(a) : import(b))       → YEŞİL (kaçtı)
C5 üst düzey const lazy = import(…); (await lazy).wipe()       → YEŞİL (kaçtı)
C6 Promise.all([import(a)]) → [m]                              → YEŞİL (kaçtı)
C7 (await import(…)) as any; m.wipe()                          → KIRMIZI
C8 koşullu statik (flag ? wa : wb)(id)                         → KIRMIZI
```
**Kök neden:** `namespaceOf` yalnız üç biçimi izliyor: doğrudan `import('<literal>')`, bunu tutan bir `const`, ya da `import * as`. Koşul (`?:`), dizi ya da üst düzey değer bu zinciri kesiyor. Walker ise `import()` çağrısının kendisinde hiçbir şey yapmıyor (`node()` bu çağrıyı geçiyor).

**Öneri:** src/ altına çözülen sabit bir `import('<literal>')`, izlenen bir biçimde tüketilmiyorsa `enterModule(target, '*')` ile tüm modül sayılsın. Bugün 'use server' modüllerinde tek dinamik import var ve TRUSTED bir modüle gidiyor. Bu yüzden bu kuralın bugünkü FP maliyeti 0.

### 1.3 Tip-only ve JSON: FP yok (9/9 YEŞİL)
```
T1 import type {Row} from yazan modül           → YEŞİL
T2 import { type Row, read }                    → YEŞİL
T3 import { Row } (tip, `type`'sız) yalnız tip konumunda (`: Row`, `satisfies`) → YEŞİL
T4 class R implements ImportedInterface         → YEŞİL
T5 enum değer import                            → YEŞİL
T6 type Mod = typeof import(…)                  → YEŞİL
J1 import data from '@/contracts/…json'         → YEŞİL
J2 import … with { type: 'json' }               → YEŞİL
J3 await import('@/locales/en/settings.json')   → YEŞİL
```

### 1.4 Yol, alias, uzantı ve harf varyantları (gerçek dosyalarla, `ekler/real.txt`)
```
R0   kontrol                  @/lib/i80/realimpl                → KIRMIZI
P1   alias içinde '..'        @/lib/../lib/i80/realimpl         → KIRMIZI (… lib/../lib/i80/realimpl.ts:2 — normalize edilmemiş kimlik)
P1b  alias içinde './'        @/lib/./i80/realimpl              → KIRMIZI
P4   göreli 5×'..'            ../../../../../lib/i80/realimpl   → KIRMIZI
P8   büyük harf (mac)         @/lib/I80/RealImpl                → KIRMIZI  (tsc: TS1261 "differs … only in casing")
X1   .js kaynak (allowJs)     @/lib/i80/legacy                  → YEŞİL (kaçtı)
X1b  .js kaynak, uzantılı     @/lib/i80/legacy.js               → YEŞİL (kaçtı)
X3   .mts kaynak              @/lib/i80/modern.mjs              → YEŞİL (kaçtı)
K1   iyi biçim db=@/lib/DB                                      → YEŞİL
K2   iyi biçim rbac=@/lib/RBAC                                  → KIRMIZI "write action without a role check" (mac FP; tsc zaten TS1261)
```
Overlay'li P1/P4 satırları `m1.txt`'te YEŞİL görünüyor. Bu düzenekten kaynaklanan bir yapaylık:
- P1'de overlay anahtarı normalize edilmiş, specifier edilmemiş.
- P4'te `..` sayısını yanlış yazmışım.

Gerçek dosyalarla koşunca ikisi de KIRMIZI, yani bekçinin bir açığı değiller.

**Y-1'i gerçek ağaçta kanıtladım.** Ağaca geçici olarak üç dosya ekledim:
- `src/lib/i80/legacy.js` (yazma yapıyor),
- `src/lib/i80/modern.mts` (yazma yapıyor),
- `src/app/[locale]/i80/actions.js`: `'use server'`, `readOnly: true` + `prisma.evidence.delete`.

Bir de `ts-actions.ts` ekledim: readOnly bir action, ilk iki dosyadaki `wipe`'ı çağırıyor.

```
npx tsc --noEmit            → çıktı yok (0 hata)
npx eslint src/app/[locale]/i80 src/lib/i80  → LINT_EXIT=0
npx vitest run tests/server-action-rbac-guard.test.ts → Tests 44 passed (44)
```
Probe dosyaları sonra silindi. Aynı düzenekte `@/lib/I80/RealImpl` satırı varken tsc TS1261 veriyordu ve bekçi KIRMIZI'ydı. Bu da harf varyantının bir kaçış olmadığını gösteriyor.

**Öneri** (en ucuzu 1. madde):
1. Bekçiye bir test eklensin: "src/ altında `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts` ya da `.cts` kaynak yok".
2. Ya da `EXTENSIONS` ve `sourceFiles` bu uzantıları da tanısın.
3. Kısa vadede `resolveSpec`, `@/` ya da `.` ile başlayan ama çözülemeyen bir specifier için `null` yerine bir bulgu dönsün.

### 1.5 Oturum rolü: 5/5 KIRMIZI, 1 biçim belgede kapsam dışı
```
S1 {...scope, role: input.role} kopyası          → KIRMIZI
S2 iç blokta gölgeleyen const role = input.role → KIRMIZI
S3 scope.role ||= input.role                    → KIRMIZI
S4 auth() sahte modülden                        → KIRMIZI
S5 kapanışta scope.role = x                     → KIRMIZI
S6 const s2 = scope; s2.role = x                → YEŞİL — belgede ("through another alias of it") yazılı, beklenen
```

### 1.6 FP: bütün değer yürüyüşü (D-1)
```
F1 readOnly repo.find() (nesnede save() de var)   → KIRMIZI … via repo (lib/i80/f1impl)
F2 readOnly Repo.find() (sınıfta static save())   → KIRMIZI … via Repo
F3 readOnly ns.read() (modülde wipe() de var)     → YEŞİL
F4 readOnly barrel export * üzerinden read()      → YEŞİL
```
**Öneri:** Üye adı biliniyorsa (`repo.find`), nesne ya da sınıf değerinde yalnız o üye gezilsin. Namespace'te bu zaten böyle yapılıyor.

## 2) Geliştirici hata mesajı (D-2, D-3)

**İyi olanlar:**
- Mesajlar yazmanın dosyasını ve satırını veriyor, örneğin `lib/i80/b2b.ts:2, via wipe (lib/i80/b2b)`.
- readOnly ile "kontrolden önce" durumlarını ayırıyor.
- L7+ derinlik mesajı açık.

**Zayıf olanlar:**
- Fail-closed yolu yalnız `?wipe`, `?then` ya da `?*` basıyor. Geliştirici neden bütün modülün gezildiğini anlamıyor. Önerilen metin: `could not resolve "wipe" in lib/x — walked the whole module (fail-closed); export it as a function`.
- D-2'de gerçekten bir `can` kontrolü olduğu halde mesaj "without a role check" diyor. `@/` specifier'ına `path.posix.normalize` uygulanırsa bu düzelir.

## 3) Fail-closed istisna listesi: dar

Bekçinin girmediği yerler:
- **`ALLOWED`:** 16 anahtar, her birinin gerekçesi yazılı. Eskiyen bir anahtar suite'i kırıyor.
- **`TRUSTED`:** 5 dosya, toplam 1686 satır. İçlerindeki yazma çağrılarını grep'le saydım:
  - `db.ts:170` ve `system-scope.ts:152`: `SELECT set_config` / `enter_system_scope`. RLS kapsamını ayarlıyorlar, veri yazmıyorlar.
  - `auth.ts:459–534`: `tx.user/tenant/workspace/membership/auditEvent.create`. Bunlar yalnız ilk oturum açma callback'inde çalışıyor. Bir action bunlara ancak `signIn` üzerinden ulaşabilir, o action'lar da `ALLOWED`'da.
  - `tenant.ts` ve `rbac.ts`: yazma yok.
- **`'use server'` modülleri:** Kendi uç noktalarında yargılanıyorlar. Çağrılan action kendi `requireTenantAction` kapısını yine koşturuyor.
- **src/ dışı modüller:** Y-1 bu kategorinin sanılandan geniş olduğunu gösteriyor.

se-fb yeni bir istisna listesi açmamış. Gerçek ağaçta çözülemeyen import sayısı 0. Taramam aynı sonucu verdi: `files=42 keys=128 findings=0`.

## 4) Bekçinin süresi (Ö-1)

**CPU süresi (yükten bağımsız).** Gerçek ağacın tam taraması, `process.cpuUsage`, tek overlay ile (`scanSrc` gibi önbellekli). Kaynak: `ekler/guard-cpu-compare.txt`.
```
8a4382bd^ (düzeltme öncesi)   cpu=1810ms, 1778ms
8a4382bd  (se-fb)             cpu=8845ms, 7881ms
2b0bbae8  (dev, bugün)        cpu=8461ms, 8774ms, 7199ms, 6704ms
```
**Duvar süresi:**
- Tam koşuda bekçi dosyası: koşu 1'de **38.2 sn** (load 12→51), koşu 2'de **74.4 sn** (load 51→104).
- Aynı dosya tek başına, tam koşuyla eşzamanlı: 110, 132 ve 163 sn (`guard-timing.txt`).
- En yavaş testler: "stays green for a check in each accepted shape" **13.4 sn**, G2 11.9 sn, G9 7.2 sn. `testTimeout` 30 sn.

Bu ölçüm sırasında bir yan olay oldu. Kendi zamanlama testimde üç taramayı arka arkaya koştum, toplam duvar süresi ~33.7 sn tuttu ve 30 sn sınırını aştı. Sonuç "1 failed | 44 passed" çıktı. Bekçinin kendi testleri kırmızı değildi. Tekrarlarda testime `timeout: 300_000` verdim ve hepsi yeşil geçti.

**Sonuç:** se-fb'nin "1.35 sn → tüm dosya ~4 sn" iddiasını bu makinede tekrar üretemedim. Maliyet artışı sonraki merge'lerden değil, se-fb'nin commit'inden geliyor. Bugün kırmızı üretmiyor, ama tek test yük altında 13 sn'yi buluyor, yani load ≥100'de 30 sn sınırına yaklaşan bir flake adayı.

**Öneri:** Bir `--cpu-prof` profili alınsın. Benim denemem profil dosyası üretmedi. Aday sıcak noktalar şunlar:
- `writtenTo`: her `sessionRole`/`sessionValue` çağrısında fonksiyonun tüm gövdesini geziyor.
- `localBinding`: her çağrıda üst kapsamları yeniden tarıyor.
- Mutant testlerindeki tüm-modül yürüyüşleri.

Ara çözüm: `writtenTo` ve `localBinding` sonuçlarını bir WeakMap'te önbelleğe almak.

## 5) Tam `vitest run`, yük altında, izole DB (`ekler/fullrun.out`, `fullrun-summary.txt`)

DB'yi CI'daki sırayla hazırladım (`ekler/db-prep.txt`): `db push` → `db:rls-role` → 40 migrasyon ×2 → `db:rls` (28 → 112 politika) → seed.
Env: `CI=true`, `AUTH_SECRET` ci.yml'deki fixture değeri, `DATABASE_URL*` → `:55580`.
```
== run 1 start 14:44:49 load 12.64 → end 14:47:07 load 51.58
 Test Files  1 failed | 281 passed | 2 skipped (284)
      Tests  1 failed | 3409 passed | 30 skipped (3440)     LIVESKIP_EXIT=0
== run 2 start 14:47:07 load 51.58 → end 14:51:37 load 104.63
 Test Files  2 failed | 280 passed | 2 skipped (284)
      Tests  2 failed | 3408 passed | 30 skipped (3440)     LIVESKIP_EXIT=0
server-action-rbac-guard (44) + server-action-rbac (65): iki koşuda da passed
```
**Kırmızıların hepsi bu değişiklikle ilgisiz.** Hepsi yüke bağlı bütçe testi:
- Koşu 1: `src/lib/agency/funnel.attack.test.ts` "300 random small tables", 37.1 sn. Sınır 30 sn.
- Koşu 2:
  - `src/lib/agency/report.test.ts` "300 random tables", 165.8 sn. Bu İNCELEME-74'teki Ö-1 ile aynı.
  - `tests/rag-pdf-worker-isolation.test.ts`, 3116 ms. Bütçe 3000 ms.

Aynı üç dosyayı tek başına koştum (load 68): `Test Files 3 passed (3) · Tests 54 passed (54)` (`ekler/flaky-rerun.txt`).

## 6) Kapılar (`ekler/gates.txt`, `build.txt`, `build-tail.txt`)
```
TSC_EXIT=0   LINT_EXIT=0      (load 48 → 120)
BUILD_EXIT=0 ✓ Compiled successfully in 48s   (load 36 → 21)
```
Build'in ilk denemesi ortam yüzünden düştü. Worktree'deki `node_modules`, ana repoya bir symlink'ti ve Turbopack "Symlink … points out of the filesystem root" hatası verdi. Worktree'ye `pnpm install --frozen-lockfile --prefer-offline` yaptıktan sonra build 0 ile geçti.

## 7) Değişen dosyalar
- `docs/agent-results/TASK-MUO12FXI8LDXJ-devop-fb.md` ve `…-devop-fb-ekler/`. Yalnız rapor ve kanıt. Uygulama ve test kodu değişmedi.

## 8) Riskler
- **Y-1:** src/ altına bir `.js` ya da `.mts` dosyası girdiği gün, readOnly bir action'dan yazma ve taranmayan bir `'use server'` uç noktası sessizce geçer. Bu dosyayı ekleyen de ajan olabilir, geliştirici de.
- **Ö-1:** Bekçi pahalı. CI'ın 2 çekirdeğinde ve yük altında tek bir test 30 sn sınırına yaklaşabilir.
- **D-1:** Nesne ya da sınıf "repository" kalıbı ileride FP üretir. Güvenli tarafta, ama geliştiriciyi `ALLOWED`'a istisna eklemeye itebilir.

## 9) Açık sorular
- Y-1, Y-2 ve D-1..D-3 tek bir takip kartında mı toplansın? Ö-1 (profil + önbellek) ayrı bir kart mı olsun?
- Y-1 için hangisi seçilsin: "src/ altında JS/MTS yok" testi (en ucuz), yoksa uzantı desteği?

## 10) Sonraki adım
- Takip kartını açmak lider/PM'in işi. Ben kart açmadım.
- Push yok. `devopfb80-pg` konteyneri ve scratchpad worktree'si raporun commit'inden sonra kaldırılacak.
