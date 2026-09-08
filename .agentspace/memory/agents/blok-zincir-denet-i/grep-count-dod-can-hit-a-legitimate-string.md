---
name: grep-count-dod-can-hit-a-legitimate-string
description: Kart "indirilen dosyada `grep -c X` = 0" diyorsa önce X'in HER geçtiği yeri ayır — ürün markası ile uydurma kimlik aynı dizeyi paylaşabilir; sayıyı tutturmak için meşru olanı silme
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTS9VGEKE8N3B'nin DoD'u "indirilen dosyada `grep -c \"FonBridge\"` = 0" idi. Kusur
`tenantName: 'FonBridge Teknoloji A.Ş.'` — her kiracının belgesine basılan uydurma BAŞVURAN
KURULUŞ adı. Ama aynı dize `document-exporter.ts`'in PDF altbilgisinde de geçiyor:
"FonBridge — … doküman üretim motoru" — bu ÜRÜNÜN markası, bir kiracı kimliği değil ve
silinmemeli.

Sayıyı sıfırlamak için altbilgiyi de silmek, testi gevşetmenin aynası olurdu: ölçüyü tutturmak
için doğru olan şeyi bozmak. Yaptığım: ölçümü ayırdım — DOCX (kartın konusu olan çıktı)
`grep -c` = 0; PDF'te kalan tek isabetin ÜRÜN markası olduğunu rapora yazdım, satır numarasıyla.

**Why:** DoD'daki grep sayısı bir kestirmedir, kuralın kendisi değil. Kural "uydurma kimlik
basma". Aynı dizeyi paylaşan meşru bir kullanım varsa kestirme yanlış ölçer.

**How to apply:** Sayısal bir grep DoD'u gördüğünde önce `grep -n` ile TÜM isabetleri listele ve
her birini "kusur mu, meşru mu" diye ayır. Meşru olan varsa: ölçümü ikiye böl, raporda ikisini de
göster, meşru olana DOKUNMA. Kartın sayısını körlemesine tutturmaya çalışma.

İlgili: [[fabrika-i18n-evidence-bar-forces-whole-file]] · [[fabrika-check-every-surface-not-the-fix]]
