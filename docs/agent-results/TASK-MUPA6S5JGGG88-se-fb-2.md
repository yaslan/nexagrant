---
görev: TASK-MUPA6S5JGGG88 (+ TASK-MUPIQY1GFTRE2)
ajan: se-fb
tip: düzeltme turu (belge)
hüküm: DÜZELTİLDİ — Y-1, Y-2, Y-3 (kart A) ve Y-4 (kart B) kapatıldı. Y-1 (kart B: unvan/adres/VKN/MERSİS/R2 bölgesi) patron bilgisi bekliyor, UYDURULMADI. DPA hâlâ imzaya hazır değil. Hukuki görüş değildir.
platform: mac (Darwin 27.0). Yalnız markdown düzenleme + grep; platforma bağlı kod yolu yok. Windows/Linux koşulmadı: kod değişmedi.
sürüm: 2
---
# Düzeltme turu — FB gizlilik/uyum + DPA

## 1. Ne yapıldı
- **A / Y-1:** `/Users/macbook/alan/docs/agent-results/TASK-MUPA6S5JGGG88-se-fb.md` başına hüküm + tip + platform satırı eklendi (geçersiz; yerine `-se-fb-2`).
- **A / Y-2:** `docs/SECURITY_COMPLIANCE.md:140` "eğitim kapalı, saklama sıfır/minimum; sözleşme ekinde" yerine: eğitim yok iddiası sağlayıcıların yayımlanmış ticari şartlarına dayanır, ayrı imzalı ek yok, sağlayıcı saklaması olabilir (OpenAI embeddings 30 güne kadar), sıfır saklama taahhüt edilmez; DPA 5. maddeye atıf.
- **A / Y-3:** `-se-fb-2.md` §3.1 D3 cümlesine (TR+EN) saklama ifadesi eklendi: sağlayıcılar içeriği sınırlı süre saklayabilir (OpenAI arama 30 güne kadar), "saklama sıfır" denmiyor.
- **B / Y-4:** `docs/legal/dpa-tr.md` / `dpa-en.md` 7.2 ve 7.3 bugünkü gerçeğe çekildi: 7.2 artık "bugün ayrı imzalı alt işleyen sözleşmesi yok, sağlayıcı şartlarına dayanır" diyor (5. madde son bendiyle tutarlı); 7.3 aktarım dayanağını "öngörülen" olarak yazıyor, DPF/SCC/KVKK md.9 standart sözleşmesinin bugün doğrulanmadığını ve imzalanıp Kurum'a bildirilmediğini açıkça söylüyor; fiilî durum talep üzerine yazılı bildirilir. Tarihli taahhüt (örn. "90 gün") bilerek YAZILMADI — rakam patron/hukuk kararı.

## 2. Kanıt
```
git diff --stat: SECURITY_COMPLIANCE.md 1 · dpa-en.md · dpa-tr.md
## sayısı: tr 15, en 15 (eşleşik)
grep '90' dpa-tr.md dpa-en.md → eşleşme yok (uydurma süre yok)
```
7.2/7.3 çelişki kontrolü: 5. madde son bent ("ayrı imzalı sözleşme yok") ile 7.2 artık aynı şeyi söylüyor.

## 3. Değişen dosyalar
FONBRIDGE: `docs/SECURITY_COMPLIANCE.md`, `docs/legal/dpa-tr.md`, `docs/legal/dpa-en.md`, bu rapor. Repo dışı: `/Users/macbook/alan/docs/agent-results/TASK-MUPA6S5JGGG88-se-fb.md` (Y-1), `…-se-fb-2.md` (Y-3).

## 4. Riskler
- 7.2/7.3 yeni metin hukukçu teyidi görmedi; "Anthropic DPA'sı ticari şartlara referansla dahil" bilgisinin "yazılı sözleşme" sayılıp sayılmadığı açık.
- DPA sayfa açıklaması hâlâ "KVKK/GDPR uyumlu" (`messages/tr.json:757`) — kapsam dışı bıraktım (crw-fb Ö-2).

## 5. Açık sorular (patron/hukuk)
Y-1 şirket bilgileri + R2 bölgesi; 7.2/7.3 için tarihli taahhüt istenir mi (v1.3); sağlayıcı DPA/SCC/DPF fiilî durumu; OpenAI panel veri paylaşımı ayarı.

## 6. Sonraki adım
Patron bilgileri gelince DPA v1.3; hukukçu 7.2/7.3 + md.28(3) kontrol listesi (Ö-2).
