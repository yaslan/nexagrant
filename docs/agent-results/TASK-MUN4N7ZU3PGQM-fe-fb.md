# TASK-MUN4N7ZU3PGQM — FB İNCELEME-40 · fe-fb

Kod ya da belge değiştirilmedi. İncelenen HEAD: `dev` @ `13c40556` (içinde `362ee353`, `dd7d3a33`, `267acaa6`).

| Kart | Commit | Karar |
|---|---|---|
| TASK-MUN3W76B4XEJE (be-fb): konsorsiyum `findCandidates` pilot kapısı | `362ee353` | **ONAY** (test boşluğu Ö-1) |
| TASK-MUN2PNAR729H8 (cs-fb): SMTP kararı | `dd7d3a33` (+ `267acaa6` düzeltmesi) | **ONAY** |
| TASK-MUN2UXWTAX1AQ (cs-fb): barındırma Vulut + SMTP son karar | `267acaa6` | **DÜZELTME GEREKLİ**, yalnız belge (B-1, B-2) |

## 1) Ne yapıldı

### Kart 1: TASK-MUN3W76B4XEJE
- **M8 düzeltmesi (`261c3b88`) ile aynı kalıp mı?** Evet.
  - M8'de `computeSeatCandidates` `readOnly` bayrağını bırakmıştı. Burada da `findCandidates` bayrağı bırakıyor ve `requireTenantAction()` varsayılan kapısını kullanıyor.
  - İki yol da ret durumunda aynı cümleyi (`Common.pilotExpired`) gösteriyor. Tek fark iletim biçimi: M8 form durumunda `code: 'pilotExpired'` döndürüyor, konsorsiyum ise `try/catch` ile digest'i `refuse` → `useActionErrorText`'e veriyor. Bu fark, `addSeat` ve `assignSeat`'in zaten kullandığı yolla tutarlı.
- **Kapı transaction'dan önce mi?** Evet. `consortium/actions.ts:58`'de `requireTenantAction()` ilk satırda. `isPresentId`, iki `withTenant` okuması ve `scoreCandidatesForSeat` (içinde `seatCandidate.deleteMany` + `create`, `src/lib/scoring/consortium.ts:104,107`) bu satırdan sonra geliyor. Bunu M-A mutantıyla kanıtladım (§2.1).
- **`pipeline/[id]/**` altında kapısız yazma yolu kaldı mı?** Kalmadı. Kendi taramamın sonuçları:
  - `consortium/actions.ts`: `addSeat` ve `assignSeat` varsayılan kapıdan geçiyor. `getConflicts` `readOnly`; çağırdığı `detectConflicts` (`consortium.ts:191-`) içinde create/update/delete/upsert/executeRaw yok.
  - `page.tsx`: `computeG0ForOpportunity` (`g0-compute.ts:324-350`) persist etmiyor. Yazan `persistG0` (`:410`) yalnız `gates/evaluate.ts` ve `rescoreOpportunityG0` içinden çağrılıyor, sayfadan değil.
  - `consortium/page.tsx`: tek yazma `recordAlert`. Bu, sorgu hatasında düşen bir sistem gözlem satırı, kiracı verisi değil.
  - `client.tsx` ve `effort.tsx`: `../actions`'ı çağırıyor. Oradaki 8 yazma action'ının (`createOpportunity`, `assignOpportunityOwner`, `addOpportunityNote`, `moveOpportunityStage`, `evaluateOpportunityGate`, `archiveOpportunity`, `logEffort`, `declareApplication`) hepsinde `assertTenantActionWritable`, ilk DB çağrısından önce ve `sessionScope()`'un hemen ardından geliyor. Kapısız iki action, `getOpportunityFormMembers` ve `getSuggestedTopics`, yalnız okuma yapıyor.
- **2 mutant** (§2.1) ve **gerçek tıklama** (§2.2), kendi süresi dolmuş test pilotumda. :3000 kapalıydı (`lsof` boş, curl 000). Bu yüzden izole DB'ye bağlı kendi `next dev -p 3342` sürecimi kullandım. Paylaşılan `fabrika` DB'sine dokunulmadı.

### Kart 2: TASK-MUN2PNAR729H8 + TASK-MUN2UXWTAX1AQ
- Patronun son kararı: SMTP `mail.fonbridge.com`, gönderici `info@fonbridge.com`, canlı alan adı `fonbridge.com`, barındırma Vulut (Türkiye), yurt dışı aktarım yalnız Anthropic, OpenAI ve Google OAuth. Bu kararı envanter §2/§14/§17/§18/§21/§22, VERI-YERLESIMI 1.2, SECURITY_COMPLIANCE, HUKUK-SORULARI 1.11 ve ILKADIM-PILOT R3 ile karşılaştırdım.
- Belgelerdeki iddiaları kodla karşılaştırdım: `src/lib/email/mailer.ts`, `src/lib/env.ts`, `.env.example` (HEAD sürümü), `src/lib/feedback/*` ve `src/lib/app-url.ts`.

## 2) Kanıt

### 2.1 Kart 1: mutantlar (temiz worktree, HEAD `13c40556`, her biri `git checkout` ile geri alındı)
```
baseline  tests/pipeline-actions-pilot-digest.test.ts + tests/pilot-expired-write-paths.test.tsx → Tests 25 passed (25)
M-A  findCandidates: requireTenantAction({ readOnly: true }) + assertTenantActionWritable,
     okumalardan SONRA ama skorlayıcıdan ÖNCE (ret yine var, digest yine var; yalnız sıra bozuk)
     → × findCandidates · Tests 1 failed | 24 passed           ÖLDÜ ("the database must not be reached")
M-B  manager.handleFindCandidates: setActionError(null) silindi (eski hata temizlenmiyor)
     → Tests 25 passed (25)                                    YAŞADI → Ö-1
```
M-A şunu kanıtlıyor: kilit testi yalnız reddi değil, kapının ilk DB erişiminden önce çalıştığını da sabitliyor.

### 2.2 Kart 1: gerçek tıklama (Playwright + sistem Chrome, izole DB, `next dev -p 3342`)
Kurulum:
- Konteyner `fefb-mun4n` (`pgvector/pgvector:pg16`, `:55441/fefb40`).
- `prisma db push`, sonra `apply-migrations.sh` iki kez (34/34, rc=0), sonra `db:rls-role` → `fabrika_app` `rolbypassrls=f`, sonra `db:rls` (28 → 112 politika), sonra `db:seed`.
- `demo-tenant` Subscription: `provider=pilot`, `TRIALING`, `trialEndsAt=now()-1dk`.
- Koltuk `demo-seat-opp1-research`'e iki satır eklendi: `fefb40_c1` ve `fefb40_c2`.

Akış: `/…/login` (çerez diyaloğu → e-posta `alice@fabrika.test` → Enter) → `/…/main/pipeline/demo-opp-1/consortium` → `data-testid=m8-builder-seat-research` içindeki "Aday Bul"a tıklama.

Sunucu logu doğru koltuğu gösteriyor:
```
POST /tr/main/pipeline/demo-opp-1/consortium 500 … └─ ƒ findCandidates("demo-seat-opp1-research")
```
```
expired-tr : önce fefb40_c1|1|20:30:17.904 · fefb40_c2|2|20:30:17.904
             alert "Pilot süresi doldu, düzenleme kapalı. Uzatma için yöneticinize başvurun."
             sonra fefb40_c1|1|20:30:17.904 · fefb40_c2|2|20:30:17.904   ← aynı (computedAt dahil)
expired-en : alert "The pilot has ended, so editing is off. Ask your administrator to extend it."
             sonra aynı iki satır, aynı computedAt
CANLI MUTANT (dev kopyasında readOnly: true geri): alert "" · önce 2 satır → sonra []   ← bulgu birebir geri geliyor; geri alındı
aktif pilot (trialEndsAt +10 gün, düzeltme yerinde): alert "" · 2 satır → []  (skorlayıcı çalıştı; izole DB'de CORDIS profili yok)
pageerror: hiçbir koşuda yok
```
Kareler `docs/agent-results/TASK-MUN4N7ZU3PGQM-fe-fb/` altında: `expired-tr-{1-before,2-after}.png`, `expired-en-…`, `mutant-…`, `active-…` (8 png). `expired-tr-2-after.png`'de pilot cümlesi görünüyor ve listelenmiş iki aday ekranda kalıyor.

Kendi satırlarımı tek tek id ile ekledim (`fefb40_c1`, `fefb40_c2`). Koşudan sonra `select count(*) … where id like 'fefb40_%'` sonucu 0. Konteynerin tamamı zaten bana aitti ve sonunda silindi.

### 2.3 Kart 1: tam süit (yalnız izole DB)
```
DATABASE_URL / DATABASE_URL_MIGRATE / DATABASE_URL_RLS_TEST → hepsi :55441/fefb40 ; AUTH_SECRET yerel değer
Tenant önce: 1
 Test Files  228 passed | 2 skipped (230)
      Tests  2677 passed | 8 skipped (2685)      rc=0
Tenant sonra: 1
tests/consortium-find-candidates-pilot.live.test.ts ayrıca → Tests 2 passed (2)
```
İlk koşu `AUTH_SECRET` olmadan yapılmıştı ve 2640/45 skip verdi: `invitation-accept.live` (17) ile `oauth-registration.live` (20) `AUTH_SECRET` yokken kendini atlıyor. Bu koşu sayılmadı.

### 2.4 Kart 2: usfinbridge taraması (HEAD)
```
$ /usr/bin/grep -rn "usfinbridge" docs --exclude-dir=agent-results
docs/legal/privacy-notice-gap-analysis.md:214   info@usfinbridge.com — kodda gömülü (PublicFooter.tsx:135)      ← iptal notu YOK
docs/legal/privacy-notice-gap-analysis.md:237   usfinbridge.com (info@, demo@, noreply@ — src/lib/env.ts:49 …)  ← iptal notu YOK, satır numarası bayat (bugün :98)
docs/legal/privacy-notice-gap-analysis.md:413   grep komutu örneği                                              ← zararsız
docs/legal/processing-register.md:399,428       "koddaki varsayılan noreply@usfinbridge.com (env.ts:98), eski alan adı — kararla uyuşmuyor, kod işi" / "usfinbridge.com göndericisi geçersizdir"  ← iptal notu ✓
docs/legal/HUKUK-SORULARI-2026-09.md:342        kod varsayılanı + "karar info@fonbridge.com"                     ← iptal notu ✓
docs/SECURITY_COMPLIANCE.md:103                 "önceki usfinbridge.com göndericisi geçersiz"                    ← iptal notu ✓
```
Sonuç: ölçüt ("yalnız iptal notları kalmalı") **tam karşılanmıyor**. Nedeni `privacy-notice-gap-analysis.md` (B-1).

### 2.5 Kart 2: belge ↔ kod
- `mailer.ts:71`'deki `from: SMTP_FROM || \`${PRODUCT_NAME} <${NEXT_PUBLIC_SMTP_FROM_ADDRESS}>\`` ifadesi, belgelerdeki "gönderici `SMTP_FROM` ya da `NEXT_PUBLIC_SMTP_FROM_ADDRESS`" iddiasıyla uyuşuyor. ✓
- `env.ts:98` `default('noreply@usfinbridge.com')` gerçekten var. ✓ Belgeler bunu "eski alan adı, kod işi" olarak işaretlemiş.
- `mailer.ts:6-11`, SMTP ayarlarının yalnız ortamdan geldiğini söylüyor. ✓
- `env.ts:43-45`, `JOBS_DATABASE_URL` yoksa `DATABASE_URL` kullanılıyor. ✓ (register §21'deki Vulut satırı)
- `FEEDBACK_DIGEST_TO` (`env.ts:72`, `digest-run.ts:121`) §14'teki iddiayla uyuşuyor. ✓ §14 göndericiyi doğrudan yazmıyor, §21'e işaret ediyor (tek kaynak).
- `app-url.ts:16` `CANONICAL_APP_URL = 'https://fonbridge.com'` "canlı alan adı `fonbridge.com`" iddiasıyla uyuşuyor. ✓
- `.env.example` (HEAD): `SMTP_HOST/PORT/SECURE/USER/PASS` mevcut. `SMTP_FROM="Fabrika <no-reply@example.com>"` bir örnek değer, `:131` ise yorum satırında `noreply@usfinbridge.com`. Belgeler "kurulumda `SMTP_FROM` verilmeli" diyor, yani çelişki yok (Ö-3).
- Eski sağlayıcı adayları (Vercel, Neon, Supabase, Fly.io, "patron belirleyecek", "sağlayıcı açık") bu 5 belgede ya üstü çizili ya da "seçilmedi" notuyla geçiyor. Açık kalan bir kalıntı bulunmadı.
- Yurt dışı aktarım: VERI-YERLESIMI §2'ye göre "yurt dışına giden üç akış" Anthropic, OpenAI ve Google; bu patron kararıyla birebir aynı. Stripe (`src/app/api/billing/checkout`, webhook kodda duruyor) ve Cloudflare R2 (`src/lib/storage.ts`) ise belgelerde ayrıca ve dürüstçe yazılı (Ö-2).

## 3) Kararlar ve bulgular

### Kart 1: TASK-MUN3W76B4XEJE → **ONAY**
1. Kalıp M8 ile aynı. Kapı ilk satırda, ilk `withTenant` ve skorlayıcıdan önce (M-A ile kanıtlandı).
2. `pipeline/[id]/**` altında kapısız yazma yolu yok (§1'deki tarama).
3. Canlı tıklama tr ve en: ret var, satırlar birebir aynı. Canlı mutant 2 → 0 sonucu, testin gerçekten bir şeyi ölçtüğünü gösteriyor.
- **Ö-1 (test boşluğu, engelleyici değil):** M-B yaşadı. `handleFindCandidates`'e eklenen `setActionError(null)` hiçbir testte sabitlenmemiş. Kullanıcı etkisi: pilot uzatıldıktan sonra aynı oturumda yapılan başarılı bir "Aday Bul", eski pilot cümlesini ekranda bırakırdı. Önerilen test: ret → pilot aktif → tekrar tıkla → `alert` yok.

### Kart 2a: TASK-MUN2PNAR729H8 → **ONAY**
- `dd7d3a33`'teki `info@usfinbridge.com` göndericisi, `267acaa6` ile son karara çekildi. SMTP modeli (kendi sunucu, ayrı bir işleyen yok, barındırma kapsamında) kodla uyumlu (§2.5).

### Kart 2b: TASK-MUN2UXWTAX1AQ → **DÜZELTME GEREKLİ** (yalnız belge)
- **B-1:** Görevin tarama ölçütü karşılanmıyor. `docs/legal/privacy-notice-gap-analysis.md:214,237`, `usfinbridge.com`'u bugünkü kimlik gibi anlatıyor ve iptal notu yok. `:237`'deki `src/lib/env.ts:49` referansı da bayat (bugün `:98`). **Düzeltme:** iki satıra "29.09.2026: canlı alan adı `fonbridge.com`, gönderici `info@fonbridge.com`; `usfinbridge.com` iptal (register §17 md.17)" notu eklenmeli ve satır numarası güncellenmeli. `:413` bir grep örneği, olduğu gibi kalabilir.
- **B-2:** `docs/kamu/VERI-YERLESIMI.md:50`, sitenin altbilgisindeki "🇪🇺 Frankfurt & Istanbul Data Centers" ifadesi (`src/components/PublicFooter.tsx:149`) için hâlâ yalnız "doğrulanmadı" diyor. Oysa barındırma kararı (Vulut, yalnız Türkiye) bu ifadeyle artık **çelişiyor**: Frankfurt'ta bir veri merkezi yok. Belediyeye verilecek sayfa bu farkı açıkça söylemeli. **Düzeltme:** "kararla çelişir, altbilgi kodda düzeltilecek" diye yazılmalı ve bir kod kartına bağlanmalı.

### Ortak açık noktalar (karar engeli değil)
- **Ö-2:** Patronun cümlesi "yurt dışı aktarım yalnız Anthropic, OpenAI, Google OAuth". Belgeler ise Stripe'ı (ABD, kodda duruyor, pilotta ödeme yok) ve bölgesi doğrulanmamış R2'yi ayrıca listeliyor. Kod açısından doğru olan bu. Patron Stripe'ın canlıda kapalı kalacağını ya da R2 bölgesini teyit ederse liste kısalır; o zamana kadar mevcut yazım doğru.
- **Ö-3 (kod işi, belge değil):** Karar kodda henüz yok:
  - `env.ts:98` varsayılanı `noreply@usfinbridge.com`.
  - Kamuya açık her sayfada görünen iletişim adresi `PublicFooter.tsx:135` `info@usfinbridge.com`.
  - Demo koltuk `demo@usfinbridge.com` (`auth.ts:84`, `AuthCard.tsx:37`; yalnız yerel demo).
  - `.env.example:128/131`'de `fonbridge.com` önerilmiyor.

  Register yalnız `env.ts:98`'i "kod işi" diye işaretlemiş, altbilgi adresi hiçbir kartta görünmüyor. Ayrı bir kod kartı önerilir. Not: çalışma ağacında başka bir ajanın commit'lenmemiş `.env.example`, `README.md` ve `src/lib/env.ts` değişiklikleri ile izlenmeyen `docs/SMTP-SUNUCU.md` var (muhtemelen TASK-MUN2PKA5AG2IV). Ben yalnız HEAD'i inceledim, bunlara dokunmadım.
- **Ö-4:** Kök risk be-fb'nin de yazdığı gibi sürüyor: `readOnly` doğrulanmayan bir söz. Aynı sınıfta üçüncü bir bulgu çıkmaması için se-fb'nin Ö-4 bekçi kartı önerisini destekliyorum.

## 4) Değişen dosyalar
- `docs/agent-results/TASK-MUN4N7ZU3PGQM-fe-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUN4N7ZU3PGQM-fe-fb/*.png` (8 kare)

Kod ya da belge değişmedi. Mutantlar ve `turbopack.root` yalnız geçici worktree'de uygulandı ve geri alındı. Worktree silindi.

## 5) Riskler
- Canlı tıklama `next dev` üzerinde yapıldı. Üretim build'inde digest'in tarayıcıya ulaştığı ayrıca koşulmadı; bu risk İNCELEME-17 ve 24'ten devralındı.
- B-2 kapanana kadar belediyeye gösterilen belgede Frankfurt ifadesi yalnız "doğrulanmadı" olarak kalıyor, oysa gerçekte kararla çelişiyor.

## 6) Sonraki adım
- cs-fb: B-1 ve B-2 (yalnız belge).
- Yeni kod kartı: `usfinbridge` → `fonbridge` (env varsayılanı, altbilgi adresi, demo koltuk, `.env.example`) ve altbilgideki Frankfurt ifadesi (Ö-3, B-2).
- Test kartı (küçük): Ö-1'in regresyon testi.

## Görev şablonu notu
Wrapper'daki "KANIT ZORUNLU" satırı `/Users/macbook/alan/docs/agent-results/TASK-MUN3W76B4XEJE-be-fb.md` yolunu veriyor. Bu yol incelenen görevin (be-fb) raporuna ait ve repo dışında. O dosyaya yazılmadı, çünkü be-fb'nin raporunun üzerine yazmak olurdu. Görevin kendi SONUÇ DOSYASI yolu bu dosya.

## Platform beyanı
Doğrulama **mac** üzerinde yapıldı: Darwin 27, Node 26.5, Next 16 `next dev`, Docker `pgvector/pgvector:pg16`, Playwright ve sistem Chrome. İncelenen kod bir TS server action (`requireTenantAction`) ve bir React istemci bileşeni. Süreç, dosya yolu, kabuk, kısayol ya da DPI bağımlılığı yok. Koda bakıldığında Windows ve Linux'ta davranış aynı olmalı. **Windows ve Linux koşulamadı**, çünkü makinede yalnız macOS var. Kart 2 yalnız belge incelemesi, platformdan bağımsız.
