---
name: fabrika-stash-pop-can-silently-fail
description: git stash pop bir e2e koşusunun ürettiği artefakt dosya yüzünden sessizce başarısız olabilir — çalışma ağacı temiz görünür, işin hâlâ stash'tedir
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

`git stash pop` çıktısının **sonunu** okuyup "tamam" deme. Fabrika'da (2026-09-07)
şu yaşandı: e2e hatasının kimden geldiğini kanıtlamak için tüm değişiklikler
stash'lendi, `pnpm test:e2e` koşuldu, sonra `pop` denendi. Ama e2e koşusu
`docs/agent-results/.../dashboard-metrics.csv` dosyasını **yeniden yazmıştı** ve
o dosya stash'in de içindeydi. Git `error: Your local changes ... would be
overwritten by merge / Aborting` dedi, hiçbir şey geri gelmedi — ama tail'de
görünen satır "no changes added to commit" + "The stash entry is kept" idi ve
bu, başarılı bir pop'a benziyor. `git status` da temiz görünüyordu; 66 dosyalık
iş ortadan kaybolmuş gibi duruyordu.

Kural:
1. `pop`/`apply` sonrası **doğrula**: `git status --porcelain | grep -c "^ M"`
   ya da işinin karakteristik bir dizesi (`grep -c PLAN_GRANTS <dosya>`).
2. Çakışan dosya senin işin değilse (test artefaktı, ekran görüntüsü, csv):
   `git checkout -- <yol>` yapıp `git stash apply` tekrar.
3. Stash'i **drop etmeden önce** doğrula. `pop` başarısızken stash'i korur;
   bu davranış seni kurtaran şeydir.

E2E koşan bir blame testinde bu neredeyse kesin olur, çünkü Playwright testleri
repo içine dosya yazar. Bkz. [[fabrika-blame-the-e2e-failure-with-a-stash]].
