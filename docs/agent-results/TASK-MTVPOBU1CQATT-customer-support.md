# TASK-MTVPOBU1CQATT — `noUncheckedIndexedAccess` Dilim 1: ops script'leri + seed

## 1) Ne yapıldı

`noUncheckedIndexedAccess` bayrağı 4 dosyada (üretim kod yolunda değil — ops script'leri + tek seferlik seed script'i) ölçüldü ve giderildi:

- `scripts/verify-deployed-bytecode.ts` — Keccak-256 permütasyon döngüsündeki tüm dizi erişimleri (`state`, `C`, `D`, `B`, `S`, `R`, `RC`, `pad`), dizi boyutu algoritma sabitleriyle (5, 24, 25, `blockSize`) birebir eşleştiği için gerekçeli `!` ile daraltıldı. Compound assignment (`^=`, `|=`) satırlarında `!` doğrudan sol tarafa konamadığı için (`x[i]! ^= y` geçersiz sözdizimi) bunlar `x[i] = x[i]! ^ y` biçimine çevrildi — davranış birebir aynı, yalnız tip daraltma.
- `scripts/compare-production-backup.ts` — CLI argümanları (`args[0]`, `args[1]`), üstündeki `if (args.length < 2) process.exit(1)` koruması TS tarafından index güvenliğiyle ilişkilendirilemediği için `!` ile daraltıldı.
- `scripts/cordis-import.ts` — `arg.split('=')[1]`, çağrıldığı yerde zaten `arg.startsWith('--dataset=')` / `startsWith('--limit=')` kontrolü `'='` varlığını garanti ettiği için `!` ile daraltıldı. `--local-zip=` kolundaki aynı `split('=')[1]` zaten `string | undefined` hedefine atandığı için hiç flag'lenmedi, dokunulmadı.
- `prisma/seed-m6-evaluations.ts` — `proposals[proposalIndex]` (proposals sabit 2 elemanlı, `proposalIndex = e % 2`), `reviewers[r]` / `evalScores[r]` (r, `reviewers.length` [2 veya 3] ile sınırlı; `evalScores` her zaman 3 elemanlı) — hepsi `!` ile daraltıldı.

Her `!` kullanımının yanına neden güvenli olduğunu açıklayan tek satır yorum eklendi. Davranış değiştirilmedi (bu bir tip daraltma çalışması, mantık değişikliği değil).

## 2) Kanıt

**Ölçüm yöntemi:** `tsconfig.json`'a dokunulmadı (ağaçta paralel çalışan 4 ajan daha var). Kardeş config `tsconfig.nuia-scripts-probe.json` (`{ "extends": "./tsconfig.json", "compilerOptions": { "noUncheckedIndexedAccess": true, "incremental": false } }`) geçici olarak yazıldı, ölçüldü, sonra silindi.

**Baseline (fix öncesi, probe ile tüm ağaç):**
```
$ npx tsc -p tsconfig.nuia-scripts-probe.json --noEmit 2>&1 | grep -c "error TS"
148
$ (4 dosya için ayrı ayrı)
scripts/verify-deployed-bytecode.ts: 19
scripts/compare-production-backup.ts: 2
scripts/cordis-import.ts: 2
prisma/seed-m6-evaluations.ts: 4
# toplam: 27 (kart tahminiyle birebir uyumlu)
```

**Fix sonrası (probe ile tüm ağaç):**
```
$ npx tsc -p tsconfig.nuia-scripts-probe.json --noEmit 2>&1 | grep -c "error TS"
121   # 148 - 27 = 121, tam beklenen düşüş
$ (4 dosya için ayrı ayrı)
scripts/verify-deployed-bytecode.ts: 0
scripts/compare-production-backup.ts: 0
scripts/cordis-import.ts: 0
prisma/seed-m6-evaluations.ts: 0
```

**Probe dosyası temizliği:**
```
$ git status --short tsconfig*
?? tsconfig.nuia-ui-probe.json   # BAŞKA bir ajanın probe'u, bana ait değil, dokunulmadı
# tsconfig.nuia-scripts-probe.json git status'ta YOK — silindi.
```

**Bayraksız `pnpm typecheck` (asıl kapı, tüm depoya karşı):**
```
$ pnpm typecheck
$ tsc --noEmit
EXIT: 0
```

**`pnpm db:seed` (görev metninde istenen komut, gerçekten koştu):**
```
$ pnpm db:seed
Seeding Database...
...
M6 evaluator lens seeded (1 evaluation, 2 reviewers pending, 4 criteria, 0 scores).
✓ E11.2 feedback seed complete
Seeding completed with E10 data.
```
(Not: `pnpm db:seed` → `prisma/seed.ts` çalıştırır; benim değiştirdiğim `prisma/seed-m6-evaluations.ts` ayrı, elle koşulan bir script — `pnpm tsx prisma/seed-m6-evaluations.ts`. Onu da doğrudan koşturdum, aşağıda.)

**`prisma/seed-m6-evaluations.ts` (değiştirdiğim asıl seed dosyası, doğrudan koşum):**
```
$ npx tsx prisma/seed-m6-evaluations.ts
✓ Seeded 10 M6 evaluations (2 proposals × 5 evaluations each) with reviewers and scores
```

**Regresyon testleri (keccak256 ve selector hesaplama, cordis arg parsing):**
```
$ npx vitest run tests/verify-deployed-bytecode.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ npx vitest run tests/cordis-import.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```
(`scripts/compare-production-backup.ts` için ayrı bir test dosyası yok; değişiklik yalnızca CLI argüman okumasında, mantık dokunulmadı.)

## 3) Değişen dosyalar
- `prisma/seed-m6-evaluations.ts`
- `scripts/compare-production-backup.ts`
- `scripts/cordis-import.ts`
- `scripts/verify-deployed-bytecode.ts`

(`tsconfig.json` commit'e girmedi — hiç değiştirilmedi. Geçici `tsconfig.nuia-scripts-probe.json` oluşturulup silindi, `git status`'ta izi yok.)

## 4) Riskler
- `verify-deployed-bytecode.ts`'deki değişiklik en riskli olanı: kriptografik bir hash fonksiyonunun iç döngüsüne dokunuldu. Ancak değişiklik salt sözdizimsel (compound `^=`/`|=` → `x = x! ^ y`), semantik olarak birebir aynı; mevcut 6 testin (bilinen selector/hash değerlerine karşı) hepsi geçti.
- Diğer 3 dosyadaki `!` kullanımları, zaten var olan runtime guard'ların (length check, `startsWith` check, sabit boyutlu dizi) TS tarafından görülemeyen ama koddan doğrulanabilir garantileri — düşük risk.

## 5) Açık sorular
Yok.

## 6) Sonraki adım
Bu dilim tamam. `noUncheckedIndexedAccess` bayrağının kalıcı açılması için diğer dilimlerin (geli-tirici, dse, dev, denet-i — `src/app`, `src/components`, `src/modules/m9`, `src/lib/inngest`, `src/modules/m6`) de tamamlanması ve `tsconfig.json`'a bayrağın merkezi olarak eklenmesi gerekiyor (bu görevin kapsamı dışında).

## Platform beyanı
**mac** (Darwin 25.6.0) üzerinde doğrulandı — `pnpm typecheck`, `pnpm db:seed`, `npx tsx prisma/seed-m6-evaluations.ts` ve iki vitest dosyası mac'te koşturuldu. Dokunulan kod platforma bağlı değil (saf TypeScript tip daraltması: `!` non-null assertion, dizi/CLI-argüman erişimi, prisma seed script'i) — süreç öldürme, dosya yolu ayracı, kabuk/ikili adı, ekran/DPI veya mikrofon-kamera izni gibi platforma özgü bir yüzey içermiyor; Windows/Linux'ta davranış farkı beklenmiyor.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
