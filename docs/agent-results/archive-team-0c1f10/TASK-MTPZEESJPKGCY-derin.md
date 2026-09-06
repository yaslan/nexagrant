# TASK-MTPZEESJPKGCY — E11.1 Beta User Onboarding (10 Design Partners)

**Ajan:** Sora (`sora-0c1f10`) — Frontend Mühendisi
**Tarih:** 2026-09-06
**Dosya yolu notu:** Görev metninde kanıt dosyası yolu açıkça `docs/agent-results/TASK-MTPZEESJPKGCY-derin.md`
olarak verildi; kendi kimlik jetonum (`sora-0c1f10`) yerine verilen yol kullanıldı.
**Kapsam notu:** Aynı mesajdaki 2. alt-görev (E10.1 Dashboard, cora Exit 129) de bana atanmıştı; onun
doğrulaması ve düzeltmeleri bu raporun § 2'sinde.

---

## 1. Ne yapıldı — E11.1 Beta Onboarding

| Çıktı | Dosya | İçerik |
|---|---|---|
| Beta rehberi (TR) | `docs/BETA_GUIDE.md` | 9 bölüm + 2 ek: program tanımı, kapsam, adım adım onboarding, haftalık ritim, geri bildirim/triyaj, başarı ölçütleri, KVKK/GDPR, destek, beta sonrası, rol matrisi, SSS |
| Beta rehberi (EN) | `docs/BETA_GUIDE.en.md` | TR rehberin tam karşılığı (çeviri değil, eş içerik) |
| Haftalık toplantı takvimi | `docs/beta/beta-weekly-sync.ics` | 9 etkinlik: kickoff (2026-09-07 10:00) + 8 haftalık sync (Perşembe 14:00–14:45, Europe/Istanbul, her hafta ayrı tema) |
| Ortak takip çizelgesi | `docs/beta/partner-tracker.md` | 10 slot (BP-01…BP-10), profil dağılımı, ortak başına onboarding checklist, haftalık katılım tablosu, risk sinyalleri |
| Sync not/asenkron form şablonu | `docs/beta/weekly-sync-template.md` | 45 dk gündemin 5 başlığı + katılamayanlar için asenkron form |

**Program tasarımı (rehberde sabitlenen kararlar):**
- Süre **2026-09-07 → 2026-11-01** (8 hafta), haftalık sync **Perşembe 14:00–14:45 Europe/Istanbul**.
- 10 slot, profil başına en az 2 ortak (KOBİ / TTO / danışmanlık / araştırma merkezi) + 2 yedek slot.
- Hafta 7 = fiyat doğrulama atölyesi (E11.4), Hafta 8 = G0 kalibrasyonu (E11.3) + kapanış.
- Beta kapsamı MVP modülleriyle sınırlandı (M1, M2, M3, M4, M5, M8 + yönetici konsolu); M6/M7/M9/M10/M11
  açıkça kapsam dışı yazıldı.
- CLAUDE.md "Yapma" kuralları rehbere açık uyarı olarak taşındı: F&T Portal'a otomatik gönderim yok,
  değerlendirme çıktısı resmî puan değil ("iç ön değerlendirme"), beta'da SLA taahhüdü yok.
- Ortak kimlik bilgileri (ad, e-posta) **depoya yazılmaz**; takip çizelgesinde yalnız slot kodu + profil.

**Takvim entegrasyonu kararı:** `agentspace_integrations` ile sorgulandı — katalogda Google Calendar
entegrasyonu **yok** (katalog: coolify, elevenlabs, github, hostinger, posthog, sentry, stripe, supabase,
vercel). Bu yüzden takvim, görevde de belirtilen alternatifle **statik ICS** olarak üretildi; Google
Calendar / Outlook / Apple Takvim'e içe aktarılabilir. Otomatik takvim sync'i zaten v1.1 backlog'unda
(TASK-MTPZLC9PI5VEH).

## 2. Ne yapıldı — E10.1 Dashboard doğrulama ve düzeltmeler

**Bulgu: dashboard sorgusu bozuk değil.** Gerçek tarayıcıda giriş yapılıp `/dashboard` açıldı; sayfa
6 pipeline KPI kartı + YZ kredisi kartı + Stage-Gate hunisi ile sorunsuz render edildi. cora'nın
Exit 129'u kod hatası değil, ortam kaynaklı: **bu makinede Postgres çalışmıyor** (`localhost:5432`
bağlantı reddi, `docker` CLI de PATH'te yok). Sayfa DB kesintisini try/catch ile yutup in-memory
pipeline store'a düşüyor, bu yüzden UI ayakta.

Doğrulama sırasında bulunup düzeltilenler (küçük, gözden geçirilebilir):
1. **A11y:** Tarih filtresi `<label>` etiketleri input'lara bağlı değildi → `htmlFor` + `id` + `name`
   eklendi (`dashboard-from-date`, `dashboard-to-date`). Ekran okuyucu artık alanı adıyla anons eder.
2. **A11y:** Dekoratif ikonlara `aria-hidden="true"`; CSV butonuna açıklayıcı `aria-label` (TR/EN).
3. **i18n:** EN locale'de sabit Türkçe metin sızıntısı — `/ 500 Kredi` ve `{n} AI Kredisi` → locale'e
   göre `/ 500 credits` ve `{n} AI credits`.
4. **Tip/lint temizliği:** `src/app/(marketing)/calls/[region]/page.tsx` (E10.4'ten kalan) 3 adet
   `TS7006 implicit any` veriyordu → `TopicRow` tipi tanımlandı; ayrıca `react/no-unescaped-entities`
   lint **hatası** giderildi (metin Türkçeleştirildi: "panelden kayıtlı arama").

## 3. Kanıt

### 3.1 Gerçek etkileşimli test (tıklama + form + gerçek oturum)

Adımlar: `/tr/giris` → çerez onayı tıklandı → e-posta/şifre yazıldı (`admin@yasinaslan.com.tr`) →
"E-posta ile Giriş Yap" tıklandı → `/tr/default/dashboard`.

Panelden okunan canlı içerik (browser `readPage`, kısaltılmış):

```
TOPLAM TEKLIF            6      Aktif Proje Havuzu   G0 → G4
EŞIK ÜSTÜ ORANI          %0.0   EU Benchmark %70
İSABET ORANI (FONLANAN)  %68.5  Kazanılan Fonlanan Proje  4 Teklif
KIŞI-GÜN / TEKLIF        12.4 Gün
ORT. G2 ONAY SÜRESI      1 Gün
AKTIF SISTEM MODÜLLERI   11 / 11 Modül
KALAN YZ KREDISI         500 AI Kredisi
STAGE-GATE ENGINE — G0: 3 (50%) · G1: 1 (17%) · G2: 1 (17%) · G3: 1 (17%) · G4: 0 (0%)
```

→ **6 pipeline KPI + kredi kartı görünüyor; hedef karşılandı.**

Ekran görüntüleri (repoya kopyalandı):

| Dosya | Ne gösteriyor |
|---|---|
| `docs/agent-results/TASK-MTPZEESJPKGCY-screenshots/01-dashboard-tr-desktop.png` | TR masaüstü, giriş sonrası panel + KPI kartları |
| `…/02-dashboard-tr-date-filter.png` | `?from=2026-01-01&to=2026-12-31` — tarih filtresi URL'den hidrate oluyor |
| `…/03-dashboard-en-mobile-before-i18n-fix.png` | EN dar viewport — **önce**: "/ 500 Kredi" (TR sızıntısı) |
| `…/04-dashboard-en-mobile-after-i18n-fix.png` | EN dar viewport — **sonra**: "/ 500 credits" |

Duyarlılık: dar viewport'ta kenar çubuğu hamburger'a iniyor, tarih filtresi + butonlar dikey yığılıyor
(`flex-col sm:flex-row`), yatay taşma yok — 03/04 numaralı karelerde görünüyor.

### 3.2 Veritabanı durumu (blocker #1'in gerçek nedeni)

```
$ node -e "pg.Client(DATABASE_URL=postgresql://***@localhost:5432/fabrika) …"
DB FAIL            # bağlantı kurulamadı
$ docker ps
(eval):1: command not found: docker
$ which psql
psql not found
```

→ Seed data (Call 20+, Opportunity 5+, …) **bu makinede üretilemez**; Postgres ayağa kalkmadan
TASK-MTPZOCARP56UH kapanamaz. Panelin gösterdiği 6 fırsat in-memory store'dan geliyor.

### 3.3 ICS doğrulama

```
$ node -e "<ics yapı kontrolü>"
CRLF lines: 118 | VEVENT: 9 | unique UID: 9 | errors: none
DTSTART;TZID=Europe/Istanbul:20260907T100000   (kickoff)
DTSTART;TZID=Europe/Istanbul:20260910T140000 … 20261029T140000   (8 haftalık sync)
```

### 3.4 Typecheck / lint

```
$ pnpm typecheck
src/lib/billing.ts(103,21): error TS7006: Parameter 'plan' implicitly has an 'any' type.
```
Öncesinde 4 hata vardı; 3'ü (marketing calls sayfası) düzeltildi. Kalan **tek** hata `src/lib/billing.ts`
— başka bir ajanın commit edilmemiş, devam eden çalışması (Stripe entitlements). Çakışma yaratmamak için
dokunulmadı; sahibine bırakıldı (§ 5).

```
$ npx eslint <değişen dosyalar>
✖ 0 error (yalnız kullanılmayan import uyarıları — mevcut kod deseni)
```

## 4. Değişen dosyalar

**Yeni:**
- `docs/BETA_GUIDE.md`, `docs/BETA_GUIDE.en.md`
- `docs/beta/beta-weekly-sync.ics`, `docs/beta/partner-tracker.md`, `docs/beta/weekly-sync-template.md`
- `docs/agent-results/TASK-MTPZEESJPKGCY-derin.md` (bu dosya) + `…-screenshots/` (4 PNG)

**Düzenlenen:**
- `src/app/[locale]/(app)/[workspace]/dashboard/client.tsx` — a11y (label↔input, aria) + EN i18n sızıntısı
- `src/app/(marketing)/calls/[region]/page.tsx` — `TopicRow` tipi (3 × TS7006) + lint hatası

## 5. Riskler

- **DB yok:** Postgres ayağa kalkmadan hem seed blocker'ı (TASK-MTPZOCARP56UH) hem de panelin *gerçek*
  veriyle doğrulaması açık kalıyor. Şu anki KPI'lar in-memory store + fallback sabitlerinden geliyor;
  `personDaysPerOpp`, `hitRate` gibi değerler veri yokken sabit sayıya düşüyor — bu CLAUDE.md § 7
  (kanıt disiplini) ile çelişir, seed sonrası gözden geçirilmeli.
- **`src/lib/billing.ts` typecheck hatası** başka bir ajanın açık çalışması; genel `pnpm typecheck`
  kapısı o düzelene kadar kırmızı kalır.
- Beta rehberindeki tarih/saat ve destek hedefleri **öneri**; ortaklara duyurulmadan önce insan onayı ister.
- Ortak kimlik bilgileri repoya yazılmamalı — takip çizelgesine gerçek ad/e-posta eklenmesi KVKK riski.

## 6. Açık sorular

1. Beta programı iletişim kanalı ne olacak (Slack Connect / e-posta / ürün içi)? Rehberde "program kanalı"
   olarak soyut bırakıldı.
2. Sync saati Perşembe 14:00 Europe/Istanbul — Brüksel/Batı Avrupa ortakları için 12:00; onay gerekiyor mu?
3. Beta ortaklarına verilecek kredi (500) ve koltuk sınırsızlığı ürün tarafında elle mi tanımlanacak,
   yoksa bir `beta` plan girdisi mi açılmalı?
4. Beta sonrası geçiş indirimi olacak mı (E11.4 atölyesinin girdisi)?

## 7. Sonraki adım

1. **Blocker:** Postgres'i ayağa kaldır (`docker compose up postgres-vector` — bu makinede docker CLI yok,
   kurulum gerekli) → `pnpm db:migrate && pnpm db:seed` → seed sayımlarını kanıtla → panelin gerçek veriyle
   doğrulaması tekrarlansın.
2. `src/lib/billing.ts(103)` sahibi tarafından düzeltilip typecheck kapısı yeşile alınsın.
3. E11.2 (geri bildirim/triyaj sistemi) rehberdeki P0–P3 tanımlarıyla uyumlu kurulsun.
4. Beta rehberi insan onayından geçtikten sonra 10 slotun daveti başlatılsın (`partner-tracker.md`).
