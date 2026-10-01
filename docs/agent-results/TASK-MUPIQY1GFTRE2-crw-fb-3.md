---
görev: TASK-MUPIQY1GFTRE2 (ortak inceleme: TASK-MUPA6S5JGGG88-crw-fb-3.md ile aynı içerik)
ajan: crw-fb
tip: inceleme (yeniden inceleme, tur 3)
hüküm: ONAY — Kart 1: Y-1/Y-2/Y-3 kapandı. Kart 2: Y-4 kapandı, tr/en eşleşik, `İstanbul` 0. DPA, bloke-patron kalemleri dışında imzaya hazır → ONAY (KOŞULLU). Bloke eden kod/metin hatası yok. Hukuki görüş değildir.
platform: mac (Darwin 27.0). Belge + git okuma + grep; kod çalıştırılmadı. Platforma bağlı kod yolu yok; Windows/Linux koşulmadı (iş okumaydı).
sürüm: 3
---

# TASK-MUPA6S5JGGG88 / TASK-MUPIQY1GFTRE2 — se-fb düzeltmeleri, yeniden inceleme

Dal `se-fb/p6-dpa-signable` @ `d73bcfb1` (ana checkout; değiştirilmedi). İncelenen: cf4ce332 (se-fb-2) ve d73bcfb1 (se-fb-3). Belge DEĞİŞTİRİLMEDİ.

## 1. Kart 1 — önceki bulgular

| Bulgu | Durum | Kanıt |
|---|---|---|
| Y-1 hüküm satırı | **KAPANDI** | `/Users/macbook/alan/docs/agent-results/TASK-MUPA6S5JGGG88-se-fb.md:1-2`: "**Hüküm:** REDDEDİLDİ/GEÇERSİZ — … yerine `…-se-fb-2.md` geçerlidir (hüküm: DÜZELTİLDİ)" + tip/platform satırı. Geçerli sürümün (`-se-fb-2.md`) hükmü "DÜZELTİLDİ". Not: eski dosyanın gövdesi hâlâ yanlış cümleyi taşıyor ama başındaki uyarı "KULLANILMAMALI" diyor; kabul. |
| Y-2 SECURITY_COMPLIANCE.md:140 | **KAPANDI, gerçeğe uygun** | `git diff cf4ce332~1 cf4ce332 -- docs/SECURITY_COMPLIANCE.md`: eski "eğitim için kullanım kapalı, veri saklama sıfır/minimum; sözleşme ekinde" → yeni "…yayımlanmış ticari hizmet şartlarına dayanır; … ayrı bir ek sözleşme yoktur ve şartlar değişebilir. Sağlayıcılar … sınırlı süre saklayabilir (OpenAI metin gömme isteklerinde bugün 30 güne kadar); sıfır saklama taahhüt edilmez. Bkz. DPA 5. madde." Üç eski iddia (ek sözleşme / sıfır saklama / panel ayarı) de çıkmış; önceki turda curl ile doğruladığım OpenAI `/v1/embeddings` abuse-monitoring 30 gün satırıyla tutuyor. DPA 5. madde ile artık çelişmiyor (DPA tr:66 aynı cümle). |
| Y-3 D3 cümlesi | **KAPANDI** | `…/TASK-MUPA6S5JGGG88-se-fb-2.md:64` (TR): "Sağlayıcılar, gönderilen içeriği kendi şartlarına göre sınırlı süre saklayabilir (OpenAI arama istekleri için bugün 30 güne kadar); saklamanın sıfır olduğunu söylemiyoruz." `:67` (EN) aynı: "Providers may retain content … up to 30 days today; we do not say that retention is zero." İmzalı DPA yok ifadesi de cümlede. |

## 2. Kart 2 — DPA v1.2 (cf4ce332 + d73bcfb1)

**Y-4 (7.2/7.3 ↔ 5. madde çelişkisi): KAPANDI.** `git diff cf4ce332~1 d73bcfb1 -- docs/legal`:
- 7.2 artık "bugün … ayrı bir veri işleme sözleşmesi yoktur (5. maddenin son bendine bakınız)"; dpa-tr.md:66 (5. madde) aynı olguyu söylüyor. Eski "her alt işleyene yazılı sözleşmeyle yükler" iddiası gitti. `grep yükle|impose` DPA'da başka bir "yazılı yükleme" iddiası bırakmadı.
- 7.3 "öngörülen dayanak" + "bugün doğrulanmamıştır; standart sözleşme imzalanıp Kurum'a bildirilmiş değildir" + talep üzerine yazılı bildirim. Tarihli taahhüt (rakam) yok → uydurma yok. GDPR md.28(4)/KVKK md.12 atfı korunmuş.

**tr/en eşleşik:**
```
## sayısı        : tr 15 · en 15 (başlık sayısı eşit)
grep -c İstanbul|Istanbul docs/legal/dpa-tr.md → 0 ; dpa-en.md → 0
dpa-tr.md:116  13.3 … Samsun Mahkemeleri ve İcra Daireleri yetkilidir.
dpa-en.md:116  13.3 … The Samsun Courts and Enforcement Offices have jurisdiction …
dpa-tr.md:21   Ticari unvan            | … | Fonbridge Ltd. Şti.
dpa-en.md:21   Registered legal name   | … | Fonbridge Ltd. Şti.
git diff cf4ce332..d73bcfb1 --stat (docs/legal): yalnız 4 satır (tr:21, tr:116, en:21, en:116)
```
(Not: "İstanbul" kalan geçişler `Europe/Istanbul` saat dilimi kodu ve `privacy-notice-gap-analysis.md` içindeki kaldırılmış pazarlama metni — DPA kapsamı dışı.)

## 3. Bulgular (önem sırasıyla)

Bloke eden: **yok.**

- **Ö-1 (öneri, küçük) — Unvan yazımı repoda tutarsız: `Fonbridge Ltd. Şti.` ↔ `FonBridge Ltd. Şti.`.** DPA'ya patronun bu turdaki yazımı girilmiş; `docs/EFATURA_SETUP.md:38` (patron kararı 2026-09-08), `agency-channel-notice-addendum.md:29`, `privacy-notice-gap-analysis.md:212/280`, `HUKUK-SORULARI-2026-09.md:249` "FonBridge Ltd. Şti." diyor. Sicildeki yazım teyit edilmeden imzalanırsa DPA ile fatura/aydınlatma unvanı farklı olur. se-fb-3 §4/§5 bunu "sicilde birebir mi" diye zaten soruyor; ben yazım farkını (büyük B) somut olarak ekliyorum. → **bloke-patron** (aşağıda).
- **Ö-2 (öneri) — Sürüm geçmişi 1.2 satırı 7.2/7.3 yeniden yazımını ve 13.3/unvan değişikliğini anmıyor** (dpa-tr.md:12, dpa-en.md:12). Belge kendi tablosunda "1.0 … 7. madde değişti, sürüm numarası ve tarih güncellenmedi" hatasını kayda geçirmiş; aynı şey tekrar ediyor. 1.2 henüz imzalanmadıysa sürüm artırmak şart değil, ama 1.2 satırına "7.2/7.3 gerçek duruma çekildi; 13.3 Samsun; işleyen unvanı" yazılması ya da 1.3'e geçilmesi gerekir. 1.2 bir müşteriye gönderildiyse/yayımlandıysa (sayfa `/compliance/dpa` dosyayı okuyup yayımlıyor) 1.3 zorunlu. Doğrulayamadım: yayın/gönderim durumu — varsayım: gönderilmedi.
- **Ö-3 (öneri, önceki Ö-2 devamı) — `messages/tr.json:757` sayfa açıklaması "KVKK/GDPR uyumlu"**; 7.2/7.3 artık "doğrulanmadı" dediğinden bu başlık yayımdan önce hukukçu kontrolüne girmeli (kapsam dışı bırakılmış, se-fb-2 §4'te işaretli).
- **Not — 7.2/7.3 hukukçu teyidi:** "ticari şartlara referansla dahil DPA = yazılı sözleşme mi" sorusu açık (se-fb-2 §4). Metin dürüst; hukuki yeterlilik hükmü benim değil.

## 4. BLOKE-PATRON (yazara yüklenmiyor)

Bilinçli boş, patron bilgisi bekliyor — se-fb'nin hatası DEĞİL:
1. İşleyen: Adres, Vergi dairesi/VKN, MERSİS no (tr/en tablo 22-24. satırlar, noktalı alan).
2. R2 bölgesi (Ek-1).
3. Ticaret sicilindeki tam unvan teyidi ve yazım (Ö-1).
4. 7.2/7.3 için tarihli taahhüt isteniyor mu (v1.3), sağlayıcı DPA/SCC/DPF fiilî durumu, OpenAI panel veri paylaşımı ayarı (se-fb-2 §5).
Müşteri (Veri Sorumlusu) sütunu imza anında doldurulacağı için boş olması doğru.

## 5. Karar

**ONAY (KOŞULLU).** Kart 1: Y-1/Y-2/Y-3 kapandı. Kart 2: Y-4 kapandı; tr/en eşleşik, `İstanbul` 0, 5. madde ↔ 7.2/7.3 tutarlı, uydurma rakam/taahhüt yok. Bu kalemler (§4) dışında DPA içeriği imzaya hazır; koşul: §4 bilgileri aynı iki dosyada eşleşik doldurulana ve Ö-2 (sürüm satırı) yapılana kadar imzaya gönderilmesin. Ö-1..Ö-3 bloke etmez.

## 6. Açık sorular / sonraki adım
Patron §4 bilgilerini verir → se-fb aynı iki dosyada eşleşik doldurur (v1.3) → hukukçu 7.2/7.3 + md.28(3) kontrol listesi.
