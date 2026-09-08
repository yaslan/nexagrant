---
name: a-missing-field-card-hides-a-wrong-value-bug
description: "Kart 'şu alan yok' diyorsa grep'le doğrulamakla yetinme — yolu koştur ve ÜRETİLEN belgeye bak; eksik alanın yanında çoğu zaman daha ağır bir 'yanlış değer' kusuru duruyor"
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTSWLWDONWA3W: kart ve ondan önceki iki tur (lider + PM) "yabancı para
faturasında TCMB kuru alanı YOK" diye ölçmüştü — hepsi `grep -rn exchangeRate`
seviyesinde, hepsi doğru. Kart karara (ADR-0002) bağlı olduğu için üçüncü kez
"bloke" diye kapanmak üzereydi.

USD faturayı **üretim yolundan geçirip çıktıya baktığımda** (satır → 
`buildInvoiceDocument` → `generateEfaturaHtml`) kartta hiç geçmeyen daha ağır
bir kusur çıktı: yazdırılabilir belge "Para Birimi: **USD**" yazarken tutarları
`₺99,00` diye basıyordu — `₺` şablonda sabit kodluydu. Yani belge yalnız bir
alanı eksik taşımıyordu, **yanlış bir şey iddia ediyordu**, ve bu kısım hiçbir
karara bağlı değildi: bugün düzeltilebilirdi, düzeltildi.

**Why:** "X yok" bir yokluk ölçümüdür; yokluk grep'le görülür ama **yanlışlık
görülmez**. Yanlışlık ancak üretilen artefakta (XML, HTML, PDF, JSON) bakınca
ortaya çıkar. Bir kart karara bağlı diye kapanıyorsa, karardan bağımsız olan
kısmı bulmak tam olarak QA'nın işi.

**How to apply:**
1. Kart "şu alan/kayıt yok" diyorsa, önce iddiayı doğrula (grep) — **sonra
   yolu koştur ve çıktıyı bas**. Küçük bir tsx betiği yeter; sonra sil.
2. Çıktıda para birimi / tarih / kimlik / birim taşıyan HER hücreyi tek tek
   oku. Sabit kodlanmış sembol, birim ya da etiket arıyorsun.
3. Yanıltıcı alan adı (`unitPriceTRY` ama içinde USD) çoğu zaman kusurun kök
   nedenidir — düzeltmeye adı değiştirerek başla.
4. Karar bekleyen kısmı UYDURMA. Bunun yerine **reddet**: mali/dış bir belgeyi
   eksik veriyle göndermeyi engelleyen bir kapı koy, kapıyı tek yerden
   gevşetilebilir yaz, gerekçesini ADR'ye referansla yorumla.

İlgili: [[fabrika-check-every-surface-not-the-fix]],
[[fabrika-a-built-feature-with-no-caller-is-not-shipped]]
