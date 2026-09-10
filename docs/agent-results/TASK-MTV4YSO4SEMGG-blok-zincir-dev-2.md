# TASK-MTV4YSO4SEMGG — EK (addendum)

> Ana rapor: `docs/agent-results/TASK-MTV4YSO4SEMGG-blok-zincir-dev.md` (commit `d04618d`).
> Ana raporun hiçbir hükmü değişmedi. Bu dosya tek bir kaydı kesinleştiriyor, çünkü ana rapor
> commit'lendikten sonra `docs/agent-results/` write-once koruması altına giriyor
> (`githooks/pre-commit:15-29`).

## Kesinleştirilen kayıt: `6513085` kendi hash'i altında ölçülmedi

Denetçi (`9d4895f`, `docs/agent-results/TASK-MTV50DQCQDB7B-blok-zincir-denet-i-2.md`) bunu
bağımsız olarak ölçtü ve **haklı**. Ana raporum §2.5'te koşum ağacını `3e14b40 + bu değişiklik`
diye yazmıştı; dikkatli okuyucu sonucu çıkarır ama açıkça yazmamıştı. Açıkça yazıyorum:

* `pnpm gate` koşumlarım, `6513085`'in **içeriğini** ölçtü — commit inmeden önce, çalışma
  ağacında.
* Dolayısıyla `6513085` **hash'i** altında koşmuş bir kapı **yoktur**. `d04618d` (rapor
  commit'i) için de yoktur; içeriği yalnız Markdown'dır.
* Bu bir ihmal değil, paylaşılan ağacın yapısal sonucu: aynı ağaçta üç ajan aynı anda
  yazarken, commit anındaki ağaç ile ölçülen ağaç asla aynı olamıyor. Denetçinin "desen
  yapısaldır" hükmüne katılıyorum.

Yeniden koşmak bunu düzeltmez: ağaçta şu anda hâlâ komşunun commit'siz `src/lib/efatura.ts`
ve `invoices/[id]/export/route.ts` değişiklikleri duruyor, yani yeni bir koşum da `d04618d`'yi
değil yine bir ara ağacı ölçer. Kapının bir commit'e ait olması için kapının izole bir ağaçta
(worktree ya da CI, `CI=1`) koşması gerekir — bu oturumda `git worktree` izinle reddedildi
(ana rapor §2.5).

**Ölçülmüş olan nedir:** bu değişikliğin tam içeriği, iki bağımsız `pnpm gate` koşumunda;
her ikisinde de `module-gate.spec.ts` 3/3 yeşil, lint/typecheck/vitest/i18n/rls hepsi yeşil,
kırmızıların tamamı fatura yolunda ve nedeni ölçülerek gösterildi (ana rapor §2.5).

## Platform beyanı

**mac** (darwin 25.6.0). Bu ek yalnız git geçmişi okumasıdır; platforma bağlı kod yolu yoktur.
Windows/Linux: koşulmadı — gerek yok, iddia platformdan bağımsızdır.
