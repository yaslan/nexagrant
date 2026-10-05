# TASK-MTQUTBH8Q9VMK — M9 takvim: kapanış ölçümü (2. tur)

**Ajan:** geli-tirici (BE-EN) · **Tip:** bug/P1 · **Sprint:** S12 Dalga 7 · **Tarih:** 2026-09-08 · **Dal:** dev

> Aynı kartın önceki turları: `TASK-MTQUTBH8Q9VMK-geli-tirici.md` (i18n namespace'i),
> `TASK-MTQUTBH8Q9VMK-customer-support.md` (commit `4edaecc` — akış sonlandırma + bağlama akışı).
> Bu tur kartı **kapatmak için ölçtü**: üç iddiayı ayrı ayrı, kendi kanıtımla sınadım ve
> ölçüm sırasında **hâlâ ayakta olan bir RFC 5545 kusuru** buldum (§3.8.4.7 — UID kalıcılığı).

---

## 0. Kart iddiaları — ayrı ayrı ölçüm

| # | Kart iddiası | Ölçümüm | Sonuç |
|---|---|---|---|
| a | `.ics` RFC 5545'e uymuyor | Tarayıcıdan **gerçekten indirilen** dosyayı iki **bağımsız** ayrıştırıcıdan geçirdim (python `icalendar` 6.3.2 ve `ical.js` 2 — Thunderbird'ün ayrıştırıcısı). CRLF, 75-oktet katlama, `BEGIN:VCALENDAR`/`VERSION`/`PRODID`, `DTSTAMP`/`DTSTART` UTC, TEXT kaçışı **hepsi geçti**. **AMA** UID her tıklamada taze `randomUUID()` idi → aynı brif iki kez indirilince takvime **iki ayrı etkinlik** düşüyordu (§3.8.4.7 UID = bileşenin kalıcı kimliği). | **BÜYÜK ÖLÇÜDE BAYAT — bir gerçek kusur kaldı, DÜZELTİLDİ** |
| b | Bağlama akışı hiç görünmüyor | Gerçek tarayıcıda tıkladım: `.ics` gerçekten bağlanıyor (satır `isConnected: true`), Google/Outlook **Türkçe gerekçeyle reddediliyor**, buton dinlenme durumuna dönüyor, yarım bağlantı satırı yazılmıyor. | **BAYAT** (commit `4edaecc` kapatmış) — kanıt ekran görüntüleri yenilendi |
| c | i18n yok | `settings.calendar` tr/en **18↔18**, `m9` **46↔46**, katalog geneli **1315↔1315**, tek yönlü anahtar yok. **AMA** `settings/calendar/page.tsx` breadcrumb'ı üç adet `locale === 'tr' ? 'Panel' : 'Dashboard'` sabitiydi — CLAUDE.md §8 ihlali, katalog dışı kullanıcı metni. | **KISMEN BAYAT — kalan ihlal DÜZELTİLDİ** |

Kartın "hiç" ifadeleri (a: uymuyor, b: hiç görünmüyor, c: yok) bugün **doğru değil**.
Ama "tamamen bayat" da değil: (a)'da yapısal bir ihlal, (c)'de bir kural ihlali kalmıştı.

---

## 1. Ne yapıldı

### 1.1 RFC 5545 §3.8.4.7 — UID artık brif satırının kimliği (`src/lib/calendar.ts`)

`UID:${randomUUID()}@fabrika.app` her çağrıda yeniden üretiliyordu. UID, takvim bileşeninin
**kalıcı** kimliğidir: aynı UID'yi taşıyan bir dosyayı ikinci kez içe aktaran istemci mevcut
etkinliği **günceller**; farklı UID ise **ikinci bir etkinlik ekler**. Yani kullanıcı brifi
yeniden indirdiğinde takviminde aynı toplantı iki kez beliriyordu.

- `generateIcsContent(..., uid?)` ve `createIcsDataUrl(..., uid?)` isteğe bağlı bir UID alıyor
  (varsayılan hâlâ `randomUUID()` — mevcut çağıranlar ve testler bozulmadı).
- Brif ekranı `brief-${activeBrief.id}@fabrika.app` geçiyor. Bu id **yeniden üretmede sağ
  kalıyor**: `generateMeetingBrief`, `(interactionId, tenantId)` ile eşleşen satırı `update`
  ediyor, yeni satır açmıyor (`src/modules/m9/server/actions.ts:98-113`).
- UID de TEXT değeri olduğu için `escapeIcsText`'ten geçiriliyor.

### 1.2 i18n: takvim ayarları breadcrumb'ı (`settings/calendar/page.tsx`)

Üç sabit metin (`Panel/Dashboard`, `Ayarlar/Settings`, `Takvim Bağlantıları/Calendar
Connections`) katalogdan okunuyor artık. İki yeni anahtar: `settings.calendar.breadcrumbHome`,
`settings.calendar.breadcrumbSettings` (**iki dile de** eklendi; desen `settings.privacy.breadcrumbHome`).

### 1.3 Testler

- `src/lib/calendar.test.ts` — verilen UID'nin çağrılar arası **sabit** kaldığını ve akışın
  konformans denetiminden geçtiğini doğrulayan yeni birim test (9 → 10 test).
- `tests/e2e/m9-ics-download.spec.ts` (**yeni**) — gerçek tarayıcı: giriş → brif ekranı →
  `Takvim (.ics)` butonuna tıkla → **inen dosyanın baytlarını** oku ve denetle (CRLF ile
  sonlanma, satır ≤75 oktet, `DTSTART` UTC anı, virgül/noktalı virgül/ters bölü kaçışı,
  `UID:brief-<id>@fabrika.app`), sonra **ikinci kez indir** ve UID'nin aynı kaldığını doğrula.

---

## 2. Kanıt

### 2.1 Tarayıcıdan gerçekten inen dosya

`docs/agent-results/TASK-MTQUTBH8Q9VMK-screenshots/brief-download.ics` (498 bayt) — düğmeye
gerçek tıklamayla inen dosyanın kendisi. Kasıtlı olarak düşman içerik: ortak adında virgül,
noktalı virgül ve ters bölü; açıklamada satır sonu ve 75 okteti aşan Türkçe metin.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Fabrika SaaS//EN
BEGIN:VEVENT
UID:brief-cmtshq59c0002pgxk8s27z66b@fabrika.app
DTSTAMP:20260908T095205Z
DTSTART:20261024T110000Z
DTEND:20261024T120000Z
SUMMARY:Görüşme: Fraunhofer Institut\, e.V.\; Şube\\Merkez
DESCRIPTION:Görüşme notları — bütçe\, iş paketleri\; risk maddeler
 i.\nTürkçe karakterlerle çok uzun bir satır: çğıöşü çğıöşü
  çğıöşü çğıöşü çğıöşü çğıöşü.
END:VEVENT
END:VCALENDAR
```

Akışın son baytları (CRLF ile **sonlanıyor**, ayırmıyor):

```
$ tail -c 60 brief-download.ics | xxd | tail -2
00000020: 0a45 4e44 3a56 4556 454e 540d 0a45 4e44  .END:VEVENT..END
00000030: 3a56 4341 4c45 4e44 4152 0d0a            :VCALENDAR..
```

### 2.2 Bağımsız ayrıştırıcı #1 — python `icalendar` 6.3.2 (repo kodundan bağımsız)

```
$ pip3 install icalendar   # 6.3.2
$ python3 validate.py      # satır denetimi + Calendar.from_ical
============================================================
FILE brief-download.ics 498 bytes
LINE CHECK: OK                       # CRLF sonlanma, çıplak LF/CR yok, hiçbir satır >75 oktet değil
PARSE: OK   VERSION= 2.0  PRODID= -//Fabrika SaaS//EN
  UID     : brief-cmtshq59c0002pgxk8s27z66b@fabrika.app
  DTSTAMP : 20260908T095205Z -> 2026-09-08 09:52:05+00:00
  DTSTART : 20261024T110000Z -> 2026-10-24 11:00:00+00:00 tzinfo= UTC
  DTEND   : 20261024T120000Z -> 2026-10-24 12:00:00+00:00
  SUMMARY : 'Görüşme: Fraunhofer Institut, e.V.; Şube\\Merkez'
  DESCR   : 'Görüşme notları — bütçe, iş paketleri; risk maddeleri.\nTürkçe karakterlerle çok uzun bir satır: çğıöşü çğıöşü çğıöşü çğıöşü çğıöşü çğıöşü.'
```

Kaçışlar **birebir geri açılıyor** (virgül, noktalı virgül, ters bölü, satır sonu) ve katlama
hiçbir çok-baytlı karakteri bölmemiş.

### 2.3 Bağımsız ayrıştırıcı #2 — `ical.js` 2 (Mozilla/Thunderbird)

```
$ node ical-check.mjs brief-download.ics
ical.js PARSE: OK
 prodid  : -//Fabrika SaaS//EN
 version : 2.0
 uid     : brief-cmtshq59c0002pgxk8s27z66b@fabrika.app
 summary : "Görüşme: Fraunhofer Institut, e.V.; Şube\\Merkez"
 start   : 2026-10-24T11:00:00Z utc? UTC
 end     : 2026-10-24T12:00:00Z
 duration: PT1H
```

### 2.4 Tarih/saat (CLAUDE.md §10) bozulmadı

DB'deki satır `meetingScheduledAt = 2026-10-24T11:00:00.000Z`, `meetingScheduledTz =
Europe/Brussels`. `.ics` `DTSTART:20261024T110000Z` yazıyor — **UTC anı**, Brüksel duvar saati
değil; `Z` ekli UTC olduğu için `VTIMEZONE` gerekmiyor (§3.3.5). Ekranda ise aynı kayıt
"Toplantı Tarihi (UTC): 2026-10-24T11:00:00.000Z / **Brüksel: 24.10.2026 13:00:00**" olarak
görünüyor (`brief-download-button.png`) — yani dosya ile ekran aynı anı gösteriyor.

### 2.5 E2E — gerçek tıklama

```
$ npx playwright test tests/e2e/m9-ics-download.spec.ts --reporter=list
  ✓  1 [chromium] › M9 .ics download › the downloaded file is RFC 5545 conformant and keeps one identity per brief (1.3s)
  1 passed (2.2s)

$ npx playwright test tests/e2e/m9-calendar-connect.spec.ts --reporter=list
  ✓  1 › an unconfigured provider is refused in Turkish, not silently swallowed (1.3s)
  ✓  2 › the browser tab title follows the locale (630ms)
  ✓  3 › .ics connects for real and the screen reflects the stored row (718ms)
  3 passed (3.3s)
```

İkinci indirme UID'si birinciyle aynı çıktı (spec'in son iddiası) — düzeltmenin uçtan uca kanıtı.

Ekran görüntüleri (`docs/agent-results/TASK-MTQUTBH8Q9VMK-screenshots/`):
- `brief-download-button.png` — brif ekranı, `Takvim (.ics)` butonu ve UTC + Brüksel satırı
- `connect-google-refused.png` — Google reddi, Türkçe gerekçe bandı (bu turda yeniden üretildi)
- `connect-ics-connected.png` — `.ics` gerçekten bağlı
- `breadcrumb-tr.png` / `breadcrumb-en.png` — breadcrumb iki dilde katalogdan

### 2.6 i18n sayımı

```
settings.calendar tr: 18 en: 18   only-tr: -   only-en: -     (breadcrumb'lardan önce; şimdi 20↔20)
m9                tr: 46 en: 46   only-tr: -   only-en: -
TOTAL             tr: 1315 en: 1315  only-tr: 0  only-en: 0
```

### 2.7 Kapı

```
$ pnpm gate
  lint      → eslint (çıktı yok, temiz)
  typecheck → tsc --noEmit (hata yok)
  test      → Test Files 101 passed | 2 skipped (103) · Tests 1187 passed | 8 skipped (1195)
  rls:check → ✅ 42 kiracıya özel modelin tamamında RLS politikası kayıtlı
  rls:verify→ ✅ Veritabanı 42 tablonun tamamında izolasyonu uyguluyor
```

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/calendar.ts` | `generateIcsContent`/`createIcsDataUrl` isteğe bağlı kalıcı `uid` alıyor (§3.8.4.7) |
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client.tsx` | İndirme `brief-<id>@fabrika.app` UID'si geçiyor |
| `src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx` | Breadcrumb'ın üç sabit metni `t()`'ye bağlandı |
| `messages/tr.json`, `messages/en.json` | `settings.calendar.breadcrumbHome`, `…breadcrumbSettings` (iki dil) |
| `src/lib/calendar.test.ts` | UID kalıcılığı birim testi (10 test) |
| `tests/e2e/m9-ics-download.spec.ts` | **Yeni** — inen dosyanın baytlarını denetleyen e2e |
| `docs/agent-results/TASK-MTQUTBH8Q9VMK-screenshots/*` | İnen `.ics` + 4 ekran görüntüsü |

Veritabanı şeması **değişmedi**; migration yok, geri-alma gerekmiyor. E2E kendi fixture
kiracısını (`m9-e2e-tenant`) kurar ve `teardownM9Tenant()` ile tamamen siler.

---

## 4. Riskler

- **Kalıcı UID geriye dönük değil:** düzeltmeden ÖNCE indirilmiş bir `.ics` rastgele UID
  taşıyor. O dosyayı zaten içe aktarmış bir kullanıcı, yeni dosyayı aldığında ikinci bir
  etkinlik görür (eskisi güncellenmez). Tek seferlik ve kaçınılmaz; bundan sonrası tekil.
- `SEQUENCE` yazılmıyor. Yaygın istemciler aynı UID'de içeriği güncelliyor; katı bir istemci
  güncellemeyi yok sayabilir. Bugün kırık bir davranış ölçmedim, eklemedim.
- `.ics` bağlantısı yalnızca bir satır tutar; gerçek senkronizasyon işi (cron/Inngest) yok —
  ekran metni bunu açıkça söylüyor, sahte "senkronize edildi" iddiası yok.

---

## 5. Açık sorular (bu turda DÜZELTİLMEDİ — kapsam dışı, adıyla bildiriyorum)

1. **Brif ekranı toplantı saatini kullanıcının saat diliminde göstermiyor.**
   `briefs/client.tsx` "Toplantı Tarihi (UTC): 2026-10-24T11:00:00.000Z" + "Brüksel: …"
   yazıyor. CLAUDE.md §10 kullanıcının saat dilimi + Brüksel diyor; ham ISO dizgesi kullanıcı
   saati değil. (§10 metni çağrı son tarihleri için yazılmış; toplantı saatine uygulanıp
   uygulanmayacağı bir ürün kararı.)
2. **Google/Outlook için OAuth istemcisi ve `/api/calendar/callback` rotası yok.** Bugünkü
   davranış dürüst (reddediyor), ama kart ailesinde "bağlama akışı" tam anlamıyla ancak bu iki
   sağlayıcı gerçekten bağlanınca kapanır. Ayrı bir görev ister.
3. **`syncMeetingBriefToCalendar` yalnızca `ics` bağlantısında bir satır güncelliyor** ve
   `IcsProvider` hiçbir yere olay göndermiyor (gönderecek uzak takvim yok). `lastSyncAt`
   damgası kullanıcıya "senkronize edildi" gibi okunabilir; metin bugün bunu açıklıyor ama
   alan adı yanıltıcı kalıyor.
4. **Paylaşılan ağaçta başka ajanların açık değişiklikleri var** (`pipeline/[id]/consortium/page.tsx`,
   `tests/fabricated-fallbacks.test.ts`) — commit'ime **dahil etmedim**.

---

## 6. Sonraki adım

Kart `review` → `done` için kanıt tamam. Sonraki iş, açık sorular 1 ve 2'den birini ayrı kart
olarak açmak (OAuth callback rotası, ya da toplantı saatinin kullanıcı saat dilimiyle gösterimi).

---

## 7. Definition of Done

- [x] (a) `.ics` gerçek dosya olarak üretildi ve **iki bağımsız ayrıştırıcıyla** doğrulandı — CRLF, PRODID/VERSION, DTSTAMP/DTSTART UTC, 75-oktet katlama, TEXT kaçışı
- [x] (a) Kalan gerçek ihlal (§3.8.4.7 UID kalıcılığı) bulundu ve düzeltildi, uçtan uca kanıtlandı
- [x] (b) Bağlama akışı gerçek tarayıcıda tıklandı; görünür, `.ics` bağlanıyor, Google/Outlook gerekçeli reddediliyor (ekran görüntüleri)
- [x] (c) tr/en anahtar seti eşit (1315↔1315); kalan sabit metin ihlali (breadcrumb) katalogla değiştirildi, iki dilde ekran görüntüsü
- [x] CLAUDE.md §10 bozulmadı: `DTSTART` UTC anı, ekran Brüksel saatini de yazıyor
- [x] `pnpm gate` tamamen temiz (lint + typecheck + 1187 test + rls:check + rls:verify)
- [x] Şema/migration değişikliği yok; e2e fixture'ı kendini temizliyor
- [x] Sır / kişisel veri sızıntısı yok (fixture kiracısı, sahte ortak adı)
