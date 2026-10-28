# TASK-MVPP6G9THSS32 — FO-169 Y-1 düzeltmesi (sandbox direktifi + top-level 404) — fe-fb

**Hüküm: TAMAM — Y-1 kapatıldı, gate yeşil, #187'ye push edildi.** Ekran görüntüsü adımı (5) yapılamadı, aşağıda nedeni var.

## Ne yapıldı

Se-fb ön incelemesinin Y-1 bulgusu: sandbox yalnız `<iframe>` özniteliğinde; `/tr/embed/cordis` doğrudan açılınca CORDIS betikleri bizim origin'de çalışıyordu.

1. **Tek kaynak sandbox sabiti** — `CORDIS_IFRAME_SANDBOX` `src/components/CordisProjectsWidget.tsx`'ten `src/lib/cordis-widget.ts`'e taşındı. Bileşen, route testi ve CSP aynı sabiti kullanıyor.
2. **CSP `sandbox` direktifi** — `buildContentSecurityPolicy` yalnız `cordisWidget` (embed) politikasına `sandbox <CORDIS_IFRAME_SANDBOX tokens>` ekliyor. `allow-same-origin` yok.
3. **`CSP_MODE=report-only`** — rapor modunda `sandbox` uygulanmaz. `src/proxy.ts` embed için ayrıca enforce edilen sandbox-only `Content-Security-Policy` başlığı gönderiyor (`cordisSandboxPolicy()`). Ana sayfada bu başlık yok.
4. **Route `Sec-Fetch-Dest` kontrolü** — `src/app/[locale]/embed/cordis/route.ts`: başlık varsa ve `iframe` değilse 404. Başlık yoksa izin veriliyor (eski tarayıcılar, sunucu tarafı istekler).
5. **Y-2 (isteğe bağlı, embed'de `connect-src`/`form-action` daraltma)** — yapılmadı. Gerekçe: Y-1 kapandı, Y-2 düşük öncelikli ve JSONP widget'ının davranışını değiştirme riski taşıyor; kapsam dışı bırakıldı.

## Kanıt

### Birim (vitest)
```
src/lib/security-headers.test.ts + src/app/[locale]/embed/cordis/route.test.ts
 Test Files  2 passed (2)
      Tests  160 passed (160)
```
Sandbox token'ları `CORDIS_IFRAME_SANDBOX` ile birebir eşit, `allow-same-origin` yok — `embed policy` testinde pin'lendi.

### Mutasyon (birim) — sandbox direktifi silindi
```
× embed policy: style/img/font-src get the CORDIS path, ... nothing else changes
× report-only: the embed also gets an enforced sandbox header; other pages do not
× enforce mode: the sandbox is in the one enforced policy, no extra header
Tests  3 failed | 150 passed (153)
```
(Dosya geri yüklendi; `sandbox` direktifi sayısı 1.)

### e2e — üst düzey ziyaret (`tests/e2e/landing-cordis-widget.spec.ts`)
Anahtarsız:
```
✓ tr: heading shows and, with CORDIS unreachable, the fallback link does too
✓ en: ...
✓ embed opened on its own: 404, and the document is sandboxed (no origin of ours)
✓ no key: no frame at all, and the embed route is a 404
- with a key: ... (skipped — anahtar yok)
✓ 390px: the block stays inside the viewport
  5 passed, 1 skipped
```
Anahtarlı (`NEXT_PUBLIC_CORDIS_WIDGET_KEY=placeholder`):
```
✓ tr, ✓ en, ✓ embed opened on its own, - no key (skipped), ✓ with a key (sandbox, Sec-Fetch-Dest 404/200), ✓ 390px
```
Üst düzey test: `page.goto('/en/embed/cordis')` → 404; CSP başlığında `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox`; `window.origin === 'null'`.

### e2e mutasyon — sandbox direktifi silindi
```
✘ embed opened on its own: 404, and the document is sandboxed (no origin of ours)
  Expected substring: "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox"
  Received string:    "default-src 'self'; script-src 'self' 'nonce-...' ... frame-ancestors 'self'; report-uri /api/csp-report"
```
(Dosya geri yüklendi.)

### Tam kapı — `bash scripts/gate-isolated.sh pnpm gate`
```
Test Files  436 passed | 2 skipped (438)
Tests  5738 passed | 54 skipped (5792)
451 passed (9.5m)               # e2e
✅ Öksüz alarm yok ...           # alerts:check
GATE_EXIT=0
```
İlk koşu gate kilidi beklerken (se-fb-fo196, devop-fb-guard sırada) benim 50 dakikalık süremi doldurdu (çıkış 142); kilit kendiliğinden açılmadı, süre uzatılıp yeniden koşuldu. Kod hatası değildi.

`pnpm lint`: 0 hata (4 uyarı, hiçbiri değiştirilen dosyalarda). `pnpm typecheck` (tsc --noEmit): temiz.

## Adım (5) — ana sayfada canlı widget ekran görüntüsü: YAPILAMADI
Bu ortamda CORDIS'e erişim yok (e2e'de tüm `cordis.europa.eu` istekleri kesiliyor) ve `NEXT_PUBLIC_CORDIS_WIDGET_KEY` bu worktree'de tanımlı değil; `.env` okunmadı. Canlı widget'ın görüntüsü alınamaz. Mevcut `docs/agent-results/TASK-MVPP6G9THSS32-evidence/` altındaki kanıtlar (stub'lı 6 satır, CORDIS engelli, anahtarsız) değişmedi. Canlı ekran görüntüsü için anahtar ve CORDIS erişimi olan bir ortam gerekiyor.

## Platform beyanı
**mac (Darwin 27.2, Chromium via Playwright).** Değişen kod yolu platforma bağlı değil: CSP başlıkları, Next proxy ve route HTTP davranışı. Windows/Linux'ta koşulmadı — sebep: bu oturumda yalnız mac ortamı var.

## Değişen dosyalar
- `src/lib/cordis-widget.ts` — `CORDIS_IFRAME_SANDBOX` eklendi
- `src/components/CordisProjectsWidget.tsx` — sabit lib'den import
- `src/lib/security-headers.ts` — `sandbox` direktifi (embed), `cordisSandboxPolicy()`
- `src/proxy.ts` — report-only'de enforce edilen sandbox başlığı
- `src/app/[locale]/embed/cordis/route.ts` — `Sec-Fetch-Dest` kontrolü
- `src/app/[locale]/embed/cordis/route.test.ts`, `src/lib/security-headers.test.ts` — birim testleri
- `tests/e2e/landing-cordis-widget.spec.ts` — üst düzey ziyaret testi, `Sec-Fetch-Dest` kontrolleri
- `docs/agent-results/TASK-MVPP6G9THSS32-fe-fb-y1.md` — bu rapor

`scripts/gate-isolated.sh` bu worktree'de commit'lenmemiş (untracked); gate'i koşturmak için kullanıldı, commit'e dahil edilmedi.

## Riskler
- `CSP_MODE=report-only` prod'da ise: sandbox artık enforce edilen ek başlıkla geliyor (test edildi). Ama prod'daki gerçek mod doğrulanmadı.
- `Sec-Fetch-Dest` yoksa (eski tarayıcılar) embed doğrudan açılabilir; bu durumda yalnız sandbox direktifi koruyor (tasarım gereği).
- Firefox/WebKit'te koşulmadı; `sandbox` ve `Sec-Fetch-Dest` davranışı oralarda ölçülmedi.

## Açık sorular
- Prod `CSP_MODE` enforce mi? (Y-1 koruması her iki modda da geçerli, ama bunu prod'da doğrulamak gerekir.)
- Ekran görüntüsü (adım 5) için CORDIS anahtarı ve erişimi sağlanabilir mi?

## Sonraki adım
Se-fb ile yeniden inceleme (aynı ölçüm, gerçek rota), sonra PR #187 taslaktan çıkarılabilir.
