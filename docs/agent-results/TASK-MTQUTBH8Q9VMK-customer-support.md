# TASK-MTQUTBH8Q9VMK — M9 takvim: `.ics` RFC 5545 + bağlama akışı + i18n

**Ajan:** customer-support (CS-EN) · **Tip:** bug/P1 · **Tarih:** 2026-09-07 · **Dal:** dev

> Aynı kartın önceki turu: `docs/agent-results/TASK-MTQUTBH8Q9VMK-geli-tirici.md`.
> O rapor `settings.calendar` i18n namespace'ini kapatmış, iki maddeyi açık bırakmıştı:
> **"OAuth UI — `handleConnect` hâlâ console.log yapıyor"** ve **sayfa başlığının sabit
> Türkçe olması**. Bu tur ikisini de kapatıyor.

---

## 0. Kart doğruluğu — önce ölçtüm

Kart üç şey iddia ediyor. Ölçüm:

| Kart iddiası | Ölçüm |
|---|---|
| `.ics` RFC 5545'e uymuyor (CRLF, `DTSTAMP`, `UID`, satır katlama, `VTIMEZONE`) | **BÜYÜK ÖLÇÜDE BAYAT.** Doğrulayıcıdan geçirdim: `UID`, `DTSTAMP`, TEXT kaçışı, oktet-bilinçli 75-oktet katlama, CRLF **hepsi doğruydu** (P1-5'te düzeltilmiş). `VTIMEZONE` gerekmiyor — DTSTART/DTEND `Z` ekli UTC, geçerli. **Tek gerçek ihlal kaldı:** akış son satırdan sonra CRLF ile bitmiyordu |
| Bağlama akışı hiç görünmüyor | **DOĞRU, ve iki katmanlı.** `settings/calendar/client.tsx:handleConnect` = `console.log` + `TODO`; sunucu action'ı `connectCalendar` ise `isConnected: false` satır yazıp `{ success: true }` dönüyordu |
| i18n yok | **KISMEN BAYAT.** `settings.calendar` namespace'i vardı (geli-tirici). Eksik olan: sayfa `metadata.title` sabit Türkçe, ve hata/durum mesajları hiç yoktu (çünkü hiç mesaj gösterilmiyordu) |

Ayrıca kart metnindeki dosya tuzağı: `src/lib/calendar.ts` (fonksiyonun asıl yeri) ile
`src/lib/calendar/` (provider'lar) **iki ayrı şey**. `generateIcsContent` ilkinde.

**Ölçüm sırasında kartta yazmayan iki kusur daha çıktı** (§1.3, §1.4) — ikisi de "sahte başarı"
ailesinden ve ikisi de benim şeridimdeki dosyalarda.

---

## 1. Ne yapıldı

### 1.1 RFC 5545: akış sonlandırma (`src/lib/calendar.ts`)

`§3.1` ve `icalobject` ABNF'i içerik satırlarını **sonlandırır**, ayırmaz:
`icalobject = "BEGIN:VCALENDAR" CRLF icalbody "END:VCALENDAR" CRLF`.
`lines.join('\r\n')` akışı `END:VCALENDAR` üzerinde arkasında hiçbir şey olmadan bırakıyordu.
Tek satırlık düzeltme + tam akışı denetleyen bir doğrulayıcı testi.

### 1.2 Bağlama akışı — sahte başarı yerine gerçek sonuç

`connectCalendar` (`src/modules/m9/server/calendar-actions.ts`) `isConnected: false`, token'sız,
`externalId`'siz bir `CalendarConnection` yazıp `{ success: true }` dönüyordu. Bağlanan bir şey
yoktu; çağırana bağlandı deniyordu. Bu deployment'ta gerçek durum:

```
$ find src/app/api -ipath "*calendar*"     # → hiçbir şey: OAuth callback route'u yok
```

Yani `.ics` gerçekten çalışıyor (kullanıcı dosyayı brif ekranından indiriyor), Google/Outlook
ise ne OAuth istemcisine ne callback'e sahip. Buna göre:

- `SELF_SERVE_PROVIDERS = ['ics']` (`src/lib/calendar/errors.ts`) — feature flag değil, **bu
  kurulumda neyin var olduğuna dair bir beyan**. Bir sağlayıcı buraya OAuth istemcisi ve
  callback'i **olduğunda** eklenir.
- `ics` → gerçekten bağlanır, satır `isConnected: true` yazılır (ekranın söylediğiyle aynı).
- `google`/`outlook` → `CALENDAR_OAUTH_NOT_CONFIGURED` ile **reddedilir**; hiçbir yarım
  bağlantı satırı yazılmaz.
- Tüm hatalar makine-okur kod: `CALENDAR_ALREADY_CONNECTED`, `CALENDAR_CONNECTION_NOT_FOUND`,
  `CALENDAR_FORBIDDEN`, `CALENDAR_UNKNOWN_PROVIDER` — istemci düz İngilizce `Error.message`
  ayrıştırmıyor, koda göre `t()` çağırıyor (kural 8).

`'use server'` tuzağı: bir Server Actions modülünün **her export'u async fonksiyon olmalı**.
Hata sınıfı, kod birliği ve sağlayıcı listesi bu yüzden `src/lib/calendar/errors.ts`'te.

İstemci (`settings/calendar/client.tsx`): `handleConnect` artık action'ı çağırıyor, başarıda
sayfayı tazeliyor, redde çevrilmiş bir `role="alert"` bandı gösteriyor, buton "Bağlanıyor…"dan
geri dönüyor. Bağlanamayan sağlayıcının kartı da nedeni yazıyor.

### 1.3 (Kartta yoktu) Google/Outlook sağlayıcıları sahte başarı üretiyordu

`GoogleCalendarProvider.createEvent` = `console.log('[MOCK] …')` + `{ externalId: 'google:' +
Math.random().toString(36) }`. `syncMeetingBriefToCalendar` bunu **başarı sayıyor**: id'yi
yazıyor ve `lastSyncAt` damgalıyor — takvim ayarları ekranı da hiçbir takvimde var olmayan bir
etkinlik için "Son senkronizasyon: <tarih>" diyor. Artık ikisi de
`CalendarProviderNotImplementedError` fırlatıyor; `sync.ts` zaten throw'u doğru işliyor
(`SystemAlert` yazıp sıradaki bağlantıya geçiyor, kural 6), yani sahte "eşitlendi" iddiası
sustu, akış kırılmadı.

### 1.4 (Kartta yoktu) `IcsProvider.createEvent` her çağrıda farklı "external id" üretiyordu

`externalId` = base64(üretilen .ics)'in ilk 32 karakteri. `generateIcsContent` her çağrıda
taze `randomUUID()` UID ve o anki `DTSTAMP` gömdüğü için **aynı brif her senkronizasyonda
farklı bir "external id"** alıyordu — yani id hiçbir şeyi tanımlamıyordu. Artık olay verisinden
türetiliyor (`event.externalId` varsa o).

### 1.5 i18n

- `messages/{tr,en}.json` → `settings.calendar` altına: `connecting`, `connectedNoSyncYet`,
  `errors.*` (6 anahtar). İki dile de eklendi.
- **Yanlış iddia düzeltildi:** `infoText` "Takvim senkronizasyonu her saat çalışır" diyordu.
  Öyle bir iş yok (ne cron, ne Inngest fonksiyonu, ne route takvim senkronunu çağırıyor).
  Metin gerçeğe çevrildi.
- `settings/calendar/page.tsx`: `export const metadata = { title: 'Takvim Bağlantıları' }`
  sabitti — İngilizce sayfa Türkçe sekme başlığı taşıyordu. `generateMetadata()` ile
  locale'e bağlandı (geli-tirici raporunun §4'te açık bıraktığı madde).

---

## 2. Kanıt

### 2.1 `.ics` doğrulayıcı — öncesi/sonrası

Doğrulayıcı `rfc5545Violations()` olarak `src/lib/calendar.test.ts`'e girdi (§3.1 satır
sonlandırma + katlama, §3.6/§3.7 zorunlu özellikler, §3.3.5 DATE-TIME, §3.6.5 TZID↔VTIMEZONE,
§3.3.11 TEXT kaçışı).

**ÖNCESİ** — HEAD sürümündeki `generateIcsContent`'e karşı koşturuldu:

```
BEFORE violations: [
  "§3.1 the final content line is not terminated by CRLF"
]
 Tests  1 failed | 9 passed (10)
```

**SONRASI:**

```
$ npx vitest run src/lib/calendar.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)      ← rfc5545Violations(...) === []
```

Üretilen akış (CRLF `⏎` ile gösterildi) — kartın şüphelendiği her madde zaten doğruydu:

```
BEGIN:VCALENDAR⏎
VERSION:2.0⏎
PRODID:-//Fabrika SaaS//EN⏎
BEGIN:VEVENT⏎
UID:7714ca92-…-72f294bc3ce2@fabrika.app⏎
DTSTAMP:20260907T193649Z⏎
DTSTART:20260915T140000Z⏎
DTEND:20260915T150000Z⏎
SUMMARY:Toplantı: Fraunhofer\; ana konu\, bütçe⏎
DESCRIPTION:Satır bir\nSatır iki — üüüüüüüüüüüüüüüüüü⏎
 üüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüü⏎
 üüüüü⏎
END:VEVENT⏎
END:VCALENDAR            ← ihlal buradaydı: sonda CRLF yok
```

Tarih/saat kuralı (CLAUDE.md kural 10): DB UTC, `DTSTART`/`DTEND` `Z` ekli UTC — geçerli
RFC 5545, `VTIMEZONE` gerekmiyor. Doğrulayıcı yine de "TZID kullanılıp `VTIMEZONE` yoksa"
kuralını sabitliyor ki ileride biri yerel saate geçerse test yakalasın.

### 2.2 Bağlama akışı — birim testler

```
$ npx vitest run tests/m9-calendar-connect.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

Sabitlenen davranışlar: `.ics` gerçekten bağlanır ve yazılan satır dönen sonuçla **aynıdır**;
`google`/`outlook` reddedilir ve **`create` hiç çağrılmaz**; bilinmeyen sağlayıcı reddedilir;
ikinci bağlantı reddedilir; benzersizlik kontrolü oturumun tenant+user'ına göre kapsamlanır;
`disconnectCalendar` başka kiracının satırında `CALENDAR_FORBIDDEN` verir ve silmez;
`calendarErrorCode` tanınmayan hatayı **tanınmamış bırakır** (uydurma bir mesaja eşlemez).

### 2.3 Sağlayıcı testleri

```
$ npx vitest run src/lib/calendar
 Test Files  3 passed (3)
      Tests  34 passed (34)
```

Var olan testler sahte id'leri (`/^google:/`, `/^outlook:/`) bekliyordu — **gevşetmedim,
gerçeğe göre düzelttim**: artık `CalendarProviderNotImplementedError` bekliyorlar. ICS için
iki yeni test: aynı olay iki kez → **aynı** externalId; çağıranın verdiği handle korunuyor.

### 2.4 Gerçek tarayıcı (gerçek tıklama)

```
$ npx playwright test tests/e2e/m9-calendar-connect.spec.ts
  ✓ an unconfigured provider is refused in Turkish, not silently swallowed
  ✓ the browser tab title follows the locale
  ✓ .ics connects for real and the screen reflects the stored row
  3 passed (5.0s)
```

Ekran görüntüleri: `docs/agent-results/TASK-MTQUTBH8Q9VMK-screenshots/`
- `connect-google-refused.png` — "Bağla"ya tıklandı; sarı `role="alert"` bandı: *"Bu sağlayıcı
  henüz bağlanamıyor: bu kurulumda OAuth istemcisi tanımlı değil. Şimdilik toplantı brifinden
  .ics dosyasını indirip takviminize ekleyebilirsiniz."* Test ayrıca **DB'de satır
  oluşmadığını** (`count === 0`) ve butonun "Bağlanıyor…"da takılı kalmadığını doğruluyor.
- `connect-ics-connected.png` — ".ics File Import · **Bağlı** · Bağlı — henüz senkronize edilen
  bir toplantı yok." Test satırı DB'den okuyup `isConnected === true`, `lastSyncAt === null`
  doğruluyor.

Test titizliği notu: ilk denemede `getByText('Bu sağlayıcı henüz bağlanamıyor')` kartın **kendi
açıklamasıyla** eşleşiyordu, yani tıklama hiçbir şey yapmasa bile geçerdi. Assertion
`role="alert"` bandına daraltıldı (Next.js'in kendi route announcer'ı hariç tutularak).

### 2.5 Kapılar

```
$ npx tsc --noEmit          → benim dosyalarımda 0 hata
$ npx eslint <8 dosya>      → 0 problem
$ npx vitest run tests/i18n.test.ts tests/translation.test.ts → 6 passed
$ npx vitest run            → Tests 4 failed | 1038 passed | 8 skipped (1050)
```

**Kırmızı satır benim değil:** dört FAIL `tests/m11-partb-editor-buffer.test.tsx`
(`PartBCollaborativeEditor.tsx:114`, next-intl context) — blockzincir-pm'in uçuştaki dosyası.
`tsc` ayrıca `scripts/_probe-cordis*.ts` / `_probe-k2-stub.ts` için 6 hata veriyor; bunlar
başka bir ajanın untracked taslak dosyaları.

---

## 3. Değişen dosyalar

**Kod**
- `src/lib/calendar.ts` (RFC 5545 sonlandırma)
- `src/lib/calendar/errors.ts` (yeni), `provider.ts`, `ics.ts`, `google.ts`, `outlook.ts`
- `src/modules/m9/server/calendar-actions.ts`
- `src/app/[locale]/(app)/[workspace]/settings/calendar/client.tsx`, `page.tsx`
- `messages/tr.json`, `messages/en.json` (`settings.calendar`: 8 yeni anahtar + `infoText`)

**Test**
- `src/lib/calendar.test.ts` (doğrulayıcı + 2 test), `src/lib/calendar/__tests__/provider.test.ts`
- `tests/m9-calendar-connect.test.ts` (yeni), `tests/e2e/m9-calendar-connect.spec.ts` (yeni)

**Kanıt**: `docs/agent-results/TASK-MTQUTBH8Q9VMK-screenshots/*.png`

---

## 4. Riskler

- **Google/Outlook artık `createEvent`'te throw ediyor.** Bir kiracıda bu sağlayıcılara ait
  eski bir `CalendarConnection` satırı varsa (bu düzeltmeden önce yazılmış olabilir), her
  brif zamanlamasında bir `SystemAlert` (`calendar_sync_failed`) düşecek. İstenen sinyal bu —
  ama alert panosunda gürültü yaratabilir. Temizlik: o satırların silinmesi.
- `messages/*.json` **paylaşılan dosya**. Commit'im başka bir ajanın çalışma ağacında duran
  iki m6 anahtarını (`notMeasured`, `notMeasuredReason.*`) da taşıyor — ekleyici anahtarlar,
  içeriklerini birebir korudum, silmedim. Bkz. §5.
- `.ics` bağlantısı ürünün akışında hâlâ bir "push" hedefi değil: dosyayı kullanıcı indiriyor.
  `IcsProvider.createEvent` artık tutarlı bir handle üretiyor ama bu, kullanıcıya bir dosya
  teslim edildiği anlamına gelmiyor.

---

## 5. Açık sorular / bildirimler

1. **OAuth gerçekten uygulanmadı.** Google/Outlook için istemci kimliği, token değişimi ve
   `/api/calendar/callback` route'u yok. Bunları uydurmak yerine sağlayıcıları açıkça
   "henüz bağlanamıyor" olarak işaretledim. Uygulanınca yapılacak tek şey:
   `SELF_SERVE_PROVIDERS`'a eklemek — `tests/m9-calendar-connect.test.ts` bunu bilinçli bir
   değişiklik hâline getiriyor (liste testle sabitlendi).
2. `messages/{tr,en}.json` commit'i, benim `settings.calendar` anahtarlarımın yanında başka bir
   ajanın uncommitted m6 `notMeasured` anahtarlarını da içeriyor. Paylaşılan dosyada kendi
   satırımı ayrı commit etmenin güvenli yolu yok (bkz. shared hafıza
   `fabrika-staged-work-gets-swallowed`); içeriği korudum ve burada bildiriyorum.
3. `sync.ts` toplantı süresini hâlâ sabit 1 saat alıyor ve `DESCRIPTION`'a brifin ham
   Markdown'ını basıyor (P1-5 hafızasındaki iki caller-side madde). Benim kartımın kapsamı
   değil; `src/modules/m9/server/actions.ts` başka kartın dosyası.

---

## 5.1 Commit kazası — bildiriyorum, geçmişi yeniden yazmıyorum

Commit `4edaecc` **51 dosya** içeriyor; bunların ~35'i başka ajanların çalışma ağacındaki
işidir. Sebep: `messages/*.json` paylaşılan dosyasının **yalnızca kendi anahtarlarımı**
commit etmek için shared hafızadaki blob tekniğini kullandım
(`git hash-object -w` + `git update-index --cacheinfo`), ve bu teknik **pathspec'siz**
`git commit` gerektiriyor. Pathspec'i bırakınca `git add` ile `git commit` arasındaki
saniyelerde başka ajanların sahnelediği dosyalar da commit'e girdi — yani
`fabrika-staged-work-gets-swallowed` hafızasının tarif ettiği tuzağın **diğer yönü**.

- Commit **öncesi** index'i doğruladım (`git diff --cached --name-only`): yalnız benim
  18 dosyam vardı. Yabancı dosyalar o kontrolden **sonra**, commit sırasında girdi.
- Blob tekniği amacına ulaştı: `messages/{tr,en}.json`'a **yalnız** benim `settings.calendar`
  anahtarlarım indi; diğer ajanların m6 `notMeasured` ve `callsIndex` anahtarları hâlâ
  çalışma ağacında/index'te onları bekliyor.
- **İçerik kaybı yok**: çalışma ağacındaki dosyalar değişmedi, sadece daha erken commit'lendi.
  Commit sonrası `npx vitest run` → önceki koşumla aynı (4 FAIL, hepsi m11-partb, benim değil).
- Paylaşılan dal olduğu için geçmişi **yeniden yazmadım** (shared hafızanın kuralı).
  Etkilenen ajanlar kendi dosyalarını `4edaecc` içinde bulacak; commit mesajı onların işini
  anlatmıyor.

Ders takım hafızasına yazıldı: blob tekniği ile pathspec-güvenliği **aynı anda** kullanılamıyor;
paylaşılan bir dosyaya yalnız kendi satırını yazmanın maliyeti, o commit'te başkasının
sahnelenmiş işini yutma riskidir.

## 6. Sonraki adım

- OAuth callback route'u + token saklama (ayrı kart). Yapıldığında `SELF_SERVE_PROVIDERS`
  güncellenir ve bu karttaki testler kılavuz olur.
- `sync.ts` toplantı süresi / DESCRIPTION düz metin dönüşümü.

---

## 7. Definition of Done

- [x] `.ics` bir doğrulayıcıdan geçirildi; hangi satırın RFC 5545'i ihlal ettiği gösterildi (§2.1)
- [x] Doğrulayıcı çıktısı öncesi (1 ihlal) / sonrası (0 ihlal)
- [x] Kartın diğer `.ics` iddiaları ölçümle bayat ilan edildi, düzeltme uydurulmadı
- [x] Bağlama akışı görünür: gerçek action çağrısı, çevrilmiş sonuç, ekran görüntüsü (§2.4)
- [x] Sahte başarı kaldırıldı: `{ success: true }` + `isConnected: false` yok; mock sağlayıcılar sahte id üretmiyor
- [x] Kullanıcıya görünen yeni metinlerin tamamı `t('...')`, iki dile de eklendi
- [x] Tarih/saat kuralı korundu: DB UTC, `Z` ekli UTC DATE-TIME, tahmini timezone yok
- [x] Birim + e2e testler yeşil; gevşetilen test yok (var olan testler gerçeğe göre düzeltildi)
- [x] `tsc`/`eslint` benim dosyalarımda temiz; kırmızı satırlar başka ajanların dosyalarında ve öyle raporlandı
