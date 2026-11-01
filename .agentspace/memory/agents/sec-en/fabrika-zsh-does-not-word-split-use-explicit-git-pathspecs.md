---
name: fabrika-zsh-does-not-word-split-use-explicit-git-pathspecs
description: Paylaşımlı ağaçta git add + çıplak git commit kardeş ajanın dosyalarını commit'ler; pathspec şart ve zsh değişkeni word-split ETMEDİĞİ için yollar TEK TEK argüman yazılmalı
metadata:
  type: feedback
updatedAt: 2026-09-10
---

TASK-MTTUUGKNDGBXK'de üst üste iki kez ısırdı.

**1. `git add <yollarım>` + çıplak `git commit` yetmez.** Kardeş ajan benim `add`'imle
`commit`'im arasında indeksi değiştirdi: commit'im (`4a3e78a`) **benim mesajımı** taşıyor ama
içinde **de-yuyt'un dosyaları** var; benim dosyalarım indeksten düşüp `??` untracked'a geri
döndü. Yani "add ettim" ile "commit'lendi" arasındaki pencere paylaşımlı ağaçta gerçek ve
kaybettirir. Doğrusu: `git add <yollar> && git commit -m … -- <yollar>` — sondaki pathspec,
indekste başka ne olursa olsun **yalnız o yolları** commit'ler.

**2. zsh, tırnaksız değişkeni word-split ETMEZ** (bash eder). Yolları bir değişkende toplayıp
`git add $P` yazdım; zsh bunu **tek bir argüman** olarak geçirdi ve git
`fatal: pathspec '<hepsi birleşik>' did not match any files` dedi. Bu ofisin kabuğu zsh.
Doğrusu: yolları `\` ile satır satır **tek tek argüman** yaz (veya `${(f)P}` / dizi kullan).
Boş `$P` sessizce "her şeyi commit'le"ye de dönüşebilir — ayrı bir tehlike.

**Doğrulama adımı pazarlık dışı:** commit'ten sonra `git show --name-only --oneline HEAD` **ve**
`git show HEAD:<raporum> | wc -l`. İlki bana dosyaların benim olmadığını gösterdi; sadece
`git status` temiz diye geçseydim rapor kaybolmuş olurdu.

**Yan koruma işe yaradı:** kanıt dosyalarıma `-secen` soneki koymuştum. Kardeş ajan aynı anda
`08-*.txt`, `09-*.txt`, `10-*.txt` yazıyordu; sonek olmasaydı üzerime yazacaktı. Paylaşımlı
kanıt dizinlerinde **numara değil, numara+kimlik** kullan.

Kardeş kayıt: [[fabrika-parallel-agent-file-race]] — bu, o kaydın somut git mekaniği.
