---
name: fabrika-baseline-snapshot-goes-stale
description: Paylaşılan ağaçta lint/typecheck baseline'ını kendi dosyalarını scratchpad'e kopyalayıp HEAD'e döndürerek ölç — ama snapshot'tan SONRA yaptığın düzeltmeler snapshot'ta yok, geri kopyalarsan onları ezersin
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

`git stash` paylaşılan ağaçta yasak ([[fabrika-git-stash-is-unsafe-in-shared-tree]]).
Yerine kullandığım ve işe yarayan yöntem — yalnız KENDİ dosyalarına dokunur:

```bash
cp <benim-dosyalarım> $SP/mine/                  # 1. anlık görüntü al
git checkout HEAD -- <benim-dosyalarım>          # 2. yalnız kendi dosyalarını geri al
pnpm typecheck 2>&1 | grep -E "error TS" | sed 's/(.*//' | sort | uniq -c   # 3. dosya-başına ölç
cp $SP/mine/* <yerlerine>                        # 4. geri koy
```

Dosya-başına sayım şart: toplam sayı işe yaramaz, "bu hata benim mi" sorusunu yalnız
hata→dosya eşlemesi cevaplar.

## Bedelini ödediğim tuzak
Snapshot'ı adım 1'de aldım, geri koymayı adım 4'te yaptım — **ama arada typecheck
düzeltmelerimi uygulamıştım.** `cp $SP/mine/*` o düzeltmelerin hepsini sessizce ezdi;
`pnpm typecheck` yeniden 5 hata verince fark ettim ve patch'leri baştan uygulamak zorunda kaldım.

**Kural: snapshot'ı ölçümden HEMEN önce tazele, ya da geri koyduktan sonra kapıyı TEKRAR koş.**
Geri koymak "eski hale döndürmek"tir, "işimi kurtarmak" değil. Python `str.replace` ile
uyguladığım patch'leri bir dosyada saklamak (yeniden koşulabilir script) tekrarı ucuzlattı;
tek seferlik elle düzenleme olsaydı işi kaybederdim.

## Yan bulgu
Paylaşılan ağaçta baseline **iş sırasında değişir**. Bu görevde başlangıçta 15 typecheck hatası
+ 1 düşen test vardı (`src/app/api/v1/partners/**`); ben çalışırken paralel bir ajan onları
düzeltti ve kapı yeşile döndü. Raporda bunu kendime yazmadım — baseline'ı ölçtüğün AN'ı ve
sonradan değiştiğini ayrı ayrı yaz.

İlgili: [[fabrika-git-stash-is-unsafe-in-shared-tree]] · [[fabrika-agents-share-one-working-tree]]
