---
hüküm: Bitti: next 16.3.8'e çıkıldı; prod audit 86 → 1 uyarıya (yüksek/kritik 21 → 1, kritik 2 → 0) indi. Kalan tek yüksek `braces` için yama yok (kabul edilen risk). pip-audit'te workers/cordis için 7 açık hâlâ duruyor; bu iş kapsamında yükseltilmedi.
tip: güvenlik
platform: mac (darwin) ile doğrulandı. Linux ve Windows koşulmadı (bu makinede Docker/CI yok) — ayrıntı §Platform.
kart: TASK-MVBCEWUNZ9HXV (FO-8, sprint FB-GAP-2)
ajan: se-fb
dal: se-fb/fo8-dep-upgrade (origin/dev ffb9c79f tabanlı)
---

# TASK-MVBCEWUNZ9HXV — FO-8 · next ≥ 16.3.8 + öncelikli bağımlılık yükseltmeleri

- **Ajan:** se-fb (security) · **Sprint:** FB-GAP-2 · **Tip:** bug (güvenlik, P0-6 + B8)
- **Önceki rapor:** `docs/agent-results/TASK-MVBB4PJ636WZH-se-fb.md` (değiştirilmedi).
- **Düzeltme notu (önceki rapora):** önceki raporda "`workers` altında requirements yok" yazıyordu; bu yanlıştı. `workers/cordis/requirements.txt` mevcut ve `pip-audit -r` ile tarandı (§4).

## 1. Ne yapıldı

1. **next 16.3.4 → 16.3.8** (aynı majör, yama). `eslint-config-next` de 16.3.8'e hizalandı. `package.json`'da yalnız iki `version` satırı değişti; `scripts`'e dokunulmadı.
2. **Öncelikli yükseltmeler** — doğrudan bağımlılık değil, hepsi geçişli. `pnpm.overrides` ile, her biri sadece savunmasız hattı hedefleyecek şekilde:
   - `sharp` (next'in optional dep'i `^0.35.4`) → 0.35.5
   - `undici` → 7.29.1 (shadcn/dotenvx hattı) ve 8.10.2 (openai hattı)
   - `hono` → 4.13.7, `@hono/node-server` → 1.19.15, `@modelcontextprotocol/sdk` → 1.31.0 (shadcn → MCP SDK hattı)
   - `mysql2` → 3.23.1 (prisma hattı)
   - `deepmerge-ts` → 8.0.0 (`@prisma/config` hattı; prisma generate + testler geçti)
   - `proxy-addr` → 2.0.8 (kritik; express/express-rate-limit üzerinden shadcn → MCP)
   - `fast-uri` → 3.1.8, `ip-address` → 10.7.1, `source-map-js` → 1.2.2, `postcss-selector-parser` → 7.1.6
   - `brace-expansion` (5.0.9 → 5.0.12, aynı majör; `minimatch@3`'ün 1.x kopyasına dokunulmadı)
3. **Override konumu notu:** pnpm 11 override'ları `package.json` yerine `pnpm-workspace.yaml` içinde okuyor; mevcut `html-to-docx>image-size` override'ı da oraya yazılmış. Aynı yer kullanıldı.
4. **Uyum düzeltmesi:** gerekmedi. `src/` değişmedi.

## 2. pnpm audit --prod — önce / sonra

| Seviye   | Önce | Sonra (next only) | Sonra (son hâl) |
|----------|-----:|------------------:|----------------:|
| critical |    2 |                 1 |               0 |
| high     |   19 |                   — |               1 |
| moderate |   55 |                   — |               0 |
| low      |   10 |                   — |               0 |
| **Toplam** | **86** |             — | **1**           |

Son kalan (yama yok, kabul edilen risk):
```
braces <=3.0.3 — patched: null — paths: .>shadcn>fast-glob>micromatch>braces | .>shadcn>ts-morph>...>braces
```
`braces` `shadcn` (CLI) üzerinden geliyor. Bu uygulamanın Next.js çalışma zamanına girip girmediği bu turda doğrulanmadı; girmiyorsa risk yalnızca geliştirici aracında. Kapatmak için shadcn ya da ts-morph'un üst sürümü gerekir — ayrı bir karar.

Ham çıktı: `audit-before.json`, `audit-after.json` (scratchpad).

Ara adım notu: yalnız `next` bump'ı sonrası `{ moderate: 51, low: 9, high: 18, critical: 1 }`; override'lar sonrası tek kalan yüksek `braces`.

## 3. Kanıt — build / lint / typecheck / test

```
$ pnpm why next            → next@16.3.8
$ pnpm why sharp undici hono mysql2
  sharp@0.35.5 · undici@7.29.1 · undici@8.10.2 · hono@4.13.7 · mysql2@3.23.1
$ pnpm install --frozen-lockfile   → Done
$ pnpm lint        → 0 error, 4 warning (src/lib/invitations/accept.ts, tests/e2e/fixtures/..., tests/settings-profile-update.test.ts ×2) — bu dosyalara dokunulmadı; önceki durumla karşılaştırılmadı
$ pnpm typecheck   → tsc --noEmit, hata yok  (önce `prisma generate` gerekti: yeni worktree'de client üretilmemişti)
$ pnpm build       → next build, BUILD_EXIT=0
$ pnpm test        → Test Files 329 passed | 8 skipped (337); Tests 4387 passed | 132 skipped (4519); TEST_EXIT=0
```

**Test koşusu notu (dürüst):** İlk koşuda 14 dosyada 51 test "Authentication failed for `fabrika`" ile düştü. Sebep: yeni worktree'de gitignore'lu `.env`, `.env.local`, `.env.test` yoktu. Ana checkout'taki bu üç dosya worktree'ye kopyalandı (commit'e girmez) ve test yeniden koşuldu → yukarıdaki yeşil sonuç. Kod hatası değildi.

**next/image — canlı denemesi:** `pnpm dev` yerine `next build` çıktısı `next start -p 3100` ile ayağa kaldırıldı (kanıt amacıyla; optimizer yolu aynı). Sonuçlar:
```
GET /_next/image?url=/logo.png&w=256  (Accept: image/webp) → 200 image/webp, 9518 bayt   (sharp encode çalıştı)
GET /_next/image?url=https://evil.example.com/a.png          → 400   (host allowlist çalışıyor)
GET /_next/image?url=https://images.unsplash.com/photo-1     → 404   (izinli host; sahte id, upstream'den 404 döndü)
GET /_next/image?url=https://lh3.googleusercontent.com/...   → 400   (izinli host; sahte id, upstream'den 400 döndü)
```
Sunucu kapatıldı. **Doğrulanmadı:** giriş yapmış kullanıcı menüsündeki gerçek Google avatarı ve gerçek bir blog görseli (oturum/veri gerektiriyor). Bu bir açık nokta.

## 4. pip-audit — workers/cordis/requirements.txt

```
$ pip-audit -r workers/cordis/requirements.txt
Found 7 known vulnerabilities in 2 packages
starlette 0.49.3 → 1.0.1 / 1.3.1 / 1.3.0 / 1.1.0 / 1.1.0   (PYSEC-2026-161, -249, -248, -2281, -2280)
anyio     4.12.1 → 4.14.2                                  (PYSEC-2026-4025, -4024)
```
Ham çıktı: `pip-audit-after.txt` (scratchpad). Tarama geçici venv'de yapıldı (Python 3.9, repoya eklenmedi). `requirements.txt` sürümsüz (fastapi, uvicorn… pinsiz); starlette ve anyio, fastapi'nin çözdüğü geçişli sürümler. **Bu turda workers değiştirilmedi.** Düzeltme için `fastapi`'nin starlette ≥1.x'i çekmesi gerekir; bu bir major-benzeri uyumluluk kararı, ayrı kartta ele alınmalı.

## 5. Platform

- **mac (darwin):** tüm doğrulamalar burada koştu (§3). `sharp` 0.35.5 prebuilt binary ile mac'te çalıştı (optimizer webp üretti).
- **Linux:** koşulamadı — bu makinede Docker/CI yok. `sharp` için Linux binary'leri `@img/sharp-linux-*` optional paketleri üzerinden geliyor; lock'ta kontrol edilmedi. Dockerfile build'i ya da CI ile doğrulanmalı.
- **Windows:** koşulamadı — neden: makine ve CI erişimi yok.

## 6. Değişen dosyalar

- `package.json` — `next`, `eslint-config-next` (iki satır)
- `pnpm-workspace.yaml` — override bloğu (gerekçe yorumlarıyla)
- `pnpm-lock.yaml` — lock güncellemesi
- `docs/agent-results/TASK-MVBCEWUNZ9HXV-se-fb.md` — bu rapor

## 7. Riskler

- `braces` yüksek (yama yok) — §2.
- Override'lar major atlamıyor, ama `deepmerge-ts` 7→8 ve `mysql2` (prisma'nın driver'ı) gibi geçişli kütüphanelerde davranış değişikliği olabilir; testler ve `prisma generate` geçti, prod'da ek izleme önerilir.
- `next/image` Google avatarı canlı doğrulanmadı (§3).
- Python tarafında 7 açık sürüyor (§4).

## 8. Açık sorular

1. Python `workers/cordis` için fastapi/starlette/anyio yükseltmesi ayrı bir kart olsun mu? (öneri: evet, FB-GAP-2 sonrası)
2. `braces` için kabul edilen risk onaylanıyor mu, yoksa shadcn/ts-morph üst sürümü denensin mi?

## 9. Sonraki adım

- PR `--base dev` açıldı; **merge edilmedi**. Merge sırası: bu PR önce, devop-fb'nin `package.json` `scripts` değişikliği sonra (aynı dosyaya dokunmuyoruz).
- Linux/CI'da `pnpm install --frozen-lockfile` + build doğrulaması.
