---
name: a-green-run-belongs-to-a-file-state-not-a-file
description: Paylaşımlı ağaçta "1649 test geçti" bir DOSYAYA değil bir dosya DURUMUNA aittir — yeşili md5 ile çivile, ve altında beliren "regresyonu" komşunun mutasyon testi olabileceği için raporlamadan ÖNCE sor
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

Fabrika'da paralel ajanlar tek çalışma ağacını paylaşır ([[fabrika-agents-share-one-working-tree]]).
Bunun benim işim (doğrulama) için özel bir sonucu var: **yeşil bir koşu, koştuğun anki dosya
durumunun kanıtıdır — dosyanın kendisinin değil.** İkisi arasındaki fark saniyelerle ölçülür.

2026-09-09, TASK-MTU6KE36HAFJR (iki RAG dosyasının birleştirilmesi) sırasında `src/lib/rag.ts`
**iki kez** altımdan değişti:

1. Yazdığım 490 satırlık birleştirme tamamen geri alındı — dosya 280 satırlık orijinaline döndü.
   Fark etmemin tek sebebi, `Write`'tan sonra `wc -l` + `grep -c '<kart-id>'` koşmuş olmamdı.
2. Sildiğim uydurma CORDIS fallback'i birleştirilmiş dosyaya **geri kondu** — üstelik daha kötü
   bir biçimde (hatayı `console.warn` ile yutup boş sonuçta da sahte veri döndürüyordu).

**Kritik hata burada:** ikincisini raporuma "regresyon, kaynağı belirlenmeli" diye yazdım.
**Yanlıştı.** Kardeş kart (TASK-MTUH5L8MJ6S8E) o sırada aynı dosyada çalışıyordu ve gördüğüm şey
onların **mutasyon testiydi** — kusuru bilerek geri koyup korumanın gerçekten kırıldığını ölçmek
([[fabrika-verification-recipe-mutation-and-counterfactual]] yöntemi). Yani kanıt üreten bir
komşuyu hata yapmakla suçlamış oldum; raporu commit'ledikten sonra düzeltmek zorunda kaldım.

**Nasıl uygulanır:**
- Kendi yazdığın dosyanın **hayatta kaldığını**, yazdıktan HEMEN sonra ve rapordan HEMEN önce
  doğrula: `md5 -q <dosya>`, `wc -l`, kendi kart id'ini `grep -c`. Raporda **hash'i yaz** —
  "yeşil" iddiası o hash'e ait olsun.
- Ağaçta altından bir değişiklik gördüğünde, **"regresyon" demeden önce sahibini ara**:
  `git log --oneline -5`, `git show --stat <son commit>`, ve kardeş ajanların hafıza kartları
  (`.agentspace/memory/shared/`) — mutasyon testi, geçici kusur enjeksiyonu ve `git checkout`
  ile temizleme hepsi meşru ara adımlardır. Anlık bir kare, niyeti göstermez.
- Bu, kırmızı için zaten bildiğim kuralın ([[shared-worktree-red-must-be-attributed-before-it-is-reported]])
  **yeşile ve kod değişikliğine** uzanan hâlidir: attribution yalnız hata için değil, ağaçta
  gördüğün HER beklenmedik değişiklik için gerekir.
