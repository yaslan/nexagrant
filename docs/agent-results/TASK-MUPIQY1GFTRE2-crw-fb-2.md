---
görev: TASK-MUPIQY1GFTRE2
ajan: crw-fb
tip: inceleme
hüküm: DEĞİŞİKLİK İSTE — Y-2, Y-3 ve Ö-1 kapandı (tr/en eşleşik, kanıtlı). Yeni bulgu Y-4: DPA 7.2/7.3 bugün doğru olmayan şeyi yükümlülük olarak yazıyor ve 5. maddenin son maddesiyle iç çelişkide. Y-1 bloke-patron (yazara yüklenmez). İmzaya gitmez.
platform: mac (Darwin 27.0). Yalnız markdown + git okuma; platforma bağlı kod yolu yok. Windows/Linux koşulmadı: gerek yok.
sürüm: 2
---

# TASK-MUPIQY1GFTRE2 — DPA v1.2 düzeltme turu incelemesi

Dal `se-fb/p6-dpa-signable` @ `80244a64`. Önceki incelemem: `TASK-MUPIQY1GFTRE2-crw-fb.md` (Y-1, Y-2, Y-3, Ö-1). Hukuki görüş değildir.

## 1. Önceki bulgular kapandı mı

| Bulgu | Durum | Kanıt (dpa-tr.md satırı; dpa-en.md aynı satır) |
|---|---|---|
| Y-1 unvan/adres/VKN/MERSİS/R2 bölgesi | **Açık — bloke-patron.** Yazara yüklenmez; alanlar boş bırakılmış, uydurulmamış | `:21-24` "......", `:123` "Belirtilecek: ......" |
| Y-2 Türkçe öncelik + Türk hukuku + yetkili mahkeme | **Kapandı** | `:114` "Türkçe metin geçerlidir" / en "the Turkish version shall prevail"; `:115` Türkiye hukuku; `:116` İstanbul (Merkez) Mahkemeleri ve İcra Daireleri. 13.3 patron teyidi bekliyor (yazar bunu bildirmiş, §4) |
| Y-3 GDPR md.28(3)(b) | Kapandı | `:64` personel gizliliği, KVKK md.12/1 ve 12/4 |
| Y-3 (c) | Kapandı | `:65` GDPR md.32 |
| Y-3 (d) + md.28(4) | Kapandı (içerik); bkz. Y-4 | `:79` önceden bildirim + itiraz; `:80` alt işleyene aynı yükümlülükler, md.28(4) |
| Y-3 (e) veri sahibi talepleri | Kapandı | `:56` yardım paragrafı, md.12-22 / KVKK md.11, 13 |
| Y-3 (f) | Kapandı | `:87` md.32-36, KVKK md.12/5 |
| Y-3 (g) iade/silme | Kapandı | `:71` "iade ya da silinir (Veri Sorumlusu'nun tercihi)", md.28(3)(g) |
| Y-3 (h) denetim | Kapandı | `:91` bilgi + yerinde denetim, md.28(3)(h), KVKK md.12/3 |
| Y-3 ABD aktarım dayanağı | Metinde var; **doğruluk Y-4'te** | `:81` DPF (md.45) / SCC (md.46); KVKK md.9 standart sözleşme + Kurum bildirimi |
| Ö-1 model eğitimi dayanağı | **Kapandı, dürüst** | `:66` bkz. §3 |

tr/en eşleşme kanıtı:
```
başlık/madde satırı karşılaştırması (grep '^#|^- \*\*[0-9]' tr vs en) → fark yok
## sayısı: tr 15, en 15
```
en 7.3 (`:81`) tr 7.3 ile aynı unsurları taşıyor: DPF/art.45, SCC/art.46, KVKK art.9, standart sözleşme, Kurum'a bildirim, "talep üzerine yazılı bildirim".

## 2. Yeni bulgu

- **Y-4 — 7.2 ve 7.3 bugünkü durumu yanlış anlatıyor; metin kendi içinde çelişiyor (`dpa-tr.md:80-81` ↔ `:66`, en aynı satırlar).** 7.2 "Veri İşleyen, her alt işleyene bu sözleşmedeki veri koruma yükümlülüklerini yazılı sözleşmeyle yükler" diyor; 5. madde son madde ise yapay zeka sağlayıcılarıyla "imzalanmış ayrı bir sözleşme"nin olmadığını söylüyor, Vulut ile de imzalı sözleşme yok (`HUKUK-SORULARI-2026-09.md:339`). 7.3, Anthropic/OpenAI/Stripe/Google için DPF sertifikası ya da SCC ve KVKK md.9 standart sözleşmesi+Kurum bildirimi öngörüyor; bunların hiçbirinin yapıldığı repoda yok (yazar da §4'te "doğrulamadım" diyor). Sonuç: imza anında Veri İşleyen yerine getirilmemiş yükümlülükle sözleşmeye girer; 5. madde ile 7.2 aynı belgede birbirini yalanlar. Senaryo: AB'li ya da kamu müşterisi 7.2'yi gösterip alt işleyen sözleşmesini ister, yoksa sözleşme ihlali. Düzeltme (yazar, patron/hukuk teyidinden sonra): ya (a) sağlayıcılar için fiilî durum yazılsın (hangileri DPF sertifikalı, hangileri için SCC/DPA hangi tarihte kabul edildi; Anthropic'in DPA'sı ticari şartlara referansla dahil — hukukçu bunun "yazılı sözleşme" sayıldığını teyit etsin), ya da (b) 7.2/7.3 "imzadan itibaren X gün içinde" gibi tarihli bir taahhüde çevrilsin. Kod tarafında yapılacak bir şey yok; belge + patron/hukuk işi.
- **Ö-2 (öneri) — md.28(3) giriş unsurları ve talimat uyarısı:** işlemenin niteliği/amacı ve **veri sahibi kategorileri** açıkça yazılı değil (3. madde yalnız veri kategorilerini sayıyor); "talimatın hukuka aykırı olduğunu düşünürse sorumluyu bilgilendirir" cümlesi de yok. Hukukçunun md.28(3) kontrol listesine eklenmeli, bloke değil.
- **Ö-3 (öneri) — 13.3 yetki:** müşteri kamu tüzel kişisi (belediye) olabilir; yetki sözleşmesinin kamu tarafıyla geçerliliği (HMK md.17) benim varsayımımdır, doğrulanmadı. Patron teyidine "kamu müşterisi için de geçerli mi" sorusu eklensin.
- **Ö-4 (öneri) — "Sürüm geçmişi iki 1.0 satırı" (Ö-3 eski) ve kaşe satırı (Ö-4 eski)** kapsam dışı bırakılmış; yazar not düşmüş, itiraz yok.

## 3. Ö-1 dürüstlük kontrolü

`dpa-tr.md:66` metni: eğitim yok iddiası "imzalanmış ayrı bir sözleşmeye değil, … yayımlanmış ticari hizmet şartlarına dayanır"; "sağlayıcılar şartlarını değiştirebilir"; "OpenAI metin gömme isteklerinde bugün … 30 güne kadar"; "Saklama süresinin sıfır olduğu taahhüt edilmez." Kendi curl'ümle doğruladığım kaynaklarla tutuyor (Anthropic commercial terms "may not train models on Customer Content", OpenAI your-data sayfası, `/v1/embeddings` abuse-monitoring 30 gün). Abartı ya da "sözleşme ekinde" benzeri iddia yok. Tek kusur yer: bu madde "Güvenlik Önlemleri" listesinde duruyor; biçimsel, bloke değil. Kardeş belge `SECURITY_COMPLIANCE.md:140` hâlâ çelişiyor (bkz. TASK-MUPA6S5JGGG88 incelemem Y-2).

## 4. Karar

**DEĞİŞİKLİK İSTE.** Y-2/Y-3/Ö-1 yazarın işi olarak kapandı. Kalanlar: **Y-1 bloke-patron** (şirket bilgileri, R2 bölgesi, 13.3 ve 7.1'in 30 günü teyidi), **Y-4** (7.2/7.3 gerçeklik; patron/hukuk girdisiyle v1.3'te). DPA bu haliyle imzaya gitmez; yazara yeni iş yüklemeden önce Y-1 gelmeli.
