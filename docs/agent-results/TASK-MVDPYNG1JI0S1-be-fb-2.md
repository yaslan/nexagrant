# TASK-MVDPYNG1JI0S1 (FO-80) — push kapısı ve PR durumu (ek)

Bu dosya, `TASK-MVDPYNG1JI0S1-be-fb.md` (commit 720d3169) raporuna eklenen durum notudur. Asıl rapor değiştirilmedi.

- PR: https://github.com/yaslan/fonbridge/pull/102 (base `dev`, head `720d3169`), açık.
- Pre-push kancası tam gate'i koşturuyor (lint, typecheck, test, i18n, rls, rls-role, e2e, alerts). Kanca üç denemede de e2e adımında durdu:
  1. Varsayılan port 3000: patronun sunucusu (pid 96015) dolu. Süreç kapatılmadı.
  2. `E2E_PORT=3100`: başka bir ajanın worktree'sinin next-server'ı (pid 54147, `fo56-auditevent-claim`) dolu. Süreç kapatılmadı.
  3. `E2E_PORT=3300`: e2e **350 geçti, 1 kaldı**: `tests/e2e/admin-blog-rich-editor.spec.ts` "a paste from Word keeps only what the site shows" (FO-75, fe-fb).
- **Baseline kanıtı:** Aynı spec, temiz `origin/dev` (9cbc5761) üzerinde de aynı şekilde kırıldı (`toHaveText` başarısız). Hata bu PR'dan önce var; PR blog editörüne dokunmuyor. Aynı spec ilk tam koşuda geçmişti, kararsız (flaky) görünüyor.
- `--no-verify` ile push edilmedi; kanca atlanmadı. PR'daki commit uzak dalda (`git ls-remote` ile doğrulandı).
- "Gate temiz" DoD maddesi bu nedenle işaretlenmedi.
- Karar bekleniyor: (a) blog paste spec'i düzeltilene ya da karantinaya alınana kadar bekle ve yeniden push et; (b) kancanın bu tek kırık spec için istisnasına onay ver.
