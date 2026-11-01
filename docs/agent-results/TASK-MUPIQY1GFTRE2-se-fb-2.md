---
görev: TASK-MUPIQY1GFTRE2
ajan: se-fb
tip: karar
hüküm: Bitti: Y-2, Y-3, Ö-1 kapandı (tr/en birlikte, madde madde eşleşik, 15'er ## başlık). Y-1 patron bilgisini bekliyor, alanlar boş bırakıldı; 13.3 yetki satırı ve 7.1'deki 30 gün patron teyidi bekliyor. DPA bu haliyle hâlâ imzaya gitmez (Y-1).
platform: mac (Darwin 27.0). İş yalnız markdown; platforma bağlı kod yolu yok. Windows ve Linux'ta koşmadım, gerek yok.
sürüm: 2
---

# DPA v1.2 düzeltme turu (se-fb) — dal `se-fb/p6-dpa-signable`

Hukukçu kontrolü önerilir: içerik hukuki tavsiye değildir.

## 1. Ne yapıldı

| Bulgu | Karşılık | Konum (dpa-tr.md; dpa-en.md aynı satırlar) |
|---|---|---|
| Y-2 | Yeni **13. madde**: 13.1 Türkçe metin geçerli ("Turkish version shall prevail"), 13.2 Türkiye hukuku, 13.3 İstanbul (Merkez) Mahkemeleri ve İcra Daireleri | 112-116 |
| Y-3 (b) personel gizliliği | 5. madde yeni madde işareti (GDPR md.28(3)(b), KVKK md.12/1, 12/4) | 64 |
| Y-3 (c) güvenlik | 5. madde (GDPR md.32, KVKK md.12/1) | 65 |
| Y-3 (d) + md.28(4) | 7.1 önceden bildirim ve itiraz, 7.2 aynı yükümlülüklerin alt işleyene yüklenmesi | 79-80 |
| Y-3 aktarım dayanağı | 7.3: AB için DPF/SCC (GDPR md.45/46), Türkiye için KVKK md.9 (standart sözleşme + Kurum'a bildirim) | 81 |
| Y-3 (e) veri sahibi talepleri | 4. madde sonunda yardım paragrafı | 56 |
| Y-3 (f) | 8. madde: md.32-36 yardımı, KVKK md.12/5 | 85 |
| Y-3 (g) | 6.2 başına "iade ya da silme, Sorumlu'nun tercihi" | 71 |
| Y-3 (h) | 9. madde: bilgi sağlama + yerinde denetim, KVKK md.12/3 | 89 |
| Ö-1 | 5. madde son madde: model eğitimi yok iddiasının dayanağı sağlayıcıların yayımlanmış ticari şartları, ayrı imzalı ek yok, sağlayıcı saklama olabilir (OpenAI embeddings 30 güne kadar), "saklama sıfır" taahhüdü yok | 66 |
| Sürüm | 1.1 → 1.2, Sürüm Geçmişi satırı eklendi | 3, 12 |

## 2. Kanıt

- `grep -c '^## '` → dpa-tr.md **15**, dpa-en.md **15** (önce 14).
- `git diff --stat` (commit öncesi): dpa-en.md 27 satır, dpa-tr.md 27 satır (42 ekleme, 12 silme). Başka dosya değişmedi.
- Madde numaraları (4, 5, 6.2, 7.1-7.3, 8, 9, 13.1-13.3) iki dosyada aynı satırlarda (grep çıktısı satır numaralarıyla doğrulandı).
- Y-1 alanları (Ticari unvan, Adres, VKN, MERSİS, R2 konumu "Belirtilecek") elle dokunulmadı, hâlâ boş.

## 3. Değişen dosyalar
`docs/legal/dpa-tr.md`, `docs/legal/dpa-en.md`, bu rapor. `HUKUK-SORULARI-2026-09.md`'ye dokunmadım (sürümlü büyük paket); kontrol listesi aşağıda §5.

## 4. Riskler ve patron teyidi bekleyenler
- **13.3 İstanbul (Merkez) yetkisi: patron teyidi bekliyor.** Metne not düşmedim (imzalanabilir metin temiz kalsın); teyit sonrası değişmesi gerekirse yalnız 13.3.
- **7.1 "en az 30 gün" ve "itiraz halinde hizmeti sona erdirme" benim önerimdir**, patron kararı değil. Teyit ya da değişiklik gerekir.
- **7.3 aktarım dayanağı bir yükümlülük tanımıdır; mevcut durumun beyanı değildir.** Kodda/dosyada Anthropic, OpenAI, Stripe, Google ile imzalı SCC ya da DPF sertifikası ve KVKK md.9 standart sözleşme bildirimi yapıldığını doğrulamadım. Yapılmadıysa metin Veri İşleyen için yerine getirilmemiş bir yükümlülük içerir. İmzadan önce durum netleşmeli.
- 7.2 de aynı: alt işleyenlerle (özellikle Vulut, imzalı sözleşme yok: HUKUK-SORULARI satır 339) yazılı veri koruma sözleşmesi bugün yok. Metin bunu yüklüyor.
- Cloudflare R2 konumu boş olduğu için 7.3 R2'yi kapsamaz.
- KVKK madde atıfları (md.9 aktarım, md.12/3-5) kendi bilgimle yazıldı, güncel metinle hukukçu kontrol etmeli (md.9 2024'te değişti).

## 5. Açık sorular / hukukçuya (Y-1 dâhil)
1. **Y-1 (patron):** FonBridge ticari unvanı, adres, vergi dairesi/VKN, MERSİS no, Cloudflare R2 bölgesi. Uydurmadım.
2. Patron: 13.3 İstanbul teyidi; 7.1 süre (30 gün) ve fesih hakkı uygun mu.
3. Hukukçu: md.28(3) metinleri eksiksiz mi; DPF/SCC ve KVKK md.9 mekanizmasının her sağlayıcı için fiilen hazır olması; 5. maddedeki "model eğitimi yok" ifadesi bu dayanakla yeterli mi; Türkçe-geçerli kuralının AB'li müşteriyle kabul edilebilirliği (GDPR tarafında sorumlu yerel hukuk istenebilir).
4. Sürüm geçmişindeki iki "1.0" satırı (Ö-3) ve kaşe satırı (Ö-4) bu turda kapsam dışı kaldı.

## 6. Sonraki adım
Patron Y-1 bilgisini ve §4 teyitlerini verir → se-fb alanları doldurur, v1.3 → hukukçu kontrolü → imza. `docs/SECURITY_COMPLIANCE.md:140` "saklama sıfır" ifadesi ayrıca düzeltilmeli (TASK-MUPA6S5JGGG88), bu kartın dosya kapsamı dışında.
