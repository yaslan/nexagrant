# TASK-MULR39X1K5K6C — Belediye çağrı radarı (se-fb)

**Sprint:** FB-KAMU-1 · **Dal:** dev · **Ajan:** se-fb · **Tarih:** 29.09.2026

## Özet

- **Faz 1:** Kamu program kataloğu `819aff09` commit'inde, tek başına commit'lendi. 12 program var ve her kayıtta resmî kaynak notu (URL + erişim tarihi) bulunuyor. Kaynağın vermediği değerler `null`.
- **Faz 2:** `listPublicSectorCalls` fonksiyonu ve herkese açık `/tr/belediye-cagrilari` (`/en/municipal-calls`) sayfası `e0198dd5` commit'inde. Sayfadaki "Size uygun mu? 3 soru" kutusu gerçek tarayıcıda tıklanarak denendi ve iki farklı sonuç verdi.
- **Faz 3:** Interreg/IPA/OKA kaynak spike'ı aşağıdaki "Sonraki adım" bölümünde.
- **Kritik bulgu:** Resmî katılımcı ülke listelerine göre **Türkiye CERV programına ve LIFE programına katılmıyor.** Kartta "en kolay giriş" olarak geçen CERV Town-Twinning'e Türk belediyesi başvuru sahibi de ortak da olamıyor. Bu durum katalogda `turkeyEligibility: 'not_eligible'` olarak işaretlendi ve sayfada kırmızı uyarıyla gösteriliyor. leed-fb ADR-0004'ü bu bulguya göre düzeltmiş (`b1cf6e6b`).

## 1. Ne yapıldı

### Faz 1 — `src/lib/public-sector/catalog.ts` (commit `819aff09`)

- `PUBLIC_SECTOR_PROGRAMMES` listesinde kartın istediği alanların hepsi var: `key`, `name{tr,en}`, `sourceKey`, `eligibleOrgTypes`, `difficulty`, `typicalGrantEur`, `cofinancingPct`, `needsPic`, `needsPartners`, `plainTr`, `officialUrl`, `sourceNote[]`.
- **Eklenen alanlar (hiçbir alanın adı değişmedi):**
  - `turkeyEligibility`: `eligible | partial | not_eligible | check_call`.
  - `turkeyRegions`: İl listesi. Interreg programları bölgeseldir; Bulgaristan–Türkiye programı yalnız Edirne ve Kırklareli'yi kapsar, Karadeniz Havzası ise Samsun dahil 25 ili kapsar.
  - `sediaTopicPattern`: K1, SEDIA'dan gelen her konuyu `HE` Programme satırına bağlıyor. Bu yüzden programı güvenilir biçimde gösteren tek işaret konu tanımlayıcısı.
- **Yardımcılar:** `PUBLIC_SECTOR_ORG_TYPES` (runtime dizi, fe-fb istedi), `getPublicSectorProgramme`, `isOpenToTurkishApplicants`, `coversTurkishProvince`, `matchesSediaTopic`.
- **Para (kural 9):** `typicalGrantEur` alanı `{ minCents, maxCents, currency: 'EUR' }` biçiminde, tutarlar cent cinsinden. `cofinancingPct` kurumun kendi karşılaması gereken yüzdedir: LIFE SAP için 40, Horizon Europe'ta kâr amacı gütmeyen kurumlar için 0. Lump-sum hibelerde ya da kaynak oran vermiyorsa `null`.
- **Programlar:** CERV Town-Twinning, CERV Networks of Towns, Erasmus+ KA2, LIFE (SAP/SIP/TA/CET), Cities Mission / NetZeroCities, NEB, DUT, Digital Europe, Interreg IPA BG–TR, Interreg NEXT Karadeniz Havzası, Ulusal Ajans merkezi olmayan hibeler, OKA mali destek programları.
- fe-fb'ye alan notları ayrıca mesajla iletildi. En önemlisi: `isOpenToTurkishApplicants` kullanılmazsa karne sayfası CERV ve LIFE'ı önerebilir.

**Kaynaktan alınan temel rakamlar** (her birinin kaynağı katalogdaki `sourceNote` alanında):

| Program                                                   | Tipik hibe       | Eş finansman      | Türkiye                              | Kaynak                                                                                       |
| --------------------------------------------------------- | ---------------- | ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| CERV Town-Twinning                                        | 8.455–50.745 €   | lump sum → `null` | katılmıyor                           | Call doc CERV-2026-CITIZENS-TOWN-TT V1.0 + CERV ülke listesi V10.0                           |
| CERV Networks of Towns                                    | ≥100.000 €       | `null`            | katılmıyor                           | Call doc CERV-2026-CITIZENS-TOWN-NT                                                          |
| Erasmus+ KA2                                              | 30.000–400.000 € | `null`            | katılıyor                            | Programme Guide KA210/KA220 + ERASMUS ülke listesi V3.0                                      |
| LIFE SAP                                                  | 0,7–10 M€        | %40               | katılmıyor                           | Call doc LIFE-2026-SAP-ENV V1.0 + LIFE ülke listesi V10.0                                    |
| Cities Mission                                            | 6–10 M€          | %0                | katılıyor                            | F&T portal verisi HORIZON-MISS-2026-04-CIT-* + HE Genel Ekler 2026-27 + HE ülke listesi V4.1 |
| NEB                                                       | 3,5–6,3 M€       | %0                | katılıyor                            | F&T portal verisi HORIZON-NEB-2026-01-*                                                      |
| Digital Europe                                            | `null`           | `null`            | kısmen (ÖH 1, 2, 4, 5)               | DEP ülke listesi V7.0                                                                        |
| DUT, Interreg BG–TR, Karadeniz Havzası, Ulusal Ajans, OKA | `null`           | `null`            | çağrıya ya da bölgeye göre değişiyor | ulusal otorite sayfaları, oka.gov.tr                                                         |

### Faz 2 — Radar + sayfa (commit `e0198dd5`)

**`src/lib/public-sector/radar.ts` → `listPublicSectorCalls({ orgType, locale })`**

- Katalogdaki `sourceKey` önekleriyle (`CERV-`, `LIFE-`, `ERASMUS-`, `HORIZON-MISS-`, `HORIZON-NEB-`, `DIGITAL-`) OPEN ve FORTHCOMING durumundaki `Topic` kayıtlarını okur. Ardından her kaydı `sediaTopicPattern` ile katalogdaki programa bağlar.
- Aşağıdaki çağrılar elenir:
  - Kaydında `EU_EEA_CH_ONLY` ya da `countriesExcluded: TR` olanlar (G0'ın `isCountryEligible` kontrolü).
  - Metninden `inferEligibilityFromText` ile AB/AEA/İsviçre'ye özel olduğu anlaşılanlar.
  - Digital Europe'ta siber güvenlik (ÖH 3) çağrıları, çünkü Türkiye bu hedefe katılmıyor.
  - Digital Europe'ta metninde kamu kurumu işareti bulunmayanlar (`detectPublicBodySignal`).
- Son tarihi son 120 gün içinde geçen turlar `recently_closed` olarak gösterilir. Bu programlar her yıl yeniden çağrı açtığı için belediyenin bir sonraki tura hazırlanmasına yarar.
- Seçimi yapan saf fonksiyon (`selectPublicSectorCalls`) veritabanı olmadan birim testinden geçiyor.
- **Veri erişimi:** Yalnız `Topic` tablosu okunuyor. Bu referans verisidir: `tenantId` alanı ve RLS politikası yok, `/calls/turkey` sayfası da aynı okumayı yapıyor. Kiracı verisine dokunulmadığı için `withSystemScope` ya da baseline girdisi gerekmedi, `rls:bypass-check` yeşil.

**`src/lib/public-sector/fit.ts` → `assessFit`**

- Deterministik çalışır; YZ çağrısı ve I/O yapmaz.
- Programa göre yalnız gerekli soruları sorar: PIC, ortak ve eş finansman. Oranı 0 olan programda eş finansman sorusu "gerekli değil" olarak gösterilir.
- Eş finansman oranı bilinmiyorsa (`null`) soru yine sorulur. Aksi halde hazır olmayan bir kuruma "uygun" demek mümkün olurdu.
- `not_eligible` programlarda sonuç asla "Uygun" olmaz.

**Sayfa: `src/app/[locale]/belediye-cagrilari/page.tsx`** (İngilizce rota `municipal-calls/page.tsx`)

- Kurum türü filtresi (`?orgType=`).
- Açık ve yakında açılacak çağrı kartları. Her kartta faz, program, zorluk rozeti, eş finansman, Türkiye rozeti, tipik hibe, kaynak linki, Brüksel saatiyle son tarih ve kullanıcının saatiyle son tarih (`LocalDeadline` bileşeni yeniden kullanıldı) ile "Size uygun mu? 3 soru" kutusu var.
- "Son turu yeni kapanan çağrılar" bölümü program başına gruplanıyor; LIFE'ın 23 konusu tek kartta.
- "Portalda olmayan programlar" bölümünde Interreg, OKA, Ulusal Ajans ve DUT yer alıyor.
- "İç ön değerlendirme" uyarısı sayfada görünüyor.
- Sabit metin yok, hepsi `publicSectorCalls` i18n isim alanında (tr + en).
- Sayfa oturumsuz erişilebiliyor: `proxy.ts` yalnız i18n yapıyor, sayfa `(app)` grubunun dışında.

## 2. Kanıt

### Kapılar (commit `e0198dd5` üzerinde, scratchpad'de temiz worktree + symlink node_modules)

Ana ağaçta fe-fb'nin commit'lenmemiş `fon-hazirlik` dosyaları `tsc`'yi kırmızı yapıyordu. Benim dosyalarımda hata yoktu (`tsc | grep public-sector` → 0 satır). Kapılar bu yüzden ayrık worktree'de koşuldu.

```
== pnpm typecheck exit 0        $ tsc --noEmit
== pnpm lint exit 0             $ eslint
== pnpm test exit 0             Test Files  170 passed | 2 skipped (172)
                                     Tests  1990 passed | 8 skipped (1998)
== pnpm rls:bypass-check exit 0 ✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed with a
                                   recorded reason, 24 on the sanctioned cross-tenant path, 0 still owed.
== pnpm i18n:check exit 0       ✅ i18n check passed: both catalogs agree, every key used in src/
                                   resolves, and no file gained hard-coded text.
                                   (Literals found: 325 in 37 file(s) = baseline 325)
```

Not: Worktree'de `pnpm <script>` önce bağımlılık kontrolü yapıp `pnpm install`'a düşüyordu. Sebebi başka bir ajanın henüz commit'lenmemiş `esbuild` `allowBuilds` satırı (`ERR_PNPM_IGNORED_BUILDS`); benim değişikliğimle ilgisi yok. Script'ler aynı hâliyle `pnpm --config.verify-deps-before-run=false <script>` komutuyla koşuldu.

**Birim testleri:** `src/lib/public-sector` altında 24 test var: `catalog.test.ts` 10, `radar.test.ts` 8, `fit.test.ts` 6.

**Negatif kontrol:** Worktree'de `fit.ts`'teki eş finansman kontrolü ve `radar.ts`'teki `isCountryEligible` elemesi silindi. Sonuç `Tests 3 failed | 21 passed`. Değişiklikler geri alınınca `24 passed` oldu. Testler bu iki davranışı gerçekten yakalıyor.

### Gerçek veri (yerel `fabrika` DB, K1 verisi)

`listPublicSectorCalls({orgType:'municipality'})` 54 çağrı döndü:

- Açık: Digital Europe 2 (BESTUSE-10-EHDS / NETWORKSICs), Cities Mission 3 (HORIZON-MISS-2026-04-CIT-01/-02/-NEB-B4P-CCRI-03, 08.10.2026), NEB 9 (HORIZON-NEB-2026-01-*, 01.12.2026).
- Yakında açılacak: 2027 Cities Mission ve NEB konuları.
- Yakın zamanda kapanan: **CERV-2026-CITIZENS-TOWN-TT** (23.09.2026) ve **LIFE-2026-SAP/TA/CET** 23 konu (16–22.09.2026).

`development_agency` için sonuç: yalnız 2 Digital Europe çağrısı.

### Gerçek tarayıcı (AgentSpace iç tarayıcısı, oturum yok, "Giriş / Kayıt Ol" butonu görünüyor)

Tıklamalar tarayıcıda gerçekten yapıldı. Kareler `docs/agent-results/TASK-MULR39X1K5K6C-screenshots/` klasöründe:

1. `01-tr-radar-oturumsuz-ust.png`: `/tr/belediye-cagrilari` sayfası oturum açmadan yükleniyor. Başlık, kurum türü filtresi, "Açık ve yakında açılacak çağrılar (30)" bölümü, zorluk / eş finansman / Türkiye rozetleri ve Brüksel ile İstanbul saatleri görünüyor.
2. `02-tr-cities-mission-fit-uygun.png`: HORIZON-MISS-2026-04-CIT-02 kartında kutu açıldı, PIC "Evet" ve ortak "Evet" seçildi. Eş finansman sorusu "Bu program için gerekli değil" olarak görünüyor. Sonuç **"Uygun"**.
3. `03-tr-cities-mission-fit-hazirlik-gerekli.png`: Aynı kutuda PIC "Hayır" seçildi. Sonuç **"Hazırlık gerekli"**, eksik olarak "PIC kaydı" listeleniyor ve "Fon Hazırlık Karnesi" linki çıkıyor (`/tr/fon-hazirlik`).
4. `04-tr-kapanan-cerv-life-ve-portal-disi.png`: **CERV Town-Twinning** (CERV-2026-CITIZENS-TOWN-TT) ve **LIFE** (23 konu) kartları listeleniyor. Her ikisinde "Türkiye bu programa katılmıyor" rozeti ve uyarısı var. Altında portal dışı programlar (DUT, Interreg BG–TR "Uygun iller: Edirne, Kırklareli") görünüyor.
5. `05-en-municipal-calls-union.png`: `/en/municipal-calls?orgType=union_of_municipalities` açıldı. İngilizce metinler, filtre ve boş durum mesajı doğru görünüyor.

## 3. Değişen dosyalar

**Commit `819aff09`**

- `src/lib/public-sector/catalog.ts`
- `src/lib/public-sector/catalog.test.ts`

**Commit `e0198dd5`**

- `src/lib/public-sector/radar.ts`
- `src/lib/public-sector/radar.test.ts`
- `src/lib/public-sector/fit.ts`
- `src/lib/public-sector/fit.test.ts`
- `src/app/[locale]/belediye-cagrilari/page.tsx`
- `src/app/[locale]/belediye-cagrilari/fit-check.tsx`
- `src/app/[locale]/municipal-calls/page.tsx`
- `messages/tr.json` ve `messages/en.json`: yalnız yeni `publicSectorCalls` isim alanı eklendi. fe-fb'nin çalışma ağacındaki commit'lenmemiş `readiness` anahtarları commit'e karışmasın diye, `HEAD` sürümü + benim isim alanım geçici bir index ile yazıldı. Çalışma ağacındaki fark artık yalnız fe-fb'nin anahtarlarından oluşuyor.

**Rapor commit'i**

- Bu dosya ve `docs/agent-results/TASK-MULR39X1K5K6C-screenshots/*.png` (5 kare).

**Dokunulmayanlar:** `sedia.ts`, `prisma/schema.prisma`, `src/lib/readiness/`, `/fon-hazirlik`. Push yapılmadı.

## 4. Riskler

- **Kural 7 (kanıt disiplini):** Katalog rakamları kod içindeki statik verilerdir; `Evidence` ya da `TopicStat` kaydı değildir. Kart statik bir katalog istediği için her rakamın yanında sayfada "Kaynak" linki var ve rakamın kaynağı `sourceNote` alanında duruyor. Kalıcı çözüm için rakamları `Evidence` kaydına bağlamak ayrı bir iş olarak planlanabilir.
- **Eskime:** Ülke listeleri ve lump-sum seçenekleri her yıl değişiyor. Erişim tarihi 29.09.2026. Yeni iş programı yayımlandığında katalogdaki `sourceNote` alanlarının yeniden kontrol edilmesi gerekiyor.
- **Karadeniz Havzası eş finansman oranı:** İkincil kaynaklar %8 ile %10 arasında çelişiyor ve birincil kaynaktan doğrulanamadı. Bu yüzden `null` bırakıldı.
- **DUT:** 2026 çağrı sayfasında Türkiye adı geçmiyor, bu yüzden `check_call` olarak işaretlendi. Bu bir **varsayım**; TÜBİTAK'ın DUT'a katılıp katılmadığı doğrulanmadı.
- **K1 verisi eski durumlar içeriyor:** DB'de son tarihi 2023 olan konular hâlâ `OPEN` görünüyor. Radar bunları 120 günlük pencereyle eliyor, ama kök neden K1'in kapanış güncellemesi. Bu benim kapsamımda değil.
- **K1'in program kimliği eşlemesi:** `getProgrammeIdFromTopic` işlevi SEDIA'dan gelen her konuyu `HE` olarak dosyalıyor. Ayrıca `getProgrammeName` içinde `DUT` → "Digital Europe" eşlemesi yanlış. Radar bunu tanımlayıcı desenleriyle aşıyor; sedia.ts ve k1 dosyalarına dokunulmadı.
- **Güvenlik (rol gereği tarandı):**
  - Sayfa yalnız okuma yapıyor ve kiracı verisine erişmiyor.
  - `orgType` parametresi izinli listeye (allow-list) göre doğrulanıyor; geçersiz değer `municipality`'ye düşüyor.
  - Dış linkler `rel="noopener noreferrer"` ile açılıyor.
  - Uygunluk kutusunun cevapları yalnız bileşen state'inde duruyor; saklanmıyor, gönderilmiyor, kişisel veri yok.
  - Sır ya da kişisel veri içeren yeni kod yok.

## 5. Açık sorular (leed-fb)

1. BUSINESS_MODEL §3 ve pilot sunum metinlerinde CERV "en kolay giriş" olarak geçiyordusa güncellenmeli. ADR-0004 düzeltildi (`b1cf6e6b`), cs-fb'nin OKA paketi LIFE'ı düzeltti (`dfef5822`). Türk belediyeleri için gerçek "kolay giriş" kapısı **Ulusal Ajans (Erasmus+ KA1/KA210)** ve **OKA**.
2. Portal dışı kaynaklar (Faz 3) `Topic` tablosuna mı yazılacak, yoksa ayrı bir "duyuru" tablosuna mı? `Topic` son tarih ve yapılandırılmış alanlar istiyor. Şema kararı gerektiği için Faz 3'te kod yazılmadı.

## 6. Sonraki adım — Faz 3 kaynak spike önerisi

Canlı kontroller 29.09.2026'da yapıldı.

| Kaynak                                                                        | Biçim                                                       | Güncellik / sıklık                                                                               | Kullanım koşulu (robots vb.)                                                                                                      | Öneri                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **cbc.ab.gov.tr/feed/** (Dışişleri Bak. AB Başkanlığı, Sınır Ötesi İşbirliği) | WordPress **RSS 2.0** (`application/rss+xml`)               | Güncel; son kayıtlar 21–24.08.2026 (Akdeniz Havzası 3. teklif çağrısı, BG–TR). Ayda birkaç kayıt | robots.txt yalnız `/wp-admin/`'i kapatıyor; kamu kurumu                                                                           | **Birincil kaynak olarak kullanılsın.** Türkiye'nin katıldığı 3 Interreg programının (BG–TR, Karadeniz Havzası, Akdeniz Havzası) çağrı duyuruları tek yerden ve Türkçe geliyor. Günlük, idempotent çekim yapılsın; ham yanıt `RawFetch`'e yazılsın. "Teklif Çağrısı" anahtar kelimesiyle süzülsün. Son tarih serbest metinde olduğu için başlangıçta **insan onaylı kuyruk** kullanılsın. |
| ipacbc-bgtr.eu/rss.xml                                                        | Drupal RSS                                                  | **Bayat**: son kayıt 19.10.2023 (2014–20 sitesi)                                                 | —                                                                                                                                 | Kullanılmasın.                                                                                                                                                                                                                                                                                                                                                                            |
| blacksea-cbc.net                                                              | Joomla HTML; RSS görünümü 404 veriyor                       | Haberler güncel (Temmuz 2026)                                                                    | robots.txt **`GPTBot` ve `ClaudeBot` için `Disallow: /`** ve `/api/` kapalı                                                       | **Kazıma yapılmasın.** Site sahibi otomatik ve YZ tarayıcılarını açıkça istemiyor. Çağrılar zaten cbc.ab.gov.tr RSS'ine yansıyor.                                                                                                                                                                                                                                                         |
| oka.gov.tr (/destekler, /duyurular)                                           | Yalnız HTML (`/rss` ana sayfayı döndürüyor, robots.txt yok) | Program ilanları yılda birkaç kez; duyurular haftalık                                            | robots.txt yok. Kullanım koşulları sayfası bulunamadı (**varsayım: kamu duyurusu, atıfla kullanılabilir**, yazılı teyit alınmalı) | **Haftalık HTML çekimi** yapılsın, ham yanıt `RawFetch`'e yazılsın. Sayfa yapısı değişirse `SystemAlert` üretilsin (kural 6). Hacim düşük olduğu için ilk sürüm **elle küratörlük** olabilir. 26 kalkınma ajansına ölçeklenirse her ajansın CMS'i ayrıca denetlenmeli (**varsayım**: aynı altyapı olabilir).                                                                              |
| keep.eu API                                                                   | JSON                                                        | Interreg **proje** veritabanı, çağrı değil                                                       | Kimlik doğrulama istiyor (401)                                                                                                    | Çağrı radarı için değil. İleride "geçmişte kazanan belediye projeleri" kanıtı için kullanılabilir.                                                                                                                                                                                                                                                                                        |
| euro-access.eu                                                                | HTML aggregator                                             | Güncel Interreg çağrı özetleri                                                                   | robots izin veriyor, ancak üçüncü taraf ve lisansı belirsiz                                                                       | Birincil kaynak olarak kullanılmasın; yalnız çapraz kontrol için.                                                                                                                                                                                                                                                                                                                         |

**Önerilen sıra**

1. leed-fb'nin şema kararı (açık soru 2).
2. `TR-CBC` RSS adaptörü: `src/lib/adapters/`, K1 kalıbında, `AdapterResult`, idempotent.
3. OKA için haftalık HTML adaptörü ya da elle küratörlük.
4. Radar'da "portal dışı programlar" bölümü bu kaynaklardan beslenen gerçek çağrılara çevrilsin.

## Platform beyanı

**Web (platformdan bağımsız), macOS'ta doğrulandı.**

- Birim testleri, kapılar ve AgentSpace iç tarayıcısında (Chromium tabanlı) gerçek tıklamalar macOS'ta yapıldı.
- Kodda platforma bağlı yol yok: süreç, dosya yolu, kabuk ya da kısayol kullanılmıyor.
- Son tarihler `Intl` ile `Europe/Brussels` saatinde ve tarayıcının kendi saat diliminde gösteriliyor. Bu davranış Windows ve Linux tarayıcılarında aynıdır.
- **Windows, Linux ve mobil genişlikte koşulamadı.** Bu ortamda başka işletim sistemi yok. Playwright ile mobil görünüm koşusu AgentSpace kill-guard kancası tarafından engellendi; kanca atlatılmadı. Düzen Tailwind `md:` kırılımıyla tek sütuna düşüyor (koddan).
