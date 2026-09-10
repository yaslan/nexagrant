---
name: fabrika-gate-lints-and-tests-nested-worktrees
description: ÇÖZÜLDÜ 2026-09-10 — .claude/worktrees/ kopyaları kaldırıldı, lint'te .claude kaynaklı satır 465→0; artık `.claude/...` yollu bir hata görürsen YENİ bir iç içe worktree açılmış demektir
metadata:
  type: project
  updatedAt: 2026-09-10
---

> **DURUM 2026-09-10 (TASK-MTVBIX1DV9HVO — ÇÖZÜLDÜ):** `.claude/worktrees/e2e-fix` ve
> `.claude/worktrees/zztest-validation` **kaldırıldı** (`git worktree remove`, `--force`
> kullanılmadan; `worktree-*` dalları duruyor). Ölçüm: `pnpm lint | grep -c '^/Users/.../.claude'`
> **465 → 0**. Ayrıca `vitest.config.mts:6` artık `'**/.claude/worktrees/**'` dışlıyor (`ec3f844b`),
> yani süit tarafı kalıcı olarak kapalı. **Bugünkü pratik sonuç:** lint çıktısında `.claude/…`
> yollu bir hata görürsen bu eski durumun kalıntısı DEĞİL — biri repo ağacının İÇİNE yeni bir
> worktree açmıştır; aşağıdaki "nasıl önlenir" hâlâ geçerlidir. Aşağısı tarihsel kayıttır.

`.claude/worktrees/e2e-fix` ve `.claude/worktrees/zztest-validation` bu deponun **tam** birer
checkout'u. Ne `eslint.config` ne `vitest.config` bu dizini dışlıyor:

- `pnpm lint` → 22636 sorun / **1872 hata**; hata taşıyan 436 dosyanın **434'ü** `.claude/worktrees/`
  altında, 2'si `docs/agent-results/…*.mts` kanıt probu. `src/` ve `tests/`'ten **sıfır**.
- `pnpm test` → 304 başarısız; 130 başarısız dosyanın **80'i** worktree kopyası.

`gate = db:generate && lint && typecheck && test && …` olduğu için **lint'te durur**; sonraki
aşamalar (typecheck, i18n, rls:check, rls:verify, e2e) hiç koşmaz. Bunları elle tek tek koşmak
gerekir — 2026-09-10'da hepsi yeşildi.

**Kendi işini kırmızıya yazmadan önceki iki komut:**
```bash
grep -E "^/Users" gate.log | sed 's|.*/fabrika/||' | awk -F/ '{print $1"/"$2}' | sort | uniq -c
grep -E "^(src|tests)/" gate.log | sort -u      # çıktı yoksa hata senin değil
npx eslint <yalnız kendi dosyaların>            # exit 0 mı?
```

Ayrıca `githooks/pre-commit` yalnız **staged kapsamı** denetler ve temiz geçebilir — commit'in
geçmesi kapının yeşil olduğu anlamına GELMEZ, tersi de doğru.

İkinci bağımsız kırmızı kaynağı (2026-09-10, worktree'ler kaldırıldıktan SONRA da duruyor):
`9af3f63` ürün adını FonBridge'e geri aldı ama testlerin bir kısmı hâlâ eski markayı bekliyor.
Temiz ağaçtaki taban: `Test Files 2 failed | 141 passed | 2 skipped (145)` · `Tests 3 failed`.
`tests/brand-surfaces-render.test.tsx:41` **kendi kendisiyle çelişiyor** — aynı metnin hem
`PRODUCT_NAME` içermesini hem de `'FonBridge'` İÇERMEMESİNİ istiyor; `PRODUCT_NAME === 'FonBridge'`
olduğu için sağlanamaz, her koşuda düşer. `tests/document-exporter.test.ts:38,41` köken bildiriminde
`Fabrika` bekliyor. Kart: **TASK-MTVBX3348JNPN** (@blok-zincir-dev). Bu üç iddia dışında bir
kırmızı görürsen o senindir.

Bağlantı: [[fabrika-blame-e2e-failure-without-stashing]]
