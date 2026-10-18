---
sözleşme: agentspace-sonuc-v2
görev: TASK-MVDSTYM1ZI8Y5
kod: FO-82
ajan: se-fb
motor: claude-haiku-5-5
tip: düzeltme (PR #108 inceleme bulgu 1–2)
okur: patron, crw-fb, be-fb
hüküm: TAMAM — bulgu 1 ve 2 kapandı; tam gate yeşil (EXIT=0, 366 passed, 10 skipped); PR #108 güncellendi
platform: sunucu + yasal metin, işletim sisteminden bağımsız; doğrulama mac (darwin), yerel
tarih: 2026-10-18
---

# TASK-MVDSTYM1ZI8Y5 (FO-82) — PR #108 inceleme düzeltmesi (se-fb, 3. sonuç)

**Dal:** `se-fb/fo82-audit-erasure` · **Worktree:** `/Users/macbook/alan/FONBRIDGE-se-fb-fo82` · **Karar:** K-569484 (uygulandı, C) + patron kararı "etkisiz satır kaldırılacak".
**İnceleme kaynağı:** `docs/agent-results/TASK-MVDSTYM1ZI8Y5-crw-fb.md` (bulgu 1 ve 2).

## Ne yapıldı

1. **Bulgu 1 — etkisiz `target` satırı kaldırıldı.** `src/lib/jobs/tasks/users-scheduled-deletion.ts`: `auditEvent.updateMany({ where: { target: userId }, data: { target: subjectRefOf(userId) } })` ve yorumu silindi. Yerine kısa bir yorum kondu: `member.removed` `target` içinde membership id yazar; kişiyle bağ `Membership.user onDelete: Cascade` ile kopar. `subjectRefOf` `user.erased` için kullanıldığından korundu.
2. **Bulgu 2 — sentetik test kaldırıldı.** `tests/users-scheduled-deletion.test.ts`: `where: { target: 'due' }` assert'i silindi. Yerel "canlı probe" iddiası geri çekildi: üretimde `target = userId` satırı yok, dolayısıyla o probe gerçek davranışı kanıtlamıyordu. Bu rapor yeni bir probe koşmadı.
3. **Allowlist.** `tests/where-guard-src.test.ts`: kaldırılan satırı gösteren `target: userId` girdisi silindi. Girdi bırakılınca "KNOWN has no stale entries" testi kırılıyordu. Görev listesinde bu dosya yoktu; bilerek dokunuldu.
4. **Yasal kayıt.** `docs/legal/processing-register.md` §13 (satır 192) ve §22/3 (satır 434) düzeltildi: `target` kullanıcı kimliği taşımaz; `member.removed` membership id yazar; bağ cascade ile kopar; silme kaydı `user.erased` tek yönlü özet taşır.
5. **Metin ve sürüm — değişmedi.** DPA §6.3 tr/en ve `terminationBody` (tr/en) "kullanıcı kimliği bağlantısı kaldırılır" diyor; cascade bunu karşılıyor. Çelişki olmadığı için `messages/*` ve `PRIVACY_NOTICE.version` (`2026-10-18.2`) aynen kaldı.

## Kanıt (ham çıktı)

```
$ pnpm typecheck
$ tsc --noEmit                      # hata yok

$ pnpm i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.

$ pnpm exec vitest run tests/users-scheduled-deletion.test.ts tests/where-guard-src.test.ts
 Test Files  2 passed (2)
      Tests  17 passed (17)

$ E2E_PORT=3200 pnpm gate      (log: scratchpad/gate.log)
 Test Files  359 passed | 7 skipped (366)
      Tests  4746 passed | 120 skipped (4866)
  ✅ SUCCESS: All 47 tenant-scoped models have RLS policies registered.
  ✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
  ✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed ...
  ✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
  366 passed (7.9m)
  10 skipped
  ✅ Öksüz alarm yok ...
EXIT=0
```

**Skipped:** birim 120 (7 dosya), e2e 10. Gate `--no-verify` olmadan, `E2E_PORT=3200` ile koştu; :3000 dokunulmadı.

**Lint:** 0 hata, 4 uyarı; uyarılar değiştirilmeyen dosyalarda (`src/lib/invitations/accept.ts`, `tests/e2e/fixtures/concept-template-tenant.ts`, `tests/settings-profile-update.test.ts` ×2). Önceden vardı.

**Not — DB:** `rls:verify` ve `db:rls-role` adımları `DATABASE_URL` / `DATABASE_URL_RLS_TEST` üzerinden çalıştı. `.env` okunmadığı için bağlanılan host doğrulanmadı; `db:rls-role` yalnız `fabrika_app` rolünün varlığını doğruladı. Canlı DB'ye yazma yapılmadı (bilinen kapsam: `rls:verify` yerel rolled-back yazma yapar).

## Değişen dosyalar

- `src/lib/jobs/tasks/users-scheduled-deletion.ts` (−6 +3)
- `tests/users-scheduled-deletion.test.ts` (−6)
- `tests/where-guard-src.test.ts` (−1)
- `docs/legal/processing-register.md` (§13, §22/3)
- `docs/agent-results/TASK-MVDSTYM1ZI8Y5-se-fb-3.md` (bu dosya)

## Riskler

- `where-guard-src` allowlist değişikliği görev listesi dışında; bilgi için işaretlendi.
- Bulgu 3 (`subjectRefOf` üç kopya) ve 4 (`docs/DATA_MODEL.md` 144/958) bu işin kapsamı dışında; ayrı kart gerekli.

## Açık sorular

- Yok.

## Sonraki adım

1. Commit + push (`git commit -- <yollar>`), PR #108 güncellenir.
2. Crw-fb için delta incelemesi (ya da kısa yeniden inceleme).
3. Bulgu 3 ve 4 için ayrı kart.
