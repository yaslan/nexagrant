# TASK-MUO7JSP5FKI8 — FB İNCELEME-91: embedding istek-400 düzeltmesi incelemesi (se-fb)

**Durum: DEVAM EDİYOR**

İncelenen: TASK-MUO4GPRO92N97 (be-fb), dev `c214f02d` (kod `bc0ec6a3`). Worktree: scratchpad `wt` (detached c214f02d). İzole DB kurulacak; paylaşılan :5433'e yazılmayacak.

## Plan
- OpenAI'nin gerçek 400 gövdeleriyle (param/model/token-limit/içerik) istek-satır sınıflandırması
- Kilit açma komutu: yalnız yanlış kilitlenenler mi açılıyor
- Büyük harf EL/RU tahmini (gerçek tiktoken)
- 429×3 → aborted
- Kendi mutantlarım
- Tam vitest + tsc/lint/build
