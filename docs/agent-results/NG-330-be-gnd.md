---
görev: TASK-MWS6F8L4FP5WF
kod: NG-330
ajan: be-gnd
tip: bug (NG-8 takibi: B-1 e-posta OFF yarışı, B-2 tercih okuma uyarısı)
hüküm: "Bitti: B-1 ve B-2 düzeltildi ve test edildi. Draft PR #412 açık, 8/8 CI check yeşil, birleştirilmedi. Mac koşulmadı."
platform: "Windows 11 Pro + WSL2 Ubuntu-24.04. mac ve WSL dışı Windows koşulmadı."
---

# NG-330 — NG-8 takibi: e-posta KAPALI yarışı (B-1) ve tercih okuma uyarısı (B-2)

**Kart:** TASK-MWS6F8L4FP5WF · **Ajan:** be-gnd · **PR:** https://github.com/yaslan/nexagrant/pull/412 (draft, base `dev`, head `task/ng-330` = `03fc5dc19f0ff2cb06f1e09f89758e61e805a818`)
**Worktree:** `~/alan/FONBRIDGE-ng330` (taban `origin/dev` = `48760af0`)

## Ne yapıldı

**B-1 (e-posta OFF, claim sonrası).** Batch claim edilip yenilendikten sonra kullanıcı e-postayı KAPALI yapınca SMTP çağrısı yine gidiyordu. Düzeltme `src/lib/notifications/email-outbox.ts`: SMTP çağrısından hemen önce tercih yeniden okunur (`stillWanted`); olayın e-postası OFF ise öğe gönderilmeden silinir (`itemsDropped`). `afterClaim` seam'i, yarışı testte deterministik kurmak için eklendi.
- Kalan pencere: SMTP çağrısı zaten başlamışsa mail geri alınamaz. Bu sınır kodda ve bu raporda belirtildi.

**B-2 (tercih okuma hatası).** `src/app/[locale]/(app)/[workspace]/notifications/page.tsx`: okuma hata verirse mevcut `Notifications.preferences.loadFailed` metni (`messages/en.json` ve `messages/tr.json`) `role="alert"` ile gösteriliyor. Yeni i18n anahtarı eklenmedi.

## Kanıt

- **Yarış testi (canlı, gerçek DB):** `tests/notification-email-concurrency.live.test.ts` → `e-mail switched OFF after the claim: the queued mail is not sent (NG-330 B-1)`. Düzeltme geri alındığında (mutant `return true ||`) test kırmızı oldu: `mailsSent` 0 beklenirken 2 geldi. Dosya geri yüklendi; `return true ||` kalıntısı yok (doğrulandı).
- **Birim:** `tests/notification-preferences.test.ts` → `e-mail switched OFF after the claim (NG-330 B-1)`: OFF tercihte mailer çağrılmıyor, öğe siliniyor.
- **E2E (B-2, Playwright, gerçek hata):** `tests/e2e/notifications-preferences.spec.ts`, 8 test. Tercih tablosu bir sayfa yüklemesi süresince yeniden adlandırıldı; Prisma `P2021` hatası oluştu; TR ve EN uyarıları (`notification-preferences-load-failed`) doğrulandı; tablo `finally` ile geri alındı, form döndü.
- **Tam suite:** `pnpm test` → `Test Files 610 passed | 4 skipped (614)`, `Tests 8617 passed | 75 skipped (8692)`.
- **Gate:** `E2E_PORT=3110 pnpm gate`, izole DB `fabrika_test_ng330` (127.0.0.1:5630) → `GATE_EXIT=0` (log `/tmp/ng330-gate.log` satır 8080).
- **Lint / typecheck / i18n:** `pnpm lint`, `pnpm typecheck`, `pnpm i18n:check` çıkış kodu 0.
- **PR CI (`gh pr checks 412`):** build-and-test, cordis-worker, e2e (1), e2e (2), e2e (3), e2e-gate, i18n-audit, lighthouse-a11y: hepsi `pass`.

## Değişen dosyalar

- `src/lib/notifications/email-outbox.ts`
- `src/app/[locale]/(app)/[workspace]/notifications/page.tsx`
- `tests/notification-email-concurrency.live.test.ts`
- `tests/notification-preferences.test.ts`
- `tests/e2e/notifications-preferences.spec.ts`

## Riskler

- **B-1 kalan pencere:** SMTP çağrısı başladıktan sonra yapılan OFF, o maili geri çekemez. Tam kapatmak için in-flight gönderimlerin beklenmesi gerekir; daha ağır bir değişiklik, bu karta alınmadı.
- **E2E enjeksiyonu:** Tablo yeniden adlandırma yalnız izole DB'de yapıldı. Paralel bir e2e aynı pencerede tabloya bakarsa etkilenebilir; `finally` ile geri alınır.
- **Gürültü:** E2E sırasında dev sunucu log'unda `ECONNRESET aborted` uyarıları çıktı; testleri başarısız etmedi.

## Açık sorular

- Yok. Kalan pencereyi kapatmak isterseniz ayrı bir kart açılmalı.

## Sonraki adım

PR #412 draft olarak bekliyor. Birleştirme ve draft'tan çıkarma kararı kullanıcıda; birleştirilmedi.

## Doğrulanmayanlar

- mac ve WSL dışı Windows koşulmadı.
- Ekran görüntüleri (`load-failed-en.png`, `load-failed-tr.png`) e2e tarafından üretildi; dosya yolu bu raporda ayrıca doğrulanmadı.
