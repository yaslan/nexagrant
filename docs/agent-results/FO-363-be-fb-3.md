# FO-363 — PR #256 güncellemesi (üçüncü rapor)

> Dosya adı `-3`: `FO-363-be-fb-2.md` zaten commit'li (`40063398`, önceki bir rapor); kanıt dosyaları üzerine yazılmaz.

**hüküm:** Kısmen tamamlandı. PR #256 yeni head `37d0d1ff` ile `dev`'e bağlandı, `origin/dev` ile birleştirildi, tam izole gate yeşil (`GATE_EXIT=0`). Canlı keep.eu koşusu yapılmadı: `KEEP_EU_API_KEY` ortamda yok, anahtar aranmadı, başka yerden alınmadı. PR draft kaldı; birleştirilmedi, ready yapılmadı.

**platform:** mac (Darwin 27.2.0, zsh). Windows ve Linux'ta koşulmadı.

## 1. Ne yapıldı

- Önceki head `189eee5a` (PR #256 açıkken) → `origin/dev` (ff780f8f, PR #254 birleşmiş) `git merge` ile birleştirildi. Yeniden yazma ya da force push yok. Birleştirme commit'i: `37d0d1ff`. Çakışma yoktu; dev'in dokunduğu dosyalar (`board.tsx`, `tests/e2e/pipeline-dashboard-happy-path.spec.ts`) keep-eu kapsamı dışında.
- Normal `git push origin be-fb/fo363-keep-eu-exclude-persons` → remote tip `37d0d1ff` (`git ls-remote` ile doğrulandı). Push, pre-push kancası üzerinden izole DB ile tam gate'i çalıştırdı ve geçti.
- `gh pr edit 256 --base dev` → base `dev`, `isDraft: true`, `headRefOid: 37d0d1ff…`, `state: OPEN`. (Doğrulama: `gh pr view 256 --json baseRefName,isDraft,headRefOid`.)
- Bu rapor yeni dosya olarak yazıldı; önceki `docs/agent-results/FO-363-be-fb.md` değiştirilmedi (kanıt dosyası üzerine yazma kuralı).

## 2. Gate (tam koşu, önbellek kapalı)

Komut: `FONBRIDGE_GATE_NO_CACHE=1 bash scripts/gate-isolated.sh` (izole Postgres konteyneri, sonunda silindi).

Ham sonuç satırları:
```
✖ 4 problems (0 errors, 4 warnings)
 Test Files  481 passed | 3 skipped (484)
      Tests  6232 passed | 57 skipped (6289)
önbellek kaydı yazıldı: 02029a2a578494b0197829297f2d22a4c667c66e
GATE_EXIT=0
```

Not: ilk denemede (`bash scripts/gate-isolated.sh`, önbellek açık) gate-lock aynı ağaç + lock için kayıtlı yeşil sonucu döndürdü ve "tam gate atlandı" yazdı. Bu koşu kanıt olarak kullanılmıyor; yukarıdaki önbellek kapalı tam koşu esas alınıyor. Ham log: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/63f70fdd-b7b3-488c-b98e-12b0b70552b9/scratchpad/fo363/gate-full.log`.

Lint: 4 uyarı, 0 hata (bu branch'in eklediği değil; önceki commit'lerde de vardı).

## 3. Canlı keep.eu koşusu

Yapılmadı. `KEEP_EU_API_KEY` ne shell ortamında ne worktree `.env` dosyasında tanımlı (`.env` içinde boş-olmayan satır sayısı 0). Anahtar aranmadı, başka projeden alınmadı. Bu nedenle canlı sayılar bu raporda yok; FO-363 tam bitmiş sayılmaz, canlı kısım bekliyor. Anahtar sağlandığında aynı branch'te canlı koşu yapılabilir.

## 4. Önceki raporun düzeltmesi (`FO-363-be-fb.md` §3.2)

Eski raporda "INTERREG_PROJECT dokümanları = 1120 (dört koşu × 280)" yazıyordu. Bu bir üründe ya da veri çoğaltmada hata değildir; test düzeneğinin bir artefaktıdır: akronim her koşuda `Date.now()` ile yeniden üretildiği için aynı kayıt her koşuda yeni bir doküman olarak yazıldı. Ürün kodu (dedupe anahtarı, RAG yazımı) bu sayıyı yanlış üretmiyor; sayı yalnızca tekrarlı test koşularında birikti. Bu, FO-365 raporunun bulgusudur ve bu düzeltme o bulguyla aynı yönde.

## 5. Riskler

- Canlı keep.eu verisi ile koşu yapılmadı; gerçek veri şeklinde beklenmeyen bir durum olabilir.
- Gate'in test sayıları (6232) ile FO-369 branch'inin sayıları (6233) farklı; FO-363 branch'inde farklı bir test seti var, bu normal.

## 6. Sonraki adım

- Lead, `KEEP_EU_API_KEY` sağlanırsa canlı koşuyu bu branch'te tekrar isteyebilir.
- PR #256 draft; merge ve ready lead kararı.
