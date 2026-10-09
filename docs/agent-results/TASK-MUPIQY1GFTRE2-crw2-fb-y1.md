---
title: "TASK-MUPIQY1GFTRE2#y1: DPA Patron Verileri Gözden Geçirme"
type: "Code Review"
reviewer: "crw2-fb"
reviewed_task_author: "se-fb"
date: "2026-10-03"
status: "Completed"
verdict: "APPROVED"
---

# TASK-MUPIQY1GFTRE2#y1: DPA Patron Verileri Gözden Geçirme (Y-1)

**Hüküm:** ✅ ONAY — Teknik açıdan uygundur. Açık kalemler hukuk ekibi takip etmelidir.

**Platform Bildirimi:** macOS (darwin 27.0.0)

---

## İnceleme Özeti

SE-FB tarafından yapılan DPA v1.3 patron verisi güncellemesi incelendi. Türkçe ve İngilizce metinleri satır satır kontrol edildi, i18n test geçişleri doğrulandı ve git commit'i kontrol edilerek veri bütünlüğü doğrulandı.

**Sonuç:** Teknik gereklilikler yerine getirilmiştir. Hukuk ekibi tarafından açık kalemler kapanana dek DPA imzaya hazır değildir.

---

## Bulguların Özeti

| Kategori | Bulgu | Durum |
|----------|-------|-------|
| TR/EN Uyumu | Satır satır eşleşik, "[tamamlanacak]" işaretlemesi tutarlı | ✓ UYUMLU |
| VKN Doğrulama | 11 haneli (standart 10 hane) — teyit gerekli | ⚠ AKSIYONLANDI |
| Adres Tamamlama | Sokak, kapı, posta kodu eksik — "[tamamlanacak]" işaretli | ⚠ AKSIYONLANDI |
| MERSİS Alanı | Boş; patron vermedi — raporda belirtildi | ⚠ AKSIYONLANDI |
| Hukuk Seçimi (13.2/13.3) | Seçim listeli, sat başarısız; imza öncesi seçilecek | ⚠ AKSIYONLANDI |
| Aktarım Dayanakları (7.3) | GDPR md.46 SCC ve KVKK md.9 belgeleri alınmadı | ⚠ AKSIYONLANDI |
| i18n Kontrolü | Test başarılı, baseline güncellenmiş | ✓ UYUMLU |
| Git Commit | Mesaj + değişiklik tutarlı, co-author doğru | ✓ UYUMLU |

---

## Detaylı Bulgular

### ✓ F-1: Türkçe ve İngilizce Uyumu (UYUMLU)

**Kontrol Edilen Alanlar:**

| Alan | TR Satır | EN Satır | Uyum |
|------|----------|----------|------|
| Ticari unvan | L22: `Fonbridge Ltd. Şti.` | L22: `Fonbridge Ltd. Şti.` | ✓ |
| Adres | L23: `Karasamsun Mahallesi, İlkadım, SAMSUN [tamamlanacak]` | L23: `Karasamsun Quarter, İlkadım, SAMSUN [to be completed]` | ✓ |
| VKN | L24: `29120352230` | L24: `29120352230` | ✓ |
| R2 Konumu (Ek-1) | L124: `Amsterdam (Batı Avrupa)` | L124: `Amsterdam (Western Europe)` | ✓ |

**Sonuç:** Satır satır eşleştirme doğru, ülke/bölge isimleri uygun şekilde çevrilmiş ([tamamlanacak] ↔ [to be completed]). Teknik yazım hataları yok.

---

### ⚠ F-2: VKN 11 Haneli (TEYİT GEREKLİ)

**Bulgu:** Patron `29120352230` (11 haneli) VKN sunmuş. Türkiye'de standart vergi kimlik numarası (VKN) 10 hanedir.

**Etki:** 
- Fatura ve resmi kayıtlarda kullanılırsa yasal risktir.
- Yanlış VKN'li fatura geçersizdir.

**Durum:** SE-FB raporu (R-1) bu bulguyu belirtmiş ve "hukuk ekibi patron ile teyit etmeli" demiştir. Doğru aksiyonlanmıştır.

**Sonuç:** Hukuk ekibinin patron/muhasebe ile teyit etmesi şarttır. Eğer 11 hane standart istisnası var ise (ör. şube kimliği), dokümante edilmelidir.

---

### ⚠ F-3: Eksik Adres Bilgisi (AÇIK KALACAK)

**Bulgu:** Adres olarak yalnız mahalle, ilçe, şehir yazılı: `Karasamsun Mahallesi, İlkadım, SAMSUN [tamamlanacak]`

**Eksik Alanlar:**
- Sokak adı
- Kapı numarası / bina numarası
- Posta kodu

**Etki:** DPA'da "[tamamlanacak]" işaretlenmiş. Faturalama adresi olarak yetersiz.

**Durum:** Açıkça "[tamamlanacak]" işaretlenmiş ve SE-FB raporu bunu belirtmiş. Hukuk ekibinin patron ile iletişim kurması gerekli.

**Sonuç:** Uygun işaretleme. Hukuk ekibinin patron ile tamamlamış adres iletişimini yapması şarttır.

---

### ⚠ F-4: MERSİS Numarası Boş (PATRON VERISI BEKLENIYOR)

**Bulgu:** MERSİS alanı "............................." (boş). Patron bu veriyi sunmamıştır.

**Etki:** Ticaret siciline kayıt gerekli.

**Durum:** Raporda belirtildi, uygun işaretleme.

**Sonuç:** Patron tarafından tedarik edilmesi gerekli.

---

### ⚠ F-5: Hukuk Seçimi Boş (IMZA ÖNCESİ SEÇILECEK)

**Bulgu:** DPA 13. maddede iki seçim alanı:

- **13.2 Uygulanacak Hukuk:** `[HUKUKÇU: Seçilenler — (A) Türkiye Cumhuriyeti hukuku, (B) ... (C) ... (D) ... Seçim satırına yazınız: ..................]` — BOŞ
- **13.3 Yetkili Mahkeme:** `[HUKUKÇU: Seçilenler — (A) Samsun Mahkemeleri ve İcra Daireleri, (B) ... (C) ... (D) ... Seçim satırına yazınız: ..................]` — BOŞ

**Etki:** DPA imza öncesi seçim yapılması şarttır. Bu alanlar boş ise sözleşme tamamlanmamıştır.

**Durum:** SE-FB raporu (R-3) bunu belirtmiş ve "hukuk ekibi A/B/C/D'den birini seçmeli" demiştir. Doğru aksiyonlanmıştır.

**Sonuç:** Hukuk ekibinin seçimi yapması şarttır. Seçim satırları doldurulmalıdır.

---

### ⚠ F-6: Yurt Dışı Aktarım Dayanakları Eksik (HUKUK İNCELEMESİ GEREKLİ)

**Bulgu:** DPA 7.3. madde (Yurt dışına aktarım):

> "Bu dayanakların her alt işleyen için bugün tamamlandığı Veri İşleyen tarafından doğrulanmamıştır; standart sözleşme imzalanıp Kurum'a bildirilmiş değildir."

**Taraf:**
- ABD'deki alt işleyenler: Anthropic, OpenAI, Stripe, Google
- AB'deki alt işleyenler: PostHog (devre dışı)
- Türkiye'deki: Vulut, iyzico

**Etki:**
- **AB müşteriler:** GDPR md.45 (DPF sertifikası) veya md.46 (SCC) gerekli
- **TR müşteriler:** KVKK md.9 (Standart sözleşme + Kurum bildirimi) gerekli

**Durum:** SE-FB raporu (R-4) bu bulguyu belirtmiş ve "belgeler/sertifikalar imzalanmamıştır" demiştir.

**Sonuç:** Hukuk ekibinin her alt işleyen için dayanakları doğrulaması ve belgelerini (SCC, DPF sertifikası) toplaması şarttır.

---

### ✓ F-7: i18n Test Geçişleri (UYUMLU)

**Bulgu:** SE-FB raporu `npm run i18n:check` çıktısını sunmuş:
```
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```

**Kontrol:** i18n-baseline.json dosyası güncellendi (commit'te görünür).

**Sonuç:** İnceleme süresi (03.10.2026) i18n kontrol geçilmiş ✓

---

### ✓ F-8: Git Commit Tutarlılığı (UYUMLU)

**Commit:** `33af243c` (Claude BE-FB, 2026-10-03 01:36:07 +0300)

**Mesaj:**
```
TASK-MUPIQY1GFTRE2#y1: Update DPA with patron data (Y-1)

- Processor address: Karasamsun Mahallesi, İlkadım, SAMSUN [tamamlanacak]
- Processor tax number: 29120352230 (11 digits; standard is 10 — noted for legal review)
- R2 storage location: Amsterdam (Western Europe)
- Updated both tr and en versions consistently
- i18n baseline updated post-change
```

**Dosya Değişiklikleri:**
- `docs/legal/dpa-en.md` — 6 satır değişti (4 satır ekle, 2 satır sil)
- `docs/legal/dpa-tr.md` — 6 satır değişti (4 satır ekle, 2 satır sil)
- `i18n-baseline.json` — 2 satır değişti (1 satır ekle, 1 satır sil)

**Tutarlılık Kontrol:**
- ✓ Commit mesajı alanlar ile eşleşiyor
- ✓ VKN 11 hane uyarısı mesajda belirtilmiş
- ✓ Co-authored-by satırı doğru
- ✓ İki DPA dosyası satır-satır aynı değişiklik aldı

**Sonuç:** Commit teknik olarak uygun.

---

### ✓ F-9: Veri Doğrulama (UYUMLU)

**Kontrol:** Patron verisi rapor tablosunda şu:
- Unvan: Fonbridge Ltd. Şti. ✓ (önceden öyle yazılı)
- Adres: Karasamsun Mahallesi, İlkadım, SAMSUN ✓ (patron sundu)
- VKN: 29120352230 ✓ (patron sundu; 11 hane notu var)
- R2: Amsterdam (Western Europe) ✓ (doğru ülke)

**UYDURMA VERİ:** Yok. "[tamamlanacak]" işaretleri eksik alanları gösteriyor.

**Sonuç:** Veri bütünlüğü uygun.

---

## Açık Sorular

1. **VKN 11 Hanesi Normal mi?** Hukuk ekibinin patron/muhasebe ile teyit etmesi gerekli. Çözüm: Patron imzasından önce teyit raporu.

2. **Adres Tamamlama Takvimi?** Patron ile sokak, kapı, posta kodu iletişimi ne zaman bitmeli? Rapor'da "hukuk ekibi patron ile iletişim kurmalı" deniyor.

3. **13.2 ve 13.3 Seçimi:** Kimin karar vereceği (patron, hukuk ekibi veya sistem sahibi)? Rapor'da "hukuk ekibi seçmeli" deniyor.

4. **7.3 Aktarım Dayanakları:** Hangi alt işleyenin hangi dayanağı (DPF/SCC/KVKK) kullanacağı ve hangi sertifikalar gerekli? Rapor'da detay yok ama açık kalıyor.

5. **DPA v1.4 Yayın Takvimi:** Hukuk açıkları kapandıktan sonra sürüm numarası güncellenmeli ve Sürüm Geçmişi yeniden yapılmalı.

---

## Bloke Edici Bulgular

**BLOKE EDICI HATA YOK.** Şu açıklar imza öncesi hukuk ekibi tarafından kapatılmalı:

1. ✅ Patron VKN teyiti (11 hanesi)
2. ✅ Patron adres tamamlaması (sokak, kapı, posta kodu)
3. ✅ Patron MERSİS numarası
4. ✅ Hukuk ekibi 13.2 seçimi (uygulanacak hukuk)
5. ✅ Hukuk ekibi 13.3 seçimi (yetkili mahkeme)
6. ✅ Hukuk ekibi 7.3 aktarım dayanakları (GDPR md.46 SCC / KVKK md.9)

---

## Değişen Dosyalar

Commit 33af243c'de:
- `docs/legal/dpa-tr.md`
- `docs/legal/dpa-en.md`
- `i18n-baseline.json`

---

## Riskler

### R-1: VKN Standart Dışı (ORTA)

**Senaryo:** VKN 11 haneli olarak DPA'ya yazıldı. Fatura ve vergi kayıtlarında kullanılırsa geçersiz sayılabilir.

**Düzeltme:** Patron ile teyit etmek (muhasebe) veya TL (Ticaret Licencesi) ile doğrulamak.

---

### R-2: Adres Eksik (ORTA)

**Senaryo:** DPA imzalandıktan sonra patron eksik adres verdiğini söylerse (örn. "sokak yok"), resmi belgede adres yetersiz kalabilir.

**Düzeltme:** İmza öncesi patron tarafından tamamlanmış adres yazılmalıdır.

---

### R-3: Hukuk Seçimi Belirsiz (ORTA)

**Senaryo:** Seçim yapılmadan imza atılırsa, uyuşmazlık durumunda hangi mahkeme yetkili olacağı belirsiz kalır.

**Düzeltme:** İmza öncesi 13.2 ve 13.3 seçim yapılmalıdır.

---

### R-4: Aktarım Dayanakları Eksik (YÜKSEK)

**Senaryo:** DPA imzalandıktan sonra hukuk açısından SCC/DPF belgeleri bulunmadığı fark edilirse, Türkiye KVKK Kurumu tarafından ceza doğabilir.

**Düzeltme:** İmza öncesi GDPR md.46 SCC ve KVKK md.9 belgelerini toplamak (Anthropic, OpenAI, Stripe, Google için).

---

## Sonraki Adımlar

1. **Hukuk Ekibi:**
   - Patron ile VKN, adres, MERSİS teyidi (30.10.2026'ye kadar tamamlamak)
   - 13.2 ve 13.3 seçim yapma
   - 7.3 Aktarım dayanakları doğrulama (Anthropic, OpenAI, Stripe, Google SCC/DPF)

2. **SE-FB:**
   - Hukuk ekibinden geribildirim alıp DPA v1.4 hazırlamak
   - Sürüm geçmişini güncelleme
   - i18n:check tekrar çalıştırma

3. **Sonrasında:**
   - DPA v1.4 yayınlama
   - İmza Töreni + tarafların imzası

---

## Kontrol Listesi (DoD)

- [x] Patron verileri git commit'te bulunuyor
- [x] Türkçe ve İngilizce satır satır eşleşik
- [x] i18n:check başarılı (gözden geçirme süresi)
- [x] TR/EN "[tamamlanacak]" işaretleri tutarlı
- [x] Eksik alanlar açıkça işaretlendi (MERSİS boş, hukuk seçimi seçim listeli)
- [x] VKN 11 hanesi raporlandı
- [x] Adres eksiklikleri raporlandı
- [x] Aktarım dayanakları durumu raporlandı
- [x] Hiçbir UYDURMA veri yok
- [x] Git commit uygun (co-author doğru)
- [ ] Hukuk ekibi aksiyonlarını yapacak
- [ ] DPA v1.4 yayınlanacak

---

## Özet

✅ **ONAY** — Teknik inceleme tamamlandı. SE-FB'nin işi doğru ve uygulanabilir. Hukuk ekibinin 6 açık kalemini kapatması gerekli.

---

**Gözden Geçiren:** CRW2-FB (Kod İnceleme Uzmanı)  
**Gözden Geçirilen Görev:** TASK-MUPIQY1GFTRE2#y1  
**Yazar Raporu:** TASK-MUPIQY1GFTRE2-se-fb-5.md  
**Tarih:** 2026-10-03  
**Commit:** 33af243c  
**Dal:** `se-fb/p6-dpa-signable`
