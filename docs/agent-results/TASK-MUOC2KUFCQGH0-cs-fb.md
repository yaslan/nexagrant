# TASK-MUOC2KUFCQGH0 — cs-fb — FB İNCELEME-108: crw-fb test borcu incelemesi

**Durum: DEVAM EDİYOR**

İncelenen: dev merge `eac69b44` (crw-fb/muoc2k-test-debt). Worktree: scratchpad `wt108` (detached dev `a0bec578`). İzole DB kurulacak; paylaşılan :5433'e bağlanılmayacak.

## Plan
1. Diff okuma (betik, route, 6 test dosyası) — yapıldı.
2. İzole Postgres + CI sırasıyla kurulum, `DATABASE_URL` echo.
3. Kendi mutantlarım (429→503, önek dışı 429, betiğin yanlış satırları açması, Content-Disposition sınır varyantları, S16d yarış).
4. Log sızıntı denetimi, eşdeğer mutant iddiası.
5. Tam `vitest run` + tsc/lint/build.
