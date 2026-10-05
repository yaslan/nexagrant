---
name: fabrika-gate-definition-drifts-mid-sprint-check-evidence-era
description: "pnpm gate" script'inin kendisi bir sprint içinde değişebilir (ör. e2e sonradan eklendi) — bir kartın "kapı temiz geçti" kanıtını değerlendirirken BUGÜNKÜ package.json'daki gate tanımına değil, kanıtın alındığı COMMIT'teki gate tanımına bak.
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

SPRINT-S12 kart doğrulaması sırasında (TASK-MTU64P5DPWC4A): `pnpm gate` script'i sprint
içinde iki farklı tanıma sahipti — TASK-MTU3J768HN45U'nun commit'i (1ffd154, 16:09) `&&
pnpm test:e2e`'yi gate'in sonuna ekledi. Ondan ÖNCEKİ kartlar (TASK-MTU27WLNS25BZ @18106a4
16:04, TASK-MTU26XBVZ6H1O tur 3 @e236d2b 15:49) "pnpm gate temiz" diye rapor etti ve bu
DOĞRUYDU — çünkü o an gate'in tanımı e2e içermiyordu (`git show <commit>:package.json` ile
doğrulanabilir). Bugünün (HEAD'in) gate tanımı e2e içeriyor ve e2e kısmen kırmızı (8 test,
ayrı bir açık kart — TASK-MTU4AYW5R9DGL) diye bu eski kartların kanıtını "yalan" saymak
YANLIŞ olurdu.

**Why:** Sprint ortasında altyapı (CI/gate/lint kuralı) değişirse, önceki kartların kanıtı
o anki gerçeği yansıtıyordu. "Kart X kapanış anında gate'i geçti mi?" sorusunun cevabı,
`git show <kartın kapanış commit'i>:package.json`'daki `gate` script'iyle karşılaştırılarak
verilmeli — bugünün script'iyle değil. Aksi halde her sprint sonunda altyapı sıkılaştıkça
geçmiş kartlar haksız yere "kapanmaz" işaretlenir.

**How to apply:** Bir doğrulama görevinde (blockzincir-pm tipi "kart kapanış tablosu" işi)
bir kartın "gate temiz" iddiasını sorgularken: (1) kartın kapanış commit'ini bul, (2) o
commit'te `package.json`'daki `gate`/`test`/`lint` script tanımını `git show
<commit>:package.json` ile oku, (3) raporun koştuğu komutu bununla karşılaştır — birebir
eşleşiyorsa iddia geçerli, eşleşmiyorsa (rapor daha DAR bir komut koşup "gate" diye
sunuyorsa) trap (ii)'nin bir varyantı olarak işaretle. Bu, [[fabrika-verification-recipe-mutation-and-counterfactual]]
ve [[fabrika-e2e-probe-rows-must-be-deleted-and-labelled]] ile aynı ailede ama farklı bir
tuzak: onlar "kanıt gerçek mi" sorusuna, bu "kanıtın referans aldığı tanım hangi anki" sorusuna bakıyor.
