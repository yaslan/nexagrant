# Fabrika — İş Modeli ve Gelir Modeli

> Sürüm 1.0 · 2 Eylül 2026 · Para birimi EUR (TL gösterimi isteğe bağlı)
> Ürün kod adı **Fabrika** (çalışma adı; marka kararı ayrıca verilecek). Türkçe ve İngilizce arayüz.

## 1. Tek cümlelik konum

Fabrika, KOBİ'lerin, üniversite proje ofislerinin ve danışmanlık firmalarının Avrupa fonlarına (Ufuk Avrupa, Eurostars, CETP/DUT, Erasmus+, Digital Europe, EIT) **sürekli** başvurmasını sağlayan; çağrı tarama, ortak istihbaratı, konsorsiyum eşleştirme, teklif üretimi ve sahte değerlendirmeyi tek bir modüler platformda birleştiren, kanıta dayalı bir "proje fabrikası" SaaS'ıdır.

## 2. Neden şimdi (pazar tezi)

- Ufuk Avrupa başarı oranı %16 (2023) → ~%12 (2025); rekabet arttıkça sistematik çalışan kazanıyor.
- 2021–24'te 88.803 teklif; katılımcıların %51'i yeni gelen; Türkiye'de bu oran %55,7 — yani müşteri tabanının yarısı ilk kez başvuruyor ve rehberliğe muhtaç.
- Türkiye tek başına Ufuk Avrupa'dan €362 M aldı; TÜBİTAK 2025 itibarıyla 1.071 Türk katılımcı sayıyor. Hedef pazarın ilk halkası burada, ikinci halkası widening ülkeleri (Balkanlar, Polonya, Romanya, Yunanistan, Portekiz) ve AB dışı asosiye ülkeler (UK, İsviçre, Norveç).
- Mevcut araçlar parçalı: HorizonFlow (€25–100/kullanıcı/ay) yazım odaklı, EUcalls (€23–39,90/ay) çağrı listesi, EMDESK (€6/kullanıcı/ay) proje yönetimi, Crowdhelix ağ. Hiçbiri "ortak istihbaratı + stage-gate + admin kontrollü modüller"i birleştirmiyor; hiçbiri Türkçe değil ve TÜBİTAK ulusal süreçlerini (1071/1709, Eşik Üstü) içermiyor.

## 3. Müşteri segmentleri

| Segment | Büyüklük (TR) | Acı noktası | Ödeme gücü | Öncelik |
|---|---|---|---|---|
| **KOBİ / teknoloji şirketi** (ilk kez ya da 1–2 deneyim) | ~1.000 aktif Ufuk katılımcısı + 5.000+ potansiyel (Teknopark firmaları) | Doğru çağrıyı bulamama, konsorsiyuma girememe, teklif maliyeti | Orta (€50–200/ay) | 1 |
| **Danışmanlık / proje yazım firması** | ~150 firma TR; binlerce AB'de | Çok müşteri, çok teklif; hız ve tekrar kullanım; ortak bulma | Yüksek (€500–2.000/ay) | 1 |
| **Üniversite TTO / proje ofisi** | 200+ üniversite; 80+ TTO | Araştırmacılara çağrı eşleştirme, koordinatör destek, raporlama | Orta-yüksek (kurumsal satın alma, yıllık) | 2 |
| **Kümelenme / OSB / kalkınma ajansı / EEN düğümü** | 26 kalkınma ajansı, 50+ EEN ortağı, 100+ kümelenme | Üyelerine hizmet; ortak eşleştirme; raporlama | Yüksek (üye başına lisans) | 1 (kalkınma ajansı: kamu segmentinin dağıtım kanalı, ADR-0004); diğerleri 2 |
| **Belediye / Mission kentleri** | ~1.390 belediye (30 büyükşehir dahil) | Deneyimsizlik; CERV, Erasmus+, LIFE, Cities Mission, NEB, Interreg/IPA çağrıları | Orta (kamu ihalesi / doğrudan temin) | 1 (ADR-0004, 29.09.2026; pilot: İlkadım Belediyesi) |

Yıl 1 hedef: Türkiye'de öncelik 1 segmentleri (ADR-0004 ile belediye/kamu + kalkınma ajansı kanalı eklendi); Yıl 2: segment 2 + widening ülkeleri (İngilizce); Yıl 3: AB geneli.

## 4. Değer önerisi (segment başına)

- KOBİ: "Yılda 6–8 teklife girin, 1–2 proje kazanın" — çağrıyı size getirir, doğru konsorsiyuma sokar, teklifin eşiği geçmesini sağlar.
- Danışmanlık: "Teklif başına 100–150 saat tasarruf" — çoklu müşteri çalışma alanı, Evidence Pack ve blok kütüphanesi, Evaluator Lens ile ön değerlendirme.
- TTO: "Araştırmacı–çağrı eşleştirmesini otomatikleştirin, koordinatör sayınızı artırın" — Partner Intelligence + TTO Accelerator + raporlama.

## 5. Gelir modeli — beş kalem

### 5.1 Abonelik (çekirdek gelir, hedef: toplam gelirin %65'i)

Modül temelli, koltuk sınırlı katmanlar. Yıllık ödemede %20 indirim. Fiyatlar KDV hariç.

| Plan | Aylık | Koltuk | Çekirdek (K1–K6) | Açık modüller | Kime |
|---|---|---|---|---|---|
| **Keşif** (ücretsiz) | €0 | 1 | K1 çağrı tarama (3 kayıtlı arama), K3 taban oranlar | M3 lite (50 kanıt) | Deneme, öğrenci, ilk temas |
| **Başlangıç** | €59 | 2 | K1–K3 tam, K5 pipeline | M3, M5, M2 (3 concept note/ay) | Tek KOBİ |
| **Ekip** | €249 | 6 | + K4 outreach, K6 YZ (aylık kredi) | + M1, M4, M8 | Aktif KOBİ, küçük TTO |
| **İşletme** | €599 | 15 | + çoklu çalışma alanı (5 müşteri), SSO | + M6, M9, M10, M11 | Danışmanlık, TTO, kümelenme |
| **Kurumsal** | €1.500+ (yıllık sözleşme) | Sınırsız | + sınırsız çalışma alanı, API, beyaz etiket, özel model, SLA | Tümü + M7 | Büyük danışmanlık, ajans, üniversite |

Kurallar:
- Her plan kendi modül kümesini "açık" getirir; yönetici konsolu bunları kapatabilir ama plan dışı modülü ancak eklenti satın alarak açabilir.
- YZ kullanımı kredi tabanlı (Ekip 500 kredi/ay, İşletme 2.000, Kurumsal sözleşmeye göre); 1 kredi ≈ 1 concept note taslağı ya da 1 sahte değerlendirme. Ek kredi paketi €49 / 250 kredi.
- Ek koltuk: Başlangıç €19, Ekip €29, İşletme €39 / ay.

### 5.2 Modül eklentileri (hedef: %12)

Plan dışı modüllerin tek tek açılması; yöneticinin konsoldan "satın al ve aç" akışı.

| Eklenti | Aylık | Hangi planlara | Not |
|---|---|---|---|
| M6 Evaluator Lens | €99 | Ekip | 20 sahte değerlendirme/ay dahil |
| M11 Full Application Production | €149 | Ekip | Part A/B üretimi, bütçe ve lump-sum eki |
| M7 TTO Accelerator | €129 | Ekip, İşletme | TTO portföy tarama, IP/lisans şablonları |
| M8 Consortium Matching Pro | €79 | Başlangıç | Rol matrisi + çakışma uyarısı |
| Ek çalışma alanı (müşteri) | €49 | İşletme | Danışmanlıklar için |

### 5.3 Hizmet paketleri ve başarı primi (hedef: %13)

İnsan destekli hizmetler, platform üzerinde takip edilir (M5 iş akışı, M10 belgeler).

| Hizmet | Fiyat | Not |
|---|---|---|
| Konsorsiyum kurma sprinti (M8 + M9 + uzman) | €2.500–7.500 / teklif | 6 hafta; G2 kapısına kadar |
| Sahte değerlendirme paneli (2 eski hakem + M6) | €900 / teklif | 5 iş günü |
| Tam teklif yazım desteği | €6.000–25.000 / teklif (rol ve programa göre) | Sabit ücret; koordinatörlükte üst bant |
| Başarı primi | Hibenin %3–5'i, kademeli, tavanlı | **AB kurallarına göre uygun maliyet değildir**; sözleşmede açıkça belirtilir, müşteri kendi kaynağından öder |
| Kurumsal eğitim / onboarding | €1.500 / gün | TTO ve ajanslar |

### 5.4 Pazar yeri komisyonu (hedef: %6, Yıl 2'den itibaren)

- Doğrulanmış danışman ve uzman hakem havuzu; müşteri platform içinden görev açar, ödeme platform üzerinden, **%12 komisyon** (danışmandan).
- Konsorsiyum koltuğu ilanları: "koltuk arayan/koltuk sunan" eşleşmesi; premium ilan €99 / çağrı; kurumsal planlarda ücretsiz.
- Pilot sahası / kent ortağı eşleşmesi (Mission kentleri, OSB'ler) — Yıl 3.

### 5.5 Veri ve API lisansı (hedef: %4, Yıl 2'den itibaren)

- Partner Intelligence API (M1 verisi: kurum kartları, iş birliği grafı, konu bazlı liderler): **€299/ay** 10.000 çağrı; kurumsal sözleşmeyle daha yüksek.
- Toplu veri lisansı (yıllık anlık görüntü + aylık delta): €4.000/yıl; ajans ve araştırma kurumlarına.
- Not: Kaynak veri (CORDIS, F&T Portal) AB açık veri lisansı altındadır; satılan şey türev göstergeler, graf metrikleri ve ilişki katmanıdır — lisans metni bunu açıkça ayırır.

## 6. Fiyatlandırma gerekçesi

- Bir KOBİ için Ekip planı yılda ~€2.400. Tek bir Ufuk Avrupa ortaklığında şirkete ortalama €475 K düşer; tek bir Eşik Üstü Ödülü (ortak 14.000 TL) bile birkaç ayı karşılar. Değer/fiyat oranı 100×'in üzerinde.
- Danışmanlık için İşletme planı yılda ~€7.200; Argentum'un kendi verisiyle teklif başına 100–150 saat tasarruf, yılda 20 teklifte 2.000+ saat.
- Rakip çapa: HorizonFlow Team €50/ay (2 kullanıcı) + €15/ek; EUcalls €39,90; bizim Ekip planı €249 (6 koltuk, M1+M8 dahil) — daha yüksek ama daha geniş; Başlangıç €59 giriş fiyatı rakiplerle aynı bant.

## 7. Birim ekonomi (varsayımlar — ilk 6 ayda ölçülüp güncellenecek)

| Metrik | Başlangıç | Ekip | İşletme | Kurumsal |
|---|---|---|---|---|
| ARPA (aylık, eklentiler dahil) | €65 | €300 | €750 | €2.200 |
| Aylık brüt marj | %82 | %80 | %78 | %70 (hizmet yükü) |
| Aylık kayıp (churn) | %5 | %3 | %2 | %1 |
| Ortalama yaşam (ay) | 20 | 33 | 50 | 100 |
| LTV (brüt) | €1.070 | €7.900 | €29.000 | €154.000 |
| Hedef CAC | ≤ €350 | ≤ €2.000 | ≤ €6.000 | ≤ €25.000 |
| LTV/CAC | 3,1 | 4,0 | 4,8 | 6,2 |

Maliyet sürücüleri: LLM çağrıları (kredi tabanlı olduğu için marj korunur), Postgres/vektör deposu, CORDIS işleme (aylık toplu iş), destek personeli (İşletme+).

## 8. Üç yıllık projeksiyon (baz senaryo)

| | Yıl 1 (2027) | Yıl 2 (2028) | Yıl 3 (2029) |
|---|---|---|---|
| Ücretli hesap (yıl sonu) | 120 | 450 | 1.200 |
| Dağılım | 70 Başlangıç / 40 Ekip / 8 İşletme / 2 Kurumsal | 220 / 160 / 55 / 15 | 520 / 420 / 200 / 60 |
| MRR (yıl sonu) | €23 K | €105 K | €330 K |
| Abonelik + eklenti geliri | €150 K | €800 K | €2,6 M |
| Hizmet + başarı primi | €60 K | €250 K | €600 K |
| Pazar yeri + veri | €0 | €60 K | €300 K |
| **Toplam gelir** | **€210 K** | **€1,1 M** | **€3,5 M** |
| Ekip (FTE) | 5 | 12 | 25 |
| Nakit başabaş | — | Q4 2028 | ✓ |

Kötümser senaryo (Türkiye FP10 asosiyasyonunda gecikme): Yıl 2 geliri €650 K; karşı önlem: widening ülkelerine erken açılım ve Eurostars/Eureka odaklı paket.

## 9. Pazara giriş (GTM)

1. **Faz 0 (2026 Q4) — tasarım ortağı programı:** 10 kurum (5 KOBİ, 3 danışmanlık, 2 TTO) 6 ay ücretsiz İşletme planı karşılığında haftalık geri bildirim ve referans. Kendi pipeline'ımız (Avrupa Proje Fabrikası dosyası) ilk kullanıcıdır — "dogfooding".
2. **Kanal:** TÜBİTAK UİN bilgi günleri (yılda 30+), Teknopark yönetimleri, KOSGEB/EEN düğümleri, kalkınma ajansları, üniversite TTO ağı (ÜSİMP). Ortak webinar: "Bu çağrıya nasıl girilir" formatı, her büyük kesimden 6 hafta önce.
3. **İçerik/SEO:** Her çağrı için Türkçe konu sayfası (K1 verisinden otomatik), "Türkiye'ye açık mı?" filtresi, ücretsiz Keşif planı ile e-posta uyarıları → dönüşüm hunisi.
4. **Ortaklık:** Danışmanlık firmalarına beyaz etiket/ortak marka; EEN düğümlerine üye lisansı; iyzico ile TL tahsilat, Stripe ile EUR.
5. **Yıl 2 uluslararası:** İngilizce arayüz, Balkan/Polonya/Yunanistan UİN'leri; Crowdhelix/b2match etkinliklerinde varlık.

## 10. Rekabet avantajı ve savunulabilirlik

- **Veri katmanı:** CORDIS + F&T + ilişki verisi üzerine inşa edilen ortak grafı ve gerçek ESR sonuçlarıyla kalibre edilen puanlama modeli; kullanıldıkça iyileşir (veri ağ etkisi).
- **Süreç:** G0–G4 stage-gate ve admin kontrollü modüller — "yazım aracı" değil "üretim hattı".
- **Yerellik:** TÜBİTAK ulusal süreçleri (1071/1709 tarihleri, Eşik Üstü paketi, KDV istisnası) gömülü; Türkçe.
- **Uyum:** Komisyon'un YZ şeffaflık kuralı için otomatik beyan; KVKK/GDPR uyumlu çok kiracılı mimari.

## 11. Ana riskler (iş modeli)

| Risk | Önlem |
|---|---|
| Resmî olmayan F&T API'nin değişmesi | Çoklu kaynak (Apify, EUcalls), haftalık sağlık kontrolü, manuel yedek |
| LLM maliyetinin marjı yemesi | Kredi modeli, önbellekleme, küçük model yönlendirme |
| Başarı priminin AB kurallarıyla çatışması | Uygun maliyet olmadığı sözleşmede; yalnızca hizmet paketiyle birlikte; alternatif "sabit ücret + bonus" |
| Türkiye'nin FP10 belirsizliği (2028) | Yıl 2'de uluslararası gelir payı ≥ %30 hedefi |
| Büyük danışmanlıkların kendi aracını yapması | Onlara beyaz etiket/API satmak (ortak, rakip değil) |

## 12. Ölçülecek ilk 10 metrik

Ücretli dönüşüm (Keşif→Başlangıç), aktivasyon (ilk 7 günde 1 kayıtlı arama + 1 fırsat G0'a alındı mı), haftalık aktif çalışma alanı, teklif/hesap/yıl, eşik üstü oranı, isabet oranı, YZ kredi kullanımı, NPS, churn, eklenti ekleme oranı.
