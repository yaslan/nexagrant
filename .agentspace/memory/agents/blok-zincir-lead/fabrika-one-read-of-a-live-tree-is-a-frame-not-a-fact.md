---
name: fabrika-one-read-of-a-live-tree-is-a-frame-not-a-fact
description: Worker'lar koşarken yapılan TEK okuma (git status, rapor dosyası, satır sayısı) hareketli bir filmin karesidir — bugün aynı hataya üç ayrı kılıkta düştüm
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

2026-09-10, yedi worker'ın aynı `dev` ağacında koştuğu gün. Aynı hatayı **üç ayrı biçimde**
yaptım; üçünde de tek bir okumayı kalıcı bir gerçek sandım:

| Ne okudum | O anki değer | Gerçek |
|---|---|---|
| Alarm raporu (`-customer-support.md`) | 22 satır, hepsi `_(doldurulacak)_` | Yazılırken yakalamışım; bitince **339 satır**, commit'li |
| `git status` — yasal sayfalar | commit'siz, "sahipsiz" | Sahibi canlıydı, saniyeler sonra `fe4685a` ile commit'ledi |
| `git status` — P0 fatura kimliği | commit'siz | İnerken okumuşum; `1233f4b` ile commit'li |
| Alarm sayısı (karta yazdığım) | 106, "bilinen gerçek" | Dört dakikada 260→263; kartı yazarken **2,5 kat bayattı** |

İlk üçünde yanlış hüküm verdim (biri kartı gereksiz yeniden dağıttırdı, biri beni komşunun
commit'iyle yarıştırdı), dördüncüsünde worker uymayıp yeniden ölçtüğü için kurtulduk.

**Kural:** Ekip koşarken ağaç bir DURUM değil bir AKIŞtır. Tek okumadan "yok / bitmemiş /
terk edilmiş" hükmü çıkarma. Bir okuma ancak şu ikisinden biriyle hükme dönüşür:
1. **İkinci bir okuma** (zaman damgalı), ya da
2. **Pane'in ölü olduğu** (`agentspace_delegation_status` → `pane AYAKTA` YOK).

Pratikte: `git log`/`docs/agent-results` izleyen Monitor zaten kurulu — **bir vuruş bekle**,
sonra hüküm ver. Bekleme maliyeti dakikalar; yanlış hükmün maliyeti biten işi yeniden
dağıtmak ya da sahibiyle commit yarışına girmek.

Karta sayı yazarken de aynısı: ölçümü "bilinen gerçek, tekrarlama" diye DAYATMA, "şu anda şuydu,
ÖNCE kendi ölçümünü al" diye ver ([[fabrika-an-audit-goes-stale-while-you-write-the-card]]).

İlgili: [[fabrika-paused-is-not-dead-check-before-adopting-wip]] ·
[[fabrika-an-empty-report-skeleton-forges-a-done-signal]] ·
[[fabrika-group-the-alert-pile-it-names-your-next-card]] — üçü de bu kuralın birer yüzü.
