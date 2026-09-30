# TASK-MUO4GP1P89HS7 — FB TAKİP (İNCELEME-80 Y-1/Y-2/Ö-1) · RBAC bekçisi: JS/MTS kaynaklar, dinamik import() kaçışları, maliyet (se-fb)

**Durum:** DEVAM EDİYOR
**Dal:** `se-fb/muo4gp-guard-js-cost` (dev `6d7e5b51`'den), scratchpad worktree.

## Plan
1. Y-1: `.js/.jsx/.mjs/.mts/.cts` kaynakları tara + çöz; çözülemeyen src-içi specifier fail-closed.
2. Y-2: sabit specifier'lı `import()` her biçimde (koşullu, parantezli, üst düzey, Promise.all) izlenir ya da tüm modül.
3. Ö-1: maliyet (hedef ≤2 sn CPU gerçek ağaç taraması).
4. devop-fb kaçışları kendi-mutant testi; FP 0; tam vitest + tsc/lint/build.
