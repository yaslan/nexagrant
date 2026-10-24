---
sözleşme: 3
görev: TASK-MVCH99A54WALG
kod: TASK-MVCH99A54WALG
ajan: devop-fb
motor: claude
tip: yayın
okur: ekip
hüküm: Kısmen bitti: dal push edildi (tam kapı yeşil) ve dev paketi derlenip yerelde Passenger taklidiyle doğrulandı; ama files.fonbridge.com henüz DNS'te yok, yükleme-görünüm turu paket üzerinde tekrarlanamadı; prod'a dokunulmadı.
platform: macOS (Darwin 27, Apple silicon): kapı, paket derlemesi (linux/amd64 emülasyonla, Docker VM) ve yerel `node app.js` koşuldu. Linux / cPanel sunucusu: KOŞULAMADI (sunucuya erişim yok). Platforma bağlı kod: deploy/cpanel/app.js restoreLinks (sembolik bağlantı açılımı) ve build-package.sh (bash/find/zip). Sunucuda ayrıca doğrulanmalı.
sürüm: 1
tarih: 2026-10-17T18:47:49.940Z
---

# FO-67 st2: dev paketi derlendi, dal push edildi; prod'a dokunulmadı

## Ne yapıldı

1. **Dal push edildi.** `devop-fb/fo67-cpanel-dev-package` (fc33172b) origin'e çıktı. Uzak ve yerel commit aynı. Push, `githooks/pre-push` üzerinden tam `pnpm gate` koşturdu; `--no-verify` kullanılmadı.
2. **Paket derlendi.** `dev` commit'i `f310642d`'den, `deploy/cpanel/build-package.sh` ile, `R2_PUBLIC_HOST=https://files.fonbridge.com` ile (K-568980 kararı A).
3. **Paket doğrulandı.** Zip temiz bir dizine açıldı, `app.js` (Passenger'ın başlattığı dosya) ile yerelde çalıştırıldı, yerel veritabanı CI eşdeğeri şemayla dolduruldu.
4. **Prod'a dokunulmadı.** Sunucu, veritabanı, cPanel ve canlı alan adı değiştirilmedi.

## Kanıt (ham çıktı)

Kapı (push kancası, `PUSH_RC=0`):
```
Test Files  355 passed | 2 skipped (357)
Tests  4634 passed | 54 skipped (4688)
342 passed (7.5m)          ← e2e
✖ 4 problems (0 errors, 4 warnings)   ← lint
```
Paket:
```
commit: f310642de08fb746d6d7daf18727e2264da1bd94
built: 2026-10-17T18:37:05Z
platform: linux/amd64 (node:22-bookworm-slim, glibc 2.36), node v22.23.3
packaging: deploy/cpanel @ fc33172b
images.remotePatterns: ["https://images.unsplash.com","https://lh3.googleusercontent.com","https://files.fonbridge.com/blog/**"]
b948e3179edb1d668c30de6a6a1aa08faed035f87d31c96a86dd44ff84f9b110  fonbridge-app-f310642d.zip
```
Passenger taklidi (`node app.js`, PORT=3100, bağlama 127.0.0.1):
```
GET /tr                                  → 200
GET /_next/image?url=https://files.fonbridge.com/blog/x.jpg → 500  (sunucu günlüğü: getaddrinfo ENOTFOUND files.fonbridge.com)
GET /_next/image?url=https://example.org/x.jpg (negatif kontrol) → 400 "url" parameter is not allowed
CSP img-src: 'self' data: blob: https://images.unsplash.com https://files.fonbridge.com
POST /api/admin/blog/image (anonim) → 401
/_next/static/chunks/….js → 200 application/javascript
```
Yorum: 400 yerine 500 gelmesi, adresin pakete gömüldüğünü ve yapılandırmanın doğru olduğunu gösteriyor. Hata alan kısım alan adının kendisi (DNS yok).
`dig +short files.fonbridge.com` boş; `curl https://files.fonbridge.com/...` çıkış kodu 6.

Testler için geçici kurulum: kendi pgvector:pg16 (port 5460) ve MinIO konteynerleri, işlem sonunda silindi. `fabrika-*` ve `yuyt-postgres` konteynerlerine dokunulmadı.

## Değişen dosyalar

- Repo: bu turda yeni commit yok. Push edilen dal `2eeb6617` ve `fc33172b` commit'lerini içeriyor (önceki turda yazıldı).
- Hafıza (repo dışı): `/Users/macbook/alan/.agentspace/memory/agents/devop-fb/fonbridge-pre-push-gate-yerel-ci-kurulumu.md`
- Paket ve doğrulama artefaktları (repo dışı, scratchpad): `…/scratchpad/pkg-out/fonbridge-app-f310642d.zip`, `…/scratchpad/wt-fo67` (worktree, `devop-fb/fo67-cpanel-dev-package`).

## Riskler

- **Alan adı yok.** `files.fonbridge.com` henüz DNS'te değil. Blog görseli bu adres açılmadan görünmez (500). Prod'dan önce şart.
- **Yükleme → görünüm turu paket üzerinde tekrarlanmadı.** Önceki staging turunda (rapor 1) yükleme, önizleme, kayıt, anonim görünüm ve `curl -I` 200 kanıtlandı; ama o tur yerel build ile yapıldı, bu zip ile değil. Prod sonrası aynı testi canlı alan adıyla yapmak gerekir.
- **Linux/cPanel koşulmadı.** `app.js`'in sembolik bağlantı açılımı (`restoreLinks`) Linux'ta ayrıca doğrulanmalı.
- **Canlı env'de R2 değişkenleri yok** (önceki turda CSP'den okundu): `R2_ACCOUNT_ID`, `R2_PUBLIC_HOST` tanımlı değil; `R2_PUBLIC_BUCKET` hiç yok. Değerler rapora yazılmadı.

## Açık sorular / engel

- Sahip: Cloudflare'de `fonbridge-public` bucket'ı ve `files.fonbridge.com` alan adı açılmalı (K-568980 kararı A). Ben Cloudflare'e erişemiyorum.

## Prod onay talebi (K-568981 kapsamında, henüz yapılmadı)

Önkoşullar: `files.fonbridge.com` çözülüyor; cPanel env'de `R2_PUBLIC_BUCKET=fonbridge-public`, `R2_PUBLIC_HOST=https://files.fonbridge.com` (paketle aynı değer), R2 erişim değişkenleri adıyla tanımlı.

Adımlar, sırayla:
1. Canlı Supabase veritabanı yedeği (pg_dump, PG17 istemcisi).
2. Mevcut paketin (`fonbridge-app-e0ccbfa9.zip`) yedeği: geri dönüş için.
3. Canlıda `EvidenceReminder` satır sayısı (system_scope ile) 0 mı? Değilse dur: `drop-evidence-reminder` tabloyu siler.
4. Veritabanı: 43 → 47 migration. Yeni: add-expert-pre-registration, add-notification, drop-evidence-reminder, add-expert-pre-registration-organization. Değişen: add-blog-post, add-public-lead, add-evidence-link-tenant-id. Yükseltme provası yeşil (47 dosya ×2, rls:verify geçti).
5. Paket: yeni zip'i açıp cPanel'de Restart.
6. Doğrulama: `/tr` 200, admin'den gerçek JPG yükleme, public yazıda görsel, `curl -I` 200, 6 MB → boyut hatası, admin olmayan → 403.

Geri alma: önceki zip + DB yedeği. `drop-evidence-reminder` geri alınamaz; tablo boşsa yeniden oluşturulabilir.

## Sonraki adım

Sahip: `files.fonbridge.com` ve `fonbridge-public` açılınca bana haber ver. Ardından prod adımları için ayrı son onay (K-568981'in "son ayrı onay" kısmı).
