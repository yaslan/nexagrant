---
name: fabrika-ci-has-no-remote
description: Fabrika deposunun git remote'u YOK — .github/workflows/ci.yml hiçbir zaman koşmaz, kapı yalnız lokal komutlardır
metadata:
  type: project
updatedAt: 2026-09-07
---

`git remote -v` boş döner. Depo tamamen lokal (`dev` ve `main` yerel branch'ler).
Yani `.github/workflows/ci.yml` GEÇERLİ ve doğru yazılmış olsa bile **hiç çalışmaz**;
GitHub Actions'ın tetiklenmesi için bir uzak depoya push gerekir.

2026-09-07: patron kararıyla kapı `dev` branch'ine de eklendi (`2a725f6`) — doğru
değişiklik, ama uzak depo bağlanana kadar ETKİSİZ.

2026-09-07 (aynı gün, `d23ca71`): gerçek kapı olarak `githooks/pre-commit` +
`githooks/pre-push` kuruldu ve `git config core.hooksPath githooks` etkinleştirildi.
`pnpm gate` = lint + typecheck + test. Yeni bir makinede/klonda `pnpm hooks:install`
çağırmadan hook'lar ÇALIŞMAZ (core.hooksPath repo-lokal ayardır, commit'lenmez).

**Nasıl uygula:** "CI yeşil/kırmızı" diye bir şeye dayanma; bu depoda tek gerçek kapı
lokal `pnpm lint && pnpm typecheck && pnpm test` çıktısıdır ve onu ajanın KENDİSİ
koşmak zorundadır. Bir işi "kapı temiz" diye kapatırken kanıt olarak komutun kendi
çıktısını iste, "CI geçti" ifadesini kabul etme.
