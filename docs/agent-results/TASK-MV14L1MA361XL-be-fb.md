# TASK-MV14L1MA361XL (CE-690): M7 modül kapalıyken "modül kullanılamıyor" mesajı

**hüküm:** Kod değişikliği tamam ve PR #68 açıldı (draft). Lint, typecheck ve M7 birim testleri yeşil. Ancak tam `pnpm test`, M7 e2e ve TR/EN ekran görüntüleri bu worktree'de koşulamadı: DB kimlik bilgisi yok. PR, bu kanıtlar eklenene kadar draft kalmalı.

**Platform:** mac (kod platforma bağlı değil; web).

## Ne yapıldı
1. `origin/dev` = `4875ee4b` güncel alındı. Yeni worktree: `/Users/macbook/alan/fb-worktrees/m7-module-unavailable` (`.claude/worktrees` DIŞINDA). Dal: `be-fb/m7-module-unavailable`. Eski `befb-e2e-m7` dokunulmadı.
2. Yalnız delta taşındı: `git diff bca4de65 0f4b0d84` → `git apply -3`. 10 dosya, +200/−4. Hepsi temiz uygulandı, çakışma yok.
3. `dev`deki `assertModuleAccess('M7')` davranışı korundu. Erişim mantığı ikinci kez yazılmadı; `checkModuleAccess` → `canAccessStatus` (state-machine) yolu aynen duruyor.
4. `matchTtoItemToCalls`'a `assertModuleAccess('M7')` eklendi. `dev`de bu eylemde kapı yoktu; `createTtoItem` ve `generateIpChecklist`'te zaten vardı, çift kapı yok.
5. i18n `moduleUnavailable` anahtarı `messages/en.json` ve `messages/tr.json` içinde var.
6. Commit: `becbd68c fix(m7): surface module-unavailable refusal on TTO actions`. Push: `be-fb/m7-module-unavailable`.
7. PR: https://github.com/yaslan/fonbridge/pull/68 (draft, base `dev`).

## Kanıt (ham çıktı)
- `pnpm lint` → `✖ 4 problems (0 errors, 4 warnings)`, exit 0 (uyarılar delta dışı, önceden var).
- `pnpm typecheck` → exit 0. (İlk denemede Prisma client üretilmemişti; `pnpm db:generate` sonrası geçti.)
- `perl -e 'alarm 900;exec @ARGV' pnpm test` → `Test Files 14 failed | 295 passed | 28 skipped`, `Tests 51 failed | 3844 passed | 619 skipped`. Başarısız dosyalar DB'ye bağlı (`plan-admin`, `plan-repository`, `settings-profile-update`, `*.live.test.ts`) ve hata `Authentication failed against the database server` / `DATABASE_URL` yok. Bu worktree'de `.env` yok.
- M7 birim testleri (odaklı koşu): `tests/modules/m7.test.ts` ve `tests/module-unavailable-action-message.test.tsx` geçti. `settings-modules-plan` test dosyası da worktree'de DB şifresi eksik olduğu için düştü; ana checkout'ta aynı dosya `6 passed`.
- `pnpm exec playwright test tests/e2e/m7-tto-accelerator.spec.ts` → exit 1. Test 1 seed aşamasında `PrismaClientKnownRequestError: Authentication failed ... fabrika`; kalan 13 test çalışmadı.

## Engel: neden e2e ve ekran görüntüsü yok
- Worktree'ye `.env`, `.env.local`, `.env.test` kopyalamaya çalıştım. Üçü de izin kuralıyla engellendi (`deny rule`). Bu kuralı aşmaya çalışmadım; DB kimlik bilgilerine erişmedim.
- Sonuç: M7 e2e ve gerçek tıklama (M7 off TR/EN mesaj, M7 on mutlu yol) çalıştırılamadı. Ekran görüntüsü alınmadı. Bu, DoD'un açık kalan iki maddesi.
- Çözüm: DB kimlik bilgisi (`E2E_DATABASE_URL` / `DATABASE_URL`) bu worktree'ye verilirse ya da CI'da koşulursa e2e ve screenshot'lar tamamlanır.

## Değişen dosyalar
- Yeni: `src/lib/module-unavailable.ts`, `tests/module-unavailable-action-message.test.tsx`
- Değişen: `src/lib/modules/access.ts`, `src/lib/hooks/use-action-error-text.ts`, `src/modules/m7/server/actions.ts`, `src/app/[locale]/(app)/[workspace]/tto/client.tsx`, `messages/{en,tr}.json`, `tests/e2e/m7-tto-accelerator.spec.ts`, `tests/modules/m7.test.ts`

## TASK-MUUS5HE3OW0CT ile ilişki
- Bu iş o kartın devamı. CE-646 (MUUS5…) `done` ama üç hatadan yalnız BUG-1'in (`createTtoItem` kapısı) kodu dev'e girmiş; "refusal kullanıcıya gösterilmez" kısmı açık kalmıştı. Bu PR o açığı kapatıyor.
- Ek bulgu: CE-646'nın "kapı deseni" listesinde geçen `matchTtoItemToCalls` dev'de gerçekten kapısızdı. Bu PR ekliyor. CE-646 kapanış notu bu açığı içermiyordu.

## Gizli bilgi / veri
- Delta'da gerçek sır yok (`sk_live_`, PEM, JWT taraması temiz).

## Genelleme notu (uygulanmadı)
- Mekanizma (`ModuleAccessError` + `digest` + `useActionErrorText`) modül bağımsız. `assertModuleAccess` kullanan her modülün eylemi aynı mesajı alabilir. Üç ayrı kullanım yeri (M7 dışında) bu kartın kapsamı değil; ayrı kart önerilir.

## Açık sorular
1. E2E koşusu için DB kimlik bilgisi bu worktree'ye verilsin mi, yoksa CI mı koşturacak?
2. PR draft kalsın mı; e2e ve screenshot tamamlanınca mı işaretlenecek?

## Definition of Done
- [x] Yeni dal güncel `dev` tabanında; yalnız delta taşındı (`becbd68c`)
- [x] i18n anahtarı tr ve en'de var
- [x] lint (0 error) ve typecheck geçti
- [ ] `pnpm test` tam koşu yeşil değil (DB'li testler, env eksik)
- [ ] M7 e2e yeşil değil (DB kimlik bilgisi yok)
- [ ] TR/EN ve mutlu yol ekran görüntüleri alınmadı (aynı engel)
- [x] PR açıldı: #68 (draft)
- [x] Platform: mac (web)
