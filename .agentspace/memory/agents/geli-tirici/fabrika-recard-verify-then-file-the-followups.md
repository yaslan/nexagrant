---
name: fabrika-recard-verify-then-file-the-followups
description: Bir kart ikinci kez düştüğünde işi tekrarlama — HEAD'de hâlâ çalıştığını ölç ve ilk raporun "ayrı kart şart" dediklerini board'da gerçekten açık mı diye KONTROL ET
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Fabrika'da bir kart aynı ajana ikinci kez düşebiliyor (board'da `in_progress`
kalmış, bazen başka ajana atanmış olarak). Kod zaten commit'liyken baştan yazmak
saf kayıp — ama "zaten yapılmış" deyip geçmek de eksik.

**Why:** iki gerçek boşluk çıktı. (1) Araya 6 commit girmişti; yazma yolunun hâlâ
ayakta olduğu **ölçülmeden** bilinemezdi (ilk teslimde kırmızı bırakılan
`efatura-foreign-currency.test.ts` sonradan başka ajan tarafından yeşile
çevrilmişti). (2) İlk raporun §6'sında "ayrı kart şart" denen ÜÇ iş board'da
**hiç açılmamıştı** — yani rapor yazmak takip üretmiyor, kart açmak üretiyor.

**How to apply:** ikinci düşüşte sırayla: `git log --oneline -- <dosya>` ile
işin commit'li mi bak → HEAD'de yeniden ölç (grep + ilgili unit + canlı e2e +
tsc) → ilk raporun "ayrı kart", "bloklayıcı", "sonraki adım" maddelerini tek tek
board'da ara, yoksa `create_task` ile aç ve **kart id'lerini** yeni rapora yaz →
`-2.md` kanıt dosyası ([[fabrika-evidence-guard-forces-a-numbered-rerun-file]]).
