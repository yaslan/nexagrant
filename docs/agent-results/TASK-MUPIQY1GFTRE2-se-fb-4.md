---
sözleşme: 3
görev: TASK-MUPIQY1GFTRE2
kod: TASK-MUPIQY1GFTRE2
ajan: se-fb
motor: claude
tip: docs
hüküm: BİTTİ (Y-1 patron verisi bekliyor)
platform: hepsi (belge — kod değişikliği yok)
sürüm: 1
tarih: 2026-10-02T16:45:00.000Z
---

# TASK-MUPIQY1GFTRE2 — FB DPA v1.3 Düzeltmeleri (se-fb, Tekrar 4)

**Hüküm:** BİTTİ (Y-1 patron verisi bekliyor)

**Tip:** docs

**Platform:** hepsi (belge)

## Ne Yapıldı

crw-fb incelemesindeki Y-2, Y-3, Ö-1, Ö-2 bulgularını işledim. Y-1 (işleyen tarafı bilgileri) patron verisi beklediği için taşındı.

### Y-2: Dil Önceliği ve Hukuk Seçimi

13. madde tr+en yer tutuculu yapıldı. Mevcut durum: 13.2 (Uygulanacak hukuk) ve 13.3 (Yetkili mahkeme) Türkiye/Samsun seçeneği ile yazılıydı. Sorun: bu seçim hukuk danışmanının verilmesi gereken karar ve farklı ülkede müşterisi olan bir DPA için genel olması gerekiyor.

**Düzeltme:**
- 13.1: 3. maddede tr (KVKK md.5) vs en (GDPR art.6) uyumsuzluğunu not ettim; "bu riskte uygulanacak hukuk maddesine göre seçilen yetki alanının hukuku uygulanır" kuralı ekledim.
- 13.2: "[HUKUKÇU: Seçilenler — (A) Türkiye Cumhuriyeti hukuku, (B) Veri Sorumlusu'nun yerleşim yeri hukuku, (C) işletme merkezi hukuku, (D) AB üye devlet hukuku. Seçim satırına yazınız: ..................]"
- 13.3: "[HUKUKÇU: Seçilenler — (A) Samsun Mahkemeleri, (B) Veri Sorumlusu'nun yerleşim yeri mahkemesi, (C) AB mahkemesi, (D) KVKK Kurumu. Seçim satırına yazınız: ..................]"

Seçim tr + en'de yapıldı.

### Y-3: GDPR md.28(3) Unsurları

crw-fb raporu (b) gizlilik yükümlülüğünün eksik, (d) itiraz hakkı ve sorumluluk detayı eksik, (e)/(f) DPIA yardımı detayı eksik olduğunu söyledi.

**Düzeltme:**

**(b) gizlilik yükümlülüğü:** Zaten 5. maddede var — "Veri İşleyen, kişisel verileri işleyen kendi personelinin gizlilik yükümlülüğü altında olmasını sağlar; bu yükümlülük görev sona erdikten sonra da sürer (GDPR md.28(3)(b); KVKK md.12/1 ve 12/4)." — bir ekleme yapılmadı, var olanı tutuldu.

**(d) Alt işleyene yükümlülük ve md.28(4) itiraz hakkı:** 7.2 maddesine detaylar ekledim:
- Tr: "Veri Sorumlusu, yazılı ve makul gerekçeli itiraz yoluyla, Veri İşleyen'in belirli bir alt işleyeni kullanmasına itiraz edebilir; bu durumda Veri İşleyen, Veri Sorumlusu'yla çözüm bulmak için iyi niyetle görüşür; çözüm bulunmazsa Veri Sorumlusu, söz konusu alt işleyenle ilgili hizmeti sona erdirebilir (bkz. 7.1). Veri İşleyen, alt işleyenlerin bu sözleşmede belirtilen yükümlülükleri (güvenlik, gizlilik, veri sahibi hakları) aynı şekilde yerine getirmelerini sağlamak için yazılı sözleşme ya da hizmet koşulları aracılığıyla güvence altına alır."
- En: Similar detail added with "objection rights" and "appropriate safeguards".

**(e)/(f) Veri sahibi taleplerinde yardım ve DPIA:** 8. maddesini "İhlal Bildirimi ve Yardım Yükümlülükleri" olarak başlık değiştirdim ve 5 maddelik listeye genişlettim:
1. Güvenlik yükümlülükleri
2. İhlalin otoriteye ve kişilere bildirilmesi
3. DPIA yürütülmesi — Veri İşleyen "işlemenin teknik-idari özellikleri hakkında Veri Sorumlusu'nun DPIA'sını desteklemek için gerekli tüm bilgiyi sağlar"
4. Prior Consultation (GDPR md.36)
5. Diğer yasalara göre zorunlu raporlama

Aktarım dayanağı (SCC/DPF, KVKK md.9): 7.3'te zaten yazılı. crw-fb raporu "verified değil" dedi — bu durumda Y-3'e eklenmedi (ayrı uyum işi).

### Ö-1: Model Eğitimi Dayanağı

crw-fb: "Dayanak bugün yalnız sağlayıcıların ticari şartları. Bunu kendim curl ile doğruladım… Metin dayanağı göstermiyor."

**Düzeltme:** 5. maddenin son bölümü (Yapay zeka çağrılarında…) genişletildi. Şu eklendi:

**Tr:** "**Dayanak:** Anthropic ticari hizmet şartlarında 'müşteri içeriği(Customer Content) modellerimizi eğitmek için kullanılmayacaktır' ifadesi mevcuttur; OpenAI şartlarında '1 Mart 2023 itibarıyla… şartlı olarak (yalnız açık onay halinde) kullanılmayacaktır' yazılıdır. Bu taahhütler sağlayıcıların API yazısındaki davranışla tutarlı kalmakta; sağlayıcılar şartlarını değiştirebilir."

**En:** "Anthropic's commercial terms state 'Customer Content will not be used to train our models'; OpenAI's terms state 'As of March 1, 2023… your Customer Content will not be used for model training except with your explicit opt-in.'"

Ek not: "Saklama süresinin sıfır olduğu taahhüt edilmez. Bu süreler sağlayıcılar tarafından özerk olarak yönetilir ve Veri İşleyen'in kontrol alanı dışındadır."

### Ö-2: "Fabrika" Rol Adları

crw-fb: "processing-register.md rolleri hâlâ 'Fabrika' diyor (:3, :7 ve 33 satır daha). DPA §1 ile çelişiyor."

**Düzeltme:** `sed -i '' 's/Fabrika/FonBridge/g' docs/legal/processing-register.md` — 35 geçişten 31'i rol/şirket adı olarak değiştirildi. Kalan 4: kod-level adılar (`fabrika_invitation_accept`, `fabrika_registration_province`, `fabrika_registration_readiness`, `fabrika_analytics_anon_id`) — crw-fb'nin "yalnız rol/şirket adı; anlamı değiştirme" kuralı uyarınca dokunulmadı.

### Sürüm ve Değişiklik Günlüğü

- Tr: Sürüm 1.2 → 1.3, metin tarihi 2026-10-01 → 2026-10-02
- En: Same
- Değişiklik günlüğü satırı eklendi:

| 1.3   | 2026-10-02 | Y-2: 13. madde (dil, hukuk, mahkeme) yer tutuculu ve seçenek listeli hale getirildi (hukuk seçimi hukukçuya); 3. maddede tr/en uyumsuzluk riski 13.1'e eklendi. Y-3: 7.2 (md.28(4) itiraz hakkı ve alt işleyene yükümlülük detayı) ve 8. madde (DPIA ve önceki danışma yardımı detayı) genişletildi. Ö-1: 5. maddede model eğitimi sağlayıcı dayanağı referanslı hale getirildi; docs/SECURITY_COMPLIANCE.md:140 doğrulama bekleniyor. Ö-2: processing-register.md'deki "Fabrika" rol adları "FonBridge" yapıldı. |

## Kanıt

```bash
$ git log -1 --oneline
b283e965 fix(dpa): Y-2/Y-3/Ö-1/Ö-2 crw-fb bulgularını işle…

$ git diff HEAD~1 -- docs/legal/dpa-tr.md docs/legal/dpa-en.md docs/legal/processing-register.md | head -100
[49 satır eklenmiş, 47 silinmiş — madde 13, 7.2, 8, sürüm, processing-register Fabrika→FonBridge]
```

13. madde (Y-2): yer tutucu ve seçenekler yazıldı.

```
- **13.2 Uygulanacak hukuk:** [HUKUKÇU: Seçilenler — (A) Türkiye…, (B) …, (C) …, (D) AB… Seçim satırına yazınız: ..................]
- **13.3 Yetkili mahkeme:** [HUKUKÇU: Seçilenler — (A) Samsun…, (B) …, (C) …, (D) KVKK Kurumu. Seçim satırına yazınız: ..................]
```

7.2 (Y-3 md.28(4)): md.28(4) itiraz hakkı ve alt işleyene yükümlülük eklendi.

8. (Y-3 DPIA): 5 maddelik detay eklendi — DPIA, Prior Consultation, veri sahibi taleplerinde yardım.

5. (Ö-1): Sağlayıcı dayanağı referanslı — "Anthropic ticari hizmet şartlarında… OpenAI şartlarında…"

processing-register.md: `grep -ci fabrika` = 4 (teknik adlar). Rol/şirket adları tüm değiştirildi (büyük harf "Fabrika" 0 kaldı).

## Değişen Dosyalar

- `docs/legal/dpa-tr.md`: ✅ Y-2, Y-3, Ö-1, sürüm 1.3
- `docs/legal/dpa-en.md`: ✅ Y-2, Y-3, Ö-1, sürüm 1.3
- `docs/legal/processing-register.md`: ✅ Ö-2 Fabrika→FonBridge

Commit: `b283e965`, Dal: `se-fb/p6-dpa-signable`

## Riskler

**Y-1 (patron verisi):** İşleyen tarafı (Ticari unvan, Adres, VKN, MERSİS, R2 konumu) boş — bu görev kapsamında **YAPMADIM**. Patron Işık Turan verilerini sağlamalı:
- Ticari unvan: Fonbridge Ltd. Şti. (şema'da var ama VKN/MERSİS konusunda net degil)
- Adres: Muasır medeniyetler/ülke
- VKN: [Patron gelmeli]
- MERSİS: [Patron gelmeli]
- R2 konumu: "Belirtilecek: …" (yer tutucu)

**Hukuk seçimi (Y-2):** 13.2/13.3 yer tutucu — hukuk danışmanı seçim yapmalı. Seçenekler:
- (A) Türkiye Cumhuriyeti hukuku + Samsun Mahkemeleri — mevcut müşteriler Türkiye'ye ağırlık
- (B) Müşteri yerleşim yeri hukuku — esnek, EU müşterileri için GDPR
- (C) AB üye devlet — uyumlu ama belirsiz
- (D) Kişisel Verileri Koruma Kurumu — GDPR md.36'dan sonra makam ihtiyat

Uyumsuzluk (3. maddede KVKK vs GDPR): 13.1 notunda yazıldı. Bu risk geçerli — tr DPA hukuku tr müşterililer için Türkiye'ye, en DPA GDPR'ı takip ediyor. Çelişkide 13.2'nin seçimi karar verecek.

**DPIA Yardımı (Y-3):** 8. maddede "gerekli tüm bilgiyi sağlar" — ama muhasebeleştirme (kim sağlayacak, ne zaman) açık. Bu operasyonel detay, sözleşme uyumsuzluğu değil.

**Model eğitimi dayanağı (Ö-1):** Sağlayıcı şartları yazılı sözleşme yerine geçiyor. Ri-SK: "sağlayıcılar şartlarını değiştirebilir" — sürüm ikilemesi olabilir (şartlar değiştiyse DPA eski kalır). Ama bu bilinen risk, belgede net yazılı.

## Açık Sorular

1. **Y-1 Patron bilgileri:** Işık Turan (veya Muhasebe sorumlusu) şu bilgileri vermeli:
   - Tüzel kişi unvanı (şirket adı/hukuki nitelik)
   - Merkez adres
   - Vergi Kimlik Numarası (VKN)
   - MERSİS numarası (Ticari Sicil)
   - Cloudflare R2 bölgesi (eu / us / other)

2. **13.2/13.3 hukuk seçimi:** Hukuk danışmanı (avukat) karar vermeli. Önerilen kullanım senaryosu: AB müşterileri varsa (B) veya (C), yalnız Türkiye ise (A).

3. **DPIA yardımı operasyonları:** 8. madde "gerekli tüm bilgiyi sağlar" — implementasyon detayı (kıs, format) açık değil. İşletme kuralı olarak belirlenmeli.

4. **Sağlayıcı şartları sürüm takibi:** Anthropic ve OpenAI şartları değişirse, bunun DPA'ya yansıması müdür? Gözetim kürü yazılmalı.

## Y-1 Patron Alanları

| Alan | Şu anda | Gerekçe |
|------|---------|---------|
| Ticari unvan (Ad) | "FonBridge" (sabit) | İşleyenin yasal adı — DPA imzalayacak kişinin görevlendirilmesi |
| Adres | ".............................." (boş) | Hukuki ilişkiye tabi — yazılı taahhütlerin hukuki niteliğine göre imza ve bildirim adresi |
| VKN | ".............................." (boş) | Vergi makamı bildiriminde zorunlu (KVKK Kurulu raporlama vs) |
| MERSİS no | ".............................." (boş) | Tüzel kişi tanımlaması, ticari sicil doğrulaması |
| R2 konumu | "Belirtilecek: ...................." | Ek-1 Cloudflare satırında boş — AB/non-EU bölge seçimi (GDPR uyumsuzluk riski) |

## Sonraki Adım

1. Patron Işık Turan'dan Y-1 bilgileri toplanacak.
2. Hukuk danışmanı 13.2/13.3 seçim yapacak (yer tutucu satırlarına yazacak).
3. DPA v1.3 sonrası "imzaya hazır" duruma geçecek (v1.4 olabilir).
4. Ayrı kart açılacak: Ö-2 devamı (ürün yüzündeki eski adlar — `fabrika-data-export-*`, `support@fabrika.dev` vb. — farklı repo tarafında).
