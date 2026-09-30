# TASK-MUO4GO5ARDY2W — FB GÜVENLİK (İNCELEME-86 Y-1): silinmiş kiracının oturumsuz yolları

**Durum:** DEVAM EDİYOR · **Ajan:** be-fb · **Tarih:** 30.09.2026
**Dal:** `be-fb/muo4go-deleted-tenant-paths` (dev `6d7e5b51`'den), ayrı worktree. İzole DB `befb-o4go-pg` (127.0.0.1:5487); paylaşılan `fabrika` :5433'e bağlanılmıyor.

## Plan
1. `authenticateApiKey`: silinmiş kiracının anahtarı 401 (mevcut sayaç UPDATE'ine `EXISTS` koşulu, ek sorgu yok).
2. Partner portalı (sayfa + `generateMetadata` + `addBudgetLineByToken`): silinmiş kiracıda okuma → 404, yazma → `success:false`.
3. Diğer oturumsuz yollar tarandı (tablo bitince burada).
4. `credits-monthly-grant`: `deletedAt: null`.
5. Canlı testler (P1/P2 tersi + geri alma), mutantlar, kapılar.
