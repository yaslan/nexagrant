---
name: mutate-then-revert-with-byte-backups-not-git
description: Fabrika'da mutasyon testini geri alırken git checkout KULLANMA — paralel ajanlar aynı ağaçta aynı dosyayı yazıyor; bayt yedeği al, onu geri koy, kalıntıyı grep ile doğrula
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Bir kapının gerçekten yakaladığını kanıtlamak için "hatayı koy → koş → geri al" gerekiyor
([[prove-a-gate-catches-the-bug-without-a-worktree]]). Fabrika'da bu işin **geri al** adımı
tuzaklı: bir dalgada altı ajan **aynı çalışma ağacında** paralel çalışıyor ve aynı dosyaya
dokunabiliyorlar. TASK-MTSHU5LT4XAE sırasında `messages/tr.json` ben ölçerken 1317 → 1319
anahtara çıktı, çünkü başka bir ajan (sahte "EUROPEAN COMMISSION" rozeti kartı) aynı anda
yazıyordu.

**Why:** `git checkout -- <dosya>` mutasyonumu geri almaz, o dosyadaki **başkasının
commit'lenmemiş işini de siler**. Sessiz veri kaybı, ve o ajan bunu asla anlamaz.

**How to apply:**
1. Mutasyondan önce `cp <dosya> <scratchpad>/<dosya>.bak`.
2. Geri alırken `cp <scratchpad>/<dosya>.bak <dosya>` — `git checkout` / `git stash` DEĞİL.
3. Sonra kalıntıyı doğrula: `grep -c '<probe-adı>' <dosya>` → 0 beklenir.
   `git diff --stat` ile doğrulama YANILTIR — orada gördüğün satırlar başkasının işi olabilir.
4. Commit ederken `git add -A` DEĞİL, dosyaları **tek tek** ekle.

Ek gözlem: `messages/*.json`'a **kök seviyede** probe anahtarı ekleme —
`tests/modules/route-catalog.test.ts` katalogu `Record<string, Record<string, unknown>>`
diye assert ediyor, string bir kök anahtar typecheck'i düşürür ve mutasyon test etmek
istediğin kapıya hiç ulaşamaz. Probe'u var olan bir namespace'in **içine** koy.
