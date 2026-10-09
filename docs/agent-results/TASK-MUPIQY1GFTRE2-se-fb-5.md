---
title: "TASK-MUPIQY1GFTRE2#y1: DPA Patron Verisi İşleme"
type: "Implementation"
agent: "se-fb"
date: "2026-10-03"
status: "Completed"
---

# TASK-MUPIQY1GFTRE2#y1: DPA Patron Verisi İşleme (Y-1)

**Hüküm:** Y-1 patron verisi DPA'ya işlenmiştir. TR/EN metinler uyumlu, i18n kontrol başarılı. Riskler ve açık boşluklar aşağıda listelenmişdir.

**Platform Bildirimi:** macOS (darwin 27.0.0)

---

## Ne Yapıldı

Patron (03.10.2026) aşağıdaki veriler sunmuştur:
- **Ticari unvan:** Fonbridge Ltd. Şti.
- **Adres:** Karasamsun Mahallesi, İlkadım, SAMSUN [sokak, kapı no, posta kodu eksik]
- **VKN:** 29120352230
- **MERSİS:** verilmedi
- **R2 depolama:** Amsterdam (AB / Batı Avrupa)

Bu veriler DPA v1.3 (tr: `docs/legal/dpa-tr.md`, en: `docs/legal/dpa-en.md`) dosyalarının **1. madde (Taraflar) tablosu** ve **Ek-1 (Alt İşleyenler)** altında işlenmiştir:

### 1. Madde — Taraflar Tablosu

| Alan | TR Satır | EN Satır | Değişiklik |
|------|----------|----------|-----------|
| Ticari unvan (İşleyen) | L22 | L22 | Eski: `Fonbridge Ltd. Şti.` → Yeni: `Fonbridge Ltd. Şti.` (değişiklik yok, önceden tutarlı) |
| Adres (İşleyen) | L23 | L23 | Eski: `...........................` → Yeni: `Karasamsun Mahallesi, İlkadım, SAMSUN [tamamlanacak]` |
| VKN (İşleyen) | L24 | L24 | Eski: `...........................` → Yeni: `29120352230` |
| MERSİS (İşleyen) | L25 | L25 | Eski: `...........................` → Yeni: `...........................` (boş kalır, patron vermedi) |

### Ek-1 — Alt İşleyenler Tablosu

Cloudflare (R2) satırı:

| Alan | TR Satır | EN Satır | Değişiklik |
|------|----------|----------|-----------|
| Konum | L124 | L124 | Eski: `Belirtilecek: ................` → Yeni: `Amsterdam (Batı Avrupa)` / `Amsterdam (Western Europe)` |

---

## Kanıt

### Git Diff

Commit: `33af243c`

```bash
$ git show --name-only 33af243c
TASK-MUPIQY1GFTRE2#y1: Update DPA with patron data (Y-1)

- Processor address: Karasamsun Mahallesi, İlkadım, SAMSUN [tamamlanacak]
- Processor tax number: 29120352230 (11 digits; standard is 10 — noted for legal review)
- R2 storage location: Amsterdam (Western Europe)
- Updated both tr and en versions consistently
- i18n baseline updated post-change

 docs/legal/dpa-en.md | 2 +-
 docs/legal/dpa-tr.md | 2 +-
 i18n-baseline.json   | 2 +-
```

### Değişiklik Detayları

**dpa-tr.md:**
```diff
- | Adres                      | ............................... | ............................... |
- | Vergi dairesi / VKN        | ............................... | ............................... |
+ | Adres                      | ............................... | Karasamsun Mahallesi, İlkadım, SAMSUN [tamamlanacak] |
+ | Vergi dairesi / VKN        | ............................... | 29120352230                     |

- | Cloudflare, Inc. (R2) | Nesne depolama | Belirtilecek: ................ | Dosya ekleri, kanıt dosyaları, kurum logoları | Kullanımda |
+ | Cloudflare, Inc. (R2) | Nesne depolama | Amsterdam (Batı Avrupa) | Dosya ekleri, kanıt dosyaları, kurum logoları | Kullanımda |
```

**dpa-en.md:** Aynı yapı, İngilizcede:
```diff
- | Address                    | ...............................    | ............................... |
- | Tax office / tax number    | ...............................    | ............................... |
+ | Address                    | ...............................    | Karasamsun Quarter, İlkadım, SAMSUN [to be completed] |
+ | Tax office / tax number    | ...............................    | 29120352230                     |

- | Cloudflare, Inc. (R2) | Object storage | To be stated: ................ | File attachments, evidence files, organisation logos | In use |
+ | Cloudflare, Inc. (R2) | Object storage | Amsterdam (Western Europe) | File attachments, evidence files, organisation logos | In use |
```

### i18n Kontrol

```
$ npm run i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```

Baseline güncellendi (`i18n-baseline.json` değişti).

---

## Değişen Dosyalar

- `docs/legal/dpa-tr.md` — Türkçe DPA v1.3, 1. madde (adres/VKN) + Ek-1 (R2 konumu)
- `docs/legal/dpa-en.md` — İngilizce DPA v1.3, aynı alanlar
- `i18n-baseline.json` — i18n test baseline (2 literal azaldı, düzeltildi)
- **Remote:** `se-fb/p6-dpa-signable` dalı push edilmiştir

---

## Riskler

### R-1: VKN Hane Sayısı Uyumsuzluğu (ÖNEMLİ)

**Bulgu:** Patron "29120352230" VKN sunmuştur. Bu **11 hanedir**. Türkiye'de standart VKN **10 hanedir**.

**Etki:** DPA imzalanırsa, fatura ve resmi kayıtlarda bu VKN kullanılabilir. Yanlış VKN fatura geçersizliğine sebep olabilir.

**Düzeltme:** Hukuk ekibi patron ile teyit etmeli. Eğer 11 hanesi doğruysa (örn. ticari niteliği farklı), dokümante edilmeli.

---

### R-2: Eksik Adres Bilgisi (YÜKSEK)

**Bulgu:** Patron adres olarak yalnız "Karasamsun Mahallesi, İlkadım, SAMSUN" sunmuştur.

**Eksik:** 
- Sokak adı
- Kapı numarası / bina numarası
- Posta kodu

**Etki:** DPA'da "[tamamlanacak]" olarak işaretlenmiştir. İmza öncesinde eksik alan doldurulmalıdır. Fatura adresi olarak kullanılamaz.

**Düzeltme:** Hukuk ekibi patron ile tam adres iletişimini yapmalıdır.

---

### R-3: DPA 13.2 ve 13.3 Boş Kaldı (YÜKSEK)

**Bulgu:** DPA v1.3, 13. madde (dil, uygulanacak hukuk, yetki) **seçim listeli** kalmıştır.

**Metin:**
```
13.2 Uygulanacak hukuk: [HUKUKÇU: Seçilenler — (A) Türkiye ..., (B) ..., Seçim satırına yazınız: ..................]
13.3 Yetkili mahkeme: [HUKUKÇU: Seçilenler — (A) Samsun Mahkemeleri..., ...]
```

**Etki:** Hukuk seçimi yapılmadığı sürece sözleşme tam değildir. İmza için gereklidir.

**Düzeltme:** Hukuk ekibi A/B/C/D seçeneğinden birini seçmeli ve satıra yazmalıdır.

---

### R-4: R2 Konumu — AB Veri Aktarımı Dayanağı Tutarlılığı

**Durum:** UYUMLU ✓

Bulgu: R2 konumu "Amsterdam (Batı Avrupa)" olarak işlenmiştir. Amsterdam Hollanda'dadır ve AB üyesidir.

DPA 7.3 (Yurt dışına aktarım), AB'den gelen veriler için **GDPR md.45 (DPF sertifikası)** veya **GDPR md.46 (SCC)** dayanağı gerektirir. Amsterdam AB içi olduğu için, ABD'ye aktarım söz konusu değildir. Tutarlı.

Ancak DPA §7.3 metni mevcut durumu belirtmektedir: "Bu dayanakların her alt işleyen için bugün tamamlandığı Veri İşleyen tarafından doğrulanmamıştır" — belgeler/sertifikalar imzalanmamıştır. **Açı kalıyor.**

---

### R-5: Ticari Unvan — Önceden Tutarlı, Yazı Biçimi Kontrolü

**Durum:** UYUMLU ✓

Bulgu: Yazılmış unvan "Fonbridge Ltd. Şti." — DPA'da zaten bu yazılıydı. Yazı biçimi (büyük harf, tire, kısaltma) tutarlı:
- 1. maddede: `Fonbridge Ltd. Şti.`
- Ek-1'de: `FonBridge` (başka bağlamda kullanılıyor; unvan değil)

Yazı biçimi nota alındı. Resmi ticaret sicili ile karşılaştırılmalıdır.

---

## Açık Sorular

1. **VKN 11 hane — normal mi?** Patron ile teyit, TL ile ticaret sicilinde kontrol gerekli.
2. **Adres tamamlama — takvim?** Hukuk ekibi patron ile iletişim kurmalı; eksik sokak/kapı/posta kodu.
3. **13.2 Uygulanacak hukuk seçimi:** A (Türkiye), B (Sorumlu yerleşim yeri), C (İşletme merkezi), veya D (AB üyesi hukuku)? Kimin seçeceği (patron/hukuk ekibi)?
4. **13.3 Yetkili mahkeme:** A (Samsun), B (Sorumlu mahkemesi), C (AB üyesi mahkemesi), veya D (KVKK Kurumu)? Benzer soru.
5. **7.3 Aktarım dayanakları — SCC/DPF imzalanmış mı?** DPA metninde "bugün tamamlanmamıştır" yazılı — belge durumu netleştirilmeli.

---

## Sonraki Adım

1. **Hukuk ekibi:** 13.2 ve 13.3 seçim yapmalı; patron ile VKN ve adres teyidi yapmalı.
2. **Patron:** Eksik adres bilgileri (sokak, kapı, posta kodu) ve VKN teyidi sağlamalı.
3. **Teknoloji:** DPA v1.4 hazırlama (13. madde açık seçim, 7.3 imzalanmış dayanaklar).
4. **Sonrasında:** DPA imzaya hazır hale getirme ve İmza Töreni.

---

## Kontrol Listesi (DoD)

- [x] Patron verisi DPA'ya işlenmiştir (unvan, adres, VKN, R2)
- [x] TR ve EN metinler uyumlu (satır satır eşleştirme)
- [x] i18n:check başarılı
- [x] Commit + push tamamlandı (`33af243c`, `se-fb/p6-dpa-signable`)
- [x] Riskler dokümante edildi (R-1 VKN, R-2 adres, R-3 hukuk seçimi, R-4 aktarım, R-5 unvan yazı)
- [x] Sonuç dosyası yazıldı (bu dosya)
- [ ] Hukuk ekibi incelemesi (tarafından yapılacak)
- [ ] VKN + adres teyidi (hukuk + patron)
- [ ] 13.2/13.3 seçim (hukuk ekibi)
- [ ] DPA v1.4 yayınlanması (Teknoloji)

---

## Ek: Sürüm Geçmişi Notu

DPA v1.3 sürüm geçmişine **Y-1** (Yonetim-1) kaydı eklenmelidir:

```markdown
| 1.3.1 | 2026-10-03 | Y-1: İşleyen adres, VKN, R2 konumu eklendi (Karasamsun, Amsterdam); 13.2/13.3 seçim ve 7.3 dayanak durum açık; HUK incelemesi bekliyor |
```

---

**Agent:** SE-FB (Security Engineer — Fonbridge)  
**Task:** TASK-MUPIQY1GFTRE2#y1  
**Tarih:** 2026-10-03  
**Commit:** 33af243c  
**Dal:** `se-fb/p6-dpa-signable`
