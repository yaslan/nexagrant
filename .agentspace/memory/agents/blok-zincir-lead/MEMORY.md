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
