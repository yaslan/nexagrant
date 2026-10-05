---
name: flat-scratchpad-backup-collides-on-basename
description: A/B ölçümü için dosyaları düz bir scratchpad'e basename ile yedekleme — bu repoda src/lib/rag.ts ve src/lib/ai/rag.ts aynı adı taşıyor ve geri yükleme yanlış içeriği yazdı
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08, TASK-MTSYCMWFL22CA. Değişikliklerimi HEAD'e döndürüp kırmızı bir testi
atfetmek için şunu yaptım:

```sh
for f in src/lib/rag.ts src/lib/ai/rag.ts ...; do
  cp "$f" "$SP/$(basename $f).mine"     # ❌ iki dosya da rag.ts.mine
  git show HEAD:"$f" > "$f"
done
```

Geri yüklerken `src/lib/rag.ts`'nin üstüne `src/lib/ai/rag.ts`'nin içeriği yazıldı.
`git diff --stat`'ta 119 satır beklerken 379 görünce yakaladım — **her geri yüklemeden
sonra diffstat'a bak**, aynı sayıyı görmüyorsan bir şey karışmıştır.

Kural: yedek adını TAM YOLDAN türet (`${f//\//_}`), ya da hiç kopyalama —
`git stash` yok ([[fabrika-ab-baseline-without-git-stash]], paylaşılan ağaç), onun
yerine ölçümü tek bir dosyayla yap ve o dosyayı `git show HEAD:<yol>` ile geri al.
Bu repoda çakışan ad zaten bilinen bir tuzak: [[fabrika-two-rag-files-src-lib-rag-vs-ai-rag]].

İlgili: [[fabrika-verification-recipe-mutation-and-counterfactual]] · [[fabrika-agents-share-one-working-tree]]
