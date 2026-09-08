# TASK-MTSJHTJZSCILI — `prisma-override.d.ts` kaldırıldı, arkasındaki hatalar kapandı: doğrulama + kalıcı nöbetçi

**Ajan:** ex-en · **Tip:** tech-debt / P1 · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-08
**Bağımlılık:** TASK-MTSI7YQWUZOFH (ölçüm) — BİTTİ

---

## 1. Ne yapıldı

Karta başladığımda **iş zaten yapılmıştı**: `src/types/prisma-override.d.ts` ve nöbetçisi
`src/types/prisma-override.test.ts`, `905db4b5 refactor(db): remove prisma-override and align
types with generated client` ile kaldırılmış ve `dev`'e inmişti (`git merge-base --is-ancestor
905db4b5 HEAD` → YES). Kaldırma raporu bu kartın değil, **ölçüm kartının** ID'siyle yazılmış:
`docs/agent-results/TASK-MTSI7YQWUZOFH-ex-en-2.md`. Bu yüzden kart `in_progress` görünüyordu.

Kartı "zaten yapılmış" diye kapatmak yerine iki şey yaptım:

**(A) Bağımsız doğrulama — yeşil kapıya değil, yanlışlayıcı proba karşı.**
Önceki rapor "typecheck 0 hata" kanıtı sunuyor. Ama bu kartın misyonu 0 hata DEĞİL: *hayalet
tablo/sütun çağrısının artık reddedilmesi*. 0 hata, tip sisteminin gevşek olduğu bir dünyada da
görülür — nitekim override tam olarak bunu üretiyordu. Bu yüzden 7 maddelik bir **yanlışlayıcı
prob** yazıp derledim (§3).

**(B) Kalıcı nöbetçi eklendi — kaldırmanın geri alınmasını engelleyen tek şey.**
Override silinirken sürüklenme nöbetçisi `src/types/prisma-override.test.ts` de silinmiş.
Bugün repoda, birinin herhangi bir yere yeni bir ambient `declare module '@prisma/client'`
koymasını engelleyen **hiçbir şey yok** — ve bu ihlalin belirtisi kırmızı bir test değil,
*çalışma anında patlayan sorgular üzerinde yeşil kalmaya devam eden testler*. Yeni dosya:
`tests/prisma-delegate-types-are-real.test.ts` (§4).

---

## 2. Başlangıç ölçüsü (kartın istediği "gerçek hata sayısı")

Kart "override'ı kaldır, çıktıyı al, beklenen ~52" diyor. Kaldırma benden önce yapıldığı için
o ilk sayımı ben üretmedim; TASK-MTSI7YQWUZOFH-ex-en-2.md §2 sayımı **~54** olarak raporluyor
(17 mock + ~16 JsonValue + ~14 manuel generic + ~3 PrismaPromise + 2 seed + ~2 enum).
Benim ölçtüğüm şey bugünkü durum:

```
$ npx tsc --noEmit ; echo "TYPECHECK_EXIT=$?"
TYPECHECK_EXIT=0
```
(çıktı 0 satır)

Ayrıca repoda hiçbir ambient Prisma augmentation kalmadığını doğruladım:

```
$ grep -rn "declare module .@prisma/client." --include='*.ts' --include='*.d.ts' --include='*.tsx' . | grep -v node_modules
EXIT=1 (1 = hiç eşleşme yok)

$ ls src/types/
db-rows.ts  html-to-docx.d.ts  json.ts  next-auth.d.ts
```

---

## 3. Kanıt — yanlışlayıcı prob (asıl misyon)

`src/__ghost_probe__/probe.ts` (geçici; iş bitince silindi) — şemada olmayan model/sütunu
hem doğrudan `prisma` hem de **kiracı yolu** `withTenant`/`TenantTx` üzerinden çağırdım:

```
$ npx tsc --noEmit
src/__ghost_probe__/probe.ts(5,17):  error TS2339: Property 'ghostModelThatDoesNotExist' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'.
src/__ghost_probe__/probe.ts(10,49): error TS2353: Object literal may only specify known properties, and 'ghostColumnXyz' does not exist in type 'OpportunityWhereInput'.
src/__ghost_probe__/probe.ts(15,50): error TS2353: Object literal may only specify known properties, and 'ghostColumnXyz' does not exist in type 'OpportunitySelect<DefaultArgs>'.
src/__ghost_probe__/probe.ts(25,53): error TS2339: Property 'ghostModelThatDoesNotExist' does not exist on type 'TransactionClient'.
src/__ghost_probe__/probe.ts(30,85): error TS2353: Object literal may only specify known properties, and 'ghostColumnXyz' does not exist in type 'OpportunityWhereInput'.
src/__ghost_probe__/probe.ts(35,49): error TS2322: Type 'number' is not assignable to type 'string | StringFilter<"Opportunity"> | undefined'.
```

ve `create` gövdesi (cast'siz):

```
src/__ghost_probe__/probe.ts(4,46): error TS2353: Object literal may only specify known properties,
and 'ghostColumnXyz' does not exist in type '((Without<OpportunityCreateInput, OpportunityUncheckedCreateInput>
& OpportunityUncheckedCreateInput) | (Without<...> & OpportunityCreateInput)) & object'.
```

**7/7 prob reddedildi** — hayalet model, `where`/`select`/`data` hayalet sütunu, yanlış skaler
tip, hem `prisma` hem `TenantTx` üzerinden. Kartın misyonu bu ölçüyle karşılandı.

### 3.1 Override geri gelince ne oluyor (RED kanıtı)

Nöbetçinin değeri, ihlalde kırmızıya dönmesiyle ölçülür. Eski dosyayı geçici geri koydum
(`git show 905db4b5^:src/types/prisma-override.d.ts`) ve aynı probu derledim:

```
.prisma-delegate-probe/probe.ts(4,35): error TS2339: Property 'ghostModelThatDoesNotExist' does not exist on type 'PrismaClient'.
src/lib/db.ts(1,29):  error TS2305: Module '"@prisma/client"' has no exported member 'Prisma'.
src/lib/db.ts(29,17): error TS2339: Property '$extends' does not exist on type 'PrismaClient'.
src/lib/db.ts(33,18): error TS7031: Binding element 'args' implicitly has an 'any' type.
```

Dikkat: hayalet **model** yakalanıyor (delegate listesi sayılı olduğu için), ama hayalet
**sütun** `ghostColumnXyz` hata listesinde YOK — yani override altında sütun düzeyi tamamen
kör. Bu, kartın "override'ın ne sakladığı" sorusuna doğrudan, ölçülmüş cevap.

---

## 4. Eklenen nöbetçi: `tests/prisma-delegate-types-are-real.test.ts`

İki testli, dosya adını değil **özelliği** koruyan bir nöbetçi:

1. **`no file augments the generated client module`** — `src/`, `prisma/`, `scripts/`, `tests/`,
   `workers/` altında hiçbir dosya `@prisma/client` modülünü ambient olarak augment edemez.
   (Kendi kendini eşlememesi için desen parça parça kuruluyor.)
2. **`tsc rejects a phantom model and a phantom column`** — davranışsal yarı. Grep bir şekli
   korur, tip sistemini korumaz; bu test repo *içinde* bir dot-dizine atılabilir bir prob yazar,
   **proje tsconfig'ini extend eden** bir config ile derler (böylece repodaki her ambient
   bildirim probun programına girer, `paths` aynı çözülür) ve `tsc`'nin hem hayalet modeli hem
   hayalet sütunu reddetmesini şart koşar. Üçüncü bir assert, aynı delegate üzerindeki
   **geçerli** sorgunun derlendiğini doğrular — yoksa `@/lib/db` hiç çözülmese bile ilk iki
   assert geçer ve nöbetçi hiçbir şey kanıtlamamış olurdu.

Prob dizini `finally` içinde siliniyor; ayrıca `.gitignore`'a eklendi ki öldürülen bir koşu
izlenen artık bırakmasın.

**GREEN/RED kanıtı:**

```
# temiz ağaçta
$ npx vitest run tests/prisma-delegate-types-are-real.test.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)

# eski override geri konunca
 ❯ tests/prisma-delegate-types-are-real.test.ts (2 tests | 2 failed)
     × no file augments the generated client module
     × tsc rejects a phantom model and a phantom column
AssertionError: ... expected [ 'src/types/prisma-override.d.ts' ] to deeply equal []
```

Nöbetçi maliyeti: **2.3 s**.

---

## 5. Kapı — tam koşu (bugün, bu ağaçta)

```
$ npx eslint                       → LINT_EXIT=0
$ npx tsc --noEmit                 → TYPECHECK_EXIT=0   (0 satır çıktı)
$ npx vitest run                   → Test Files 115 passed | 2 skipped (117)
                                      Tests 1301 passed | 8 skipped (1309)
$ npx tsx scripts/i18n-check.ts    → ✅ i18n check passed
$ npx tsx scripts/check-rls.ts     → ✅ All 42 tenant-scoped models have RLS policies registered.
$ npx tsx scripts/check-rls-live.ts→ ✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
                                      RLS_VERIFY_EXIT=0
```

Test sayısı 1299 → **1301** (yeni nöbetçinin 2 testi), dosya 114 → 115.

---

## 6. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `tests/prisma-delegate-types-are-real.test.ts` | YENİ — override regresyon nöbetçisi (2 test) |
| `.gitignore` | `.prisma-delegate-probe/` eklendi |
| `docs/agent-results/TASK-MTSJHTJZSCILI-ex-en.md` | bu rapor |

Kaldırmanın kendisi bu kartta değil, `905db4b5`'te (54 dosya) — bkz. TASK-MTSI7YQWUZOFH-ex-en-2.md §3.

---

## 7. Riskler

1. **`tsconfig.tsbuildinfo` bayat kalabiliyor — ölçülmüş.** Ambient tip yüzeyini değiştirip
   (override'ı koyup kaldırıp) `npx tsc --noEmit` koştuğumda **28 sahte hata** aldım
   (`'res' is of type 'unknown'`, `Property 'applicationParts' does not exist on type '{}'`).
   `rm -f tsconfig.tsbuildinfo` sonrası aynı ağaçta `TYPECHECK_EXIT=0`. Kaynakta hiçbir dosya
   12 dakikadır değişmemişti — yani hata gerçek değildi, cache'ti. **Sonuç: `pnpm typecheck`
   kırmızıya dönerse, kodu suçlamadan önce tsbuildinfo'yu silip tekrar koş.** Nöbetçi testinin
   kendisi bunu tetiklemiyor: testten hemen sonra koşan `tsc --noEmit` 0 verdi (§5).
2. **Nöbetçi `npx tsc` çağırıyor.** CI'da `npx` ağa çıkmak zorunda kalırsa test yavaşlar; yerelde
   `node_modules`'tan çözüldüğü için 2.3 s.
3. **Paralel ajan yarışı — bu oturumda gerçekleşti.** Ben test dosyasını yazarken başka bir ajanın
   `d78b5c7 chore(repo): commit orphaned test helper, scripts, and type definitions` commit'i
   dosyamın **yarım kalmış ilk sürümünü** süpürüp commit etti. Nihai sürüm bunun üstüne yazıldı;
   ama `git add -A` benzeri toplu commit'ler başka ajanların yarım işini repoya sokuyor.

---

## 8. Açık sorular

1. **`noUncheckedIndexedAccess` `tsconfig.json`'da YOK.** `CLAUDE.md` "Kod stili" bölümü
   "TypeScript strict, `noUncheckedIndexedAccess`" diyor; gerçek `tsconfig.json`'da yalnız
   `"strict": true` var. Doküman ile yapılandırma çelişiyor. Açılması muhtemelen yüzlerce hata
   üretir → kendi kartı olmalı, bu kartın kapsamı değil.
2. **`src/modules/m8/server/schema-contract.test.ts` yorumları artık eskimiş** — hâlâ
   "prisma-override.d.ts hides it from `pnpm typecheck`" diye *şimdiki zamanda* anlatıyor
   (satır ~25, ~65, ~100). Dosya tarihçe olarak doğru ama okuyanı yanıltır. Yorum tazeleme kartı?
3. **Kart ID'si ile rapor ID'si ayrıştı.** Kaldırma işi TASK-MTSI7YQWUZOFH-ex-en-2.md'ye yazıldığı
   için bu kart açık kaldı. Board'da "iş bitti ama başka kartın raporunda" durumu için bir kural
   gerekiyor mu?
4. `d78b5c7`'nin süpürdüğü diğer yetim dosyalar (`scripts/verify-deployed-bytecode.ts`,
   `src/lib/adapters/sedia-circuit-breaker.ts` vb.) gerçekten bitmiş işler mi, yoksa benimki gibi
   yarım mı? Sahipleri doğrulamalı.

---

## 9. Sonraki adım

- Bu kart **kapatılabilir** (aşağıdaki DoD karşılandı).
- Açık soru 1 (`noUncheckedIndexedAccess`) ve 2 (eskimiş yorumlar) için birer kart açılması önerilir.

---

## 10. Definition of Done

- [x] `src/types/prisma-override.d.ts` repoda YOK — `ls src/types/` ile doğrulandı
- [x] Repoda hiçbir ambient `@prisma/client` augmentation'ı yok — grep boş
- [x] `npx tsc --noEmit` → 0 hata, exit 0 (bu ağaçta, bugün)
- [x] **Hayalet tablo/sütun çağrısı artık typecheck'ten geçmiyor** — 7/7 prob reddedildi, çıktı §3'te
- [x] Override'ın ne sakladığı ölçüldü — geri konunca hayalet SÜTUN kör kalıyor (§3.1)
- [x] Regresyonu engelleyen kalıcı nöbetçi eklendi; GREEN **ve** RED kanıtı sunuldu (§4)
- [x] `any` / `@ts-ignore` eklenmedi (yeni dosyada yok; eslint temiz)
- [x] Kapı tam koşu yeşil: lint + typecheck + 1301 test + i18n + rls:check + rls:verify (§5)
