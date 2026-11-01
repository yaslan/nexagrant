---
name: fabrika-blog-content-no-blank-line-heading
description: Fabrika blog gövdesi \n\n ile bölünemez — başlık ile altındaki paragraf arasında çoğu zaman boş satır yok, block-split render'ı başlığın tüm paragrafı (literal **/* dahil) yutmasına yol açar
metadata:
  type: project
  updatedAt: 2026-09-08
---

`src/lib/blog.ts`'teki `BLOG_POSTS[].content` alanı, markdown gibi görünse de gerçek markdown
kurallarına uymuyor: bir `## Başlık` satırının hemen ardından, blank line OLMADAN paragraf metni
geliyor (`## 1. CORDIS Veri Analitiği...\nCORDIS (Community...)...`). Blog detay sayfası
(`src/app/[locale]/(marketing)/blog/[slug]/page.tsx`) eskiden içeriği `content.split('\n\n')`
ile bloklara ayırıp her bloğun `#`/`##`/`###` ile mi başladığına bakıyordu — bu, başlık +
bitişik paragrafı TEK blok yapıyor, `paragraph.replace('## ', '')` yalnız ilk eşleşmeyi silip
paragrafın geri kalanını (içindeki literal `**kalın**` ve `* madde` işaretleri dahil) başlık
elemanının (`<h3>`) metni olarak basıyordu. Kullanıcı şikayeti tam bu görünüştü: ekranda ham
`**`/`*` karakterleri.

**Kök neden:** blok-bazlı (`\n\n` split) yaklaşım, kaynağın blank-line garantisi vermediği bir
formatta yanlış varsayım. **Düzeltme:** satır-satır ilerleyen küçük bir parser (`renderInline`
+ `renderBlogContent`, aynı dosyada) — her satırı başlık/liste-öğesi/paragraf olarak sınıflandırıp
ardışık aynı-tür satırları biriktiriyor, blank line veya blok-tipi değişince flush ediyor. Repoda
markdown kütüphanesi (remark/marked/react-markdown) YOK ve bu 4 yazının içeriği yalnız
`#`/`##`/`###`, `* `, `N. `, `**kalın**` kullanıyor — kütüphane eklemek yerine bu küçük çözüm
yeterliydi. Admin blog editörü içeriği serbest metin olarak kabul ettiğinden (yetkili girişi)
parser kasıtlı olarak `dangerouslySetInnerHTML` KULLANMIYOR, yalnız sabit React eleman kümesi
üretiyor (`h2`/`h3`/`h4`/`p`/`ul`/`ol`/`li`/`strong`) — XSS yüzeyi açmadan.

**Nasıl uygularım:** Blog içeriğine yeni bir markdown kalıbı (link, kod bloğu, italik) eklenirse
`renderBlogContent`'e satır-tipi olarak eklenmeli; block-split (`\n\n`) yaklaşımına asla geri
dönülmemeli çünkü kaynak veri bunu garanti etmiyor.

İlgili: [[fabrika-public-figure-audit-procedure]] (aynı blog içeriğinde daha önce bulunan başka
bir dürüstlük sorunu — uydurma yazar/istatistik).
