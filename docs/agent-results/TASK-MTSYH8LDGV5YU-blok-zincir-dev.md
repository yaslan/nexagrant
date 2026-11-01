# TASK-MTSYH8LDGV5YU — F-1 (SEV-1): the LLM adapter's database writes are refused by RLS in production

**Ajan:** DEV-EN (DevOps) · **Tarih:** 2026-09-08 · **Branch:** dev
**Durum:** F-1 DÜZELTİLDİ ve gerçek RLS rolüyle uçtan uca doğrulandı. Kartın bağımlılığı (llm.ts'te
commit'lenmemiş birleştirme) **artık yok** — `b6f1642` ile commit'lenmiş, kart bu noktada eskimişti.

---

## 1. Ne yapıldı

### 1.1 Kartın bağımlılığı eskimişti — engel değildi

Kart "bu kart delege EDİLMEZ" diyordu çünkü `src/lib/llm.ts`'te TASK-MTSXGXBCJ007W Faz 1'in
**commit'lenmemiş** bir birleştirmesi duruyordu. `git status` bunu yalanlıyor: dosya temiz, birleştirme
`b6f1642 refactor(k6-ai): one LLM adapter, so one call has one price` ile inmiş. Kredi formülü kararı
bu kartın dokunduğu satırlarla kesişmiyor — F-1 **nereye yazıldığını** düzeltiyor, **ne kadar
ücretlendirildiğini** değil. `creditsForUsage`'a dokunulmadı.

### 1.2 Kök neden doğrulandı — ve kartın söylediğinden GENİŞ

Kart yalnız `embedText`'i adlandırıyordu. `src/lib/llm.ts`'te RLS'e tabi **üç** erişim vardı ve
üçü de `withTenant` dışındaydı:

| # | Yer | Ne yapıyordu | Üretimde sonucu |
|---|---|---|---|
| 1 | `getCreditBalance` (satır 279) | `prisma.creditLedger.aggregate` | **Sessizce `0` döndürüyordu** |
| 2 | `generateCompletion` (satır 311) | çıplak `prisma.$transaction` | `AiUsageLog` INSERT → 42501 |
| 3 | `embedText` (satır 460) | `prisma.aiUsageLog.create` | INSERT → 42501 (kartın bildiği) |

**#1 en kötüsü ve kartta hiç yok.** `USING ("tenantId" = current_setting('app.tenant_id', true))`
sarmalayıcı dışında her satır için NULL'dır, yani tablo **boş okunur** — hata fırlatmaz. Ve
`getCreditBalance` `generateCompletion`'ın **ilk** adımı:

```
balance = 0  →  throw new Error('Insufficient AI credits. Please purchase more credits or upgrade your plan.')
```

Yani üretimde `AiUsageLog` yazma hatası **hiç görülmezdi**: 500 kredisi olan bir kiracı, sağlayıcıya
hiç ulaşmadan "krediniz bitti, satın alın" mesajı alırdı. M2, M6, M7, M9, M10 ve konsept not ekranı —
`generateText`/`generateCompletion` kullanan **her YZ özelliği** ölü, üstelik yanıltıcı bir
faturalandırma mesajıyla. Bu bir loglama kusuru değil, ürünün YZ katmanının tamamen çalışmaması.

### 1.3 Düzeltme

Üç erişim de `withTenant` içine alındı — yeni bir mekanizma icat edilmedi, `src/lib/db.ts:99`'daki
mevcut sarmalayıcı kullanıldı (reuse > icat):

- `getCreditBalance` → `withTenant(tenantId, tx => tx.creditLedger.aggregate(...))`
- `generateCompletion` → `withTenant(options.tenantId, ...)` (tek transaction: usage + ledger birlikte)
- `embedText` → `withTenant(scope, tx => tx.aiUsageLog.create(...))`, `scope = tenantId ?? '__platform__'`

`import { prisma }` tamamen kalktı: bu dosya artık global istemciyi **hiç** görmüyor.

Platform kapsamı (`__platform__`) da aynı sarmalayıcıdan geçiyor. Politika yabancı anahtar değil
**string** karşılaştırıyor, dolayısıyla `app.tenant_id = '__platform__'` WITH CHECK'i tam olarak
karşılıyor — ölçüldü (§2.2 adım 4).

### 1.4 Kural artık testin kendisinde

`@/lib/db` mock'u yalnızca `withTenant` export ediyor; `prisma` export'u **kasten yok**. Biri global
istemciye dönerse süit kırmızıya döner — üretimde ilk dağıtımda değil. Buna ek olarak kapsamın
**doğru kiracı** olduğunu ölçen davranışsal testler eklendi (+7 test, 1416 → 1423).

---

## 2. Kanıt (gerçek komut çıktısı)

Bütün ölçümler `fabrika_app` rolüyle: `rolsuper=false, rolbypassrls=false`. Yerel `fabrika` rolü
SUPERUSER+BYPASSRLS olduğu için onunla yapılan hiçbir "çalışıyor" iddiası geçerli değildir.

### 2.1 ÖNCESİ — `docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/e2e-before.txt`

Gerçek `embedText`/`generateCompletion` fonksiyonları, `DATABASE_URL` = fabrika_app, sağlayıcı stub:

```
llm.ts connection role: {"usr":"fabrika_app","rolbypassrls":false}
=== 1. getCreditBalance (a 500-credit row exists) ===
     -> balance = 0
=== 2. generateCompletion — usage row + ledger row ===
     -> THREW Error: Insufficient AI credits. Please purchase more credits or upgrade your plan.
=== 3. embedText — tenant scope ===
     -> THREW AiUsageLogWriteError: Embedding call completed but its AiUsageLog row could not be written
=== 4. embedText — platform scope (shared CORDIS corpus) ===
     -> THREW AiUsageLogWriteError: …
=== 5. what actually landed in the database ===
    ledger: [{"delta":500,"reason":"probe:grant"}]
    AiUsageLog rows written: 0  (expected 3)
```
Altta yatan sürücü hatası: `P2039 / 42501 new row violates row-level security policy for table "AiUsageLog"`.

### 2.2 SONRASI — `…-evidence/e2e-after.txt` (aynı komut, aynı rol)

```
=== 1. getCreditBalance ===        -> balance = 500
=== 2. generateCompletion ===      -> returned 1 credit(s) charged
=== 3. embedText — tenant scope ===   -> vector of 1536 dims
=== 4. embedText — platform scope ===  -> vector of 1536 dims
=== 5. what actually landed in the database ===
    {"tenantId":"<tenant>","module":"M2","purpose":"concept_note_draft","inputTokens":4000,"credits":1}
    {"tenantId":"__platform__","module":"K6","purpose":"cordis_ingest_embedding","inputTokens":137,"credits":0}
    {"tenantId":"<tenant>","module":"K6","purpose":"rag_ingest_embedding","inputTokens":137,"credits":0}
    ledger: [{"delta":500,"reason":"probe:grant"},{"delta":-1,"reason":"usage:M2"}]
    AiUsageLog rows written: 3  (expected 3)
```
Prob betiği kanıt klasöründe (`f1-e2e-probe.mts`); tek kullanımlık kiracı `finally`'de siliniyor.

### 2.3 İzolasyon BOZULMADI — düzeltme kapıyı açmadı

Ayrı bir prob (`withTenantOn` ile, aynı rol):
```
D1 tenant scope   withTenant(tenantId)                                  -> INSERT SUCCEEDED
D2 platform scope withTenant("__platform__")                            -> INSERT SUCCEEDED
D3 cross-tenant   withTenant("other") writing tenantId  [MUST stay blocked]
                                                                        -> BLOCKED [P2039] 42501
```
Çapraz kiracı yazma **hâlâ reddediliyor** — yani düzeltme politikayı gevşetmiyor, ona uyuyor.

### 2.4 Yeni testler ESKİ kodda GERÇEKTEN kırmızı

Yapısal kapı (global istemciye dönüş):
```
$ git show HEAD:src/lib/llm.ts > src/lib/llm.ts && npx vitest run src/lib/llm.{embed,generate}.test.ts
 ⎯⎯⎯ Failed Tests 32 ⎯⎯⎯
 Error: [vitest] No "prisma" export is defined on the "@/lib/db" mock.
```

Davranışsal kapı — sarmalayıcı doğru, **kapsam yanlış** (iki mutasyon):
```
324:  await withTenant("tenant_1", …)                      # sabit kiracı
479:  await withTenant(attribution.tenantId ?? "somewhere-else", …)   # yanlış platform kapsamı

 × opens the platform scope for a platform-scoped call, matching the row it writes
 × scopes to the tenant that was passed, not to a hardcoded one
      Tests  2 failed | 38 passed (40)
```
Yalnız o iki test düştü, diğer 38'i yeşil kaldı: testler gürültülü değil, **hedefli**.

### 2.5 Tam kapı

```
$ pnpm gate ; echo GATE_EXIT=$?
 Test Files  121 passed | 2 skipped (123)
      Tests  1423 passed | 8 skipped (1431)      # önce 1416 idi: +7
✅ i18n check passed
✅ SUCCESS: All 43 tenant-scoped models have RLS policies registered.
✅ 43 kiracıya özel tabloda … izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
GATE_EXIT=0
```

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/llm.ts` | `import { prisma }` → `import { withTenant }`; `getCreditBalance`, `generateCompletion`, `embedText` üçü de `withTenant` içine alındı (+42/−21) |
| `src/lib/llm.generate.test.ts` | mock yalnız `withTenant` export ediyor (`prisma` kasten yok); +4 kapsam testi |
| `src/lib/llm.embed.test.ts` | aynı mock sıkılaştırması; +3 test (kiracı kapsamı, platform kapsamı, RLS reddi → `AiUsageLogWriteError`) |
| `docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/` | e2e öncesi/sonrası çıktı, prob betiği, global-istemci taraması |

Şema değişikliği **yok**, migration **yok**, `prisma/rls.sql` **değişmedi**, `creditsForUsage`
**değişmedi**. Sır repoya girmedi (bağlantı dizeleri yalnız kabuk ortamında, kanıt dosyalarında rol
adı var, parola yok).

## 4. Geri alma

```bash
git revert <bu-commit-sha>
```
Tek commit, şema/veri yan etkisi yok — prob geçici kiracısını kendi temizliyor, kalıcı satır yazılmadı.
**Ama:** geri almak, YZ katmanını üretimde tekrar tamamen çalışmaz hale getirir (§2.1). Geri alınacaksa
yerine bir koruma konmalı, yoksa SEV-1 geri döner.

**İzleme/uyarı:** `pnpm rls:verify` zaten `pnpm gate`'in parçası ve `fabrika_app` rolüyle gerçek ölçüm
yapıyor — bu kart onu değiştirmedi. Üretimde izlenecek sinyal: `AiUsageLogWriteError` ve
`Insufficient AI credits` oranı. İkincisi bugüne kadar bir **faturalandırma** metriği sanılıyordu;
aslında bu hatanın maskesiydi — uyarı eşiği kurulurken bu bilinmeli.

## 5. Riskler

1. **F-1 bu dosyada kapandı, ama sınıfı repoda AÇIK.** Tarama
   (`…-evidence/global-client-scan.txt`): kiracıya özel tablolara global istemciyle **39 yazma**
   ve **52 okuma** var — `pipeline/actions.ts` (opportunity create/update), `feedback/submit.ts`,
   `billing/subscription-sync.ts`, `inngest/jobs/*` (kredi ayı devri, uyarılar, kullanıcı silme),
   `actions/user/*` (auditEvent). Bugün görünmüyorlar çünkü `DATABASE_URL` SUPERUSER+BYPASSRLS bir
   rolle koşuyor. **Uygulamanın bağlantısı `fabrika_app`'e alındığı gün bunların hepsi F-1 olur** —
   yazanlar 42501, okuyanlar sessizce boş. Bu kartın kapsamı `src/lib/llm.ts` olduğu için
   dokunmadım; ayrı kart açılmalı ve **canlıya geçişten önce** kapatılmalı.
2. **Hepsi `withTenant` ile çözülmez.** Admin ekranları, webhook senkronu ve cron işlerinin çoğunda
   bir kiracı bağlamı yok — bunlar ya ayrıcalıklı bir rol ya da dar kapsamlı `SECURITY DEFINER`
   ister. Toplu bir `sed` yanlış olur; tasarım kararı gerekir.
3. **`AiUsageLog.tenantId` hâlâ `String` (non-null).** `'__platform__'` bir kaçamak; doğrusu
   `String?` + politikada NULL dalı. Şema bu kartın kapsamı dışındaydı (TASK-MTSWVADF7RQ1B'nin de
   dışındaydı) — hâlâ açık teknik borç.
4. `getCreditBalance` artık bir transaction açıyor (önce çıplak sorguydu). `generateCompletion`
   çağrı başına 2 transaction kullanıyor. Ölçülen etki yok; ama `generateCompletion` bir
   `withTenant` bloğunun **içinden** çağrılırsa iç içe transaction olur. Bugünkü tek çağrı yeri
   (`concept-notes/actions.ts:124`) sarmalayıcının **dışında** — kontrol edildi.

## 6. Açık sorular

1. **Uygulamanın `DATABASE_URL`'i ne zaman `fabrika_app`'e geçecek?** F-1 ancak o zaman gerçek bir
   yayın bloklayıcıydı; bugün üretim rolü hâlâ BYPASSRLS ise F-1 canlıda henüz patlamıyor olabilir.
   Bu tarih Risk #1'in aciliyetini belirler. (`prisma/rls-app-role.sql`: "Switching the app's main
   connection to this role is a separate, later task." — o kart hangisi?)
2. Risk #2 bir tasarım kararı istiyor: kiracısız yazmalar (cron, webhook, admin) hangi mekanizmadan
   geçecek — ayrıcalıklı rol mü, `SECURITY DEFINER` fonksiyon mu?

## 7. Sonraki adım

- Risk #1 için ayrı kart: kiracıya özel tablolara global istemciyle erişen 91 çağrı yerinin
  taranması ve sınıflandırılması (kiracı bağlamı var → `withTenant`; yok → tasarım kararı).
- Açık soru #1 yanıtlanana kadar bu bulgunun **aciliyeti** kesinleşmiyor; F-1'in kendisi kapandı.
