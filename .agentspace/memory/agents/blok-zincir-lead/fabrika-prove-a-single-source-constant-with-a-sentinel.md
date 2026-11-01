---
name: fabrika-prove-a-single-source-constant-with-a-sentinel
description: Bir sabitin gerçekten tek kaynak olduğunu kanıtlamanın ucuz yolu — değerini geçici olarak ZZTEST gibi bir nöbetçiye çevir, hangi yüzeyin onu GÖSTERMEDİĞİNE bak; göstermeyen yerde değer kopyalanmıştır
metadata:
  type: reference
  updatedAt: 2026-09-10
---

## Teknik
`PRODUCT_NAME` gibi "tek yerde yaşıyor" iddiasındaki bir sabiti değiştirirken:
1. Değeri geçici olarak ayırt edici bir nöbetçiye çevir (`'ZZTEST'`).
2. Uygulamayı gerçek tarayıcıda aç, iddia edilen TÜM yüzeylere bak
   (giriş ekranı, üst çubuk, sekme başlığı, e-posta gönderen adı, belge alt bilgisi, indirilen
   dosya adı).
3. `ZZTEST` **görünmeyen** her yüzey bir bulgudur: orada değer kopyalanmış, sabitten okunmuyor.
4. Nöbetçiyi geri al.

## Neden grep yetmiyor
`grep -rn "Fabrika"` yalnız o anki değeri arar; değeri **başka bir yoldan** üreten yerleri
(katalog dizgisi, üretilmiş belge, e-posta şablonu, dosya adı birleştirme) kaçırır. Nöbetçi
sondası aramaz, **gözlemler** — kullanıcıya ne gösterildiğini ölçer.

Aynı aile: negatif derleme kanıtı (yanlış kullanımın DERLENMEDİĞİNİ gösterme) ve
"testi bilerek boz → kırmızı → geri al → yeşil". Üçü de aynı disiplin: bir şeyin çalıştığını
değil, **çalışmadığında farkedileceğini** kanıtlamak.

İlgili: [[fabrika-a-one-line-copy-request-can-be-a-52-surface-decision]] · [[fabrika-verify-what-a-gate-measures]]
