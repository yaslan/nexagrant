# TASK-MUNSBP474W7JQ — M4 60-gün özeti: günde tek özet, kullanıcı düzeyinde (İNCELEME-56 Y-1) — se-fb

**Durum: DEVAM EDİYOR**

Dal: `se-fb/munsbp-digest-once` (dev `701706ef`'ten), kendi worktree'm. İzole DB `sefb-sbp-pg` (127.0.0.1:55492) + `sefb-sbp-mailpit` (:11192/:18092). Paylaşılan fabrika :5433'e yazılmıyor.

Yaklaşım: İnceleme'nin (b) yolu. Kiracı CAS claim'lerinden sonra `withSystemScope('cross-tenant-job')` ile kullanıcının BAŞKA bir üyeliğinde bugünün claim'i var mı diye bakılır; varsa claim'ler geri verilir, özet gitmez.

Kanıt, değişen dosyalar ve kapılar iş bitince eklenecek.
