---
name: fabrika-lint-scope-not-rules
description: Fabrika'da pnpm lint'in binlerce bulgusu kural değil KAPSAM sorunuydu — nested worktree'ler ve kanıt dosyaları; dışlamayı mutasyon sondasıyla doğrula
metadata:
  type: project
updatedAt: 2026-09-10
---

Fabrika'da bir kapı (lint/test/typecheck) binlerce bulgu üretiyorsa, kural sıkılığını değil
KAPSAMI şüphelen. 2026-09-10'da `pnpm lint` 1960 error / 21724 warning veriyordu ve
**hepsi** `src/` dışındandı: 465 dosya `.claude/worktrees/**` (ajanların açtığı iç içe git
worktree'leri), 2 dosya `docs/agent-results/**` (rapora iliştirilmiş tek kullanımlık `.mts`
kanıt script'leri). Bu iki yol `eslint.config.mjs` içindeki `globalIgnores([...])`'a eklenince
lint 0 error / EXIT 0 oldu; tek bir kural devre dışı bırakılmadı.

Teşhis komutu (kapsam mı kural mı, 5 saniyede):
`pnpm lint 2>&1 | grep '^/Users' | awk -F/ '{print $1"/"$2}' | sort | uniq -c | sort -rn`

**Bir dışlama eklediğinde MUTASYON SONDASI zorunlu:** `src/` altına kasıtlı ihlal ekle
(kullanılmayan değişken + `// @ts-ignore` ikisini birden — biri warning
`@typescript-eslint/no-unused-vars`, diğeri error `@typescript-eslint/ban-ts-comment` verir,
yani hem warning hem error yolunu tek sondayla ölçersin), lint'in HÂLÂ yakaladığını göster,
geri al, `git diff --name-only <dosya>` ile boş döndüğünü doğrula. "0 error" tek başına
dışlamanın fazla geniş OLMADIĞINI kanıtlamaz — sonda kanıtlar.

Aynı dışlama `vitest.config.mts` satır 6'da zaten vardı (dosya adı `.mts`, kartlarda sık sık
`vitest.config.ts` diye yanlış anılıyor). Her yeni araç (tsc, grep tabanlı denetimler) bu iki
yolu kendi başına dışlamak zorunda — tek noktadan çözüm yok. Bkz. [[fabrika-parallel-agent-file-race]].
