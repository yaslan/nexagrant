---
name: fabrika-attribute-lint-typecheck-noise-with-git-show-head
description: Ortak ağaçta lint/typecheck uyarısının senin mi HEAD'in mi başkasının commit'lenmemiş düzenlemesinin mi olduğunu takas yapmadan ölç — `git status --porcelain` + `git show HEAD:<dosya>`
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

`pnpm lint` / `pnpm typecheck` paralel ajan dalgasında sana **başkasının yarım işini** gösterir.
Kartın "lint 16 → 0" hedefini ölçerken 6 uyarı ve 1 typecheck hatası gördüm; hiçbiri ne benimdi
ne de HEAD'indi.

Test kırmızısı için A/B takası gerekir ([[fabrika-ab-baseline-without-git-stash]]) ama **statik
kapı için takas bile gerekmez** — uyarı bir dosya:satır işaret ediyor, o satırı HEAD'de okumak
yeter, 10 saniye:

```bash
git status --porcelain <dosya>            #  M  →  ağaçta commit'lenmemiş düzenleme VAR
git show HEAD:<dosya> | grep -c "<sembol>"  # 0  →  uyarının sembolü HEAD'de HİÇ YOK
grep -c "<sembol>" <dosya>                  # 1  →  yalnız çalışma ağacında  ⇒ uyarı senin değil
```

2026-09-08, TASK-MTS6MMOD8XF3A'da böyle çıktı:
- `src/lib/document-exporter.ts:13` `'DocxDocument' unused` → `git show HEAD:` içinde o import
  hiç yok; başka bir ajan az önce eklemiş.
- `next.config.ts:106` `import/no-anonymous-default-export` → uyarının işaret ettiği
  `export default (phase) => …` bloğu HEAD'de yok.
- `scripts/i18n-check.ts(237,34) TS18047` → HEAD'de 237. satır bambaşka.

Sonuç: liderin "HEAD'de 0 uyarı" ölçümü doğruydu, ağaç kirliydi. **Başkasının uyarısını
"yardım olsun" diye düzeltme** — commit ederken onun dosyasını da stage'lersin
([[fabrika-parallel-agent-file-race]]). Raporun "Açık sorular" bölümünde dosya:satırıyla ADIYLA
bildir; sahibi commit etmeden kapı herkese kırmızı kalır.

Kural olarak: kendi ölçümünü "temiz/kirli" diye rapor etmeden önce **ağacın kirli olup olmadığına
bak**. `pnpm lint`'in ham çıktısı ortak ağaçta bir kalite beyanı DEĞİLDİR.

İlgili: [[fabrika-agents-share-one-working-tree]], [[fabrika-blame-e2e-failure-without-stashing]]
