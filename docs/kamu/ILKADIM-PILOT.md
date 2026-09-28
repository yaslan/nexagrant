# İlkadım Belediyesi (Samsun) — 90 günlük pilot planı

> Sürüm 1.0 · 29.09.2026 · Hazırlayan: CS-FB · Kart: TASK-MULR4ATI5T158 (FB-KAMU-1) · Karar dayanağı: `docs/adr/ADR-0004-public-sector-segment-priority.md`
>
> **Durum: TASLAK.** Bu belge patronun görüşmeye götüreceği pakettir. Hiçbir kuruma gönderilmedi. Kurumdaki kişi adları, unvanlar ve birim adları bilerek yazılmadı; görüşme öncesi patron doğrular. Köşeli ayraçlı her alan (`[...]`) bir yer tutucudur.

## 0. Bir bakışta

| Başlık         | Değer                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------- |
| Kurum          | İlkadım Belediyesi (Samsun Büyükşehir Belediyesi sınırları içinde ilçe belediyesi)          |
| Süre           | 90 gün (12 hafta) · başlangıç: `[imza tarihi]`                                              |
| Ücret          | Pilot boyunca ücretsiz — **Ekip planı** yetkileri (bkz. `docs/BUSINESS_MODEL.md` §5.1)      |
| Koltuk         | 6 (Ekip planının koltuk sayısı)                                                             |
| Katılan birim  | Dış İlişkiler / AB birimi, Çevre, Kültür, Strateji Geliştirme (birim adları doğrulanacak)   |
| Ana çıktı      | En az 1 gerçek AB çağrısı için konsept not + başvuru kararı                                 |
| Pilot sonrası  | Yıllık TL paketi, doğrudan temin sınırının altında (§5)                                     |
| Bloke eden dış | e-Fatura/GİB işi (TASK-MTRJSOWFH6B45) açık olduğu için pilot **ücretli başlayamaz** (§6 R4) |

## 1. Pilotun amacı

1. **Ürün için:** Belediye kullanıcısıyla gerçek bir AB başvuru döngüsünü uçtan uca yürütmek. Karne → radar → konsept not zincirinin deneyimsiz bir kamu ekibinde çalışıp çalışmadığını ölçmek.
2. **Satış için:** OKA kanalına (bkz. `OKA-KANAL-ONERISI.md`) götürülecek ilk referans vakayı üretmek.
3. **Belediye için:** Pilotun sonunda elinde en az bir çağrıya hazır konsept not ve bir başvuru kararı olması.

Pilotun amacı özellik göstermek değil. Beta programındaki ilke burada da geçerli (bkz. `docs/BETA_GUIDE.md` §1).

## 2. Kapsam

### 2.1 Koltuk dağılımı (öneri)

| Koltuk | Birim                     | Rol (üründe)      | Neden                                                                |
| ------ | ------------------------- | ----------------- | -------------------------------------------------------------------- |
| 1      | Dış İlişkiler / AB birimi | Kiracı yöneticisi | Pilotun sahibi; davetleri ve modülleri yönetir                       |
| 2      | Dış İlişkiler / AB birimi | Üye               | Konsept notu yazan kişi                                              |
| 3      | Çevre                     | Üye               | Çevre/iklim çağrıları için konu sahibi (LIFE Türkiye'ye kapalı [K8]) |
| 4      | Kültür (ve Sosyal İşler)  | Üye               | Erasmus+ gençlik/yetişkin eğitimi, kültür çağrıları                  |
| 5      | Strateji Geliştirme       | Üye               | Stratejik plan uyumu, bütçe, raporlama                               |
| 6      | `[Belediyenin seçeceği]`  | Üye / gözlemci    | Ör. Başkan Yardımcısı ofisi ya da Mali Hizmetler                     |

### 2.2 Açık modüller

Ekip planıyla gelen modüller açık olur (`docs/BUSINESS_MODEL.md` §5.1): K1–K6, M1, M2, M3, M4, M5, M8. Pilotta yoğun kullanılacaklar: K1 çağrı tarama, M2 konsept not, M4 Focal Point (birimlerden fikir toplama), M5 başvuru iş akışı.

Pilotta kullanılacak iki yeni kamu yüzeyi, aynı sprintte paralel kartlarda geliştiriliyor:

- **Fon Hazırlık Karnesi** — `/fon-hazirlik` (TASK-MULR3TQ24ZZ7N)
- **Belediye çağrı radarı** — `/belediye-cagrilari` (TASK-MULR39X1K5K6C)

Bu iki kart bitmeden pilot başlamaz. Başlangıç tarihi bu iki kartın `done` olmasına bağlıdır.

### 2.3 Kapsam dışı

- Ücretli satın alma, fatura, sözleşme (pilot ücretsizdir; §5 pilot sonrası içindir).
- Belediyenin kendi sistemleriyle entegrasyon (EBYS, muhasebe).
- Başvuru formunun Fabrika tarafından yazılması. Fabrika aracı ve yöntemi sağlar; başvuruyu belediye ekibi yazar ve gönderir.

## 3. Hangi programlar? (önemli düzeltme)

Kart metni hafta 5–8 için "CERV **veya** Erasmus+" diyor. Resmî kaynaklarla kontrol edildi:

- **CERV:** Komisyonun katılımcı ülke listesinde (V10.0, 01.08.2025) Türkiye **yok**. Listede AB dışından yalnız Arnavutluk, Bosna-Hersek, Kosova, Moldova, Karadağ, Kuzey Makedonya, Sırbistan ve Ukrayna var [K3]. Yani İlkadım Belediyesi bugün CERV'e **başvuru sahibi ya da ortak olarak** giremez. Bu nedenle pilotta CERV hedeflenmez. Radar kataloğu (TASK-MULR39X1K5K6C, `src/lib/public-sector/catalog.ts`) da CERV'i Türk başvuru sahiplerine kapalı olarak işaretliyor.
- **Erasmus+:** Türkiye, programa ortak (associated) üçüncü ülkedir [K4]. Küçük ölçekli ortaklıklarda (KA210) yerel yönetimler katılabilir, hibe iki sabit tutardan biridir (30.000 € ya da 60.000 €), en az iki farklı ülkeden iki kurum gerekir, süre 6–24 aydır, başvuru başvuran kurumun ülkesindeki Ulusal Ajansa yapılır (Türkiye için Türkiye Ulusal Ajansı) [K5].

**Karar önerisi:** Hafta 5–8 konsept notu **Erasmus+** (KA210 ya da uygunsa KA220) için yazılır. İkinci aday çağrı radarın "Türkiye'ye açık" filtresinden seçilir (ör. Cities Mission, Interreg/IPA, OKA programları; radar kataloğu `src/lib/public-sector/catalog.ts`). **LIFE da seçilmez:** katılımcı ülke listesinde (V10.0, 01.03.2026) Türkiye yok [K8]. Bu belgede yalnız CERV, LIFE ve Erasmus+ doğrulandı; diğer programların uygunluğunu radar kataloğu kaynağıyla gösterir. Doğrulanmayan program pilotta önerilmez.

## 4. Haftalık akış

| Hafta | Aşama                    | Belediyenin yapacağı                                               | Fabrika'nın yapacağı                                           | Hafta sonu kanıtı                             |
| ----- | ------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------- |
| 1     | Karne + onboarding       | 4 birim karneyi doldurur; 6 kullanıcı hesabını açar                | 60 dk onboarding oturumu; kiracıyı ve davetleri hazırlar       | 4 karne sonucu; 6 aktif hesap                 |
| 2     | Radar taraması           | AB birimi radarı birimlerle birlikte tarar; ilgi listesi çıkarır   | Karne eksiklerine göre radarda filtre önerir                   | Kayıtlı arama ve 5–10 çağrılık ilgi listesi   |
| 3     | Aday çağrı seçimi        | Birimler çağrıları stratejik planla karşılaştırır; 2 aday seçer    | Her aday için uygunluk notu (ülke, kurum türü, tarih)          | 2 çağrı G0 aşamasına alınmış                  |
| 4     | Fikir toplama            | M4 Focal Point ile birimlerden proje fikri toplar                  | Fikirleri seçilen çağrılarla eşleştirmeye yardım eder          | Her aday çağrı için en az 1 fikir kartı       |
| 5–6   | Konsept not (M2) taslağı | AB birimi M2 ile taslak üretir; konu birimi içerik ekler           | Haftalık 30 dk inceleme; eksik kanıt listesi (M3)              | Konsept not taslağı v1                        |
| 7–8   | Ortak arama + revizyon   | M8 ile yabancı ortak adaylarını listeler; taslağı günceller        | Ortak adaylarını yorumlar; not v2'yi değerlendirir             | Konsept not v2 + en az 2 ortak adayı          |
| 9–10  | Başvuruya geçiş kararı   | Başkanlık / Strateji ile "başvuralım mı?" kararı                   | Karar notu şablonu (maliyet, iş yükü, takvim)                  | Yazılı karar (evet / hayır / sonraki dönem)   |
| 11–12 | Başvuru / kapanış        | Evet ise başvuru formuna geçer; son tarih pilot içindeyse gönderir | Kapanış raporu, başarı ölçütleri tablosu, pilot sonrası teklif | Kapanış raporu; varsa başvuru gönderim kanıtı |

**Takvim notu:** KA210 için rehberde yazan son tarih 5 Mart 12:00 (Brüksel saati) [K5]. Pilot Ekim–Kasım 2026'da başlarsa 12. hafta bu tarihten önce biter. Bu durumda "başvuru gönderildi" yerine "başvuru formu hazır" ölçülür (§5, Ö5). Gerçek son tarih, başvuru yılının rehberinden ve Türkiye Ulusal Ajansı duyurusundan yeniden doğrulanır.

**Haftalık ritim:** Her hafta 30 dakikalık bir görüşme. Beta programındaki şablon kullanılır (`docs/beta/weekly-sync-template.md`).

## 5. Başarı ölçütleri

Her ölçütün bir hedefi, bir ölçüm kaynağı ve bir eşiği var. "Ölçüm kaynağı" sütununda **ürün boşluğu** yazan satırlar bugün üründen otomatik okunamıyor. Bunlar `OKA-KANAL-ONERISI.md` §6 listesindedir ve o kartlar bitene kadar elle sayılır.

| No  | Ölçüt                | Tanım                                                                                | Hedef (12. hafta)                                               | Ölçüm kaynağı                                               |
| --- | -------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------- |
| Ö1  | Aktif kullanıcı      | Haftada en az 1 kez oturum açıp bir kayıt oluşturan/değiştiren kullanıcı             | 6 koltuğun en az 4'ü, 12 haftanın en az 8'inde                  | Ürün boşluğu: kiracı bazlı haftalık aktif kullanıcı sayacı  |
| Ö2  | Tamamlanan karne     | Sonuna kadar doldurulmuş Fon Hazırlık Karnesi                                        | En az 4 (her birimden 1)                                        | Ürün boşluğu: karnenin kiracıya bağlanması (karne kayıtsız) |
| Ö3  | Seçilen çağrı        | G0 aşamasına alınan çağrı                                                            | En az 2                                                         | M5 pipeline kaydı                                           |
| Ö4  | Üretilen konsept not | M2 ile üretilmiş ve en az bir kez insan tarafından düzenlenmiş konsept not           | En az 1 (v2'ye ulaşmış)                                         | M2 kayıtları + sürüm geçmişi                                |
| Ö5  | Gönderilen başvuru   | Ulusal Ajansa / portala gönderilmiş başvuru; son tarih pilot dışındaysa "form hazır" | En az 1 gönderim **ya da** 1 hazır form + yazılı başvuru kararı | Belediyenin gönderim kanıtı (ekran görüntüsü / başvuru no)  |
| Ö6  | Memnuniyet           | Kapanışta 0–10 tavsiye puanı (NPS sorusu)                                            | En az 3 kullanıcıdan ortalama ≥ 7                               | Kapanış anketi                                              |
| Ö7  | Referans izni        | Belediyenin adının OKA sunumunda referans olarak kullanılmasına yazılı izin          | Evet                                                            | Yazılı izin                                                 |

**Pilot başarılı sayılır:** Ö3, Ö4 ve Ö5 tuttuysa ve Ö1 ya da Ö2'den biri tuttuysa. Ö7 OKA görüşmesi için ayrıca gereklidir.

**Pilot başarısız sayılır ve ders çıkarılır:** 6. haftada Ö3 sıfırsa. Bu durumda patron ile birlikte 7. haftada devam/durdur kararı verilir.

## 6. Pilot sonrası fiyat önerisi

### 6.1 Yasal çerçeve — doğrudan temin sınırı

Belediyenin bizi ihalesiz alabilmesi için tutarın 4734 sayılı Kanun md. 22/d doğrudan temin sınırının altında kalması gerekir. 01.02.2026–31.01.2027 döneminde geçerli sınırlar (Kamu İhale Tebliği 2026/1, Resmî Gazete 22.01.2026, sayı 33145) [K1][K2]:

| İdare                                             | 22/d sınırı (2026) |
| ------------------------------------------------- | ------------------ |
| Büyükşehir belediyesi sınırları içindeki idareler | 1.021.827 TL       |
| Diğer idareler                                    | 340.391 TL         |

Güncelleme oranı 2025 Aralık Yİ-ÜFE yıllık değişimi olan %27,67'dir [K2]. İlkadım, Samsun Büyükşehir sınırları içindedir; üst satır geçerlidir. **Dikkat:** OKA bölgesinde Tokat, Çorum ve Amasya belediyeleri için hangi satırın geçerli olduğu her kurum için ayrıca kontrol edilir (büyükşehir statüsü olmayan illerde alt satır geçerlidir). Sınırlar her yıl 1 Şubat'ta güncellenir; teklif tarihi 31.01.2027'den sonraysa yeni tebliğ okunur.

### 6.2 Önerilen paketler (patron kararı bekler)

Aşağıdaki TL tutarları bir **öneridir**, olgu değildir. Amaç: KDV dahil tutar bile en düşük sınırın altında kalsın. Böylece "sınır KDV hariç mi dahil mi" sorusu (açık soru S1) sonucu değiştirmez.

| Paket              | İçerik                                                             | Yıllık (KDV hariç) | KDV dahil (%20)\* | 340.391 TL sınırı | 1.021.827 TL sınırı |
| ------------------ | ------------------------------------------------------------------ | ------------------ | ----------------- | ----------------- | ------------------- |
| Belediye Başlangıç | Başlangıç planı yetkileri, 2 koltuk, 1 onboarding günü             | 90.000 TL          | 108.000 TL        | Altında           | Altında             |
| Belediye Ekip      | Ekip planı yetkileri, 6 koltuk, 2 onboarding günü, çeyreklik rapor | 240.000 TL         | 288.000 TL        | Altında           | Altında             |
| Belediye Kurum     | İşletme planı yetkileri, 15 koltuk, 4 eğitim günü, aylık rapor     | 480.000 TL         | 576.000 TL        | **Üstünde**       | Altında             |

\* KDV oranı açık soru S2'de mali müşavire sorulur; tablo %20 varsayımıyla hesaplandı.

- İlkadım için önerilen paket: **Belediye Ekip** (pilotta kullanılan yapı ile aynı).
- **Belediye Kurum** yalnız büyükşehir sınırındaki idarelere önerilir.
- TL tutarları EUR liste fiyatlarından (`docs/BUSINESS_MODEL.md` §5.1) kurla türetilmedi. Kamu paketi ayrı bir TL fiyat listesidir; hangi kurla karşılaştırılacağı patron kararıdır.
- Fiyat, radar ve karne kartları bittikten ve e-Fatura açıldıktan sonra kesinleşir.

## 7. Riskler

| No  | Risk                               | Etkisi                                                                                                                                                                                                                 | Önlem                                                                                                                                                                                         |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Kamuda satın alma süresi           | Pilot bitince ücretli geçiş aylarca gecikebilir; bütçe yılı ve ödenek kalemi gerekir                                                                                                                                   | Pilotun 9. haftasında Strateji ve Mali Hizmetler ile bütçe kalemi konuşulur; teklif 10. haftada verilir                                                                                       |
| R2  | KVKK                               | Belediye personelinin adı, e-postası ve yazdığı içerik kişisel veri. Aydınlatma metninde eksikler var (`docs/legal/privacy-notice-gap-analysis.md`)                                                                    | Pilot öncesi `docs/legal/dpa-tr.md` imzalanır; aydınlatma metnindeki boşlukları hukuk ekibi kapatır; pilotta vatandaş verisi **yüklenmez** (kurala yazılır)                                   |
| R3  | Veri yerleşimi / yurt dışı aktarım | İşleme envanterine göre YZ tamamlama (Anthropic, ABD), embedding (OpenAI, ABD) ve e-posta (Resend, ABD) yurt dışına veri aktarıyor; nesne deposunda AB bölgesi kodla zorlanmıyor (`docs/legal/processing-register.md`) | Görüşmede açıkça söylenir, gizlenmez. Belediyeye hangi verinin nereye gittiği tek sayfada verilir. Kamunun "veri Türkiye'de kalsın" şartı çıkarsa bu ürün boşluğu olarak yazılır (OKA §6, B9) |
| R4  | e-Fatura bağımlılığı               | e-Fatura/GİB entegrasyonu canlı değil; alıcı kimliği ekranı yok (`docs/EFATURA_SETUP.md`). TASK-MTRJSOWFH6B45 insan aksiyonu bekliyor                                                                                  | Pilot ücretsiz yürür (ADR-0004). Ücretli geçiş tarihi e-Fatura açılmadan verilmez                                                                                                             |
| R5  | Radar/karne gecikmesi              | İki kart bitmezse hafta 1–2 yapılamaz                                                                                                                                                                                  | Başlangıç tarihi iki kartın `done` olmasına bağlı                                                                                                                                             |
| R6  | Program uygunluğu hatası           | Türkiye'nin katılmadığı bir programa (ör. CERV) emek harcanır                                                                                                                                                          | Her aday çağrıda ülke uygunluğu resmî listeden doğrulanır (§3)                                                                                                                                |
| R7  | Tek kişiye bağımlılık              | AB biriminde tek kişi ayrılırsa pilot durur                                                                                                                                                                            | En az 2 koltuk AB biriminde; kiracı yöneticisi yetkisi 2 kişide                                                                                                                               |

## 8. Açık sorular

| No  | Soru                                                                                                               | Kime                 |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------- |
| S1  | 22/d sınırı KDV hariç mi uygulanır? Aynı yıl içindeki 22/d alımlarının toplamı için idareye özgü bir tavan var mı? | Mali müşavir / hukuk |
| S2  | Yazılım aboneliği hizmetinde uygulanacak KDV oranı                                                                 | Mali müşavir         |
| S3  | İlkadım'ın AB işlerini yürüten birimin resmî adı ve yetkilisi                                                      | Patron (görüşmede)   |
| S4  | Belediye pilot için protokol mü ister, yazışma yeterli mi?                                                         | Patron (görüşmede)   |
| S5  | Pilotta kullanılacak kullanıcı hesapları kurum e-postasıyla mı açılacak?                                           | Belediye AB birimi   |

## Kaynaklar

Erişim tarihi: 29.09.2026 (tümü).

- **[K1]** Resmî Gazete, 22.01.2026, sayı 33145 — Kamu İhale Tebliği (No: 2026/1): <https://www.resmigazete.gov.tr/eskiler/2026/01/20260122-3.htm> · Not: Bu adrese araçtan erişimde TLS sertifika hatası alındı; tutarlar K2'deki tam metin aktarımından okundu. Görüşme öncesi patron K1'den teyit eder.
- **[K2]** Hukuki Haber, "Kamu İhale Tebliği (No: 2026/1)" tam metin aktarımı (22/d tutarları 800.366→1.021.827 TL ve 266.618→340.391 TL; Yİ-ÜFE %27,67; yürürlük 01.02.2026): <https://www.hukukihaber.net/kamu-ihale-tebligi-no-20261>
- **[K3]** European Commission, "EU Grants: List of participating countries (CERV)", V10.0 – 01.08.2025: <https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/cerv/guidance/list-3rd-country-participation_cerv_en.pdf>
- **[K8]** European Commission, "EU Grants: List of participating countries (LIFE)", V10.0 – 01.03.2026 (Türkiye listede yok): <https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/life/guidance/list-3rd-country-participation_life_en.pdf>
- **[K4]** Erasmus+ Programme Guide, Part A — Eligible countries (Türkiye, programa ortak üçüncü ülkeler arasında): <https://erasmus-plus.ec.europa.eu/programme-guide/part-a/eligible-countries>
- **[K5]** Erasmus+ Programme Guide, Part B — Small-scale partnerships (30.000 € / 60.000 € sabit tutar; en az 2 kurum, 2 ülke; 6–24 ay; Ulusal Ajansa başvuru; 5 Mart 12:00): <https://erasmus-plus.ec.europa.eu/programme-guide/part-b/key-action-2/small-scale-partnerships>
- İç kaynaklar: `docs/BUSINESS_MODEL.md` §5.1 (plan içerikleri, koltuk sayıları), `docs/adr/ADR-0004-public-sector-segment-priority.md`, `docs/EFATURA_SETUP.md`, `docs/legal/processing-register.md`, `docs/legal/privacy-notice-gap-analysis.md`, `docs/BETA_GUIDE.md`.
