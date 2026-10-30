# FonBridge — Veriniz nerede? (kamu kurumları için tek sayfa)

> Sürüm 1.3 · 29.09.2026 · Hazırlayan: CS-FB · Kart: TASK-MULRS7WKYEFOP (FB-KAMU-2, B9); 1.1: TASK-MUN2UXWTAX1AQ (barındırma kararı: Vulut, Türkiye); 1.2: TASK-MUN2PNAR729H8 (e-posta: `info@nexagrant.com`, sunucu `mail.nexagrant.com`, alan adı `nexagrant.com`); 1.3: TASK-MUN4U4PR3DWMT (e-posta Vulut'un cPanel e-posta hizmetiyle gider — SMTP Seçenek A)
>
> **Durum: TASLAK.** Pilot görüşmesinden önce patron okur. Her satırın kaynağı sağ sütundadır; "K" kodları sonuç raporundaki (`docs/agent-results/TASK-MULRS7WKYEFOP-cs-fb.md`) envanter satırlarıdır. Koddan ya da sağlayıcının resmî belgesinden doğrulayamadığımız her şey **[DOĞRULANMADI]** diye işaretlidir. **1.1 (29.09.2026):** barındırma kararı verildi. Veritabanı, uygulama sunucusu, iş kuyruğu ve e-posta sunucusu Türkiye'de (Vulut). Yurt dışına giden akışlar aşağıda ayrı ve açık yazılıdır. Bu yüzden "tüm veri Türkiye'de" demiyoruz; "veritabanı Türkiye'de" diyoruz.

## Kısa cevap

1. **Veritabanı Türkiye'de.** Hesaplar, ekip, çağrı listesi, konsept not metinleri, karne, zamanlanmış işler ve e-posta sunucusu, Türkiye'de Vulut'ta durur. Vulut, Bilgi Teknolojileri ve İletişim Kurumu (BTK) lisansıyla çalışan bir yer sağlayıcı ve hosting firmasıdır (patron kararı, 29.09.2026).
2. **Yurt dışına giden üç akış kalıyor** (aşağıda "Yurt dışına giden akışlar"): YZ metin üretimi (Anthropic, ABD), arama için metin vektörü (OpenAI, ABD) ve Google ile giriş (Google, ABD). YZ modüllerini kapatırsanız ilk ikisi durur (aşağıda "YZ'siz çalışma"). Google ile giriş tek giriş yoludur, kapatılamaz.
3. **Yüklenen dosyaların deposu (Cloudflare R2) bu kararın dışında.** Deponun bölgesi hesap ayarına bağlı ve henüz doğrulanmadı (aşağıdaki tablo, madde 2).

## Hangi veri nereye gidiyor?

| Veri                                                          | Nereye gidiyor                                                                | Hangi ülke / bölge                                                                                                       | Kaynak                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Hesaplar, ekip, çağrı listesi, konsept not metinleri, karne, zamanlanmış işler | Postgres veritabanı ve uygulama sunucusu, Vulut'ta. İş kuyruğu (graphile-worker) ayrı bir bağlantı (`JOBS_DATABASE_URL`) verilmezse aynı veritabanındadır | **Türkiye.** Vulut, BTK lisanslı yer sağlayıcı (patron kararı 29.09.2026, TASK-MUN2UXWTAX1AQ). Yurt dışı aktarım değil. Planda geçen Neon/Vercel seçilmedi | K1 · `src/lib/env.ts:43-45` · envanter §21 |
| Yüklediğiniz dosyalar (kanıt belgeleri, ekran görüntüleri)    | Cloudflare R2 dosya deposu                                                    | **[DOĞRULANMADI]** Kod, "AB yargı yetkisi" olan bir depo kullanmıyor; depo AB'de olsa bile bu bir tercih (garanti değil) | K2 · `src/lib/storage.ts:14-15` · Cloudflare R2 belgesi                |
| Konsept not / değerlendirme için yazdığınız metin (YZ açıksa) | Anthropic (Claude)                                                            | Saklama **ABD**. İşlem varsayılan ayarda **herhangi bir ülkede** olabilir; AB seçeneği yok                               | K3 · `src/lib/llm.ts:30,181` · Anthropic veri yerleşimi belgesi        |
| Arama için metin parçaları (YZ açıksa)                        | OpenAI (embedding)                                                            | **ABD**                                                                                                                  | K4 · `src/lib/llm.ts:545`                                              |
| E-posta adresi, bildirim e-postası içeriği                    | SMTP sunucumuz `mail.nexagrant.com`, gönderici `info@nexagrant.com` (patron kararı 29.09.2026; Resend aynı gün kaldırıldı, `fe9fd31c`). Sunucu: Vulut'un cPanel e-posta hizmeti (paylaşımlı cPanel/Exim sunucusu; Seçenek A, patron 29.09.2026) | **Türkiye** (Vulut). Ayrı bir e-posta firması yok: e-posta, veritabanını da barındıran Vulut'un e-posta hizmetinden çıkar; sunucunun bakımını Vulut yapar. Alıcının posta kutusu firması (ör. Gmail) e-postayı görür; bunu alıcı kendisi seçer. Canlı kurulum ve DNS (SPF/DKIM/DMARC) henüz yapılmadı (`docs/SMTP-SUNUCU.md`) | K5 · `src/lib/email/mailer.ts` · `fe9fd31c` |
| Google ile giriş (tek giriş yolu)                             | Google (Microsoft ile giriş 29.09.2026'da kaldırıldı, `acc35b07`)             | ABD merkezli şirketler                                                                                                   | K8 · `src/lib/auth.ts:2-3`                                             |
| Ürün analitiği                                                | **Hiçbir yere** (anahtar yok). Anahtar girilirse yalnız çerez onayıyla, anonim olarak PostHog AB'ye gider (§19a)               | —                                                                                                                        | K6 · `src/lib/analytics.ts:5,11`                                       |
| Hata kayıtları                                                | **Hiçbir yere.** Hatalar yalnız kendi veritabanımızda kalır; dışarı gönderen kod yoktur (Sentry 29.09.2026'da kaldırıldı, `89eab729`) | —                                                                                                                        | K7 · `docs/legal/processing-register.md` §19a · `89eab729`                          |

## Yurt dışına giden akışlar (kalan tek kalemler)

Barındırma kararından sonra yurt dışına kişisel veri götüren üç akış kalıyor. Üçü de ABD merkezli şirketlerdir. Hiçbiri için repoda imzalı bir standart sözleşme (SCC) ya da ek sözleşme yok (envanter §21).

| Akış | Sağlayıcı | Ülke | Giden veri | Nasıl durur | Kaynak |
| ---- | --------- | ---- | ---------- | ----------- | ------ |
| **YZ metin üretimi** (konsept not, değerlendirme) | Anthropic PBC | ABD (saklama). İşlem varsayılan ayarda herhangi bir ülkede olabilir | Kullanıcının YZ özelliğine yazdığı ve seçtiği metin | YZ modülünü kapatmak (aşağıda) | K3 · envanter §6 |
| **Metin vektörü (embedding)** — arama ve eşleştirme | OpenAI, L.L.C. | ABD | Arama için belge metninin parçaları | YZ modülünü kapatmak (aşağıda) | K4 · envanter §7 |
| **Google ile giriş (OAuth)** | Google LLC | ABD | Ad ve e-posta, giriş sırasında Google'dan alınır | Durmaz: tek giriş yolu budur | K8 · envanter §1 |

Bu üçü dışında Stripe (ödeme) envanterde yurt dışı alıcıdır, ama pilot ücretsizdir ve pilotta ödeme alınmaz. Cloudflare R2'nin bölgesi yukarıdaki tabloda ayrıca yazılıdır.

## YZ'siz çalışma (bugün mümkün)

- YZ kullanan modüller: **M2** (konsept not), **M6** (değerlendirme), **M7**, **M9**, **M10**. Her biri, YZ çağrısından önce modülün açık olup olmadığına bakar. Modül kapalıysa YZ'ye hiçbir metin gitmez. Kaynak: `src/modules/m2/server/actions.ts:65`, `src/modules/m6/server/actions.ts:82`, `src/modules/m7/server/actions.ts:111`, `src/modules/m9/server/actions.ts:38`, `src/modules/m10/server/actions.ts:47`, `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:98`.
- Bu modülleri kapatınca çağrı radarı, karne, M4 (fikir toplama), M5 (iş akışı), M3 (kanıt), M8 (ortak arama) çalışmaya devam eder. Bunlar YZ çağırmaz.
- **Sınır:** Kurumunuzun yöneticisi modülü yeniden açabilir. Bugün "bu kurumda YZ kalıcı olarak kapalı" diye bir kilit yok. **[ürün boşluğu]**
- **Sınır:** YZ kredisini sıfırlamak YZ'yi tam kapatmaz; arama metni yine OpenAI'a gidebilir. Tek güvenilir yol modülü kapatmaktır.

## Taahhüt ETMEDİKLERİMİZ

- "Tüm veri AB'de" — doğru değil; veritabanı Türkiye'de.
- "Tüm veri Türkiye'de kalır" — doğru değil. Veritabanı, uygulama ve e-posta Türkiye'de; YZ, embedding ve Google girişi ABD'ye gider, dosya deposunun bölgesi doğrulanmadı. "Hiçbir veri yurt dışına çıkmaz" şartı çıkarsa bu ürün boşluğu olarak yazılır.
- "YZ verinizle eğitilmez" — sağlayıcı sözleşmesi repoda yok **[DOĞRULANMADI]**.
- ~~Sitenin altbilgisindeki "Frankfurt & Istanbul Data Centers" ifadesi (`src/components/PublicFooter.tsx:149`) doğrulanmadı. Görüşmede bu ifadeye dayanmayın.~~ **Düzeltildi (`9a683b39`, 29.09.2026, TASK-MUN2UXWTAX1AQ):** Frankfurt'ta veri merkezi yok. Altbilgi artık "🇹🇷 Veritabanı Türkiye'de barındırılır" / "Database hosted in Türkiye" diyor; "EU Cloud" rozeti ve açılış sayfasındaki "GDPR & EU Cloud Ready" de kaldırıldı. Altbilgideki "256-bit AES Encryption" ifadesi hâlâ doğrulanmadı; görüşmede ona da dayanmayın.

## Görüşmeden önce kapanması gerekenler [DOĞRULANMADI]

1. ~~Veritabanı ve uygulama sunucusu: hangi firma, hangi bölge (hesap panelinden ekran görüntüsü).~~ Karar verildi (29.09.2026): Vulut, Türkiye. Kalan: Vulut ile yer sağlayıcı / veri işleyen sözleşmesi (DPA) repoda yok; gerekli olup olmadığı hukukçuya soruldu (`docs/legal/HUKUK-SORULARI-2026-09.md` 1.10, §5 madde 3).
2. R2 deposu: hangi bölge; "AB yargı yetkisi" var mı (yoksa AB'de yeni bir depo açılması gerekir; mevcut depo taşınamaz).
3. ~~Resend alan adı: gönderim bölgesi (eu-west-1 mi?).~~ Resend kaldırıldı (29.09.2026, `fe9fd31c`). ~~Yerine: SMTP sağlayıcısı hangi model, hangi firma, hangi ülke.~~ Karar verildi (29.09.2026): kendi SMTP sunucumuz `mail.nexagrant.com`, gönderici `info@nexagrant.com`, canlı uygulama alan adı `nexagrant.com` (patron son kararı 29.09.2026); ayrı bir e-posta firması yok. Ülke madde 1'e bağlıydı: Türkiye (Vulut). **1.3:** sunucu Vulut'un cPanel e-posta hizmetidir (SMTP Seçenek A, patron 29.09.2026); kendi posta sunucusu kurmak (B) seçilmedi. Canlı kurulum henüz yapılmadı.
4. Anthropic çalışma alanı: varsayılan işlem bölgesi "global" mi, "us" mi.
5. ~~Zamanlanmış işler (Inngest Cloud): hangi veri ve hangi bölge.~~ Inngest kaldırıldı (29.09.2026, `5ed2261a`). Zamanlanmış işler artık kendi veritabanımızda çalışan iş kuyruğunda; ayrı bir bağlantı (`JOBS_DATABASE_URL`) verilmezse bu kuyruk madde 1'deki veritabanındadır (`src/lib/env.ts:43-45`). Worker (`fabrika-worker`) ayrı bir süreçtir, uygulamayla aynı barındırmada koşar (madde 1; `Dockerfile:52`, `docker-compose.yml:42`).
