# TASK-MTVPOBU1CQATT — `noUncheckedIndexedAccess` Dilim 1: ops script'leri + seed

**Platform beyanı: macOS (Darwin 25.6.0, zsh, yerel Node/pnpm).** Windows/Linux koşulmadı —
gerekçe en altta.

Dilim 1'in 4 dosyasındaki 27 `noUncheckedIndexedAccess` hatası kapatıldı. Bayrak
`tsconfig.json`'da **açılmadı**; probe dosyası (kardeş config) ölçüm sonrası silindi, iz bırakmadı.

Bu dosya, `docs/agent-results/TASK-MTSWAKD31LS49-blok-zincir-dse.md` §4 Dilim 1 kartının
kanıt bloğunda belirtilen zorunlu yol olduğu için yazıldı; asıl (uzun) rapor
`docs/agent-results/TASK-MTVPOBU1CQATT-customer-support.md`'de — burada onun özeti var.

---

## 1) Ne yapıldı

### Ölçüm yöntemi — `tsconfig.json`'a dokunmadan

Kart, ağaçta 4 ajan daha çalıştığı için `tsconfig.json`'ı geçici açıp kapatmayı yasaklıyordu
(bunu yapmak ölçüm süresince komşuların `pnpm typecheck`'ini kırık gösterirdi). Kardeş config
kullanıldı:

```jsonc
// tsconfig.nuia-scripts-probe.json (geçici, ölçüm sonrası silindi)
{ "extends": "./tsconfig.json",
  "compilerOptions": { "noUncheckedIndexedAccess": true, "incremental": false } }
```
```bash
npx tsc -p tsconfig.nuia-scripts-probe.json --noEmit
```

### Dosya bazında (bayraklı ölçüm, öncesi → sonrası)

| Dosya | Önce | Sonra | Ne yapıldı |
|---|---:|---:|---|
| `scripts/verify-deployed-bytecode.ts` | 19 | 0 | Keccak-256 permütasyonundaki tüm dizi erişimleri (`state`, `C`, `D`, `B`, `S`, `R`, `RC`, `pad`) — dizi boyutu algoritma sabitleriyle (5, 24, 25, `blockSize`) birebir eşleştiği için gerekçeli `!`. Compound assignment (`^=`, `\|=`) satırları `x[i] = x[i]! ^ y` biçimine çevrildi (`x[i]! ^= y` geçersiz sözdizimi) — davranış birebir aynı. |
| `scripts/compare-production-backup.ts` | 2 | 0 | `args[0]`/`args[1]` — üstündeki `if (args.length < 2) process.exit(1)` korumasını TS index güvenliğiyle ilişkilendiremiyor; gerekçeli `!`. |
| `scripts/cordis-import.ts` | 2 | 0 | `arg.split('=')[1]` — çağrı yerinde `startsWith('--dataset=')`/`startsWith('--limit=')` zaten `'='` varlığını garanti ediyor; gerekçeli `!`. `--local-zip=` kolu zaten `string \| undefined` hedefine atandığı için hiç flag'lenmedi, dokunulmadı. |
| `prisma/seed-m6-evaluations.ts` | 4 | 0 | `proposals[proposalIndex]` (proposals sabit 2 elemanlı, index `e % 2`); `reviewers[r]`/`evalScores[r]` (r, `reviewers.length` [2/3] ile sınırlı; `evalScores` her zaman 3 elemanlı) — gerekçeli `!`. |
| **Toplam** | **27** | **0** | |

Her `!` yanına neden güvenli olduğunu açıklayan tek satır yorum eklendi. Davranış
değiştirilmedi — salt tip daraltma.

---

## 2) Kanıt

### A) Bayraksız `pnpm typecheck` — exit 0

```
$ pnpm typecheck
$ tsc --noEmit
EXIT: 0
```

### B) Bayraklı geçici ölçüm — bu 4 dosya için 0

```
$ npx tsc -p tsconfig.nuia-scripts-probe.json --noEmit   # ÖNCE
total errors: 148
scripts/verify-deployed-bytecode.ts     19
scripts/compare-production-backup.ts     2
scripts/cordis-import.ts                 2
prisma/seed-m6-evaluations.ts            4
--- TOTAL slice --- 27

$ npx tsc -p tsconfig.nuia-scripts-probe.json --noEmit   # SONRA
total errors: 121   # 148 - 27 = 121
scripts/verify-deployed-bytecode.ts     0
scripts/compare-production-backup.ts    0
scripts/cordis-import.ts                0
prisma/seed-m6-evaluations.ts           0
```

Kalan 121 hata diğer dilimlere (Dilim 2/3/4) ait; Dilim 3 raporundaki (bu dosyanın kardeşi,
`-2.md`) 148 rakamıyla aynı anlık fotoğraf değil — ağaç o rapordan sonra da hareket etti, kendi
ölçümüme güvendim (kart talimatı: "satır numaraları kaymış olabilir, kendi ölçümüne güven").

### C) `tsconfig.json` ve probe dosyası

```
$ git diff -- tsconfig.json
[boş]
$ git status --short tsconfig*
?? tsconfig.nuia-ui-probe.json   # BAŞKA bir ajanın probe'u, bana ait değil, dokunulmadı
```
(`tsconfig.nuia-scripts-probe.json` silindi — `git status`'ta izi yok.)

### D) `pnpm db:seed` — gerçekten koştu

```
$ pnpm db:seed
Seeding Database...
...
M6 evaluator lens seeded (1 evaluation, 2 reviewers pending, 4 criteria, 0 scores).
Seeding completed with E10 data.
```

`pnpm db:seed` → `prisma/seed.ts` çalıştırır; asıl değiştirdiğim `prisma/seed-m6-evaluations.ts`
ayrı, elle koşulan bir script (`pnpm tsx prisma/seed-m6-evaluations.ts`). Onu da doğrudan
koşturdum:

```
$ npx tsx prisma/seed-m6-evaluations.ts
✓ Seeded 10 M6 evaluations (2 proposals × 5 evaluations each) with reviewers and scores
```

### E) Regresyon testleri (keccak256/selector, cordis arg parsing)

```
$ npx vitest run tests/verify-deployed-bytecode.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ npx vitest run tests/cordis-import.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

---

## 3) Değişen dosyalar

```
 prisma/seed-m6-evaluations.ts        |  9 ++++++---
 scripts/compare-production-backup.ts |  6 ++++--
 scripts/cordis-import.ts             |  6 ++++--
 scripts/verify-deployed-bytecode.ts  | 30 ++++++++++++++++++++----------
 4 files changed, 34 insertions(+), 17 deletions(-)
```

Kartın "yalnız bu 4 dosya senin" sınırının dışına (`src/**`, `tsconfig.json`, `package.json`)
hiç çıkılmadı.

## 4) Riskler

- `verify-deployed-bytecode.ts`'deki değişiklik en riskli olanı: kriptografik hash fonksiyonunun
  iç döngüsüne dokunuldu. Değişiklik salt sözdizimsel (compound `^=`/`\|=` → `x = x! ^ y`),
  semantik birebir aynı; mevcut 6 test (bilinen selector/hash değerlerine karşı) geçti.
- Diğer 3 dosyadaki `!` kullanımları, zaten var olan runtime guard'ların (length check,
  `startsWith` check, sabit boyutlu dizi) TS'in göremediği ama koddan doğrulanabilir garantileri —
  düşük risk.

## 5) Açık sorular

Yok.

## 6) Sonraki adım

Bu dilim tamam. Bayrağın kalıcı açılması diğer dilimlerin (Dilim 2/3/4) tamamlanmasını ve merkezi
`tsconfig.json` değişikliğinin ağaç boşken tek başına commit edilmesini bekliyor.

## Platform beyanı

**macOS (Darwin 25.6.0), zsh, yerel Node + pnpm.** Doğrulama: `pnpm typecheck`,
`npx tsc -p <probe>`, `pnpm db:seed`, `npx tsx prisma/seed-m6-evaluations.ts`, `npx vitest run`.

Windows/Linux koşulmadı. Dokunulan kod platforma bağlı değil: süreç öldürme, dosya yolu ayracı,
kabuk/ikili adı, ekran/DPI, mikrofon-kamera izni gibi bir yüzey yok. Değişiklikler saf TypeScript
tip daraltması (`!` non-null assertion, dizi/CLI-argüman erişimi, BigUint64Array aritmetiği) —
hepsi ECMAScript standardı, platformdan bağımsız aynı sonucu verir.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
