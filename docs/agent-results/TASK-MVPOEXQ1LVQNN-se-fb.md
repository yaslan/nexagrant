# TASK-MVPOEXQ1LVQNN (FO-166) — next ≥16.4.1 + transitif yükseltmeler, audit yeniden koşusu — se-fb

**Hüküm:** Bitti: `pnpm audit --prod` 21 bulgudan (2 kritik, 6 yüksek) 0'a indi, pip-audit temiz, build/lint/typecheck/unit yeşil; e2e'de yalnız MinIO/R2 ister 5 blog testi bu makinede koşamadı. Draft PR açıldı.

## Ne yapıldı
- Kart `next 16.3.4` varsayıyordu; `origin/dev` zaten 16.3.8 + FO-8 override'larındaydı. Ama audit artık `next` için **≥16.4.1** istiyor (2 kritik RCE, 1 yüksek DoS; >=16.0.0 <=16.4.0). `next` ve `eslint-config-next` → **16.4.3** (minor atlama 16.3→16.4; kırıcı uyum gerekmedi, kod değişikliği yok).
- `package.json`: `zod ^4.6.7`, `nodemailer ^10.2.1` (3 moderate), `shadcn` dependencies → **devDependencies** (yalnız CLI; `src/`'de import yok; zod@3.25.76 + MCP SDK zincirini prod audit'ten çıkarır; son 3.x olduğu için cross-major override yerine bu seçildi — "seçtim, değiştirebilirsin").
- `pnpm-workspace.yaml` overrides (transitifler `package.json`'dan düzeltilemez; `scripts` dokunulmadı): undici 7.30.1, hono 4.13.11, @modelcontextprotocol/sdk 1.32.0, ip-address 10.7.4, fast-uri 3.1.9, yeni: body-parser 2.4.0, zod 4.x 4.6.6. sharp zaten 0.35.5 (advisory yok); undici 8.x hattı 8.10.2 (advisory yok).
- `tests/pnpm-overrides-same-major.test.ts`: sabitlenmiş pin değerleri yeni override'larla hizalandı (hono/mcp/ip-address); test gevşetilmedi.
- SSRF yüzeyi (`next.config.ts` images): kod değişikliği gerekmedi. `dangerouslyAllowLocalIP` yalnız `R2_PUBLIC_HOST` loopback ise (`publicAssetHostIsLoopback`) true; prod build'de değer public host olduğundan false. `remotePatterns`: images.unsplash.com ve lh3.googleusercontent.com (https, `port: ''`), R2 host yalnız `/blog/**`. Joker yok.

## Kanıt
audit önce (dev @8ef105d1): `21 vulnerabilities found — Severity: 2 low | 11 moderate | 6 high | 2 critical` (next 2 critical+1 high, MCP SDK 4, zod, body-parser, undici 3, hono, ip-address, nodemailer 3, fast-uri 4).
audit sonra: `pnpm audit --prod` → `No known vulnerabilities found` (exit 0). Tam `pnpm audit` (dev dahil) 12 kalan: 1 low | 8 moderate | 3 high — hepsi dev araç zinciri (shadcn/lighthouse/eslint), prod'a girmez; kapsam dışı bırakıldı (ham çıktı: scratchpad `audit-after-all.txt`).
pip-audit: `pip-audit --no-deps --disable-pip -r workers/cordis/requirements.lock` (Python 3.9 yerel; pinler 3.12 ister, FO-14) ve `-r requirements.txt` → ikisi de `No known vulnerabilities found`; requirements dosyaları değişmedi (önce=sonra).
Gerçek `/_next/image` (prod build, `next start`, R2_PUBLIC_HOST boş):
- https://evil.example.com/a.png → 400
- http://127.0.0.1:5766/a.png → 400
- http://169.254.169.254/latest/meta-data/ → 400
- https://images.unsplash.com:8443/a.png → 400 (port)
- http://images.unsplash.com/a.png → 400 (protokol)
- http://localhost:3466/logo.png → 400
- /logo.png → 200 image/png; https://images.unsplash.com/photo-… → 200 image/jpeg
`next/og`: uygulamada kullanılmıyor (`grep next/og|ImageResponse src` boş); RCE paket seviyesinde kapandı, uç nokta çalıştırılmadı.
`pnpm build` → exit 0, `▲ Next.js 16.4.3`, i18n gate geçti (instrumentation.ts'te Edge `process.exit` uyarısı derleme çıktısında var, build'i kırmıyor; dev ile karşılaştırmadım).
`pnpm typecheck` 0; `pnpm lint` 0 hata / 4 uyarı (kullanılmayan import, bu değişiklikten bağımsız).
`pnpm test` (yerel pgvector DB, `pnpm db:setup`): son durum `1 failed | 411 passed` → o 1 (pnpm-overrides mutant testi) düzeltildi, dosya tek başına 6/6 geçti. Tam suite'in düzeltme sonrası yeniden koşusu yapılmadı. DB'siz ilk koşuda 58 fail DB bağlantısıydı.
`pnpm test:e2e` (dev server, CI=1, MinIO yok): **399 passed, 5 failed, 4 skipped, 8 did not run** (416). 5 fail hepsi blog görsel yükleme (`admin-blog-cover-upload`, `admin-blog-image-upload` ×3, `admin-blog-links-images`): "R2_ACCOUNT_ID, R2_PUBLIC_BUCKET and R2_PUBLIC_HOST must be set / CI must run this against the MinIO public bucket" — ortam eksiği, yükseltmeyle ilgisi yok (baseline'da koşturmadım). `module-plan-gate` 2 test tam koşuda değil, ilk denemede fail olmuş, tek başına 2/2 geçti. `pnpm gate` koşulmadı (MinIO + tam DB kurulumu gerekir).

## Değişen dosyalar
package.json, pnpm-lock.yaml, pnpm-workspace.yaml, tests/pnpm-overrides-same-major.test.ts

## Riskler
- next 16.3→16.4 minor atlama; build + 399 e2e temiz ama blog yükleme e2e'si bu makinede doğrulanamadı → CI'da (MinIO'lu) görülmeli.
- shadcn devDependency: `pnpm dlx`/CLI kullanımı etkilenmez; Dockerfile `pnpm install` (dev dahil) olduğu için build etkilenmez.
- `dangerouslyAllowLocalIP`: prod paketi loopback `R2_PUBLIC_HOST` ile derlenirse açılır (operatör hatası; build-package.sh public host ister). İstenirse prod build'de zorla kapatan bir koruma eklenebilir (bu kartta yapılmadı).
- Kalan dev-only audit bulguları (12).

## Açık sorular
Yok.

## Sonraki adım
Draft PR CI'sını izle (MinIO'lu e2e); onay/merge başkasında.

**Platform beyanı:** mac (Darwin) üzerinde doğrulandı — web/sunucu (build, next start, /_next/image, e2e Chromium) ve Python worker yalnız pip-audit (3.9 yerel; worker testi/çalıştırma koşulmadı). Kod yolları platformdan bağımsız (bağımlılık sürümleri + `next.config.ts` host kalıpları); Windows/Linux koşulamadı — CI Linux koşar.
