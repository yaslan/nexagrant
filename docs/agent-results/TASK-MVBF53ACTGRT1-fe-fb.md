# TASK-MVBF53ACTGRT1 (FO-15) — /partners/leaders: locale'e uygun para biçimi — fe-fb

**Hüküm:** BAŞARILI. PR dev'e açıldı, merge edilmedi.
**Dal:** `fe-fb/fo15-leaders-money`. Taban: `origin/dev` `7f8d3de4`.
**Platform beyanı:** macOS (Darwin 27.0.0) üzerinde doğrulandı. Gerçek tarayıcı: Playwright + Desktop Chrome. Windows ve Linux'ta koşulmadı, çünkü bu makinede yoklar. Değişen kod sunucu bileşeni ve `Intl.NumberFormat`. Platforma bağlı bir kod yolu (dosya yolu, süreç, kabuk) yok. Çıktı, Node ve Chrome'un ICU/CLDR verisine bağlı; bu veri platformdan bağımsız. CI Linux'unda aynı birim testleri koşacak.

## Ne yapıldı
1. `src/lib/money.ts` dosyasına `formatWholeMoney(amountWhole: bigint | number, currency, locale)` eklendi (kartta tercih edilen yol, (a)). Fonksiyon `Intl.NumberFormat(locale, { style: 'currency', minimumFractionDigits: 0, maximumFractionDigits: 0 })` kullanır.
   - `bigint` değer `Intl`'e doğrudan verilir ve `Number`'a çevrilmez. Böylece `MAX_SAFE_INTEGER` üstündeki toplamlarda da hane kaybı olmaz. Kart "güvenli aralıkta Number, dışında BigInt" diyordu; `Intl` her BigInt'i tam biçimlediği için dalı kaldırdım, sonuç aynı ve daha basit.
   - `number` değer güvenli tamsayı değilse fonksiyon hata atar, yuvarlamaz.
2. `partners/leaders/page.tsx:147` satırındaki `{numberFormat.format(Number(org.totalEcContribution))} €` ifadesi `{formatWholeMoney(org.totalEcContribution, 'EUR', locale)}` ile değiştirildi. Küresel liste dalında para gösterimi yok, o dala dokunulmadı.
3. Etiket (`ecContributionLabel`: "Koordine Edilen AB Katkısı:" / "EU Contribution Coordinated:") birim içermiyor. Çift birim oluşmuyor, bu yüzden `messages/*` dosyalarına dokunulmadı.
4. Testler:
   - `src/lib/money.test.ts`: tr, en, 0, `9007199254740993n` ve 20 haneli BigInt için tam metin kontrolü; float ya da güvensiz `number` verilince hata atması.
   - `tests/partners-leaders-page-money.test.tsx`: yeni sayfa testi. tr ve en'de biçimli tutarı kilitler ve `/\d €/` kalıbının çıktıda olmadığını doğrular.
   - `tests/e2e/partners-leaders-topic.spec.ts`: fikstürdeki 150000 EUR için tr'de `€150.000`, en'de `€150,000` beklentisi eklendi.

### Kartla bir sapma: tr biçimi
Kart tr için "1.234.567 €" bekliyordu. CLDR'nin `tr` para deseni `¤#,##0.00`, yani simge başta. `Intl` (Node ve Chrome) bu yüzden **`€1.234.567`** üretiyor. Repoda bu davranış zaten testle sabit: `formatMoney(128_800,'USD','tr')` → `$1.288,00` (`money.test.ts:84`). Testler bu yüzden CLDR çıktısını kilitliyor. Sondaki simge isteniyorsa locale'e özel bir `formatToParts` kuralı gerekir; bunu ürün kararı olarak açık sorulara yazdım.

## Kanıt (ham çıktı)

**Birim ve sayfa testleri**
```
src/lib/money.test.ts, tests/partners-leaders-page-money.test.tsx, tests/partners-leaders-page-error.test.tsx
 Test Files  3 passed (3)
      Tests  34 passed (34)
```

**Mutant 1 (sayfa testi):** eski satır geri konunca test kırmızıya döndü, geri alınınca yeşile döndü.
```
     × renders the total in the tr money format
     × renders the total in the en money format
Expected: ">€1.234.567<"
Received: "...<span class="font-semibold text-ink">1.234.567 €</span>...<span class="font-semibold text-ink">9.007.199.254.740.992 €</span>..."
      Tests  2 failed (2)
--- git checkout -- page.tsx ---
      Tests  2 passed (2)
```
Ek bulgu: eski satır `Number(bigint)` kullandığı için `9007199254740993` değerini `…992` olarak basıyordu. Yeni yardımcı tam değeri basıyor.

**Mutant 2 (e2e):** origin/dev'deki `page.tsx` ve yeni spec ile koşuldu.
```
  ✘  1 … lists the coordinator of the prefix, not the participant (tr)
  ✘  2 … lists the coordinator of the prefix, not the participant (en)
  ✓  3 … an invalid prefix shows the message and no list
    Locator: getByText('€150.000', { exact: true })   Expected: visible
    Locator: getByText('€150,000', { exact: true })   Expected: visible
  2 failed
```

**e2e (yeni kod, izole DB):**
```
  ✓  1 … (tr) (2.4s)
  ✓  2 … (en) (863ms)
  ✓  3 … an invalid prefix shows the message and no list (838ms)
  3 passed (9.4s)
```

**İzole DB:** Kendi container'ımı açtım: `docker run --name fo15-pg -p 55415:5432 pgvector/pgvector:pg16`. Hazırlık CI ile aynı sırada yapıldı: `psql` (`/opt/homebrew/bin/psql`) ile `supabase-ensure-rls.sql` → `prisma db push` → `db:rls-role` → `db:rls` → `apply-migrations.sh` ×2 → `db:rls` → `db:seed` (exit 0). Worktree'de `.env` yok; `DATABASE_URL` yalnız bu container'ı gösteriyordu. Paylaşılan `fabrika` DB'sine yazılmadı ve `migrate reset` çalıştırılmadı. `next dev` 3115 portunda açıldı (Playwright webServer).

**Tam CI vitest:** `CI=true AUTH_SECRET=… perl -e 'alarm 1800;exec @ARGV' pnpm exec vitest run --reporter=default --reporter=json …`
```
 Test Files  350 passed | 2 skipped (352)
      Tests  4582 passed | 54 skipped (4636)
live-skip gate: 59 live files, 506 live tests passed, 44 allowed skip(s)   (exit 0)
```
Skipped testler ve nedenleri (hepsi ortamdan kaynaklı, CI'daki davranışla aynı; hiçbiri bu değişiklikle ilgili değil):

| Dosya | Sayı | Neden |
|---|---|---|
| evidence-confirm-store-faults.live | 22 | `EVIDENCE_S3_TEST_*` tanımlı değil (S3 yok), izinli skip |
| evidence-upload-s3.live | 21 | Aynı neden |
| k1-embeddings.live | 1 | Gerçek OpenAI anahtarı yok, izinli skip |
| k1-daily-calls, adapters, sedia-adapter | 4+2+2 | `RUN_LIVE_ADAPTER_TESTS` tanımlı değil (gerçek dış API; CI'da da tanımlı değil) |
| user-erasure-object-store | 2 | S3 test deposu yok |

**Statik kapılar:**
```
pnpm lint       → 0 error, 4 warning (hepsi dokunulmayan dosyalarda: invitations/accept.ts, concept-template-tenant.ts, settings-profile-update.test.ts; origin/dev'de de var)
pnpm typecheck  → temiz
pnpm i18n:check → ✅ i18n check passed: … no file gained hard-coded text.
pnpm rls:check  → ✅ SUCCESS
```

**Sabit `€` kontrolü:**
```
$ git grep -n "} €" -- src/app
(boş, rc=1)
```

**Ekran görüntüleri** (gerçek tarayıcı, izole DB, `/{tr,en}/main/partners/leaders?topic=FO5E2E-CL5-`), `docs/agent-results/TASK-MVBF53ACTGRT1-screenshots/` altında:

| | Önce (origin/dev) | Sonra |
|---|---|---|
| tr | `before-tr.png`: "150.000 €" | `after-tr.png`: "€150.000" |
| en | `before-en.png`: "150,000 €" | `after-en.png`: "€150,000" |

## Değişen dosyalar
- `src/lib/money.ts`: `formatWholeMoney` eklendi
- `src/lib/money.test.ts`
- `src/app/[locale]/(app)/[workspace]/partners/leaders/page.tsx`: 1 import, 1 satır
- `tests/partners-leaders-page-money.test.tsx`: yeni dosya
- `tests/e2e/partners-leaders-topic.spec.ts`: tutar beklentisi eklendi
- `docs/agent-results/TASK-MVBF53ACTGRT1-*`: bu rapor ve ekran görüntüleri

Veri birimi, sorgu (`coordinator-leaders.ts`), API (`totalEcContributionEur`), Prisma şeması ve CORDIS içe aktarıcısı değişmedi (`git diff origin/dev --stat`'ta yalnız yukarıdaki dosyalar var).

## Riskler
- Düşük. Değişiklik yalnız gösterimde ve tek bir satırda.
- tr kullanıcısı artık "€150.000" görüyor. Bu CLDR standardı, ama kartın beklediği biçim değil (açık soru 1).

## Açık sorular
1. tr için simge sonda mı olmalı ("150.000 €")? Repodaki `formatMoney` tr'de de simgeyi başa koyuyor (`$1.288,00`). Ürün sondaki simgeyi isterse bu tüm `money.ts` gösterimini etkileyen ayrı bir karar olur.
2. Kapsam dışında aynı desen başka yerlerde de var. Yeni kart önerisi:
   - `partners/[pic]/page.tsx:150,185`: `€ {Number(x).toLocaleString()}`. Locale verilmediği için sunucu locale'iyle biçimleniyor.
   - `partners/page.tsx:307,359`: `isTr ? … : …` ve `€ ${…toLocaleString()}`.

   İkisi de `formatWholeMoney` ile düzeltilebilir.

## Sonraki adım
PR incelemesi. Açık soru 2 için takip kartı.
