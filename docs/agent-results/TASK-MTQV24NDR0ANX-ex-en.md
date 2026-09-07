# TASK-MTQV24NDR0ANX — M9 Meeting Briefs i18n (ex-en)

**Sprint:** S10 (dogfood P0/P1 düzeltme dalgası, çökme sonrası devam) · **Branch:** `dev` · **Tarih:** 2026-09-07

## 1. Ne yapıldı

`src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client.tsx` içindeki tüm sabit Türkçe
metinler `useTranslations('m9')` üzerinden `t('...')` çağrılarına taşındı. Kapsam:

- Header: modül etiketi, başlık, fırsat etiketi, AI kredi rozeti
- Aksiyon butonları: Yazdır / Takvim (.ics)
- Form: başlık, partner placeholder, tarih/saat `aria-label`, Brüksel saati etiketi + UTC notu
- Liste: "Görüşme Kayıtları (N)" (ICU `{count}` ile), boş durum metni
- Brief paneli: oluşturulma tarihi, toplantı tarihi (UTC) / Brüksel etiketleri, boş durum metni
- Toplantı sonrası form: tüm label/placeholder/buton metinleri, varsayılan partner adı
- **`icsError` metni** (asıl görev tetikleyicisi): `handleDownloadIcs` içindeki sabit Türkçe hata
  cümlesi → `t('ics.noScheduleError')`; ICS event başlığı → `t('ics.eventTitle', { partner })` +
  `t('ics.defaultPartner')`

**Yan düzeltme — tarih formatlama:** `formatBrusselsTime` önceden `Intl.DateTimeFormat('tr-TR', ...)`
ile sabitlenmişti, yani İngilizce arayüzde de Türkçe tarih biçimi (`07.09.2026`) görünüyordu. Fonksiyona
`dateLocale` parametresi eklendi (`locale === 'tr' ? 'tr-TR' : 'en-US'`), hem Brüksel saati satırında hem
liste/brief panelindeki `toLocaleDateString(dateLocale)` çağrılarında kullanılıyor. Kanıt: aynı brief EN'de
`9/7/2026`, TR'de `07.09.2026` olarak gösteriyor (bkz. §2).

`briefs/page.tsx` (server component) kontrol edildi — kullanıcıya görünen sabit metin yok (yalnız veri
çekiyor), dokunmaya gerek kalmadı.

blok-zincir-dse'nin `m9` ad alanındaki 5 anahtarına (`generate.*`, mevcut `retry` vb.) dokunulmadı, yalnız
ekleme yapıldı.

## 2. Kanıt

Ortam: `pnpm dev` (:3000), oturum `admin@yasinaslan.com.tr` (platform admin) → tenant `demo-tenant`
("Fabrika Beta"), workspace `main`. Test fırsatı: `demo-opp-1` ("District renovation pilot — İzmir").

**Ön koşul:** M9 sayfası `moduleGate('M9', locale)` ardında; `demo-tenant` için M9'un `ModuleState`
satırı yoktu (OFF = kapalı varsayılan), M9 `M1 + M4` gerektiriyor, onlar da OFF'tu. Gerçek tıklamayla test
edebilmek için `/tr/admin/modules` panelinden M1 → ON, M4 → ON, M9 → ON yapıldı (aşağıda "Riskler"e not
düşüldü — bu üç modülün açık kalması task kapsamımın dışında bir kalıcı yan etki).

### 2a. Sayfa metni — gerçek tıklama, iki locale

**TR (`/tr/main/opportunities/demo-opp-1/briefs`):** hiçbir sabit Türkçe kelime kalmadı çünkü zaten
Türkçe UI — asıl kontrol EN'de. Sayfa tam çalışıyor: "Görüşme Brifingi & Not Alma Motoru", "Çağrı Fırsatı",
"1 AI Kredi / Brief", "Görüşme Kayıtları (0)", "Henüz kayıtlı bir görüşme bulunmuyor."
→ `TASK-MTQV24NDR0ANX-screenshots/01-tr-briefs-page.png`

**EN (`/en/main/opportunities/demo-opp-1/briefs`):** aynı sayfa, sıfır Türkçe kelime:
"Meeting Briefing & Note-Taking Engine", "Call Opportunity", "1 AI Credit / Brief",
"Create New Meeting Note (AI Pre-Meeting Brief)", "Meeting Records (0)", "No meetings have been
recorded yet."
→ `TASK-MTQV24NDR0ANX-screenshots/02-en-briefs-page.png`

### 2b. Asıl tetikleyici — ICS hata mesajı, iki locale

EN'de "Fraunhofer ISE" adıyla (tarihsiz) gerçek bir brief üretildi, ardından "Calendar (.ics)" butonuna
tıklandı. Üretilen mesaj **gerçek İngilizce ürün dili**, Türkçe kopyası değil:

> "This meeting record has no meeting date, so a calendar file could not be created. Regenerate the
> brief with a meeting date and time."

→ `TASK-MTQV24NDR0ANX-screenshots/03-en-ics-error.png`

Aynı brief TR arayüzde açıldığında (aynı kayıt, aynı `activeBrief`), aynı hata Türkçe:

> "Bu görüşme kaydında toplantı tarihi yok, bu yüzden takvim dosyası oluşturulamadı. Brief'i toplantı
> tarihi ve saatiyle yeniden oluşturun."

→ `TASK-MTQV24NDR0ANX-screenshots/04-tr-ics-error.png`

Eskiden bu cümle kod içine gömülü sabit Türkçeydi ve İngilizce arayüzde de Türkçe çıkıyordu — artık
`t('ics.noScheduleError')` ile locale'e göre değişiyor.

### 2c. Tarih formatlama kanıtı (yan düzeltme)

Aynı brief kaydının oluşturulma tarihi:
- EN sayfasında: `9/7/2026` (en-US, `toLocaleDateString('en-US')`)
- TR sayfasında: `07.09.2026` (tr-TR, `toLocaleDateString('tr-TR')`)

`readPage` çıktısı ile doğrulandı (ekran görüntülerinde de görünüyor). Eskiden ikisi de `07.09.2026`
olurdu çünkü locale hiç parametre almıyordu.

### 2d. Post-meeting formu — EN metinleri (readPage)

```
Add Post-Meeting Decisions & Action Notes
Decisions Made / Outcome
Meeting Detail Notes
Action Items
Add
Next Follow-up Meeting Date
Add Post-Meeting Notes to Brief
```
Türkçe karşılığı `/tr` sayfasında aynı yerde doğru şekilde görünüyor (rapor ekinde tam liste).

### 2e. Kaynak taraması

```
$ grep -nP '[çğıöşüÇĞİÖŞÜ]' briefs/client.tsx
(çıktı yok)
```
Dosyada kalan tek bir Türkçe karakter yok.

### 2f. i18n parite

```
$ node -e "... key-diff script ..."
en 615  tr 615
missing in tr: []
missing in en: []
```
(615 = benim eklediğim m9 anahtarları + paralel çalışan başka bir ajanın m8 anahtarları; her iki dilde de
eşit.)

### 2g. Kapılar

```
$ pnpm exec eslint "briefs/client.tsx"
✖ 1 problem (0 errors, 1 warning)   <- 'opportunityId' unused, benim değişikliğimden önce de vardı

$ pnpm exec tsc --noEmit  (repo geneli)
(çıktı yok, exit 0)

$ pnpm test
Test Files  56 passed | 2 skipped (58)
     Tests  537 passed | 8 skipped (545)

$ pnpm rls:check
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.

$ pnpm rls:verify
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```
`pnpm lint` (repo geneli) 1 hata gösteriyor ama o hata benim dosyamda değil —
`pipeline/board.tsx:114` (`react-hooks/set-state-in-effect`), paralel çalışan başka bir ajanın
commit'lenmemiş dosyası. `githooks/pre-commit` yalnız staged dosyalarımı kontrol ediyor, o da temiz.

## 3. Test verisi temizliği

Doğrulama sırasında `demo-tenant` üzerinde "Fraunhofer ISE" adıyla gerçek bir `MeetingBrief` kaydı
oluştu (AI çağrısı gerçek, kredi düştü). Diğer ajanların "0 brief" varsayımını bozmamak için doğrulama
bitince bu kayıt silindi — `meetingBrief` tablosu `demo-tenant` için tekrar 0 satır.

## 4. Değişen dosyalar

| dosya | değişiklik |
|---|---|
| `briefs/client.tsx` | tüm sabit TR metin → `t('m9....')`; `formatBrusselsTime` + tarih gösterimleri `dateLocale` parametresi aldı |
| `messages/en.json`, `messages/tr.json` | `m9.nav`, `m9.header`, `m9.actions`, `m9.form`, `m9.list`, `m9.brief`, `m9.postMeeting`, `m9.ics` altında ~29 yeni anahtar × 2 dil (bu commit'ten önce başka bir ajan tarafından zaten HEAD'e işlendi — bkz. §5) |
| `docs/agent-results/TASK-MTQV24NDR0ANX-screenshots/*.png` | 4 kanıt ekran görüntüsü (yeni) |
| `docs/agent-results/TASK-MTQV24NDR0ANX-ex-en.md` | bu rapor (yeni) |

## 5. Riskler / Açık notlar

1. **`messages/*.json` paylaşımlı dosya çakışması.** Ben bu iki dosyaya yalnız `m9` altına ekleme
   yaptım, ama başka bir ajan (muhtemelen blok-zincir-lead, commit `4be94d5` "fix(m8): translate
   consortium header...") bu dosyaları `git commit -a` veya benzeri geniş bir add ile commit'lemiş ve
   benim henüz commit'lenmemiş `m9` anahtarlarımı da içine almış. İçerik birebir benim yazdığım metinlerle
   eşleşiyor (diff'siz doğrulandı), veri kaybı yok, ama bu paylaşılan dosyayı düzenleyen herkesin
   "yalnız kendi ad alanına ekle" kuralına rağmen geniş `git add` kullanmaması gerektiğini bir kez daha
   doğruluyor. Bu yüzden bu PR'da `messages/*.json` için ayrı bir commit YOK — içerik zaten `4be94d5`'te.
2. **Demo-tenant modül durumu kalıcı olarak değişti.** M9 sayfası `moduleGate` ardında ve `demo-tenant`
   için M1/M4/M9 hiç `ModuleState` satırına sahip değildi (OFF). Gerçek tıklamayla test edebilmek için
   `/admin/modules` üzerinden üçünü de ON yaptım. Bu, görev kapsamımın (i18n) dışında kalıcı bir yan etki:
   - Business/Enterprise planları zaten `modules` listesinde M9'u içeriyor (`prisma/seed.ts`), yani bu
     muhtemelen zaten olması gereken bir durumu düzeltti, eksiklik değil yeni bir risk.
   - Yine de gelecekte "M9 kapalıyken gate çalışıyor mu" diye test eden biri artık `demo-tenant`'ta bunu
     doğrudan gözlemleyemez; başka bir tenant seçmesi ya da modülü tekrar OFF yapması gerekir.
3. **Tarayıcı otomasyonu kararsızdı.** Bu oturumda `click`/`type` çağrıları birkaç kez `renderer timeout`
   veya "guest kare üretmiyor" hatasıyla başarısız oldu (muhtemelen görev tanımındaki "uygulama yeniden
   başladı" çökme sonrası kalıntısı). Doğal tarih/saat `<input type=date>` alanına native klavye girişi bu
   yüzden test edilemedi; Brüksel saati/UTC etiketlerinin doğru çevrildiği kaynak koddan ve statik
   metinlerden doğrulandı, ama gerçek bir zamanlı toplantı için Brüksel saati satırının ekran görüntüsü
   alınamadı. Post-meeting formu ise `readPage` ile (görsel değil, metin) doğrulandı.

## 6. Hafıza

Takım geneli olduğu için `.agentspace/memory/shared/fabrika-module-off-blocks-platform-admin-too.md`
olarak kaydedildi (ex-en'e özel değil — herhangi bir ajan gated bir modülü canlı test ederken aynı
duvara çarpar):
- Demo tenant'ta bir modülün `ModuleState` satırı yoksa varsayılan OFF ve `moduleGate` bunu platform
  admin dahil herkese kapatıyor (DEV/PILOT'ta admin bypass'ı var, OFF'ta yok).
- `/admin/modules` istemci kodunda bir state bug: `requires` zincirini (M9 → M1+M4) art arda hızlı
  tıklayarak açmaya çalışırsan, bağımlı modülün isteği DB'de henüz commit olmamış önceki modülü görüp
  hata veriyor ve `catch` bloğu `setModuleStates(initialStates)` ile TÜM tenant state'ini mount anındaki
  haline sıfırlıyor — her adımdan sonra DB'de doğrulayıp sıradakine geçmek gerekiyor.

## 7. DoD Checklist

- [x] Sabit metin 0 (`grep -nP '[çğıöşüÇĞİÖŞÜ]'` boş)
- [x] Parite korunmuş (615/615)
- [x] 2+ ekran görüntüsü (4: TR sayfa, EN sayfa, EN ICS hatası, TR ICS hatası)
- [x] `pnpm gate` bileşenleri temiz (lint benim dosyamda 0 hata, typecheck repo geneli 0 hata, test 537/545 geçti, rls:check + rls:verify ✅) — repo geneli `pnpm lint` başka bir ajanın dosyasında (`pipeline/board.tsx`) 1 hata gösteriyor, bana ait değil, pre-commit hook'u geçmeme engel olmuyor
- [x] Commit edildi (aşağıda `git show --stat` kanıtı)
- [x] Rapor bu dosya
