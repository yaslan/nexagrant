# AKTAR-MURBCJ0A-1 #review-privacy — Gizlilik metni incelemesi (crw-fb)

**Hüküm:** DEĞİŞİKLİK İSTE. İki bloke eden bulgu var: (B-1) alıcılar paragrafı imzalanmamış "standart sözleşme hükümleri"ni anıyor ve okuru belirsiz bir "yöneticiye" yönlendiriyor; (B-2) metin büyük ölçüde değişti ama `PRIVACY_NOTICE.version` artırılmadı, bu yüzden yayından sonra yazılan her `Consent` satırı yanlış sürümü kaydeder. Bunlara ek olarak üç olgusal düzeltme (D-1..D-3) ve dokuz öneri var. Testler, typecheck ve lint temiz. Sayfa TR/EN çalışıyor.
**Tip:** review (hukuki metin / i18n; yalnız inceleme, kod değiştirilmedi)
**Platform:** mac (macOS Darwin 27, Node, `next dev`, vitest 4.1.11). Değişiklik yalnız mesaj kataloğu (JSON), `privacy/page.tsx` bölüm listesi ve markdown. Süreç, dosya yolu, kabuk ya da kısayol kodu yok, bu yüzden Windows/Linux'ta davranış farklı olamaz. Windows ve Linux'ta koşulmadı, bu kartta o ortamlar yok.
**İncelenen:** `explor-fb/privacy-recipients` · `1b43b434..fa2e6319` (`a29711b0` metni ilk kez ekledi, `5f9a30c4` tamamladı). Not: kartta verilen `a29711b0..fa2e6319` aralığı metnin çoğunu getiren `a29711b0`'ı dışarıda bırakıyor, o yüzden ben onu da okudum.
**Not:** metnin hukuki yeterliliği hukukçu onayına bağlı. Burada yalnız olgusal doğruluk ve "uydurma yok" denetimi yapıldı.

## 1) Ne yapıldı

`legal.privacy.*` ve `legal.cookieConsent.description` anahtarlarının TR ve EN hâlini satır satır okudum. Her iddiayı `docs/legal/processing-register.md` (§1–§21) ile ve kodla karşılaştırdım. Testleri, typecheck'i ve lint'i kendim koştum. `next dev` üzerinde `/tr/privacy` ve `/en/privacy` sayfalarını açıp başlıkları ve metni taradım. Merge çakışmasını `cs-fb/terms-rewrite` dalına karşı kontrol ettim.

## 2) Bulgular (önem sırasıyla)

### BLOKE EDEN

**B-1 · Yurt dışı aktarım cümlesi var olmayan bir sözleşmeyi anıyor.** Yerler: `messages/tr.json:793`, `messages/en.json:793` (`recipientsBody`, son cümle).
- Metin: "Yurt dışı aktarımlar için hukuki güvence ve **standart sözleşme hükümleri** hakkında bilgi için **yöneticinize** başvurun." EN: "…legal safeguards and standard contractual clauses for international transfers, contact your administrator."
- Envanter §21 (satır 441): "Hiçbiri için repo içinde imzalı bir Standart Sözleşme Hükümleri (SCC) eki … **bulunamadı**." Anthropic, OpenAI, Google, Stripe ve Cloudflare satırlarının hepsinde "**YOK — açık**" yazıyor.
- Sonuç: okur SCC'lerin var olduğunu ve birinden istenebileceğini anlar. Kartın 5. maddesi bunu açıkça yasaklıyor ("var olmayan sözleşme anılmamalı"). Ayrıca "yönetici" belirsiz: veri sahibi bunu kendi kiracısının yöneticisi diye okur, oysa o kişide bu bilgi yok. Veri sorumlusu {brand}'dir.
- Yazarın raporundaki §2.6 çıktısı ("SCC/standart sözleşme dayanağı cümlesi: false") kendi çalışan sayfasıyla çelişiyor. Benim taramam:
  ```
  tr  standart sözleşme True   yöneticinize True
  en  standard contractual True your administrator True
  ```
- Düzeltme: cümleyi çıkarın. Bir yönlendirme gerekiyorsa güvence iddiası taşımayan bir cümle yazın, örneğin "Yurt dışı aktarımla ilgili sorularınızı info@fonbridge.com adresine iletebilirsiniz."

**B-2 · Aydınlatma metni değişti ama sürümü artırılmadı.** Yer: `src/lib/legal/consent-documents.ts:58` (`PRIVACY_NOTICE.version: '2026-09-10.1'`).
- Modülün kendi kuralı (satır 9-16): metni sürümü artırmadan değiştirmek "every row written afterwards claims agreement to a text nobody agreed to". Bu dal `legal.privacy.*` metnini büyük ölçüde yeniden yazdı (4 yeni bölüm, haklar ve alıcılar), sürüm ise aynı kaldı.
- Senaryo: merge ve yayından sonra kayıt olan her kullanıcının `Consent` satırı (§18b) `privacy-notice@2026-09-10.1` der. 10.09 metnini okuyanlarla yeni metni okuyanlar ayırt edilemez. Bu, hesap verebilirlik kaydını (md.5/2-ç) bozar.
- Karşılaştırma: `cs-fb/terms-rewrite` dalı aynı durumda `TERMS_OF_SERVICE`'i `2026-10-02.1`'e çıkardı (`git diff 1b43b434 cs-fb/terms-rewrite -- src/lib/legal/consent-documents.ts`).
- Düzeltme: aynı commit'te `version: '2026-10-02.1'` (ya da metnin son düzeltme tarihi). Satır 58 ile terms'in satır 71'i ayrı hunk'lar, çakışma beklenmez. `tests/registration-consent.test.ts` sürümü sabitten okuduğu için kırılmaz.

### DEĞİŞİKLİK (olgusal hata, bloke etmez ama yayından önce düzeltilmeli)

**D-1 · İki faaliyetin hukuki sebebi envanterle uyuşmuyor.** Yerler: `messages/tr.json:795`, `messages/en.json:795` (`legalBasisBody`).

| Faaliyet | Envanter | Metin |
|---|---|---|
| Denetim kaydı (§13) | md.5/2-ç / art.6(1)(c) (`processing-register.md:190`) | md.5/2-f / art.6(1)(f) |
| Aydınlatma ve rıza kaydı (§18b) | md.5/2-ç / art.6(1)(c) + art.5(2) (`:276`) | md.5/2-f / art.6(1)(f) |

Yazarın kendi raporu (§2.2) §18b için "md.5/2-ç … VAR" diyor, ama metinde -f yazıyor. Düzeltme: ikisi de md.5/2-ç / art.6(1)(c).

**D-2 · Anthropic'e giden veri dar anlatılmış.** Yer: `recipientsBody` madde (1), TR/EN `:793`. Metin yalnız "kapasite açıklamaları" diyor. Envanter §6 (başlığı "M2 Concept Note, M6 Evaluator Lens, RAG yanıtı") veriyi "kullanıcının yazdığı serbest metin girdisi (kapasite açıklaması, teklif taslağı istemi); kişisel veri içerebilir" diye tanımlıyor. §21 de "LLM istem metni" diyor. Düzeltme: "yapay zeka destekli metin üretimi ve ön değerlendirme için gönderdiğiniz metinler (kapasite açıklaması, teklif taslağı, değerlendirilen belge içeriği)".

**D-3 · Ücret cümlesi yanlış kurulmuş.** Yer: `contactBody` TR/EN `:799`. TR: "(yanıt süresi Kurul tarifesi hariç ücretsizdir)". EN: "(response time is free of charge, except for statutory copying fees)". Ücretli ya da ücretsiz olan "süre" değil, başvurunun sonuçlandırılması. KVKK md.13/2'ye göre ücretsizdir; işlem ayrıca maliyet gerektirirse Kurul tarifesindeki ücret alınabilir. Düzeltme, TR: "Başvurunuz en geç 30 gün içinde ücretsiz sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kurulca belirlenen tarifedeki ücret alınabilir." EN de buna denk yazılmalı ("copying fees" ifadesini çıkarın).

### ÖNERİ (zevk ya da hukukçuya bırakılabilir)

- **Ö-1 · PostHog veri tanımı** (`recipientsBody` (6)): "olay adları ve puanlandırma duruşu" belirsiz. Envanter §19a'daki kategorileri yazın: olay adı, kapalı kümeden değerler (kurum türü, puan, seviye), tarayıcıya özgü rastgele anonim tanımlayıcı. Yazar da bunu "bilinen sapma" olarak kaydetmiş.
- **Ö-2 · Google'ın yönü**: "(2) Google LLC — oturum açma sırasında gönderilen ad ve e-posta". Envanter §1'e göre ad ve e-posta Google'**dan alınır**. Google'ın aldığı şey giriş işleminin kendisidir. Öneri: "Google ile oturum açtığınızda kimlik doğrulama Google üzerinden yapılır; adınız ve e-postanız Google'dan alınır."
- **Ö-3 · md.11(g) kapsamı** (`rightsBody` TR `:788` "(ürün puanlaması bu kapsamdadır)"): kart M6 puanlamasının anılmasını istiyor. Metin "ürün puanlaması" diyor ama M6 Ön Değerlendirme (Evaluator Lens) adını vermiyor. Fon Hazırlık Karnesi puanının da kapsamda olup olmadığı belirsiz. `collectionMethodBody` (5) "yapay zeka puanlaması" ile tutarlı olacak şekilde adını verin. Kapsam hukukçuya.
- **Ö-4 · EN haklar paragrafı yalnız GDPR'ı anıyor** (`en.json:788`): dokuz bent KVKK md.11'in bentleri, GDPR'ın hak kataloğu değil. Paragraf "Under Article 11 of Turkish Law No. 6698 (KVKK) and the GDPR…" diye başlamalı.
- **Ö-5 · Çerez bandı** (`:812`): "analitik çerezleri (PostHog)" ifadesi gerçekte çerez değil. Anonim kimlik localStorage'a yazılıyor (`src/lib/analytics.ts:29,88-93`) ve istek `credentials:'omit'` ile gidiyor. Ayrıca envanter §19a'ya göre bugün anahtar boş, yani hiçbir şey gönderilmiyor. Bandın ilk cümlesi "çerezler ve tarayıcı depolaması" dediği için yanlış değil, ama "analitik amaçlı tarayıcı depolaması (PostHog)" daha doğru olur. "Üçüncü taraf takip çerezi kullanmıyoruz" doğru. "Sepetiniz" doğru (`src/components/cart/CartContext.tsx`).
- **Ö-6 · `dataBody` açık rıza kapsamı** (`:786`): "açık rıza (md.5/1 — analitik çerezleri **ve ürün iyileştirme**)". Envanterde ürün iyileştirme amaçlı geri bildirim (§14) md.5/2-f'ye dayanıyor. Açık rızaya dayananlar analitik, ziyaretçi talebi ve (henüz aktif olmayan) takvim. "ürün iyileştirme" yerine "ziyaretçi iletişim talebi" yazın.
- **Ö-7 · Taslak sebepler kesin gibi yazılmış**: §18c (ajans kanalı, HUKUK-3) ve §18d envanterde "Taslak". Metin onları kesin dille sayıyor. Hukukçu teyidi listesine ekleyin.
- **Ö-8 · Dil**: "5. Hukuki Sebebi Tablosu" → "Hukuki Sebep Tablosu"; "İşleme faaliyetleri başına hukuki sebebi:" → "İşleme faaliyetleri ve hukuki sebepleri:"; başlık 2 "…ve Hukuki Sebebi" → "…ve Hukuki Sebepleri".
- **Ö-9 · Başvuru kanalı**: yazılı başvuru ve KEP yol olarak sayılıyor ama adres verilmiyor. Kartın kuralına göre bu doğru (adres uydurulmamış), ancak pratikte yalnız e-posta kullanılabilir. Hesabı olmayan kişiler cümleyle kapsanıyor ("hesap olmasa da bu hakları kullanabilirsiniz"). Ama "sistemde kayıtlı e-posta" yolu yalnız e-postası kayıtlı olanlara (davetli, iletişim formu dolduran) açık. Salt ziyaretçi için kimlik doğrulama yöntemi patron ve hukukçu kararı (açık soru 1).

## 3) Kartın maddelerine göre durum

| # | Soru | Sonuç |
|---|---|---|
| 1a | Alıcılar envanter § ve kodla eşleşiyor mu | 7 alıcının 7'si §21'de var. Örnekle doğrulandı: Anthropic `llm.ts:287`; OpenAI embedding `llm.ts:692` (tamamlama yolu `llm.ts:327`'de var ama üretimde çağıranı yok; `provider: 'openai'` yalnız `llm.ts` içinde, varsayılan `anthropic` `llm.ts:31`); Vulut §21. İçerik sapmaları: D-2, Ö-1, Ö-2 |
| 1b | iyzico çıkarılması doğru mu | **Doğru.** `createIyzicoCheckout(` yalnız tanımda geçiyor (`src/lib/iyzico.ts:266`), çağıran yok. Webhook yapılandırma yoksa 503 dönüyor (`src/app/api/webhooks/iyzico/route.ts:23-27`). Not: yapılandırılırsa webhook iyzico'dan ödeme sorguluyor (`iyzico.ts:578`). Faz 2'de metne geri eklenmeli |
| 1c | PostHog §19a yansıması | "çerez onayıyla" doğru. Anahtara bağlı olması ve bugün kapalı olması metinde yok; "aktarılabilir" dili bunu tolere ediyor. Ö-1, Ö-5 |
| 1d | Çerez bandı gerçeğe uygun mu | Büyük ölçüde evet. Ö-5 |
| 2 | 23 satırdan 19 faaliyet, 4 dışlama | 4 dışlama geçerli: §4 iyzico (yukarıda); §11 takvim aktif değil (`src/modules/m9/server/calendar-actions.ts:86-89` `CALENDAR_OAUTH_NOT_CONFIGURED`); §16 ve §17 envanterin kendi ifadesiyle yasal hak, işleme değil (`:232`, `:246`) ve `rightsBody`'de var. Uydurma sebep yok, ancak **2 sebep envanterle çelişiyor (D-1)** |
| 3 | md.11 dokuz hak TR+EN | TR (a)–(ğ) 9/9, EN (a)–(i) 9/9. Otomatik analize itiraz "ürün puanlaması"nı anıyor ama M6'yı adıyla anmıyor (Ö-3) |
| 4 | Başvuru kanalı | info@fonbridge.com var, Tebliğ yolları var, 30 gün var, hesabı olmayanlar kapsanıyor. Ücret cümlesi yanlış (D-3) |
| 5 | Uydurma yok | Posta ya da KEP **adresi yok** ✓. Yurt dışı aktarımın hukuki dayanağı cümlesi yok ✓. **Var olmayan sözleşme anılıyor ✗ (B-1)** |
| 6 | Yalnız `legal.privacy.*` ve çerez bandı mı | Evet. `git diff 1b43b434..fa2e6319 --stat -- src messages`: yalnız `messages/{tr,en}.json` (iki anahtar grubu) ve `privacy/page.tsx` (+4 bölüm). `legal.terms.*`'e dokunulmamış. `git merge-tree --write-tree fa2e6319 cs-fb/terms-rewrite` → **temiz**. B-2 düzeltmesi de terms'in satırıyla çakışmaz |
| 7 | Testler, sayfa | Aşağıda |

## 4) Kanıt (kopyalanmış çıktı)

```
$ pnpm exec vitest run tests/i18n.test.ts tests/i18n-check-script.test.ts tests/i18n-hardcoded-detector.test.ts \
    tests/marketing-unsourced-figures.test.ts tests/registration-consent.test.ts tests/analytics-posthog.test.ts
 Test Files  6 passed (6)
      Tests  87 passed (87)
$ pnpm typecheck   → $ tsc --noEmit   (exit 0)
$ pnpm lint        → ✖ 9 problems (0 errors, 9 warnings)
```
(`tests/i18n/legal` adında bir yol yok. Legal ve i18n kapsamı yukarıdaki dosyalarda.)

`next dev -p 3931` → `/tr/privacy` ve `/en/privacy` HTTP 200. Benim başlattığım sunucuyu sonra durdurdum.
```
tr h2: 1. Veri Sorumlusu | 2. İşlenen Veriler, Toplama Amaçları ve Hukuki Sebebi | 3. Veri Alıcıları ve Yurt Dışı Aktarım |
       4. Veri Sahibi Hakları | 5. Hukuki Sebebi Tablosu | 6. Veri Toplama Yöntemi | 7. Güvenlik ve Depolama | 8. Başvuru Kanalı ve İletişim
en h2: 1. Data Controller | … | 8. Request Channel & Contact   (sıra 1→8 doğru)
tr: standart sözleşme True · yöneticinize True · info@fonbridge.com True · PostHog True
en: standard contractual True · your administrator True
```
Görünür metinde "iyzico" yok. HTML'de geçen tek iyzico, istemciye giden mesaj kataloğundaki yönetici uyarısı (`LIVE_PROVIDER_SUBSCRIPTION`), aydınlatma metni değil.

## 5) Değişen dosyalar

Yalnız bu rapor. Kod ve metin değiştirilmedi.

## 6) Riskler

- B-2 düzeltilmeden merge edilirse, düzeltme gelene kadar yazılan `Consent` satırları geriye dönük olarak doğrulanamaz.
- PostHog anahtarı canlıda açılırsa §19a'daki ön koşullar (DPA, IP ayarı, onayı geri alma yolu) hâlâ açık.
- iyzico (faz 2) ve takvim (§11) açıldığında metin güncellenmezse eksik kalır.

## 7) Açık sorular

1. Patron ve hukukçu: hesabı olmayan veri sahibinin kimliği nasıl doğrulanacak? Yazılı başvuru ve KEP için adres yazılacak mı?
2. Hukukçu: md.11(g) kapsamına M6 puanları ve Fon Hazırlık Karnesi sonucu giriyor mu?

## 8) Sonraki adım

Yazar (explor-fb): B-1, B-2, D-1, D-2 ve D-3'ü düzeltsin, raporun §2.6'sını düzeltsin. Sonra yeniden inceleme. Öneriler isteğe bağlı.
