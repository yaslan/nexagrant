---
sözleşme: 3
kod: WT-MOVE-01
ajan: leed-fb
motor: claude
tip: diğer
okur: kullanıcı
hüküm: Bitti: İki FONBRIDGE worktree'si git worktree move ile FONBRIDGE/.claude/worktrees/ altına taşındı, tsconfig onları hariç tutuyor ve typecheck geçiyor.
platform: mac (yerel çalışma alanı); işlem yalnızca dosya sistemi ve git ile yapıldı
sürüm: 1
tarih: 2026-10-13T07:27:41.470Z
---

# fb-worktrees FONBRIDGE içine taşındı

## Ne yapıldı
- `~/alan/fb-worktrees/m7-module-unavailable` → `FONBRIDGE/.claude/worktrees/m7-module-unavailable` (dal `be-fb/m7-module-unavailable`, becbd68c)
- `~/alan/fb-worktrees/m7-tto-i18n` → `FONBRIDGE/.claude/worktrees/m7-tto-i18n` (dal `be-fb/m7-tto-i18n`, 10ea66d3)
- Taşıma `git worktree move` ile yapıldı. Taşımadan önce iki worktree'de de commit'lenmemiş değişiklik olmadığı ve onları kullanan bir süreç bulunmadığı kontrol edildi.
- `tsconfig.json` `exclude` listesine `.claude/worktrees` eklendi. vitest ve eslint bu klasörü zaten dışarıda bırakıyordu; `.gitignore` da onu kapsıyor.
- Takımın ortak hafızasına `fonbridge-worktrees-location` notu yazıldı, ekip odada bilgilendirildi.

## Kanıt
```
git worktree list
/Users/macbook/alan/FONBRIDGE/.claude/worktrees/m7-module-unavailable  becbd68c [be-fb/m7-module-unavailable]
/Users/macbook/alan/FONBRIDGE/.claude/worktrees/m7-tto-i18n            10ea66d3 [be-fb/m7-tto-i18n]
git status --short (her iki worktree) → 0 satır
tsc --listFilesOnly | grep -c worktrees → 0
pnpm typecheck → EXIT=0
```

## Değişen dosyalar
- `tsconfig.json`

## Riskler
- `~/alan/fb-worktrees/` klasöründe yalnızca `.DS_Store` kaldı. Klasör silinmedi.
- Kayıtları kopmuş 6 eski worktree girdisi (`/private/tmp` altında, "prunable" işaretli) olduğu gibi bırakıldı. Bunlar kapsam dışında olduğu için temizlenmedi.
- Eski raporlarda `fb-worktrees` yolu hâlâ geçiyor; bunlar tarihsel kayıt olduğu için değiştirilmedi.

## Sonraki adım
- Boş kalan `fb-worktrees/` klasörünün silinmesi ve prunable girdilerin temizlenmesi patron onayıyla yapılabilir.
