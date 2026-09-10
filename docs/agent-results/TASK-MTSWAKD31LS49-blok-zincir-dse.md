# TASK-MTSWAKD31LS49 — `noUncheckedIndexedAccess` ölçüm + plan

Bu tur **ölçüm ve planlama**dır — hiçbir kaynak dosya düzeltilmedi. Yalnızca `tsconfig.json` geçici olarak değiştirilip `pnpm typecheck` çalıştırıldı, çıktı kaydedildi, sonra **tsconfig.json ilk haline geri alındı**. `git diff -- tsconfig.json` şu an boş (kanıt aşağıda).

## 1) Ölçüm yöntemi

```bash
# 1. tsconfig.json compilerOptions içine tek satır eklendi:
"noUncheckedIndexedAccess": true,

# 2. pnpm typecheck > tsc-nuia-raw.log 2>&1  → exit 2, 171 "error TS" satırı
# 3. tsconfig.json HEMEN geri alındı (Edit ile aynı diff'in tersi)
# 4. git diff --stat -- tsconfig.json → BOŞ (temiz)
# 5. Kontrol: pnpm typecheck (bayraksız) → exit 0 (baseline zaten yeşil)
```

Neden geri alındı ve açık bırakılmadı: bu çalışma ağacında **blok-zincir-dev** ve **geli-tirici** aynı anda kod yazıyor (`git status` başında 20+ M dosya, aktif branş `dev`). `tsconfig.json`'da açık bırakılan bir global derleyici bayrağı onların `pnpm typecheck`/`pnpm gate` çalıştırmasını anında kırar — onlar bunu istemeden miras alır. Bu yüzden bayrak yalnızca ölçüm süresince (tek `pnpm typecheck` çağrısı boyunca) açık kaldı.

Ayrıca kontrol edildi: şu an git status'ta değişmiş dosyalar arasında `invoice-writer.ts`, `system-alert.ts`, `inngest/jobs/index.ts`, `tests/invoice-fx-tcmb.test.ts` var (başka ajanların aktif işi) — bunların **hiçbiri** aşağıdaki 171 hatalık listede yok. Yani bu planın dilimleri, o dosyalarla çakışmıyor.

## 2) Toplam yüzey

**171 hata TS, 33 dosya, exit code 2.** (`grep -c "error TS" tsc-nuia-raw.log` = 171)

### Dizin bazında hata sayısı
| Dizin | Dosya sayısı | Hata sayısı |
|---|---|---|
| `prisma/` | 1 | 4 |
| `scripts/` | 3 | 23 |
| `src/app/[locale]/**` | 6 | 10 |
| `src/components/` | 2 | 6 |
| `src/lib/` (prod kod) | 5 | 19 |
| `src/lib/` (`*.test.ts`) | 5 | 84 |
| `src/modules/` (prod kod) | 2 | 4 |
| `src/modules/` (`*.test.ts`) | 1 | 2 |
| `tests/` | 8 | 19 |
| **Toplam** | **33** | **171** |

### Dosya bazında (5+ hata olanlar)
| Dosya | Hata |
|---|---|
| `src/lib/iyzico.test.ts` | 56 |
| `scripts/verify-deployed-bytecode.ts` | 19 |
| `src/lib/billing/catalog.test.ts` | 12 |
| `src/lib/calendar/__tests__/encryption.test.ts` | 7 |
| `src/lib/gates/evaluate.ts` | 6 |
| `src/app/[locale]/(marketing)/blog/[slug]/page.tsx` | 5 |
| `src/components/UserMenu.tsx` | 5 |
| `src/lib/llm.embed.test.ts` | 5 |
| `tests/users-scheduled-deletion.test.ts` | 5 |

Kalan 24 dosya 1–4 hata arası. Tam liste `tsc-nuia-raw.log`'da (scratchpad — kalıcı değil, aşağıdaki kova tablosu kanıt olarak yeterli).

## 3) Üç kova (dosya + örnek satır ile kanıtlı)

**Kova A — gerçek hata gizleyen (dizi/kayıt erişimi gerçekten undefined dönebilir, kod bunu varsaymıyor):**
- `src/app/[locale]/(app)/[workspace]/evidence/EvidenceForm.tsx:95` — `e.target.files[0]`: yalnız `e.target.files` truthy kontrol ediliyor, `files.length` değil; boş `FileList` durumunda gerçekten `undefined` olabilir.
- `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx:213` — `setNoteInputs` callback'inin dönüş tipi `prev[oppId]` tanımsızken spread ediyor; bu tek satırlık guard değil, state şeklinin (`Record<string, {text,authorId}>` vs `authorId` opsiyonel) yeniden düşünülmesini gerektiriyor (TS2345, tip uyuşmazlığı — index erişimi değil).
- Bunun dışında kalan tüm prod-kod hataları incelendi ve **hiçbiri** bu kovaya girmiyor — hepsi B veya C'ye düşüyor (aşağıda gerekçeli).

**Kova B — gürültü (test dosyaları, sabit-uzunluklu dizi/tuple):**
- Tüm `*.test.ts` / `*.spec.ts` dosyaları (14 dosya, **105 hata**, toplamın %61'i): `src/lib/iyzico.test.ts:89` gibi satırlar `db.$transaction`, `db.tenant.findUnique` — bunlar `vitest-mock-extended` ile üretilen mock nesnesinin **index signature**'ından geliyor (Prisma client mock'u), gerçek runtime'da hiç undefined olmuyor; test dosyalarındaki dizi erişimleri de fixture verisi (`firstTopic = topics[0]` gibi, dizinin dolu olduğu test kurulumunda garanti).
- `scripts/verify-deployed-bytecode.ts` (19 hata): Keccak-256 permütasyonu, `BigUint64Array(25)` / `BigUint64Array(5)` — döngü sınırları algoritma sabitleri (`< 25`, `< 5`, `blockSize/8`) ile dizi boyutuna birebir eşit; klasik "sabit boyutlu tipli dizi" — kanıtlanabilir güvenli, "kesin uzunluklu tuple" ile aynı kategori.
- `src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx:446` — `TAXONOMY_CATEGORIES[2]` fallback; yorum satırı "8 TAXONOMY CATEGORY CARDS" diyor, sabit 8 elemanlı dizi → index 2 her zaman güvenli.

**Kova C — tek satırlık guard ile geçecek olanlar (guard zaten yanda var, TS bunu bağlayamıyor):**
Bu, prod-kod hatalarının büyük çoğunluğu (19 + 10 + 6 + 23'ün neredeyse tamamı). Ortak desen: bir `.length > 0` / `.length >= N` / `!== -1` kontrolü birkaç satır üstte zaten var, ama TS `noUncheckedIndexedAccess` altında `.length` kontrolünü index erişimiyle ilişkilendirip daraltamıyor (bilinen TS sınırlaması).
- `src/lib/auth.ts:379-381` — `dbUser.memberships[0]`, üstte `if (dbUser.memberships.length > 0)` var.
- `src/lib/gates/evaluate.ts:160-161` — `opp.evaluations[opp.evaluations.length-1]`, üstte `if (opp.evaluations.length > 0)` var. **Not:** burası G0–G4 kapı mantığının kalbi; guard eklerken (`!` yerine erken-dönüş tercih edilmeli) davranış değişmemeli — bu yüzden Kova C'de ama Dilim 3'te en dikkatli gözden geçirilmesi gereken dosya.
- `src/lib/blog.ts:187-189` — `BLOG_POSTS[index]`, üstte `if (index === -1) return undefined` var.
- `src/lib/rag.ts:190,297` — `chunks[i]` sınırlı `for (i=0; i<chunks.length; i++)` döngüsünde.
- `src/modules/m6/server/scoring.ts:229` — `reviewerAverages[i]/[j]` sınırlı nested döngüde.
- `src/modules/m5/server/queries.ts:255` — `current.toISOString()`, `current` bir `Date` döngü değişkeni, hiç undefined olamaz (TS `Date | undefined` çıkarımı yanlış pozitif — büyük olasılıkla döngü değişkeninin `let`/`while` ile yeniden atanmasından kaynaklı bilinen TS control-flow sınırı).
- `src/lib/k2-cordis/partnerProfileJob.ts:88-92` — `orgs[i]/orgs[j]` sınırlı döngüde.
- `src/components/SidebarNav.tsx:20`, `UserMenu.tsx:103,144` — `segments[1]` (`segments.length > 1` kontrollü), `cleanWords[0][0]` (`cleanWords.length >= 2` kontrollü).
- `src/app/[locale]/admin/modules/page.tsx:33` — `initialStates[s.tenantId][s.moduleId]`, üstte `if (!initialStates[s.tenantId]) initialStates[s.tenantId] = {}` var.
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager.tsx:80` — aynı desen (`if (!map[c.seatId]) map[c.seatId] = []`).
- `src/app/[locale]/(marketing)/blog/[slug]/page.tsx:90-118` — regex `match[1]` capture group erişimi; regex'lerin tek zorunlu grubu var (`(.*)`), eşleşme varsa grup her zaman string.
- `scripts/compare-production-backup.ts:231-232` — `args[0]/args[1]`, üstte `if (args.length < 2) process.exit(1)` var.
- `scripts/cordis-import.ts:17,22` — `arg.split('=')[1]`, `startsWith('--dataset=')` zaten `'='` varlığını garanti ediyor.
- `prisma/seed-m6-evaluations.ts:116-199` — `proposals[proposalIndex]` (dizi tam 2 elemanla dolduruluyor, index `e%2`), `reviewer`, `baseScore` — hepsi seed script içinde sabit boyutlu diziler.

**Kova sayısal özet:** A = 2 dosya / ~2 hata (gerçek dikkat gerektiren), B = 15 dosya / ~124 hata (14 test dosyası + verify-deployed-bytecode.ts + evidence-client.tsx'in fallback satırı), C = kalan ~16 dosya / ~45 hata (tek satır guard). *(Kova B'deki 124 sayısı 105 test-hatası + 19 verify-deployed-bytecode'dur; evidence-client.tsx'in 1 hatası ayrıca B'ye sayıldı ama dosyanın geri kalanı A'da değil C'de değerlendirilebilir — bu dosya küçük olduğu için Dilim 2'ye tek parça atandı.)*

## 4) Dilimler (3–4 kart, dosya çakışması YOK)

> **Önemli teknik kısıt:** `noUncheckedIndexedAccess` **tek bir global `tsconfig.json` bayrağı** — bu depoda tek `tsconfig.json` var (proje referansları/alt-tsconfig yok), yani dizine göre "kısmi açık" yapılamaz. Bayrak açıkken `tsc` **tüm** dosyaları birden tarar. Bu yüzden dilimler bayrağı **kapalı tutarak** ilerlemeli: her dilim kendi dosyalarına guard'ları **bayrak olmadan da doğru duracak şekilde** ekler (ör. `if (!x) return`, `?? fallback`, gerekçeli `!`). Bayrağın kendisi yalnızca **son dilim kapandıktan sonra, tek bir commit'te** açılır ve hemen `pnpm typecheck` ile 0 hata doğrulanır.

**Dilim 1 — Ops script'ler + seed** (düşük risk, izole)
- Dizin/dosyalar: `prisma/seed-m6-evaluations.ts`, `scripts/compare-production-backup.ts`, `scripts/cordis-import.ts`, `scripts/verify-deployed-bytecode.ts`
- 4 dosya, 27 hata (23 Kova B/C karışık — çoğu C, `verify-deployed-bytecode.ts`'nin 19'u B)
- Kimse şu an bu dosyalarda çalışmıyor (git status'ta yok).

**Dilim 2 — UI katmanı (app router + components)**
- Dizin/dosyalar: `src/app/[locale]/**` (6 dosya), `src/components/SidebarNav.tsx`, `src/components/UserMenu.tsx`
- 8 dosya, 16 hata. `EvidenceForm.tsx` ve `board.tsx` Kova A — bu ikisi gerçek inceleme ister, geri kalanı C.

**Dilim 3 — Çekirdek iş mantığı (lib + modules, prod kod)**
- Dizin/dosyalar: `src/lib/auth.ts`, `src/lib/blog.ts`, `src/lib/gates/evaluate.ts`, `src/lib/k2-cordis/partnerProfileJob.ts`, `src/lib/rag.ts`, `src/modules/m5/server/queries.ts`, `src/modules/m6/server/scoring.ts`
- 7 dosya, 23 hata (hepsi Kova C ama **en yüksek dikkat** gerektiren dilim: `auth.ts` oturum/tenant seçimi, `gates/evaluate.ts` G0–G4 kapı mantığı — guard eklerken davranışı bozmamak için her dosyaya en az bir birim test eşlik etmeli, CLAUDE.md madde 5'teki "her kapı kuralı için birim test zorunlu" kuralı zaten bunu istiyor).

**Dilim 4 — Test dosyaları (repo geneli)**
- Dizin/dosyalar: `src/lib/iyzico.test.ts`, `src/lib/billing/catalog.test.ts`, `src/lib/calendar/__tests__/encryption.test.ts`, `src/lib/llm.embed.test.ts`, `src/lib/rag.test.ts`, `src/modules/m2/server/actions.test.ts`, `tests/*.test.ts`, `tests/e2e/rls.spec.ts`, `tests/modules/m7.test.ts` (14 dosya)
- 14 dosya, 105 hata (tamamı Kova B, mekanik). Hacim en büyük dilim (%61) ama risk en düşük — mock/fixture erişimi, prod'a gitmiyor. **Bu dilimin sonunda bayrak kalıcı açılır.**

**Toplam kontrol:** 27 + 16 + 23 + 105 = 171 ✓. Dilimler arası ortak dosya yok (her dosya tam olarak bir dilimde).

### Önerilen sıra ve bayrağın açılma noktası
Değer sırası: **Dilim 3 → Dilim 1 → Dilim 2 → Dilim 4** (önce en kritik iş mantığı, sonra izole script'ler, sonra UI, en sona en büyük ama en düşük riskli test hacmi). Sıra değişebilir çünkü dilimler dosya bazında bağımsız; tek sabit kural: **bayrak yalnızca Dilim 4 birleştikten sonra, ayrı ve tek bir commit'te açılır** — çünkü flag global olduğu için erken açmak, henüz dokunulmamış dilimlerin dosyalarında `pnpm typecheck`'i kırar ve aynı ağaçta çalışan blok-zincir-dev / geli-tirici'nin kapısını kilitler (görev talimatındaki uyarı burada tam olarak geçerli).

## 5) Platform beyanı
Ölçüm **macOS (Darwin 25.6.0, darwin/arm-ish shell zsh)** üzerinde yapıldı: `pnpm typecheck` (yerel `tsc --noEmit`) çalıştırıldı. Dokunulan tek şey `tsconfig.json`'daki bir derleyici bayrağı ve ölçüm çıktısı — platforma bağlı hiçbir kod yolu (süreç öldürme, dosya yolu ayracı, kabuk komutu, DPI/ekran, izin) bu görevde değişmedi. Windows/Linux'ta `tsc` çıktısı aynı olur (TypeScript derleyicisi platformdan bağımsız); doğrulanmadı ama kod tarafında platforma özgü bir fark beklenmiyor.

## 6) Riskler / açık sorular
- Kova C'deki "tek satırlık guard" iddiası, guard'ın **doğru şekilde** eklenmesi şartına bağlı — `!` (non-null assertion) her yerde en güvenli seçim değil; `auth.ts` ve `gates/evaluate.ts` gibi dosyalarda erken-dönüş/anlamlı hata tercih edilmeli (Dilim 3 raporunda ayrıca not edildi).
- `board.tsx` (Kova A) tek satırla geçmiyor — state tipi netleştirilmeli, Dilim 2'ye "büyük" bir alt-görev olarak düşülmeli.
- Bu rapor **düzeltme içermiyor**; tsconfig.json bugün görevin başındaki haliyle aynı (git diff boş, madde 1'de kanıtlı).

## 7) Sonraki adım
4 dilim ayrı kart olarak Task Board'a açılabilir (Dilim 3 → 1 → 2 → 4 sırasıyla), her kartın DoD'una "flag hâlâ kapalı, `pnpm typecheck` bayraksız yeşil" ve son kartta ayrıca "flag açıldı + `pnpm typecheck` 0 hata" eklenmeli.
