# TASK-MUTP1E955SV9W — Fix app-url-self-links CI Failure

**Hüküm:** Test kuralını ihlal eden `src/lib/public-url.ts` kodunu düzeltildi. Yerel testler geçiyor (2 test dosyası × 16 test = 16 geçti). Push tamamlandı, PR #29 CI beklemede.

**Platform:** macOS (darwin). Testler yerel olarak `NODE_ENV=test` ortamında koştu. Kod değişiklikleri platforma bağlı değildir.

---

## Ne yapıldı

PR #29 CI'de `tests/app-url-self-links.test.ts` başarısız oluyordu:
- Test: "no source file outside app-url.ts carries localhost:3000 or an old domain"
- Kural ihlali: `src/lib/public-url.ts` sabit yazı `'http://localhost:3000'` (satır 46) ve doğrudan `process.env.NEXT_PUBLIC_APP_URL` erişimi (satır 26) taşıyor

**Çözüm:**
1. `AUTH_URL`'ü `src/lib/env.ts` şemasına ekle (NextAuth.js proxy standardı)
2. `src/lib/public-url.ts`'i yeniden yaz:
   - AUTH_URL doğrudan `process.env.AUTH_URL`'den oku (bu kısıtlı listede yok)
   - NEXT_PUBLIC_APP_URL'yi `appBaseUrl()` ve `appUrl()` aracılığıyla oku (app-url.ts'de)
   - Hardcoded localhost'u kaldır → `appUrl()` dev/prod defaults'ı yönet
   - Fallback chain: AUTH_URL → appBaseUrl (NEXT_PUBLIC_APP_URL) → req.url origin → appUrl (defaults)

---

## Kanıt (Test Çıktısı)

### Düzeltilmiş Testler

```
Test Files  2 passed (2)
      Tests  16 passed (16)
```

**app-url-self-links.test.ts (4 test):**
✓ the scan sees the files it guards
✓ no source file outside app-url.ts carries localhost:3000 or an old domain
✓ NEXT_PUBLIC_APP_URL is read only by app-url.ts (and declared in env.ts)
✓ reports a production NEXT_PUBLIC_APP_URL problem once at server start

**public-url.test.ts (12 test):**
✓ uses AUTH_URL when set
✓ strips path from AUTH_URL
✓ preserves port in AUTH_URL
✓ falls back to NEXT_PUBLIC_APP_URL when AUTH_URL is unset
✓ ignores NEXT_PUBLIC_APP_URL when AUTH_URL is set
✓ falls back to localhost when both are unset
✓ returns localhost when AUTH_URL is invalid
✓ returns localhost when both AUTH_URL and NEXT_PUBLIC_APP_URL are invalid
✓ falls back to request origin when both env vars are unset
✓ prefers AUTH_URL over request origin
✓ prefers NEXT_PUBLIC_APP_URL over request origin
✓ uses request origin even if request URL has query params

---

## Değişen Dosyalar

```
M src/lib/env.ts                — AUTH_URL ekle (satır 75)
M src/lib/public-url.ts        — Desenini yeniden yaz, hardcoded localhost kaldır

Commit: 9424937 (be-fb/auth-redirect @ daa5999d)
```

### Code Changes

**src/lib/env.ts:** Added AUTH_URL to schema
- NewLine 75: `AUTH_URL: z.string().optional(),`
- Comment: NextAuth.js standard for proxy environments

**src/lib/public-url.ts:** Refactored to use app-url.ts helpers
- Removed hardcoded `'http://localhost:3000'` fallback
- Changed from direct process.env access to appBaseUrl/appUrl pattern
- Kept AUTH_URL as direct process.env (not in restricted list)
- Maintains fallback chain: AUTH_URL → appBaseUrl → req.url → appUrl defaults

---

## CI Status

**Push completed:**
```
To https://github.com/yaslan/fonbridge.git
   daa5999d..94249375  befb/auth-redirect -> befb/auth-redirect
```

**Waiting for:** PR #29 build-and-test CI run to complete (run ID pending — GitHub API timeout occurred).

**Known pre-existing:** Lighthouse a11y test red (`.prisma/client/index-browser`, red on last 8 PRs) — unrelated to this PR.

---

## Next Steps

1. Await PR #29 CI completion
2. Add run ID to report
3. Verify build-and-test passes (app-url-self-links should now pass)
4. Confirm lighthouse-a11y is pre-existing red
