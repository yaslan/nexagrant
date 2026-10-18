---
sözleşme: 3
görev: TASK-MVDQ4CRNC2WL
kod: FO-81
ajan: crw2-fb
motor: claude-opus-5-5
tip: review
okur: lider
hüküm: Onay, bloke eden bulgu yok. Gizli değer/hash HTML'de, RSC'de ve sunucu logunda yok; kiracılar arası iptal (id tahmini) ve MEMBER iptali sunucuda reddediliyor; M1 OFF'ta üretme reddediliyor; iptal edilen anahtar gerçek curl ile 401. Tek DoD açığı: kiracı izolasyonu PR'ın testlerinde yok (davranışı ben ölçtüm, doğru) — merge öncesi test eklensin ya da bu ölçüm kanıt sayılsın (K-1).
platform: mac (darwin 27.0, yerel Postgres :5433, next dev :3110, Playwright Chromium). Kod web + sunucu, platforma bağlı yol/süreç/kabuk çağrısı yok; Windows/Linux koşulmadı (gerek yok, davranış OS'tan bağımsız).
sürüm: origin/be-fb/fo81-api-key-revoke-locked e606b8fc (base 16c457c6; güncel origin/dev 537a351f ile merge-tree temiz)
tarih: 2026-10-18
---

# TASK-MVDQ4CRNC2WL (FO-81) — PR #109 güvenlik incelemesi (crw2-fb)

**Karar:** Merge edilebilir. Bloke eden bulgu yok. K-1 (DoD'deki "kiracı izolasyonu testli" maddesi) lider kararına bırakıldı.

Worktree: `/Users/macbook/alan/FONBRIDGE-crw2-fo81` (detached, e606b8fc). `.env*` okunmadan kopyalandı. Patronun :3000 sunucusuna dokunulmadı; e2e 3110'da koştu. Kod değiştirilmedi. Geçici probe spec'i (`tests/e2e/zz-crw2-fo81-probe.spec.ts`) yalnız benim worktree'mde koştu, sonra silindi (kopyası: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/a9b9729d-3ffb-46f7-8fdf-304a4b6a9da4/scratchpad/zz-crw2-fo81-probe.spec.ts`). Probe kendi kiracılarını (`crw2-fo81-a`, `crw2-fo81-b`) sildi; DB'de kalıntı 0.

## Odak maddeleri — sonuç

| # | Konu | Sonuç | Kanıt |
|---|------|-------|-------|
| 1 | Kilit altında yalnız aktif anahtar + gizli olmayan alanlar | ✅ | `ApiKey`'de iptal = satır silme (`revokedAt` yok), yani her satır aktif. `loadApiKeys` select: `id, name, prefix, lastUsedAt, createdAt` (`page.tsx:22`). M1 OFF sayfasının HTML'i (224 KB) ve RSC yanıtı (`RSC: 1`, 188 KB) tarandı: `keyHash` kelimesi yok, 4 anahtarın 64-hex hash'i yok, ham anahtarların hiçbiri yok, `tenantId`/`rateWindow` alanı yok, demo satırı yok. Sunucu logunda (659 satır) `fp_live_<hex>` ya da 64-hex dize yok. |
| 2 | Yetki: iptal yalnız `manage_users`, M1 kapısı iptalde yok | ✅ | `actions.ts:89-90` rol kontrolü; `assertModuleAccess` yalnız `generateApiKey`'de. MEMBER oturumuyla `revokeApiKey` action'ı (gerçek action id) doğrudan çağrıldı → `{"success":false,"error":"forbidden"}`, anahtar DB'de duruyor. Panelde MEMBER için 0 düğme. |
| 3 | Kiracı izolasyonu (id tahmini ile toplu iptal dahil) | ✅ davranış / ⚠️ test yok (K-1) | Kiracı A'nın sahibi, yakalanan `revokeApiKey` action'ını B kiracısının iki anahtar id'siyle tekrar oynattı → iki B anahtarı da DB'de duruyor, B için AuditEvent 0; B anahtarı curl ile 200 vermeye devam ediyor. Listede B'nin adı/id'si yok (HTML+RSC). Kod: `deleteMany({ where: { id, tenantId } })` + `withTenant`. |
| 4 | Toplu iptal `revokeApiKey`'i tekrar kullanıyor, her iptal AuditEvent | ✅ | `revoke-panel.tsx:39-55` her id için `revokeApiKey` çağırıyor, ayrı bulk sorgu yok. AuditEvent aynı transaction'da ve yalnız `count > 0` ise (`actions.ts:104-112`). Probe: `{tenantId: A, actorId: owner, type: 'apiKey.revoked'}` tek satır. Boş/eksik/nesne id → `{"success":false}`, hiçbir anahtar silinmedi (`isPresentId` koruması çalışıyor). |
| 5 | M1 OFF'ta üretme reddediliyor; `moduleGate` değişmedi | ✅ | M1 ON'da yakalanan `generateApiKey` action'ı M1 OFF'ta tekrar oynatıldı → 500 (`ModuleAccessError` fırlatılıyor, FO-54 tasarımı), anahtar sayısı 2 → 2. `git diff origin/dev...HEAD -- src/lib src/core src/components prisma` boş: genel kapı ve durum makinesine dokunulmamış; ek yalnız `page.tsx` içinde. |
| 6 | `client.tsx` sabit metni `t()`, e2e messages'tan okuyor | ✅ (kısmen) | Başlık `t('createTitle')`; `i18n:check` geçti. Yeni spec gate/panel/onay metinlerini `messages/*.json`'dan okuyor; ama açık sayfadaki iki metin (`'Örn: SAP ERP Pipeline Senkronu'` placeholder, `'API Key Oluştur (fp_live_...)'` düğmesi) hâlâ sabit, çünkü `client.tsx`'te hâlâ sabit (baseline 17). Kapsam dışı. |
| 7 | İptal edilen anahtar `/api/v1`'de 401 (gerçek curl) | ✅ | `curl -H 'x-api-key: …' :3110/api/v1/partners?limit=1`: iptal öncesi 200 → M1 OFF'ta iptal edilen 401, iptal edilmeyen 403 → M1 tekrar ON: iptal edilen **401**, diğeri 200, B kiracısı 200. |

## Bulgular (önem sırasıyla)

Bloke eden: **yok.**

**K-1 (orta, DoD açığı, bloke değil):** Kartın DoD'si "Rol + kiracı izolasyonu testli" diyor. Rol testli (birim + e2e). Kiracı izolasyonu PR'ın testlerinde yok; be-fb raporunda da "açık boşluk" olarak yazılmış. Birim testteki `deleteMany` mock'u yalnız `where`'de `tenantId` olduğunu doğruluyor; gerçek DB'de başka kiracının id'siyle iptal denenmiyor. Davranış doğru (yukarıda #3). Öneri: `api-keys-revoke-locked.spec.ts`'e ikinci bir kiracı + "A sahibi B'nin anahtar id'sini `revokeApiKey`'e verir → B anahtarı durur" vakası. Bu incelemedeki probe deseni kullanılabilir: action'ı `postData()` içinde id'ye göre süzerek yakala, gövdedeki id'yi değiştirerek tekrar oynat. Lider, bu ölçümü DoD kanıtı sayabilir ya da ayrı kart açabilir.

**Ö-1 (düşük, öneri):** `apiKey.revoked` AuditEvent'inde `data` boş, `target` yalnız silinmiş anahtarın id'si. Satır silindiği için denetim kaydından hangi anahtarın (ad/önek) iptal edildiği sonradan anlaşılamıyor. Öneri: `data: { name, prefix }`. Bunun için önce `findFirst` gerekir; ya da `deleteMany` yerine tenant'lı `findFirst` + `delete`. Gizli değer değil, önek zaten UI'da görünüyor.

**Ö-2 (düşük, öneri):** E2E `afterAll` yalnız kimlikleri siliyor. `fo81-e2e-tenant` kiracısı, abonelik, ModuleState ve AuditEvent satırları kalıyor. Yerel test DB'sinde bu kiracıya ait **18** `apiKey.revoked` satırı birikti. `feature-module-gate.spec.ts`'deki desenle aynı, yani yeni bir sapma değil. Testler `target: { in: [...] }` ile süzdüğü için yanlış sonuç vermiyor.

**Ö-3 (düşük, a11y; koddan, tarayıcıda ölçülmedi):** Onay diyaloğu kapanınca (Vazgeç/Escape/onay) odak tetikleyen düğmeye geri dönmüyor, `body`'ye düşüyor. Focus trap da yok (be-fb riskler bölümünde yazmış). Escape yalnız odak diyalog içindeyken çalışıyor; `autoFocus` sayesinde açılışta sorun yok.

**Ö-4 (düşük):** Kilitli modda `loadApiKeys` hata verirse (`null → []`) yalnız kilit ekranı görünür ve log'a `console.warn` düşer. Kullanıcı, iptal edilecek anahtarı olduğunu göremez. Bugünkü açık sayfa davranışıyla aynı; bilgi amaçlı.

**Bilgi (regresyon değil):** M1 OFF'ta `generateApiKey` çağrısı değer döndürmek yerine fırlatıyor (500). Bu FO-54'ün bilinçli tasarımı (`actions.ts:47-49`). Dev modunda yanıt gövdesine stack yolu düşüyor; prod'da Next bunu gizler.

**Not:** MEMBER, kilit altında anahtar adlarını ve öneklerini görüyor. Açık sayfa da rol kontrolü yapmadan listeyi gösteriyor (`page.tsx:81-91`), yani yeni bir ifşa değil.

## Kanıt (ham çıktı)

```
pnpm typecheck                       → tsc --noEmit, exit 0
pnpm i18n:check                      → ✅ i18n check passed …
eslint api-keys/ + 2 test dosyası    → 0 bulgu
vitest tests/modules/api-keys.test.ts tests/server-action-missing-id.test.ts
                                     → Test Files 2 passed, Tests 45 passed, 0 skipped
vitest tests/api-key-rate-limit.live.test.ts tests/api-module-gate.live.test.ts (.env.test, 127.0.0.1:5433)
                                     → Test Files 2 passed, Tests 8 passed, 0 skipped
playwright api-keys-revoke-locked.spec.ts + feature-module-gate.spec.ts (E2E_PORT=3110)
                                     → 5 passed (17.2s), 0 failed, 0 skipped
playwright zz-crw2-fo81-probe (geçici) → 1 passed (22.1s)
git merge-tree origin/dev(537a351f) HEAD → temiz
```

Probe çıktısı (özet, `fo81-probe.json`):
```
curlBefore   {"a1":"200","b1":"200"}
htmlScan     {"keyHashWord":false,"anyHash":false,"anyRaw":false,"tenantB":false,"a1Shown":true,"tenantIdA":false,"rateWindow":false,"demoRows":false}
rscScan      {"keyHashWord":false,"anyHash":false,"anyRaw":false,"tenantB":false,"a1Shown":true,"tenantIdA":false,"rateWindow":false,"demoRows":false}
revBody      ["cmvdwqfm50004y6xkt6xh43w5"]
crossTenant  {"b1Exists":true,"b2Exists":true,"auditB":0}
badIds       [] / [""] / [{"not":"string"}] / [""] → {"success":false}, a2Exists:true
genOff       {"status":500,"before":2,"after":2}
member       {"success":false,"error":"forbidden"}, a2Exists:true, panel düğmesi 0
auditA1      [{"tenantId":"crw2-fo81-a","actorId":"crw2-fo81-owner","type":"apiKey.revoked","data":null}]
curlOff      {"a1":"401","a2":"403","gen":"403"}
curlOn       {"a1":"401","a2":"200","b1":"200"}
```

## Değişen dosyalar

Yalnız bu rapor (`docs/agent-results/TASK-MVDQ4CRNC2WL-crw2-fb.md`). PR koduna dokunulmadı.

## Riskler

- Toplu iptal sıralı N action ve atomik değil (be-fb raporunda yazılmış). Kısmi başarısızlıkta liste doğru kalıyor (`revoked` set'i), hata gösteriliyor. Güvenlik riski yok.
- PR base'i (16c457c6) güncel dev'in iki commit gerisinde; merge-tree temiz, çakışma yok.

## Açık sorular (lidere)

1. K-1: kiracı izolasyonu e2e'si merge öncesi bu PR'a mı eklensin, yoksa bu ölçüm DoD kanıtı mı sayılsın?
2. Ö-1: AuditEvent'e `name/prefix` eklensin mi? (be-fb'nin açık sorusu 1 ile ilgili: AuditEvent eklemesinin kendisi bence doğru; kart da bunu istiyor.)

## Sonraki adım

Lider K-1'e karar verince PR #109 `dev`'e merge edilebilir. Ö-1…Ö-3 isteğe bağlı küçük takip.
