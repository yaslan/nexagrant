# TASK-MV15FL4X3AFQP (CE-692) — PR #68 kod incelemesi

**Hüküm: ONAY.** PR #68 (`be-fb/m7-module-unavailable`, commit `becbd68c`) birleştirmeye engel değil. Bloke etmeyen iki öneri PR'a yazıldı. Merge yapılmadı, kod değiştirilmedi.

## Ne yapıldı

Diff okundu (10 dosya, +200/−4). Dört doğruluk kontrolü:

1. **Digest prod'da taşınıyor mu? — Evet.** `node_modules/next` 16.3.4 `dist/server/app-render/create-error-handler.js` satır 79–81: hata zaten `digest` taşıyorsa Next bunu koruyor. `ModuleAccessError` (`src/lib/modules/access.ts`) `digest = 'MODULE_ACCESS_DENIED'` taşıyor. Prod build + `next start` üzerinde M7 e2e 14/14 geçti; yani prod'da mesaj görünüyor.
2. **`assertModuleAccess('M7')` yeri — doğru.** `src/modules/m7/server/actions.ts:62`: `matchTtoItemToCalls` içinde `requireTenantAction`'dan önce. Okuma yapılmadan reddediliyor. `createTtoItem` ile aynı sıra.
3. **Erişim kararı ikinci kez yazılmamış.** `src/lib/module-unavailable.ts` yalnız `code`/`digest` alanını tanıyor. Karar hâlâ `access.ts` + `state-machine.ts`'te.
4. **i18n.** `Common.moduleUnavailable` tr ve en'de var. İki dosyanın anahtar kümeleri birebir eşit (en-only: [], tr-only: []). Yeni sabit metin yok.

## Kanıt (ham çıktı özeti)

Kendi worktree: `/Users/macbook/alan/wt-ce692` (detached `becbd68c`, `.claude/worktrees` dışında). Ortam: `set -a; . .env.test; set +a`. DB: `127.0.0.1:5433/fabrika` (fabrika-postgres). 5432'ye bağlanılmadı.

- `pnpm install --frozen-lockfile` → Done. `pnpm exec prisma generate` → exit 0 (ilk typecheck/vitest, Prisma client üretilmediği için kırmızıydı; üretimden sonra geçti).
- `pnpm typecheck` → `tsc --noEmit`, exit 0.
- `pnpm exec vitest run tests/modules/m7.test.ts tests/module-unavailable-action-message.test.tsx` → `Test Files 2 passed (2)`, `Tests 13 passed (13)`.
- `pnpm exec playwright test tests/e2e/m7-tto-accelerator.spec.ts` (dev sunucu) → `14 passed (22.7s)`.
- `pnpm build` → exit 0; `E2E_WEB_SERVER=start pnpm exec playwright test tests/e2e/m7-tto-accelerator.spec.ts` (prod) → `14 passed (9.5s)`.
- `eslint` (değişen 5 kaynak dosya) → exit 0.

Ham loglar: `docs/…` yerine geçici çalışma dizininde (`typecheck.log`, `vitest.log`, `e2e.log`, `e2e-prod.log`, `build.log`, `lint.log`).

Not: `pnpm typecheck` ilk koşuda `tests/*.live.test.ts` ve `@prisma/client` hataları verdi; bunların sebebi üretilmemiş Prisma client'tı, PR ile ilgisi yok.

## Değişen dosyalar

Yok. Yalnız okuma ve test koşusu. Eklenen dosya: bu rapor. PR'a yorum: `gh pr review 68 --comment`.

## Bulgular

**Bloke eden:** yok.

**Öneri 1 (bloke etmez):** `src/lib/modules/access.ts` `checkModuleAccess` oturum yoksa `NO_TENANT` döndürüyor. `matchTtoItemToCalls` artık oturumsuz çağrıda "bu modül kapalı ya da planınızın dışında" mesajı gösterecek; önceden auth hatası alınırdı. Oturum kontrolü ayrı tutulabilir ya da mesaj ayrılabilir. Senaryo: oturumu düşmüş kullanıcı eşleştirme yapar → yanıltıcı "modül kapalı" mesajı.

**Öneri 2 (bloke etmez):** `src/lib/hooks/use-action-error-text.ts` doc yorumundaki bir satır çok uzun (`(src/lib/module-unavailable.ts, TASK-MUUS5HE3OW0CT). Pass a function…`). Yeniden sarmak yeterli.

## Açık sorular

- Yok.

## Sonraki adım

- Lider PR #68'i merge edebilir; öneriler isteğe bağlı.
- `.claude/worktrees` temizliğine dokunulmadı.
- Geçici worktree `/Users/macbook/alan/wt-ce692` içinde; temizlik gerekiyorsa `git worktree remove /Users/macbook/alan/wt-ce692 --force`.
