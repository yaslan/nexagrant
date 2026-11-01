# Memory Index

- [agentspace-cross-team-delegation-grant](agentspace-cross-team-delegation-grant.md) — Fabrika uzmanları (cora/defne/sora/derin) cekirdek takımında değil — LEED-EN onlara ancak sahibin çapraz-takım izniyle iş verebilir

- [fabrika-s8-s10-sprint](fabrika-s8-s10-sprint.md) — Fabrika S8-S10 bekleyen tüm kartları tek sprint kuyruğuna (sprint-1788728327788) bağlandı — 12 görev, bağımlılık zinciriyle otomatik ilerliyor

- [fabrika-evidence-file-may-answer-a-different-task](fabrika-evidence-file-may-answer-a-different-task.md) — Delegasyon defteri "done + kanıt dosyası" dese bile o rapor BAŞKA bir işi anlatıyor olabilir — kanıtı iddia edilen karta karşı oku
- [fabrika-file-ownership-delegation-works](fabrika-file-ownership-delegation-works.md) — Paralel dalgada her worker'a TEK dosya sahipliği + "şuna DOKUNMA" listesi vermek çakışmayı bitirdi — 6/6 iş kanıtla geçti

- [fabrika-verify-what-a-gate-measures](fabrika-verify-what-a-gate-measures.md) — Yeşil bir kapı, koruduğu şeyi ölçemiyor olabilir — kapıyı eklemeden ÖNCE script'i aç ve neye baktığını gör

- [fabrika-boss-prefers-clean-chain-over-busy-team](fabrika-boss-prefers-clean-chain-over-busy-team.md) — Patron, bağımlı adımlarda paralellik yerine sıralı doğrulamayı seçiyor — boşta duran ekip, bulanık kanıttan iyidir

- [fabrika-ask-workers-to-report-not-fix-adjacent-lies](fabrika-ask-workers-to-report-not-fix-adjacent-lies.md) — Worker'a "yolun üstünde gördüğün kayıtsız rakamları DÜZELTME, ADIYLA BİLDİR" demek kapsamı korurken üç gerçek kart kazandırdı

- [fabrika-red-gate-may-be-a-live-worker-wip](fabrika-red-gate-may-be-a-live-worker-wip.md) — Kapı kırmızıysa önce pane listesine bak — commit'siz bir dizin çalışan worker'ın WIP'i olabilir, regresyon değil

- [fabrika-check-artifact-timestamps-against-dispatch](fabrika-check-artifact-timestamps-against-dispatch.md) — Worker "kanıt var" derken eski dosyayı gösteriyor olabilir — kare/çıktı dosyalarının mtime'ını görevin başlama saatiyle karşılaştır, ve raporda doğrulamayı REDDEDEN cümleyi ara

- [fabrika-verify-each-claim-not-the-headline](fabrika-verify-each-claim-not-the-headline.md) — Dürüst bir raporun toplam rakamı doğru olsa bile tek bir maddesi uydurma olabilir — numaralı her iddiayı KENDİ komutuyla ölç, manşet sayıyla yetinme

- [fabrika-same-image-under-different-names](fabrika-same-image-under-different-names.md) — Kare sayısı DoD'u sağlıyor görünse bile dosyalar bayt bayt aynı olabilir — kanıt karelerini md5 ile tekilleştir, adına güvenme
- [fabrika-verify-backlog-before-assigning-finds-worse](fabrika-verify-backlog-before-assigning-finds-worse.md) — Bekleyen kartları dağıtmadan önce iddialarını koda karşı ölç — kart metnini doğrularken panoda HİÇ olmayan daha ağır kusurlar çıkıyor

- [fabrika-einvoice-real-record-or-404](fabrika-einvoice-real-record-or-404.md) — Patron kararı — e-Fatura belgesi gerçek kayıttan üretilir, kayıt yoksa 404; tedarikçi kimliği env'den gelir
- [fabrika-fabrication-audit-must-cover-api-export-routes](fabrika-fabrication-audit-must-cover-api-export-routes.md) — Uydurma veri taramaları UI bileşenlerinde kalırsa API export rotalarındaki sahte resmî belgeleri kaçırır

- [fabrika-plan-catalog-db-source-of-truth-decision](fabrika-plan-catalog-db-source-of-truth-decision.md) — Patron kararı — paket/fiyat yönetimi DB'ye taşınacak (Yol B, sürümlü PlanVersion), önce metin düzeltmesi ve temizlik

- [fabrika-partial-fix-check-all-surfaces-of-the-same-bug](fabrika-partial-fix-check-all-surfaces-of-the-same-bug.md) — Bir bug "düzeltildi" diye kapanırken aynı hatanın diğer yüzeyleri açık kalıyor — kapatmadan önce grep ile tüm çağrı yerlerini say

- [fabrika-widen-a-narrow-gate-to-size-and-find](fabrika-widen-a-narrow-gate-to-size-and-find.md) — Dar kapsamlı bir kapıyı GEÇİCİ olarak repo geneline açıp koşmak, hem kartı ölçüyor hem panoda gizemli duran bir P0'ın kök nedenini veriyor — dağıtmadan önce yap

- [fabrika-zero-warnings-can-mean-rule-is-off](fabrika-zero-warnings-can-mean-rule-is-off.md) — Bir lint kuralı için 0 uyarı görmek kodun temiz olduğu anlamına GELMEZ — Fabrika'da react-hooks/set-state-in-effect hiç yapılandırılmamıştı; kartı dağıtmadan önce eslint.config.mjs'te kuralın AÇIK olduğunu doğrula

- [fabrika-delegation-verdict-wrong-both-directions](fabrika-delegation-verdict-wrong-both-directions.md) — Delegasyon defterinin hükmü İKİ YÖNDE de yanlış olabilir — "failed" biten işi gizler, "tespit=marker" ise hiç kanıt olmadığı demektir

- [fabrika-idle-pane-failure-means-nothing-ran](fabrika-idle-pane-failure-means-nothing-ran.md) — `tespit=idle` ("boş prompt'ta bekliyor") ölü pane'den FARKLIDIR — iş hiç başlamamıştır, ağaçta arayacak yarım kod yoktur
- [fabrika-review-pile-is-the-real-backlog](fabrika-review-pile-is-the-real-backlog.md) — `review`de bekleyen kart bitmiş iş değil — dağıtılacak iş arıyorsan gerçek kuyruk orada, backlog'da değil

- [fabrika-workers-cannot-read-card-bodies](fabrika-workers-cannot-read-card-bodies.md) — Worker panodan kartın GÖVDESİNİ okuyamıyor — list_tasks yalnız başlık döndürüyor, bu yüzden bütün detay dağıtım metnine yazılmalı

- [fabrika-cross-verification-needs-a-falsifying-probe](fabrika-cross-verification-needs-a-falsifying-probe.md) — Doğrulama görevi "raporu oku + komutu tekrar koş" ile yazılırsa hiçbir şey kanıtlamaz — her doğrulama kartına iddiayı ÇÜRÜTMEYE çalışan bir sonda adımı konur
- [fabrika-next-round-comes-from-report-open-questions](fabrika-next-round-comes-from-report-open-questions.md) — Sıradaki delegasyon turunun gerçek kaynağı pano değil, biten raporların "Açık sorular" bölümüdür — panodaki review yığını bitmiş işi gösterir, açık işi değil
- [fabrika-verification-round-waits-for-an-empty-tree](fabrika-verification-round-waits-for-an-empty-tree.md) — review kartlarının doğrulama turu ancak ekip boştayken koşulur — 7 ajan ortak ağacı düzenlerken koşan gate/e2e, kartların iddiasını değil worker'ların yarım işini ölçer

- [fabrika-data-loading-verification-breaks-empty-table-specs](fabrika-data-loading-verification-breaks-empty-table-specs.md) — Gerçek veri yükleyen bir doğrulama turu, "tablo boş" diyen kardeş spec'leri sonradan kırar — kapatma turunda spec dosyasının TAMAMINI koştur
- [fabrika-verification-cards-orphan-when-target-closes](fabrika-verification-cards-orphan-when-target-closes.md) — Hedef kartı done yaparken eşleşen DOĞRULAMA kartı todo'da öksüz kalıyor — ikisini birlikte kapat

- [fabrika-green-gate-does-not-prove-a-clean-clone](fabrika-green-gate-does-not-prove-a-clean-clone.md) — Yerelde yeşil kapı (typecheck/lint/test) temiz klonu KANITLAMAZ — untracked dosyalar suiti ayakta tutabilir; durum kontrolünde git status'a da bak

- [fabrika-blocked-card-premise-may-hide-the-real-blocker](fabrika-blocked-card-premise-may-hide-the-real-blocker.md) — "Dış girdi bekliyor" kartının "kod tarafı hazır" premisini ölç — e-Fatura'da hazır olmayan şey adaptör değil, Invoice yazma yoluydu
- [fabrika-boss-may-want-portable-prompts-for-another-ide](fabrika-boss-may-want-portable-prompts-for-another-ide.md) — Patron in_progress kartları başka bir IDE'de (Antigravity) kendisi bitirmek isteyebilir — o zaman istenen şey delegasyon değil, ofis bağlamı taşımayan kendi kendine yeten prompt paketidir
- [fabrika-empty-pane-list-is-not-an-idle-project](fabrika-empty-pane-list-is-not-an-idle-project.md) — Boş pane listesi "iş durdu" demek değildir — harici sürücü (Antigravity) çalışırken gerçeği commit log + -<surucu>.md raporlarının mtime'ı söyler
- [fabrika-no-route-level-platform-admin-gate](fabrika-no-route-level-platform-admin-gate.md) — Fabrika'da kiracı-üstü API rotalarını koruyacak kapı yok — middleware.ts hiç yok ve requirePlatformAdmin yalnız server action sürümü; her yeni admin rotasında bu boşluk tekrar eder
- [fabrika-remeasure-before-handing-work-to-another-driver](fabrika-remeasure-before-handing-work-to-another-driver.md) — Devir paketini yazmadan HEMEN ÖNCE ağacı yeniden ölç — pane'i kapattığım worker kapanmadan önce işi bitirip commit'lemişti, paket bir saat içinde bayatladı
- [fabrika-split-a-sequenced-card-at-its-file-boundary](fabrika-split-a-sequenced-card-at-its-file-boundary.md) — Şema çakışması yüzünden sıraya alınan kart, dosyaya dokunmayan araştırma/ADR fazına bölünüp paralel koşturulabilir
- [fabrika-verify-the-tree-not-just-the-report](fabrika-verify-the-tree-not-just-the-report.md) — Bir worker "kod değiştirmedim, kapıda durdum" diyebilir ve ağaçta o işin tamamı commit'siz durabilir — raporu okuduktan sonra git status/diff ile ağacı da oku

- [fabrika-sendmessage-to-workers-is-not-a-reliable-relay](fabrika-sendmessage-to-workers-is-not-a-reliable-relay.md) — Koşan worker'a karar iletmenin güvenilir yolu SendMessage değil — mesaj alıcı onayında takılıyor; kararı görev kartına ve ADR'ye yaz

- [fabrika-purge-detach-vs-retain-per-column](fabrika-purge-detach-vs-retain-per-column.md) — Fabrika imha kuralı — FK'siz her User.id sütunu kendi gerekçesine göre karara bağlanır (özne verisi sil / kiracı kaydı NULL'la / imza sakla), toplu tek kural uygulanmaz

- [fabrika-a-warning-on-a-read-only-gate-does-not-guard-the-irreversible-command](fabrika-a-warning-on-a-read-only-gate-does-not-guard-the-irreversible-command.md) — Ayrı bir salt-okunur kapının ⚠️ uyarısı, geri alınamaz komutu DURDURMAZ — muhafız eylemin kendi yolunda olmalı; ve muhafızı kanıtlarken kimlik bilgisini boşaltıp iki sonucu da güvenli hale getir

- [fabrika-a-green-gate-may-predate-the-commit-it-closes](fabrika-a-green-gate-may-predate-the-commit-it-closes.md) — Kapatacağın kartın kapı koşusu, kartın kendi commit'inden ESKİ bir ağaçta alınmış olabilir — kapıyı yeşil görmek yetmez, hangi commit'te koştuğunu sor

- [fabrika-local-run-recipe](fabrika-local-run-recipe.md) — Fabrika'yi lokalde ayaga kaldirma tarifi ve acilistaki BILLING_ACTIVE_TIER uyarisinin zararsiz oldugu

- [fabrika-a-passing-test-can-be-satisfied-by-a-second-mechanism](fabrika-a-passing-test-can-be-satisfied-by-a-second-mechanism.md) — Kod tabaninda ayni etkiyi ureten IKINCI bir mekanizma varsa test yesil kalir ama hicbir sey olcmez — kapiyi kabul etmeden once "korudugum sey silinse bu test kirmizi olur mu" diye sor
- [fabrika-boss-repeats-an-error-instead-of-answering](fabrika-boss-repeats-an-error-instead-of-answering.md) — Patron acik soruya cevap vermek yerine ayni hata metnini tekrar yapistiriyor — bu "kabul edelim" onerisinin REDDIDIR, soruyu tekrarlama, kalici cozume gec
- [fabrika-name-the-browser-tool-in-the-card](fabrika-name-the-browser-tool-in-the-card.md) — Worker "CLI'da tarayicim yok" diyip gercek tarayici DoD'unu insana devrediyor — karta Playwright'i ADIYLA ve recete olarak yazmak bu mazereti kaldiriyor
- [fabrika-read-the-library-source-before-round-three](fabrika-read-the-library-source-before-round-three.md) — Kutuphane uyarisini iki tur tahminle kovaladiktan sonra kaynagi okumak kosulu 10 dakikada verdi — ucuncu turdan once node_modules'u ac

- [fabrika-give-workers-a-case-not-a-verdict](fabrika-give-workers-a-case-not-a-verdict.md) — Karta somut test vakasi yazarken onu KENDIN dogrula — uydurdugum "%20'de float sapiyor" vakasi matematiksel olarak sapmiyordu, worker duzeltti

- [fabrika-a-checked-box-that-confesses](fabrika-a-checked-box-that-confesses.md) — Isaretli bir DoD kutusunun ICINDE "ama sorun var" cumlesi varsa kart kapanmaz — raporu okurken once kutularin ICINE bak

- [fabrika-unskipping-a-test-inherits-its-stale-assertions](fabrika-unskipping-a-test-inherits-its-stale-assertions.md) — test.skip kaldiran kart, o testin ESKIMIS iddialarini da devralir — skip suresince urun degismis olabilir, suiti butun kostur

- [fabrika-boss-keeps-a-red-gate-rather-than-hiding-it](fabrika-boss-keeps-a-red-gate-rather-than-hiding-it.md) — Patron, gercek bir hatayi gosteren kapiyi gecici olarak gevsetmek yerine KIRMIZI birakmayi secti — kapsami kismak bir secenek olarak sunulmasin
- [fabrika-supervisor-failed-verdict-may-be-a-derived-path-miss](fabrika-supervisor-failed-verdict-may-be-a-derived-path-miss.md) — Supervisor "BASARISIZ · beklenen cikti yok" derken ESKI gorev kodundan turetilmis bir yola bakiyor olabilir — is aslinda bitmis olabilir, dosyayi ve git log'u kendin kontrol et

- [fabrika-rls-green-on-a-bypassrls-connection](fabrika-rls-green-on-a-bypassrls-connection.md) — Fabrika'da RLS politikaları yeşil olsa da ana DATABASE_URL BYPASSRLS bir rolle bağlanıyor — RLS kartlarını kapatırken hangi bağlantıda ölçüldüğünü sor

- [fabrika-report-that-stops-before-the-gate-line](fabrika-report-that-stops-before-the-gate-line.md) — Bir worker raporu teşhis ve düzeltmeyle bitip doğrulama koşusuna hiç gelmeden kesilebilir — kartı kapatmadan önce raporun SON başlığına bak

- [fabrika-worker-may-finish-the-next-card-uninvited](fabrika-worker-may-finish-the-next-card-uninvited.md) — Bir worker verilmemiş bitişik kartı da yapıp commit edebilir — sonuç doğru olsa bile kapsam kararı sorulmadan alınır, kapı ölçümü kayar

- [fabrika-a-type-gate-is-void-where-casts-already-escape](fabrika-a-type-gate-is-void-where-casts-already-escape.md) — Nominal/markalı tip önermeden ÖNCE çağrı yerlerinin kaçta kaçının zaten `as unknown as` ile kaçtığını say — m6'da 19 konumun 13'ü (%68) kaçıyordu, marka onları görmüyor
- [fabrika-preapproval-covers-the-goal-not-the-sequence](fabrika-preapproval-covers-the-goal-not-the-sequence.md) — Patron spike'ı görmeden "sayılar gelince sevk et" dedi; ölçüm önerilen seçeneği değiştirdi — onayı yeniden açma, hedefi koru sırayı ölçüme uydur ve tek cümleyle söyle
- [fabrika-recall-before-delegating-not-after](fabrika-recall-before-delegating-not-after.md) — Hafızayı dalgayı dağıttıktan SONRA aradım ve paylaşılan katalog tuzağını kaçırdım — arama, alt-görev metinlerini YAZMADAN önce yapılmalı

- [fabrika-a-one-line-copy-request-can-be-a-52-surface-decision](fabrika-a-one-line-copy-request-can-be-a-52-surface-decision.md) — Patron "şu başlığı değiştir" dediğinde önce o metnin tek-kaynaklı bir sabitten gelip gelmediğine bak — Fabrika'da giriş başlığı PRODUCT_NAME'den geliyordu, istek 52 yüzeyi kapsayan marka kararıydı
- [fabrika-prove-a-single-source-constant-with-a-sentinel](fabrika-prove-a-single-source-constant-with-a-sentinel.md) — Bir sabitin gerçekten tek kaynak olduğunu kanıtlamanın ucuz yolu — değerini geçici olarak ZZTEST gibi bir nöbetçiye çevir, hangi yüzeyin onu GÖSTERMEDİĞİNE bak; göstermeyen yerde değer kopyalanmıştır

- [fabrika-a-killed-pane-may-leave-the-work-or-the-sentinel](fabrika-a-killed-pane-may-leave-the-work-or-the-sentinel.md) — "failed" bir pane işin yapılmadığı anlamına gelmez — kartı yeniden vermeden ÖNCE çalışma ağacına bak; hele kart geçici bir nöbetçi (ZZTEST gibi) söylüyorsa nöbetçi ağaçta kalmış olabilir
- [fabrika-a-reversed-premise-invalidates-work-already-shipped](fabrika-a-reversed-premise-invalidates-work-already-shipped.md) — Patron bir öncülü tersine çevirdiğinde (marka geri döndü) yeni kararı ileriye uygulamak YETMEZ — eski öncüle göre az önce sevk edilmiş işi geri tara, özellikle gerekçesi YORUMA yazılmış olanları

- [fabrika-conflict-avoidance-must-not-shrink-a-directive](fabrika-conflict-avoidance-must-not-shrink-a-directive.md) — Çakışma korkusuyla kartı iki dosyaya daralttım ve patronun marka direktifi %5 tamamlandı — tek-kaynaklı bir değerin dönüşünde ÖNCE tam yüzeyi say, sonra kapsamı böl

- [fabrika-a-todo-in-code-is-a-card-that-never-got-opened](fabrika-a-todo-in-code-is-a-card-that-never-got-opened.md) — Worker gerçek bir engele çarpınca kodda TODO bırakıp kartı kapattı — engel bir KART olur, yorum olmaz; kalması şartsa TODO kart kodunu taşımalı

- [fabrika-a-blocker-three-reports-name-is-a-card-nobody-opened](fabrika-a-blocker-three-reports-name-is-a-card-nobody-opened.md) — Üç ayrı rapor aynı çevresel engeli bağımsız bildirdi ama hiçbiri kart açmadı — herkesin "başkasının sorunu" dediği engel lidere düşer

- [fabrika-an-audit-goes-stale-while-you-write-the-card](fabrika-an-audit-goes-stale-while-you-write-the-card.md) — Paralel ofiste denetim raporu saatler içinde bayatlıyor — karta "devralınan iddiaları ÖNCE kendi ölçümünle doğrula" adımını koy; S12'de 4 iddiadan 2'si yanlış çıktı

- [fabrika-an-empty-report-skeleton-forges-a-done-signal](fabrika-an-empty-report-skeleton-forges-a-done-signal.md) — Denetim defteri "BİTTİ"yi YARIM yazılmış bir rapor dosyasına da basabiliyor — ince rapor tek başına terk edilmişlik kanıtı DEĞİL, pane ölü mü diye bak
- [fabrika-group-the-alert-pile-it-names-your-next-card](fabrika-group-the-alert-pile-it-names-your-next-card.md) — Alarm yığınını kaynağa göre grupla — ama gruplamadan SONRA "bu satırlar hâlâ var olan bir şeye mi ait" diye sor; Fabrika'da %87'si silinmiş tenant'lara aitti
- [fabrika-one-read-of-a-live-tree-is-a-frame-not-a-fact](fabrika-one-read-of-a-live-tree-is-a-frame-not-a-fact.md) — Worker'lar koşarken yapılan TEK okuma (git status, rapor dosyası, satır sayısı) hareketli bir filmin karesidir — bugün aynı hataya üç ayrı kılıkta düştüm
- [fabrika-paused-is-not-dead-check-before-adopting-wip](fabrika-paused-is-not-dead-check-before-adopting-wip.md) — Commit'siz işi sahiplenmeden önce pane CANLI mı ÖLÜ mü ölç — limit duraklatması ölüme benziyor ama worker geri dönüp kendi commit'ini atacak

- [fabrika-a-rejected-cards-blockers-may-be-cleared-by-a-later-card](fabrika-a-rejected-cards-blockers-may-be-cleared-by-a-later-card.md) — Denetimin "KAPANAMAZ" dediği kart todo'da beklerken şartlarını BAŞKA bir kart kapatmış olabilir — yeniden dağıtmadan önce denetimin şart listesini bugünkü ağaca karşı oku

- [fabrika-cross-cutting-card-must-be-intersected-with-live-panes](fabrika-cross-cutting-card-must-be-intersected-with-live-panes.md) — Çağrı yeri tabanlı (cross-cutting) bir kartı dağıtmadan önce dosya listesini CANLI pane'lerin tuttuklarıyla kesiştir — çakışan dosyalar "ölç ama DÖNÜŞTÜRME" olarak karta girer
- [fabrika-g3-passes-an-unevaluated-proposal-boss-decision-pending](fabrika-g3-passes-an-unevaluated-proposal-boss-decision-pending.md) — G3 kapısı hiç değerlendirilmemiş teklifte passed:true dönüyor ve bu genel API'ye sızıyor — denetim ölçtü (2026-09-10), patron kararı BEKLİYOR, öneri Seçenek 2
