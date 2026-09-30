# TASK-MUOADTEOQVL4Z — se-fb — M4 claim taşıma: yayın penceresi (B-1) + T-1..T-3

**Durum:** DEVAM EDİYOR

Dal: `se-fb/muoadt-m4-release` (dev `32eff357`'den). Kaynak bulgular: `docs/agent-results/TASK-MUO9IS43PM2KI-se-fb.md` §3 (B-1, T-1..T-3).

## Plan
1. B-1: `docs/RELEASE_CHECKLIST.md` §3.1/§3.3 sırası + gerekçe; kodda ucuz koruma (eski claim'i yeni kod da okusun).
2. T-1: UTC dışı TZ'de gün sınırı testi · T-2: `releaseDigest` koşullu geri verme testi · T-3: backfill canlı testi + `rls:verify` FORCE kontrolü.
3. İzole DB + mailpit + gerçek eski/yeni worker ile yayın penceresi senaryosu; mutantlar; tsc/lint/build + tam vitest.
