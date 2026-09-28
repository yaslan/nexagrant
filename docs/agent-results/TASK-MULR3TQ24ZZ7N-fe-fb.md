# TASK-MULR3TQ24ZZ7N — Fon Hazırlık Karnesi (fe-fb)

**Sprint:** FB-KAMU-1 · **Dal:** dev · **Kod commit'i:** `959c1e80` · **Katalog bağımlılığı:** se-fb `819aff09` (TASK-MULR39X1K5K6C Faz 1)
**Platform beyanı:** web. Masaüstü (1280 px) ve mobil genişlik (360 px) **macOS**'ta (Darwin 27, Google Chrome, Playwright ile headless) doğrulandı. Windows ve Linux'ta koşulmadı çünkü bu makinede yalnız macOS var. Kod platforma bağlı bir yol içermiyor: süreç, dosya yolu, kabuk ya da ikili adı, izin yok. Tümü tarayıcı içi React ile standart `window.print` / `navigator.clipboard`, dolayısıyla Windows ve Linux tarayıcılarında aynı davranış beklenir.

## 1. Ne yapıldı

- **`src/lib/readiness/questions.ts`**: 15 soru, 5 boyut × 3 (Kurumsal kayıt: PIC, LEAR, imza yetkisi · Kapasite: proje birimi, İngilizce yazım, geçmiş proje · Finansman: eş finansman, nakit akışı, meclis kararı · Ortaklık: kardeş şehir, Avrupa ağı, yerel paydaş · Fikir: stratejik plan/SECAP, somut ihtiyaç, veri). Her soru 0–2 puan. Bu dosyada yalnız yapı ve resmî rehber linkleri var. Soru ve seçenek metinleri CLAUDE.md kural 8 gereği `messages/{tr,en}.json` → `readiness.*` altında (iki dil, i18n kapısı yeşil).
- **`src/lib/readiness/score.ts`**: `scoreReadiness(answers, orgType, { province? })` fonksiyonu **saf ve deterministik, YZ çağrısı yapmaz**. Döndürdüğü alanlar: `{ total0to100, byDimension, level: 'baslangic'|'gelisen'|'hazir', gaps: GapItem[], recommended: ProgrammeKey[] (≤3) }`. Eşikler: 40 → gelişen, 70 → hazır. Gap'ler önce "öncelikli" (0), sonra "geliştirilmeli" (1) diye sıralanır; her birinde somut adım (`readiness.gaps.<id>`) ve varsa resmî link bulunur.
- **Program önerisi** se-fb kataloğundan gelir (`PUBLIC_SECTOR_PROGRAMMES`, yalnız import edildi, dosya değiştirilmedi). Eşleştirmede kullanılan alanlar `difficulty`, `needsPic`, `needsPartners` ve `cofinancingPct`; bunlar cevaplarla karşılaştırılır. Hazırlığı düşük kuruma önce kolay programlar, hazır kuruma büyük programlar önerilir.
  - **Kartla fark (bilinçli):** kart "sıfır hazırlık → CERV/Erasmus, tam hazırlık → LIFE/Mission" diyordu. se-fb kataloğu resmî ülke listelerine dayanıyor ve bu listelere göre **Türkiye CERV ve LIFE'a katılmıyor** (`turkeyEligibility: 'not_eligible'`). Bu yüzden `isOpenToTurkishApplicants` ile bu iki program **hiç önerilmiyor**. Sıfır hazırlıkta öneri OKA / Ulusal Ajans / Erasmus+ KA2, tam hazırlıkta Cities Mission / NEB / Digital Europe oluyor.
  - **Ek: isteğe bağlı "İl" sorusu.** OKA (4 il) ve Interreg (BG-TR 2 il, Karadeniz 25 il) bölgesel programlar. İl sorulmasaydı ya İlkadım pilotuna OKA hiç önerilemezdi ya da İzmir'deki bir belediyeye yanlışlıkla önerilirdi. İl seçilmezse bölgesel programlar önerilmez. İl seçilirse `coversTurkishProvince` ile filtrelenir. `check_call` (DUT) programları sona itilir.
- **Sayfa**: `/tr/fon-hazirlik` ve `/en/funding-readiness` (ikincisi aynı sayfayı yeniden dışa aktarır). Kayıt istemez. Akış giriş (kurum türü + il) → 5 adım (adım başına bir boyut, ilerleme çubuğu, `role=progressbar`) → sonuç. Sonuç ekranında puan halkası, boyut çubukları, 3 program (ad, sade Türkçe açıklama, zorluk, eş finansman, Türkiye katılım notu, resmî sayfa), belediye çağrıları linki (`/belediye-cagrilari`), eksik listesi ve "Ücretsiz hesap aç" butonu bulunur.
- **Paylaşım** (`share.ts`): cevaplar URL'e kodlanır (`?kurum=<tür>&cevap=<15 hane 0-2>[&il=<il>]`). Sunucuya hiçbir şey yazılmaz. Bozuk ya da elle değiştirilmiş link boş teste düşer; bilinmeyen il atılır. "Yazdır / PDF" butonu tarayıcı yazdırmasını açar; yazdırmada nav, CTA ve paylaşım gizlenir (`print:hidden`).
- **İletişim bırakma (5. adım)**: şemada Lead/Waitlist modeli yok, `src/lib/beta/` da kayıtsız ziyaretçi lead'i almıyor. Kart gereği durdum ve leed-fb'ye sordum. **Karar: A, leed-fb 29.09.** Form yok; sonuç ekranında yalnız "Ücretsiz hesap aç" (`/kayit?kaynak=fon-hazirlik`) ve paylaşım linki var. Kalıcı lead saklama için leed-fb ayrı bir backlog kartı açıyor.
- **Analitik**: `analytics.track` ile `readiness_started {orgType}`, `readiness_completed {orgType,total,level}` ve `readiness_signup_clicked {orgType,level}` olayları. **PII yok** (kurum adı, e-posta ya da il gönderilmiyor).
- **Erişilebilirlik**: her soru `fieldset`/`legend` içinde ve native radio kullanıyor. Adım değişince odak yeni `h1`'e taşınıyor. Hata mesajları `role=alert`, kopyalama sonucu `role=status`. `focus-visible` outline var, dokunma hedefleri ≥44 px (`min-h-11`), il `select`'i etiketli ve `aria-describedby` ile ipucuna bağlı.

## 2. Kanıt

### Kapılar

```
$ pnpm typecheck        → tsc --noEmit, exit 0
$ pnpm lint             → eslint, exit 0
$ pnpm i18n:check       → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves,
                          and no file gained hard-coded text.  (Literals 325/325 baseline — yeni literal yok)
$ npx vitest run src/lib/readiness src/lib/public-sector
   Test Files  5 passed (5)
        Tests  47 passed (47)        (readiness: 23 test — score.test.ts 19 + share.test.ts 4)
$ pnpm test (tam)
   Test Files  7 failed | 159 passed | 8 skipped (174)
        Tests  46 failed | 1882 passed | 93 skipped (2021)
```

Tam `pnpm test` koşusundaki 46 hata **bu işle ilgisiz**: hepsi canlı Postgres isteyen testlerde ve hepsi `PrismaClientKnownRequestError: Authentication failed` veriyor. Etkilenen dosyalar `src/lib/billing/plan-admin.test.ts`, `plan-repository.test.ts`, `tests/*.live.test.ts`, `tests/relationship-tenant-scope.test.ts` ve `tests/plan-entitlement-version.spec.ts`. Hiçbiri readiness ya da public-sector koduna dokunmuyor. Bu yüzden "test 0" DoD maddesi **yalnız bu kartın testleri için** sağlandı; tam paket bu makinedeki veritabanı kimlik bilgisi yüzünden kırmızı.

**Birim testleri (≥5 şartı, 23 test)**: sıfır hazırlık (0 puan, 15 öncelikli gap, PIC linki); tam hazırlık (100, gap yok); hepsi 1 (50, gelişen); eşik sınırları (39/40, 69/70); 12/30 → 40 gelişen, 11/30 → 37 başlangıç; eksik cevap = 0; gap sıralaması; determinizm; eşleştirici kuralları (kolay↔büyük, kurum türü, yurt dışı ortak, eş finansman); Türkiye'ye kapalı program hiç önerilmez; bölgesel program il ister; gerçek katalogla Samsun sıfır hazırlık → `[oka-financial-support, ulusal-ajans-decentralised, erasmus-ka2-partnerships]`; tam hazırlık → `cities-mission` başta, üçü de difficulty 3; 4 kurum türü × 3 seviyenin hiçbirinde CERV/LIFE önerilmez; paylaşım linki gidiş-dönüş, il, eksik test ve kurcalanmış link.

**Mutasyon kontrolü**: `score.ts` içinde `if (!isOpenToTurkishApplicants(p)) return false;` satırı kapatılınca **6 test kırıldı**, dosya yedekten geri yüklendi (`git checkout` kullanılmadı).

### Gerçek tıklama (Playwright + Google Chrome, `localhost:3000` dev sunucusu, kayıtsız)

Betik: `docs/agent-results/TASK-MULR3TQ24ZZ7N-screenshots/readiness-e2e.mjs`. Çerez penceresi kapatıldı, ardından tüm seçimler gerçek `click` ile yapıldı. Çıktı:

```
PROFILE low (hepsi "0", İlçe belediyesi, Samsun, 1280):
  empty start alert: Başlamak için kurum türünü seçin.
  unanswered alert: Devam etmek için bu adımdaki tüm soruları yanıtlayın.
  step 1..5: "Kurumsal kayıt" … "Proje fikri"  focus=H1#step-heading questions=3
  url=/tr/fon-hazirlik?kurum=municipality&cevap=000000000000000&il=Samsun
  score: 0 / 100 · Başlangıç
  recommended: OKA Mali Destek · Ulusal Ajans Merkezi Olmayan Hibeler · Erasmus+ KA2
  gaps: 15
  share link same result: true (shared notice=1)      ← yeni bağlamda (yeni sekme) açıldı
  CTA → /tr/kayit?kaynak=fon-hazirlik
  analytics: readiness_started {orgType: municipality} | readiness_completed {orgType: municipality,
             total: 0, level: baslangic} | readiness_signup_clicked {orgType: municipality, level: baslangic}
  horizontal overflow px: 0
PROFILE high (hepsi "2", Büyükşehir, il yok, 1280):
  score: 100 / 100 · Hazır
  recommended: Cities Mission · Yeni Avrupa Bauhaus'u (NEB) · Dijital Avrupa Programı
  gaps: 0 · share link same result: true · CTA → /tr/kayit?kaynak=fon-hazirlik · overflow 0
PROFILE mid (hepsi "1", Samsun, MOBİL 360):
  score: 50 / 100 · Gelişen
  recommended: Erasmus+ KA2 · Interreg NEXT Karadeniz Havzası · Ulusal Ajans
  gaps: 15 · share link same result: true · overflow 0
KEYBOARD only:
  focus-visible outline on submit: solid
  reached result via keyboard only (Space/Tab/ArrowDown/Enter); url=…cevap=111111111111111
Print (emulateMedia print): header false | cta false | share false | gaps true | recs true
EN: /en/funding-readiness?… → h1 "Your readiness result"
```

### Ekran görüntüleri (`docs/agent-results/TASK-MULR3TQ24ZZ7N-screenshots/`)

| Dosya                         | İçerik                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| `01-intro.png`                | Giriş ekranı, masaüstü                                     |
| `02-step-1280.png`            | 2. adım (Kapasite), masaüstü                               |
| `03-result-low-1280.png`      | **Profil 1: düşük hazırlık** (0 puan, Samsun) sonuç        |
| `03-result-high-1280.png`     | **Profil 2: yüksek hazırlık** (100 puan, büyükşehir) sonuç |
| `03-result-mid-360.png`       | **Mobil 360 px** sonuç (50 puan, gelişen)                  |
| `04-keyboard-focus.png`       | Yalnız klavyeyle gezinirken odak halkası                   |
| `05/06-mobile-*-360.png`      | Mobil giriş ve soru adımı                                  |
| `07-mobile-en-shared-360.png` | EN paylaşım linki, mobil                                   |
| `08-print.pdf`                | Tarayıcı yazdırma çıktısı (nav, CTA ve paylaşım gizli)     |

"Önce" görüntüsü yok: sayfa yeni, bu işten önce `src/app/[locale]/fon-hazirlik/` rotası yoktu.

### Kontrast (WCAG AA, token değerleriyle ölçüldü)

İlk sürümde açık temada iki çift sınırın altında kaldı: `muted` üzerinde `ground` 4.39:1, hata metni `bad` üzerinde `ground` 4.46:1. Düzeltme: zemin üstündeki metinler `text-ink-2` yapıldı, hata mesajı beyaz kutuya alındı (`bad`/`surface` 4.83:1). Kalan `text-muted` kullanımları beyaz kart içinde (4.76:1). Buton beyaz/`accent-strong`: açık temada 5.93, koyu temada 5.36. Link `accent-ink`: 5.93 / 12.79.

## 3. Değişen dosyalar (commit `959c1e80`)

- `src/lib/readiness/questions.ts`, `score.ts`, `share.ts`, `provinces.ts` (81 il), `score.test.ts`, `share.test.ts`
- `src/app/[locale]/fon-hazirlik/page.tsx`, `readiness-check.tsx`
- `src/app/[locale]/funding-readiness/page.tsx`
- `messages/tr.json`, `messages/en.json`: yalnız yeni `readiness` isim alanı eklendi, başka anahtar değişmedi (JSON karşılaştırmasıyla doğrulandı)
- Rapor commit'i: bu dosya + `docs/agent-results/TASK-MULR3TQ24ZZ7N-screenshots/`

`src/lib/public-sector/` dosyalarına, şemaya ve migration'a dokunulmadı. Push yapılmadı.

## 4. Riskler

- **Öneri kalitesi katalog verisine bağlı.** Katalog değişirse (ör. Türkiye LIFE'a katılırsa) öneri kendiliğinden değişir. Gerçek katalogla yazılmış testler o durumda kasıtlı olarak kırılır ve gözden geçirmeyi zorlar.
- **Orta seviyede eşitlikler**: gelişen seviyede birkaç program aynı puanı alabiliyor; o zaman katalog sırası belirleyici oluyor. Örnek: Samsun'da hepsi 1 cevaplanınca OKA ilk 3'e girmiyor. Ürün kararı gerekirse bölgesel programa küçük bir bonus eklenebilir.
- Paylaşım linki kurum türünü ve (seçildiyse) ili taşır. Bunlar kategori bilgisi, kişisel veri değil. Linkte kurum adı yok.
- `analytics.ts` hâlâ bir stub (yalnız development ortamında `console.log`). Olaylar üretimde PostHog bağlanınca akacak.

## 5. Açık sorular

- Kalıcı lead/iletişim saklama: leed-fb ayrı kart açıyor (karar A).
- `/belediye-cagrilari` sayfası se-fb'nin Faz 2'si. O sayfa gelene kadar sonuç ekranındaki "Belediyelere açık çağrıları gör" linki 404 verebilir.
- `/kayit` sayfası `kaynak` parametresini henüz okumuyor ya da kaydetmiyor; hesap açılışını bu sayfaya bağlamak için kayıt tarafında ayrı bir iş gerekir.

## 6. Sonraki adım

- se-fb Faz 2 (`/belediye-cagrilari`) gelince iki sayfa arasındaki linki uçtan uca tıklayarak doğrulamak.
- `kaynak=fon-hazirlik` parametresini kayıt akışında yakalamak (analytics ya da kullanıcı alanı).
- Lead kartı açılınca sonuç ekranına KVKK rızalı iletişim formunu eklemek.
