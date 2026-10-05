---
name: fabrika-staged-work-gets-swallowed
description: Fabrika'da git add ile commit arası saniyeler güvenli değil — başka ajanın pathspec'siz commit'i sahnelenmiş işini yutar; add+commit'i tek adımda ve pathspec ile yap
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

Paylaşılan çalışma ağacında `git add <kendi yolların>` ile `git commit` arasındaki saniyelerde
başka bir ajan pathspec'siz `git commit` çalıştırırsa **senin sahnelenmiş dosyaların onun
commit'ine girer**. 2026-09-07: M9 kalıcılık işimin tamamı (7 dosya + i18n anahtarları)
`47d8a5c feat(m6): a panel score that cannot be computed…` içinde indi. Kod kaybolmadı ama
commit mesajı içeriğini anlatmıyor ve iş iki ajana dağıldı.

**Nasıl yapmalı:**
- Sahneleyip beklemek yerine tek adım: `git commit -F <mesaj-dosyası> -- <kendi yolların>`
  (pathspec verilince index yok sayılır, yalnız o yollar commit edilir).
- Ortak bir dosyanın (`messages/*.json` gibi) yalnız kendi satırlarını commit etmek için:
  HEAD sürümü + kendi anahtarlarınla blob üret, `git hash-object -w` + `git update-index
  --cacheinfo 100644,<sha>,<yol>` ile index'e yaz, sonra **pathspec'siz** `git commit` —
  ama bu pencerede başkasının sahnelenmiş işi de girer, o yüzden önce `git diff --cached --stat`
  ile index'te başkasının dosyası var mı bak.
- Commit'ten sonra `git show --stat HEAD` ile ne indiğini doğrula; başkasının dosyası
  girdiyse geçmişi yeniden YAZMA (paylaşılan dal), raporunda yaz.

İkinci tuzak, aynı gün aynı iş: **rapor dosyasını `Write` ile yazmadan önce
`git log --oneline -- <yol>` ile o adın zaten kullanılıp kullanılmadığına bak.** Aynı kart
numarası ve aynı ajan kimliği farklı alt-görevlerde tekrar geldiği için
`docs/agent-results/<TASK>-<ajan>.md` zaten var olabilir; `Write` onu sessizce ezer. Görev
metninin kuralı da bu: tekrar denemede `-2.md`.

**2026-09-07 eki — bu notun iki tavsiyesi BİRBİRİYLE ÇELİŞİYOR, bilerek seç:**
`messages/*.json` gibi ortak bir dosyaya yalnız kendi anahtarlarını yazmak için blob tekniği
(`git hash-object -w` + `git update-index --cacheinfo`) **pathspec'siz commit** gerektirir —
ve pathspec'i bırakmak tam da başkasının sahnelenmiş işini yutan şeydir. İkisi aynı anda
olmuyor. Ölçtüm: commit öncesi `git diff --cached --name-only` yalnız benim 18 dosyamı
gösterdi; `git commit` sırasında araya giren ajanların dosyalarıyla commit **51 dosya** oldu
(`4edaecc`). Blob kısmı amacına ulaştı (ortak dosyaya yalnız benim anahtarlarım indi),
pathspec kaybı ise ~35 yabancı dosya getirdi.

**Karar kuralı:**
- Ortak dosyada **yalnız senin anahtarların** kritikse → blob + pathspec'siz commit, ama
  yutma riskini kabul et ve commit sonrası `git show --stat HEAD` ile ne indiğini raporuna yaz.
- Değilse (anahtarlar ekleyici ve zararsızsa) → **tek adım pathspec'li commit** tercih et,
  ortak dosyayı olduğu gibi al ve "şu yabancı anahtarlar da bindi" diye bildir. Daha az hasar.
- Her hâlükârda: paylaşılan dalda geçmişi yeniden YAZMA.

İlgili: [[fabrika-agents-share-one-working-tree]], [[fabrika-parallel-agent-file-race]]
