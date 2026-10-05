---
name: zsh-does-not-word-split-unquoted-vars
description: Bash aracının kabuğu zsh — `CMD $LISTE` tek bir argüman olur, bash'teki gibi bölünmez; dosya listesini değişkende taşıma, satır içi yaz ya da `${=LISTE}` kullan
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Bash aracı bu makinede **zsh** çalıştırıyor. zsh, tırnaksız parametre genişlemesini bash gibi
kelimelere bölmez (`SH_WORD_SPLIT` kapalı). Yani:

```zsh
SPECS="tests/e2e/a.spec.ts tests/e2e/b.spec.ts"
npx playwright test $SPECS      # TEK argüman: "tests/e2e/a.spec.ts tests/e2e/b.spec.ts"
```

Sonuç sessiz ve yanıltıcı: Playwright "No tests found", `ls` ise "No such file or directory"
diyor — sanki dosyalar yokmuş gibi. Uzun süren bir koşuyu arka planda başlatıp 10 dakika
bekledikten sonra bunu görmek pahalı.

Doğrusu, tercih sırasıyla:

```zsh
npx playwright test tests/e2e/a.spec.ts tests/e2e/b.spec.ts   # satır içi yaz (en okunaklı)
SPECS=(tests/e2e/a.spec.ts tests/e2e/b.spec.ts); cmd $SPECS   # dizi
cmd ${=SPECS}                                                  # açıkça böl
```

Teşhis refleksi: bir komut "dosya yok / test yok" diyorsa önce `ls -1 $DEGISKEN` koş — çıktı
tek satırda birleşik bir isim gösteriyorsa sebep budur.

**Why:** Uzun e2e koşularını arka planda başlatıyoruz; bu hata koşuyu sessizce boşa çıkarıyor
ve hata mesajı sebebi göstermiyor.

**How to apply:** Çok dosyalı komutlarda dosya listesini asla düz string değişkende taşıma.

İlgili: [[fabrika-agents-share-one-working-tree]], [[fabrika-tsx-script-must-live-in-repo-root]]
