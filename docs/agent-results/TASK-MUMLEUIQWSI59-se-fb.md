# TASK-MUMLEUIQWSI59 — FB Sentry'yi kaldır, hata izleme yalnız SystemAlert (se-fb)

Commit: `89eab729` (dev) · Platform: **mac** (Darwin 27.0.0) üzerinde doğrulandı.

## 1. Ne yapıldı

Patron kararı (29.09): dış hata izleyici yok. Sentry'ye veri gönderen **tek** yol
`recordAlert` → `captureAlertToSentry` idi (SDK yoktu, elle envelope). Kaldırılanlar:

| Kalem | Durum |
|---|---|
| `src/lib/observability/sentry.ts` (210 satır) | silindi |
| `system-alert.ts` içinde import + `level === 'error' && isSentryEnabled()` dalı | silindi; `recordAlert`'in geri kalanı (dedupe, sanitizeMeta, hiç-atmaz sözleşmesi) **aynen** |
| `src/lib/env.ts` `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | şemadan çıktı |
| `.env.example` Sentry bloğu (5 satır) | çıktı |
| `tests/observability-sentry.test.ts` (12 `it`/`it.each`) | silindi |
| `tests/system-alert.live.test.ts` | **yeni**: gerçek Prisma P1001 hatası → `recordAlert` → SystemAlert satırı SELECT ile okunur, `fetch` çağrısı **0** |

Kart madde 4 (scrubErrorText): `scrubErrorText` yalnız `sentry.ts` içinde, dışa giden envelope için
kullanılıyordu; SystemAlert tarafında hiçbir çağrısı yoktu (`grep -rn scrubErrorText src` → yalnız sentry.ts).
Tam metin zaten tasarım gereği SystemAlert satırında kalıyordu. Bu yüzden Sentry ile birlikte gitti.
SystemAlert'in kendi kişisel veri korumaları (`sanitizeMeta` anahtar reddi, `SENSITIVE_META_KEYS`) dokunulmadı
ve `tests/feedback-alerts.test.ts` ile hâlâ test ediliyor.

Kart madde 3 (bağımlılık): `package.json`'da doğrudan `@sentry/*` **yoktu**. Lockfile'daki `@sentry/node@10.73.0`
**geçişli**: `lighthouse@13.4.1` (devDependency) → `@sentry/node`. Uygulama paketine girmez, çalışma zamanında
yüklenmez; lighthouse'un kendi hata raporlaması yalnız `--enable-error-reporting` ile açılır (varsayılan kapalı).
`pnpm remove` edilecek doğrudan bağımlılık olmadığı için lockfile'a dokunulmadı (ayrıca be-fb aynı anda
package.json/lockfile'da Resend kaldırıyor — çakışma riski).

## 2. Kanıt

**grep (commit'te, temiz worktree):**
```
$ /usr/bin/grep -rni sentry src package.json .env.example ; echo "grep exit=$?"
grep exit=1 (1=boş)
```
`tests/` altında tek kalıntı: `tests/system-alert.live.test.ts:12` yorum satırı ("The optional Sentry forwarder is gone").
Kalan diğer anılar belge/migration geçmişi: `prisma/migrations/*feedback*.sql` (eski kolon adları, çalışmış migration —
değiştirilmez), `PROJECT.md`, `FON_BRIDGE.md`, `docs/**` (cs-fb'nin kartı; kural gereği dokunulmadı).

**SystemAlert SELECT kanıtı (gerçek DB, gerçek hata, temiz worktree @89eab729):**
```
recordAlert => {"status":"recorded","id":"cmumlnvag0000wgxksgxzpi0c"} | fetch calls = 0
[
  {
    id: 'cmumlnvag0000wgxksgxzpi0c',
    level: 'error',
    source: 'proof.TASK-MUMLEUIQWSI59',
    message: 'proof: \n' +
      'Invalid `broken.user.findFirst()` invocation in\n' +
      '/private/tmp/claude-501/-Users-mac',
    createdAt: 2026-09-29T11:35:21.640Z
  }
]
cleanup: rows left = 0
```

**Yeni testin gerçekten ölçtüğü (mutasyon):** `recordAlert`'e geçici `await fetch("http://127.0.0.1:1/")` eklendi →
```
AssertionError: expected "fetch" to not be called at all, but actually been called 1 times
     67|     expect(fetchSpy).not.toHaveBeenCalled();
      Tests  1 failed (1)
```
Geri alındı (`grep -c "fetch(" system-alert.ts` → 0).

**Kapılar (temiz worktree @89eab729, `prisma generate` sonrası):**
```
typecheck exit=0      lint exit=0      build exit=0 (next build)
vitest exit=0
 Test Files  216 passed | 2 skipped (218)
      Tests  2465 passed | 8 skipped (2473)
```
Not: paylaşımlı ağaçta tam vitest `6 failed` verdi — hepsi `Cannot find package 'resend'`
(`src/lib/email/resend-mailer.ts`): be-fb'nin yarım kalmış Resend→SMTP işi (package.json'dan `resend` çıkmış,
mailer henüz değişmemiş). Bu yüzden kapılar benim commit'imde, temiz worktree'de koşuldu.

## 3. Değişen dosyalar (commit 89eab729)
- `.env.example` (−5)
- `src/lib/env.ts` (−7)
- `src/lib/observability/sentry.ts` (silindi)
- `src/lib/observability/system-alert.ts` (−8)
- `tests/observability-sentry.test.ts` (silindi)
- `tests/system-alert.live.test.ts` (+78, yeni)
- bu rapor

## 4. Riskler
- Yerel `.env` dosyasında (git dışı) boş `SENTRY_DSN=` satırı duruyor; zararsız (şemada yok, okunmuyor).
  Paylaşımlı `.env`'e başka ajanlar SMTP satırı eklediği için dokunmadım.
- Önceki 12 Sentry testi (maske dahil) gitti; aynı kişisel veri maskesi artık hiçbir dış kanala gerekmediği için
  kasıtlı. İleride bir dış kanal geri gelirse maske yeniden gerekir (`git show 89eab729~1:src/lib/observability/sentry.ts`).
- İNCELEME-20'deki Ö-1/Ö-2 ("DSN açılmadan önce") notları konusuz kaldı.

## 5. Açık sorular
- Belgeler (`docs/legal/processing-register.md` §19, `PROJECT.md`, `FON_BRIDGE.md` gözlemlenebilirlik satırı)
  hâlâ Sentry diyor — cs-fb kartının kapsamı.

## 6. Sonraki adım
- cs-fb belge güncellemesinde Sentry'yi alt işleyici listesinden çıkarsın.
- İsteğe bağlı: lighthouse devDependency'si gerçekten kullanılmıyorsa ayrı kartla kaldırılabilir (geçişli `@sentry/node` da gider).

## Platform beyanı
Doğrulama **mac** (Darwin 27.0.0) üzerinde yapıldı. Değişiklik yalnız sunucu tarafı TypeScript kod silme + bir
vitest testi; süreç, dosya yolu, kabuk veya OS API'si içermez → Windows/Linux'ta davranış aynıdır (kod gereği).
Windows/Linux'ta ayrıca koşulmadı (bu makinede yok); CI (Linux) push'la koşacak — GitHub push'u 1 Ekim'e ertelendi
(TASK-MUMACETT8NSI4).
