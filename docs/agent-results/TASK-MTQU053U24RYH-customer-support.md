# TASK-MTQU053U24RYH — M9 Toplantı Brief + Takvim Akışı: Düşman Kullanıcı Testi

**Ajan:** customer-support (CS-EN) · **Tip:** QA/dogfood · **Sprint:** S10 · **Tarih:** 2026-09-07
**Test edilen:** `src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/` · `src/modules/m9/server/actions.ts` · `src/lib/calendar/*`
**Bkz:** `docs/agent-results/TASK-MTPZL5YDY9TAW-blok-zincir-dse.md`, `docs/agent-results/TASK-MTPZLC9PI5VEH-blok-zincir-dse.md`
**Kanıt dizini:** `docs/agent-results/TASK-MTQU053U24RYH-screenshots/`

> **Not (rapor yolu):** Alt-görev metnindeki "KANIT ZORUNLU" bloğu sonuç dosyası olarak
> `TASK-MTQTYE287FERM-ex-en.md` yolunu veriyordu; o dosya **başka bir ajanın (ex-en) Evaluator Lens
> görevine** ait. Board'daki kendi kartım `TASK-MTQU053U24RYH`. Başka bir ajanın raporunun üzerine
> yazmamak için rapor kendi kart id'ime yazıldı. Bu bilinçli bir sapmadır.

---

## 1. Ne yapıldı

Gerçek tarayıcıda (Playwright/Chromium, headed DOM, gerçek tıklama ve yazma), gerçek oturumla
(`owner@demo.fabrika.test`, tenant `demo-tenant`/`fabrika-beta`) M9 brief + takvim akışı
**24 senaryo** ile denendi. Mutlu yol değil kenarlar arandı: boş/boşluk girdi, eksik alan, XSS,
600 karakterlik ad, çift tık, uydurma URL, başka kiracının fırsatı, EN dili, mobil genişlik,
DST sınırında saat dilimi, .ics dosyasının kendisi.

Ayrıca veritabanı `pg` ile doğrudan sorgulandı (yan etki var mı — brief/kredi/AI log yazıldı mı),
ve `.ics` üreteci gerçek modül üzerinden RFC 5545'e karşı denetlendi.

**Sonuç: 14 bulgu (2× P0, 4× P1, 5× P2, 3× P3) + 6 doğrulanmış "çalışıyor" maddesi.**
**Özellik şu anda çalışan sürümde uçtan uca kullanılamaz durumda ve bunu kullanıcıya hiçbir şekilde söylemiyor.**

---

## 2. Bulgular (triyaj: önem × etki)

### P0-1 — Brief oluşturulmuyor; kullanıcı hiçbir geri bildirim almıyor

Formu doldurup **"Yapay Zeka Brief Oluştur"** düğmesine basıyorsunuz. Buton bir süre dönüyor,
sonra normale dönüyor. Liste hâlâ **"GÖRÜŞME KAYITLARI (0)"**. Hata yok, uyarı yok, toast yok.
4 farklı denemede (normal ad, XSS yükü, 600 karakter, çift tık) sonuç aynı.

Sunucu aslında **başarısız olduğunu söylüyor**, istemci bunu çöpe atıyor:

```
POST 200 http://localhost:3000/tr/fabrika-beta/opportunities/demo-opp-1/briefs
  BODY: 1:{"success":false,"brief":null,"error":"BRIEF_NOT_PERSISTED"}
```
<sub>kanıt: `screenshots/server-action-response.txt`</sub>

Veritabanında 4 denemeden sonra hiçbir yan etki yok:

```
>> select count(*)::int n from "MeetingBrief"                    -> [{"n":0}]
>> select ... from "CreditLedger" where reason ilike '%M9%'      -> []
>> select count(*)::int n from "AiUsageLog" where module='M9'    -> [{"n":0}]
```

**İki ayrı kusur üst üste binmiş:**

**(a) Kök neden — çalışan sunucunun Prisma istemcisi bayat.** `MeetingBrief.partnerName`,
`meetingScheduledAt`, `meetingScheduledTz` alanları şemada ve veritabanında var, ama ayakta olan
dev sunucusunun bellekteki istemcisi bunları tanımıyor. Sunucunun kendi logu:

```
.next/dev/logs/next-development.log:
[MeetingBriefsPage] DB query bypassed:
Invalid `tx.meetingBrief.findMany()` invocation ...
Unknown field `partnerName` for select statement on model `MeetingBrief`.
```

Doğrulama (kill etmeden ayırt edici test): veritabanına elle bir brief satırı yazdım
(`PROBE ORTAK A.S.`), sayfayı gerçek oturumla yeniden açtım →

```
records: GÖRÜŞME KAYITLARI (0)
probe visible: false
```

Aynı yazma işlemi **taze bir süreçte aynı kodla** sorunsuz çalışıyor:

```
$ npx tsx probe-m9.ts
CREATE OK {"id":"cmtquhrgq0000ttxk0r2ddc04","tenantId":"demo-tenant","partnerName":"Probe Partner",
           "meetingScheduledAt":"2026-10-24T11:00:00.000Z","meetingScheduledTz":"Europe/Brussels"}
```

Yani **kod doğru, ayaktaki örnek bayat**. DSE raporu şema değişikliğini `prisma db push` ile
uyguladığını yazıyor; dev sunucusu o sırada ayaktaydı ve istemci yeniden üretilmedi/yüklenmedi.
Çözüm operasyonel: `pnpm prisma generate` + dev sunucusunu yeniden başlat.
(Sunucuyu ben öldürmedim: pid 6498 başka bir pane'e ait olabilir, ekip hafızasında ön planda
çalışan `pnpm dev`'i öldürmenin pane'i düşürdüğü kayıtlı.)

**(b) Asıl ürün kusuru — hata yüzeyi yok.** (a) düzeltilse bile bu kalıcı bir kusur:
`client.tsx` yalnızca `res.brief`'e bakıyor, `res.success === false` ve `res.error` hiç okunmuyor;
`catch` bloğu da sadece `console.error` yapıyor.

```ts
// client.tsx handleGenerateBrief
if (res.brief) { ... }              // success:false sessizce yutuluyor
} catch (err) { console.error(...) } // kullanıcıya hiçbir şey söylenmiyor
```

Kullanıcı için anlamı: kredi harcandı mı, brief kaydedildi mi, yeniden denemeli mi —
**hiçbirini bilmiyor.** Destek tarafında bu "hiçbir şey olmuyor" biletine dönüşür ve
tekrar-üretim adımı çıkarmak imkânsızdır.

**Kanıt:** `screenshots/D06-brief-created.png`, `D06b-generate-attempt.png`, `D07-xss-payload.png`,
`D08-long-name.png`, `D09-double-click.png`, `server-action-response.txt`, `run-log.txt`

---

### P0-2 — Var olmayan fırsatta uydurma veri gerçekmiş gibi gösteriliyor

`/<locale>/<workspace>/opportunities/**kedi-kopek-42**/briefs` → 404 yok, boş durum yok.
Sayfa **uydurulmuş bir çağrı fırsatı** ve **uydurulmuş bir brief** gösteriyor:

- Fırsat: "HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems & Battery Tech"
- Ortak: "Fraunhofer Institute (Germany) — **PIC 999984059**"
- İstatistik: "**142 Horizon Europe participations, 48 coordinator roles**"

Sayfada bu verinin demo/örnek olduğunu söyleyen **hiçbir etiket yok**. Metinde "demo" kelimesi
yalnızca giriş yapan kullanıcının adında ("Demo Owner") geçiyor:

```
MATCH "demo" -> context: ... | Ayarlar | DO | Demo Owner | Pipeline'a Dön | MODÜL 9 ...
```

Aynı şey **başka bir kiracının fırsat id'sinde** de oluyor (`esr-cal-S05`, `partner01@example.invalid`
oturumu): gerçek veri sızmıyor (**kiracı izolasyonu tutuyor ✅**) ama kullanıcıya "bulunamadı"
yerine bu uydurma dosya gösteriliyor.

Kaynak: `page.tsx` — `if (!opp) { opp = {...sabit...}; briefs = [{...sabit Fraunhofer...}] }`
ve DB hatasında da aynı dala düşülüyor.

Bu **CLAUDE.md kural 7** ihlali ("Kullanıcıya gösterilen her istatistik/oran `Evidence` veya
`TopicStat` kaydına bağlıdır; kod içine sabit rakam yazma") ve daha önce
`TASK-MTQAVUXFPHHKG` sahte-rakam denetiminde yakalanan kalıbın aynısı.
Kullanıcı bu ekranı yazdırıp ortağına götürebilir — PIC numarası uydurma.

**Kanıt:** `screenshots/01-fake-opportunity-fake-brief.png`, `D15-bogus-opportunity.png`,
`D17-cross-tenant.png`

---

### P1-3 — Toplantı sonrası notlar sessizce kayboluyor (veri kaybı)

Kararlar + 40 kelimelik toplantı notu + 3 aksiyon maddesi girildi, "Toplantı Sonrası Notlarını
Brief'e Ekle" tıklandı:

```
[D21] after save: textarea now="" (empty = fields cleared) | note present on page: false
      | action items left: 0 | any error message: false | dialog=null
```

Tüm alanlar temizlendi, hiçbir şey kaydedilmedi, hiçbir hata gösterilmedi.
`savePostMeetingNotes` `{ success:false, formattedPostNotes:'' }` dönüyor; `client.tsx`
dönüş değerine bakmadan `setMeetingNotes('')`, `setActionItems([])` çağırıyor.

Kullanıcı toplantıdan yeni çıkmış, notlarını yazmış — hepsi gitti, üstelik "gitti" bile demedi.
Destek açısından en pahalı kusur tipi budur.

**Kanıt:** `screenshots/D21-notes-silently-lost.png` (ekranda: brief metni değişmemiş, tüm form alanları boş)

---

### P1-4 — i18n yok: `/en/` sayfası tamamen Türkçe

```
[D16] EN locale h1="Görüşme Brifingi & Not Alma Motoru" submit="Yapay Zeka Brief Oluştur"
```

`client.tsx` içinde tek bir `t('...')` çağrısı yok; tüm metin gömülü Türkçe.
DSE raporu "40+ anahtar, `src/locales/tr/briefs.json` & `src/locales/en/briefs.json`" diyor —
o dosyalar var ama **hiçbir yerden import edilmiyor**:

```
$ grep -rn "locales/en/briefs\|locales/tr/briefs\|briefs.json" src --include=*.ts --include=*.tsx
(çıktı yok)
```

`next-intl` mesajları `messages/{locale}.json`'dan okuyor (`src/i18n/request.ts`), `src/locales/`
dizininden değil. Yani katalog dosyaları ölü.
**CLAUDE.md kural 8** ihlali. İngilizce kullanan bir AB koordinatörü ekranı okuyamaz.

**Kanıt:** `screenshots/02-en-locale-fully-turkish.png`, `D16-en-locale.png`

---

### P1-5 — İndirilen `.ics` dosyası RFC 5545'e uymuyor

Gerçek modül (`src/lib/calendar.ts` → `generateIcsContent`), UI'ın gönderdiği argümanlarla
çalıştırıldı:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Fabrika SaaS//EN
BEGIN:VEVENT
DTSTART:20261024T110000Z
DTEND:20261024T120000Z
SUMMARY:Görüşme: Fraunhofer Institute; Munich, DE
DESCRIPTION:### 1. Partner Background & EU Track Record\n- **Partner:** Fraunhofer Institute (Germany) — PIC 999984059\n- ...
END:VEVENT
END:VCALENDAR

--- RFC 5545 conformance of the real module ---
FAIL  UID present (REQUIRED)
FAIL  DTSTAMP present (REQUIRED)
FAIL  comma escaped in TEXT values
FAIL  semicolon escaped in TEXT values
FAIL  lines folded to <=75 octets
longest line octets: 202
```

- `UID` ve `DTSTAMP` **zorunlu** (RFC 5545 §3.6.1). Yoksa katı ayrıştırıcılar dosyayı reddeder;
  kabul edenlerde de her içe aktarma **yinelenen etkinlik** üretir (güncelleme eşleşmez).
- `SUMMARY`/`DESCRIPTION` içindeki `,` ve `;` kaçışlanmamış (§3.3.11) — ortak adında virgül
  ("Fraunhofer Institute; Munich, DE") olması yeter, alan orada kesilir.
- 202 oktetlik satır katlanmamış (§3.1).
- Ayrıca `DESCRIPTION`'a brief'in ham Markdown'ı (`###`, `**`) 200 karakter kesilerek basılıyor —
  takvimde cümle ortasında biten, yıldızlı bir metin görünüyor.
- Etkinlik süresi sabit 1 saat; kullanıcı giremiyor.

**Kanıt:** `screenshots/ics-rfc5545-check.txt`

---

### P1-6 — Takvim bağlama akışı kullanıcı için hiç yok (görevin 4. maddesi)

Görev "takvim bağlama akışını dene, kimlik bilgisi yoksa kullanıcıya ne deniyor" diyor.
**Cevap: hiçbir şey denmiyor, çünkü akış yok.**

- Hiçbir `.tsx` dosyası `CalendarConnection`'a değmiyor (`grep -rn "CalendarConnection" src --include=*.tsx` → boş).
- Ayarlar/panel sayfalarında "takvim", "calendar", "Outlook" geçmiyor:
  ```
  [D23] /tr/fabrika-beta/ayarlar  -> mentions takvim/calendar/outlook: false (len 3948)
  [D23] /tr/fabrika-beta/panel    -> mentions takvim/calendar/outlook: false (len 656)
  ```
- Dahası, `CalendarConnection` tablosu **dev veritabanında yok**:
  ```
  >> select count(*)::int from "CalendarConnection"
     ERR relation "CalendarConnection" does not exist
  ```
  Migration dosyası (`prisma/migrations/add-calendar-connections/migration.sql`) yazılmış ama
  uygulanmamış. Senkron çağrısı bu yüzden çalıştığı anda patlar; `actions.ts` bunu
  `"Calendar sync failed (non-critical)"` diye yutuyor — kullanıcı senkronun olmadığını öğrenemez.
- Kullanıcının takvime ulaşabileceği tek yol `.ics` düğmesi; o da **yalnızca toplantı tarihi olan
  bir brief seçiliyken** çıkıyor. Şu anki durumda hiçbir gerçek brief yüklenemediği ve tek görünen
  brief (uydurma olan) tarihsiz olduğu için düğme **hiç görünmüyor**:
  ```
  [D10] .ics button count on active brief: 0
  [D18] .ics button present: 0 | Yazdır present: 1
  ```

**Olumlu tarafı:** ham hata / stack trace kullanıcıya gösterilmiyor. Ama bunun nedeni iyi hata
mesajı değil, **hiç mesaj olmaması**.

**Kanıt:** `screenshots/D23-settings-no-calendar.png`, `D10-ics.png`, `D18`/`D23` satırları `run-log.txt`

---

### P2-7 — Brief'ler fırsata bağlı değil (şema seviyesinde)

Sayfa `/opportunities/[id]/briefs` ama sorgu fırsata göre filtrelemiyor:

```ts
briefs = await tx.meetingBrief.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
```

`prisma/schema.prisma:998` — `MeetingBrief`'te `opportunityId` **yok**. Yani filtreleme
"unutulmuş" değil, **mümkün değil**: kiracının tüm brief'leri her fırsatın sayfasında listelenir.

Ampirik olarak gösterilemedi (P0-1 nedeniyle tabloda 0 satır var); kod + şema seviyesinde kesin.
`D14-other-opportunity-same-briefs.png` iki fırsatın da (0) gösterdiğini belgeliyor.

---

### P2-8 — Boşluktan ibaret ortak adı: buton hiçbir şey yapmıyor

`required` niteliği `"   "` girdisini geçiriyor, handler `if (!partnerName.trim()) return;` ile
sessizce çıkıyor. Kullanıcı için: tıkladım, hiçbir şey olmadı, neden olmadığını bilmiyorum.

```
[D02] whitespace-only name submitted. visible feedback dialog=null | button="Yapay Zeka Brief Oluştur"
```
**Kanıt:** `screenshots/D02-whitespace-name.png`

### P2-9 — Saat girilmeyince tarih sessizce atılıyor

Sadece tarih (`2026-10-24`) girildiğinde Brüksel önizleme kutusu hiç çıkmıyor ve
`meetingScheduledAt` `undefined` gönderiliyor. Kullanıcı tarihi girdiğini görüyor, sistem
girmemiş sayıyor; sonuçta `.ics` düğmesi de çıkmıyor ve nedeni söylenmiyor.

```
[D03] date filled, no time -> Brussels preview blocks visible: 0
```
**Kanıt:** `screenshots/D03-date-without-time.png`

### P2-10 — Aksiyon maddelerinde tekrar ve uzunluk denetimi yok

Aynı madde iki kez eklenebiliyor, 300 karakterlik tek madde kabul ediliyor, boş madde ise
sessizce yok sayılıyor (uyarı yok).

```
[D19] empty action item -> li count=0 dialog=null
[D20] after 3 adds (2 duplicates + 300 chars) -> li count=3
```
**Kanıt:** `screenshots/D20-action-items.png`

### P2-11 — (M9'a özgü değil) React sonsuz render döngüsü uyarısı

Brief sayfasında 51, `/panel` sayfasında 56 kez:

```
Maximum update depth exceeded. This can happen when a component calls setState inside useEffect...
```

Panelde de çıktığı için kaynağı M9 değil, ortak bir layout/provider. Not: çalışma ağacında şu an
`src/components/ThemeProvider.tsx`, `ThemeToggle.tsx`, `cart/CartContext.tsx` başka bir ajan
tarafından değiştirilmiş durumda — bulgu bu haldeki ağaçta ölçüldü, kaynak ayrı olarak
araştırılmalı. Kullanıcıya görünen etkisi: sayfa yavaşlar, düşük donanımda ısınır.

### P3-12 — `MODÜL 9 — MEETİNG BRİEFS`

`text-transform: uppercase` Türkçe dil bağlamında İngilizce kelimeye uygulanınca `i → İ` oluyor:
"MEETİNG BRİEFS". `/en/` sayfasında doğru ("MEETING BRIEFS") ama başlığın kalanı yine Türkçe.

### P3-13 — Kullanıcıya ham ISO zaman damgası gösteriliyor

Brief detayında: `Toplantı Tarihi (UTC): 2026-10-24T11:00:00.000Z`. Son kullanıcı için okunabilir
bir biçim değil; ayrıca `meetingScheduledTz` alanı kaydediliyor ama gösterimde hiç kullanılmıyor —
gösterim her zaman sabit `Europe/Brussels`.

### P3-14 — `alert()` ile hata mesajı

`handleDownloadIcs` içinde `alert('Toplantı tarihi belirlenmemiş')`. Hem tasarım sistemi dışı ve
çevrilmemiş, hem de ulaşılamaz (düğme zaten yalnızca tarih varken render ediliyor).

---

## 3. Çalışan taraf (regresyon koruması için kayda geçsin)

| # | Kontrol | Sonuç |
|---|---------|-------|
| ✅ 1 | **Saat dilimi / DST.** Tarayıcı `Europe/Istanbul`. `2026-10-24 14:00` (yaz saati, Brüksel CEST) → önizleme `24.10.2026 13:00:00`. `2026-11-01 14:00` (kış saati, Brüksel CET) → `01.11.2026 12:00:00`. İkisi de **doğru**; DST sınırı düzgün geçiliyor. Etikette "UTC olarak kaydedilecektir" yazıyor. CLAUDE.md kural 10 bu yönüyle karşılanıyor. |
| ✅ 2 | **XSS.** Ortak adı olarak `<img src=x onerror="document.title='XSS'">` gönderildi; sayfa başlığı `Fabrika` olarak kaldı, React metni kaçışlıyor. |
| ✅ 3 | **Kiracı izolasyonu (sayfa).** `partner01@example.invalid` (başka kiracı) `demo-opp-1` brief sayfasını açtığında bizim kiracımızın fırsat başlığını ya da brief'lerini **görmüyor**. |
| ✅ 4 | **Sunucu eylemi kimliği.** `generateMeetingBrief`/`savePostMeetingNotes` `tenantId`+`userId`'yi oturumdan okuyor, istemci parametresinden değil (`requireTenantAction()`); `savePostMeetingNotes` brief'i `{id, tenantId}` ile arıyor. |
| ✅ 5 | **Mobil.** 390×844 görünümde yatay taşma yok. |
| ✅ 6 | **Ham hata sızıntısı yok.** Kullanıcıya hiçbir noktada stack trace / HTTP kodu / ham hata gövdesi gösterilmedi. (Ama bunun nedeni iyi hata iletişimi değil, hiç hata iletişimi olmaması — bkz. P0-1, P1-3.) |

---

## 4. Yapılan 24 denemenin listesi

| # | Deneme | Sonuç |
|---|--------|-------|
| D01 | Oturum aç, `demo-opp-1` brief sayfasını aç | Sayfa açıldı, gerçek fırsat başlığı, "GÖRÜŞME KAYITLARI (0)" |
| D02 | Ortak adına `"   "` (üç boşluk) yazıp gönder | **Hiçbir şey olmuyor**, mesaj yok → P2-8 |
| D03 | Tarih gir, saat girme | Brüksel önizlemesi çıkmıyor, tarih sessizce atılıyor → P2-9 |
| D04 | `2026-10-24 14:00` (Istanbul) | Önizleme `24.10.2026 13:00:00` (CEST) — **doğru** ✅ |
| D05 | `2026-11-01 14:00` (DST sonrası) | Önizleme `01.11.2026 12:00:00` (CET) — **doğru** ✅ |
| D06 | Geçerli ad + tarih + saat ile brief oluştur | **(0) kaldı**, hata yok → P0-1 |
| D06b | Aynısı, ağ trafiği izlenerek | `{"success":false,"error":"BRIEF_NOT_PERSISTED"}` yutuluyor → P0-1 |
| D07 | Ortak adı = XSS yükü | Kaçışlandı ✅ ama yine brief yok |
| D08 | Ortak adı = 600 karakter | Düzen bozulmadı ✅, yine brief yok |
| D09 | Gönder düğmesine çift tık | Yinelenen brief yok (zaten hiç yok); kredi de düşmedi |
| D10 | `.ics` indir | **Düğme hiç yok** (tarihli brief render edilemiyor) → P1-6 |
| D11 | Boş aksiyon maddesi ekle | Sessizce yok sayılıyor → P2-10 |
| D12 | Toplantı sonrası not kaydet (gerçek brief) | Test edilemedi (brief yok) |
| D13 | Sayfayı yenile | Hâlâ (0); hiçbir şey kalıcı olmamış |
| D14 | `demo-opp-2` brief sayfası | (0); fırsata göre filtre yok → P2-7 (kod seviyesinde) |
| D15 | `opportunities/kedi-kopek-42/briefs` | **Uydurma fırsat + uydurma Fraunhofer brief'i** → P0-2 |
| D16 | `/en/...` | Tamamen Türkçe → P1-4 |
| D17 | Başka kiracının kullanıcısıyla aynı URL | Sızıntı yok ✅, ama yine uydurma veri → P0-2 |
| D18 | Uydurma brief'te "demo/örnek" etiketi var mı | **Yok** (eşleşen "demo" yalnızca kullanıcı adı) → P0-2 |
| D19 | Boş aksiyon maddesi (uydurma brief üstünde) | Sessiz yok sayma |
| D20 | 2 yinelenen + 1× 300 karakterlik aksiyon maddesi | Hepsi kabul, denetim yok → P2-10 |
| D21 | Kararlar + notlar + 3 aksiyon → kaydet | **Tümü silindi, kaydedilmedi, hata yok** → P1-3 |
| D22 | Yazdır | Sayfa yanıt veriyor ✅ |
| D23 | Ayarlar/panel'de takvim bağlama yüzeyi | **Yok** → P1-6 |
| D24 | 390px mobil görünüm | Yatay taşma yok ✅ |
| + | `.ics` üretecinin RFC 5545 denetimi | 5/5 FAIL → P1-5 |
| + | DB yan etki sorgusu (brief/kredi/AI log) | Üçü de 0 → P0-1 |

---

## 5. Kanıt dosyaları

```
docs/agent-results/TASK-MTQU053U24RYH-screenshots/
├── 01-fake-opportunity-fake-brief.png   P0-2 uydurma fırsat + uydurma brief (PIC 999984059)
├── 02-en-locale-fully-turkish.png       P1-4 /en/ tamamen Türkçe
├── D01-loaded.png … D24-mobile.png      21 ekran görüntüsü, deneme başına
├── D21-notes-silently-lost.png          P1-3 notlar silindi, hata yok
├── ics-rfc5545-check.txt                P1-5 gerçek modül çıktısı + 5 FAIL
├── server-action-response.txt           P0-1 BRIEF_NOT_PERSISTED gövdesi
└── run-log.txt                          24 denemenin ham günlüğü
```

---

## 6. Değişen dosyalar

Ürün kodunda **hiçbir değişiklik yok** (bu bir QA görevi). Eklenen dosyalar:

- `docs/agent-results/TASK-MTQU053U24RYH-customer-support.md` (bu rapor)
- `docs/agent-results/TASK-MTQU053U24RYH-screenshots/` (24 kanıt dosyası)

Test sırasında veritabanına yazılan tüm probe satırları geri alındı
(`MeetingBrief` şu an 0 satır, `CreditLedger`'a probe kaydı bırakılmadı); geçici script'ler silindi.

---

## 7. Riskler

1. **İtibar/hukuk (P0-2):** Uydurma PIC numarası ve uydurma katılım istatistikleri gerçek bir
   ortak kurumun adıyla ("Fraunhofer Institute") gösteriliyor. Kullanıcı bunu yazdırıp
   ortağına götürebilir. CLAUDE.md kural 7 ihlali.
2. **Veri kaybı (P1-3):** Toplantı sonrası notlar geri döndürülemez biçimde kayboluyor.
3. **Yanlış kapanmış kart riski:** `TASK-MTPZL5YDY9TAW` ve `TASK-MTPZLC9PI5VEH` raporları
   "typecheck temiz, 454 test PASS" kanıtıyla `review`'da. İkisi de doğru; ama hiçbiri
   **çalışan uygulamada gerçek tıklama** kanıtı içermiyor ve ürün o katmanda çalışmıyor.
   Birim testi + typecheck bu kusurların hiçbirini yakalayamaz.
4. **Kredi/faturalama:** Bugün brief hiç yazılmadığı için kredi de düşmüyor. (a) düzeltildiğinde
   kredi düşürme ile brief yazımı aynı transaction'da olduğu için tutarlı — ama istemci
   `success:false`'ı yutmaya devam ederse kullanıcı kredisinin ne olduğunu göremez.
5. **Ölçülemedi:** Fırsata göre filtreleme (P2-7) yalnızca kod/şema seviyesinde kanıtlandı;
   P0-1 düzeldikten sonra 2 fırsat × 1 brief ile ampirik doğrulanmalı.

---

## 8. Açık sorular

1. `prisma db push` ile uygulanan M9 şema değişikliği **migration olarak** kayıtlı mı, yoksa
   yalnızca yerel DB'de mi? `_prisma_migrations` tablosu dev DB'de **yok** — migration geçmişi
   izlenmiyor. `add-calendar-connections` hiç uygulanmamış. Bu bir CI/deploy sorusu (PM/DSE).
2. `MeetingBrief.opportunityId` eklenecek mi, yoksa brief'ler bilinçli olarak kiracı-genelinde mi
   tutulacak? Route `/opportunities/[id]/briefs` olduğu sürece ilki gerekiyor.
3. Uydurma fallback verisi neden var? Demo amaçlıysa açık bir "örnek veri" rozeti + yalnızca
   `demo-tenant` koşulu; değilse kaldırılıp 404/boş durum konmalı. Ürün kararı.
4. "Maximum update depth exceeded" — hangi provider'dan geliyor? Çalışma ağacındaki
   ThemeProvider/CartContext değişiklikleriyle mi ilgili? Ayrı bir kart konusu.

---

## 9. Sonraki adım

Board'a üç kart açıldı (bu raporun bulgularına atıflı):

| Kart | Öncelik | Bulgu | Konu |
|------|---------|-------|------|
| `TASK-MTQURC2H4E0WF` | P0 | P0-1, P1-3, P2-8 | Brief üretimi sessizce başarısız — hata yüzeyi yok, notlar kayboluyor, ayaktaki Prisma istemcisi bayat |
| `TASK-MTQUS5JH4DXJM` | P0 | P0-2 | Var olmayan/başka kiracının fırsatında uydurma brief gösteriliyor |
| `TASK-MTQUTBH8Q9VMK` | P1 | P1-4, P1-5, P1-6, P3-12/13/14 | `.ics` RFC 5545'e uymuyor + takvim bağlama yüzeyi yok + i18n yok |

Kart açılmayan bulgular (küçük, yukarıdaki kartlara iliştirilebilir ya da ayrı ele alınabilir):
P2-7 (brief'ler fırsata bağlı değil — şema kararı gerektiriyor, açık soru #2),
P2-10 (aksiyon maddesi denetimi), P2-11 (React render döngüsü — M9'a özgü değil, ayrı kart konusu).

Ek olarak, `TASK-MTPZL5YDY9TAW` ve `TASK-MTPZLC9PI5VEH` kartlarının `review` → `done` geçişi
**bu bulgular kapanmadan yapılmamalı**; kararı PM'e (`TASK-MTQTZNLS2CO2L`) bırakıyorum.
