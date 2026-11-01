# TASK-MTSXG31NGW48D — Belge yükleme rotasında yetki kontrolü yoktu

**Ajan:** geli-tirici (BE-EN, Backend Mühendisi) · **Sprint:** SPRINT-S12 · **Dal:** `dev` · **Tip:** bug / güvenlik (P1)
**Tarih:** 2026-09-08

---

## 1. Ne yapıldı

`POST /api/admin/documents/upload` hiçbir yetki kontrolü içermiyordu; kodda `KNOWN GAP`
yorumu duruyordu. Rota belgeyi `processPdfAndStore(buffer, null, …)` ile
**`tenantId: null`** olarak yazıyor — yani `retrieveChunks`/`semanticSearch` üzerinden
**her kiracının** RAG bağlamına karışan paylaşılan korpusa. Depoda `middleware.ts` **yok**
(`find . -maxdepth 3 -name middleware.ts -not -path ./node_modules/*` → boş), dolayısıyla
kimliği doğrulanmamış bir POST doğrudan handler'a düşüyordu: RAG bağlam zehirlenmesi +
platform hesabına yazılan gömme (embedding) maliyeti.

Yapılanlar:

1. **`src/lib/tenant.ts` → `requirePlatformAdminApi()`** eklendi. `requireTenantApi` ile
   **aynı sözleşme**: throw etmez, `{ ok: true; userId } | { ok: false; response }` döner.
   Karar mantığı **kopyalanmadı** — mevcut `isPlatformAdminSession(session)` çağrılıyor,
   böylece rota/sayfa/server-action "platform personeli kimdir" sorusunda ayrışamaz.
   E-postadan admin **türetilmiyor**; session claim'i okunuyor.
   - Oturum yok → **401 `UNAUTHENTICATED`** ("giriş yaparsan geçebilirsin")
   - Oturum var, admin değil → **403 `PLATFORM_ADMIN_REQUIRED`** ("giriş yapmak bunu çözmez")
   - `message` alanları Türkçe, dosyadaki mevcut örneğe benzetildi.
2. **`src/app/api/admin/documents/upload/route.ts`**: kapı `req.formData()` okumasından
   **ÖNCE**. `KNOWN GAP` yorumu ve "best-effort session" bloğu kaldırıldı; aktör artık
   kapının kimliklendirdiği admin (`gate.userId`), "bulunursa" değil.
3. **`src/app/api/admin/cordis/import/route.ts`**: `src/app/api/admin/` altındaki tek diğer
   rota. Kiracı-üstü CORDIS korpusunu ve partner profillerini yazıyor (her kiracının okuduğu
   veri) ve pahalı bir iş tetikliyor → aynı kapı, `req.json()` okumasından önce takıldı.
4. **`tests/admin-upload-authz.test.ts`** (yeni, 6 test).

**Yetki mantığı yeniden yazılmadı** — eksik olan tek parça, var olan `isPlatformAdminSession`
kararının rota-handler sarmalayıcısıydı.

---

## 2. Kanıt

### 2.1 Kapının önce/sonra: gerçek HTTP çağrısı (`pnpm dev`, :3000)

**(a) Kimliği doğrulanmamış istek → 401**

```
$ curl -i -s -F "file=@probe.pdf" -F "kind=test" -F "title=authz-probe" \
    http://localhost:3000/api/admin/documents/upload

HTTP/1.1 401 Unauthorized
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
content-type: application/json
Date: Tue, 08 Sep 2026 17:25:56 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

{"error":"Unauthorized","message":"Bu işlem için giriş yapmanız gerekiyor.","code":"UNAUTHENTICATED"}
```

```
$ curl -i -s -X POST -H 'Content-Type: application/json' -d '{"dataset":"H2020","limit":1}' \
    http://localhost:3000/api/admin/cordis/import

HTTP/1.1 401 Unauthorized
...
{"error":"Unauthorized","message":"Bu işlem için giriş yapmanız gerekiyor.","code":"UNAUTHENTICATED"}
```

**(b) GERÇEK oturum açmış, platform admin OLMAYAN kullanıcı → 403.**
NextAuth credentials akışıyla gerçek çerez alındı (sentetik değil):

```
$ curl -s -b cookies.txt http://localhost:3000/api/auth/session
{"user":{"name":"Owner","email":"owner@demo.fabrika.test","image":null,
 "id":"cmtrhjyry0000ncxkbm1xnfma"},"expires":"2026-10-08T17:26:28.972Z",
 "tenantId":"cmtrhjys10001ncxk13gwtbcb","role":"TENANT_OWNER",
 "workspaceIds":["cmtrhjys40002ncxkn1h8cgz7"],"isPlatformAdmin":false}

$ curl -i -s -b cookies.txt -F "file=@probe.pdf" -F "kind=test" -F "title=authz-probe-403" \
    http://localhost:3000/api/admin/documents/upload

HTTP/1.1 403 Forbidden
...
{"error":"Forbidden","message":"Bu işlem yalnızca platform yöneticileri tarafından yapılabilir.","code":"PLATFORM_ADMIN_REQUIRED"}

$ curl -i -s -b cookies.txt -X POST -H 'Content-Type: application/json' \
    -d '{"dataset":"H2020","limit":1}' http://localhost:3000/api/admin/cordis/import

HTTP/1.1 403 Forbidden
...
{"error":"Forbidden","message":"Bu işlem yalnızca platform yöneticileri tarafından yapılabilir.","code":"PLATFORM_ADMIN_REQUIRED"}
```

Dönen gövdeler bu görevde yazılan **yeni** koda ait (`UNAUTHENTICATED` / `PLATFORM_ADMIN_REQUIRED`
kodları ve Türkçe mesajlar) — yani ölçüm gerçekten yeni kodu vuruyor, eski derlemeyi değil.

### 2.2 "Belge girmedi + para harcanmadı": DB satır sayıları (dört probe'un öncesi/sonrası)

Doğrudan Postgres'e sorgu (`SELECT count(*) …`), 4 probe'un öncesinde ve sonrasında:

```
BEFORE {"document_total":"21","document_shared_corpus":"7","ai_usage_log":"0"}
AFTER  {"document_total":"21","document_shared_corpus":"7","ai_usage_log":"0"}
FINAL  {"document_total":"21","document_shared_corpus":"7","ai_usage_log":"0"}
```

`document_shared_corpus` = `SELECT count(*) FROM "Document" WHERE "tenantId" IS NULL` —
korumak istediğimiz paylaşılan korpusun ta kendisi: **7 → 7**, değişmedi.

**Dürüst uyarı:** `AiUsageLog` taban değeri **0** olduğu için "0 → 0" tek başına zayıf bir
kanıttır (harcama olmadığını değil, hiç satır olmadığını da gösterebilir). Bu iddianın güçlü
ayağı `document_shared_corpus` sayısı ve 2.3'teki mock çağrı sayacıdır.

### 2.3 Birim testleri — reddedilen istekte `processPdfAndStore` çağrı sayısı 0

```
$ pnpm vitest run tests/admin-upload-authz.test.ts
 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  144ms
```

Testler gerçek rota handler'ını ve gerçek `@/lib/tenant` modülünü çağırıyor (yalnız
`@/lib/auth` ve `@/lib/ai/rag` mock'lanıyor), yani kapının kendisi ölçülüyor:

- oturumsuz → 401 + `expect(processPdfAndStoreMock).not.toHaveBeenCalled()`
- oturumlu ama admin değil → 403 + `not.toHaveBeenCalled()`
- platform admin → 200, `processPdfAndStore` **1 kez**, `tenantId === null`, `kind`/`title`
  doğru, aktör `{ userId: 'user-admin' }`
- `auth()` fırlatırsa → **500** ve yine `not.toHaveBeenCalled()` (fail-closed)
- `requirePlatformAdminApi` birim: 401/403 ayrımı; `role: 'SUPER_ADMIN'` claim'i de kabul

### 2.4 Kapı (lint / typecheck / tüm test paketi)

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — 0 hata)

$ pnpm lint
$ eslint
(çıktı yok — 0 hata)

$ pnpm test
 Test Files  120 passed | 2 skipped (122)
      Tests  1362 passed | 8 skipped (1370)
   Duration  5.50s
```

### 2.5 `src/app/api/admin/` taraması

`find src/app/api/admin -name route.ts` → **tam olarak iki** rota:
`documents/upload/route.ts` ve `cordis/import/route.ts`. **İkisi de** artık kapılı.
Kapsam dışında bırakılan (kiracıya bağlı, zaten `requireTenantApi` kullanan) bir admin
rotası **yok** — çünkü başka admin rotası yok.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/tenant.ts` | `PlatformAdminApiResult` tipi + `requirePlatformAdminApi()` eklendi (+54 satır). Mevcut hiçbir fonksiyon değiştirilmedi. |
| `src/app/api/admin/documents/upload/route.ts` | Kapı `formData()` öncesine takıldı; `KNOWN GAP` yorumu ve best-effort session bloğu kaldırıldı; aktör `gate.userId`. |
| `src/app/api/admin/cordis/import/route.ts` | Aynı kapı, `req.json()` öncesine takıldı (+7 satır). |
| `tests/admin-upload-authz.test.ts` | **Yeni** — 6 test. |

Not: `git diff --stat` ayrıca `src/lib/beta/*` dosyalarını gösteriyor; bunlar **paralel
çalışan başka bir ajanın** değişiklikleri, bu görevin commit'ine dahil edilmedi.

---

## 4. Riskler

- **Davranış değişikliği (kasıtlı):** Bu rotalar artık kimliği doğrulanmamış çağrıya
  cevap vermiyor. Bunları çağıran otomatik bir script/cron varsa **kırılır**. Depoda
  `admin/documents/upload` adresini çağıran hiçbir kod bulunamadı
  (`grep -rn "admin/documents/upload" src/` → 0 sonuç), yani bilinen bir UI/istemci
  bağımlılığı yok; harici bir betik varsa platform-admin oturumu taşımalıdır.
- **`auth()` çökerse rota 500 veriyor** (eskiden yükleme yine de geçiyordu). Bu bilinçli:
  kimlik doğrulanamıyorsa paylaşılan korpusa yazmak fail-open olurdu.
- **Platform-admin 200 yolu gerçek HTTP ile denenmedi** — bilerek. Gerçek bir admin
  yüklemesi paylaşılan korpusa kalıcı bir belge yazar ve **gerçek OpenAI gömme maliyeti**
  doğurur; korumaya çalıştığımız veriyi kirletmemek için bu yol birim testinde
  (`tenantId=null` + aktör iddiasıyla) doğrulandı, canlıda tetiklenmedi. Onay verilirse
  tek bir küçük PDF ile canlı da doğrulanabilir.
- **`AiUsageLog` taban değeri 0** — §2.2'deki uyarıya bakın.

---

## 5. Yol üstünde görülen, DÜZELTİLMEYEN kusurlar (kart kuralı: adıyla bildir)

- **B1 — Depoda `middleware.ts` hiç yok.** Rotaların önünde tek bir merkezi kapı yok;
  her rota kendi kapısını kendisi takmak zorunda. Bu görevde iki rota kapatıldı ama
  yapısal boşluk duruyor: yarın eklenecek üçüncü bir admin rotası yine korumasız doğar.
  Öneri: ya `middleware.ts` ile `/api/admin/*` ön kapısı, ya da bu kapıyı zorunlu kılan
  bir lint/test kuralı (`tests/tenant-fallback-guard.test.ts` desenine benzer kaynak
  taraması).
- **B2 — `GET /api/cagrilar` kimlik doğrulaması ve hız sınırı olmadan dışarı çağrı yapıyor.**
  `SediaAdapter.searchSedia` + `translateTopicsBatch` tetikliyor; çeviri LLM maliyeti
  doğurabilir. Anonim bir çağıran platform hesabına maliyet yazdırabilir. (Kapsam dışı.)
- **B3 — `GET /api/cordis/organizations`, `/api/cordis/organizations/[id]`,
  `/api/cordis/projects`** kimlik doğrulaması olmadan okunuyor. Kiracı verisi değil,
  paylaşılan referans veri; muhtemelen kasıtlı ama hiçbir yerde **belgelenmiş değil**.
  Karar yazıya dökülmeli.
- **B4 (yanlış alarm — netleştirme):** `api/gdpr/*` ve `api/user/*` rotaları ilk taramada
  "kapısız" göründü; okundu, **kapılılar** — kimlik doğrulamayı devrettikleri server
  action'da (`exportUserData`, `requestAccountDeletion`) yapıyorlar. Sorun yok.

---

## 6. Açık sorular

1. `/api/admin/*` için merkezi `middleware.ts` kapısı isteniyor mu, yoksa rota-başına kapı
   + bunu zorunlu kılan bir kaynak-tarama testi mi tercih edilir? (B1)
2. `/api/cordis/*` ve `/api/cagrilar` gerçekten herkese açık mı olmalı? (B2, B3)
3. Platform-admin 200 yolunu canlı ortamda (gerçek gömme maliyetiyle) doğrulamamı ister
   misiniz? Şu an bilinçli olarak yapılmadı.

---

## 7. Sonraki adım

1. B1 için kart: `/api/admin/*` ön kapısı veya "her admin rotası bir kapı çağırmalı"
   kaynak-tarama testi. Bu görevdeki düzeltmenin tekrar açılmasını engelleyen tek şey odur.
2. B2/B3 için karar kartı: bu rotalar açık mı kalacak, hız sınırı gerekli mi?
3. `src/lib/rbac.ts` içindeki `can(role, action)` tablosu **kiracı içi** rollerdir ve
   platform-admin kavramını taşımaz; bu görevde bilerek kullanılmadı (platform admin
   kiracılar *arası* çalışır). İkisinin ilişkisi bir yerde belgelenmeli.
