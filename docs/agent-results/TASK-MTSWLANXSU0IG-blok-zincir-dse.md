# TASK-MTSWLANXSU0IG — A3: Rıza/aydınlatma kaydı

**Ajan:** blok-zincir-dse · **Platform:** doğrulama **macOS** (darwin 25.6.0, Node/pnpm, Postgres yerel, Chromium/Playwright 1.62.1)
**Tarih:** 2026-09-10 · **Dal:** `dev`

---

## 1. Ne yapıldı

### 1.1 Önce kapsam ölçüldü — ve kartın (d) maddesini daralttı

Kart, kapsamı `docs/legal/processing-register.md`'nin belirlemesini istedi. Envanterdeki
18 faaliyetin **hukuki sebep** sütunu tarandı:

| Hukuki sebep | Faaliyetler |
|---|---|
| Sözleşme — md.5/2-c / art.6(1)(b) | §1, §2, §3, §4, §15 |
| Hukuki yükümlülük — md.5/2-ç / art.6(1)(c) | §3, §5, §13 |
| Meşru menfaat — md.5/2-f / art.6(1)(f) | §6, §7, §8, §9, §10, §12, §14, §18 |
| **Açık rıza — md.5/1 / art.6(1)(a)** | **§11 (Google/Outlook takvim OAuth) — yalnız bu** |

Ölçüm:
```
$ grep -n "^## \|Hukuki sebep" docs/legal/processing-register.md
159:| **Hukuki sebep** | KVKK md.5/1 (açık rıza — OAuth izin ekranı) / GDPR art.6(1)(a) |
```
→ 18 faaliyetten **tek** açık-rıza satırı §11'dir; o da bugün **hiç veri yazmıyor**
(`connectCalendar` `CALENDAR_OAUTH_NOT_CONFIGURED` ile reddediyor, `/api/calendar/callback` yok).

**Sonuç: kayıt formunda "rıza" istemek yanlış olurdu.** Hesap oluşturma (§1) **sözleşme**
temellidir. Sözleşmeye dayanan bir işleme için rıza istemek (a) dayandığımız hukuki sebebi
yanlış beyan eder, (b) var olmayan bir geri çekme hakkı ima eder. Kartın kendi uyarısı buydu.
Bu yüzden kayıt adımı **rıza değil**, KVKK md.10 / GDPR md.13 **aydınlatma teyidi** +
**sözleşme (kullanım koşulları) kabulüdür**; `Consent.kind` bu üçünü kayıt üzerinde ayrı tutar
(`DISCLOSURE_ACK` / `TERMS_ACCEPTANCE` / `EXPLICIT_CONSENT`). §11 canlıya alındığında
`EXPLICIT_CONSENT` + `CALENDAR_OAUTH` için yer hazır, bugün satır yok.

### 1.2 `Consent` modeli + migration + RLS (a, b, c)

- `prisma/schema.prisma`: `Consent` modeli, `ConsentKind` ve `ConsentPurpose` enum'ları.
  Alanlar: `tenantId` (CLAUDE.md kural 1), `userId`, `kind`, `purpose`, `documentId`,
  `documentVersion`, `locale`, `grantedAt`, `withdrawnAt?`, `createdAt`.
- Migration çifti: `prisma/migrations/add-consent-record.sql` + `.down.sql` (idempotent;
  down dosyası kaydı yok etmeden önce dışa aktarma uyarısı taşır).
- `prisma/rls.sql`: `Consent`, `tenant_isolation` FOREACH dizisine eklendi (ENABLE + FORCE).
- Sorgular `withTenant`/`withTenantOn` üzerinden; kayıt akışının istisnası §1.4'te.

**`ipAddress` / `userAgent` bilerek YOK.** Kart bunları "saklama süresi envanterle uyumluysa"
diye şarta bağlamıştı; şart **karşılanmıyor**. Bir ispat kaydına uyan saklama süresi §12'nin
`DualApprovalStep` için kurduğu süredir (md.17(3)(e) — hesabın ömrünün ötesinde). Süresiz
saklanan bir ağ tanımlayıcısı, envanterin kendi §22 boşluk #1'ine ("saklama süresi tanımlı
değil") yeni bir madde ekler. İspat için gereken dört sütun zaten var: kim, hangi belge,
hangi sürüm, ne zaman.

### 1.3 Metin sürümü — metnin kendisi saklanmıyor

`src/lib/legal/consent-documents.ts` tek beyan yeri: `privacy-notice@2026-09-10.1`,
`terms-of-service@2026-09-10.1`. Metin `messages/{tr,en}.json` içinde `t()` anahtarı olarak
yaşar; `/[locale]/privacy` ve `/[locale]/terms` sunar. Metin değişince **aynı commit'te**
sürüm artırılır; eski satırlar eski sürümde kalır ve doğruyu söylemeye devam eder
("bu kişi başka bir metne onay verdi").

Tarayıcı, kutuyu işaretlediğinde çıplak `true` değil **sürüm damgası** gönderir
(`privacy-notice@…,terms-of-service@…`). Sunucu damgayı güncel sürümlerle karşılaştırır ve
uyuşmazsa **reddeder** — metin, form açıkken yeniden yayımlandıysa kişi eski metni okumuştur;
tikini kabul etmek "kanıt gibi görünen ama kanıt olmayan" bir satır yazardı.

### 1.4 Yazım yolu — **iki** tane var, ikisi de kapsandı

Bir hesap iki ayrı yerde doğuyor; yalnız birine yazmak boşluğun yarısını açık bırakırdı:

1. **`authorize`** (`src/lib/auth.ts`) — e-posta formu. Onay kimlik bilgileriyle birlikte
   geldiği için hesap **var olmadan önce** doğrulanır; onaysız kayıt `null` ile reddedilir.
   Onay satırı hesabın açıldığı **aynı transaction** içinde yazılır (kart maddesi (e)).
2. **`events.createUser`** (`src/lib/auth.ts`) — Google/Microsoft OAuth. Adaptör kullanıcıyı
   zaten yaratmış olduğu için burada reddetmek mümkün değil. Onay, `signIn` öncesinde sunucu
   tarafında kurulan kısa ömürlü httpOnly çerezle taşınır
   (`src/lib/legal/registration-ack-cookie.ts`). Çerez yoksa satır **yazılmaz** — uydurulmuş
   bir kayıt eksik kayıttan kötüdür — ve `SystemAlert` (`auth-registration-consent`) üretilir
   (CLAUDE.md kural 6: alarm üret, işi kırma).

**`bindTransactionToTenant` (yan bulgu, düzeltildi).** Kayıt akışı `withTenant` kullanamayan
tek akıştır: kiracı, ona ihtiyaç duyan transaction'ın **ortasında** doğar. Kiracı id'si oluşur
oluşmaz `set_config('app.tenant_id', …, is_local => true)` uygulanır (`withTenantOn`'un
mekanizmasının aynısı). Bu çağrı eklenene kadar **`Membership` ve `Workspace` bu transaction'da
`app.tenant_id` hiç kurulmadan yazılıyordu**; yerel SUPERUSER rolüyle çalıştığı için
görünmüyordu, `fabrika_app` (NOBYPASSRLS) rolüyle `tenant_isolation` hepsini reddederdi.

### 1.5 Kayıt formu (d)

Önce ölçüldü: `src/app/[locale]/kayit/page.tsx` tek satırlık bir re-export
(`import RegisterPage from '../register/page'`), yani **iki rota tek bileşen**:
`src/app/[locale]/login/AuthCard.tsx`. Onay adımı bir kez eklendi, iki rotada da geçerli.

- Onay kutusu **ön işaretli değil** (`defaultChecked` yok, depodan geri yüklenmiyor).
- Metin `t()` üzerinden iki dilde (`Auth.disclosureAck`, `Auth.disclosureRequired`,
  `Auth.disclosureVersion`); `t.rich` ile `/[locale]/privacy` **ve** `/[locale]/terms`
  bağlantıları.
- Onaylanan **sürüm ekranda** yazıyor → ekran görüntüsü belirli bir metnin kanıtı olur.
- Yalnız **kayıt** modunu kapsar. Var olan hesaba giriş onay istemez (kayıt sırasında
  alınmıştı; her girişte sormak insanları tıklayıp geçmeye alıştırır). Sunucu aynı kuralı
  bağımsız uygular: `authorize` damgayı yalnız **kullanıcı yaratan** dalda arar.
- OAuth düğmeleri de kayıt modunda aynı kapıdan geçer (yönlendirme başlamadan önce).

---

## 2. Kanıt

### 2.1 Başlangıç durumu (değişiklik öncesi)
```
$ grep -n "Consent" prisma/schema.prisma
(exit 0 — sıfır sonuç)
$ pnpm lint   → exit 0
$ pnpm typecheck → exit 0
$ pnpm rls:verify
✅ 44 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

### 2.2 Migration uygulandı, şema ile DB uyuşuyor
```
$ (add-consent-record.sql uygulandı)
┌─────────┬───────────────────┬───────────────────────────────┬─────────────┐
│ (index) │ column_name       │ data_type                     │ is_nullable │
├─────────┼───────────────────┼───────────────────────────────┼─────────────┤
│ 0       │ 'id'              │ 'text'                        │ 'NO'        │
│ 1       │ 'tenantId'        │ 'text'                        │ 'NO'        │
│ 2       │ 'userId'          │ 'text'                        │ 'NO'        │
│ 3       │ 'kind'            │ 'USER-DEFINED'                │ 'NO'        │
│ 4       │ 'purpose'         │ 'USER-DEFINED'                │ 'NO'        │
│ 5       │ 'documentId'      │ 'text'                        │ 'NO'        │
│ 6       │ 'documentVersion' │ 'text'                        │ 'NO'        │
│ 7       │ 'locale'          │ 'text'                        │ 'NO'        │
│ 8       │ 'grantedAt'       │ 'timestamp without time zone' │ 'NO'        │
│ 9       │ 'withdrawnAt'     │ 'timestamp without time zone' │ 'YES'       │
│ 10      │ 'createdAt'       │ 'timestamp without time zone' │ 'NO'        │
└─────────┴───────────────────┴───────────────────────────────┴─────────────┘
policies: [ 'tenant_isolation' ]

$ npx prisma migrate diff --from-schema-datamodel … --to-schema-datasource …  | grep -i consent
(çıktı yok → schema.prisma ile veritabanı bu tabloda anlaşıyor)
```

### 2.3 (i) Birim test — transaction bütünlüğü, **düzeltme öncesi KIRMIZI gösterildi**

Kontrollü deney: onay yazımı transaction **commit ettikten sonra**ya alındı (kartın
değiştirdiği şekil), test koşuldu:
```
$ (patch: transaction COMMIT eder, onay sonradan yazılır)
$ npx vitest run tests/registration-consent.live.test.ts -t "takes the whole registration"
⎯⎯⎯ Failed Tests 1 ⎯⎯⎯
AssertionError: a registration whose disclosure write failed left an account behind:
  expected { …(12) } to be null
    147|     expect(orphan, 'a registration whose disclosure write failed left …
 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
```
Yazım transaction'ın **içine** geri alındığında:
```
$ npx vitest run tests/registration-consent.live.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```
Testler: (1) onay yazımı düşerse kullanıcı/kiracı/çalışma alanı/üyelik geri alınır,
(2) yazım transaction dışındayken hesap **öksüz kalır** — bu şekil kalıcı olarak test edilir ki
yazımı tekrar dışarı taşımak görünmez bir değişiklik olmasın, (3) başarılı kayıt belge başına
bir satır yazar, (4) RLS (aşağıda).

Saf birim testler (DB'siz), `tests/registration-consent.test.ts`:
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
```
— kayıt satırının `EXPLICIT_CONSENT` **olmadığını**, her belgenin sürümlü olduğunu, damgasız
tikin onay sayılmadığını ve **eskimiş sürüm damgasının reddedildiğini** sabitler.

### 2.4 (ii) RLS — canlı ölçüm, `fabrika_app` rolüyle
```
$ pnpm rls:check
✅ SUCCESS: All 45 tenant-scoped models have RLS policies registered.   (44 → 45)

$ pnpm rls:verify
⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif) · ✓ okuma (pozitif) · ✓ yazma (negatif) · ✓ yazma (pozitif) · ✓ yazma (çapraz)
✅ 45 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```
Ayrıca `Consent`'e özel test (`registration-consent.live.test.ts`, 4. test): ölçüm rolünün
`rolsuper=false`/`rolbypassrls=false` olduğu **önce doğrulanır** (yoksa alttaki iddialar boşa
geçer), sonra pozitif kontrol (kendi kiracısı 2 satır görür) → **başka kiracı 0 satır görür** →
çapraz INSERT reddedilir.

### 2.5 (iii) Gerçek tarayıcı — tıklayarak
```
$ E2E_SHOTS_ROOT=docs/agent-results npx playwright test tests/e2e/registration-consent.spec.ts
  ✓  1 the registration form asks, unticked, and will not submit until it is ticked (1.2s)
  ✓  2 ticking it and registering writes the disclosure record (1.7s)
  ✓  3 the refusal is in the server, not in the form (782ms)
  3 passed
```
Kareler: `docs/agent-results/TASK-MTSWLANXSU0IG-screenshots/`
`01-unticked-submit-disabled.png` · `02-unticked-refused.png` ·
`03-ticked-submit-enabled.png` · `04-registered.png`

3. test tarayıcı formunu **tamamen devre dışı bırakıp** doğrudan NextAuth uç noktasına POST
atar (onay alanı yok) → hesap **oluşmaz**; pozitif kontrol olarak aynı istek onay damgasıyla
atılır → hesap oluşur ve 2 onay satırı yazılır. Yani kapı formda değil **sunucuda**.

**Satırın kendisi** — çalışan uygulamada gerçek bir kayıt yapıldı, satırlar ham olarak:
```
User: cmtvd1s5600006cxkoe7vnyxl evidence-consent-1789034667@fabrika.test
[
  { "id": "cmtvd1s5n00046cxki4na42vv",
    "tenantId": "cmtvd1s5a00016cxkmhjolx3t",
    "userId": "cmtvd1s5600006cxkoe7vnyxl",
    "kind": "DISCLOSURE_ACK",   "purpose": "ACCOUNT_REGISTRATION",
    "documentId": "privacy-notice",   "documentVersion": "2026-09-10.1",
    "locale": "tr", "grantedAt": "2026-09-10T10:04:27.467Z",
    "withdrawnAt": null, "createdAt": "2026-09-10T10:04:27.467Z" },
  { "id": "cmtvd1s5n00056cxkj09pmqd4",
    "tenantId": "cmtvd1s5a00016cxkmhjolx3t",
    "userId": "cmtvd1s5600006cxkoe7vnyxl",
    "kind": "TERMS_ACCEPTANCE", "purpose": "ACCOUNT_REGISTRATION",
    "documentId": "terms-of-service", "documentVersion": "2026-09-10.1",
    "locale": "tr", "grantedAt": "2026-09-10T10:04:27.467Z",
    "withdrawnAt": null, "createdAt": "2026-09-10T10:04:27.467Z" }
]
```
Sunucu günlüğünde onaysız denemenin karşılığı:
```
[Auth.authorize] registration refused: privacy notice and terms were not acknowledged,
                 or the version acknowledged is no longer current
```
Kanıt hesabı ve kiracısı sonrasında **silindi**; `Consent rows: 0`, artık test verisi yok.

### 2.6 (iv) Kapı
```
$ pnpm lint       → exit 0 (temizdi, temiz kaldı)
$ pnpm typecheck  → exit 0 (temizdi, temiz kaldı)
$ pnpm test       → Test Files 147 passed | 2 skipped (149) · Tests 1757 passed | 8 skipped (1765)
$ pnpm i18n:check → ✅ both catalogs agree · no file gained hard-coded text (AuthCard baseline 4, aşılmadı)
$ pnpm rls:check  → ✅ 45/45
$ pnpm rls:verify → ✅ 45/45, fabrika_app ile ölçüldü
$ npx playwright test tests/e2e/registration-consent.spec.ts tests/e2e/auth.spec.ts → 6 passed
```

**e2e'de KALAN kırmızılar BENİM DEĞİL — kontrollü deneyle kanıtlandı.** Değişikliklerim
`git stash` ile geri alınıp (`src/lib/legal` de kenara alınarak) aynı koşu tekrarlandı:

| Spec | Benim değişikliklerimle | Değişikliklerim GERİ ALINMIŞ hâlde | Karar |
|---|---|---|---|
| `price-lock.spec.ts` (3) | FAIL | **FAIL** | önceden bozuk |
| `document-export-tenant-isolation.spec.ts` (1) | FAIL | **FAIL** | önceden bozuk |
| `legal-pages-no-key-leak.spec.ts` (7) | FAIL | **FAIL** | önceden bozuk |
| `theme-paint-timing.spec.ts` (2) | FAIL | **FAIL** | önceden bozuk |
| `m9-calendar-connect.spec.ts` | **PASS** | PASS | kapıdaki tek kırmızısı sıralama kaynaklıydı |
| `auth.spec.ts` "redirect to auth provider" | FAIL → düzeltildi | PASS | **BENİMDİ** (aşağıya bakınız) |

`legal-pages-no-key-leak.spec.ts` dosyası **git'te takipsiz** (`??`) — TASK-MTSWIFJKGTYC
üzerinde çalışan paralel bir ajanın yeni dosyası; `b4b0944 docs(memory): the key path that
renders where the legal text should be` commit'i o kusuru zaten kaydetmiş.

**Benim olan tek kırmızı ve düzeltmesi:** `auth.spec.ts` "should redirect to auth provider on
click" — kayıt sekmesindeki Google düğmesi artık aynı aydınlatma kapısından geçtiği için
tıklama yönlendirme başlatmıyordu. Test **gevşetilmedi**; akış gerçekten değiştiği için test
gerçeği yazacak şekilde güncellendi (kutuyu işaretle, sonra tıkla) ve kuralın diğer yarısı için
**yeni bir test** eklendi: onay verilmeden Google'a tıklandığında OAuth akışı **hiç
başlamamalı**. Üçü de yeşil.

**Bir de kendi testimde gerçek bir yarış yakalandı:** spec tek başına geçip tam `pnpm gate`
içinde düştü — Next sayfayı akıtırken formun ikinci, `hidden` bir kopyasını tutuyor ve çıplak
`getByTestId` strict-mode ihlaline düşüyor. Locator görünür kopyaya kapsandı (`.filter({
visible: true })` + `networkidle`), yani yarış seyrekleştirilmedi, **kaldırıldı**.

---

## 3. Değişen dosyalar

**Şema / veritabanı**
- `prisma/schema.prisma` — `Consent` modeli + `ConsentKind`, `ConsentPurpose`
- `prisma/migrations/add-consent-record.sql` *(yeni)* · `add-consent-record.down.sql` *(yeni)*
- `prisma/rls.sql` — `Consent` → `tenant_isolation`

**Kod**
- `src/lib/legal/consent-documents.ts` *(yeni)* — belge kimliği + sürüm, damga üretimi/doğrulaması
- `src/lib/legal/registration-consent.ts` *(yeni)* — `bindTransactionToTenant`, `writeRegistrationConsent`
- `src/lib/legal/registration-ack-cookie.ts` *(yeni)* — OAuth turu için httpOnly taşıma
- `src/lib/auth.ts` — onay kapısı + iki kayıt yolunda onay yazımı + tenant bağlama
- `src/lib/actions/auth.ts` — damgayı `authorize`'a ve OAuth çerezine taşır
- `src/app/[locale]/login/AuthCard.tsx` — ön işaretsiz onay kutusu, iki bağlantı, sürüm satırı
- `src/lib/inngest/jobs/users-scheduled-deletion.ts` — **yalnız yorum**: `Consent.userId` FK'siz
  11. sütun, imhada **saklanır**, dayanağıyla birlikte adlandırıldı

**i18n**
- `messages/tr.json`, `messages/en.json` — `Auth.disclosureAck` / `disclosureRequired` / `disclosureVersion`

**Test**
- `tests/registration-consent.test.ts` *(yeni, 8)* · `tests/registration-consent.live.test.ts` *(yeni, 4)*
- `tests/e2e/registration-consent.spec.ts` *(yeni, 3)* · `tests/e2e/auth.spec.ts` (güncellendi + 1 yeni)

**Doküman**
- `docs/DATA_MODEL.md` — §15 `Consent`, ve §7.1.1 imha tablosuna `Consent.userId` satırı
- `docs/legal/processing-register.md` — §18b yeni işleme faaliyeti + §20 ters kontrol satırı

---

## 4. Riskler

1. **OAuth kaydı çerezle taşınıyor, kimlik bilgisi yoluyla değil.** Çerez, kutunun *bu
   tarayıcıda* işaretlendiğini kanıtlar; belirli bir insanın metni okuduğunu değil. Sunucu
   tarafında kurulur (sayfa betiği taklit edemez), ama kimlik bilgisi yolundaki kadar güçlü
   değildir. Gerçek Google/Microsoft turu bu depoda uçtan uca **koşulamadı**; bu yol yalnız
   birim düzeyinde doğrulandı. Bilinçli olarak **reddetme yok**: reddetmek hesap zaten
   yaratıldıktan sonra kullanıcıyı silmek anlamına gelirdi ve doğrulanamayan bir mekanizmayla
   insanları kayıttan kilitleme riski, eksik kayıt riskinden ağırdır. Eksiklik `SystemAlert`
   ile **görünür**.
2. **`Consent` satırları imhada silinmiyor.** Bilinçli (md.17(3)(e), §12 emsali) ve iki
   belgede beyan edildi — ama bu, silinen bir kullanıcının `userId`'sinin bu tabloda kalması
   demektir. Ağ tanımlayıcısı taşımadığı için kalan veri asgaridir.
3. **Metinlerin hukuki içeriği hâlâ yer tutucu.** Sürüm `2026-09-10.1`, sürümleme şemasının
   başladığı günü gösterir, bir hukukçunun metni onayladığı günü **değil**.
4. **Demo/seed hesapları onay satırı taşımıyor.** Bilinçli: onay kaydı **seed edilmedi**,
   çünkü demo kullanıcılar için onay satırı üretmek hukuki kanıt uydurmak olurdu. Bunlar
   kurulum verisidir, kayıt değil.
5. Kayıt akışındaki `set_config` çağrısı `Membership`/`Workspace` yazımlarının davranışını
   NOBYPASSRLS rolünde **değiştirir** (reddedilmekten kabul edilmeye) — düzeltme yönünde, ama
   üretim rolüyle ilk kez bu kartla sınanmış olacak.

---

## 5. Açık sorular

1. **Metnin hukuki içeriği** TASK-MTSWIFJKGTYC'de ve hukuk girdisi bekliyor. Bu kart yalnız
   **yapıyı** kurdu (anahtar + sürüm + tür + amaç). İçerik geldiğinde yapılacak iş bir kopya
   değişikliği ve `consent-documents.ts`'te bir sürüm artırımıdır — **şema/kod değişikliği
   gerekmez**. Aynı dosyaya paralel bir ajan `legal-pages-no-key-leak.spec.ts` ile çalışıyor;
   o kart bugün `/tr/privacy` ve `/tr/terms`'te **anahtar yolu sızdığını** ölçmüş durumda —
   yani onay kutusunun bağlandığı sayfalar şu anda düzgün metin göstermiyor. Bu benim kartımın
   kapsamı değil ama **aynı ekranı** ilgilendiriyor; o kart kapanmadan aydınlatma uçtan uca
   "yapılmış" sayılmamalı.
2. Var olan hesaplar (seed + gerçek) için **geriye dönük** onay kaydı yok. Geçmişe dönük satır
   yazmak kanıt uydurmak olur; doğru çözüm bir sonraki girişte gösterilen "güncellenmiş metni
   onayla" ara ekranıdır — ayrı kart konusu.
3. §11 takvim OAuth canlıya alınırken `EXPLICIT_CONSENT` + `CALENDAR_OAUTH` satırını kimin
   yazacağı henüz bağlanmadı (bugün o akış hiç yok).
4. `withdrawnAt` sütunu var ama **geri çekme arayüzü yok** — bugün geri çekilecek bir açık rıza
   da yok (§11 pasif). §11 canlıya alınırsa geri çekme ekranı zorunlu hâle gelir.

---

## 6. Sonraki adım

1. TASK-MTSWIFJKGTYC (hukuki metin) kapanınca: metinleri yaz → `consent-documents.ts`'te
   sürümleri artır → aynı commit. Şema değişmez.
2. Var olan hesaplar için "güncellenmiş metni onayla" ara ekranı (yeni kart).
3. §11 OAuth canlıya alınırken: token şifreleme (§22 boşluk #4) **ve** `EXPLICIT_CONSENT`
   yazımı + geri çekme ekranı aynı kartta.
4. Kapıdaki önceden bozuk 13 e2e kırmızısı (price-lock 3, document-export 1,
   legal-pages 7, theme-paint-timing 2) sahiplerine bağlanmalı — bu kartın kapsamı dışı,
   yukarıda kontrollü deneyle ayrıştırıldı.

---

**Platform beyanı:** Doğrulama **macOS**'ta (darwin 25.6.0) yapıldı: yerel Postgres,
`fabrika_app` NOBYPASSRLS rolüyle canlı RLS ölçümü, Chromium/Playwright 1.62.1 ile gerçek
tıklama. **Windows ve Linux'ta koşulamadı** (bu makinede o platformlar yok). Dokunulan kod
yolları platforma bağlı değil: süreç öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI veya
mikrofon-kamera izni içermiyor; Prisma/Postgres, Next.js server action ve `next/headers`
çerez API'si üzerinden çalışıyor — üçü de platformdan bağımsız. Tek platforma değebilecek
nokta, çerezin `secure` bayrağının `NODE_ENV === 'production'`'a bağlı olmasıdır; bu ortam
değişkenine bağlıdır, işletim sistemine değil.
