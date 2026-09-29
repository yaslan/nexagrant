# FonBridge — Veriniz nerede? (kamu kurumları için tek sayfa)

> Sürüm 1.0 · 29.09.2026 · Hazırlayan: CS-FB · Kart: TASK-MULRS7WKYEFOP (FB-KAMU-2, B9)
>
> **Durum: TASLAK.** Pilot görüşmesinden önce patron okur. Her satırın kaynağı sağ sütundadır; "K" kodları sonuç raporundaki (`docs/agent-results/TASK-MULRS7WKYEFOP-cs-fb.md`) envanter satırlarıdır. Koddan ya da sağlayıcının resmî belgesinden doğrulayamadığımız her şey **[DOĞRULANMADI]** diye işaretlidir. Bu belgede "tüm veri AB'de" ya da "veri Türkiye'de" demiyoruz, çünkü bugün ikisi de doğru değil.

## Kısa cevap

1. **Evet, bazı veriler yurt dışına gidiyor.** Bugün hiçbir veri için "Türkiye'de kalır" diyemiyoruz.
2. **En büyük akış yapay zekâdır (YZ).** Konsept not yazdırdığınızda metin ABD merkezli sağlayıcılara gider. YZ modüllerini kapatırsanız bu akış durur (aşağıda "YZ'siz çalışma").
3. **Veritabanının ve dosyaların hangi ülkede durduğu kodda sabit değil**, hesap ayarına bağlı. Bunu görüşmeden önce doğrulayıp yazılı vereceğiz.

## Hangi veri nereye gidiyor?

| Veri                                                          | Nereye gidiyor                                                                | Hangi ülke / bölge                                                                                                       | Kaynak                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Hesaplar, ekip, çağrı listesi, konsept not metinleri, karne   | Postgres veritabanı                                                           | **[DOĞRULANMADI]** Barındırma firması ve bölgesi repoda yazılı değil (planda Neon/Vercel geçiyor, bölge yok)             | K1                                                                     |
| Yüklediğiniz dosyalar (kanıt belgeleri, ekran görüntüleri)    | Cloudflare R2 dosya deposu                                                    | **[DOĞRULANMADI]** Kod, "AB yargı yetkisi" olan bir depo kullanmıyor; depo AB'de olsa bile bu bir tercih (garanti değil) | K2 · `src/lib/storage.ts:14-15` · Cloudflare R2 belgesi                |
| Konsept not / değerlendirme için yazdığınız metin (YZ açıksa) | Anthropic (Claude)                                                            | Saklama **ABD**. İşlem varsayılan ayarda **herhangi bir ülkede** olabilir; AB seçeneği yok                               | K3 · `src/lib/llm.ts:30,181` · Anthropic veri yerleşimi belgesi        |
| Arama için metin parçaları (YZ açıksa)                        | OpenAI (embedding)                                                            | **ABD**                                                                                                                  | K4 · `src/lib/llm.ts:545`                                              |
| E-posta adresi, bildirim e-postası içeriği                    | Resend (e-posta)                                                              | Gönderim bölgesi alan adına göre seçilir; **hesap verisi ve kayıtlar her durumda ABD'de**                                | K5 · `src/lib/inngest/jobs/alerts-daily.ts:206` · Resend bölge belgesi |
| Google / Microsoft ile giriş (yalnız bu yolu seçerseniz)      | Google, Microsoft                                                             | ABD merkezli şirketler                                                                                                   | K8 · `src/lib/auth.ts:2-3`                                             |
| Ürün analitiği                                                | **Hiçbir yere** (anahtar yok). Anahtar girilirse yalnız çerez onayıyla, anonim olarak PostHog AB'ye gider (§19a)               | —                                                                                                                        | K6 · `src/lib/analytics.ts:5,11`                                       |
| Hata kayıtları                                                | **Hiçbir yere.** `SENTRY_DSN` boş; hatalar iç sistemde kalır. DSN patron onayıyla girilirse yalnız error uyarısı gider (§19a) | —                                                                                                                        | K7 · `docs/legal/processing-register.md` §19                           |

## YZ'siz çalışma (bugün mümkün)

- YZ kullanan modüller: **M2** (konsept not), **M6** (değerlendirme), **M7**, **M9**, **M10**. Her biri, YZ çağrısından önce modülün açık olup olmadığına bakar. Modül kapalıysa YZ'ye hiçbir metin gitmez. Kaynak: `src/modules/m2/server/actions.ts:65`, `src/modules/m6/server/actions.ts:82`, `src/modules/m7/server/actions.ts:111`, `src/modules/m9/server/actions.ts:38`, `src/modules/m10/server/actions.ts:47`, `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:98`.
- Bu modülleri kapatınca çağrı radarı, karne, M4 (fikir toplama), M5 (iş akışı), M3 (kanıt), M8 (ortak arama) çalışmaya devam eder. Bunlar YZ çağırmaz.
- **Sınır:** Kurumunuzun yöneticisi modülü yeniden açabilir. Bugün "bu kurumda YZ kalıcı olarak kapalı" diye bir kilit yok. **[ürün boşluğu]**
- **Sınır:** YZ kredisini sıfırlamak YZ'yi tam kapatmaz; arama metni yine OpenAI'a gidebilir. Tek güvenilir yol modülü kapatmaktır.

## Taahhüt ETMEDİKLERİMİZ

- "Tüm veri AB'de" — doğrulanmadı.
- "Veri Türkiye'de kalır" — hiçbir akış için doğru değil. Bu şart çıkarsa ürün boşluğu olarak yazılır.
- "YZ verinizle eğitilmez" — sağlayıcı sözleşmesi repoda yok **[DOĞRULANMADI]**.
- Sitenin altbilgisindeki "Frankfurt & Istanbul Data Centers" ifadesi (`src/components/PublicFooter.tsx:149`) doğrulanmadı. Görüşmede bu ifadeye dayanmayın.

## Görüşmeden önce kapanması gerekenler [DOĞRULANMADI]

1. Veritabanı ve uygulama sunucusu: hangi firma, hangi bölge (hesap panelinden ekran görüntüsü).
2. R2 deposu: hangi bölge; "AB yargı yetkisi" var mı (yoksa AB'de yeni bir depo açılması gerekir; mevcut depo taşınamaz).
3. Resend alan adı: gönderim bölgesi (eu-west-1 mi?).
4. Anthropic çalışma alanı: varsayılan işlem bölgesi "global" mi, "us" mi.
5. Zamanlanmış işler (Inngest Cloud): hangi veri ve hangi bölge.
