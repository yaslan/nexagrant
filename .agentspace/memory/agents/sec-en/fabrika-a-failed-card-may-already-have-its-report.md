---
name: fabrika-a-failed-card-may-already-have-its-report
description: Fabrika'da "önceki deneme boş iskelet bıraktı" diyen kart yanılıyor olabilir — devralmadan önce o dosyayı AÇ ve OKU, üzerine yazmadan
metadata:
  type: feedback
updatedAt: 2026-09-10
---

TASK-MTTUUGKNDGBXK kartı, 4 kez düşmüş bir iş için şunu iddia etti: "geçen deneme sonuç dosyasını
'(doldurulacak)' başlıklarıyla yazdı, orada durdu — sahte tamamlanma sinyali; o dosyayı kendi
raporunla DEĞİŞTİR."

Dosyayı açtım: `docs/agent-results/TASK-MTTUUGKNDGBXK-customer-support.md` **307 satırlık,
tamamlanmış, kanıt bağlantılı bir rapordu** (QA-EN imzalı — gerçek tarayıcı ölçümü, ekran
görüntüleri, kapı çıktısı, platform beyanı). `grep -n "doldurulacak\|TODO\|placeholder"` →
**sıfır eşleşme**. Kartın anlattığı iskelet başka bir dosyaya aitti ya da hiç var olmadı.

**Nasıl uygularım:** bir kart "önceki çıktı çöp / boş / sahte, değiştir" diyorsa, silme veya
üzerine yazma talimatını uygulamadan önce **iki komut**: `wc -l <dosya>` ve
`grep -n "doldurulacak\|TODO\|placeholder" <dosya>`. Ucuz, ve gerçek bir kanıt artefaktını yok
etmekten korur. İddia doğru çıkarsa zaten devam edersin; yanlış çıkarsa bunu raporun **ilk
bölümünde** söyle — çünkü kartın öncülü yanlışsa kapsamı da yanlış kurulmuş olabilir.

Yan gözlem: aynı kart iki farklı sonuç-dosyası adı verdi (gövdede bir ad, `[KANIT ZORUNLU]`
bloğunda başka bir ad, ve ikisi de benim kimlik jetonumla uyuşmuyordu). Çakışmada "TAM ve TEK"
diye işaretlenmiş olanı seçtim ve **çakışmayı raporda yazdım** — sessizce birini seçmek, sonraki
ajanın dosyayı bulamamasına yol açıyor.

Kardeş kayıt: [[fabrika-card-known-facts-go-stale-remeasure]] (aynı kartın sayıları da bayattı).
