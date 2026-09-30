# TASK-MUOAW0UAXVG1M — be-fb — FB İNCELEME-100: eylem hata-sızıntı bekçisi (AST) saldırgan inceleme

**Durum:** DEVAM EDİYOR
**İncelenen:** TASK-MUOACB79XEL25 (cs-fb), dev merge 30ec167d; inceleme HEAD d83d14a5 (ayrı worktree, izole DB).

## Plan
1. X2–X7 + yeni kaçış kalıpları (try/finally, allSettled reason, spread, template, JSON.stringify, e.cause/e.stack, yardımcı fonksiyon, import gölgeleme)
2. Gerçek ağaçta FP 0 + süre
3. G-1 canlı (bilinmeyen/boş/büyük harf/dizi)
4. Ö-1/Ö-2 kendi mutantları
5. Tam vitest + tsc/lint/i18n/build
