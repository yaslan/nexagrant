# Entegratöre gönderilecek yazılı teknik bilgi talebi (RFI)

Bu belge, e-Fatura özel entegratörüne **görüşmeden önce yazılı olarak**
gönderilecek metindir. Amaç: adaptörün tek turda yazılabilmesi için gereken
teknik cevapları görüşmeye gelmeden almak.

**Patron kararı 2026-09-08:** metin **tek adaya** gönderilir (karşılaştırmalı çoklu
teklif turu yapılmayacak). Aday henüz seçilmedi; seçilir seçilmez bu metin gider.

**Gönderen bilgileri patron tarafından verildi (2026-09-08) ve metne işlendi.**
Tek eksik: imza satırındaki **unvan** — patron belirtmedi, uydurulmadı.

Bağlam: `docs/EFATURA_SETUP.md` · Kart: `TASK-MTRJSOWFH6B45`

---

## Gönderilecek metin (buradan aşağısı kopyalanır)

**Konu:** e-Fatura özel entegratör entegrasyonu — teknik bilgi talebi

Merhaba,

FonBridge Ltd. Şti. olarak abonelik tabanlı bir yazılım hizmeti sunuyoruz ve
e-Fatura gönderimi için özel entegratör hizmeti almayı değerlendiriyoruz.

Kısa bağlam:
- Fatura tipi: abonelik/hizmet faturası, satır sayısı düşük (tipik olarak 1-3 kalem).
- Tahmini hacim: ayda **en az 1, en çok 1.000** fatura.
- Belge formatı: UBL-TR 1.2.1 XML'i biz üretiyoruz.
- Para birimi: TRY'nin yanı sıra **USD/EUR** fatura kesilecek; belgeye TCMB kuru
  ve TL karşılığı alanları yazılacak.
- Entegrasyonu kendi sistemimizden sunucu-sunucu yapacağız (panel kullanımı değil).

Teklifinizi değerlendirebilmemiz ve entegrasyonu planlayabilmemiz için aşağıdaki
sekiz başlıkta **yazılı** bilgi rica ediyoruz:

1. **API dokümanı ve protokol.** Fatura gönderme ve durum sorgulama uçlarının
   dokümanını paylaşabilir misiniz? Servis REST/JSON mi, SOAP/WSDL mi?

2. **Kimlik doğrulama.** Bağlantı nasıl doğrulanıyor: kullanıcı adı + parola mı,
   token/API anahtarı mı, karşılıklı TLS (istemci sertifikası) mı? Anahtar/parola
   yenileme (rotation) süreci nasıl işliyor?

3. **Zarf numarası.** GİB'in döndürdüğü zarf numarası (ETTN / zarf ID) yanıtın
   hangi alanında geliyor? Bir belgeyi "GİB'e gönderildi" saymamızın tek ölçütü
   bu numara olacak; alan adını ve örnek bir yanıt gövdesini paylaşır mısınız?

4. **Test ortamı.** Canlıdan ayrı bir test ortamı (ayrı adres + ayrı test hesabı)
   veriyor musunuz? Test ortamında gerçek bir zarf numarası dönüyor mu?

5. **UBL-TR sürümü.** UBL-TR 1.2.1 belgelerini olduğu gibi kabul ediyor musunuz?
   Zarfı siz mi oluşturuyorsunuz, yoksa zarflanmış belge mi göndermemiz gerekiyor?
   Şema doğrulaması hangi aşamada yapılıyor?

6. **Mali mühür / e-imza.** Mali mühür sizde mi duruyor, yoksa bizim mühür/e-imza
   temin edip belgeyi imzalayarak mı göndermemiz gerekiyor?

7. **Hata ve durum kodları, tekrar gönderim.** Hata/durum kodlarının tam listesini
   paylaşabilir misiniz? Aynı faturayı yeniden gönderirsek davranış nedir —
   mükerrer kayıt oluşur mu, yoksa idempotent mi? Tekrar gönderimde hangi alanı
   referans alıyorsunuz?

8. **Yabancı para birimi.** UBL-TR'nin `cac:PricingExchangeRate` ve
   `cac:TaxExchangeRate` bloklarını taşıyan döviz faturalarını kabul ediyor
   musunuz? Bu alanlarda beklediğiniz bir biçim/kısıt var mı?

Ayrıca ticari tarafta: hizmet bedeli ve kontör/adet fiyatlandırması, sözleşme
süresi, hizmet seviyesi (SLA) ve teknik destek kanalı hakkında bilgi rica ederiz.

Cevaplarınızı yazılı olarak iletmeniz bizim için yeterli; ardından teknik ekibimiz
kısa bir görüşme talep edebilir.

İyi çalışmalar,
Dr. Yasin ASLAN · FonBridge Ltd. Şti.
bilgi@fonbridge.com · 0533 461 55 95

---

## Cevaplar geldiğinde ne olacak

Sekiz başlığın cevabı `docs/EFATURA_SETUP.md` "Adım 0" listesindeki kutuları
kapatır. Cevaplar elde olunca satıcıya özel adaptör kartı açılır
(`ADAPTERS` — `src/lib/efatura-integrator.ts`) ve geliştiriciye delege edilir.
Adaptör yazılmadan `EFATURA_INTEGRATOR_*` değişkenleri dolu olsa bile gönderim
`provider_unsupported` döner.
