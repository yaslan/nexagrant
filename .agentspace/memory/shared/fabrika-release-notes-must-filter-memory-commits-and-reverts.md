---
name: fabrika-release-notes-must-filter-memory-commits-and-reverts
description: Fabrika'da git log'dan sürüm notu üretirken docs(memory)/internal docs(agent-results) commit'lerini ve fix+revert çiftlerini ayıkla — aksi halde şipariş edilmemiş "iç günlük" ürün notuna sızar
metadata:
  type: project
  updatedAt: 2026-09-10
---

TASK-MTU64VO8UILP2 (SPRINT-S12 sürüm notları) sırasında öğrenildi: bu depoda `git log --oneline dev -N`
çoğunlukla ürün değişikliği DEĞİL — Fabrika ajanları her görevden sonra `docs(memory): ...` commit'i
atıyor (bkz. CLAUDE.md hafıza disiplini) ve ayrıca çoğu kart kapanışı `docs(agent-results): ...` /
`docs(billing): close the card at HEAD` gibi tamamen dahili doğrulama commit'leri bırakıyor. 40 commit'lik
bir pencerede bunlar sayıca gerçek `fix/feat/refactor/test` commit'lerinden fazla olabiliyor.

Ayrıca aynı pencere içinde bir fix denenip sonra revert edilebiliyor (bu örnekte `3fbd210` → `2d3f5fe`,
"React import ekle" denemesi temiz build'de işe yaramadığı için geri alındı). Revert edilen bir commit'i
"şu düzeltildi" diye release notuna yazmak yanlış — HEAD'deki net durumu (hâlâ kırıktı) yansıtmalı.

**Nasıl uygulanır:** release notu / değişiklik özeti isteyen her görevde önce `git log --format='%H %s'`
ile commit tipini süz (`docs(memory)`, tek satırlık `docs(agent-results)` kart-kapanışları hariç tut),
sonra her `revert`/reverted-edilen çifti HEAD'deki net etkiye indirge, sonra kalan gerçek ürün commit'lerini
(feat/fix/refactor + varsa test) kategorilere ayır. Kapı durumu kırmızıysa (son gate/CI commit'i veya
agent-results'taki bir araştırma bunu söylüyorsa) belgenin en üstüne düz bir "Durum: kapı kırmızı" satırı
koy — CLAUDE.md "Yapma" bölümündeki "resmî" sunum yasağıyla aynı ruhta.

**2026-09-10 eki (aynı kartın devam turu):** Bir `docs/RELEASE-NOTES-<sprint>.md` görevi
verildiğinde önce o dosyanın zaten var olup olmadığını kontrol et — bu depoda önceki bir
tur zaten yazmış olabilir (bu kartta öyleydi: 40 commit'lik bir taslak duruyordu). Baştan
yazmak yerine taslağı oku, hangi commit'e kadar kapsadığını gövdesinden/footer'ından çıkar,
yalnız ondan SONRAKİ yeni commit'leri ekle.

Ayrıca: "kapı yeşil" iddiasını ölçülen commit'e sabitle, HEAD'e genelleme. Bir görev raporu
"pnpm gate yeşil, commit X" derse ve HEAD X'ten sonraki commit'leri içeriyorsa, release
notunda "son ölçülen tam koşu X'te, sonrasındaki Y ve Z ayrı ayrı (typecheck/lint/hedefli
e2e ile) doğrulandı, HEAD'de yeniden tam gate koşulmadı" diye yaz — "kapı HEAD'de yeşil"
diye tek cümleye sıkıştırma. Kaynak commit'lerin gövdesi genelde bu bilgiyi zaten taşıyor
(`git show -s --format=%B <hash>` içinde "pnpm gate green on <hash>: ..." gibi).

İlgili: [[fabrika-lint-gate-green-narrow-exceptions]]
