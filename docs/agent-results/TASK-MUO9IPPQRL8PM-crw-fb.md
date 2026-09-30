# TASK-MUO9IPPQRL8PM — FB İNCELEME-94: admin plan hata sızıntısı düzeltmesi (TASK-MUNZKR3PEV8EI, dev 46eddcea) — crw-fb

**Durum:** TAMAM
**Karar:** ONAY. Bloke eden bulgu yok. 2 test-sertleştirme önerisi (Ö-1, Ö-2) ve kapsam dışı 1 gözlem (G-1, önceden vardı, ayrı kart önerisi) var.
**İncelenen:** dev `2a3900b8` (46eddcea merge'ünü içerir). Ayrı worktree, izole DB `crwfb94-pg` (pgvector:pg16, 127.0.0.1:5494). Paylaşılan `fabrika` :5433'e bağlanılmadı. Kod değiştirilmedi.
**Not:** `TASK-MUNZKR3PEV8EI-crw3-gnd.md` (durdurulmuş iskelet) görev gereği dikkate alınmadı.

## 1. Ne yapıldı

Değişikliğin amacı: 11 admin plan eylemi artık `{ ok:false, code }` dönüyor ve `code` yalnız `PLAN_FAILURE_CODES` listesinden gelebiliyor. Hata metni yalnız sunucu log'una gidiyor. `page.tsx` okuma hatası `boolean` oldu.

Okunan dosyalar: `failure-codes.ts`, `actions.ts`, `actions.test.ts`, `client.tsx`/`pilot-panel.tsx`/`page.tsx` diff'i, `tests/api/response-status-scan.ts` (`catchReturnLeaks`, `SANITISERS`) ve listedeki her kodun kaynağı:
- `plan-repository.ts` altı sınıf.
- `pilot.ts` → `ContractSubscriptionError`.
- `tenant.ts` → `PlatformAdminRequiredError`.

Listedeki 9 kodun hepsi gerçek bir `readonly code` ile eşleşiyor. Listede olmayan kodlu hatalar `UNKNOWN`'a düşüyor. Bunlar sızıntı değil, bilerek yapılmış seçimler:
- `PILOT_EXPIRED` (grant yolunda atılmıyor),
- `TENANT_SCOPE_REQUIRED`,
- `SYSTEM_SCOPE_PURPOSE_UNKNOWN`,
- `MissingIdError` (kodu yok, `status` var).

Saldırgan denemeler (ayrıntısı §2'de):
1. **Gerçek-DB probu:** Mock'lu repository yerine gerçek Prisma, gerçek `plan-repository`/`pilot`, gerçek `requirePlatformAdmin`. Yalnız `auth()` ve `revalidatePath` stub. 11 eylemin her biri 4 ayrı hata sınıfıyla tetiklendi: tablo adı değişti (P2021), trigger RAISE (P2039), FK (P2003), bağlantı reddi (P1001). Bunlara ek olarak yetkisiz 3 oturum türü ve bozuk Flight girdisi denendi.
2. **Canlı UI:** Prod build (standalone) üzerinde headless Chromium ile gerçek tıklama yapıldı. be-fb'nin denemediği 3 eylem seçildi: arşivle, kamu paketi ata, pilot ver. tr ve en ayrı ayrı denendi. Bilinen bir ret ve admin olmayan kullanıcı da eklendi. **Server action'ın tel üstündeki yanıt gövdesi (RSC payload) de tarandı**: ekrandaki metinle yetinilmedi.
3. **Kendi 6 mutantım:** Bekçi, davranış testi ve tsc katmanları ayrı ayrı sınandı.
4. **Tam kapılar:** Birleşik dev ağacında koşuldu.

## 2. Kanıt

### 2.1 Gerçek-DB probu: 11 eylem × hata sınıfları (`ekler/probe-lines.txt`, kaynak `probe.test.ts.txt`, `conn.test.ts.txt`)
Probe dosyaları repoya konmadı. Tam vitest koşusundan önce worktree'den çıkarıldı.

| Senaryo | Sonuç (11 eylem) | Log'daki gerçek kod |
|---|---|---|
| S1 admin olmayan (`bob`), `role:'ADMIN'` kiracı admini, oturumsuz | 33/33 `{"ok":false,"code":"PLATFORM_ADMIN_REQUIRED"}`, `logger.error` 0 kez, Plan/PlanVersion/PlanAssignment/Subscription md5 değişmedi | — |
| S2 `Plan`/`PlanVersion`/`PlanAssignment` yeniden adlandırıldı | 11/11 `{"ok":false,"code":"UNKNOWN"}` | **P2021** ×11 |
| S3 6 tabloda trigger `RAISE 'crw94-internal tablo=% secret=hunter2'` | Yazan 8 eylem `UNKNOWN`. Yayınlanmış sürüme yazan 3 eylem kendi kodunu aldı: `PUBLISHED_VERSION_IMMUTABLE`. previewImpact yalnız okuduğu için `ok`. Hiçbir gövdede `hunter2`, `crw94` ya da `P####` yok | **P2039** |
| S4 FK: var olmayan kiracıya ya da plana atama, var olmayan kiracıya pilot | `UNKNOWN` | **P2003** |
| S5 `DATABASE_URL` kapalı porta yönlendi (bağlantı reddi) | 11/11 `UNKNOWN`, her birinde tam 1 `logger.error` | **P1001** |
| S4 `deletePlan(undefined)` (Flight `$undefined`) | `UNKNOWN` | `MissingIdError` (kodsuz) |

Örnek satır:
```
S4 assign→missing tenant (FK): {"ok":false,"code":"UNKNOWN"} | tr="İşlem tamamlanamadı. Tekrar deneyin; sürerse ayrıntı sunucu günlüğündedir." | en="The action could not be completed. …" | log.code=P2003 log.class=PrismaClientKnownRequestError
S5 grantPilotAction: {"ok":false,"code":"UNKNOWN"} | log.code=P1001 … log.class=PrismaClientKnownRequestError
```
Sonuç: gerçek Prisma kodları (P2021/P2039/P2003/P2002/P1001) yalnız log'a gidiyor. Hiçbiri `code` alanına ya da çeviri anahtarına dönüşmüyor. Her dönüşün anahtar kümesi tam olarak `['code','ok']`.

### 2.2 Canlı UI: prod build, gerçek tıklama, tel üstündeki yanıt (`ekler/live-ui.txt`, betik `live-ui.mjs.txt`)
```
-- [tr] arşivle (Plan UPDATE, düz RAISE): plan-notice = "İşlem tamamlanamadı. Tekrar deneyin; sürerse ayrıntı sunucu günlüğündedir."
OK   … expected sentence / no internal text on screen / action response on the wire has no internal text (1 resp, 98 B) — "code":"UNKNOWN"
-- [en] archive …                        OK ×3   — "code":"UNKNOWN"
-- [tr] kamu paketi ata (FK 23503)       OK ×3   — "code":"UNKNOWN"
-- [en] assign public package (FK 23503) OK ×3   — "code":"UNKNOWN"
-- [tr] pilot ver (unique 23505)         OK ×3   (tel gövdesi 0 B okundu, bkz. §4)
-- [en] grant pilot (unique 23505)       OK ×3   — "code":"UNKNOWN"
-- [tr] bilinen ret: plan-notice = "Paketin yayınlanmış sürümü yok; atanamaz."  OK ×3 — "code":"NO_PUBLISHED_VERSION"
-- non-admin: HTTP 404                   OK; editör render edilmedi
OK   Plan basic still public / no assignment / no pilot subscription left / triggers removed
ALL OK
```
- Sızıntı deseni ekranın tamamında ve tel üstündeki action yanıtında arandı: `/crw94|hunter2|tablo=|P[0-9]{4}\b|23503|23505|prisma|invocation|constraint|violat|\{detail\}/i`. Sonuç: 0 eşleşme.
- Ekran görüntüleri (`ekler/`): `tr-archive-unknown.png`, `en-archive-unknown.png`, `tr-assign-fk.png`, `en-assign-fk.png`, `tr-pilot-unique.png`, `en-pilot-unique.png`, `tr-known-refusal.png`, `nonadmin-404.png`.
- Sunucu log'u (`ekler/server-log-excerpt.txt`) ayrıntının kaybolmadığını gösteriyor: `archivePlan failed … P0001 … crw94-internal tablo=Plan` / `code: 'P2039'`, `assignPlan failed … code: 'P2003'`, `grantPilot failed … code: 'P2002'`.

### 2.3 Mutantlar (`ekler/mutants.txt`): her biri uygulandı, hedef testler koşuldu, `git checkout --` ile geri alındı
Hedef testler: `actions.test.ts` + `api-error-body-guard.test.ts`. Sağlam ağaçta 33/33 yeşil.

| # | Mutant | Davranış testi | Bekçi | tsc |
|---|---|---|---|---|
| X1 | archive catch: `{ ...planFailure(e,'archivePlan'), detail: String(e) }` | 3 kırmızı | **`actions.ts: 1`** yakaladı | — |
| X2 | unassign catch: `const why = \`${e}\`; return {…, hint: why}` (türetilmiş değişken) | 3 kırmızı | **`actions.ts: 1`** yakaladı (taint yayılımı) | — |
| X3 | delete catch: `code: errorCode(e) as PlanFailureCode` (kod yarısı, P2002 anahtar olur) | 2 kırmızı | sessiz (beklenen: `errorCode` sanitiser sayılıyor) | **0 hata** (cast gizliyor) |
| X4 | `planFailureCode` `/^P\d{4}$/` kodları da geçirir | 11 kırmızı | sessiz | — |
| X5 | listeye `'P2002'` eklenir | 13 kırmızı (çeviri yok) | sessiz | — |
| X6 | `tenant.ts` `PlatformAdminRequiredError.code` değişir | **33/33 YEŞİL, yaşadı** | sessiz | — |

Değerlendirme:
- Bekçi metin kalıbını yakalıyor. Spread, `String(e)` ve template ile türetilmiş değişken yolları bunun içinde (X1, X2).
- Kod yarısını (X3, X4) bekçi ve tsc görmüyor. Onu yalnız davranış testi tutuyor. be-fb'nin raporundaki tasarım beyanı doğru çıktı.
- X6 yaşadı: bkz. Ö-1. Aynı mutant gerçek-DB probumda S1'i kırdı (`Tests 1 failed`). Yani açık gerçek, yalnız birim testin kör noktası.

### 2.4 Kapılar: dev `2a3900b8`, temiz ağaç (`ekler/gates.txt`)
```
tsc=0
lint=0
i18n=0 ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
build=0
vitest=0
 Test Files  296 passed | 2 skipped (298)
      Tests  3754 passed | 41 skipped (3795)
liveskip=0
```
Tam `npx vitest run` izole `crwfb94-pg` üzerinde koşuldu, CI ortamıyla: `CI=true`, CI'daki `AUTH_SECRET` fikstürü, `DATABASE_URL_RLS_TEST`. DB, CI sırasıyla hazırlandı: `db push` → `db:rls-role` → `apply-migrations.sh` ×2 → `db:rls` → `db:seed`.

## 3. Bulgular (önem sırasıyla)

**Bloke eden: YOK.**

**Ö-1 (öneri, test boşluğu): `actions.test.ts` yetki reddini kendi sahte sınıfıyla kuruyor.**
- Konum: `src/app/[locale]/admin/billing/plans/actions.test.ts:77-79` ve `:27`.
- Senaryo: `tenant.ts:253`'teki `readonly code = 'PLATFORM_ADMIN_REQUIRED'` yeniden adlandırılırsa (X6) 33 test yeşil kalır.
- Üretimdeki etki: admin olmayan her çağrı `UNKNOWN` ("tekrar deneyin") alır ve her seferinde `logger.error` yazar. Operatöre yanlış cümle gider, log gürültüsü oluşur. Güvenlik açığı değil: yazma yine reddedilir.
- Düzeltme: `vi.mock('@/lib/tenant', async (i) => ({ ...(await i()), requirePlatformAdmin: h.admin }))`, sonra `h.admin.mockRejectedValue(new PlatformAdminRequiredError())` ile gerçek sınıf kullanılsın.

**Ö-2 (öneri, düşük): "Prisma kodu anahtar değildir" kuralı yalnız dolaylı olarak kilitli.**
- X5 yalnız çeviri eksik olduğu için kırmızı oldu. Biri `P2002`'yi listeye ve iki kataloğa birden eklerse hiçbir test kırılmaz.
- Düzeltme: çeviri testine tek satır eklenebilir: `expect(code).not.toMatch(/^P\d{4}$|^[0-9A-Z]{5}$/)`, ya da kodların `SCREAMING_SNAKE` olduğunu doğrulayan bir kontrol.

**G-1 (kapsam dışı gözlem, bu diff'ten önce de vardı, ayrı kart önerisi): `setVisibilityAction` görünürlük değerini çalışma anında doğrulamıyor.**
- Yeniden üretim: gerçek DB'de `setVisibilityAction('ultra', 'crw94')` → `{"ok":true}` döndü ve `Plan.visibility` sütununa (`text`) `crw94` yazıldı. Probe bitince `public`'e geri alındı.
- Neden: Flight argümanı TypeScript tipinden bağımsız gelir.
- Etki: Yalnız platform admin'i yapabilir. Plan `public`/`private`/`archived` dışında bir değerle kalır ve satış listelerinden sessizce düşebilir.
- Öneri: `plan-repository.setPlanVisibility` başında `['public','private','archived'].includes(v)` kontrolü; reddedilirse listeli bir kod dönsün (ör. `INVALID_VISIBILITY` + tr/en). Bu kartın kapsamında değil, kod değiştirilmedi.

**N-1 (bilgi, kabul edilmiş sınır):** Bekçi `planFailure`'a adıyla güveniyor (be-fb §4). X3/X4, kod yarısını yalnız `actions.test.ts`'in tuttuğunu gösteriyor. Ö-1 uygulanırsa bu test daha da sağlamlaşır.

**N-2 (bilgi):** Kodsuz düz `Error` ("Plan … not found") artık `UNKNOWN` olarak görünüyor (S4 `createDraft→missing plan`). be-fb §5'teki `PLAN_NOT_FOUND` önerisine katılıyorum: düşük öncelik.

Taranan ama sorun çıkmayan noktalar:
- `logger.warn` bilinen retlerde yalnız `{ code }` yazıyor.
- `planFailureCode` sayı/null/string atılan değerlerde `UNKNOWN` dönüyor (`errorCode` yalnız string `code` okuyor).
- İstemci `t(\`errors.${res.code}\`)` artık parametresiz ve tipli (`PlanFailureCode`).
- `page.tsx` metni yalnız `console.error`'a veriyor.
- Admin olmayan için sayfa `notFound()` → HTTP 404 dönüyor.
- `src/` genelinde `t(\`errors.${…code}\`)` kalıbı tarandı. admin/plans dışındaki kullanımlar tipli kod listeleri üzerinden çalışıyor (topic-stats, accept-invite, documents); bu kartla ilgili ham Prisma kodu yolu bulunmadı.

## 4. Riskler
- Canlı UI'da `[tr] pilot ver` senaryosunda tel gövdesi 0 bayt okundu. Playwright `response.text()` yanıtı sayfa yenilenirken yakalayamamış olabilir. Aynı eylemin `en` koşusunda gövde okundu: 98 B, `"code":"UNKNOWN"`. Ekran kontrolü tr'de de temiz. Aynı eylem gerçek-DB probunda da doğrulandı (S2/S3/S5 `grantPilotAction`).
- Probe'lar `auth()`'u stub'lıyor. Gerçek JWT oturum yolu canlı UI'da ayrıca doğrulandı: admin ve admin olmayan (404).

## 5. Açık sorular
- G-1 için ayrı kart açılsın mı? Önerim: evet, küçük (repository'de enum kontrolü + 1 kod + tr/en + test).
- Ö-1/Ö-2 bu kartın takibi olarak be-fb'ye mi gitsin, yoksa G-1 kartına mı eklensin? Önerim: G-1 kartına eklensin, aynı dosyalar.

## 6. Sonraki adım
- Merge edilmiş haliyle kabul. Ö-1 + Ö-2 + G-1 tek takip kartında toplanabilir.

## Değişen dosyalar
- `docs/agent-results/TASK-MUO9IPPQRL8PM-crw-fb.md` ve `…-crw-fb-ekler/`. Ürün koduna dokunulmadı.

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64). Ortam: prod build + standalone sunucu, headless Chromium (Playwright chromium_headless_shell-1243), izole Docker Postgres (pgvector/pg16). Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. İncelenen kodda platforma bağlı bir yol yok: server action dönüş değerleri, JSON çeviri metinleri, bir React prop tipi ve metin tabanlı bir kaynak bekçisi. Bekçi yolları `/` ile normalize ediyor. Probe ve canlı test düzeneği (`docker exec`, macOS Playwright önbellek yolu) ürün kodu değildir ve yalnız macOS/Linux içindir.
