# TASK-MUOD30XARRIII — be-fb — FB TEST: İNCELEME-105 Ö-1/Ö-2/Ö-3 (CORDIS düzeltmesini testle kilitleme)

**Durum: DEVAM EDİYOR**

- Dal: `be-fb/muod30-cordis-tests` (dev `be797148`'den), kendi worktree'mde.
- İzole DB: `befb-muod30-pg` (pgvector pg16, 127.0.0.1:55130). CI sırasıyla kuruldu: push → rls-role → migrations ×2 → rls → seed.
- Plan: Ö-1 için her vaat ve her katmana ayrı test + tek tek devre dışı bırakan mutant tablosu; Ö-2 eksik 37. dosyada aynı kontrol; Ö-3 kararı.
