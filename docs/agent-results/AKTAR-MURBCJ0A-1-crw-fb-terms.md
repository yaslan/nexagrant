# AKTAR-MURBCJ0A-1#review-terms · crw-fb: kullanım şartları yeniden yazımının incelemesi

**Hüküm:** DEĞİŞİKLİK İSTE. Teknik taşıma doğru: metin i18n'e geçti, `isTr` kalmadı, sürüm aynı commit'te arttı, yalnız `legal.terms.*` değişti ve testler yeşil. Ancak 12 maddeden 5'i koddaki davranışla çelişiyor ya da kodda karşılığı olmayan taahhüt içeriyor (D-1..D-5). Yazarın raporundaki "UYDURMA YOK" iddiası bu yüzden doğru değil.

**Tip:** review (yalnız inceleme; kod değiştirilmedi)
**Platform:** mac (darwin). Değişiklik yalnız metin ve sunucu tarafında render edilen bir Next.js sayfası; platforma bağlı kod yolu yok, Windows ve Linux'ta davranış aynı olur. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var.

İncelenen: dal `cs-fb/terms-rewrite`, commit `5683d61e` (4 dosya), ağaç `/Users/macbook/alan/FONBRIDGE-wt-csfb-terms`. Metin hukukçu onayına tabi bir taslak. Burada yalnız teknik doğruluk ve uydurma-yok denetimi yapıldı.

---

## 1. Ne yapıldı

- Commit diff'i satır satır okundu: `messages/{tr,en}.json` içinde `legal.terms`, `src/app/[locale]/terms/page.tsx` ve `src/lib/legal/consent-documents.ts`.
- Yazarın raporu okundu (`docs/agent-results/AKTAR-MURBCJ0A-1-cs-fb-terms.md`, commit'lenmemiş). İstenen "madde ↔ dosya:satır" eşlemesi raporda **yok**. Bu yüzden 12 maddenin her birini koda karşı kendim eşledim (§2.1).
- Testler, typecheck ve lint kendim koştum. TR/EN sayfayı gerçek dev sunucusunda açtım ve tarayıcıda render ettim.
- explor-fb'nin `explor-fb/privacy-recipients` dalıyla birleşme denendi.

## 2. Kanıt

### 2.1 Madde ↔ kod eşlemesi (12 maddenin tamamı)

| # | Metindeki iddia | Kod gerçeği | Sonuç |
|---|---|---|---|
| 1 | "Kullanıcı hesabı **e-posta ve şifre** ile açılır" | `docs/adr/ADR-0006-oauth-only-sign-in.md` ("Üretimde tek giriş yolu Google OAuth'tur. Şifre ya da e-posta bağlantısıyla giriş yoktur"); `src/lib/auth.ts:366-379` (yalnız `Google(...)`, `Credentials` sadece `demoLoginEnabled` ise) | **YANLIŞ → D-1** |
| 1 | Basic/Pro/Ultra, koltuk limiti, e-posta daveti | `src/lib/billing/catalog.test.ts:78` (`'basic','pro','ultra'`), `src/app/api/invitations` | doğru |
| 2 | İçerik Anthropic ve OpenAI'a iletilir | `src/lib/llm.ts:24,31` (`'anthropic' \| 'openai'`, varsayılan anthropic). explor-fb dalındaki `legal.privacy.recipientsBody` ile tutarlı | doğru |
| 3 | Kabul edilebilir kullanım, askıya alma | genel hüküm; kodla çelişen bir şey yok | — |
| 4 | İlk 20 için ömür boyu lisans | `src/lib/billing/lifetime-licence.ts:2` ("first 20 companies") | doğru (terim farkı: Ö-5) |
| 4 | "Fiyat değişiklikleri **30 gün önceden** bildirilir" | kodda ve kararlarda karşılığı yok (`/usr/bin/grep -rn "30 days\|30 gün" src/lib` → yalnız webhook ve davet temizliği) | **UYDURMA → D-4** |
| 4 | Krediler "faturalama döneminde" yenilenir | `src/lib/jobs/tasks/credits-monthly-grant.ts`: **aylık** dağıtım (yıllık planda da) | küçük sapma → Ö-4 |
| 5 | 14 gün iade, kupon ve ömür boyu dahil | `messages/tr.json:1416` / `en.json:1416` `refundNote` | içerik aynı, TR cümle yapısı kayıyor → D-3b |
| 5 | "iade talebini **faturalama portalından** başlatabilirsiniz", "**5–10 iş günü**" | `src` içinde iade akışı yok (`grep -rn -i refund src` → yalnız `PricingClient.tsx:504,627`, `CartDrawer.tsx:322` notları ve `invoice-writer.ts:363` yorumu). Portal = `stripe.billingPortal.sessions.create` (`src/lib/billing/create-portal-session.ts:28`): abonelik ve ödeme yönetimi için, iade için değil | **YANLIŞ + UYDURMA → D-3** |
| 6 | Pilot bitince yazma durur | `src/lib/billing/pilot.ts:17-21` ("read-only after the end — `assertTenantWritable`"), `PILOT_DAYS = 90` (`:48`) | doğru |
| 7 | 30 gün bekleme, geri çekilebilir | `src/actions/user/request-deletion.ts:12-20` (`DELETION_GRACE_PERIOD_DAYS = 30`, iptal edilebilir) | doğru |
| 7 | "30 gün sonra **tüm veriler** silinir" | `src/lib/jobs/tasks/users-scheduled-deletion.ts:104-125`: kiracı dosyaları **bilerek** kalıyor ("The files go when their tenant is deleted"), `aiUsageLog` silinmiyor, anonimleştiriliyor | **ABARTI → D-5** |
| 8 | "Davet koduyla kayıt yapan kullanıcı **ajansın ortak portalına erişim** kazanır (ADR-0006)", "portal üzerinden yönetilir" | `prisma/schema.prisma:52-55`: kod yalnız `Tenant.agencyId`'yi kayıtta bir kez yazar, "grants the agency no read on this tenant's rows". ADR-0006 OAuth kararı, ajans portalı değil | **YANLIŞ → D-2** |
| 9 | "Ajansın paylaştığı **davet kodu** `/portal/partner/[token]` portalına erişim sağlar" | `src/app/[locale]/portal/partner/[token]/page.tsx:21-30,45-48`: token, **ApplicationPart başına sihirli bağlantı** (`magicTokenHash`), konsorsiyum ortağı bütçe satırı ekler (`addBudgetLineByToken`). Ajans davet koduyla ilgisi yok | **YANLIŞ → D-2** |
| 10 | Çıktı hakları kullanıcıya ait | kodda karşılığı yok, hukuki tercih | hukuk kararı (Ö-1 ile birlikte) |
| 11 | "mevcut kullanıcılara **e-posta ile bildirim yapılır**" | şart değişikliği e-postası yok; `TERMS_OF_SERVICE` yalnız `login/AuthCard.tsx:13,180,530` ve `accept-invite/continue/page.tsx:9,156`'da kullanılıyor (kayıt anı). Yeniden kabul akışı da yok | **UYDURMA taahhüt → D-4** |
| 12 | info@fonbridge.com | `src/components/PublicFooter.tsx:136`, `src/lib/beta/constants.ts:48`, `src/lib/env.ts:99` | doğru |

### 2.2 Testler, typecheck, lint (kendim koştum)

```
$ npx vitest run tests/registration-consent.test.ts tests/marketing-unsourced-figures.test.ts \
    tests/i18n-check-script.test.ts tests/i18n-hardcoded-detector.test.ts tests/i18n.test.ts
 Test Files  5 passed (5)
      Tests  80 passed (80)

$ npm run i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.

$ npx prisma generate && npx tsc --noEmit ; echo tsc_exit=$?
tsc_exit=0            (0 satır çıktı)

$ npx eslint "src/app/[locale]/terms/page.tsx" src/lib/legal/consent-documents.ts ; echo eslint_exit=$?
eslint_exit=0
```

Not: Bu ağaçta Prisma istemcisi üretilmemişti. Ben üretmeden önce `tsc` 485 satır hata veriyordu (148'i "`@prisma/client` has no exported member"). Yazarın "test hataları unrelated" notunun kaynağı muhtemelen bu. Üretimden sonra typecheck temiz.

`marketing-unsourced-figures` yeşil, ama `legal.terms`'teki "5–10 iş günü" ve "30 gün" rakamlarını yakalamadı. Bu test o rakamları kapsamıyor; yeşil olması bu maddeler için kanıt değil.

### 2.3 Sayfa (gerçek dev sunucusu, port 3917, Playwright Chromium)

```
TR 200   H1: Kullanım Koşulları ve Hizmet Sözleşmesi   h2: 12 (1. Hizmet Tanımı… → 12. İletişim)   <title>: … — FonBridge
EN 200   H1: Terms of Service and Agreement            h2: 12 (1. Service Scope… → 12. Contact)    <title>: … — FonBridge
görünür metinde: ham "{brand}" yok · eksik anahtar yok · "`/portal/partner/[token]`" ters tırnaklarıyla birlikte DÜZ METİN görünüyor · "ADR-0006" görünüyor
```

Tam sayfa görüntüleri scratchpad'de alındı (TR görüntüsünde 9. madde ters tırnaklı yol ve 12. maddedeki "Şekayetleriniz" açıkça görünüyor). Sunucuyu sonra durdurdum.

### 2.4 Geçen yapısal kontroller

- `isTr` kalmadı. Başlık ve gövde metinlerinin tamamı `t()` üzerinden geliyor (`page.tsx:41-76`).
- Sürüm aynı commit'te `2026-09-10.1` → `2026-10-02.1` oldu (`consent-documents.ts:71`). Bu, modülün kuralına uyuyor (`consent-documents.ts:9-17`).
- Commit `messages/*.json` içinde yalnız `legal.terms` bloğuna dokunuyor. `git merge-tree HEAD explor-fb/privacy-recipients` → **MERGE_CLEAN**.
- EN'deki "Stripe Customer Portal" ifadesi kalktı. Yerine kanaldan bağımsız "billing portal" geldi.
- Şirket unvanı/adresi, uygulanacak hukuk/mahkeme, SLA/sorumluluk sınırı ve Mesafeli Sözleşmeler ön bilgilendirmesi **yazılmamış**. Yer tutucu yok.

---

## 3. Bulgular (önem sırasıyla)

### Değişiklik isteyenler (bloke ediyor)

**D-1. Hesap açma yolu yanlış.** `messages/tr.json` / `en.json` → `legal.terms.scopeBody`: "e-posta ve şifre ile açılır" / "created with an email address and password".
- *Senaryo:* Kullanıcı şartları okuyup şifreyle kayıt arar. Üretimde yalnız Google OAuth var (ADR-0006, `auth.ts:366-379`). Sözleşme, var olmayan bir hesap açma yolunu tarif ediyor.
- *Düzeltme:* "Hesap Google hesabıyla açılır" gibi bir ifade kullanılmalı ve sağlayıcıyı değiştirmeye izin veren nötr bir yazım seçilmeli.

**D-2. Ajans kanalı ve ortak portalı yanlış tarif edilmiş.** `legal.terms.agencyBody` ve `partnerBody`.
- (a) Davet kodu kullanıcıya bir portal erişimi vermiyor. Yalnız kiracının `agencyId`'sini kayıtta bir kez yazıyor ve ajansa kiracının verisine okuma hakkı vermiyor (`schema.prisma:52-55`).
- (b) `/portal/partner/[token]`, davet koduyla değil, başvuru parçası başına üretilen sihirli bağlantıyla açılıyor. Bu bağlantıyı konsorsiyum ortakları bütçe satırı eklemek için kullanıyor (`portal/partner/[token]/page.tsx:21-30`).
- (c) "(ADR-0006)" atfı yanlış; o ADR yalnız Google girişi kararı. İç belge numarası ve ters tırnaklı URL yolu kullanıcı metninde düz metin olarak görünüyor (§2.3).
- *Senaryo:* Ajans müşterisi "ajansım verilerimi portaldan görüyor" diye okur. Gerçekte ajansın böyle bir erişimi yok. Gerçek ortak portalı (dış ortağın bütçe satırı eklemesi) ise sözleşmede hiç anlatılmıyor.
- *Düzeltme:* 8. madde: "Ajansın davet koduyla kayıt olunduğunda çalışma alanı ajansa bağlanır. Bu bağ ajansa verilere erişim vermez." 9. madde: "Proje sahibi, konsorsiyum ortağına bütçe katkısı için tek kullanımlık bağlantı paylaşabilir." ADR numarası ve URL yolu metinden çıkarılmalı. Ajans eki metniyle (`Auth.agencyInvite`, `AGENCY_CHANNEL_ADDENDUM`) çelişmemeli.

**D-3. İade maddesi koddaki davranışa bağlı değil.** `legal.terms.refundBody`.
- (a) "Faturalama portalından iade talebi başlatabilirsiniz": kodda iade akışı yok. Portal yalnız Stripe abonelik ve ödeme yönetimi oturumu açıyor (`create-portal-session.ts:28`) ve `providerCustomerId` yoksa hata veriyor (`:21-25`).
- (b) "5–10 iş günü" rakamı hiçbir kaynağa dayanmıyor; uydurma.
- (c) TR cümlesi "kupon ve ömür boyu dahil" kısmını garantiye değil, talep etme cümlesine bağlıyor ("…dahil olmak üzere, iade talebini… başlatabilirsiniz"). Fiyatlandırmadaki `refundNote` (`tr.json:1416`) ile birebir değil.
- (d) Başlıktaki "Cayma Hakkı / Right of Withdrawal" bir tüketici hukuku rejimini çağrıştırıyor, ama gövde bunu hiç işlemiyor. Bu, görev gereği yazılmaması gereken tüketici ön bilgilendirmesine kapı açıyor.
- *Senaryo:* Kullanıcı portala gider ve iade düğmesi bulamaz. Söz verilen 5–10 günlük süre de hiçbir sisteme bağlı değil.
- *Düzeltme:* Gövde fiyatlandırma metniyle aynı olmalı: "14 gün para iade garantisi — kupon ve ömür boyu satın alımlar dahildir." Ardından iade talebi için yalnız iletişim adresi verilmeli. Süre rakamı ve "portal" kaldırılmalı. Başlık "İade" olmalı; cayma hakkı hukukçuya bırakılmalı.

**D-4. Kodda karşılığı olmayan iki taahhüt var.**
- `billingBody`: "Fiyat değişiklikleri 30 gün önceden bildirilir."
- `changesBody`: "mevcut kullanıcılara e-posta ile bildirim yapılır".
- Fiyat bildirimi ya da şart değişikliği e-postası gönderen kod yok. `TERMS_OF_SERVICE` yalnız kayıt ve davet kabulü ekranlarında okunuyor; yeniden kabul akışı da yok (yazar da bunu kabul ediyor).
- *Senaryo:* Bu commit sürümü zaten artırıyor (§4), ama hiçbir kullanıcıya e-posta gitmeyecek. Metin, yayına girdiği gün kendi 11. maddesini ihlal ediyor.
- *Düzeltme:* İki cümle de çıkarılmalı ya da "bildirim yöntemi: hukuk kararı" olarak açık soru listesine taşınmalı. Taahhüt ancak gönderim kodu varken yazılmalı.

**D-5. Silme kapsamı abartılmış.** `legal.terms.terminationBody`: "30 gün sonra tüm veriler silinir / all data is permanently deleted".
- Silme işi kişiyi siliyor. Kiracıya ait dosyalar bilerek kalıyor ve yapay zeka kullanım kayıtları silinmeyip anonimleştiriliyor (`users-scheduled-deletion.ts:104-125`; `docs/legal/processing-register.md` §15).
- *Senaryo:* KVKK talebi sırasında "tüm verilerim silinecekti" itirazı doğar ve sözleşme, işleme envanteriyle çelişir.
- *Düzeltme:* "Kişisel hesap verileriniz 30 gün sonra silinir. Çalışma alanına ait içerik, çalışma alanı silinene kadar kurumda kalır. Faturalama ve denetim kayıtları anonimleştirilerek tutulur. Ayrıntı: gizlilik bildirimi."

### Öneriler (bloke etmiyor)

- **Ö-1. Eski "Yapay zeka çıktıları karar desteğidir, başvuru sahibi doğrulamakla yükümlüdür" maddesi silindi.** Yerine yalnız "çıktı hakları kullanıcıya aittir" geldi. Raporda bu silme hiç geçmiyor. Bu bir uydurma değil, ama mevcut koruyucu bir hükmün habersiz kaldırılması. Hukukçuya açık soru olarak yazılmalı; hukukçu karar verene kadar korunması önerilir.
- **Ö-2. TR dil hataları** (sayfada görünüyor):
  - "Şekayetleriniz" → "Şikâyetleriniz"
  - "Ihlalleri {brand}, hesabı…" → "İhlal hâlinde {brand} hesabı…"
  - "İlk 20 aboneyi" → "İlk 20 kuruma"
  - "hizmetin sorunu çözmek için niyetlenen teknik sınırları" anlamsız (EN karşılığı: "limits intended to protect the service")
  - "{brand}'nın" ve "{brand}'a" → FonBridge okunuşuna göre "FonBridge'in" ve "FonBridge'e". Ek, `{brand}` değişkenine sabit bağlandığı için marka değişirse yine bozulur.
  - TR "Taraflar … sorumludur" ile EN "Users are responsible" anlamca farklı.
- **Ö-3.** Başlık "KDV / Taxes" diyor, ama gövdede vergiye dair tek cümle yok.
- **Ö-4.** Kredi metni "her faturalama döneminde yenilenir" diyor; kod aylık dağıtıyor (`credits-monthly-grant.ts`). Yıllık planda bu ikisi farklı şeyler.
- **Ö-5.** Ömür boyu lisans: şartlarda "ilk 20 abone", fiyatlandırmada "ilk 20 kurum / entities". Aynı terim kullanılmalı.
- **Ö-6.** Kullanıcı metninde iç jargon var: "G0–G2 kapıları", "pipeline", "spreadsheet'leri".
- **Ö-7. Yazarın raporundaki yanlışlar:**
  - Risk 3 "EN'de Stripe Customer Portal yazıyor" diyor; bu commit o ifadeyi zaten kaldırdı.
  - "kod `support@fabrika.dev` kullanıyor" diyor; `src` ve `messages` içinde bu adres yok, kod `info@fonbridge.com` kullanıyor.
  - İstenen madde ↔ dosya:satır eşlemesi yok.
  - Commit yazarı "Claude BE-FB", dal ise cs-fb'nin.

## 4. Riskler

- **Kayıtlı kabullere etkisi:** Sürüm artışından sonra yeni kayıtlar `2026-10-02.1` yazar. Eski satırlar `2026-09-10.1` olarak doğru kalır (modül kuralı). Girişte sürüm kontrolü ya da yeniden kabul ekranı yok, bu yüzden mevcut kullanıcılar yeni metni kabul etmeden kullanmaya devam eder. Kural bunu "may need to be asked again" diye bilerek açık bırakıyor; bu bir hata değil. Ama D-4'teki e-posta taahhüdü bu durumla çelişiyor.
- **Düzeltme sonrası sürüm:** D-1..D-5 yeni bir commit'te düzeltilecekse metin yine değişir. Bu sürüm hiçbir ortamda kabul satırı yazmadıysa `.1` kalabilir. Yazdıysa (yerel ya da dev'de bu dalla kayıt yapıldıysa) `2026-10-02.2` olmalı. En güvenlisi düzeltme commit'inde `.2`'ye geçmek.
- **Dal kapsamı:** Dal, origin/dev'de henüz olmayan fe-fb gates merge'ünü (`1b43b434`) de içeriyor. Bu dal merge edilirse o iş de birlikte gelir. Lider bunu bilerek merge etmeli.
- Dal push edilmedi; CI'da Linux koşusu yok.

## 5. Açık sorular (hukuk ya da patron)

1. Cayma hakkı ve tüketici satışı: kurum dışı (bireysel) alıcı var mı? (D-3d)
2. Şart değişikliğinde bildirim ve yeniden kabul: hangi yöntemle, kim karar verecek? (D-4)
3. Yapay zeka çıktısı sorumluluk reddi geri gelsin mi? (Ö-1)

## 6. Sonraki adım

- cs-fb, D-1..D-5'i ve Ö-2'yi aynı dalda düzeltir, sürümü `2026-10-02.2` yapar ve raporuna madde ↔ dosya:satır tablosu ekler.
- Ardından yeniden inceleme: `legal.terms` farkı ve §2.2'deki komutlar yeniden koşulur.
- Bu kart için `update_task` yapmadım; statüyü lider günceller.

## 7. Değişen dosyalar

- Yalnız bu rapor. Kod ya da metin değiştirilmedi.
- Ağaçta kalan yan etkiler: `npx prisma generate` ile ağacın kendi `node_modules/.prisma` dizini üretildi (gitignore'da) ve `.next/` dev çıktısı oluştu. Dev sunucusu (port 3917) durduruldu.
