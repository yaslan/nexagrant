# Mali müşavire gönderilecek yazılı soru listesi

Bu belge, e-Fatura go-live'ı önünde duran ve **kod tarafında karara bağlanamayan**
vergi sorularını toplar. Her soru, depoda ölçülmüş somut bir duruma dayanır —
genel bilgi sorusu değildir; cevabı doğrudan bir kod davranışını değiştirir.

**Gönderen bilgileri patron tarafından verildi (2026-09-08).** İmza unvansız gider.

İlgili: `docs/EFATURA_SETUP.md` · `docs/BILLING.md` ·
`docs/adr/ADR-0002-foreign-currency-invoice-fx.md` · `docs/legal/processing-register.md`
Kartlar: `TASK-MTT1WUUS7MN7R` (KDV) · `TASK-MTRJSOWFH6B45` (go-live)

---

## Gönderilecek metin (buradan aşağısı kopyalanır)

**Konu:** Abonelik tabanlı yazılım hizmetinde KDV ve e-Fatura uygulaması — yazılı görüş talebi

Merhaba,

FonBridge Ltd. Şti. olarak, Avrupa fonlarına yönelik abonelik tabanlı bir yazılım
hizmeti (SaaS) sunuyoruz. Faturalama altyapımızı canlıya almadan önce aşağıdaki
konularda yazılı görüşünüze ihtiyacımız var. Her başlığın altında bugünkü
uygulamamızı da yazdım; yanlışsa lütfen düzeltin.

**Kısa bağlam**
- Hizmet: yurt içi ve yurt dışı **kurumsal** müşterilere satılan, internet üzerinden
  sunulan abonelik yazılımı. Bugün için tüketiciye (B2C) satış hedeflenmiyor.
- Tahmini hacim: ayda en az 1, en çok 1.000 fatura.
- Fiyat kataloğu **USD** üzerinden; tahsilat şu an yalnız Stripe ile yapılıyor.
- Henüz **hiçbir fatura kesilmedi**; altyapı canlıya alınmadan görüşünüzü alıyoruz.

### 1. Mükellefiyet: e-Fatura mı, e-Arşiv mi?
Hangisine tabiyiz ve hangi eşikten itibaren? Alıcı e-Fatura mükellefi ise
e-Fatura, değilse e-Arşiv fatura düzenlemek gerektiğini biliyoruz; sistemin
**alıcının mükellefiyetini nasıl kontrol etmesi** gerektiğini (GİB mükellef
listesi sorgusu) ve bunun zorunlu olup olmadığını netleştirir misiniz?

### 2. Fiyatların KDV hariç ilan edilmesi
Fiyatlarımızı **KDV hariç** ilan edip KDV'yi faturada eklemeyi planlıyoruz.
Herkese açık fiyat sayfamız kurumsal müşteriye yönelik olmakla birlikte
internette herkesin görebileceği bir sayfa. Bu durumda KDV hariç ilan etmek
mevzuata uygun mu, yoksa "KDV dahil" gösterme veya ikisini birlikte gösterme
yükümlülüğü doğar mı?

### 3. Yurt içi KDV oranı
Yurt içi kurumsal müşteriye kesilen abonelik faturasında uygulanacak KDV oranı
**%20** olarak kabul edildi. Bu hizmet türü için doğru oran bu mu; indirimli
orana giren bir durum var mı?

### 4. Yurt dışına satışta KDV — en kritik başlık
Yurt dışı müşterilere satışta bugün planımız şu: **AB ülkelerine kendiliğinden
KDV uygulamamak**, yani her ülkenin oranını tabloda tutmakla birlikte "rejim"
alanı netleşene kadar o ülkelere fatura kesmemek.

Lütfen netleştirin:
- **a)** Yurt dışındaki bir kuruluşa verdiğimiz bu hizmet, KDV Kanunu md.11/1-a
  ve md.12/2 anlamında **hizmet ihracatı istisnası** kapsamına giriyor mu?
  Giriyorsa istisnayı uygulayabilmek için hangi belgeler/koşullar aranıyor
  (hizmetten yurt dışında yararlanılması şartı dahil)?
- **b)** AB'deki bir **kurumsal** müşteriye satışta, alıcının KDV numarasını
  (VIES) alıp doğrulamamız gerekiyor mu? Faturaya "reverse charge / tersine
  yükümlülük" ibaresi yazmamız gerekir mi?
- **c)** İleride AB'deki **tüketicilere** satarsak OSS / Birlik-dışı şema kaydı
  gerekir mi; bu bizim için pratikte ne anlama gelir?
- **d)** Kuveyt gibi AB dışı ülkelerdeki müşteriler için uygulama farklı mı?

### 5. Yurt dışından aldığımız hizmetler — sorumlu sıfatıyla KDV (KDV-2)
Altyapımızda yurt dışı sağlayıcılardan hizmet alıyoruz: **OpenAI, Anthropic,
Stripe, Google, Microsoft, Resend, Cloudflare.** Bu alımlar için **sorumlu
sıfatıyla KDV (2 No.lu KDV beyannamesi)** yükümlülüğümüz doğuyor mu? Doğuyorsa
hangi kalemler kapsamda ve beyan/ödeme ritmi ne olmalı? (Bu yükümlülüğü bugüne
kadar sistem tarafında hiç modellemedik; eksikse en kısa sürede kapatmak
istiyoruz.) _Güncel 29.09.2026: Microsoft ve Resend üründen çıktı (Resend `fe9fd31c`);
e-posta kurumsal e-posta hesabının SMTP'sinden gidecek, sağlayıcıyı patron belirleyecek._

### 6. Döviz faturası, TCMB kuru ve TL karşılığı
Fiyat kataloğumuz USD olduğu için faturaların çoğu **döviz** cinsinden kesilecek.
Bugünkü uygulamamız:
- Fatura kendi para biriminde (USD/EUR) düzenlenir;
- Üzerine **fatura düzenleme tarihindeki TCMB döviz alış kuru** ve TL karşılığı
  yazılır (VUK 280; UBL-TR `PricingExchangeRate` / `TaxExchangeRate` alanları);
- TCMB o gün bülten yayımlamamışsa (hafta sonu/tatil) **geriye doğru en son
  yayımlanan** kur kullanılır ve kullanılan kurun **tarihi faturaya yazılır**;
- TCMB'ye hiç ulaşılamazsa **fatura kesilmez** — uydurma/yaklaşık kur yazılmaz.

Sorular: **a)** Kur esası doğru mu, yoksa tahsilat (Stripe) anındaki kur mu esas
alınmalı? **b)** Yurt içi müşteriye döviz faturası kesmek yerine TL faturaya
çevirmemiz mi gerekir? **c)** Kur farkı doğduğunda kur farkı faturası
yükümlülüğümüz nasıl işler?

### 7. Ön ödemeli kredi/kontör
Müşteri abonelikle birlikte, sonradan harcadığı **ön ödemeli kredi** satın
alabiliyor. Vergiyi doğuran olay **kredinin satıldığı an** mı, yoksa **kullanıldığı
an** mı? Kullanılmadan kalan kredi için bir düzeltme gerekiyor mu?

### 8. Fatura düzenleme süresi ve dönem
Abonelik bedeli tahsil edildiğinde faturayı hangi süre içinde düzenlemeliyiz
(7 günlük süre bu durumda nasıl uygulanır)? Dönemsel abonelikte fatura tarihi
tahsilat tarihi mi, dönem başı/sonu mu olmalı?

### 9. Saklama süresi
Fatura ve fatura kayıtlarını kaç yıl saklamalıyız? VUK 253 (5 yıl) ile TTK
(10 yıl) arasındaki farkın bizim için pratik sonucu nedir? Bu soruyu ayrıca
KVKK/GDPR tarafında da soruyoruz: kişisel veri içeren fatura kayıtlarının
"hukuki yükümlülük" gerekçesiyle saklanacağı süreyi bu cevaba dayandıracağız.

### 10. Alıcı kimliği
Faturada alıcı için hangi bilgileri zorunlu olarak toplamalıyız (unvan, VKN/TCKN,
vergi dairesi, adres)? Yurt dışı alıcıda bu alanların karşılığı ne olmalı?

---

Cevaplarınızı yazılı olarak iletmeniz yeterli; ardından kısa bir görüşme talep
edebiliriz.

İyi çalışmalar,
Dr. Yasin ASLAN · FonBridge Ltd. Şti.
bilgi@fonbridge.com · 0533 461 55 95

---

## Cevaplar geldiğinde ne değişir

| Soru | Bugünkü davranış | Cevap neyi değiştirir |
|---|---|---|
| 2 | Fiyat "KDV hariç" etiketli | Fiyat ekranı ve `docs/BILLING.md` metni |
| 3 | `TR = %20` (`src/lib/billing/vat-rates.ts`) | Tablodaki TR satırı |
| 4 | AB üyeleri `regime: unknown` → **fatura kesilmiyor** | 27 satırın rejimi; istisna uygulanırsa `exempt` |
| 5 | **Hiç modellenmedi** | Yeni bir yükümlülük — kart açılması gerekebilir |
| 6 | VUK 280, fatura tarihi kuru; TCMB yoksa fatura yok | `src/lib/fx/tcmb.ts` gün seçimi |
| 7 | Kredi satışı ve kullanımı ayrı kaydediliyor | Vergiyi doğuran olayın yeri |
| 9 | Envanterde **10 yıl VARSAYIM** olarak işaretli | `docs/legal/processing-register.md` §12 saklama süresi |
