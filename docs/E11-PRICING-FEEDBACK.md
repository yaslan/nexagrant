# E11.4 — Fiyat doğrulama: beta ortağı geri bildirimi

> Üretildi: 2026-09-06 17:56:35Z · Kaynak: `docs/BETA_DATA/pricing-survey-responses.fixture.csv` · Yeniden üret: `pnpm beta:pricing --analyze --responses=<csv>`
>
> Bu dosya **üretilir**, elle düzenlenmez. Metin değişikliği `src/lib/beta/pricing-report.ts`, politika değişikliği `src/lib/beta/pricing-transition.ts` içinde yapılır.

> ## ⚠️ BU RAPORDAKİ SAYILAR GERÇEK ORTAK YANITI DEĞİLDİR
>
> Kaynak dosya kendini **FIXTURE** olarak işaretliyor (`docs/BETA_DATA/pricing-survey-responses.fixture.csv`). Not: Synthetic dataset. Written 2026-09-06 to exercise the analysis end to end; no partner answered these.
>
> Bu çalıştırma **analiz hattını uçtan uca doğrulamak** içindir: anket tanımı → CSV → istatistik → rapor.
> Gerçek yanıtlar 7. hafta atölyesinde (2026-10-22) toplanır; rapor o CSV ile yeniden üretilir ve bu uyarı kendiliğinden kalkar.
>
> **Bu sayılara dayanarak fiyat kararı alınmaz.** Aşağıdaki “v1.0 → v1.1 geçiş kuralı” bölümü ise ankete bağlı değildir; o bir politika kararıdır ve bugün geçerlidir.

## 1. Yöntem

Anket iki standart araç kullanır. **Van Westendorp** dört soruyla, katılımcıya hiçbir rakam göstermeden kabul edilebilir fiyat bandını çıkarır. **Gabor-Granger** ise sabit bir merdivende (€149 · €199 · €249 · €299 · €349) her fiyatı bağımsız sorar ve sabit örneklem üzerinde gelir endeksi verir. İkisi de bir karar değildir; bir kararı sınırlar.

Çapa plan: **Ekip** (liste €249/ay). Tüm tutarlar aylık, KDV hariç, EUR.

Van Westendorp hijyeni: dört fiyatı sıralı vermeyen (`çok ucuz ≤ ucuz ≤ pahalı ≤ çok pahalı`) yanıt eğrileri ters yönde keseceği için **reddedilir ve gerekçesiyle raporlanır** — sessizce düşmez.

## 2. Katılım

- Davet edilen ortak: **10**
- Geçerli yanıt: **9** (%90)
- Reddedilen satır: **1**

| Satır | Yanıtlayan | Gerekçe |
|---:|---|---|
| 7 | R-beta-izmir-belediye | Van Westendorp prices are not ordered (tooCheap ≤ cheap ≤ expensive ≤ tooExpensive): €49, €249, €199, €399 |

## 3. Van Westendorp — kabul edilebilir fiyat bandı

| Ölçüt | Değer | Ne demek |
|---|---:|---|
| PMC — marjinal ucuzluk | €154 | Bunun altında kalite şüphesi kelepir hissini bastırır |
| OPP — optimal fiyat | €214 | Toplam reddin en düşük olduğu nokta |
| IPP — kayıtsızlık | €199 | “Ucuz” ve “pahalı” diyenlerin eşitlendiği nokta |
| PME — marjinal pahalılık | €299 | Bunun üstünde direnç değeri bastırır |

<details><summary>Eğri noktaları (kümülatif paylar)</summary>

| Fiyat | Çok ucuz | Ucuz | Pahalı | Çok pahalı |
|---:|---:|---:|---:|---:|
| €29 | %100 | %100 | %0 | %0 |
| €39 | %89 | %100 | %0 | %0 |
| €49 | %67 | %100 | %0 | %0 |
| €59 | %44 | %100 | %0 | %0 |
| €79 | %33 | %100 | %0 | %0 |
| €89 | %22 | %89 | %0 | %0 |
| €99 | %22 | %78 | %0 | %0 |
| €129 | %0 | %56 | %0 | %0 |
| €149 | %0 | %44 | %0 | %0 |
| €179 | %0 | %33 | %0 | %0 |
| €199 | %0 | %22 | %22 | %0 |
| €229 | %0 | %11 | %33 | %0 |
| €249 | %0 | %11 | %44 | %0 |
| €299 | %0 | %0 | %67 | %0 |
| €329 | %0 | %0 | %67 | %11 |
| €349 | %0 | %0 | %78 | %22 |
| €369 | %0 | %0 | %78 | %33 |
| €399 | %0 | %0 | %89 | %44 |
| €449 | %0 | %0 | %100 | %44 |
| €499 | %0 | %0 | %100 | %67 |
| €599 | %0 | %0 | %100 | %78 |
| €699 | %0 | %0 | %100 | %89 |
| €749 | %0 | %0 | %100 | %100 |

</details>

## 4. Gabor-Granger — fiyat merdiveni

| Fiyat | Alırım | Kabul | Gelir endeksi |
|---:|---:|---:|---:|
| €149 | 8/9 | %89 | €1,192 |
| €199 ⭐ | 8/9 | %89 | €1,592 |
| €249 | 5/9 | %56 | €1,245 |
| €299 | 3/9 | %33 | €897 |
| €349 | 1/9 | %11 | €349 |

⭐ = sabit örneklemde gelir endeksinin en yüksek olduğu basamak.

## 5. Segment kırılımı

| Segment | n | Kabul edilebilir (medyan) | Çok pahalı (medyan) | Bugünkü dış harcama | Koltuk | Çalışma alanı | İstenen indirim | Ödeme olasılığı |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| KOBİ / Ar-Ge | 3 | €214 | €499 | €800 | 6 | 1 | %30 | 7.7/10 |
| Üniversite / TTO | 2 | €152 | €359 | €225 | 9 | 2 | %40 | 6.0/10 |
| Danışmanlık | 2 | €324 | €724 | €2,000 | 14 | 9 | %18 | 9.0/10 |
| Diğer | 2 | €184 | €414 | €525 | 6 | 2 | %30 | 6.5/10 |

## 6. Plan seçimi

| Plan | Yanıt | Pay |
|---|---:|---:|
| Ekip | 4 | %44 |
| Başlangıç | 3 | %33 |
| İşletme | 2 | %22 |

## 7. Eklenti talebi

| Eklenti | Yanıt | Pay |
|---|---:|---:|
| Evaluator Lens (M6) €99 | 5 | %56 |
| Full Application (M11) €149 | 3 | %33 |
| Ek çalışma alanı €49 | 3 | %33 |
| Consortium Matching Pro (M8) €79 | 2 | %22 |
| 250 kredi €49 | 1 | %11 |
| TTO Accelerator (M7) €129 | 1 | %11 |

### YZ kredisi yeterliliği (Ekip planı, 500/ay)

| 500 kredi yeterli mi? | Yanıt | Pay |
|---|---:|---:|
| Yetmez | 6 | %67 |
| Bilmiyorum | 2 | %22 |
| Yeter | 1 | %11 |

## 8. Faturalama

### Döngü

| Döngü | Yanıt | Pay |
|---|---:|---:|
| Yıllık | 4 | %44 |
| Aylık | 3 | %33 |
| Yalnız yıllık | 2 | %22 |

### Para birimi

| Tercih | Yanıt | Pay |
|---|---:|---:|
| Türk lirası | 5 | %56 |
| Euro | 4 | %44 |

E-fatura/e-arşiv ihtiyacı bildiren: **%67**

### Başarı primi

| Tutum | Yanıt | Pay |
|---|---:|---:|
| Kabul | 3 | %33 |
| Koşullu | 3 | %33 |
| Ret | 3 | %33 |

## 9. Bulgular

- **Optimal fiyat noktası €214**, liste fiyatının (€249) %14 altında. Liste fiyatı optimal noktanın belirgin üstünde; ya fiyat ya da paketleme (koltuk, kredi) gözden geçirilmeli.
- **Kabul edilebilir fiyat aralığı €154 – €299.** Ekip planı bu aralığın içinde.
- **Gabor-Granger geliri €199 basamağında maksimum** (kabul %89, 8/9 yanıt). Bu bir talep tahmini değil, sabit örneklem üzerinde gelir endeksidir.
- ⚠️ 1 yanıt merdivende tutarsız (düşük fiyata hayır, yüksek fiyata evet): R-beta-iberia-research. Bu yanıtlar merdiven yorumunu zayıflatır; atölyede teyit edilmeli.
- **Yanıtların %67’si 500 aylık krediyi yetersiz buluyor.** Kredi paketi (`addon_credits_250`) bir kurtarma satışı değil, planın parçası olmak zorunda kalabilir.
- 2 ortak **yalnız yıllık** satın alabiliyor (%22). Aylık-öncelikli bir Checkout akışı bu ortaklar için satın alma engeli.
- **E-fatura ihtiyacı: yanıtların %67’si.** BILLING.md §4’te faz 2’ye bırakılan e-fatura entegrasyonu bu orana göre yeniden önceliklendirilmeli.
- 5 ortak TL faturalama istiyor (%56) — iyzico/TL fiyat listesi (BILLING.md §4) beta sonrası ilk 90 günün konusu.
- **Başarı primi:** 3 kabul · 3 koşullu · 3 ret. ROADMAP “Açık kararlar” #6 bu satırla kapanmaz ama yönü belirlenir.
- **İstenen indirimin medyanı %30, 75. yüzdeliği %35.** Aşağıdaki “founding” kademesi (%40) bu iki değeri de karşılıyorsa geçişte pazarlık beklenmez.
- **Ödeme olasılığı ortalaması 7.3/10**, 8+ veren pay %44.

## 10. Serbest yorumlar

- **R-beta-anadolu-teknoloji** (KOBİ / Ar-Ge): “Kredi 500 bize bir ayda yetmiyor; M2 taslaklarını çok kullanıyoruz.”
- **R-beta-ege-arge** (KOBİ / Ar-Ge): “İlk koordinatörlüğümüz; sabit ücret yerine başarıya bağlı ödeme bizim için daha kolay.”
- **R-beta-bogazici-tto** (Üniversite / TTO): “Satın alma yalnız yıllık ihale ile oluyor, aylık kart ödemesi yapamıyoruz.”
- **R-beta-odtu-arge** (Üniversite / TTO): “Koltuk sayısı 6 az kalıyor, fakülte başına bir çalışma alanı istiyoruz.”
- **R-beta-marmara-danismanlik** (Danışmanlık): “Müşteri başına çalışma alanı şart. Bu fiyat bir danışman gününden ucuz.”
- **R-beta-ankara-kume** (Diğer): “Küme üyelerimiz için konsorsiyum eşleştirme en değerli parça.”
- **R-beta-benelux-innov** (KOBİ / Ar-Ge): “The evaluator lens is the reason we would pay; it replaces an external reviewer.”
- **R-beta-iberia-research** (Diğer): “Below 149 I would assume it is a toy. Somewhere near 199 feels honest.”
- **R-beta-nordic-consulting** (Danışmanlık): “Price is not our constraint, seats and workspaces are. Sell us the ceiling.”

## 11. v1.0 → v1.1 geçiş kuralı

Beta 2026-10-29 tarihinde kapanır; ücretli sürüm **2026-11-16** tarihinde başlar. Aradaki iki hafta kapanış raporu ve imzalı teklif içindir — ilk fatura öncesinde ortağın elinde yazılı koşul olur.

Kademe **harcamaya değil katılıma** bağlıdır: indirimin karşılığı, ortağın betada verdiği kullanım ve kalibrasyon verisidir.

| Kademe | Koşul | İndirim | Süre | Fiyat kilidi | Hoş geldin kredisi |
|---|---|---:|---:|---:|---:|
| `founding` | 5/8 sync **ve** ≥1 teklif G2’de | **%40** | 12 ay | 24 ay | 500 |
| `contributor` | 3/8 sync | **%25** | 12 ay | 12 ay | 250 |
| `alumni` | Diğer tüm beta ortakları | **%15** | 6 ay | — | — |

### Kuralın tamamı

1. **İndirim** seçilen planın ve döngünün **liste fiyatına** uygulanır. Yıllık listede zaten var olan %20 (BILLING.md §1) yeniden uygulanmaz — faturada tek bir indirim satırı görünür, mutabakat yapılabilir.
2. **Fiyat kilidi (grandfathering):** kilit süresince v1.1 liste zammı bu kiracıya ulaşmaz. Kilit bitince artış 12 ayda en çok **%20** olabilir ve **60 gün** önceden yazılı bildirilir (BILLING.md §4’teki TL bildirim süresiyle aynı).
3. **Pilot modüller:** betada `pilot` açılmış olup satın alınan planın kapsamı dışında kalan modüller GA’dan sonra **60 gün** daha `pilot` kalır, sonra `off` olur. Veri silinmez. Kademeli kapanış `src/core/modules/state-machine.ts` üzerinden yürür, UI kopyalamaz.
4. **Krediler:** beta kredileri devretmez (ücretsizdi). Yerine kademeye bağlı tek seferlik hoş geldin kredisi tanımlanır.
5. **Yükseltme indirimi taşır:** ortak üst plana geçerse aynı yüzde yeni planın liste fiyatına uygulanır — büyümek indirimi kaybettirmez.
6. **Atalet:** kiracı üst üste **90 gün** `free` planda kalırsa kademe düşer; fiyat kilidi yıllar sonra uyandırılacak bir varlık değildir.
7. **Devredilemez:** birleşme/satın alma hâlinde kademe yeni tüzel kişiye geçmez; sözleşme yenilenir.
8. **v1.1 içerik artışı:** v1.1 ile İşletme planına giren M6/M9 (ROADMAP Faz B) kilitli ortaklara **kilitli fiyattan** açılır; içerik artışı zam gerekçesi olarak onlara yansıtılmaz.

### Örnek teklifler (Ekip planı)

| Kademe | Döngü | Liste | Ödenecek | Tasarruf | İndirim biter | Kilit biter |
|---|---|---:|---:|---:|---|---|
| `founding` | aylık | €249 | **€149** | €100 | 2027-11-16 | 2028-11-16 |
| `founding` | yıllık | €2,390 | **€1,434** | €956 | 2027-11-16 | 2028-11-16 |
| `contributor` | aylık | €249 | **€187** | €62 | 2027-11-16 | 2027-11-16 |
| `contributor` | yıllık | €2,390 | **€1,793** | €598 | 2027-11-16 | 2027-11-16 |
| `alumni` | aylık | €249 | **€212** | €37 | 2027-05-16 | — |
| `alumni` | yıllık | €2,390 | **€2,032** | €359 | 2027-05-16 | — |

> Tablo `resolveBetaTransition()` çağrılarak üretilir; teklif mektubu, Stripe kuponu ve yetkilendirme kontrolü aynı fonksiyonu kullandığı sürece üçü ayrışamaz.

## 12. Açık kalanlar

- İndirim yüzdeleri gerçek yanıtlarla yeniden ayarlanır: tek değişiklik noktası `TRANSITION_TIERS` (`src/lib/beta/pricing-transition.ts`), testler koruma bandı.
- Stripe tarafı: kademe başına bir `coupon` + `promotion_code`, süresi `discountMonths` kadar `repeating`. Kilit Stripe’ta ifade edilemez — `Subscription` üzerinde `priceLockEndsOn` alanı gerekir (ayrı görev).
- Başarı primi kararı (ROADMAP “Açık kararlar” #6) hukuki görüş beklemektedir; anket yalnızca yön verir.
- TL fiyat listesi ve e-fatura önceliği bu rapordaki paylara göre yeniden sıralanmalıdır.
