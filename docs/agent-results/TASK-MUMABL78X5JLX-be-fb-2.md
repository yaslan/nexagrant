# TASK-MUMABL78X5JLX — pilot düzeltme turu (be-fb, 2. rapor)

İnceleme kaynağı: `docs/agent-results/TASK-MUMH7665CD7DQ-crw-fb.md` (İNCELEME-17, karar **DÜZELTME GEREKLİ**).

Commit'ler (dal `dev`, **push yok**):
- `fe021b59`: B-1, Ö-2, Ö-4 ve Ö-3 TODO.
- `9459b5d3`: `rls:bypass-check` baseline kaydı. Kapı `a6b22241`'den beri kırmızıydı, ayrıntı §4-3'te.

`src/lib/tenant.ts`'e dokunulmadı; fe-fb'nin paralel değişikliği çalışma ağacında duruyor.

## 1. Ne yapıldı

| Bulgu | Düzeltme | Dosya |
|---|---|---|
| **B-1** (bloke) | `addBudgetLineByToken`: part okunduktan sonra, `readPartContent`'ten önce `assertTenantWritable(part.tenantId)` çağrılıyor. `PilotExpiredError` gelirse `{ success: false }` dönüyor, bütçe yazılmıyor ve `revalidatePath` çalışmıyor. Başka hatalar yukarı atılıyor. | `src/modules/m11/server/actions.ts` |
| **Ö-2** | (a) `grantPilot` satırı okumadan önce kiracıya özel **transaction advisory lock** alıyor (`lockPilotRow`, anahtar `sha256("billing.pilot:"+tenantId)`, iyzico `advisoryLockKey` ile aynı türetim). `FOR UPDATE` seçilmedi, çünkü ilk atamada kilitlenecek `Subscription` satırı yok. (b) İsteğe bağlı `expectedEndsAt` eklendi: adminin ekranda gördüğü bitiş. Satır bu arada değiştiyse sonuç `stale` oluyor ve hiçbir şey yazılmıyor. Admin paneli, uzatma isteğinde listedeki `endsAt` değerini gönderiyor. Böylece iki sekme aynı pilotu uzatınca **tek uzatma ve tek audit satırı** oluşuyor. Yeni i18n anahtarı: `adminPlans.pilot.outcome.stale` (tr ve en). | `src/lib/billing/pilot.ts`, `admin/billing/plans/{actions.ts,page.tsx,pilot-panel.tsx}`, `messages/{tr,en}.json` (yalnız bu hunk) |
| **Ö-4** | `syncStripeSubscription`: claim'den sonra, **upsert'le aynı transaction'da**, `lockPilotRow` ile pilot kontrolü tekrarlanıyor. Pilotsa `PilotSubscriptionProtected` atılıyor, rollback oluyor, claim de geri alınıyor ve sonuç `PILOT_PROTECTED` dönüyor. Eski autocommit kontrolü hızlı yol olarak kaldı. İptal yolu da aynı kilidi alıyor. | `src/lib/billing/subscription-sync.ts` |
| **Ö-3** | Yalnız TODO eklendi: iyzico upsert'ünün üstünde, Stripe korumasına işaret ediyor. Yol bugün erişilemez: `createIyzicoCheckout` çağıran yok. | `src/lib/iyzico.ts` |

### Oturumsuz ya da token'lı yazma yolu envanteri (B-1 deseniyle tarandı)
Tarama iki listeden yapıldı: `'use server'` dosyalarındaki her dışa aktarılan fonksiyonun kapısı ve `src/app/api/**` altında POST/PUT/PATCH/DELETE dışa aktaran her route.

| Yol | Kimlik | Süresi dolmuş pilota yazar mı? | Durum |
|---|---|---|---|
| `addBudgetLineByToken` (M11 portal `/portal/partner/[token]`) | magic token | **Yazıyordu** | **Düzeltildi** (B-1) |
| `/portal/partner/[token]` sayfası | token | Hayır, yalnız okuyor | Form hâlâ görünüyor ve gönderim `success:false` alıyor. Formun hiç gösterilmemesi UX işi, yapılmadı. |
| Stripe webhook: sync ve iptal | imza | Hayır | Korumalı, artık transaction içinde ve kilitli (Ö-4) |
| Stripe `logInvoicePayment` | imza | Ödeme kaydı yazar | Bilerek kapısız: gerçek bir ödemenin kaydını düşürmek yanlış olur. Pilotta checkout 403 döndüğü için pratikte olay gelmez. |
| iyzico webhook | imza | Korumasız | Erişilemez, TODO (Ö-3) |
| Kayıt (`auth.ts`, `oauth-registration.ts`) + ajans davet kodu kullanımı | oturumsuz | Hayır | Her kayıt **yeni** kiracı açıyor. Kod kullanımı ajans kiracısının kod satırına `SECURITY DEFINER` fonksiyonla yazıyor. Ajans pilotta olmaz (pilot = `public-team`), bu yüzden kapı eklenmedi. |
| Davet linkiyle üyelik | token | — | Kodda davet kabul akışı yok: `Invitation` token ile hiçbir yerde okunmuyor. Üyelik yalnız kayıtta yazılıyor. |
| `/api/v1/*` (API anahtarı) | anahtar | Hayır | Yalnız GET. `ApiKey.lastUsedAt` güncellemesi meta veri. |
| `/api/cagrilar` GET | — | Hayır | Yalnız platform `Topic` önbelleğine yazıyor, kiracı verisi değil. |
| Inngest işleri (`alerts-daily` vb.) | sistem | Sistem yazması | Kullanıcı yazması değil, kapsam dışı. `lastRunAt` gibi alanlar ilerlemeye devam eder. |
| `src/actions/user/*`, `/api/user/*`, `/api/gdpr/delete`, `/api/feedback` | oturum | — | KVKK hakları ve platform geri bildirimi, tasarım gereği açık (crw-fb ile aynı karar). |
| **`admin/billing/actions.ts handleConfigureSso`, `admin/blog/actions.ts`, `admin/cordis/actions.ts`** | **YOK** | SSO: herhangi bir kiracıya yazar | **Pilotla ilgisiz, ayrı güvenlik bulgusu** (§4-1): kart **TASK-MUMJ2ERCFP964** açıldı |

## 2. Kanıt

### 2.1 Testler (canlı DB `fabrika`, ana ağaç, HEAD `9459b5d3` + komşuların commit'lenmemiş işi)
```
pnpm exec vitest run src/lib/billing/pilot.test.ts src/lib/billing/pilot-gates.test.ts
 Test Files  2 passed (2)   Tests  19 passed (19)
pnpm exec vitest run src/lib/billing src/modules/m11 src/app/[locale]/admin/billing tests/stripe-webhook-*.live.test.ts
 Tests  1 failed | 265 passed (266)
   × invoice-writer.test.ts "reconstructs the charged amount exactly…" 6751ms  ← yük altında zaman aşımı; tek başına:
pnpm exec vitest run -t "reconstructs the charged amount" src/lib/billing →  Tests  1 passed | 249 skipped
```
Bu dosyaya dokunmadım. Bir önceki koşuda aynı testin yanında `plan-repository` testleri de kırmızıydı, sonraki koşuda yeşil çıktılar. Aynı DB'de o sırada komşu ajanların testleri de koşuyordu.

Yeni testler:
- `pilot-gates.test.ts` → **"the partner portal token cannot write into an expired pilot; a running one can"**. Oturum yok. Süresi dolmuş pilotta `addBudgetLineByToken` sonucu `{ success:false }` ve bütçe `[]`. Uzatmadan sonra `success:true` ve 1 satır.
- `pilot.test.ts` → **"two concurrent first grants write one pilot and one audit row"**: `Promise.all` ile yapılan iki çağrıdan biri `granted`, diğeri `unchanged` dönüyor, 1 audit satırı yazılıyor.
- `pilot.test.ts` → **"two concurrent extensions from the same screen extend once, with one audit row"**: sonuçlar `extended` ve `stale`, bitiş +90 gün (+180 değil), 1 `billing.pilot.extended` satırı.
- `pilot.test.ts` → **"a grant landing after the Stripe fast-path read is still caught inside the sync transaction (Ö-4)"**: deterministik yarış. Test pilot kilidini tutup commit'lenmemiş bir pilot satırı yazıyor. Sync'in hızlı yolu bu satırı görmüyor ve transaction'a giriyor. `pg_locks` sorgusu sync'in kilitte beklediğini gösterince test commit ediyor. Sonuç `PILOT_PROTECTED`, satır pilot olarak kalıyor ve `StripeEventLog` 0 (claim geri alındı).
- `subscription-sync-tenant-scope.test.ts`: tx sahtesine `$executeRaw` stub'ı eklendi (kilit). "İlk ifade claim" iddiası değişmedi ve geçiyor.

### 2.2 Mutasyon kanıtı (izole worktree, `cp -cR node_modules` + kendi `prisma generate`; her satırda tek dosya değişti, ardından `git checkout`, `dirty: ''`)
Koşu `fe021b59` üzerinde yapıldı:
```
M0 baseline                                   => Tests  29 passed (29)
M1 portal gate off [files changed:1]          => 1 failed  × the partner portal token cannot write into an expired pilot…
M2 grant lock off [files changed:1]           => 2 failed  × two concurrent first grants… × two concurrent extensions…
M3 expectedEndsAt check off [files changed:1] => 1 failed  × two concurrent extensions from the same screen…
M5 sync in-tx lock off [files changed:1]      => 1 failed  × a grant landing after the Stripe fast-path read… (Ö-4)
M6 sync fast path off (kontrol)               => 29 passed  ← transaction içi koruma tek başına yetiyor
M4 sync in-tx guard off [files changed:1]     => × … (Ö-4) kırmızı
```
M4 koşusu sırasında komşu kart TASK-MULQLL2T8ZJX4 dev DB'yi `magicToken → magicTokenHash` şemasına göç ettirdi. Bu yüzden o koşuda portal testi de ortam nedeniyle kırmızıydı.

Aynı kart `587a50e0` ile portal testimi `magicTokenHash: hashSecretToken(...)` kullanacak şekilde uyarladı. **M1 bu HEAD üzerinde tekrar koşuldu:**
```
587a50e0 baseline                 => Tests  29 passed (29)
M1 portal gate off (587a50e0)     => Tests  1 failed | 4 passed (5)   × the partner portal token cannot write into an expired pilot…
```

### 2.3 Kapılar
| Kapı | Sonuç |
|---|---|
| `npx tsc --noEmit` | **Benim dosyalarımda hata yok.** Koşu anında ağaçta komşuların commit'lenmemiş işinden hatalar vardı: `magicTokenHash`/`tokenHash` (henüz commit'lenmemiş token-hash işi, sonra `587a50e0` ile geldi) ve `k2-cordis/importer.ts` `skipped` tipi. |
| `npx eslint` (değişen 10 dosya) | exit 0 |
| `pnpm i18n:check` | Katalog paritesi ve anahtarlar temiz. Tek kırmızı: `opportunities/[id]/application/client.tsx` literal sayısı 38→39. Komşunun commit'lenmemiş değişikliği, benim dosyam değil. |
| `pnpm rls:check` | ✅ |
| `pnpm rls:bypass-check` | ✅ `9459b5d3` sonrası: "no new tenant bypass… 33 on the sanctioned cross-tenant path". Öncesinde ❌ `src/lib/billing/pilot.ts listPilots`, bkz. §4-3. |

### 2.4 Canlı tarayıcı: **koşulamadı**
- Paylaşılan :3000 sunucusu (cwd ana ağaç) `magicTokenHash` göçünden sonra portal sayfasına **404** döndü. Bellekteki Prisma client eski şemada kalmış olabilir; başkasının sunucusu olduğu için yeniden başlatmadım.
- Kendi izole worktree'mden (`587a50e0`) :3107'de `next dev` açtım. Portal sayfası **200** döndü: süresi dolmuş crw-fb kiracısında kendi eklediğim `befb-part-b1live` parçası ve bilinen bir token ile.
- Formu gönderen headless Chromium komutunu AgentSpace **kill-guard kancası** ("canlı app açıkken e2e/duman koşumu, Murat onayı gerekli") durdurdu. Onay istenmedi ve bypass edilmedi.
- DB'de bütçe `[]` kaldı, ama gönderim gerçekleşmediği için bu kanıt sayılmaz.
- :3107 sunucumu (yalnız kendi pid'im) kapattım, test parçasını sildim ve worktree'yi kaldırdım.
- **Canlı B-1 yeniden denemesi crw-fb'de** (rapor §7'deki plan). Not: token artık hash'li saklandığı için crw-fb'nin eski ham token'ı göç sonrası da çalışır (yerinde hash'lendi).

## 3. Değişen dosyalar
- `fe021b59`:
  - `src/modules/m11/server/actions.ts`
  - `src/lib/billing/pilot.ts`, `src/lib/billing/subscription-sync.ts`, `src/lib/iyzico.ts`
  - `src/lib/billing/pilot.test.ts`, `src/lib/billing/pilot-gates.test.ts`, `src/lib/billing/subscription-sync-tenant-scope.test.ts`
  - `src/app/[locale]/admin/billing/plans/{actions.ts,page.tsx,pilot-panel.tsx}`
  - `messages/{tr,en}.json`: yalnız `stale` hunk'ı `git update-index` ile stage'lendi, fe-fb'nin `common.pilotExpired` satırı çalışma ağacında bırakıldı (commit sonrası `git diff` ile doğrulandı).
- `9459b5d3`: `scripts/tenant-bypass-baseline.json`
- Bu rapor.

## 4. Riskler / yan bulgular
1. **Güvenlik (pilottan bağımsız):** `admin/billing/actions.ts handleConfigureSso` oturum ya da rol kontrolü yapmıyor, `tenantId`'yi istemciden alıp yalın `prisma.tenant.update` ile **herhangi bir kiracının** `settings.sso` alanını yazıyor. `admin/blog` ve `admin/cordis` action'ları da kontrolsüz. Server action'ları admin layout'u korumaz. Kod okumayla bulundu, istismar denenmedi. → **TASK-MUMJ2ERCFP964** (todo, öncelik 2).
2. `grantPilotAction` artık üçüncü, isteğe bağlı bir parametre alıyor. Parametre verilmezse (eski çağıranlar) staleness kontrolü yapılmıyor ve davranış öncekiyle aynı. Kilit her durumda alınıyor.
3. **Önceki raporumdaki (`-be-fb.md` §2.3) "`rls:bypass-check` ✅" satırı yanlıştı.** `listPilots` system-scope çağrısı baseline'da hiç yoktu (`git log -S` boş), kapı `a6b22241`'den beri kırmızıydı. crw-fb incelemesi de bunu yakalamadı. `9459b5d3` ile düzeltildi.
4. Advisory lock anahtarları iyzico olay kilitleriyle aynı `bigint` uzayında. `sha256` ve farklı önek ile çakışma olasılığı ihmal edilebilir.
5. Portal formu süresi dolmuş pilotta hâlâ görünüyor ve gönderim sessizce `success:false` alıyor. Kullanıcıya açıklayıcı mesaj göstermek UX işi, yapılmadı.

## 5. Açık sorular
- Ö-2 için "aynı ekrandan iki uzatma = tek uzatma" yorumunu seçtim. Bilerek art arda yapılan iki uzatma (sayfa yenilendikten sonra) +180 gün verir ve iki audit satırı yazar. Beklenen bu mu? (patron / lider)
- Ajans davet kodunu kullanmak ajans kiracısına yazıyor. Ajanslar ileride pilota alınırsa bu yola da kapı gerekir.

## 6. Sonraki adım
- **crw-fb:** B-1'i canlıda yeniden denesin (süresi dolmuş kiracı `cmumi0obu002tndxk0l2l4m48`, `crwfb-part-mumi0mfa`). Beklenen: bütçe 1 satırda kalmalı. Ö-2 ve Ö-4 için testleri ve mutasyon satırlarını gözden geçirsin.
- **TASK-MUMJ2ERCFP964:** admin action kapıları.
- Ö-3: iyzico checkout açıldığı gün TODO uygulanacak.

**Platform beyanı:** Doğrulama **mac** üzerinde yapıldı (Darwin 27, Node 26.5, Docker `fabrika-postgres`, vitest 4.1.11). Değişiklikler sunucu tarafı TS ve Postgres (`pg_advisory_xact_lock`, `pg_locks`). Süreç, dosya yolu, kabuk ya da ekran bağımlılığı yok, bu yüzden Windows ve Linux'ta aynı davranış beklenir. Bu makinede yalnız macOS olduğu için Windows ve Linux'ta **koşulamadı**. Canlı tarayıcı gönderimi mac'te de koşulamadı (§2.4).
