---
sozlesme: 3
gorev: NG-155 düzeltme turu 3 (sahte SMTP ayarları envOverride'a)
kod: TASK-MWFIM69S7EJQA
ajan: be-gnd
motor: claude-code (Sonnet 5.5)
tip: test-fix
okur: lider
hukum: BAŞARILI — SMTP üç satırı `envOverride`'a taşındı, değerin okunduğu kanıtlandı, iki dosya iki ortamda yeşil
platform: mac (Darwin) — koşuldu; Linux/Windows koşulamadı (yalnız vitest + TS, platforma bağlı kod yok)
surum: 2
tarih: 2026-11-14
---
# NG-155 düzeltme turu 3

## Ne yapıldı
- `SMTP_HOST/PORT/FROM` `vi.hoisted` `state`'ten çıkarıldı, `envOverride`'a eklendi (iki dosya). Her ikisinde de `envOverride` zaten vardı; yeni mock kalıbı gerekmedi. Tip şekli (`as string | undefined`) korundu.
- Commit: 466721f8 `test(invitations): move fake SMTP settings into envOverride (NG-155)` (yalnız iki test dosyası, src/ dışı, push yok).

## Kanıt
Geçici probe (commit'lenmedi, kaldırıldı), `SMTP_HOST='' npx vitest run … -t TMP-PROBE --disableConsoleIntercept`:
```
PROBE {"host":"smtp.example.invalid","port":"587","from":"NexaGrant <noreply@example.invalid>"}
```
Yeşil koşular (izole DB 127.0.0.1:5588/ng155, iki dosya birlikte):
```
SMTP_HOST=''          Test Files 2 passed (2)  Tests 19 passed (19)
SMTP_HOST='localhost' Test Files 2 passed (2)  Tests 19 passed (19)
```
`pnpm lint`: `✖ 4 problems (0 errors, 4 warnings)` (uyarılar bu değişiklik dışı dosyalarda: accept.ts, concept-template-tenant.ts, settings-profile-update.test.ts). `pnpm typecheck`: son satır `$ tsc --noEmit`, çıkış kodu 0. Pre-commit: `✓ Kapı temiz (staged kapsamı).`

## git diff (466721f8)
```diff
diff --git a/tests/invitation-mail-limit.live.test.ts b/tests/invitation-mail-limit.live.test.ts
index 3a02d428..007c5bfb 100644
--- a/tests/invitation-mail-limit.live.test.ts
+++ b/tests/invitation-mail-limit.live.test.ts
@@ -24,11 +24,6 @@ const RUN = `im-${Date.now().toString(36)}`;
 
 const state = vi.hoisted(() => ({
   rls: undefined as PrismaClient | undefined,
-  // NG-155: mailer is mocked, but pin the SMTP settings so the suite never depends on the host's SMTP env.
-  // Fake host: no connection is ever opened (smtpMailer is replaced below).
-  SMTP_HOST: 'smtp.example.invalid' as string | undefined,
-  SMTP_PORT: '587' as string | undefined,
-  SMTP_FROM: 'NexaGrant <noreply@example.invalid>' as string | undefined,
   /**
    * When set, every transaction waits before its `invitation.upsert` until
    * `barrier.size` transactions have arrived there (or `barrier.ms` passed).
@@ -42,6 +37,11 @@ const state = vi.hoisted(() => ({
 const send = vi.hoisted(() => vi.fn(async (_message: { to: string; subject: string; text?: string }) => {}));
 const envOverride = vi.hoisted(() => ({
   NODE_ENV: 'production',
+  // NG-155: mailer is mocked, but pin the SMTP settings so the suite never depends on the host's SMTP env.
+  // Fake host: no connection is ever opened (smtpMailer is replaced below).
+  SMTP_HOST: 'smtp.example.invalid' as string | undefined,
+  SMTP_PORT: '587' as string | undefined,
+  SMTP_FROM: 'NexaGrant <noreply@example.invalid>' as string | undefined,
   NEXT_PUBLIC_APP_URL: 'https://app.example.invalid' as string | undefined,
 }));
 const recordAlert = vi.hoisted(() => vi.fn(async () => ({ status: 'recorded', id: 'a1' })));
diff --git a/tests/invitation-seat-race.live.test.ts b/tests/invitation-seat-race.live.test.ts
index 336b4031..9fbf576f 100644
--- a/tests/invitation-seat-race.live.test.ts
+++ b/tests/invitation-seat-race.live.test.ts
@@ -27,11 +27,6 @@ const RUN = `sr-${Date.now().toString(36)}`;
 
 const state = vi.hoisted(() => ({
   rls: undefined as PrismaClient | undefined,
-  // NG-155: mailer is mocked, but pin the SMTP settings so the suite never depends on the host's SMTP env.
-  // Fake host: no connection is ever opened (smtpMailer is replaced below).
-  SMTP_HOST: 'smtp.example.invalid' as string | undefined,
-  SMTP_PORT: '587' as string | undefined,
-  SMTP_FROM: 'NexaGrant <noreply@example.invalid>' as string | undefined,
   /**
    * When set, every transaction waits before its `invitation.upsert` until
    * `barrier.size` transactions have arrived there (or `barrier.ms` passed).
@@ -46,6 +41,11 @@ const send = vi.hoisted(() => vi.fn(async (_message: { to: string; subject: stri
 const mailMode = vi.hoisted(() => ({ on: true }));
 const envOverride = vi.hoisted(() => ({
   NODE_ENV: 'production',
+  // NG-155: mailer is mocked, but pin the SMTP settings so the suite never depends on the host's SMTP env.
+  // Fake host: no connection is ever opened (smtpMailer is replaced below).
+  SMTP_HOST: 'smtp.example.invalid' as string | undefined,
+  SMTP_PORT: '587' as string | undefined,
+  SMTP_FROM: 'NexaGrant <noreply@example.invalid>' as string | undefined,
   NEXT_PUBLIC_APP_URL: 'https://app.example.invalid' as string | undefined,
 }));
 const recordAlert = vi.hoisted(() => vi.fn(async () => ({ status: 'recorded', id: 'a1' })));
```

## Değişen dosyalar
tests/invitation-mail-limit.live.test.ts, tests/invitation-seat-race.live.test.ts

## Riskler
Yok. Önceki turdaki "envOverride'a eklendi" ifadesi o turda yanlıştı; şimdi gerçekten öyle. Geçici .env ve docker konteyneri (ng155-pg) kaldırıldı.

## Açık sorular
Yok.

## Sonraki adım
Lider incelemesi; tam `pnpm gate` koşulmadı (istenmedi).
