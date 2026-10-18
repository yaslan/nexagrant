# TASK-MVDPYNG1JI0S1 (FO-80) — Partner REST API (/api/v1/*) M1 modül ve plan kapısı

**Hüküm:** Tamam. `/api/v1/*` artık M1 modül durumuna ve plan kapsamına kapılı; kapı tek noktada (`authenticateApiKey`). Gerçek DB ve gerçek `curl` ile doğrulandı.

**Platform beyanı:** Sunucu tarafı; işletim sisteminden bağımsız. Ölçüm macOS (darwin 27.0) üzerinde, yerel Postgres ve `pnpm dev` ile yapıldı.

**Dal:** `be-fb/fo80-api-module-gate` (origin/dev 9cbc5761 üstünde, PR #101 dev'de), worktree `/Users/macbook/alan/FONBRIDGE-fo80`.

## Ne yapıldı

1. **Kapı tek noktada.** `src/lib/api-auth.ts` → `authenticateApiKey`: anahtar doğrulanır, rate limit sayılır, sonra `checkModuleAccessForTenant(tenantId, 'M1', API_KEY_VIEWER)`. Reddedilirse **403** `{ "error": "MODULE_ACCESS_DENIED", "module": "M1" }`. Beş route da bu fonksiyonu zaten çağırdığı için route dosyalarına dokunulmadı.
2. **Mantık kopyası yok.** Karar `decideModuleAccess` içinde; oturumlu kapı (`checkModuleAccess`), gezinme (`listAccessibleModules`) ve API aynı fonksiyonu kullanır.
3. **Sapma (bilinçli):** Varyant `access.ts` yerine yeni `src/lib/modules/tenant-access.ts` dosyasına konuldu. Sebep: `access.ts` `@/lib/auth`'u (next-auth + Prisma adapter) yüklüyor; API yolu ve birim testleri bunu çekince kırılıyordu. `access.ts` mevcut export'larını (`ModuleAccessResult` dahil) koruyor.
4. **Seed ve yorumlar (crw2 Ö-2):** `scripts/seed-plan-e2e.ts` yorumları M5'i de anlatacak şekilde düzeltildi (ultra fixture M5'i açıyor, varsayılan M10).
5. **Dokümantasyon:** `docs/MODULES.md` M1 bölümü güncel durumu anlatıyor (403 sözleşmesi, PILOT/DEV kararı, revoke kapısız).
6. **Kilit ekranı (FO-81) yapılmadı**, kapsam dışı.

## Kararlar (raporda geri alınabilir)

- **Görüntüleyici rolü:** API anahtarı bir üye değil; `role: 'API_KEY'`, `isPlatformAdmin: false`. Sonuç: M1 `PILOT` durumundaysa anahtarlar **403** alır (PILOT yalnız TENANT_OWNER/ADMIN/PIPELINE_MANAGER için). DEV de kapalı. Açık soru: PILOT tenant'larının anahtarları kapalı kalmalı mı? Şu an "evet" uygulandı.
- **Sayaç:** Modül kapısı sayaçtan SONRA çalışır; 403 alan istekler de rate limit sayacına girer. Mevcut davranışla tutarlı (401 olmayan her geçerli anahtar isteği sayılıyor).
- **Revoke:** `revokeApiKey` kapısız kaldı (M1 kapansa da sızan anahtar iptal edilebilmeli).
- **Hata:** Kapı içinde bir DB hatası olursa fail-closed: 500 `AUTH_INTERNAL_ERROR`.

## Kanıt

### Gerçek curl (dev sunucusu :3200, gerçek DB, geçici tenant + anahtar, sonra temizlendi)

```
== 1. M1 ON
HTTP/1.1 200 OK
{"success":true,"meta":{"total":1,"limit":1,"statusFilter":"OPEN",...
M1 -> OFF
== 2. M1 OFF
HTTP/1.1 403 Forbidden
{"error":"MODULE_ACCESS_DENIED","module":"M1"}
M1 -> ON
== 3. M1 ON again
HTTP/1.1 200 OK
== 4. no key
HTTP/1.1 401 Unauthorized
{"error":"Unauthorized","message":"Missing API key. Provide `x-api-key` or `Authorization: Bearer <key>` header.","code":"AUTH_MISSING_API_KEY"}
cleaned
```

### Testler

- Yeni birim: `tests/api/v1-module-gate.test.ts` — 15 test (9 kapı durumu + 6 route-kapsam testi: beş route de `authenticateApiKey(req)` çağırıyor). Kapsam: ON+plan → auth; OFF → 403 tam gövde; ModuleState satırı yok → 403; plan dışı → 403; PILOT → 403; DEV → 403; bilinmeyen anahtar → 401 ve modül okunmuyor; reddedilen istek sayaca giriyor; modül okuma hatası → 500.
- Yeni canlı (gerçek DB): `tests/api-module-gate.live.test.ts` — 3 test (ON → auth; OFF → 403 ve M1 yeniden açılınca aynı anahtar çalışıyor; plan `basic`'e düşünce → 403).
- Güncellenen canlı/mock testler: M1 yetkisi verilmiş tenant kurulumu eklendi (`tests/api-key-rate-limit.live.test.ts`, `tests/deleted-tenant-sessionless.live.test.ts`); route birim testleri (`tests/api/v1-*.test.ts`, `tests/api/api-key-rate-limit.test.ts`) kapı kararını izinli mock'luyor, kapının kendisi yukarıdaki yeni testlerle kanıtlanıyor.

### Mutasyon kontrolü

`api-auth.ts` içindeki `if (!access.allowed) {` satırı `if (false) {` yapıldığında `v1-module-gate.test.ts` **5 test kırıldı** (OFF, ModuleState yok, plan dışı, PILOT, DEV). Satır geri alındı; `grep -c` ile 1 doğrulandı.

### Pipeline ve kapılar

- `pnpm lint`: 0 hata (4 uyarı, hepsi dokunulmayan dosyalarda, önceden var).
- `pnpm typecheck`: temiz.
- `pnpm test`: **356 dosya geçti, 4636 test geçti, 120 atlandı** (atlananlar önceden de atlanan koşullu testler). Başarısız 0.
- `pnpm i18n:check`, `pnpm rls:check`, `pnpm rls:bypass-check`, `pnpm rls:verify --require-db` (47 tabloda izolasyon gerçekten ölçüldü), `pnpm alerts:check`: hepsi exit 0.
- `pnpm db:rls-role` çalıştırılmadı (DB rol değiştirir; bu iş için gerekmiyor).
- `pnpm test:e2e` (`E2E_PORT=3100`, patronun :3000 sunucusu kapatılmadı): ilk koşu **350 geçti, 2 kaldı, 8 atlandı**. Kalan 2, `st6-empty-tenant-no-fabrication` spec'inin "point 1" testleri: bare tenant'ın M1'i kapalıydı, kapı doğru olarak 403 verdi. Düzeltme: `scripts/seed-st6-empty-e2e.ts` MODULES listesine M1 eklendi. Yeniden koşu: **st6 spec 7/7 geçti**.
- Blog e2e: ilk koşuda hata vermedi; R2 değişkenleri elle verilmesi gerekmedi.

## Değişen dosyalar

- `src/lib/api-auth.ts` — kapı + 403 gövdesi
- `src/lib/modules/tenant-access.ts` — YENİ: `checkModuleAccessForTenant`, `decideModuleAccess`, `ModuleAccessResult`
- `src/lib/modules/access.ts` — karar fonksiyonları taşındı, oturumlu kapı yeni modülü kullanıyor
- `scripts/seed-plan-e2e.ts` — M5 yorumları (crw2 Ö-2)
- `scripts/seed-st6-empty-e2e.ts` — bare tenant'a M1 ON
- `docs/MODULES.md` — M1 bölümü
- `tests/api/v1-module-gate.test.ts` — YENİ
- `tests/api-module-gate.live.test.ts` — YENİ
- `tests/api/v1-calls.test.ts`, `tests/api/v1-opportunities.test.ts`, `tests/api/v1-partners.test.ts`, `tests/api/api-key-rate-limit.test.ts` — kapı mock'u
- `tests/api-key-rate-limit.live.test.ts`, `tests/deleted-tenant-sessionless.live.test.ts` — M1 yetkili tenant kurulumu

## Riskler

- PILOT tenant'larında mevcut anahtarlar 403 alacak (yukarıdaki karar). Müşteri etkisi için ürün onayı gerekir.
- Yerel `.env*` dosyaları bu worktree'de yok; yalnızca çalıştırma için ana worktree'nin dosyalarına sembolik link verildi (gitignore'lu, commit'e girmez).

## Açık sorular

1. PILOT tenant'ların API anahtarları kapalı kalmalı mı, yoksa PILOT da API'ye açılmalı mı?

## Sonraki adım

PR (base `dev`) açılıp kart `review`'a alınacak. Kilit ekranı için FO-81 ayrı kart.
