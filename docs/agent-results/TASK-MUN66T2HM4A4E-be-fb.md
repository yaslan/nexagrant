# TASK-MUN66T2HM4A4E — FB CANLI HAZIRLIK-2: Güvenlik taraması (be-fb)

**Sprint:** FB-GAP-1 · **Dal:** dev (tarama anı HEAD `4bfc20a5`, temiz worktree) · **Kod değişikliği:** YOK — yalnız tespit + düzeltme kartı önerisi.
**Platform beyanı:** macOS (Darwin 27, arm64) üzerinde doğrulandı; prod build `next build` (Turbopack) + `node .next/standalone/server.js` 127.0.0.1:47620. Linux/Windows koşulamadı: Linux prod imajı (`Dockerfile` runner, `USER nextjs`) bu turda derlenmedi — başlık/çerez sonuçları Next/Auth.js çalışma zamanına bağlı, OS'a değil; aynı config Linux'ta aynı başlıkları döndürür (başlıklar `next.config.ts#headers()`'tan, çerezler Auth.js'ten gelir, platforma bağlı kod yolu yok). Windows: dağıtım hedefi değil.

## Özet — bulgular önem sırasıyla

| # | Önem | Bulgu | Kanıt türü |
|---|---|---|---|
| Y-1 | **YÜKSEK** | Konsept not DOCX dışa aktarımında **SSRF** (html-to-docx `<img src="http://…">` adresini sunucudan indirip DOCX'e gömüyor) | canlı kanıt (yerel dinleyici) |
| Y-2 | **YÜKSEK** | Güvenlik başlıkları **hiç yok**: CSP, HSTS, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Permissions-Policy (Referrer-Policy yalnız accept-invite) | prod build curl -I |
| Y-3 | **YÜKSEK** | Rol (RBAC) yazma action'larında uygulanmıyor: `rbac.ts`'de MEMBER'ın `edit_proposal`/`evaluate_gates` yetkisi yok ama 72 yazma action'ından 52'sinde gövdede rol kontrolü yok (ör. `evaluateOpportunityGate`) | kod envanteri |
| Y-4 | **YÜKSEK** (koşullu) | Kanıt yükleme: istemciden gelen `objectKey` kiracı önekiyle doğrulanmıyor → başka kiracının nesnesini kendi kaydına bağlayıp **silme** (`deleteFileFromR2`) mümkün; `createEvidence` ise dosyayı hiç yüklemiyor (sahte URL) | kod okuma |
| O-1 | ORTA | `/api/cagrilar` oturumsuz: sınırsız `limit` × 5 sayfa SEDIA çağrısı + başlık başına 2 ücretsiz çeviri API çağrısı + **paylaşılan `Topic` tablosuna yazma** (upsert) | canlı: 200 + DB'de 5 satır `updatedAt` |
| O-2 | ORTA | Oturumsuz CORDIS uçları (ve 5 başka uç) 500'de **ham Prisma hata metni** dönüyor (sorgu şekli, tablo/alan adları) | canlı curl |
| O-3 | ORTA | 14 yüksek bağımlılık açığı (0 kritik); prod'da erişilebilir olan: `image-size` (html-to-docx, DoS) ve `undici` (openai); diğerleri dev-aracı/CLI yolunda | pnpm audit + erişilebilirlik |
| O-4 | ORTA | API anahtarı ekranı "Hız Limiti 1.000 istek/dk" gösteriyor ama `/api/v1/*` ve `authenticateApiKey` hiçbir hız sınırı uygulamıyor; genel olarak hız sınırı yalnız `fon-hazirlik` formunda var | kod okuma |
| D-1 | DÜŞÜK | Çerezler düz HTTP'de `Secure`'suz (beklenen); TLS arkasında `X-Forwarded-Proto: https` ile `__Host-`/`__Secure-` + Secure + HttpOnly + SameSite=Lax — **TLS sonlandıran proxy'nin bu başlığı göndermesi şart** | canlı curl |
| D-2 | DÜŞÜK | `X-Powered-By: Next.js` sızıyor | canlı curl |
| D-3 | DÜŞÜK | `global-error.tsx` `error.message`'ı ekrana basıyor (prod'da sunucu hataları özetlenir; istemci hataları ham görünür) | kod okuma |
| D-4 | DÜŞÜK | Public lead IP limiti `X-Forwarded-For`'un **ilk** hop'una güveniyor → proxy XFF'i ezmezse IP limiti atlanır (e-posta limiti kalır) | kod okuma |
| D-5 | DÜŞÜK | id guard (`isPresentId`) eksik ~37 action (ör. `saveSectionContent`); hepsi `tenantId` filtreli olduğu için etki aynı kiracı içinde "rastgele ilk kaydı" güncellemekle sınırlı | envanter |
| D-6 | DÜŞÜK / bilgi | Git geçmişinde (c915bc43, `docker-compose.yml`) sabit bir **dev** `AUTH_SECRET` değeri var; bugünkü `.env` değerinden farklı (md5 farklı) — prod'da asla kullanılmadığı teyit edilmeli | parmak izi |

**Temiz çıkanlar (kanıtlı):** `.env` hiç commit'lenmemiş; git geçmişinde gerçek anahtar yok; açık yönlendirme (callbackUrl/signout/`/api/auth/hata`) engelli; Host/X-Forwarded-Host enjeksiyonu yönlendirmeye yansımıyor; `DEMO_LOGIN_ENABLED=true` prod build'de sunucuyu başlatmıyor; webhook'lar imza doğruluyor; loglarda e-posta/kişisel veri deseni yok; 404 sayfası stack trace basmıyor.

---

## 1. Bağımlılık açıkları — `pnpm audit --prod`

Komut çıktısı özeti: `68 vulnerabilities found — Severity: 9 low | 45 moderate | 14 high` (kritik 0).

| Paket | Açık | Yol | Prod'da erişilebilir mi? | Düzeltme |
|---|---|---|---|---|
| image-size ≤2.0.2 | GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr (JXL/HEIF/ICNS sonsuz döngü DoS) | `html-to-docx>image-size` | **EVET** — `src/app/api/concept-notes/[id]/export/route.ts:5` html-to-docx'i kullanıyor; not içeriği kullanıcı kontrollü, `<img src="data:…">` veya (Y-1) uzak görsel image-size'a gidiyor → giriş yapmış herhangi bir kiracı kullanıcısı süreci kilitleyebilir | `pnpm-workspace.yaml` overrides `html-to-docx>image-size: ">=2.0.3"` (API uyumu test edilmeli) ya da html-to-docx'i değiştir (Y-1 ile birlikte) |
| undici 8.0–8.10.1 | GHSA-rfgv-xxqx-mfg5 (WebSocket DoS), GHSA-w293-vg96-wgc3 (TLS doğrulama atlatma — *Balanced pool connect options*), GHSA-vp8m-p9jh-q5pm (cache poisoning) | `openai>undici` (opsiyonel peer) | **Kısmen** — `src/lib/llm.ts` openai'yi kullanıyor; openai undici'yi yalnız `x509-transport-capability` yolunda `require` ediyor. WebSocket/interceptor/BalancedPool kullanılmıyor → pratik risk düşük | override `openai>undici: ">=8.10.2"` |
| undici 7.x | aynı GHSA'lar | `shadcn>undici`, `shadcn>@dotenvx/dotenvx>undici` | HAYIR — `shadcn` bir CLI; `src/`, `workers/`, `scripts/` içinde import yok | `shadcn`'ı `devDependencies`'e taşı (prod imajından ve `--prod` denetiminden çıkar) |
| hono / @hono/node-server | GHSA-q5qw-h33p-qvwr (serveStatic dosya okuma), GHSA-wc8c-qw6v-h7f6, GHSA-88fw-hqm2-52qc (CORS) | `shadcn>@modelcontextprotocol/sdk>…` | HAYIR — yalnız shadcn CLI'nin MCP sunucusu | aynı: shadcn → devDependencies |
| fast-uri 3.0–3.1.6 | GHSA-qw65-cvwx-89v3, GHSA-58mr-gqgx-xq4g | `prisma>@prisma/dev>…>ajv`, `shadcn>…>ajv` | HAYIR — Prisma CLI/dev sunucusu ve shadcn; runtime istemci değil | override `fast-uri: ">=3.1.7"` |
| mysql2 <3.22 | GHSA-3f6p-5ww8-9rcr | `prisma>mysql2` | HAYIR — Postgres kullanılıyor; `prisma` CLI paketinin bağımlılığı | `prisma` CLI'yi devDependencies'e (şu an `dependencies`'te 7.10.0) |
| deepmerge-ts <8 | GHSA-ggr8-5vv4-36mx (stack exhaustion) | `prisma>@prisma/config` | HAYIR — config yükleme, güvenilir girdi | prisma güncellemesiyle |

Not: moderate 45'in 32'si hono (shadcn yolu); `next 16.3.4` için açık listelenmedi.

## 2. Sır taraması

Yöntem: kendi Python tarayıcım (`scan.py`) — değer **yazılmadı**, yalnız `len` + md5'in ilk 10 hanesi + dosya:satır. Desenler: `sk-`/`sk-proj-`/`sk-ant-` (sınırlı, ≥40 karakter — agentdesk-task yanlış pozitifi elendi), `AKIA[0-9A-Z]{16}`, `BEGIN … PRIVATE KEY`, `password=`, `SMTP_PASS=`, `(AUTH|NEXTAUTH)_*SECRET=`, `postgres://u:pw@`, `sk_live_`, `ghp_`, `AIza`, `xox?-`.

- **Çalışma ağacı:** `/usr/bin/grep -rIn` (ugrep değil; `.env` dahil) → 191 eşleşme. Bilinen-pozitif kontrolü: `./.env` satırları yakalandı (7 satır) → tarayıcı `.env`'i görüyor.
  - Gerçek değerli sırlar **yalnız `.env`'de**: 2× `AUTH_*SECRET` (len 44 md5 `332e26b92c`, len 35 md5 `b3082ef0f1`), 2× `sk-` (len 108 md5 `d35433b662`, len 164 md5 `bd7c88d096`), 1× DB parolası (satır 62, len 32 md5 `a9bca4adee`).
  - Diğer tüm eşleşmeler yer tutucu/test: `fabrika` yerel parola (md5 `d12c7556d0`, CI/test/`.env.example`'da kasıtlı), `${AUTH_SECRET…}` interpolasyonları, `<…>` yer tutucular, test sabitleri, rapordaki `-----BEGIN RSA PRIVATE KEY-----` satırları (bilinen-pozitif gösterim metni, anahtar gövdesi yok). `FON_BRIDGE.md:1797` (izlenmeyen dosya) `AUTH_GOOGLE_SECRET=` boş.
- **Git geçmişi:** `git log -p --all` (1108 commit, tüm dallar) → 161 eşleşme; `AKIA`/`sk-`/`sk_live`/`ghp_`/`AIza`/`xox` **sıfır**.
  - `.env`'deki 5 gerçek değerin md5'i geçmişte: **0/5** (`332e26b92c: 0, b3082ef0f1: 0, a9bca4adee: 0, d35433b662: 0, bd7c88d096: 0`).
  - `.env` hiç commit'lenmedi: `git log --all --name-only | grep '(^|/)\.env'` → yalnız `.env.example`. `.gitignore:34: .env*` (`git check-ignore -v .env` teyitli).
  - Tek dikkat: `c915bc43:docker-compose.yml:16` `AUTH_SECRET=fabrika-secr…` (len 51, md5 `1af6d60b92`) — dev sabiti, bugünkü değerlerle eşleşmiyor → D-6.
- Ek: `.venv/` (izlenmeyen Python sanal ortamı) içindeki pydantic/sqlalchemy örnek URL'leri yanlış pozitif.

## 3. Güvenlik başlıkları ve çerezler (prod build, 127.0.0.1:47620)

Önce: `.env`'de `DEMO_LOGIN_ENABLED=true` olduğu için prod sunucu **başlamayı reddetti** (log: `DEMO_LOGIN_ENABLED=true is not allowed in a production build or with NODE_ENV=production … the server will not start with it.`) — koruma çalışıyor. Ölçüm `DEMO_LOGIN_ENABLED=false` ile yapıldı.

```
=== GET /tr                → HTTP/1.1 200 OK | set-cookie: NEXT_LOCALE=tr; Path=/; SameSite=lax | X-Powered-By: Next.js
=== GET /tr/login          → HTTP/1.1 200 OK | (aynı)
=== GET /api/auth/csrf     → set-cookie: authjs.csrf-token=<val>; Path=/; HttpOnly; SameSite=Lax
                             set-cookie: authjs.callback-url=<val>; Path=/; HttpOnly; SameSite=Lax
=== GET /tr/accept-invite?token=x → 303 | Referrer-Policy: no-referrer | location: http://localhost:47620/tr/accept-invite/continue
=== GET /tr/nonexistent-xyz → 404 | X-Powered-By: Next.js
=== X-Forwarded-Proto: https, /api/auth/csrf →
    set-cookie: __Host-authjs.csrf-token=<val>; Path=/; HttpOnly; Secure; SameSite=Lax
    set-cookie: __Secure-authjs.callback-url=<val>; Path=/; HttpOnly; Secure; SameSite=Lax
```

| Başlık | Durum |
|---|---|
| Content-Security-Policy | **YOK** (hiçbir yanıtta) |
| Strict-Transport-Security | **YOK** |
| X-Frame-Options / frame-ancestors | **YOK** → tıklama-kaçırma (clickjacking) açık |
| X-Content-Type-Options | **YOK** |
| Referrer-Policy | yalnız `/(tr|en)/accept-invite/*` (`no-referrer`); diğer sayfalarda tarayıcı varsayılanı |
| Permissions-Policy | **YOK** |
| X-Powered-By | `Next.js` (kapatılmalı: `poweredByHeader: false`) |

Oturum çerezi: Auth.js v5, `session: { strategy: "jwt" }`, `trustHost: true` (`src/lib/auth.ts:308-309`). Oturum çerezi aynı Auth.js çerez fabrikasından çıkar: https'te `__Secure-authjs.session-token; HttpOnly; Secure; SameSite=Lax`. Oturum açık bir hesap olmadan (prod'da demo kapalı, OAuth gerçek sağlayıcı ister) session-token doğrudan gözlenemedi — csrf/callback-url çerezlerinin davranışıyla aynı fabrikadan geldiği için çıkarım. **Koşul:** TLS sonlandıran proxy `X-Forwarded-Proto: https` göndermeli (ya da `AUTH_URL=https://…`); aksi hâlde çerezler Secure'suz düşer.

Açık yönlendirme testleri: `POST /api/auth/signin/google callbackUrl=https://evil.example/x` → callback-url çerezi `http://localhost:47620`'ye normalize; `POST /api/auth/signout callbackUrl=https://evil.example/x` → `location: http://localhost:47620`; `GET /api/auth/hata?to=https://evil.example` → yerel `/tr/giris?error=Configuration`; `Host: evil.example` ve `X-Forwarded-Host: evil.example` ile accept-invite → location yine localhost. **Açık yönlendirme yok.**

## 4. Yetki envanteri

Kapsam: 36 `"use server"` dosyası (127 dışa açık fonksiyon) + 35 `route.ts` (38 handler). Otomatik çıkarım (`inv.py`: fonksiyon gövdesinde desen araması) + işaretli satırlar elle okundu. Kısaltmalar: **Kimlik** Y=gövdede `requireTenantAction/requireTenantApi/requirePlatformAdmin*/auth()/authenticateApiKey…`, f=dosya içi yardımcıyla (elle doğrulandı: `pipeline/actions.ts#sessionScope`, `ajans/actions.ts#managerScope`, m8 `computeSeatCandidates`), `-`=yok. **Kiracı:** tüm kimlikli yollar `tenantId`'yi oturumdan/API anahtarından alıyor (istemci parametresinden alan yok). **Pilot:** W=yazma kapısı (`requireTenantAction()` varsayılanı / `assertTenant(Action)Writable` / `requireTenantApi({write:true})`), RO=bilinçli salt-okuma. **id guard:** `isPresentId/requireId/zod parse`.

Kimliksiz uçların elle doğrulaması:

| Uç | Durum |
|---|---|
| `/api/cagrilar` GET | **Kimliksiz** — O-1 |
| `/api/cordis/organizations`, `/[id]`, `/api/cordis/projects` GET | **Kimliksiz** (CORDIS kamu verisi; limit ≤100 sınırlı) — O-2 hata sızıntısı; ürün kararı: ücretli özellik verisinin kimliksiz açık olması isteniyor mu? |
| `/api/user/*`, `/api/gdpr/*` | Kimlik action içinde (`exportUserData`, `requestAccountDeletion` → session) ✔ |
| `/api/v1/*` | `authenticateApiKey` ✔ (hız sınırı yok — O-4) |
| `/api/webhooks/stripe`, `/iyzico` | imza doğrulaması (`constructEvent`, `verifyIyzicoSignature`) ✔ |
| `/api/auth/hata` | yalnız yerel yola yönlendirme ✔ |
| `submitReadinessLead` | kamu formu, e-posta + IP hash hız sınırı ✔ (D-4) |
| `loginWithCredentialsAction` | yalnız demo modunda kayıtlı; prod'da sağlayıcı yok ✔ |
| `addBudgetLineByToken` | magic token SHA-256 + sabit-zamanlı karşılaştırma ✔ |

**Rol eksikliği (Y-3):** `src/lib/rbac.ts` MEMBER'a yalnız `view_proposal, contribute_assigned, request_dual_approval` veriyor; `can(...)` yalnız 11 dosyada çağrılıyor. Rol kontrolü görünmeyen 52 yazma action'ı (tam liste ekte, Rol="-" & Pilot="W"): pipeline (create/move/evaluateGate/assignOwner/logEffort), consortium seat, evidence (upload/create/delete/verify), concept-notes (create/save/status), approvals submit/cancel, m2/m4/m6/m7/m9/m10/m11 yazmaları. Örnek doğrulama: `pipeline/actions.ts:443-447 evaluateOpportunityGate` yalnız `sessionScope()` + `assertTenantActionWritable` — `evaluate_gates` kontrolü yok. Onay akışı (`approveRequestAction`) rolü servise iletiyor ✔.

Tam tablo: **Ek A**.

## 5. Diğer

### 5.1 SSRF — Y-1 (canlı kanıt)
`src/app/api/concept-notes/[id]/export/route.ts:67-72` not içeriğini (`content[section.key]`) **ham HTML** olarak html-to-docx'e veriyor; içerik `saveSectionContent(noteId, sectionKey, markdown)` ile istemciden serbestçe yazılıyor (`concept-notes/actions.ts:61-85`, temizleme yok). html-to-docx 1.8.0 `isValidUrl(src)` ise `imageToBase64` ile URL'i **sunucudan indiriyor** ve yanıtı DOCX'e gömüyor (`node_modules/html-to-docx/dist/html-to-docx.esm.js`, `if(isValidUrl(imageSource)){base64String=await imageToBase64_min(imageSource)…`).

Kanıt (yerel 127.0.0.1:47611 dinleyicisi, `scratchpad/ssrf.mjs`):
```
$ node ssrf.mjs
docx bytes 22112 hits ["GET /internal/secret.png","GET /internal/secret.png"]
```
→ Giriş yapmış herhangi bir kiracı kullanıcısı `<img src="http://169.254.169.254/…png">` / iç servis adresleri yazıp dışa aktarımla sunucuya istek attırabilir; uzantı görsel MIME'ına eşleşirse yanıt DOCX içinde geri okunur. `m2/server/actions.ts#exportToDocx` de aynı kütüphaneyi kullanıyorsa aynı yol.

### 5.2 Hız sınırı
- Var: `fon-hazirlik` (karne/hazırlık formu) — `public-lead.ts:147-155` e-posta + IP-hash penceresi; davet — plan koltuk sınırı + günlük limit (`invitations/route.ts`).
- Yok: `/api/cagrilar` (kimliksiz, dış API amplifikasyonu), `/api/cordis/*` (kimliksiz), `/api/v1/*` (UI 1.000/dk vaat ediyor, `src/lib/api-auth.ts`'de yok), LLM üreten action'lar (kredi defteri ile dolaylı sınır var), giriş (prod'da yalnız OAuth → parola kaba-kuvveti yok).
- Ayrı bir "iletişim formu" action'ı bulunamadı (`grep contact/iletisim` → yalnız fon-hazirlik).

### 5.3 Dosya yükleme
- RAG PDF (`/api/admin/documents/upload`): platform admin + boyut sınırı + bayt imzası kontrolü ✔.
- Ajans logo: `COBRAND_MAX_BYTES` + `sanitizeLogoPng` ✔. Feedback ekran görüntüsü: 2 MB sınır + oturum ✔.
- **Kanıt (evidence) — Y-4:** `confirmEvidenceUploadAction` (`evidence/actions.ts:81-135`) `data.objectKey`'i doğrulamadan `r2ObjectKey`'e yazıyor; `deleteEvidence` (`:267-268`) bu anahtarla `deleteFileFromR2` çağırıyor → kiracı A, kiracı B'nin anahtarını bilirse B'nin dosyasını silebilir. Anahtar `tenantId/org-default/<kategori>/<yıl>/<8 hex uuid>_<ad>` — tahmin zor ama sızıntı (URL paylaşımı, `fileUrl`) ile öğrenilebilir. Ayrıca presigned PUT'ta `mimeType` istemciden, izin listesi ve boyut koşulu yok; `R2_PUBLIC_HOST` ayarlıysa kanıt belgeleri (gizlilik=INTERNAL) **kimliksiz genel URL**'den okunur. `createEvidence` (FormData yolu) `uploadFileToR2` taklit fonksiyonunu çağırıyor (`storage.ts:134-139`: dosya yüklenmiyor, 300 ms bekleyip sahte URL dönüyor) — işlevsel hata.

### 5.4 Loglarda kişisel veri
`console.*/logger.*` içinde e-posta/telefon/token interpolasyonu deseni: **0 eşleşme**; webhook logları yalnız tenantId/planId. Kendi sunucu logumda e-posta deseni: 0. `mailer.ts:159` alıcı basmıyor ✔.

### 5.5 Hata sayfaları / stack trace
- 404 → sade sayfa ✔. Next prod sunucu hatalarını özetler ✔.
- **O-2:** API 500 gövdeleri `errorMessage(error)` döndürüyor (`cagrilar:122`, `cordis/*`, `billing/quote:97`, `billing/checkout:347`, `admin/*`). Kimliksiz canlı kanıt:
```
GET /api/cordis/organizations/%00 → {"success":false,"error":"\nInvalid `prisma.cordisOrganization.findUnique()` invocation:\n\n\nDatabase error. Code: `22021`. Message: `invalid byte sequence for encoding \"UTF8\": 0x00`"}
GET /api/cordis/projects?year_from=abc&limit=zz → {"success":false,"error":"\nInvalid `prisma.cordisProject.findMany()` invocation:\n\n{\n  where: {},\n  skip: NaN, … include: { topics: true, participations: { take: 10, include: { organization: …"}
```
(ikincisi aynı zamanda `limit=zz` → `NaN` doğrulama hatası.)
- D-3: `src/app/global-error.tsx:21` `error.message`'ı gösteriyor.

## 6. Düzeltme kartı önerileri (önem sırasıyla)

1. **[Y-1] SSRF: DOCX dışa aktarımında uzak görselleri engelle** — `concept-notes/[id]/export/route.ts` (+ `m2 exportToDocx`): HTML'i html-to-docx'e vermeden önce `<img>`'leri yalnız `data:image/(png|jpeg);base64` ile sınırla (http/https/file src'leri sil) ya da sunucu tarafı sanitize (izin listeli etiketler). `saveSectionContent`'te de aynı temizleme. Doğrulama: `ssrf.mjs` benzeri test — dinleyiciye 0 istek. Aynı kart: `image-size` override (O-3).
2. **[Y-2] Güvenlik başlıkları** — `next.config.ts#headers()` `/:path*`: `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `poweredByHeader: false`; CSP önce `Content-Security-Policy-Report-Only` ile (nonce'lu script-src, `images.unsplash.com`, R2 host, Google OAuth). Doğrulama: prod build curl -I.
3. **[Y-3] RBAC'ı yazma action'larında uygula** — ortak `requireTenantAction({ can: 'edit_proposal' })` benzeri yardımcı; ekteki 52 satırı eyleme göre eşle (gate → `evaluate_gates`, pipeline/seat → `manage_workspaces`/`edit_proposal`, evidence delete/verify → `edit_proposal`). Önce ürün kararı: MEMBER'ın beklenen yetkileri. Test: MEMBER oturumuyla her action'ın reddi.
4. **[Y-4] Kanıt nesne anahtarı doğrulaması** — `confirmEvidenceUploadAction`: `objectKey.startsWith(\`${tenantId}/\`)` ve imzalanmış anahtar (sunucunun ürettiği anahtarı kısa ömürlü HMAC ile bağla); `deleteEvidence` silmeden önce aynı önek kontrolü; presigned PUT'a MIME izin listesi + boyut; `createEvidence` taklit yüklemeyi kaldır ya da gerçek yükleme; evidence bucket'ı genel host'tan çıkar, `getPresignedDownloadUrl` ile ver.
5. **[O-1] `/api/cagrilar`** — oturum iste (tek tüketici `(app)/[workspace]/calls/page.tsx`), `pageSize` üst sınırı (≤50), arka plan `Topic` upsert'ünü kaldır (senkron iş kuyruğunda zaten var), çeviri çağrılarına eşzamanlılık/önbellek sınırı.
6. **[O-2] API hata gövdeleri** — 500'lerde sabit kod (`internal_error`) + log'da ayrıntı; `cordis/*` parametrelerini zod ile doğrula (NaN).
7. **[O-3] Bağımlılıklar** — `shadcn` ve `prisma` (CLI) → devDependencies; `pnpm-workspace.yaml` overrides: `openai>undici >=8.10.2`, `fast-uri >=3.1.7`, `html-to-docx>image-size >=2.0.3`; ardından `pnpm audit --prod` yüksek=0 hedefi.
8. **[O-4] API anahtarı hız sınırı** — `authenticateApiKey` içinde anahtar başına sayaç (DB penceresi ya da Redis) veya UI'daki "1.000/dk" vaadini kaldır.
9. **[D-1/D-4] Proxy sözleşmesi runbook'u** — TLS proxy `X-Forwarded-Proto` göndermeli ve `X-Forwarded-For`'u ezmeli; `AUTH_URL=https://…` prod'da zorunlu; canlıda curl ile `__Secure-authjs.session-token … Secure; HttpOnly` doğrulaması.
10. **[D-2/D-3/D-5/D-6] Toplu küçükler** — `poweredByHeader:false`; `global-error.tsx` mesajı gizle (digest göster); kalan action'lara `isPresentId`; prod `AUTH_SECRET`'in geçmişteki dev sabitinden farklı olduğunu md5 ile teyit (değer yazmadan).

## Kanıt / yöntem notları

- Prod build: temiz `git worktree` (`scratchpad/wt`, HEAD `4bfc20a5`) + `pnpm install --frozen-lockfile --offline` + `pnpm db:generate` + `pnpm build` → `exit=0`. (İlk deneme symlink'li node_modules ile Turbopack `Symlink … points out of the filesystem root` hatası verdi.)
- Sunucu PID kendi doğurduğum süreçti; `kill` sonrası `stopped`, 47620'de dinleyici yok; worktree `git worktree remove --force` ile kaldırıldı, kopyalanan `.env`'ler silindi.
- **Paylaşılan DB'ye istem dışı yazma (açıkça bildiriyorum):** `/api/cagrilar?limit=1&lang=en` isteğim, uç kendi arka plan upsert'ü nedeniyle paylaşılan `fabrika` DB'sinde 5 `Topic` satırının alanlarını SEDIA'dan gelen aynı değerlerle tazeledi ve `updatedAt`'lerini değiştirdi (salt-okuma sorgusu: `upd20: 5, total: 1301` — yeni satır yok; kimlikler: HORIZON-CL4-2027-04-DATA-03, HORIZON-CL4-2027-04-DIGITAL-EMERGING-10, HORIZON-CL5-2027-03-D5-06, HORIZON-CL5-2027-03-D5-05, HORIZON-MSCA-2027-COFUND-01-01). Bu, O-1 bulgusunun kendisidir (kimliksiz istek DB'ye yazıyor). Geri alma gerekmiyor (veri, gece senkronunun yazacağı aynı kaynak verisi); başka yazma yapılmadı.
- Ara dosyalar: `scratchpad/{audit.json,tree.out,hist.out,sa_inv.tsv,rt_inv.tsv,ssrf.mjs,build.log,server.log}` (değer içermez; `tree.out`/`hist.out` yalnız ilk 3 karakter + md5).

## Değişen dosyalar
- `docs/agent-results/TASK-MUN66T2HM4A4E-be-fb.md` (yalnız bu rapor). Kod değişikliği yok.

## Riskler
- Envanter otomatik desen aramasına dayanıyor: "Rol=-" bir satır, başka dosyadaki serviste rol kontrolü yapıyor olabilir (ör. m11 servis katmanı) — kart 3 uygulanırken satır satır doğrulanmalı.
- Oturum çerezi (session-token) bayrakları doğrudan gözlenmedi (prod'da demo kapalı, OAuth yok); aynı Auth.js fabrikasından çıkarım.
- Docker web imajı derlenmedi (fe-fb raporu `--target web`'in olmadığını not etmiş); standalone ölçümü kullanıldı.

## Açık sorular
1. MEMBER rolünün yazma yetkileri ürün olarak nedir? (Y-3 kapsamını belirler.)
2. CORDIS arama uçları kasıtlı olarak kimliksiz mi (pazarlama/SEO)?
3. Prod'da `R2_PUBLIC_HOST` ayarlanacak mı? Ayarlanacaksa kanıt belgeleri herkese açık URL'den okunur (Y-4).
4. TLS sonlandırma nerede (Cloudflare/nginx)? `X-Forwarded-Proto`/XFF davranışı D-1/D-4'ü kapatır.

## Sonraki adım
Kart 1-4 (yüksek) canlı öncesi zorunlu; 5-8 canlı haftasında; 9-10 runbook/toplu. Kartlar açılınca her biri için bu rapordaki canlı komutlar doğrulama adımı olarak kullanılabilir.

---

## Ek A — Yetki envanteri (165 satır, otomatik + elle işaretli)

Kimlik: Y/f/- · Rol: Y/- (gövdede rol/`can`/admin kontrolü) · Pilot: W/RO/- · id guard: Y/-/n/a

| Dosya | Fonksiyon | Kimlik | Rol | Pilot | id guard |
|---|---|---|---|---|---|
| `app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts` | generateApiKey | Y | Y | W | n/a |
| `app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts` | revokeApiKey | Y | Y | W | Y |
| `app/[locale]/(app)/[workspace]/settings/profile/actions.ts` | updateTenantProvince | Y | Y | W | n/a |
| `app/[locale]/(app)/[workspace]/settings/modules/actions.ts` | toggleModuleState | Y | Y | W | - |
| `app/[locale]/(app)/[workspace]/settings/billing/identity-actions.ts` | saveBillingIdentity | Y | Y | W | n/a |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | getOpportunityFormMembers | f | - | - | n/a |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | getSuggestedTopics | f | - | - | n/a |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | createOpportunity | f | - | W | - |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | assignOpportunityOwner | f | - | W | Y |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | addOpportunityNote | f | - | W | - |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | moveOpportunityStage | f | - | W | Y |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | evaluateOpportunityGate | f | - | W | Y |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | archiveOpportunity | f | Y | W | Y |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | logEffort | f | - | W | Y |
| `app/[locale]/(app)/[workspace]/pipeline/actions.ts` | declareApplication | f | Y | W | Y |
| `app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts` | addSeat | Y | - | W | - |
| `app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts` | findCandidates | Y | - | W | Y |
| `app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts` | assignSeat | Y | - | W | Y |
| `app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts` | getConflicts | Y | - | RO | - |
| `app/[locale]/(app)/[workspace]/evidence/actions.ts` | getEvidenceItemsAction | Y | - | RO | n/a |
| `app/[locale]/(app)/[workspace]/evidence/actions.ts` | getPresignedUploadUrlAction | Y | - | W | n/a |
| `app/[locale]/(app)/[workspace]/evidence/actions.ts` | confirmEvidenceUploadAction | Y | - | W | n/a |
| `app/[locale]/(app)/[workspace]/evidence/actions.ts` | createEvidence | Y | - | W | n/a |
| `app/[locale]/(app)/[workspace]/evidence/actions.ts` | deleteEvidence | Y | - | W | Y |
| `app/[locale]/(app)/[workspace]/evidence/actions.ts` | verifyEvidenceAction | Y | - | W | Y |
| `app/[locale]/(app)/[workspace]/evidence/actions.ts` | getHealthScoreAction | Y | - | RO | n/a |
| `app/[locale]/(app)/[workspace]/dashboard/export-csv.ts` | exportDashboardCSV | Y | Y | - | n/a |
| `app/[locale]/(app)/[workspace]/concept-notes/actions.ts` | createConceptNote | Y | - | W | - |
| `app/[locale]/(app)/[workspace]/concept-notes/actions.ts` | saveSectionContent | Y | - | W | - |
| `app/[locale]/(app)/[workspace]/concept-notes/actions.ts` | generateSectionDraft | Y | Y | W | - |
| `app/[locale]/(app)/[workspace]/concept-notes/actions.ts` | updateNoteStatus | Y | - | W | Y |
| `app/[locale]/(app)/[workspace]/approvals/actions.ts` | submitApprovalRequestAction | Y | - | W | - |
| `app/[locale]/(app)/[workspace]/approvals/actions.ts` | approveRequestAction | Y | Y | W | - |
| `app/[locale]/(app)/[workspace]/approvals/actions.ts` | rejectRequestAction | Y | Y | W | - |
| `app/[locale]/(app)/[workspace]/approvals/actions.ts` | cancelRequestAction | Y | - | W | - |
| `app/[locale]/(app)/[workspace]/relationships/actions.ts` | createRelationship | Y | Y | W | - |
| `app/[locale]/(app)/[workspace]/relationships/actions.ts` | updateRelationship | Y | Y | W | Y |
| `app/[locale]/(app)/[workspace]/relationships/actions.ts` | getAssignableMembers | Y | - | RO | n/a |
| `app/[locale]/(app)/[workspace]/relationships/actions.ts` | addInteraction | Y | - | W | - |
| `app/[locale]/(app)/ajans/actions.ts` | createInviteCode | f | - | - | n/a |
| `app/[locale]/(app)/ajans/actions.ts` | revokeInviteCode | f | - | - | - |
| `app/[locale]/(app)/ajans/actions.ts` | listInviteCodes | Y | - | RO | n/a |
| `app/[locale]/(app)/ajans/cobrand-actions.ts` | saveCoBrand | Y | Y | W | n/a |
| `app/[locale]/admin/settings/actions.ts` | sendSmtpTestEmail | Y | Y | - | n/a |
| `app/[locale]/admin/feedback/actions.ts` | triageFeedbackEntry | Y | Y | - | Y |
| `app/[locale]/admin/blog/actions.ts` | createBlogPostAction | Y | Y | - | n/a |
| `app/[locale]/admin/blog/actions.ts` | updateBlogPostAction | Y | Y | - | n/a |
| `app/[locale]/admin/blog/actions.ts` | deleteBlogPostAction | Y | Y | - | n/a |
| `app/[locale]/admin/blog/actions.ts` | toggleFeaturedBlogPostAction | Y | Y | - | n/a |
| `app/[locale]/admin/alerts/actions.ts` | setAlertResolved | Y | Y | - | Y |
| `app/[locale]/admin/cordis/actions.ts` | handleRunCordisImportAction | Y | Y | - | n/a |
| `app/[locale]/admin/cordis/actions.ts` | handleGetK2Status | Y | Y | - | n/a |
| `app/[locale]/admin/cordis/actions.ts` | handleRunCordisSync | Y | Y | - | n/a |
| `app/[locale]/admin/cordis/actions.ts` | handleGetCordisMetrics | Y | Y | - | n/a |
| `app/[locale]/admin/cordis/actions.ts` | handleRunCordisLiveDelta | Y | Y | - | n/a |
| `app/[locale]/admin/cordis/actions.ts` | handleGetCordisDeltaLogs | Y | Y | - | n/a |
| `app/[locale]/admin/cordis/actions.ts` | handleTestRagQuery | Y | Y | - | n/a |
| `app/[locale]/admin/modules/actions.ts` | updateTenantModuleStatus | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | createDraftAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | saveDraftAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | discardDraftAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | previewImpactAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | publishVersionAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | setVisibilityAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | archivePlanAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | deletePlanAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | assignPlanAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | unassignPlanAction | Y | Y | - | - |
| `app/[locale]/admin/billing/plans/actions.ts` | grantPilotAction | Y | Y | - | - |
| `app/[locale]/fon-hazirlik/actions.ts` | submitReadinessLead | - | - | - | n/a |
| `app/[locale]/accept-invite/continue/actions.ts` | startInvitationSignInAction | f | - | - | n/a |
| `app/[locale]/accept-invite/continue/actions.ts` | acceptInvitationAction | Y | - | - | n/a |
| `app/[locale]/accept-invite/continue/actions.ts` | signOutForInvitationAction | f | - | - | n/a |
| `actions/user/export-data.ts` | exportUserData | Y | Y | - | n/a |
| `actions/user/request-deletion.ts` | requestAccountDeletion | Y | Y | - | n/a |
| `actions/user/request-deletion.ts` | cancelAccountDeletion | Y | - | - | n/a |
| `actions/user/request-deletion.ts` | getDeletionStatus | Y | - | - | n/a |
| `lib/agency/actions.ts` | createAgencyInviteCodeAction | Y | Y | W | n/a |
| `lib/agency/actions.ts` | revokeAgencyInviteCodeAction | Y | Y | W | - |
| `lib/agency/actions.ts` | listAgencyInviteCodesAction | Y | - | RO | n/a |
| `lib/agency/actions.ts` | setTenantKindAction | Y | Y | - | - |
| `lib/actions/auth.ts` | loginWithCredentialsAction | - | - | - | n/a |
| `lib/actions/auth.ts` | loginWithSocialAction | - | - | - | n/a |
| `lib/actions/auth.ts` | logoutAction | - | - | - | n/a |
| `modules/m8/server/actions.ts` | computeSeatCandidates | Y | - | W | Y |
| `modules/m8/server/actions.ts` | inviteCandidateToSeat | Y | Y | W | Y |
| `modules/m8/server/actions.ts` | confirmSeatAssignment | Y | Y | W | Y |
| `modules/m8/server/actions.ts` | computeSeatCandidatesForm | f | - | - | n/a |
| `modules/m6/server/actions.ts` | generateAiEvaluation | Y | - | W | Y |
| `modules/m6/server/actions.ts` | saveHumanEvaluation | Y | - | W | - |
| `modules/m6/server/actions.ts` | calibrateESR | Y | - | W | - |
| `modules/m6/server/actions.ts` | saveEvaluation | Y | - | W | - |
| `modules/m6/server/actions.ts` | listPanelScores | Y | - | RO | - |
| `modules/m7/server/actions.ts` | createTtoItem | Y | - | W | n/a |
| `modules/m7/server/actions.ts` | matchTtoItemToCalls | Y | - | W | - |
| `modules/m7/server/actions.ts` | generateIpChecklist | Y | - | W | n/a |
| `modules/m9/server/actions.ts` | generateMeetingBrief | Y | - | W | - |
| `modules/m9/server/actions.ts` | savePostMeetingNotes | Y | - | W | - |
| `modules/m9/server/calendar-actions.ts` | disconnectCalendar | Y | - | W | Y |
| `modules/m9/server/calendar-actions.ts` | connectCalendar | Y | - | W | Y |
| `modules/m2/server/actions.ts` | generateConceptNoteDraft | Y | - | W | - |
| `modules/m2/server/actions.ts` | saveConceptNoteDraft | Y | - | W | Y |
| `modules/m2/server/actions.ts` | exportToDocx | Y | - | RO | - |
| `modules/m2/server/actions.ts` | generateAiUsageDeclaration | Y | - | W | - |
| `modules/m4/server/actions.ts` | createRelationship | Y | - | W | - |
| `modules/m4/server/actions.ts` | addInteraction | Y | - | W | - |
| `modules/m4/server/actions.ts` | updateNextStep | Y | - | W | Y |
| `modules/m11/server/partner-link.ts` | issuePartnerPortalLink | Y | - | W | Y |
| `modules/m11/server/actions.ts` | createApplicationPart | Y | - | W | - |
| `modules/m11/server/actions.ts` | getPartBData | Y | - | RO | - |
| `modules/m11/server/actions.ts` | acquireSectionLock | Y | - | W | Y |
| `modules/m11/server/actions.ts` | releaseSectionLock | Y | - | W | Y |
| `modules/m11/server/actions.ts` | updateSectionContent | Y | - | W | Y |
| `modules/m11/server/actions.ts` | addSectionComment | Y | - | W | - |
| `modules/m11/server/actions.ts` | resolveSectionComment | Y | - | W | Y |
| `modules/m11/server/actions.ts` | restoreSectionRevision | Y | - | W | Y |
| `modules/m11/server/actions.ts` | updatePresenceHeartbeat | Y | - | W | - |
| `modules/m11/server/actions.ts` | generateSectionDraftAi | Y | - | RO | - |
| `modules/m11/server/actions.ts` | calculateLumpSumBudget | Y | - | RO | n/a |
| `modules/m11/server/actions.ts` | addBudgetLine | Y | - | W | - |
| `modules/m11/server/actions.ts` | addWorkPackage | Y | - | W | - |
| `modules/m11/server/actions.ts` | addBudgetLineByToken | f | - | W | n/a |
| `modules/m10/server/actions.ts` | generateStandardDoc | Y | - | W | - |
| `modules/m10/server/actions.ts` | signDocument | Y | - | W | Y |
| `modules/m10/server/actions.ts` | createNewVersion | Y | Y | W | Y |
| `modules/m10/server/actions.ts` | submitDualApprovalAction | Y | Y | W | Y |
| `modules/m10/server/actions.ts` | departmentApproveAction | Y | Y | W | Y |
| `app/[locale]/(app)/[workspace]/dashboard/api/export-csv/route.ts` | GET | - | - | - | n/a |
| `app/api/admin/cordis/import/route.ts` | POST | Y | Y | - | n/a |
| `app/api/admin/documents/upload/route.ts` | POST | Y | Y | - | n/a |
| `app/api/admin/topic-stats/import/route.ts` | POST | Y | Y | - | n/a |
| `app/api/admin/topic-stats/rescore/route.ts` | POST | Y | Y | - | n/a |
| `app/api/agency/cobrand-logo/route.ts` | GET | Y | - | - | n/a |
| `app/api/agency/reports/[id]/route.ts` | GET | Y | - | - | - |
| `app/api/auth/hata/route.ts` | GET | - | - | - | n/a |
| `app/api/billing/checkout/route.ts` | POST | Y | - | - | Y |
| `app/api/billing/invoices/[id]/export/route.ts` | GET | Y | - | - | - |
| `app/api/billing/portal/route.ts` | POST | Y | Y | - | n/a |
| `app/api/billing/quote/route.ts` | POST | Y | - | - | Y |
| `app/api/cagrilar/route.ts` | GET | - | - | - | n/a |
| `app/api/concept-notes/[id]/export/route.ts` | GET | Y | - | - | - |
| `app/api/cordis/organizations/[id]/route.ts` | GET | - | Y | - | - |
| `app/api/cordis/organizations/route.ts` | GET | - | - | - | n/a |
| `app/api/cordis/projects/route.ts` | GET | - | Y | - | n/a |
| `app/api/dashboard/export-csv/route.ts` | GET | Y | Y | - | n/a |
| `app/api/documents/export/route.ts` | GET | Y | - | - | n/a |
| `app/api/feedback/route.ts` | POST | Y | Y | - | Y |
| `app/api/gdpr/delete/route.ts` | DELETE | - | - | - | n/a |
| `app/api/gdpr/export/route.ts` | GET | - | - | - | n/a |
| `app/api/invitations/route.ts` | POST | Y | Y | W | n/a |
| `app/api/saved-searches/[id]/route.ts` | PATCH | Y | - | W | Y |
| `app/api/saved-searches/[id]/route.ts` | DELETE | Y | - | W | Y |
| `app/api/saved-searches/route.ts` | GET | Y | - | - | n/a |
| `app/api/saved-searches/route.ts` | POST | Y | - | W | Y |
| `app/api/user/export-data/route.ts` | POST | - | - | - | n/a |
| `app/api/user/export/route.ts` | POST | - | - | - | n/a |
| `app/api/user/request-deletion/route.ts` | POST | - | - | - | n/a |
| `app/api/user/request-deletion/route.ts` | DELETE | - | - | - | n/a |
| `app/api/user/request-deletion/route.ts` | GET | - | - | - | n/a |
| `app/api/v1/calls/route.ts` | GET | - | - | - | Y |
| `app/api/v1/opportunities/route.ts` | GET | - | - | - | n/a |
| `app/api/v1/partners/[pic]/route.ts` | GET | - | Y | - | n/a |
| `app/api/v1/partners/route.ts` | GET | - | - | - | n/a |
| `app/api/webhooks/iyzico/route.ts` | POST | - | - | - | Y |
| `app/api/webhooks/stripe/route.ts` | POST | - | - | - | n/a |
