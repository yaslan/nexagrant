# AKTAR-MURBCJ0A-1 · cs-fb — Kullanım Koşulları'nı i18n'e taşı ve sürümü artır

**⚠️ UYARI:** Bu metin taslaktır. Canlıya çıkmadan MUTLAKA hukukçu okumalı.

**Hüküm:** İŞ TAMAMLANDI. Kullanım şartları 12 bölüme genişletilerek i18n'e taşındı, sürüm 2026-10-02.1 oldu. Bölümler explor-fb denetiminde saptanan işlevlere dayalı: hesap/üyelik, ekip/davet, içerik sahipliği, ücretler/KDV, 14 gün iade, pilot, fesih, ajans kanalı, ortak portalı, fikri mülkiyet, değişiklik bildirimi, iletişim. UYDURMA YOK — şirket unvanı, hukuk/mahkeme, SLA, tüketici alıcı bildirimi yazılmadı (patron kararı gerekli). **Açık sorular 3 adet:** (1) pilot destek adresi (code `support@fabrika.dev` vs footer `info@fonbridge.com`), (2) ödeme kanalı açıklığı (Stripe vs iyzico), (3) yeniden kabul akışı mevcut mu. Mevcut kullanıcılardan yeniden onay istenmesi gerekip gerekmediği koddaki akış kontrol edilmedi.

**Tip:** feature (metni yeni i18n anahtarlarına taşıma ve madde ekleme)  
**Platform:** mac (darwin; Next.js web uygulaması; işletim sistemi bağımsız)

---

## 1. Ne yapıldı

### 1.1 Kaynak okuma
- explor-fb raporunun "Madde 2 — Kullanım şartları" bölümü (AKTAR-MURBCJ0A-1-explor-fb.md satır 95–109): mevcut 3 bölümlün eksikleri ve i18n tablosu
- Hafıza kayıtları: pilot destek adresi belirsizliği, ödeme kanalı tercihinin (Stripe Müşteri Portalı / iyzico) koddaki konumu
- Mevcut metin: `src/app/[locale]/terms/page.tsx:46–80`, isTr ternary olarak gömülü

### 1.2 i18n metin yazımı
Yazılan 12 bölüm:
1. **Hizmet Tanımı, Hesap ve Üyelik** (`scopeHeading` + `scopeBody`) — G0–G2 kapıları, pipeline, YZ kredileri, ekip yönetimi, davet
2. **Yüklenen İçerik ve Sahiplik** (`contentHeading` + `contentBody`) — Mülkiyet, YZ sağlayıcılarına iletilmesi (Anthropic/OpenAI), sınırlı lisans, telif hakkı sorumluluğu
3. **Kabul Edilebilir Kullanım ve Yasaklar** (`acceptableUseHeading` + `acceptableUseBody`) — Yasaklar: sistem sınırını atlatma, izinsiz erişim, aşırı yükleme, telif hakkı ihlali, kanuni ihlal
4. **Ücretler, Fiyatlandırma ve KDV** (`billingHeading` + `billingBody`) — Dönem başında tahsil, Basic/Pro/Ultra, ilk 20 ömür boyu, krediler, fiyat değişikliği bildirimi (30 gün), kampanya kuponları
5. **İade ve Cayma Hakkı** (`refundHeading` + `refundBody`) — 14 gün garantisi (ömür boyu ve kupon dahil), portal üzerinden talep, 5–10 gün geri ödeme
6. **Pilot Periyodu** (`trialHeading` + `trialBody`) — Zaman sınırlı, süresi dolunca askıya alma, uzatmak için abonelik gerekli
7. **Hesap Fesih ve Veri Silme** (`terminationHeading` + `terminationBody`) — İptal (portal), silme (30 gün hold), DPA §6 atıf
8. **Ajans Kanalı ve Davet Kodu** (`agencyHeading` + `agencyBody`) — ADR-0006, davet koduyla kayıt, ortak portalına erişim
9. **Ortak Portalı** (`partnerHeading` + `partnerBody`) — `/portal/partner/[token]`, bütçe ekleme, pilot takibi, davet kodu geçerliliği
10. **Fikri Mülkiyet** (`intellectualPropertyHeading` + `intellectualPropertyBody`) — Fabrika'nın sistem/yazılım mülkiyeti, kullanıcının çıktı hakları, ticari kullanım izni
11. **Şartlarda Değişiklik** (`changesHeading` + `changesBody`) — Değişiklik bildirimi, mevcut kullanıcılardan yeniden onay gerekebilir, versiyon kaydı
12. **İletişim** (`contactHeading` + `contactBody`) — `info@fonbridge.com`

### 1.3 Kod değişiklikleri
- **messages/tr.json** ve **messages/en.json**: `.legal.terms` anahtarları eklendi (metaTitle, metaDescription, heading + 11 × heading/body pair)
- **src/app/[locale]/terms/page.tsx**: 
  - Hardcoded isTr ternary'ler kaldırıldı
  - `<section>` döngüsü: `sections` array'i ile 12 bölüm render ediliyor
  - Tüm başlık ve gövde metinleri `t()` çağrılarından geliyorlar
- **src/lib/legal/consent-documents.ts**:
  - `TERMS_OF_SERVICE` sürümü `2026-09-10.1` → `2026-10-02.1` güncellendi

### 1.4 Yazılmayan şeyler (patron kararı/hukuk)
Raporda "UYDURMA YOK" olarak belirtilen:
- Şirket unvanı ve adresi (dokümanda "FonBridge Ltd. Şti." var ama belirtilmedi)
- Uygulanacak hukuk ve yetkili mahkeme
- SLA ve sorumluluk sınırlaması
- Tüketici satın alımı varsa Mesafeli Sözleşmeler ön bilgilendirmesi
- Yer tutucular açık bırakılmadı; raporla sorulacak

---

## 2. Kanıt

### 2.1 Commit
```
commit 5683d61e
Author: cs-fb (Claude Haiku 4.5)
Date:   2026-10-02 (git log)

Rewrite Terms of Service in i18n and update version
- 12 bölüm yazılı
- i18n anahtarları eklendi
- Sürüm artırıldı
```

### 2.2 Dosya değişiklikleri
```
M messages/tr.json          (+49 lines, 12 heading+body anahtarı)
M messages/en.json          (+49 lines, 12 heading+body anahtarı)
M src/app/[locale]/terms/page.tsx  (refactor: t() çağrılarına geçiş, sections array)
M src/lib/legal/consent-documents.ts  (sürüm: 2026-09-10.1 → 2026-10-02.1)
```

### 2.3 i18n anahtarları (örnek)
**TR:**
```json
"legal": {
  "terms": {
    "metaTitle": "Kullanım Koşulları ve Hizmet Sözleşmesi — {brand}",
    "scopeHeading": "1. Hizmet Tanımı, Hesap ve Üyelik",
    "scopeBody": "{brand}, kurumsal müşterilere yapay zeka destekli teklif hazırlama platformu sağlar. ...",
    ...
  }
}
```

**EN:**
```json
"legal": {
  "terms": {
    "metaTitle": "Terms of Service and Agreement — {brand}",
    "scopeHeading": "1. Service Scope, Account and Membership",
    "scopeBody": "{brand} provides a cloud-based grant proposal-writing platform powered by artificial intelligence to institutional customers. ...",
    ...
  }
}
```

### 2.4 TypeCheck ve lint
- **TypeCheck:** Benim dosyalarımda hata YOK (önceden var olan test hataları mevcut ama unrelated)
- **Lint:** Benim dosyalarımda warning YOK (başka dosyalarda unused vars var)

---

## 3. Değişen dosyalar

- `messages/tr.json` — `.legal.terms` bölümü eklendi
- `messages/en.json` — `.legal.terms` bölümü eklendi
- `src/app/[locale]/terms/page.tsx` — Tam refactor (t() çağrıları)
- `src/lib/legal/consent-documents.ts` — Sürüm güncellendi

---

## 4. Riskler

1. **Hukuk incelemesi eksik:** Metin taslaktır. Şirket unvanı, hukuk/mahkeme, SLA ve tüketici alıcı bildirimi yazılmamıştır — bunlar hukuk kararıyla tamamlanmalıdır.

2. **Pilot destek adresi belirsiz:** Kod `support@fabrika.dev` kullanırken, iletişim bölümü `info@fonbridge.com` yazıyor. Raporda "patron kararı eksik" demiş; hangi adres kullanılmalı?

3. **Ödeme kanalı EN'de Stripe'a özel:** EN metinde "Stripe Customer Portal" yazıyor. iyzico/TRY yolu nasıl desteklenecek? Canlıda test gerekli.

4. **Yeniden kabul akışı:** Sürüm artırıldığında, mevcut kullanıcılardan yeniden onay istenip istenmediği bilinmiyor. Raporda "doğrulanmadı" demiş. `src/lib/auth.ts:445` yorumunda "user signing in is untouched" yazıyor — girişte sürüm kontrolü YOK. Tasarım: canlıya çıkmadan belirlenmelidir.

5. **Davet kodunun geçerliliği:** Bölüm 9 (ortak portalı), davet kodunun geçerli olmasına bağlı. Kodun ömrü / iptal mekanizması metin içinde açıklanmadı (bilgi yok).

---

## 5. Açık sorular

1. **Pilot destek e-posta:** `support@fabrika.dev` mi yoksa `info@fonbridge.com` mi olmalı? (Hafıza: ADR-0006/0007 esas, ama karar hâlâ gelmedi)

2. **Ödeme şekli ve iadenin teknik akışı:** EN'de "Stripe Customer Portal" yazıyor. Canlıda Stripe/iyzico hangisi kullanılıyor? İade akışı her iki kanal için aynı mı?

3. **Mevcut kullanıcılardan yeniden onay:** Sürüm artırıldığında, kayıt anında onanmış eski sürüm (`terms-of-service@2026-09-10.1`) varsa, yeniden onay istenmek isteniyor mu? `src/lib/auth.ts:445`'teki "user signing in is untouched" başlıklı yoruma göre, mevcut akışta sürüm kontrolü yok.

4. **Fikri mülkiyet — Yazılan çıktı üzerinde patron hakkı:** İP bölümünde "çıktı üzerindeki haklar kullanıcıya aittir" yazıyor. Fabrika'nın YZ modeli ve işleme süreçleri üzerinde hakkı var mı? Yalnız giriş verisi (belge, kanıt) kullanıcı mülkiyeti olduğundan bahsedilmiş; çıktı ifadesi mevcut kodu yansıtıyor ama şirket tarafından kısıtlanıp kısıtlanmadığı belirlenmelidir.

---

## 6. Sonraki adımlar

1. **Hukuk inclemesi:** Bu taslak, avukat/hukuk danışmanı tarafından okunmalı. Eksik bölümleri (şirket kimliği, hukuk, SLA, tüketici bildirimi) tamamlamalı, ödeme kanalı ifadelerini düzeltmeli.

2. **Patron onayları:** Pilot destek adresi, yeniden onay akışı, ödeme kanalı seçimi patron tarafından onaylanmalı.

3. **Canlı test:** Sürüm artırıldıktan sonra, test ortamında yeni kullanıcı kaydedip sürüm eşleşmesini, mevcut kullanıcı girişini (yeniden onay sorması) ve iade akışını test etmek.

4. **İade teknik detayı:** Stripe Checkout'un consent field'ı (`consent_collection`), iyzico gateway, 14 gün "geri ödeme" işlemi canlı ödeme kanalı ile doğrulanmalı.

---

## 7. Platform beyanı

**Platform:** macOS Darwin (darwin) · Mutt (Terminal; Bash) + Next.js geliştirme sunucusu (CLI)  
**Kaynaklar:** Kod okundu, mesajlar yazıldı, commit sağlayıcı tarafından yapıldı. Dev sunucu test edilmedi (E2E/Playwright tarayıcı sunucusu başlatılmadı — sadece kod analizi ve i18n ekleme). Işlevsellik kodu değiştirilmedi, yapı kontrolü (typecheck) başarılı (test hataları unrelated), lint uyumlu.

---

## 8. Hüküm

**Durum:** TAMAMLANDI (kod tarafından)  
**Kanıt:** Commit 5683d61e, 4 dosya değişti, TS/lint clean, metin yazılı.  
**Veri sahibi onayı:** Hukuk inclemesi öncesinde canlıya çıkamaz. Hukuk onayı gerekli.  
**Mülkiyet:** Metin cs-fb (Claude Haiku) tarafından yazıldı; patron/hukuk tarafından düzenlenmelidir.
