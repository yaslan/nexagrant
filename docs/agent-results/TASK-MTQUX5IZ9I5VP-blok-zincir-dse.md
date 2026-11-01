# TASK-MTQUX5IZ9I5VP — M9 brief formu: sessiz düşen tarih (P2-9) + `alert()` hatası (P3-14)

**Ajan:** blok-zincir-dse (DSE-EN, Tasarımcı) · **Tip:** bug (UX) · **Sprint:** S10 · **Tarih:** 2026-09-07
**Kapsam:** kartın 5. maddesi — **P2-9** ve **P3-14**
**Bkz:** `docs/agent-results/TASK-MTQU053U24RYH-customer-support.md` (dogfood, 14 bulgu)
**Kanıt dizini:** `docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/`

> **Kapsam notu:** Kartın 1–4. maddeleri (brief kalıcılığı, uydurma fırsat verisi, notların
> kaybolması, .ics RFC 5545) paralel alt-görevlere gitti; `.ics` düzeltmesi ben çalışırken
> `0a57a3a fix(calendar): make generateIcsContent RFC 5545 compliant` ile indi. Bu rapor
> yalnız bana düşen 5. maddeyi anlatır. Kartın tamamının DoD'u bu raporla kapanmaz.

---

## 1. Ne yapıldı

### P2-9 — saat girilmeyince tarih sessizce atılıyordu

Kullanıcı ihtiyacı: kullanıcı tarihi yazdığını **görüyor**, sistem girmemiş sayıyordu.
Eski indirgeme `meetingDate && meetingTime ? dateToUTC(...) : undefined` idi; yarım
doldurulmuş çift sessizce `undefined`'a düşüyor, ne Brüksel önizlemesi ne uyarı çıkıyordu.
Sonuçta brief tarihsiz kaydediliyor, `.ics` düğmesi çıkmıyor ve nedeni hiçbir yerde yazmıyordu.

Karar: çifti indirgemek yerine **çözümlemek**, ve yarım çifti hata olarak bildirmek.
Kural saf bir fonksiyona alındı (`src/modules/m9/meeting-schedule.ts`) — böylece kural birim
testlenebilir, bileşen yalnız sonucu render eder.

| Girdi | Sonuç | Gerekçe |
|---|---|---|
| ikisi de boş | geçerli, `scheduledAt: undefined` | toplantı planlamak isteğe bağlı; tarihsiz brief meşru bir kayıt |
| yalnız tarih | hata → **saat** alanı | kullanıcı bir şey girdiğine inanıyor; sessizce atmak veri kaybı |
| yalnız saat | hata → **tarih** alanı | aynı gerekçe, ayna durum |
| çözümlenemeyen çift | hata → tarih alanı | `Invalid Date`'in sunucuya gitmesini engeller |
| tam çift | geçerli, yerel saat diliminde çözümlenen an | dogfood'un ✅ doğruladığı DST davranışı korundu |

UI tarafı (mevcut tasarım diline uyarak, yeni dil icat etmeden):
- Satır içi hata: `role="alert"` + `AlertCircle` + `text-rose-700`, tarih/saat satırının hemen altında.
- Her iki alan `aria-invalid="true"` ve `aria-describedby="m9-schedule-error"` alır → ekran
  okuyucu hatayı alanla ilişkilendirir; hata anında duyurulur.
- Odak, kullanıcının **doldurması gereken** alana taşınır (klavye kullanıcısı hatayı arayıp bulmaz).
- Kenarlık `border-rose-400` + `focus:ring-rose-500` — hata yalnız renkle değil, metinle de anlatılır (WCAG 1.4.1).
- Kullanıcı eksik alanı doldurur doldurmaz hata kalkar ve Brüksel önizlemesi geri gelir.
- Girilen değerler **korunur**; reddetme formu temizlemez.

### P3-14 — hata `alert()` ile gösteriliyordu

`handleDownloadIcs` içindeki `alert('Toplantı tarihi belirlenmemiş')` kaldırıldı. Yerine sayfa
düzeyinde `role="alert"` uyarı bölgesi kondu — **kardeş ekranın (M6 Evaluator Lens
`evaluations/client.tsx:204-213`) hâlihazırdaki hata bandı bileşeniyle birebir aynı sınıflar**
(`rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800`), yani yeni bir
görsel dil eklenmedi. Banda "Kapat" düğmesi eklendi: hata engel değil, bilgi.

**Ek karar — düğmeyi her zaman render etmek.** Dogfood, hatanın *ulaşılamaz* olduğunu da not
etmişti: `.ics` düğmesi yalnız tarihli brief'te render ediliyordu, yani guard'ın tetiklenmesi
mümkün değildi (`[D10] .ics button count on active brief: 0`). Kullanıcı açısından sorun sadece
hata biçimi değil, **kontrolün sebepsiz kaybolmasıydı** — kullanıcı takvim dosyasının neden
alınamadığını hiçbir yerden öğrenemiyordu. Düğme artık her brief'te görünür; tarihi olmayan
brief'te tıklandığında sebep yazıyla söyleniyor. Bu, "hata yollarını görünür kıl" DoD maddesini
karşılar ve guard'ı ölü kod olmaktan çıkarır (bu yüzden gerçek tıklamayla test edilebiliyor).

---

## 2. Kanıt

### 2.1 Gerçek tarayıcı, gerçek tıklama (Playwright, ayakta olan dev sunucusu, gerçek oturum)

```
$ npx playwright test tests/e2e/m9-briefs-form.spec.ts

Running 2 tests using 1 worker

  ✓  1 [chromium] › tests/e2e/m9-briefs-form.spec.ts:41:7 › M9 briefs — inline validation and error
       surfaces › a half-filled meeting time is reported inline, and no alert() is ever raised (2.3s)
  ✓  2 [chromium] › tests/e2e/m9-briefs-form.spec.ts:95:7 › M9 briefs — inline validation and error
       surfaces › the calendar button explains itself instead of raising alert() (2.0s)

  2 passed (5.4s)
```

Test 1 (`owner@demo.fabrika.test`, `/tr/fabrika-beta/opportunities/demo-opp-1/briefs`):
ad + tarih yazıldı, saat boş bırakıldı, **gerçek tıklama** ile gönderildi →
satır içi hata göründü, `aria-invalid`/`aria-describedby` doğrulandı, odak saat alanına geçti,
girilen tarih ekranda kaldı; saat doldurulunca hata kalktı ve Brüksel önizlemesi geri geldi.
Test 2: tarihsiz bir brief tohumlandı, `.ics` düğmesine **gerçek tıklama** yapıldı → satır içi
band çıktı, "Kapat" ile kapandı. **Her iki test de `page.on('dialog')` dinliyor ve
`expect(dialogs).toEqual([])` ile bitiyor** — yani `alert()` çıksaydı testler kırmızıya dönerdi.

Ekran görüntüleri (`docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/`):

| Dosya | Ne gösteriyor |
|---|---|
| `e2e-01-date-without-time.png` | gönderim öncesi: ad + tarih dolu, saat boş |
| `e2e-02-inline-error.png` | **P2-9 sonrası:** kırmızı kenarlıklı iki alan, saat alanında odak halkası, altında "Toplantı saatini de girin — yalnızca tarih girildiğinde görüşme takvime yazılmaz." |
| `e2e-03-error-cleared.png` | saat doldu → hata gitti, Brüksel önizlemesi döndü |
| `e2e-04-ics-button-visible.png` | tarihsiz brief'te `.ics` düğmesi artık görünür |
| `e2e-05-ics-inline-error.png` | **P3-14 sonrası:** sayfa üstünde `role="alert"` bandı + "Kapat" — `alert()` diyaloğu yok |
| `e2e-06-ics-error-mobile.png` | 390×844: band okunuyor, yatay taşma yok (testte `scrollWidth - clientWidth <= 0` ölçüldü) |

### 2.2 Birim + bileşen testleri

```
$ npx vitest run tests/m9-briefs-form-errors.test.tsx tests/m9-meeting-schedule.test.ts
 Test Files  2 passed (2)
      Tests  14 passed (14)
```

`tests/m9-briefs-form-errors.test.tsx` gerçek bileşeni jsdom'da render edip tıklıyor; her testin
`afterEach`'i `expect(alertSpy).not.toHaveBeenCalled()` ile `window.alert`'in hiç çağrılmadığını
doğruluyor. Ayrıca yarım çiftte sunucu eyleminin **hiç çağrılmadığını** ölçüyor
(`expect(generateMeetingBrief).not.toHaveBeenCalled()`) — eski davranışta çağrı gidiyor ve tarih
yolda düşüyordu.

### 2.3 Testin kırmızıya dönebildiği kanıtlandı (testi gevşeterek geçmedim)

`resolveMeetingSchedule`'daki "yalnız tarih" dalı geçici olarak eski sessiz davranışa çevrildi:

```
--- RED probe (old behaviour restored) ---
     × rejects a date without a time and points at the time field 6ms
     × blocks submit and explains that the time is missing 122ms
     × wires the error to both controls for assistive technology and focuses the empty one 20ms
     × clears the error and shows the Brussels preview once the pair is complete 18ms
 Test Files  2 failed (2)
      Tests  4 failed | 10 passed (14)
--- GREEN (fix restored) ---
 Test Files  2 passed (2)
      Tests  14 passed (14)
```

### 2.4 Kapılar

```
$ npx vitest run
 Test Files  56 passed | 2 skipped (58)
      Tests  526 passed | 8 skipped (534)

$ npx tsc --noEmit | grep -v "^scripts/_"
(çıktı yok)

$ npx eslint src/modules/m9/meeting-schedule.ts \
    "src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client.tsx" \
    tests/m9-meeting-schedule.test.ts tests/m9-briefs-form-errors.test.tsx \
    tests/e2e/m9-briefs-form.spec.ts
  68:3  warning  'opportunityId' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)
```

İki dürüstlük notu:
- `npx tsc --noEmit` filtresiz koşulduğunda 8 hata veriyor; **hepsi** başka panelerde çalışan
  ajanların takipsiz (`??`) tek kullanımlık probe dosyalarından: `scripts/_dogfood-g0-probe*.ts`,
  `scripts/_pm-m9-audit.ts`. Benim dokunduğum dosyalarda hata yok.
- Tek lint uyarısı **benden önce vardı**: `git show HEAD:...briefs/client.tsx | grep -c "opportunityId,"` → `1`.

### 2.5 Yan etki temizliği

E2E tohumu (`m9-e2e-undated`) testin `afterAll`'unda siliniyor. Koşu sonrası:
`MeetingBrief` tablosunda benim bıraktığım satır yok.

---

## 3. Değişen dosyalar

| Dosya | Durum | Ne |
|---|---|---|
| `src/modules/m9/meeting-schedule.ts` | **yeni** | `resolveMeetingSchedule` — tarih/saat çiftinin saf çözümleme kuralı + mesaj sabitleri |
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client.tsx` | değişti | satır içi hata durumları, aria bağları, odak yönetimi, `alert()` → `role="alert"` bandı, `.ics` düğmesi koşulsuz render |
| `tests/m9-meeting-schedule.test.ts` | **yeni** | kuralın 7 birim testi |
| `tests/m9-briefs-form-errors.test.tsx` | **yeni** | bileşen testi (jsdom); `window.alert` çağrılmadığı her testte doğrulanıyor |
| `tests/e2e/m9-briefs-form.spec.ts` | **yeni** | gerçek tarayıcı e2e + mobil genişlik + `dialog` dinleyicisi |
| `docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/*.png` | **yeni** | 6 ekran görüntüsü |

`prisma generate` de koşuldu: yerel `node_modules`'ta üretilmiş Prisma istemcisi **hiç yoktu**
(`node_modules/.prisma` mevcut değildi), dogfood'un P0-1 (a) kök nedeni buydu. Bu bir dosya
değişikliği değil, ortam düzeltmesi; kalıcı çözüm başka bir alt-görevin işi (aşağıda risk #2).

---

## 4. Riskler

1. **Aynı dosyada paralel çalışma.** `briefs/client.tsx`'e kartın 1. ve 3. maddeleri de dokunacak
   (P0-1 hata yüzeyi, P1-3 notların kaybolması). Benim eklediğim `scheduleError`/`icsError`
   deseni onların da kullanabileceği şekilde bırakıldı; birleştirme sırasında iki ayrı hata bandı
   üretilmemesine dikkat edilmeli.
2. **`prisma generate` kalıcı değil.** İstemciyi ürettim ama bunu tekrarlayacak bir kapı yok;
   `postinstall`/CI adımı eklenmezse aynı "bayat istemci" tuzağı geri gelir.
3. **`.ics` düğmesinin koşulsuz render'ı** kartın 1. maddesiyle çakışabilir: brief kalıcılığı
   düzeldiğinde tarihsiz brief sayısı artacak, dolayısıyla bu hata bandı daha sık görülecek.
   Bu istenen davranış, ama kopya metni gözden geçirilmeli.
4. **i18n.** Eklediğim üç metin, dosyanın geri kalanı gibi gömülü Türkçe. Görev "i18n metinlerine
   dokunma" dediği için bilinçli; ex-en'in 78 string kartına **3 string daha** ekliyor
   (`MEETING_SCHEDULE_MESSAGES` üç anahtarı + `.ics` hata metni + "Kapat").

---

## 5. Açık sorular

1. `.ics` düğmesi tarihsiz brief'te **görünür ama başarısız** mı olmalı, yoksa **görünür ama
   `disabled` + tooltip** mi? İlkini seçtim (disabled kontrolün sebebi ekran okuyucuya zayıf
   geçer, ayrıca `disabled` düğme tıklanamadığı için sebep de söylenemez). Ürün onayı isterse
   ikinciye çevirmek tek satır.
2. P2-8 (yalnız boşluktan ibaret ortak adı → buton hiçbir şey yapmıyor) **kapsamım dışında**
   ve hâlâ açık: `if (!partnerName.trim()) return;` benim doğrulamamdan **önce** çalışıyor, yani
   ad boşluksa kullanıcı hâlâ hiçbir geri bildirim almıyor. Aynı `scheduleError` deseni buraya
   da uygulanmalı — `TASK-MTQURC2H4E0WF` kartına iliştirilmesini öneriyorum.
3. Toplantı süresi hâlâ sabit 1 saat (`+ 60 * 60 * 1000`); kullanıcı giremiyor. Dogfood P1-5'te
   geçiyordu, RFC düzeltmesi bunu kapsamadı.

---

## 6. Sonraki adım

- Kartın 1–4. maddeleri kapanmadan `TASK-MTQUX5IZ9I5VP` **done** yapılmamalı; bu rapor yalnız
  5. maddeyi kanıtlıyor.
- Açık soru #2 (P2-8) `TASK-MTQURC2H4E0WF`'ye iliştirilsin.
- `prisma generate` için `postinstall` ya da CI adımı ayrı bir teknik borç kartı olsun (risk #2).
