---
hüküm: Kod işi bitti ve yerelde doğrulandı: next 16.3.8; prod audit'te yüksek/kritik 21 → 0 (toplam 86 → 1, kalan `braces` yüksek, yamasız, kabul edilen risk). PR #71'in CI kırmızısı kodla ilgili değil: GitHub Actions işleri hesap faturalandırma (spending limit / failed payments) nedeniyle başlamadan düşüyor; dev'de de aynı. pip-audit'te workers/cordis için 7 açık duruyor (bu kartın kapsamı dışında, raporlandı).
tip: güvenlik
platform: mac (darwin) ile doğrulandı. Linux ve Windows koşulmadı — neden: bu makinede Docker yok; CI faturalandırma yüzünden hiç başlamıyor.
kart: TASK-MVBCEWUNZ9HXV (FO-8, sprint FB-GAP-2)
ajan: se-fb
dal: se-fb/fo8-dep-upgrade → PR #71 (base dev, head fc593397 + bu rapor commit'i). Merge edilmedi.
---

# TASK-MVBCEWUNZ9HXV — FO-8 · next ≥ 16.3.8 + öncelikli bağımlılık yükseltmeleri

- **Ajan:** se-fb (security) · **Sprint:** FB-GAP-2 · **Tip:** bug (güvenlik, P0-6 + B8)
- **Önceki rapor:** `docs/agent-results/TASK-MVBB4PJ636WZH-se-fb.md` (değiştirilmedi).
- **Düzeltme notu (önceki rapora):** önceki raporda "`workers` altında requirements yok" yazıyordu; bu yanlıştı. `workers/cordis/requirements.txt` mevcut ve `pip-audit -r` ile tarandı (§4).

## 1. Ne yapıldı

1. **next 16.3.4 → 16.3.8** (aynı majör, yama). `eslint-config-next` de 16.3.8'e hizalandı. `package.json`'da yalnız bu iki `version` satırı değişti; `scripts`'e dokunulmadı.
2. **Öncelikli yükseltmeler** — hepsi geçişli (doğrudan bağımlılık değil), `pnpm.overrides` ile, yalnız savunmasız hattı hedefleyerek:
   - `sharp` (next'in optional dep'i) → 0.35.5
   - `undici` → 7.29.1 ve 8.10.2 (iki ayrı hat)
   - `hono` → 4.13.7, `@hono/node-server` → 1.19.15, `@modelcontextprotocol/sdk` → 1.31.0
   - `mysql2` → 3.23.1 (prisma hattı), `deepmerge-ts` → 8.0.0
   - `proxy-addr` → 2.0.8, `fast-uri` → 3.1.8, `ip-address` → 10.7.1, `source-map-js` → 1.2.2, `postcss-selector-parser` → 7.1.6
   - `brace-expansion` → 5.0.12 (aynı majör; `minimatch@3`'ün 1.x kopyasına dokunulmadı)
3. **Override konumu (sapma, bilinçli):** kart override'ların `package.json` içinde olmasını yazıyordu; ama pnpm 11 override'ları `pnpm-workspace.yaml`'da okuyor ve repodaki mevcut `html-to-docx>image-size` override'ı da oraya yazılmış. Aynı yer kullanıldı.
4. **Uyum düzeltmesi:** gerekmedi. `src/`, `scripts/`, `workers/` değişmedi.

## 2. PR #71 CI kırmızısı — kök neden (kod değil, faturalandırma)

- PR #71 üzerindeki üç iş kırmızı: `CI / build-and-test` (run 38955535000), `i18n Check / i18n-audit` (run 38955534966), `Accessibility Check / lighthouse-a11y` (run 38955534956). Üçü de **2 saniyede düşüyor ve 0 adım çalıştırıyor**.
- Check-run annotation'ı (`gh api repos/yaslan/fonbridge/check-runs/<job>/annotations`), üç işte de aynı mesajı veriyor:
  > The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings
- **dev'den gelen:** dev'in son CI koşusu (run 38961208232, job 117176426540) aynı annotation ile düştü. `fe-fb/fo6-module-entry-points` dalındaki i18n koşusu (20:17) da aynı mesajla düştü; `be-fb/fo5-coordinator-leaders` dalındaki CI ve i18n koşuları da kırmızı. Yani kırmızılık PR #71'e özgü değil; hesap seviyesinde.
- Log'lar alınamadı (`gh run view --log-failed` → "log not found"; job log API'si BlobNotFound). Teşhis annotation üzerinden yapıldı.
- **Kod düzeltmesi yapılmadı** — kırmızılığın kaynağı repo içinde değil. Düzeltme: GitHub hesabının Billing & plans ayarı (repo sahibi). Bunun dışında yerelde eşdeğer kapılar yeşil (§3).

## 3. Kanıt — ham çıktı özeti

```
$ pnpm why next                     → next@16.3.8 (tek sürüm)
$ pnpm why sharp undici hono mysql2 → sharp@0.35.5 · undici@7.29.1, 8.10.2 · hono@4.13.7 · mysql2@3.23.1
$ CI=true pnpm install --frozen-lockfile --force   → exit 0 (birkaç npm 503'te otomatik yeniden deneme)
$ pnpm lint        → exit 0 · 0 error, 4 warning (src/lib/invitations/accept.ts:31; tests/e2e/fixtures/concept-template-tenant.ts:4; tests/settings-profile-update.test.ts:5,16). Dokunulmayan dosyalar.
$ pnpm typecheck   → exit 0 (tsc --noEmit, çıktı yok)
$ pnpm i18n:check  → exit 0 · "✅ i18n check passed"; --json: onlyIn*/missingIn*/unmatched* hepsi 0
$ pnpm rls:check   → exit 0 · 47 tenant model policy kayıtlı; 16 tablo ENABLE+FORCE+tenant_isolation; 2 policy'siz tablo (BlogPost, PublicLead) RLS kapalı
$ perl alarm 900 pnpm test → exit 0
    Test Files  330 passed | 7 skipped (337)
    Tests       4399 passed | 120 skipped (4519)
$ pnpm build       → exit 0 · tüm rotalar üretildi. Tek uyarı: src/instrumentation.ts:18 process.exit (Edge Runtime) — bu dosya PR'da değişmedi.
```

Ham log'lar: `fo8-test.log`, `fo8-build.log`, `fo8-install.log`, `fo8-i18n.json` (scratchpad).

**Not:** Worktree'de gitignore'lu `.env`, `.env.local`, `.env.test` dosyaları var (commit'e girmez). Testler bu worktree ortamında koştu.

### Audit — önce (origin/dev lockfile) → sonra (PR #71)

| Seviye   | Önce | Sonra |
|----------|-----:|------:|
| critical |    2 |     0 |
| high     |   19 |     1 |
| moderate |   55 |     0 |
| low      |   10 |     0 |
| **Toplam** | **86** | **1** |

Yüksek + kritik: **21 → 1** (kartın "21" notuyla uyumlu). `pnpm audit --prod` komutu iki durumda da exit 1 döner (açık var); ham JSON: `audit-before.json`, `audit-after.json` (scratchpad). "Önce" tarafı dev'in lockfile'ından geçici bir klasörde koşuldu.

Kalan tek açık:
```
braces <=3.0.3 · GHSA-vfj7-8cjw-p6xm · yüksek · patched: null (yama yok)
  .>shadcn>fast-glob>micromatch>braces
  .>shadcn>ts-morph>@ts-morph/common>fast-glob>micromatch>braces
```
`shadcn` `dependencies` içinde (^4.19.1) ama `src/`, `scripts/`, `workers/` içinde hiçbir yerden import edilmiyor; yani yol bir CLI aracı üzerinden. Yama olmadığı için override ile kapatılamıyor; kabul edilen risk olarak işaretlendi.

### next/image — canlı deneme

`pnpm build` çıktısı üzerinden `pnpm start -p 3200` (geçici `AUTH_SECRET`, dosyaya yazılmadı; iş bitince süreç kapatıldı).

```
GET /tr                                              → 200
GET /_next/image?url=/logo.png&w=256                 → 200 image/png, 256×102 (sharp yeniden boyutlandırdı)
GET /_next/image?url=/icon-512.png&w=128             → 200 image/png, 128×128
GET /_next/image?url=/logo.png&w=256 (Accept webp)   → 200 image/webp (sharp encode)
GET /_next/image?url=https://evil.example.com/x.png  → 400 (host allowlist çalışıyor)
GET /_next/image?url=https://lh3.googleusercontent.com/a/example=s96-c
                                                     → 400 "url parameter is valid but upstream response is invalid"
```

- lh3 satırında allowlist geçildi; upstream 400 döndü çünkü kullandığım yol sahte bir örnek. lh3 kökü de doğrudan 400 veriyor. **Gerçek bir Google avatar URL'si ile doğrulanmadı.**
- Ekran görüntüsü: `fo8-home-tr.png` (scratchpad) — ana sayfa render oldu, logo `next/image` üzerinden geliyor; çerez bandı açık (beklenen).
- **Doğrulanmadı:** giriş yapmış kullanıcı menüsündeki gerçek Google avatarı ve gerçek blog görseli (oturum ve veri gerektiriyor).
- Önceki taslakta yazılan "unsplash 404" sonucu bu turda denenmedi; rapordan çıkarıldı.

### sharp ve Linux

- Lock'ta Linux binary paketi var: `@img/sharp-linux-x64@0.35.5` (`pnpm-lock.yaml`). Darwin arm64/x64 paketleri de var.
- Linux'ta çalıştırılmadı (Docker yok, CI başlamıyor). Doğrulama: CI faturalandırma düzelince ya da bir Docker build ile.

## 4. pip-audit — workers/cordis/requirements.txt

```
$ pip-audit -r workers/cordis/requirements.txt     (geçici venv, Python 3.9; repoya eklenmedi)
Found 7 known vulnerabilities in 2 packages
starlette 0.49.3 → 1.0.1 / 1.3.1 / 1.3.0 / 1.1.0 / 1.1.0   (PYSEC-2026-161, -249, -248, -2281, -2280)
anyio     4.12.1 → 4.14.2                                    (PYSEC-2026-4025, -4024)
```
Ham çıktı: `pip-audit.txt` (scratchpad). `requirements.txt` sürümsüz (fastapi, uvicorn, duckdb, pandas, networkx, psycopg2-binary, sqlalchemy); starlette ve anyio fastapi'nin çektiği geçişli sürümler. **Bu turda workers değiştirilmedi.** Düzeltme fastapi'yi etkiler (starlette 1.x uyumu), bu yüzden ayrı bir karar.

## 5. Değişen dosyalar

- `package.json` — `next`, `eslint-config-next` (iki satır)
- `pnpm-workspace.yaml` — override bloğu (gerekçe yorumlarıyla)
- `pnpm-lock.yaml` — lock güncellemesi
- `docs/agent-results/TASK-MVBCEWUNZ9HXV-se-fb.md` — bu rapor

## 6. Riskler

- `braces` yüksek, yamasız (§3). Uygulama kodunda import yok; risk geliştirici/CLI tarafında.
- Override'lar geçişli paketlerde major değişim içeriyor (`deepmerge-ts` 7→8, `mysql2` — prisma'nın driver'ı, `undici` 7/8 hatları). Davranış değişikliği ihtimali: testler, build ve `prisma generate` geçti; prod'da izleme önerilir.
- Google avatarı ve gerçek blog görseli canlı doğrulanmadı.
- Python tarafında 7 açık sürüyor.
- CI olmadan merge edilirse Linux ve e2e kanıtı eksik kalır.

## 7. Açık sorular

1. GitHub hesabının faturalandırma / spending limit sorunu kim tarafından çözülecek? Bu olmadan CI hiç koşmuyor (PR #71 ve dev).
2. `braces` (yamasız, CLI yolu) kabul edilen risk olarak onaylanıyor mu?
3. Python `workers/cordis` için fastapi/starlette/anyio yükseltmesi ayrı bir kart olsun mu? (öneri: evet)

## 8. Sonraki adım

- Faturalandırma düzelince PR #71 ve dev'deki CI'yı yeniden koş; `build-and-test` geçerse Linux CI kanıtı da gelir.
- Merge kararı lidere ait; bu PR **merge edilmedi**. Merge sırası: bu PR önce, devop-fb'nin `scripts` değişikliği sonra.

## Definition of Done

- [x] next ≥ 16.3.8 kurulu (`pnpm why next` → 16.3.8)
- [x] sharp / undici / hono / mysql2 yükseltildi (overrides; `braces` yamasız, kabul edilen risk)
- [x] `pnpm audit --prod` yüksek/kritik önce → sonra tablosu (21 → 1)
- [x] pip-audit sonucu rapora girdi (7 açık, düzeltilmedi)
- [x] build + lint + typecheck + test temiz (ham çıktı özeti); next/image canlı denendi
- [x] PR `--base dev` açık, merge edilmedi
- [x] Platform beyanı: mac'te doğrulandı; sharp Linux'ta koşulamadı (lock'ta binary var)
- [ ] PR #71 CI yeşil — **bloke:** GitHub faturalandırma nedeniyle işler başlamıyor (kod kaynaklı değil)
