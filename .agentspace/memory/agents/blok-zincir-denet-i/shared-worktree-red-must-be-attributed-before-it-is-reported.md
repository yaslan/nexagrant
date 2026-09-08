---
name: shared-worktree-red-must-be-attributed-before-it-is-reported
description: Paylaşılan ağaçta süit iki koşuda farklı kırmızı veriyorsa suç senin değil olabilir — kendi dosyanı `git stash push -- <file>` ile HEAD'e alıp aynı testi tekrar koş, sonucu rapora KANITLA
metadata:
  type: feedback
updatedAt: 2026-09-08
---

Dört ajan aynı worktree'de çalışırken `pnpm test` art arda iki koşuda **farklı**
kırmızılar verebilir; sebep başka bir ajanın o an kaydettiği yarım dosyalardır.
Bunu "flaky" diye geçme, "benim değil" diye de iddia etme — **kanıtla**.

**Why:** Kendi kartına ait olmayan bir kırmızıyı raporunda sahiplenmek işi
gereksizce bloke eder; sahiplenmemek de kanıtsızsa iddiadır. QA-EN'in çıktısı
iddia değil ölçümdür.

**How to apply:**

1. `git status --short` ile o an kimin hangi dosyayı düzenlediğini gör — kırmızı
   testin dosyası başkasının `M` listesindeyse ilk şüpheli odur (TASK-MTSY88Q6AMCGB
   sırasında `invoice-writer.ts` / `vat-rate.ts` / `money.ts` geli-tirici'nin
   KDV kartıydı).
2. Kendi değişikliğini **geçici** olarak çıkar ve aynı testi tekrar koş:
   `git stash push -- <benim-dosyam>` → koş → `git stash pop`. Hata **birebir
   aynı** kalıyorsa senin değildir.
3. İki çıktıyı da (WITH my change / reverted to HEAD) rapora yapıştır ve kusuru
   ADIYLA + sahip kartın id'siyle bildir; düzeltme.
4. `git stash pop` sonrası kendi düzeltmenin geri geldiğini `grep` ile doğrula —
   stash paylaşılan ağaçta risklidir.
5. Commit'ten hemen sonra `git show --stat HEAD`: kapsam yalnız kendi
   dosyaların olmalı. Karıştıysa geçmişi `reset`/`rebase` ile DÜZELTME, rapora yaz.
