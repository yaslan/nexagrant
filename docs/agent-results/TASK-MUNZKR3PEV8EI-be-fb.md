# TASK-MUNZKR3PEV8EI — admin plan eylemleri: iç hata metni ve Prisma kodu arayüze gitmesin (be-fb)

**Durum:** TAMAM
**Dal:** `be-fb/munzkr-admin-plan-errors` (dev'den), dev'e merge edildi, push yok.
**Kaynak:** İNCELEME-75 takip kartı; bkz. `TASK-MUNY0O53ITDU4-be-fb.md` §4.

## 1. Ne yapıldı

**Önceki durum.** `toFailure(e)` şunu dönüyordu: `{ ok:false, code: e.code ?? 'UNKNOWN', detail: errorMessage(e) }`. Arayüz de `t('errors.<code>', { detail })` gösteriyordu. İki sorun vardı:
- Hata metni platform admin ekranına gidiyordu: `UNKNOWN` cümlesi `{detail}` taşıyordu.
- Prisma'nın `P2002`/`P2039` kodu çeviri anahtarı oluyordu. `adminPlans.errors.P2002` diye bir anahtar yok.

**Yapılanlar:**
1. **`src/app/[locale]/admin/billing/plans/failure-codes.ts` (yeni).**
   - `PLAN_FAILURE_CODES`: 6 plan-repository kodu, `PILOT_OVER_CONTRACT`, `PLATFORM_ADMIN_REQUIRED` ve `UNKNOWN`.
   - `planFailureCode(e)`: listedeki kodu ya da `UNKNOWN` döner.
   - Bu dosya ayrı tutuldu, çünkü `'use server'` modülü yalnız async fonksiyon dışa aktarabilir; istemci ve test de listeyi okuyor.
2. **`actions.ts`.**
   - `toFailure` yerine `planFailure(e, '<eylem>')` geldi. Dönüşü tam olarak `{ ok:false, code }`, `detail` alanı yok.
   - `UNKNOWN` durumunda hatanın tamamı `logger.error('[admin/plans] <eylem> failed', e)` ile log'a gider.
   - Bilinen bir ret (PLAN_IN_USE vb.) `logger.warn` ile yalnız kodu yazar.
   - `ActionResult`'ın `code` alanı artık `PlanFailureCode` tipinde.
   - 11 catch'in hepsi bu yoldan geçiyor.
3. **`client.tsx` ve `pilot-panel.tsx`.** `t('errors.${code}')` çağrısı `detail` parametresi olmadan yapılıyor.
4. **`messages/tr.json` ve `messages/en.json`.** `adminPlans.errors.UNKNOWN` sabit bir cümle oldu, `{detail}` kaldırıldı:
   - tr: "İşlem tamamlanamadı. Tekrar deneyin; sürerse ayrıntı sunucu günlüğündedir."
   - en: "The action could not be completed. Try again; if it persists, the details are in the server log."
5. **Kartta olmayan ek bulgu (aynı sınıf, aynı ekran), düzeltildi.** `page.tsx`, sayfa okuma hatasında `errorMessage(e)`'yi istemciye veriyordu ve istemci bunu mono yazıyla basıyordu. Canlı koşuda ekranda şu göründü: "Invalid \`prisma.$executeRaw()\` invocation: Raw query failed … `enter_system_scope`". Düzeltme: `loadError` artık `boolean`, metin yalnız log'da. Bir metnin geri dönmesini tip engelliyor (M9).
6. **Bekçi.**
   - `KNOWN_ACTION_LEAKS`'ten admin plan satırı (11) silindi.
   - `SANITISERS` listesine `'planFailure'` eklendi (tek kelime).
   - Temiz-biçim öz-testine bir satır eklendi.
   - Bekçi `planFailure`'a adıyla güveniyor. Ne döndüğünü `actions.test.ts` sabitliyor: yorum iki dosyada da bunu söylüyor.
7. **`actions.test.ts` (yeni, 27 test).**
   - Dışa aktarılan her eylem kapsanıyor (liste `Object.entries(actions)` ile karşılaştırılıyor, eksik ya da fazla eylem kırmızı olur).
   - 11 eylemin her biri için: Prisma P2002 hatası `toStrictEqual({ok:false, code:'UNKNOWN'})` döner, gövdede P2002 ya da şema adı geçmez ve hata log'a gider.
   - 11 eylemin her biri için: admin olmayan çağıran `PLATFORM_ADMIN_REQUIRED` alır, başka bir alan dönmez.
   - 7 alan hatası sınıfının her biri kendi kodunu döner ve bu kod listede bulunur.
   - Yabancı kod (`ECONNREFUSED`), sayı ya da string atıldığında sonuç `UNKNOWN` olur.
   - tr/en'de her kodun bir cümlesi var ve hiçbiri parametre almıyor.

**Bekçi hakkında not (kartın "bekçi bu kalıbı yakalıyor mu" sorusu):** Kaynak bekçisi bu kalıbın **metin** yarısını zaten yakalıyordu. 11 satırlık sayılı listenin var olma nedeni buydu. **Kod** yarısını ise kaynak taraması genel olarak yakalayamaz. `errorCode(e)` ve `e.code` bekçide temiz sayılıyor, çünkü bir kod metin taşımaz. Bir kodun geçerli bir çeviri anahtarı olup olmadığı dosyaya özgü bir sorudur. Bu yüzden bu yarıyı davranış testi (M2, M6, M8) ile kilitledim, bekçiyi genişletmedim. Böylece crw-fb'nin m8 işiyle çakışma yüzeyi küçük kaldı.

## 2. Kanıt

### 2.1 Canlı: gerçek tarayıcı, prod build (standalone), izole DB (`ekler/live-ui.txt`, betik `live-ui.mjs.txt`)
- **Ortam.** İzole DB `befb-kr-vt` (pgvector:pg16, 127.0.0.1:55479) CI sırasıyla hazırlandı: `db push` → `db:rls-role` → `apply-migrations.sh` iki kez ("40 files applied" ×2) → `db:rls` (28→112) → `db:seed`.
- **Oturum.** Platform admin `demo-user-superadmin` için JWT çerezi kullanıldı. Çerez yazdırılmadı; `isPlatformAdmin` DB'den okunuyor.
- **Hata tetikleme.** Hatalar yalnız izole DB'de trigger ve tablo adı değiştirme ile kuruldu, her senaryodan sonra geri alındı.

```
-- [tr] görünürlük (UPDATE hata tetikleyicisi): plan-notice = "İşlem tamamlanamadı. Tekrar deneyin; sürerse ayrıntı sunucu günlüğündedir."
OK   [tr] görünürlük (UPDATE hata tetikleyicisi): expected sentence
OK   [tr] görünürlük (UPDATE hata tetikleyicisi): no internal text on screen
-- [en] visibility (UPDATE fault trigger): plan-notice = "The action could not be completed. Try again; if it persists, the details are in the server log."
OK   ... (en ×2)
-- [tr] taslak oluştur (INSERT unique_violation): plan-notice = "İşlem tamamlanamadı. …"
OK   ... (tr ×2)   -- [en] create draft … OK ×2
-- [tr] load failure: plans-load-error = "Paketler okunamadı (veritabanına ulaşılamıyor)."
OK   [tr] load failure: no internal text on screen
-- [en] load failure: plans-load-error = "Plans could not be read (the database is unreachable)."
OK   [en] load failure: no internal text on screen
OK   Plan ultra still public
OK   no draft left on ultra
OK   triggers removed
ALL OK            (13/13; birleşik ağacın build'inde tekrar koşuldu, exit 0)
```

- **Sızıntı deseni.** Ekranın tamamında şu desen arandı: `/befbkr|tablo=|kolon=|P20\d\d|23505|prisma|invocation|constraint|Unique|\{detail\}/i`. Sonuç: 0 eşleşme.
- **Ekran görüntüleri** (`ekler/`): `tr-visibility-unknown.png`, `en-visibility-unknown.png`, `tr-createdraft-unique.png`, `en-createdraft-unique.png`, `tr-load-error.png`, `en-load-error.png`.
- **Sunucu log'u** (`ekler/server-log-excerpt.txt`). Ayrıntı log'da duruyor. Gerçek Prisma kodları da görülüyor: görünürlükte `P2039`, taslakta **`P2002`**. Eski kodda ekranın `adminPlans.errors.P2002` anahtarını araması tam olarak bu durumdu.
  ```
  [ERROR] [admin/plans] setVisibility failed Error [PrismaClientKnownRequestError]:
  Database error. Code: `P0001`. Message: `befbkr-internal-detail: tablo=Plan kolon=visibility`
    code: 'P2039',
  [ERROR] [admin/plans] createDraft failed Error [PrismaClientKnownRequestError]:
    code: 'P2002',
  [AdminPlansPage] DB query failed: …
  ```

### 2.2 Mutantlar (`ekler/mutants.txt`): 9/9 öldü
| # | Mutant | Sonuç |
|---|---|---|
| M1 | `planFailure` yeniden `detail` döner | 24 kırmızı |
| M2 | ham `errorCode(e)` döner (P2002 anahtar olur) | 12 kırmızı |
| M3 | UNKNOWN log'a yazılmaz | 11 kırmızı |
| M4 | tek bir catch `detail: e.message` döner | 4 kırmızı; **bekçi de** `actions.ts: 1` diyor |
| M5 | `planFailure` SANITISERS'tan çıkar | 2 kırmızı |
| M6 | listeden `PLAN_IN_USE` silinir | 1 kırmızı |
| M7 | tr UNKNOWN'a `{detail}` geri gelir | 1 kırmızı |
| M8 | en'den `PLAN_IN_USE` anahtarı silinir | 1 kırmızı |
| M9 | `page.tsx` metni geri verir | tsc TS2322 |

### 2.3 Kapılar: birleşik ağaç (dev `dc2e6fd9` dala merge edildikten sonra, `ekler/gates.txt`)
```
tsc=0
lint=0
i18n=0          (✅ i18n check passed: both catalogs agree …)
liveskip=0      (scripts/check-live-skips.ts; yalnız izinli atlamalar)
build=0         (next build, standalone)
Test Files  295 passed | 2 skipped (297)
Tests  3691 passed | 41 skipped (3732)
vitest=0
```
Tam `npx vitest run` izole `befb-kr-vt`'de `CI=true` ve CI'daki `AUTH_SECRET` fikstürü ile koşuldu. Paylaşılan `fabrika` :5433'e bağlanılmadı. Merge öncesi dal ağacında da aynı sonuç alındı: 3688 geçti / 0 kırmızı, build=0.

## 3. Değişen dosyalar
- `src/app/[locale]/admin/billing/plans/failure-codes.ts` (yeni)
- `src/app/[locale]/admin/billing/plans/actions.ts`
- `src/app/[locale]/admin/billing/plans/actions.test.ts` (yeni)
- `src/app/[locale]/admin/billing/plans/client.tsx`
- `src/app/[locale]/admin/billing/plans/pilot-panel.tsx`
- `src/app/[locale]/admin/billing/plans/page.tsx`
- `messages/tr.json`, `messages/en.json` (yalnız `adminPlans.errors.UNKNOWN`)
- `tests/api/api-error-body-guard.test.ts`, `tests/api/response-status-scan.ts` (tek kelime + yorum)
- `docs/agent-results/TASK-MUNZKR3PEV8EI-be-fb.md` ve `…-ekler/`

## 4. Riskler
- **crw-fb ile beklenen çakışma (TASK-MUNZ7N9IT8VPY).** crw-fb'nin dalı `KNOWN_ACTION_LEAKS` bloğundaki m8 satırını ve yorumunu siliyor, ben admin satırını ve yorumunu sildim. İkinci merge eden aynı hunk'ta küçük bir çakışma görecek. Doğru sonuç: yorumda iki takip notu kalır, harita `{}` olur. `SANITISERS` satırına crw-fb de bir ad eklerse o satır da çakışır; iki adı birden tutmak yeterli.
- **Bekçi `planFailure`'a adıyla güveniyor.** Başka bir dosyada aynı adla metin döndüren bir fonksiyon yazılırsa bekçi bunu görmez. Bunu `SANITISERS`'taki diğer adlar (`errorCode`, `failureCode`…) için de kabul edilmiş bir sınır olarak bıraktım. Bu dosyadaki davranışı test kilitliyor.
- **Bilinen retler `logger.warn` ile yalnız kodu yazıyor, mesajı yazmıyor.** Mesajlarda yalnız plan, sürüm ve kiracı kimlikleri var, kişisel veri yok; kod çeviriyi zaten veriyor. UNKNOWN'da hatanın tamamı log'a gidiyor. Prisma P2002 mesajı alan adlarını içerir, değerleri içermez.
- **Düz `Error` hataları UNKNOWN olarak görünüyor.** `plan-repository.ts` içindeki "Plan … not found" ve "Plan version … not found" bu gruba giriyor. Önceden metinleri ekranda görünüyordu, artık genel cümle görünüyor. Yalnız platform admin'i etkiler; ayrıntı log'da.

## 5. Açık sorular
- "not found" için ayrı bir sınıf ve kod (`PLAN_NOT_FOUND`) istenir mi? Bu değişiklik `plan-repository.ts`'e dokunur ve bu kartın kapsamı dışında. Öneri: DÜŞÜK öncelik, gerekirse ayrı kart.

## 6. Sonraki adım
- crw-fb m8 dalını merge ederken §4'teki çakışma notuna göre `KNOWN_ACTION_LEAKS = {}` olarak çözsün.
- İnceleme (crw-fb): özellikle `planFailure`'ın adıyla güvenilmesi ve bunun `actions.test.ts` ile kilitlenmesi.

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64). Prod build + standalone sunucu, headless Chromium (Playwright), izole Docker Postgres (pgvector/pg16). Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. Değişen kodda platforma bağlı bir yol yok: yalnız server action dönüş değerleri, JSON çeviri metinleri ve bir React prop tipi değişti. Bekçinin yol eşleştirmesi `rel()` ile `/`'ye normalize ediliyor (önceki kart), bu yüzden Windows'ta da aynı anahtarla eşleşir. Canlı test düzeneği (`live-ui.mjs`: `docker exec`, macOS Playwright önbellek yolu) ürün kodu değildir ve yalnız macOS/Linux içindir.
