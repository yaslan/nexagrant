---
name: fabrika-attribute-lint-typecheck-noise-with-git-show-head
description: Ortak ağaçta lint/typecheck uyarısının senin mi HEAD'in mi başkasının commit'lenmemiş düzenlemesinin mi olduğunu takas yapmadan ölç — `git status --porcelain` + `git show HEAD:<dosya>`
metadata:
  type: feedback
  updatedAt: 2026-09-10
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

## Yeni varyant (2026-09-10, TASK-MTVBIX1DV9HVO): **süit SAYISI** da başkasının işiyle kayar

Yukarıdaki `git show HEAD:<dosya>` hilesi bir uyarının satırını doğrular ama "önce 145 dosya,
sonra 146 dosya" gibi bir **toplam** farkını açıklamaz — çünkü fark commit'li koddan değil,
komşunun **henüz izlenmeyen yeni test dosyasından** gelebilir. Bir temizlik kartında önce/sonra
`pnpm test` ölçtüm: `145 → 146` dosya, `2 → 8` başarısız süit. Hiçbiri benim değişikliğimdendi;
ikisinin de sahibi, ölçüm penceremin içinde `src/lib/llm.ts` + `m2/m7/m10` actions'ı düzenleyen
ve `tests/modules/ai-module-gate.test.ts`'i **oluşturan** komşu ajandı.

**How to apply — bir önce/sonra süit sayısını rapora yazmadan önce üç kontrol:**
```bash
git status --porcelain | grep -E '\.test\.(ts|tsx)$'   # ?? satırı = toplanan dosya sayısını ŞİŞİRİR, çıkar
stat -f '%Sm %N' -t '%H:%M' <yeni düşen testin kaynağı>  # mtime ölçüm pencerene düşüyorsa senin değil
git log --oneline <ölçüme başladığın SHA>..HEAD          # ağaç altından ilerlemiş olabilir
```
Dördüncüsü en güçlüsü: **değişikliğinin o süiti etkileyemeyeceğini yapısal olarak göster**
(ör. `vitest.config.mts` zaten o yolu `exclude` ediyorsa, o yolu silmek sayıyı değiştiremez).
Sayıyı savunurken "sanırım komşudandı" yetmez; yukarıdaki dört kanıttan en az ikisini rapora koy.

İlgili: [[fabrika-parallel-agent-file-race]]
