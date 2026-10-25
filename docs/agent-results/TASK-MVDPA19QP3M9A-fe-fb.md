---
sözleşme: 3
biçim: html
sayfa: TASK-MVDPA19QP3M9A-fe-fb.html
görev: TASK-MVDPA19QP3M9A
kod: TASK-MVDPA19QP3M9A
ajan: fe-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: yeni yazı boş kapak, içerikten dile göre tahmin edilen okuma süresi ve "Yasin Aslan" yazar adıyla açılıyor; görselsiz kayıt reddediliyor, düzenlemede kayıtlı değerler korunuyor. PR #103 açık, push kapısı yeşil.
platform: web; mac + Google Chrome (Playwright channel=chrome) ile ölçüldü. Windows/Linux koşulamadı (yalnız mac makine var). Değişiklik tarayıcı içi React/TS ve Node seed kodu; platforma bağlı yol (süreç, dosya yolu, kabuk) yok, davranış aynı olmalı.
sürüm: 1
tarih: 2026-10-18T12:11:23.695Z
---

# FO-78 · Yeni blog yazısında stok kapak, "5 min read" ve "(Süperadmin)" ön-dolgusu kaldırıldı

Admin "Yeni Blog Yazısı" formu artık stok Unsplash kapağı, sabit "5 min read" ve "Yasin Aslan (Süperadmin)" ön-dolgusu olmadan açılıyor.
Kapak boş başlıyor; görselsiz kayıt "Kaydetmeden önce bir kapak görseli yükleyin." mesajıyla reddediliyor.
Okuma süresi içerikten tahmin ediliyor (kelime/200, en az 1) ve admin diline göre yazılıyor: tr "N dk", en "N min read". Admin alanı elle değiştirince tahmin durur. Düzenlemede kayıtlı değer korunur.
Seed ve create-superadmin betiğinde ad "Yasin Aslan" yapıldı; yerel DB'de seed koşturuldu ve ad güncellendi. Patronun yazısının authorName'ine dokunulmadı.
Varsayılana dayanan 2 e2e spec bilerek güncellendi. Birim 4628/0 düşen, blog e2e (MinIO ile) 30/30, push kapısı 355 geçti / 9 atlandı.
PR #103 (base dev). #100 ile client.tsx import satırında ve messages'ta küçük çakışma var: ikinci birleşen PR rebase edilecek.

## Ne yapıldı
- `src/app/[locale]/admin/blog/client.tsx`: yeni yazıda `image: ''` ve `readTime: ''`. `readTimeAuto` bir ref: yeni yazıda true, düzenlemede false, alan elle değişince false. İçerik değiştikçe `t('readTime.auto', {min})` yazılıyor. Ref kullanıldı, çünkü Tiptap'in onUpdate'i eski render'ın closure'ını tutabilir. Okuma süresi alanına `htmlFor`/`id`, t() etiket ve placeholder, `aria-describedby` ipucu eklendi.
- `src/lib/blog-read-time.ts` (yeni): `countReadableWords`, `estimateReadMinutes`. Bağlantı ve görsel adresleri, HTML etiketleri ve Markdown işaretleri sayılmıyor. #100 ile çakışmasın diye blog-shared.ts yerine ayrı dosyaya kondu.
- `messages/{tr,en}.json`: `adminBlog.readTime.{label,placeholder,hint,auto}`.
- `prisma/seed-tenant-workspace.ts:67` ve `scripts/create-superadmin.ts:8` → `'Yasin Aslan'`. Betik kartın dosya listesinde yoktu. Ancak `grep Süperadmin` aynı adı yazan ikinci kaynak olarak onu gösterdi (prod'da admin büyük olasılıkla bu betikle oluşturuldu), bu yüzden o da düzeltildi. Rol `isPlatformAdmin` ile kalıyor; parantez kırpan bir sezgi eklenmedi.
- Okuma süresi kararı: kartın önerisi uygulandı (otomatik tahmin + dile göre biçim + elle değiştirince durma). Sabit bir varsayılan yerine içerikten türetmek, kayıtsız bir rakam göstermemeyi sağlıyor.
- CSP/next.config'deki unsplash izni, şema, API, renderer ve blog seed DEĞİŞMEDİ.

## Kanıt (ham çıktı)
```
grep -rn "Süperadmin" src tests prisma scripts e2e   (önce)
tests/fabricated-identity-strings.test.ts:66,276   (negatif assert'ler, korunuyor)
prisma/seed-tenant-workspace.ts:67:  name: 'Yasin Aslan (Süperadmin)',
scripts/create-superadmin.ts:8:  const name = 'Yasin Aslan (Süperadmin)';
(sonra) yalnız test dosyasındaki negatif assert'ler + yeni bekçi yorumu
grep -rn unsplash src/app src/components → boş

ÖNCE (:3000, dev e120ca61): NEW tr: imagePreview= 1 readTime= "5 min read" author= "Yasin Aslan (Süperadmin)"
seed: pnpm beta:seed-users → User row "Yasin Aslan|t"; User 114→114
SONRA (:3011):
NEW tr: imagePreview= 0 readTime= "" author= "Yasin Aslan"
after short content readTime= "1 dk"
after ~452 words readTime= "2 dk"
save without image error= "Kaydetmeden önce bir kapak görseli yükleyin."
image uploaded src= http://localhost:9000/fabrika-public/blog/2026/c0mvdqzzw9vpeauxg8s3ehkfh.png
saved: Blog yazısı kaydedildi.
public page has "2 dk": true | has Süperadmin: false | has Yasin Aslan: true
manual then type readTime= "7 dk okuma"
EN readTime= "2 min read" label= Read time
EDIT: readTime= "6 dk okuma" author= "" image= https://images.unsplash.com/photo-1531482615713-…  → içerik yazınca "6 dk okuma" kaldı
390px scrollWidth/clientWidth 390/390 · 768px 768/768

pnpm test: Test Files 355 passed | 7 skipped; Tests 4628 passed | 120 skipped
blog e2e (7 spec) MinIO env: 30 passed · env'siz: 24 passed, 6 skipped
pre-push gate: 355 passed, 9 skipped (1. deneme: m7 #13, m9-briefs, m9-calendar düştü → tek başına 22/22 geçti → 2. push yeşil)
pnpm lint: 0 errors (4 eski uyarı) · pnpm typecheck: exit 0
```
Canlı testte oluşturulan yazı (`fo-78-canli-okuma-suresi-fo78-canli-mvdqzyvl`) kanıt alındıktan sonra yerel DB'den tek satır korumasıyla silindi. Patronun `yunanistan-…` yazısına dokunulmadı.

## Değişen dosyalar
messages/en.json · messages/tr.json · prisma/seed-tenant-workspace.ts · scripts/create-superadmin.ts · src/app/[locale]/admin/blog/client.tsx · src/lib/blog-read-time.ts (yeni) · tests/blog-read-time.test.ts (yeni) · tests/e2e/admin-blog-new-defaults.spec.ts (yeni) · tests/e2e/admin-blog-cover-upload.spec.ts · tests/e2e/admin-blog-persistence.spec.ts · tests/fabricated-identity-strings.test.ts. Commit 7a04bfbe, dal `fe-fb/fo78-blog-new-defaults`, PR https://github.com/yaslan/fonbridge/pull/103

## Bilerek güncellenen testler (gevşetme yok)
- `admin-blog-cover-upload`: stok kapağa dayanıyordu. Yeni yazının kapaksız açıldığı ek olarak doğrulanıyor. Yanlış tür testi önce gerçek bir kapak yüklüyor, sonra o kapağın korunduğunu kontrol ediyor. 503 testi kapak uydurulmadığını kontrol ediyor. Dev'de bayat kalmış `'Makale İçeriği (Markdown) *'` etiketi editörle değiştirildi; bu test env'siz yerelde atlandığı için bayatlık şimdiye dek görünmemişti, CI'da kırılırdı.
- `admin-blog-persistence`: kapaksız kaydediyordu. Yükleme ucu, izinli bir host URL'siyle stub'landı (yükleme bu spec'in konusu değil).

## Riskler
- #100 (FO-76) ile `client.tsx` import bölgesinde ve `messages/*.json` içinde metinsel çakışma bekleniyor (küçük). Hangisi ikinci birleşirse rebase edilir.
- Prod'daki admin User satırının adı veri olarak hâlâ "(Süperadmin)" içeriyorsa, seed/betik değişikliği onu değiştirmez (betik yalnız create'te ad yazar). Ad, prod'da profil ekranından ya da tek bir UPDATE ile düzeltilmeli.
- Patronun zaten kaydettiği yazıda `authorName = 'Yasin Aslan (Süperadmin)'` ve `readTime = '5 min read'` duruyor (kart gereği dokunulmadı).

## Açık sorular
Yok.

## Sonraki adım
PR #103 incelemesi. Yerel :3000 (dev-preview) ve prod sunucu yeniden deploy edilince değişiklik görünür.

Bu raporun sayfası: TASK-MVDPA19QP3M9A-fe-fb.html (AgentSpace Raporlar sekmesinde açılır).
