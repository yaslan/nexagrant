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
