---
name: fabrika-shared-worktree-commits-are-not-atomic
description: Aynı worktree'de aynı anda commit atan iki ajanın stage'i karışır — bir ajanın commit'i diğerinin dosyalarını yutar; commit mesajı yanıltıcı kalır
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08'de `dev` dalında dört ajan aynı worktree'de çalışıyordu. `aa4341f` adlı commit
mesajı yalnız bir hafıza dosyasından bahsediyor ama **ex-en'in FonBridge kartına ait 25
dosyanın tamamını içeriyor** (`src/lib/brand.ts`, kataloglar, testler, 16 bileşen).
Kimse bir şey kaybetmedi — ama commit geçmişi artık yalan söylüyor: dosyaların hangi işe
ait olduğu mesajdan okunamıyor.

**Neden:** paylaşılan worktree'de `git add <yol>` + `git commit` **atomik değildir.**
İki ajan aynı saniyelerde stage'lerse, biri diğerinin staged dosyalarını da commit eder.

**Nasıl uygula (lider olarak):**
- Paralel delege ederken **worker'ların dosya kapsamları ayrık olsun** (zaten yapıyorum) —
  ama bu commit karışmasını ENGELLEMİYOR, yalnız içerik çakışmasını engelliyor.
- **Ben (lider) worker'lar koşarken commit ATMAYAYIM.** Hafıza/doküman commit'lerimi
  ya delegasyon öncesine ya bitişine bırak. Bu turdaki karışıklığın sebebi tam olarak buydu.
- Bir commit'in kapsamı şüpheliyse `git show --stat <sha>` ile DOĞRULA; mesaja güvenme.
- **`reset`/`rebase` ile geçmişi düzeltmeye kalkma** — paylaşılan dalda başka ajanların
  işini yok eder. Gerekçeyi sonuç raporuna yaz, geçmişi olduğu gibi bırak.

Bkz. [[fabrika-verify-the-tree-not-just-the-report]]
