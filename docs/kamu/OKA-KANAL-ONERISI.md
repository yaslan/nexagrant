# Orta Karadeniz Kalkınma Ajansı (OKA) — kanal ortaklığı önerisi

> Sürüm 1.0 · 29.09.2026 · Hazırlayan: CS-FB · Kart: TASK-MULR4ATI5T158 (FB-KAMU-1) · Karar dayanağı: `docs/adr/ADR-0004-public-sector-segment-priority.md`
>
> **Durum: TASLAK.** OKA'ya gönderilmedi. Kişi adı ve unvan yok; görüşme öncesi patron doğrular. §6 "ürün boşlukları" listesi LEED-FB'nin kart açması içindir; bu belgede kod yazılmadı.

## 1. Neden OKA?

- OKA, TR83 bölgesinin kalkınma ajansıdır: **Samsun, Tokat, Çorum, Amasya** [K6].
- OKA'nın AB kaynaklı iş deneyimi var: 2009'dan bu yana **15 proje** yürüterek bölgeye **57 milyon €'nun üzerinde** AB kaynağı getirdiğini açıklıyor [K6].
- Pilot belediye İlkadım (Samsun) OKA bölgesinde. Pilotun sonucu OKA'ya yerel bir referans olur.
- ADR-0004 kararı: büyüme kanalı kalkınma ajanslarıdır. Tek tek belediye satmak yavaştır; ajans, bölgesindeki kurumlara toplu ulaşır.

## 2. Model — ajans dağıtır, kurum kullanır

```
OKA (ajans panosu, bölge raporu)
 ├── Belediye A  ── ücretsiz Keşif hesabı  ──►  (isterse) Belediye paketi
 ├── Belediye B  ── ücretsiz Keşif hesabı
 ├── KOBİ C      ── ücretsiz Keşif hesabı  ──►  (isterse) Başlangıç / Ekip
 └── ...
```

1. OKA, bölgesindeki belediyelere ve KOBİ'lere **ücretsiz Keşif hesabı** dağıtır (Keşif planı: 1 koltuk, K1 çağrı tarama, 3 kayıtlı arama, K3 taban oranlar, M3 lite; `docs/BUSINESS_MODEL.md` §5.1).
2. Dağıtım, OKA'nın kendi etkinliklerinde ve duyurularında verilen **toplu davet kodu** ile yapılır (ürün boşluğu B1).
3. Her yeni kurum önce **Fon Hazırlık Karnesi**ni doldurur (`/fon-hazirlik`), sonra **belediye çağrı radarı**nı kullanır (`/belediye-cagrilari`).
4. OKA, **ajans panosu**nda bölgedeki kurumların hunisini görür: kaç kurum kayıt oldu, kaç karne tamamlandı, kaç çağrı seçildi, kaç başvuru yapıldı (B2, B3).
5. Daha fazla kapasite isteyen kurum ücretli pakete geçer (belediye paketleri: `ILKADIM-PILOT.md` §6.2).

## 3. Beyaz etiket seçeneği

`docs/BUSINESS_MODEL.md` §5.1'de beyaz etiket **Kurumsal** planda yer alıyor. OKA için iki seçenek:

| Seçenek             | Kurumun gördüğü                                    | Artı                                            | Eksi                                                                      |
| ------------------- | -------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| A. Ortak marka      | "OKA iş birliğiyle Fabrika" — logo iki kurumlu     | Ürün değişikliği az (B4 küçük)                  | Ajansın "kendi hizmeti" algısı zayıf                                      |
| B. Tam beyaz etiket | OKA adı, logosu, alan adı; Fabrika adı arka planda | Ajans kendi hizmeti gibi sunar; bağlılık yüksek | Alan adı, tema, e-posta gönderici adı gerekir (B4, B5); destek yükü artar |

**Öneri:** İlk yıl **A (ortak marka)**. B, ilk yılın bölge raporu olumluysa ikinci yılda konuşulur. Bugün kodda beyaz etikete özgü bir yapı bulunmadı (`src/` ve `prisma/schema.prisma` içinde "white label" araması boş döndü); B seçeneği sıfırdan iştir.

## 4. OKA'ya sağlanacak rapor — bölge başvuru hunisi

Aylık, PDF ve CSV olarak. Kişisel veri içermez; kurum düzeyinde toplulaştırılmış sayılar içerir.

| Huni adımı                | Tanım                                                                  | Kaynak (üründe)                         |
| ------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| 1. Davet kodu kullanıldı  | Kodla açılan hesap sayısı (kurum türü ve ile göre)                     | B1 (yok)                                |
| 2. Karne tamamlandı       | Tamamlanan karne sayısı; ortalama puan                                 | Karne kartı + B6 (karne–hesap bağı yok) |
| 3. Radar'da kayıtlı arama | En az 1 kayıtlı araması olan kurum                                     | K1                                      |
| 4. Çağrı G0'a alındı      | En az 1 çağrıyı pipeline'a alan kurum                                  | M5                                      |
| 5. Konsept not üretildi   | En az 1 M2 çıktısı olan kurum (Keşif'te M2 yok; ücretli geçiş sinyali) | M2                                      |
| 6. Başvuru gönderildi     | Kurumun kendi beyanı                                                   | B7 (beyan alanı yok)                    |
| 7. Sonuç                  | Kabul / red (kurumun beyanı)                                           | B7                                      |

**Program kırılımı:** Her adım program bazında da verilir (Erasmus+, Cities Mission, Interreg/IPA, OKA programları). CERV ve LIFE bu listede yer almaz: Türkiye iki programın katılımcı ülke listesinde de yoktur [K3][K8].

## 5. Ajansın kazancı ve ticari seçenekler

### 5.1 Ajansın kazancı

- **AB başvuru sayısı hedefi:** Bölgesinden AB programlarına yapılan başvuru sayısını artırmak ajansın doğal hedeflerinden biri. Bölge raporu (§4) bu hedefi sayıyla izler. OKA'nın resmî performans göstergelerinde bu hedefin nasıl yazıldığı doğrulanmadı; görüşmede sorulur (açık soru S3).
- **İş yükü:** Ajans uzmanının "hangi çağrı bana uygun?" sorularını karne ve radar ilk seviyede karşılar.
- **Görünürlük:** Ortak marka ile ajansın adı her kurum ekranında görünür.

### 5.2 Ticari seçenekler

| Seçenek            | Nasıl işler                                                                            | Artı                                | Eksi / risk                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1. Yıllık lisans   | OKA yıllık sabit bedel öder; bölgede N adet Keşif+ hesabı, ajans panosu ve aylık rapor | Basit, öngörülebilir; tek sözleşme  | Ajansın satın alma kuralları ve bütçesi gerekir; e-Fatura açık olmadan faturalanamaz (TASK-MTRJSOWFH6B45)               |
| 2. Gelir paylaşımı | OKA ücretsiz dağıtır; kanaldan gelen ücretli geçişlerden ajansa pay                    | Ajansa bütçe yükü yok               | Bir kamu kurumunun özel şirketten gelir payı alması hukuken uygun olmayabilir — **hukuk görüşü olmadan önerilmez** (S1) |
| 3. Ücretsiz kanal  | OKA ücretsiz dağıtır, para ödemez, pay almaz; biz yalnız ücretli geçişten kazanırız    | En hızlı başlangıç; imza yükü en az | Gelir yalnız dönüşüme bağlı; ajans panosu ve rapor maliyeti bizde kalır                                                 |

**Öneri:** Birinci yıl **Seçenek 3** ile başlanır: hız ve düşük sürtünme. Aynı anda Seçenek 1 için hukuk ve satın alma sorusu sorulur. Seçenek 2 hukuk görüşü gelene kadar masaya konmaz.

Yıllık lisans (Seçenek 1) için tutar önerilmedi. Ajansın hangi satın alma usulüne tabi olduğu doğrulanmadı (S2); tutar bu cevaba göre belirlenir. 4734 s. 22/d sınırları için bkz. `ILKADIM-PILOT.md` §6.1.

## 6. Ürün boşlukları (LEED-FB kart açacak)

Bu model bugünkü ürünle çalışmaz. Aşağıdaki liste, modelin ürün tarafında gerektirdiği işlerdir. Öncelik sırası: kanal pilotu için **zorunlu (Z)**, pilotu kolaylaştıran **önemli (Ö)**, ikinci yıl **sonra (S)**.

| No  | Boşluk                                               | Bugünkü durum (koddan)                                                                                                            | Beklenen davranış (kabul ölçütü taslağı)                                                                                                               | Öncelik                |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| B1  | **Toplu davet kodu**                                 | `Invitation` modeli tek e-posta + tek kiracı için (`prisma/schema.prisma`, `@@unique([email, tenantId])`); çok kullanımlı kod yok | Ajans, kullanım sayısı ve son tarihi olan bir kod üretir. Kodla kayıt olan kurum yeni bir Keşif kiracısı açar ve ajansa bağlanır. Kod iptal edilebilir | Z                      |
| B2  | **Ajans panosu**                                     | Kiracılar arası üst kurum (ajans → kurumlar) ilişkisi yok; `Tenant` modelinde üst kiracı alanı yok                                | Ajans kullanıcısı yalnız kendisine bağlı kurumların **toplulaştırılmış** sayılarını görür; kurumların içeriğini (konsept not, kanıt) göremez           | Z                      |
| B3  | **Bölge raporu**                                     | Yok                                                                                                                               | §4'teki huni aylık PDF + CSV olarak indirilir; il ve kurum türü kırılımı; kişisel veri içermez                                                         | Z                      |
| B4  | Ortak marka (logo + metin)                           | Beyaz etiket yapısı bulunamadı                                                                                                    | Ajansa bağlı kurumların ekranında ajans logosu ve "iş birliğiyle" metni; ajans panosundan yönetilir                                                    | Ö                      |
| B5  | Tam beyaz etiket (alan adı, tema, e-posta gönderici) | Yok                                                                                                                               | Ajansın alan adında çalışır; e-postalar ajans adıyla gider                                                                                             | S                      |
| B6  | Karnenin hesaba bağlanması                           | Karne kayıtsız çalışacak (TASK-MULR3TQ24ZZ7N); sonuç kiracıya bağlanmıyor                                                         | Karneyi dolduran kişi kayıt olursa sonuç kiracıya taşınır; ajans hunisinde sayılır                                                                     | Z                      |
| B7  | Başvuru ve sonuç beyanı                              | Pipeline'da "gönderildi / kabul / red" için kurumun beyan alanı doğrulanmadı                                                      | Kurum başvurusunu ve sonucu işaretler; rapora bu beyan girer                                                                                           | Ö                      |
| B8  | Kiracı bazlı haftalık aktif kullanıcı sayacı         | Doğrulanmadı                                                                                                                      | Pilot ölçütü Ö1 (`ILKADIM-PILOT.md` §5) üründen okunur                                                                                                 | Ö                      |
| B9  | Kamu için veri yerleşimi beyanı                      | Yurt dışı aktarımlar işleme envanterinde var; AB bölgesi kodla zorlanmıyor (`docs/legal/processing-register.md`)                  | Kamu kurumuna tek sayfalık "veriniz nerede" beyanı; gerekirse YZ'siz ya da bölge sınırlı çalışma seçeneği için ayrı spike                              | Ö                      |
| B10 | TL fatura ve alıcı kimliği ekranı                    | e-Fatura canlı değil; alıcı kimliği ekranı yok (`docs/EFATURA_SETUP.md`)                                                          | TASK-MTRJSOWFH6B45 ve alıcı kimliği kartı kapanır; kamu paketleri faturalanabilir                                                                      | Z (ücretli geçiş için) |
| B11 | Kamu paketleri plan tanımı                           | Planlar EUR (§5.1); TL kamu paketleri yok                                                                                         | `ILKADIM-PILOT.md` §6.2 paketleri, patron onayından sonra plan olarak tanımlanır                                                                       | S                      |
| B12 | KVKK: toplu davette aydınlatma                       | Aydınlatma metninde eksikler var (`docs/legal/privacy-notice-gap-analysis.md`)                                                    | Kodla kayıt ekranında aydınlatma bağlantısı ve ajansa hangi toplu verinin gittiğinin açık beyanı                                                       | Z                      |

## 7. Kanal pilotu — ölçütler

OKA ile 6 aylık bir kanal pilotu önerilir. Başlangıç şartı: B1, B2, B3, B6, B12 bitmiş olmalı.

| Ölçüt                              | 6. ay hedefi (öneri)           |
| ---------------------------------- | ------------------------------ |
| Davet koduyla açılan kurum         | En az 20                       |
| Bunlardan belediye                 | En az 5                        |
| Tamamlanan karne                   | Açılan kurumların en az %50'si |
| Pipeline'a çağrı alan kurum        | En az 8                        |
| Ücretli pakete geçen kurum         | En az 2                        |
| Aylık rapor OKA'ya zamanında gitti | 6/6                            |

Bu hedefler bizim önerimizdir, dış kaynaktan gelen bir oran değildir. İlk 2 ayın verisine göre patron ile güncellenir.

## 8. Açık sorular

| No  | Soru                                                                                                      | Kime                    |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------- |
| S1  | Kalkınma ajansının özel bir şirketten gelir payı alması hukuken mümkün mü?                                | Hukuk                   |
| S2  | OKA hangi satın alma usulüne tabi? Yıllık lisans nasıl alınır?                                            | OKA (görüşmede) / hukuk |
| S3  | OKA'nın performans göstergelerinde AB başvuru sayısı bir hedef olarak yer alıyor mu?                      | OKA (görüşmede)         |
| S4  | OKA kurumlara dağıtılan hesapların kişisel verisine erişmek istiyor mu? (Öneri: hayır, yalnız toplu sayı) | OKA (görüşmede)         |
| S5  | Bölgedeki belediye birliği ile ortak dağıtım mümkün mü?                                                   | OKA (görüşmede)         |

## Kaynaklar

Erişim tarihi: 29.09.2026 (tümü).

- **[K3]** European Commission, "EU Grants: List of participating countries (CERV)", V10.0 – 01.08.2025 (Türkiye listede yok): <https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/cerv/guidance/list-3rd-country-participation_cerv_en.pdf>
- **[K8]** European Commission, "EU Grants: List of participating countries (LIFE)", V10.0 – 01.03.2026 (Türkiye listede yok): <https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/life/guidance/list-3rd-country-participation_life_en.pdf>
- **[K6]** T.C. Sanayi ve Teknoloji Bakanlığı Kalkınma Ajansları portalı — "Orta Karadeniz Kalkınma Ajansı — Uluslararası İşbirlikleri" (iller: Samsun, Amasya, Çorum, Tokat; 2009'dan bu yana 15 proje, 57 milyon €'nun üzerinde AB kaynağı): <https://ka.gov.tr/en/pages/orta-karadeniz-kalkinma-ajansi-uluslararasi-isbirlikleri--8-737>
- **[K7]** OKA resmî sitesi: <https://oka.gov.tr/>
- 4734 s. 22/d sınırları için kaynaklar: `ILKADIM-PILOT.md` [K1][K2].
- İç kaynaklar: `docs/BUSINESS_MODEL.md` §5.1, `docs/adr/ADR-0004-public-sector-segment-priority.md`, `prisma/schema.prisma` (`Invitation`, `Tenant`), `docs/EFATURA_SETUP.md`, `docs/legal/processing-register.md`, `docs/legal/privacy-notice-gap-analysis.md`.
