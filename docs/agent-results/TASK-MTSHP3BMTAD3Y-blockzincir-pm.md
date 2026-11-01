# TASK-MTSHP3BMTAD3Y — CalendarConnection açık metin token — FAZ 1 ölçüm + öneri

**Durum:** FAZ 1 tamamlandı. FAZ 2 (uygulama) **yapılmadı** — talimat gereği, çünkü FAZ 2'nin ön koşulu ("repoda hazır ve kullanılan bir şifreleme+anahtar yönetimi deseni") **karşılanmıyor**. Karar lidere/patrona gidiyor.

## 1. Ne yapıldı (ölçüm)

### (a) Repoda hazır bir şifreleme yardımcısı var mı? — **HAYIR**

```
$ grep -rln "createCipheriv|createDecipheriv|aes-256|crypto.subtle|scrypt\b" src --include="*.ts"
(sonuç yok)
$ grep -n "CALENDAR_ENCRYPTION_KEY|GOOGLE_OAUTH|MICROSOFT_OAUTH" src/lib/env.ts
(sonuç yok — env şemasında böyle bir alan yok, zorunlu değil)
```

`src/lib/env.ts` içinde Stripe/iyzico/e-fatura gibi sırlar var ama hepsi **sunucu env değişkeni** (uygulama seviyesinde depolanan tek kullanıcı verisi değil). DB satırı düzeyinde şifreleme/anahtar yönetimi deseni (envelope encryption, KMS, vb.) projede **hiç yok**. Bu, FAZ 2'nin "yoksa uygulama, DUR" koşulunu tetikliyor.

### (b) `CalendarConnection` token'larını kim yazıyor, kim okuyor — tam çağrı listesi

```
$ grep -rn "calendarConnection\." src workers | grep -v ".test.ts"
src/app/[locale]/(app)/[workspace]/settings/calendar/page.tsx:32   findMany (okuma — UI listesi)
src/lib/calendar/sync.ts:30                                        findMany (okuma — senkron)
src/lib/calendar/sync.ts:59                                        update (yazma — yalnız externalId + lastSyncAt)
src/lib/inngest/jobs/users-scheduled-deletion.ts:65                deleteMany (imha — GDPR purge)
src/modules/m9/server/calendar-actions.ts:31                       findUnique (okuma — disconnect)
src/modules/m9/server/calendar-actions.ts:43                       delete (silme — disconnect)
src/modules/m9/server/calendar-actions.ts:71                       findUnique (okuma — connect öncesi kontrol)
src/modules/m9/server/calendar-actions.ts:79                       create (yazma — YALNIZ .ics, accessToken/refreshToken: null)
```

**Kritik bulgu — bu satırlar ölü kod, henüz aktif değil:**

- `connectCalendar()` (`calendar-actions.ts:65-69`), Google/Outlook için `CALENDAR_OAUTH_NOT_CONFIGURED` hatasıyla **doğrudan reddediyor** — client id/secret yok, `/api/calendar/callback` rotası **repoda yok** (`find src/app/api -ipath '*calendar*'` boş).
- `GoogleCalendarProvider`/`OutlookCalendarProvider` (`src/lib/calendar/google.ts`, `outlook.ts`) — `connect()`, `createEvent()`, `updateEvent()`, `deleteEvent()` hepsi ya `Error` ya `CalendarProviderNotImplementedError` fırlatıyor. Gerçek bir OAuth token değişimi hiçbir yerde yapılmıyor.
- `.ics` sağlayıcısı (tek çalışan yol) hiç token kullanmıyor — `connectCalendar` onu `accessToken: null, refreshToken: null` ile yazıyor.
- Yani **bugün `accessToken`/`refreshToken` sütununa non-null bir değer yazan tek bir kod yolu yok.**

### (c) Kaç satır etkileniyor — canlı DB sayımı

```
$ npx tsx -r tsconfig-paths/register count-calendar.ts
{
  "total": 0,
  "withAccess": 0,
  "withRefresh": 0,
  "byProvider": []
}
```

`CalendarConnection` tablosu **tamamen boş**. Sızdıracak bir açık-metin token bugün yok — risk **potansiyel/gizil (latent)**, aktif değil. Bu zaten `docs/ROADMAP.md` açık karar #12'de kayıtlı ("M9 takvim entegrasyonu prod ön koşulları").

### Erişim yolu (RLS var, ama)

`prisma/migrations/add-calendar-connections/migration.sql` tabloya `tenant_isolation` RESTRICTIVE RLS politikası koymuş — normal uygulama sorgusuyla başka kiracının satırına erişilemez. Risk senaryosu görevde tarif edildiği gibi **DB'ye doğrudan okuma erişimi olan biri** (superuser, `is_system` bypass, yedek dosyası, sızdırılmış `DATABASE_URL`) — RLS bu sınıfı durdurmaz.

## 2. Üç seçenek

| # | Yaklaşım | Maliyet | Risk/eksik |
|---|---|---|---|
| **A** | Şimdi kapat: `src/lib/crypto/secrets.ts` içinde AES-256-GCM encrypt/decrypt yardımcı, yeni `CALENDAR_ENCRYPTION_KEY` (32 bayt, base64) env alanı `src/lib/env.ts`'e eklenir. Yazma noktası (OAuth callback, henüz yok) encrypt eder; okuma noktası (`sync.ts`, provider çağrısı öncesi) decrypt eder. `.ics` etkilenmez (zaten null). | Düşük-orta — 0 satır olduğu için geriye dönük veri taşıma yok, sadece yardımcı fonksiyon + testler (~1 gün). | Tek anahtar = rotasyon yok (anahtar döndürülürse mevcut satırlar okunamaz hale gelir — ama bugün 0 satır olduğu için bu maliyet şu an sıfır, ileride büyür). Anahtarın nerede tutulacağı (env var mı, secret manager mı) hâlâ ayrı bir karar. Kullanılmayan bir kod yolu için şimdiden kripto yazmak CLAUDE.md'nin "gelecek varsayımına göre tasarlama" ilkesiyle gerginlik yaratır. |
| **B** | Ertele: Şifrelemeyi ayrı bir görev olarak AÇMA, Google/Outlook OAuth'un kendisiyle (roadmap #12) **aynı kartta, aynı PR'da** teslim et — çünkü bugün şifrelenecek gerçek bir yazma yolu yok, önce OAuth callback + token exchange inşa edilecek, şifreleme o inşanın parçası olmalı. Bunu net biçimde **kilitleyecek** bir önlem ekle: `createCalendarProvider('google'|'outlook')` bugün zaten `CalendarProviderNotImplementedError` fırlatıyor — bu, gelecekteki geliştiricinin şifrelemesiz bir token yazma yolu eklemeden önce bu hatayı kaldırması gerektiği anlamına geliyor; o PR'da bir gate/test ("token sütunları yalnız şifreliyse yazılabilir") eklenmeli. | Şimdi ~0 (yalnız dokümantasyon — bu raporda ve schema yorumunda yapıldı). Doğru OAuth tasarımı yapılırken şifreleme de tasarlanır, iki kez iş yapılmaz. | Disiplin riski: birisi "sadece OAuth'u bağlayayım" deyip şifrelemeyi unutabilir. Bunu bir yorum/rapor değil, **kod seviyesinde bir gate** ile kapatmak gerekir (aşağıda öneri). |
| **C** | Yönetilen sır deposu (KMS/secrets manager, envelope encryption, `CalendarConnection`'da yalnız opak referans) | Yüksek — proje şu an hiçbir bulut KMS'e bağlı değil (yalnız R2 nesne depolama + Stripe/iyzico API anahtarları var), yeni bir altyapı bağımlılığı ve karar gerektirir. | CLAUDE.md'nin "hipotetik gelecek ihtiyacına göre tasarlama" ve "reuse>icat" ilkeleriyle en çok çelişen seçenek; bu ölçekteki bir SaaS için muhtemelen aşırı mühendislik. |

## 3. Öneri

**B** (ertele, ama kilitle) — çünkü:
1. Bugün şifrelenecek gerçek veri yok (0 satır) ve şifreleyecek bir yazma yolu da yok — CLAUDE.md açıkça "hipotetik gelecek ihtiyacına göre tasarlama" diyor.
2. OAuth token exchange'in kendisi henüz tasarlanmadı (client id/secret, callback rotası, `src/core/events` olay veri yolu — roadmap #12'nin üç maddesi de eksik). Şifrelemeyi bu tasarımdan ayrı yazmak, token'ın DB'ye nasıl ulaştığını bilmeden "encrypt/decrypt" fonksiyonu yazmak demek — isabetsiz soyutlama riski taşır.
3. Riski gerçekten kapatan şey "bir gün şifreleme fonksiyonu var" değil, "şifrelenmemiş token asla yazılamıyor" — bunu sağlayan mekanizma zaten var: `CalendarProviderNotImplementedError`. Bunun üstüne, OAuth callback'i yazan PR'da bir birim testi/gate eklenmeli: *"`CalendarConnection.create/update` çağrısı `accessToken`/`refreshToken` non-null veriyorsa, değer AES-GCM zarfı formatında olmalı"* (örn. bir prefix/magic-byte kontrolü). Bu, B'yi A'nın disiplinini kaybetmeden ucuz tutar.

A da savunulabilir bir seçim — ucuz olduğu için ("0 satır, şimdi kapatmak ileride unutulma riskini sıfırlar") lider A'yı tercih ederse maliyeti düşük, ben karşı çıkmam. Kararı FAZ 2 talimatı gereği **liderin/patronun** vermesini bekliyorum.

## 4. `prisma/schema.prisma:1140` TODO yorumu — güncellendi

Eski: `// TODO: encrypt with CALENDAR_ENCRYPTION_KEY in production` — yanlış değildi ama eksikti (bugün 0 satır olduğunu, hiçbir yazma yolunun aktif olmadığını söylemiyordu, okuyan gelecekteki geliştirici tabloyu zaten kullanımda sanabilirdi).

Yeni: sütunun bugün boş olduğunu, hangi kod yolunun onu boş tuttuğunu (`CALENDAR_OAUTH_NOT_CONFIGURED`, `/api/calendar/callback` yok) ve hangi karar/karta bağlı olduğunu (`ROADMAP.md` açık karar #12, bu görev) açıkça yazıyor. Aynı düzeltme `prisma/migrations/add-calendar-connections/migration.sql` ve `docs/DATA_MODEL.md §8.2`'de de yapıldı — üçü de aynı eski TODO cümlesini taşıyordu, biri güncellenip diğerleri unutulursa yeniden tutarsızlık doğardı.

## 5. Kanıt (gerçek komut çıktısı)

```
$ npx prisma validate
Prisma schema loaded from prisma/schema.prisma.
The schema at prisma/schema.prisma is valid 🚀

$ grep -rln "createCipheriv|createDecipheriv|aes-256|crypto.subtle" src --include="*.ts"
(boş)

$ npx tsx -r tsconfig-paths/register count-calendar.ts
{ "total": 0, "withAccess": 0, "withRefresh": 0, "byProvider": [] }
```

## 6. Değişen dosyalar

- `prisma/schema.prisma` — `CalendarConnection.accessToken`/`refreshToken` yorum satırı güncellendi (yalnız yorum, şema/kolon değişmedi — `prisma validate` temiz).
- `prisma/migrations/add-calendar-connections/migration.sql` — aynı yorum düzeltmesi (uygulanmış migration dosyası; **geriye dönük çalıştırılmıyor**, yalnız SQL yorumu, DDL değişmedi).
- `docs/DATA_MODEL.md` §8.2 — aynı yorum düzeltmesi.

## 7. Riskler

- Risk bugün **gizil** (0 satır, yazma yolu yok) — ama Google/Outlook OAuth'un ne zaman bağlanacağı belirsiz (roadmap #12 hâlâ açık). O gün geldiğinde şifreleme kararı (B seçildiyse) OAuth PR'ının kapsamına girmek **zorunda**; unutulursa gerçek bir P0 doğar. Bu yüzden öneri B'de "kilitle" kısmı zorunlu, salt "ertele" değil.
- DB'ye doğrudan erişimi olan biri (RLS'i bypass eden `is_system` rolü, yedek dosyası) için tehdit modeli, herhangi bir kolon şifrelense de geçerliliğini korur — bu görev yalnız `CalendarConnection`'ı kapsıyor, aynı sınıftan başka açık-metin sır sütunu var mı diye genel bir tarama yapılmadı (kapsam dışı, ayrı görev olabilir).

## 8. Açık sorular

1. **A mı B mi?** — Lider/patron kararı bekleniyor (yukarıdaki §3).
2. B seçilirse, "şifrelenmemiş token yazılamaz" gate'i hangi PR'da, kim tarafından yazılacak — roadmap #12'yi kapatacak kişiyle aynı kart mı, ayrı bir teknik-borç kartı mı?
3. Aynı sınıftan başka açık-metin sır sütunu var mı (kapsam dışı bırakıldı, tarama yapılmadı) — istenirse ayrı bir görev.

## 9. Sonraki adım

FAZ 2 (uygulama) **liderin A/B kararı** olmadan başlamıyor — talimat gereği yeni bir anahtar yönetimi şeması icat edilmedi.
