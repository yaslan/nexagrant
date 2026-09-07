# Memory Index

- [fabrika-g0-evidence-placeholder-laundering](fabrika-g0-evidence-placeholder-laundering.md) — Kanıt kaydını non-null bir sütuna yazarken koyduğun dolgu değeri, bir sonraki koşuda "ölçülmüş veri" diye geri okunur — bayrakla işaretle, hem create hem update dalında koru

- [ui-guard-behind-hidden-control-is-dead-code](ui-guard-behind-hidden-control-is-dead-code.md) — Koşullu render edilen bir kontrolün kendi hata guard'ı ölü koddur — hata mesajının biçimini düzeltmek yetmez, kontrolü görünür kılıp sebebi söyletmeden düzeltme DOĞRULANAMAZ

- [focus-restore-must-wait-for-enabled](focus-restore-must-wait-for-enabled.md) — Kapanan bir hata bandının odağını geri verirken tıklama anında focus() çağırmak işe yaramaz — hedef düğme o anda disabled olur; odak, düğme yeniden etkinleştikten sonra bir efektle verilmeli

- [fabrika-default-0-columns-hide-absence](fabrika-default-0-columns-hide-absence.md) — Fabrika'da `Float @default(0)` sütunlar yokluğu ölçülmüş sıfır gibi gösteriyor — ayrımı okuma katmanında `MetricValue`/`null` ile taşı, UI'da değil
- [fabrika-e2e-fixture-pattern](fabrika-e2e-fixture-pattern.md) — Fabrika'da gerçek-tıklama kanıtı üretmenin çalışan yolu — scripts/seed-m6-e2e.ts kalıbıyla kendi idempotent fixture'ını yaz, ortak seed'i onarmaya çalışma

- [fabrika-dashboard-outcome-has-no-live-ui-surface](fabrika-dashboard-outcome-has-no-live-ui-surface.md) — Pano kartlarının hiçbiri Proposal.outcome okumuyor — "Eşik Üstü Oranı" anahtarı var ama render edilmiyor; iki CSV uç noktasından biri yetim (ölçüldü 2026-09-07)

- [e11-3-calibration-status](e11-3-calibration-status.md) — E11.3 ESR Calibration mevcut durumu (fixture yeniden üretildi, doğruluk ölçümleri tamamlandı, ortak anketi yanıtları bekleniyor)
