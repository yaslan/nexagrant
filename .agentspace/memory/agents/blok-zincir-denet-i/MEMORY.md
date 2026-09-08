# QA-EN Hafızası

- [RLS Flow Complete](fabrika-rls-flow-complete.md) — Kiracı izolasyonu ölçümü açıldı — pnpm db:rls-role + pnpm db:rls + test 4/4 yeşil
- [G0 Puanlama Fix'lendi](g0-scoring-fixed.md) — G0 hiç hesalanmıyor bug fix'lendi, fırsat oluştur + gate'de çağrılıyor

- [fabrika-assert-both-config-branches](fabrika-assert-both-config-branches.md) — Davranış bir go-live ayarına bağlıysa testi tek ortama sabitleme — iki dalı da doğrula; uydurma cevap her iki dalı da düşürür, test hiçbir ortamda kırılmaz
- [G0 Production Hook](g0-scoring-production-hooked.md) — G0 puanı kanonik scoreG0/decideG0 ile production'da hesalanıyor, rescoreOpportunityG0 hook'u bağlanmış, 28 test yeşil

- [fabrika-schema-done-means-information-schema](fabrika-schema-done-means-information-schema.md) — Bir şema işi "bitti" raporlandıysa tablo gerçekten var demek DEĞİL — typecheck de mock'lu test de yalan söyler; information_schema'ya sor

- [fabrika-check-every-surface-not-the-fix](fabrika-check-every-surface-not-the-fix.md) — "Kanonik hesaplayıcıya bağlandı" raporu bir yüzeyi anlatır, hepsini değil — aynı değeri okuyan her ekranı ayrı ayrı grep'le; Fabrika'da board önbellek kolonunu, detay sayfası canlı hesabı gösteriyordu

- [fabrika-dev-server-500s-after-deleting-a-route-file](fabrika-dev-server-500s-after-deleting-a-route-file.md) — next dev bir route dosyası (loading.tsx/page.tsx) SİLİNDİĞİNDE bayat manifest yüzünden her rotaya 500 verir — bunu regresyon sanma, sunucuyu yeniden başlat; dosya EKLEMEK aynı sorunu yaratmaz
- [fabrika-status-code-needs-session-and-module-on](fabrika-status-code-needs-session-and-module-on.md) — Bir rotanın HTTP durum kodunu ölçerken iki kapı ölçümü sessizce sahteleştirir — oturumsuz istek 307'de durur, modülü OFF kiracı DOĞRU bir 200 (kilit ekranı) döndürür; ikisini de kapatmadan "geçti/kaldı" deme

- [fabrika-e2e-seed-riding-specs-go-red-on-plan-drift](fabrika-e2e-seed-riding-specs-go-red-on-plan-drift.md) — Tohum kiracıya (main / fabrika-beta) binen e2e paketleri plan verisi değişince sessizce kırmızıya döner — modül kapısı render edilir, aranan form/başlık hiç basılmaz; kendi fixture kiracısını kuran paketler etkilenmez
- [playwright-waitforurl-loose-regex-false-red](playwright-waitforurl-loose-regex-false-red.md) — Playwright'ta gevşek bir waitForURL regex'i MEVCUT sayfanın URL'siyle eşleşip anında geçer — gezinme hiç beklenmez ve tıklama testi sahte kırmızı verir; assertion'ı gevşetme, bekleyiciyi sıkılaştır

- [fabrika-fake-showcase-bind-or-remove-needs-a-persistence-check](fabrika-fake-showcase-bind-or-remove-needs-a-persistence-check.md) — "Sahte vitrini gerçek duruma bağla ya da kaldır" kararını vermeden ÖNCE o durumun kalıcı bir tablosu var mı diye bak — yoksa bağlamak yeni bir yalan üretir
- [fabrika-i18n-evidence-bar-forces-whole-file](fabrika-i18n-evidence-bar-forces-whole-file.md) — i18n kartı birkaç satır numarası verse de kanıt "ekran EN'de İngilizce" ise dosyanın TAMAMINI çevir — yarım çeviri kanıt karesini geçemez

- [grep-count-dod-can-hit-a-legitimate-string](grep-count-dod-can-hit-a-legitimate-string.md) — Kart "indirilen dosyada `grep -c X` = 0" diyorsa önce X'in HER geçtiği yeri ayır — ürün markası ile uydurma kimlik aynı dizeyi paylaşabilir; sayıyı tutturmak için meşru olanı silme

- [fabrika-gitignore-does-not-hide-a-file-from-the-gate](fabrika-gitignore-does-not-hide-a-file-from-the-gate.md) — .gitignore'daki geçici script yine de eslint ve tsc tarafından okunur ve pnpm gate'i repo genelinde kırar — probe dosyanı koştuktan sonra SİL, ve yabancı bir kalıntıya dokunmadan kapıyı hariç-tutarak ölç
- [fabrika-superuser-hides-missing-withtenant](fabrika-superuser-hides-missing-withtenant.md) — Kiracı tablosunu withTenant DIŞINDA okumak yerelde DOĞRU görünür — DATABASE_URL SUPERUSER; hatayı görmek için aynı fonksiyonu fabrika_app rolüne bağlı client'la koştur

- [fabrika-a-built-feature-with-no-caller-is-not-shipped](fabrika-a-built-feature-with-no-caller-is-not-shipped.md) — Yeşil birim testi ve temiz typecheck bir özelliğin ÇALIŞTIĞINI kanıtlar, KULLANILDIĞINI değil — bitmiş saydığın her yeni fonksiyon için `grep -rn <isim> src` ile üretim çağıranını ara
- [fabrika-hiding-a-card-is-not-refusing-a-purchase](fabrika-hiding-a-card-is-not-refusing-a-purchase.md) — Görünürlük kusurlarında listeyi ve satın almayı AYRI ölç — kart gizlendiği hâlde endpoint sku'yu elle kabul edebilir; ayrıca "yok" ile "senin değil" tek mesajla cevaplanmalı

- [a-missing-field-card-hides-a-wrong-value-bug](a-missing-field-card-hides-a-wrong-value-bug.md) — Kart 'şu alan yok' diyorsa grep'le doğrulamakla yetinme — yolu koştur ve ÜRETİLEN belgeye bak; eksik alanın yanında çoğu zaman daha ağır bir 'yanlış değer' kusuru duruyor

- [a-fix-can-turn-a-silent-bug-into-an-outage](a-fix-can-turn-a-silent-bug-into-an-outage.md) — Bir düzeltme "sessizce yutma, fırlat" derse, altındaki yazma yolunun gerçekten çalıştığını KANITLA — yoksa kayıp kayıt kusuru tam kesintiye dönüşür
- [grep-count-of-zero-can-mean-the-fix-landed](grep-count-of-zero-can-mean-the-fix-landed.md) — Bir kartın "grep sayısı 0" kanıtı düzeltilmiş kodda da 0 kalır — çağıranı değil tıkacı ölç, yoksa bitmiş işi bitmemiş sanırsın
- [one-action-can-be-billed-twice-in-two-places](one-action-can-be-billed-twice-in-two-places.md) — Bir "tek giriş noktası" birleştirmesini doğrularken adaptörün düşüşünü değil, TEK EYLEMİN defterde kaç satır bıraktığını say — ikinci tahakkuk çağıran modülde durabilir
- [probes-on-a-shared-db-must-run-one-file-at-a-time](probes-on-a-shared-db-must-run-one-file-at-a-time.md) — Aynı kiracı üzerinde çalışan ve kendi satırlarını temizleyen vitest sondalarını TEK ÇAĞRIDA birlikte koşma — dosya paralelliği altında birbirlerinin satırlarını siler ve anlamsız sayı üretirler

- [live-db-probe-beats-a-mocked-prisma-for-filter-shape-bugs](live-db-probe-beats-a-mocked-prisma-for-filter-shape-bugs.md) — Fabrika'da sorgu-şekli kusurlarını yalnız canlı Postgres sondası yakalar — kalıcı `*.live.test.ts` kalıbı, kendi fixture'ı, `describe.skipIf(!HAS_DB)`, sonda kalıntısı bırakma
- [prisma-json-equals-compares-the-whole-document](prisma-json-equals-compares-the-whole-document.md) — Prisma'da Json kolonda `data: { equals: { key: v } }` TÜM belgeyi karşılaştırır — tek alan için `path: ['key'], equals: v` şart; bu kalıp sessizce hiç eşleşmeyen muhafızlar üretir
- [shared-worktree-red-must-be-attributed-before-it-is-reported](shared-worktree-red-must-be-attributed-before-it-is-reported.md) — Paylaşılan ağaçta süit iki koşuda farklı kırmızı veriyorsa suç senin değil olabilir — kendi dosyanı `git stash push -- <file>` ile HEAD'e alıp aynı testi tekrar koş, sonucu rapora KANITLA
