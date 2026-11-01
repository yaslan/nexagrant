# TASK-MTQUYMIVFHYCO — M9 dogfood bulgularını ve doğrulama sonuçlarını dokümana işle

**Ajan:** blog-yazar · **Tip:** dokümantasyon · **Sprint:** S10 · **Tarih:** 2026-09-07
**Kaynaklar:** `docs/agent-results/TASK-MTQU053U24RYH-customer-support.md` (M9 dogfood, 14 bulgu),
`docs/agent-results/TASK-MTQTZNLS2CO2L-blockzincir-pm.md` (6 review-kartı doğrulaması), `docs/ROADMAP.md`

Bu görev kod değiştirmiyor; iki ajan raporundaki bulguları kalıcı dokümana (`docs/ROADMAP.md`)
taşıyor, böylece bir sonraki tur "M9.2 bitti" / "i18n tamam" yanılgısıyla yeniden başlamıyor.

---

## 1. Ne yapıldı

- `TASK-MTQU053U24RYH-customer-support.md` (24 senaryo, 14 bulgu) ve `TASK-MTQTZNLS2CO2L-blockzincir-pm.md`
  (6 review-kartı doğrulama kararı) baştan sona okundu.
- `docs/ROADMAP.md`'deki **M9 Meeting Briefs** maddesi güncellendi: "S10 kapanışı doğrulanmadı" satırı,
  dogfood'un gerçek sonucuyla (14 bulgu, 2×P0/4×P1/5×P2/3×P3, özellik uçtan uca kullanılamıyor) ve
  ilgili board kartlarıyla (`TASK-MTQURC2H4E0WF`, `TASK-MTQUS5JH4DXJM`, `TASK-MTQUTBH8Q9VMK`,
  aktif düzeltme `TASK-MTQUX5IZ9I5VP`) değiştirildi.
- "Açık kararlar" listesine **3 yeni madde** eklendi (13–15): uydurma fallback verisi kararı,
  `MeetingBrief.opportunityId` şema kararı, toplantı-sonrası not kaybı kartlaşma kararı.
- "Riskler (teknik)" listesine **2 kalıcı desen** eklendi: `src/locales/*/<modül>.json` ölü-katalog
  tuzağı, `prisma db push` + sonradan migration dosyası çakışması (ikisi de S9/S10'da tekrarladı).
- `npx prisma migrate status` ile migration durumu doğrulandı (yalnızca dokümantasyon için bağlam;
  kod/DB'ye dokunulmadı): `Database schema is up to date!` — PM'in §3.5'te uyguladığı baseline hâlâ geçerli.

Kod tarafında **hiçbir değişiklik yapılmadı** — bu saf bir dokümantasyon görevi.

---

## 2. Kanıt

### 2.1 ROADMAP.md diff'i (uygulandı)
```
$ git diff --stat -- docs/ROADMAP.md
 docs/ROADMAP.md | 26 +++++++++++++++++++++++---
 1 file changed, 23 insertions(+), 3 deletions(-)
```
Tam diff bu görevin commit'inde (`git show`'la görülebilir); M9 bloğu, Açık kararlar #13–15 ve
Riskler (teknik) bölümüne 2 madde ekliyor. Hiçbir mevcut satır silinmedi/anlamı değiştirilmedi,
yalnızca "S10 kapanışı doğrulanmadı" tek satırı gerçek sonuçla değiştirildi.

### 2.2 Migration durumu (yalnız doğrulama, değişiklik yok)
```
$ npx prisma migrate status
...
2 migrations found in prisma/migrations
Database schema is up to date!
```

### 2.3 14 bulgunun tam tablosu (kaynak: `TASK-MTQU053U24RYH-customer-support.md` §2)

| # | Önem | Başlık | Kök neden / kanıt | Kanıt dosyası |
|---|------|--------|--------------------|----------------|
| P0-1 | P0 | Brief hiç kaydedilmiyor, kullanıcı hiçbir geri bildirim almıyor | Sunucu `{success:false, error:"BRIEF_NOT_PERSISTED"}` dönüyor (ayaktaki Prisma istemcisi `db push` sonrası bayat); `client.tsx` `res.success===false`'ı hiç okumuyor. DB: `MeetingBrief`/`CreditLedger`/`AiUsageLog` 3'ü de 0 satır. | `screenshots/D06-brief-created.png`, `server-action-response.txt`, `run-log.txt` |
| P0-2 | P0 | Var olmayan/başka kiracının fırsatında uydurma "Fraunhofer/PIC 999984059" verisi gerçekmiş gibi gösteriliyor | `page.tsx` fallback dalı; hiçbir "örnek veri" etiketi yok; kiracı izolasyonu sağlam (gerçek veri sızmıyor) ama uydurma veri her koşulda çıkıyor. CLAUDE.md §7 ihlali. | `screenshots/01-fake-opportunity-fake-brief.png`, `D15-bogus-opportunity.png`, `D17-cross-tenant.png` |
| P1-3 | P1 | Toplantı sonrası notlar sessizce kayboluyor | `savePostMeetingNotes` `{success:false}` dönüyor, `client.tsx` dönüş değerine bakmadan formu temizliyor. Geri döndürülemez veri kaybı, hata mesajı yok. | `screenshots/D21-notes-silently-lost.png` |
| P1-4 | P1 | `/en/` sayfası tamamen Türkçe | `client.tsx`'te sıfır `useTranslations`/`t()` çağrısı; `src/locales/{tr,en}/briefs.json` hiçbir yerden import edilmiyor (next-intl yalnız `messages/{locale}.json` okuyor). | `screenshots/02-en-locale-fully-turkish.png`, `D16-en-locale.png` |
| P1-5 | P1 | `.ics` çıktısı RFC 5545'e uymuyor | Gerçek `generateIcsContent` çalıştırıldı: UID/DTSTAMP eksik (zorunlu alanlar), `,`/`;` kaçışlanmamış, satırlar 75 okteti aşıyor katlanmamış, açıklama 200 karakterde kesik Markdown. | `screenshots/ics-rfc5545-check.txt` |
| P1-6 | P1 | Takvim bağlama akışı kullanıcı için hiç yok | `CalendarConnection`'a değen hiçbir `.tsx` yok; ayarlar/panelde "takvim/calendar/outlook" geçmiyor; senkron hatası `"non-critical"` diye yutuluyor. | `screenshots/D23-settings-no-calendar.png`, `run-log.txt` (D10/D18/D23) |
| P2-7 | P2 | Brief'ler fırsata bağlı değil (şema seviyesinde) | `MeetingBrief`'te `opportunityId` yok; sorgu yalnız `tenantId` ile filtreliyor — kiracının tüm brief'leri her fırsat sayfasında listelenir. | `prisma/schema.prisma:998`, `D14-other-opportunity-same-briefs.png` |
| P2-8 | P2 | Boşluktan ibaret ortak adı: buton sessizce hiçbir şey yapmıyor | `if (!partnerName.trim()) return;` — geri bildirim yok. | `screenshots/D02-whitespace-name.png` |
| P2-9 | P2 | Saat girilmeyince tarih sessizce atılıyor | Yalnız tarih girilince Brüksel önizlemesi çıkmıyor, `meetingScheduledAt` `undefined` gidiyor. | `screenshots/D03-date-without-time.png` |
| P2-10 | P2 | Aksiyon maddelerinde tekrar/uzunluk denetimi yok | Aynı madde 2× eklenebiliyor, 300 karakter kabul ediliyor, boş madde sessizce yok sayılıyor. | `screenshots/D20-action-items.png` |
| P2-11 | P2 | React "Maximum update depth exceeded" (M9'a özgü değil) | Brief sayfasında 51×, `/panel`'de 56× — ortak layout/provider kaynaklı, ayrı araştırma gerekiyor. | `run-log.txt` |
| P3-12 | P3 | `text-transform: uppercase` TR bağlamında "MEETİNG BRİEFS" üretiyor | Türkçe `i→İ` locale kuralı; `/en/`'de doğru. | (rapor metni, ekran görüntüsü yok) |
| P3-13 | P3 | Kullanıcıya ham ISO zaman damgası gösteriliyor | `meetingScheduledTz` kaydediliyor ama gösterimde kullanılmıyor, sabit "Europe/Brussels" + ham `...Z` string. | (rapor metni, ekran görüntüsü yok) |
| P3-14 | P3 | `alert()` ile çevrilmemiş hata mesajı | `handleDownloadIcs` içinde tasarım sistemi dışı `alert(...)`; ayrıca ulaşılamaz (düğme zaten yalnız tarihli brief'te render ediliyor). | (rapor metni, ekran görüntüsü yok) |

Tüm ekran görüntüleri: `docs/agent-results/TASK-MTQU053U24RYH-screenshots/`.

### 2.4 Doğrulama kararları (kaynak: `TASK-MTQTZNLS2CO2L-blockzincir-pm.md` §2, ROADMAP'e zaten yansımıştı — bu görevde teyit edildi, değiştirilmedi)

| Kart | Karar |
|---|---|
| TASK-MTQ602Y8V5QOK (i18n page-tree) | ✅ done |
| TASK-MTPZL9GK4TFS1 (iyzico) | ✅ done |
| TASK-MTPZHVY46L1MR + TASK-MTPZHGD3S6G3C (M6 Evaluator Lens rozeti) | ✅ done |
| TASK-MTPZL5YDY9TAW (M9.2 UI) | ❌ geri çevrildi → `in_progress` (i18n iddiası yanlış çıktı) |
| TASK-MTPZLC9PI5VEH (takvim sync) | ⚠️ kısmen → `in_progress` kalmalı (OAuth mock + cleartext token production-blocker) |

---

## 3. Değişen dosyalar

- `docs/ROADMAP.md` — M9 Meeting Briefs durumu güncellendi, Açık kararlar #13–15 eklendi, Riskler
  (teknik)'e 2 madde eklendi.
- `docs/agent-results/TASK-MTQUYMIVFHYCO-blog-yazar.md` — bu rapor (yeni).

Ürün kodunda hiçbir değişiklik yok.

---

## 4. Riskler

1. Dokümana işlenen bulgular hâlâ **koda yansımadı** — 3 board kartı (`TASK-MTQURC2H4E0WF`,
   `TASK-MTQUS5JH4DXJM`, `TASK-MTQUTBH8Q9VMK`) `todo`, biri (`TASK-MTQUX5IZ9I5VP`) `in_progress`.
   Bu rapor yalnız görünürlüğü sağlıyor, düzeltmiyor.
2. ROADMAP'teki Açık karar #15 (toplantı notu kaybı) henüz bir board kartına bağlı değil — P0
   kartına iliştirilip iliştirilmeyeceği netleşmedi; bir sonraki PM/lider turu bunu kartlaştırmalı.

---

## 5. Açık sorular

1. P1-3 (not kaybı) ayrı bir kart mı olmalı, yoksa `TASK-MTQURC2H4E0WF`'ün kapsamına mı girmeli?
   (ROADMAP Açık karar #15'e yazıldı, board'da henüz yok.)
2. P2-11 (React sonsuz render uyarısı) M9'a özgü değil — kaynağı hangi provider, ayrı kart açılmalı mı?

---

## 6. Sonraki adım

- Board kartları (`TASK-MTQURC2H4E0WF`, `TASK-MTQUS5JH4DXJM`, `TASK-MTQUTBH8Q9VMK`) ve aktif
  düzeltme (`TASK-MTQUX5IZ9I5VP`) zaten atanmış durumda; bu görev onları değiştirmedi.
- Açık karar #15 için bir kart açılması ya da mevcut P0 kartına iliştirilmesi PM/lider kararı.
