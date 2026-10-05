---
name: fabrika-ab-baseline-without-git-stash
description: Testin senin değişikliğinden mi kırmızı olduğunu paylaşılan ağaçta ölçmenin yolu — `git stash` DEĞİL, sadece kendi dosyalarını `git show HEAD:` sürümüyle geçici takas et
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Bir test kırmızı ve suçun sende olup olmadığını bilmen gerekiyor. Doğru hamle A/B: değişikliğini
geri al, aynı testi koş, geri koy. Ama bu depoda ajanlar **tek bir çalışma ağacını paylaşıyor**
([[fabrika-agents-share-one-working-tree]]), yani baseline almanın alışılmış yolları zararlı:

- `git stash` / `git stash pop` — ağaçtaki HERKESİN değişikliğini alır, sonra geri koyarken
  çakışır. Başka ajanın yarım işini yok edebilirsin.
- `git checkout -- <path>` — kendi değişikliğini KALICI olarak siler, geri dönüşü yok.
- `git reset --hard` — asla ([[fabrika-concurrent-agents-and-git-reset-hard]]).

İşe yarayan, yalnız kendi dosyalarına dokunan yöntem:

```bash
S=<scratchpad>
cp "path/to/mine.tsx" $S/mine.tsx                    # kendi sürümünü yedekle
git show HEAD:"path/to/mine.tsx" > $S/head.tsx       # baseline'ı çıkar
diff $S/head.tsx $S/mine.tsx                         # SADECE kendi düzenlemen görünmeli — görünmüyorsa dur
cp $S/head.tsx "path/to/mine.tsx" && <testi koş>     # BASELINE
cp $S/mine.tsx "path/to/mine.tsx"                    # geri koy, diff ile doğrula
```

`diff` adımı zorunlu: dosyada senden başkasının da düzenlemesi varsa `git show HEAD:` onu da
geri alır ve baseline'ı kirletir — o durumda bu dosyada A/B yapma.

**Why:** "aynı 4 test, benim değişikliğim olmadan da kırmızı" cümlesi ancak ölçülmüşse rapora
yazılabilir. Ölçmeden "bende değil" demek tahmin; ölçmeden düzeltmeye girişmek de olmayan bir
kusuru kovalamak. 2026-09-08'de TASK-MTS6MMOD8XF3A'da 4 e2e kırmızısı tam böyle aklandı
(kök neden: [[fabrika-e2e-seed-riding-specs-go-red-on-plan-drift]]).

**How to apply:** Dokunduğun dosyaları kapsayan bir paket kırmızıysa, raporda suçu üstlenmeden ya
da başkasına atmadan ÖNCE bu takası yap; baseline çıktısını (geçen/kalan sayıları) rapora yapıştır.
