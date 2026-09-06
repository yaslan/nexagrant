---
name: agentspace-delegate-splits-numbered-lists
description: agentspace_delegate objective'indeki numaralı/madde listesini alt-görevlere böler — tek ajana verilecek çok adımlı iş listesiz yazılmalı
metadata:
  type: reference
  updatedAt: 2026-09-06
---

`agentspace_delegate` çağrısında `objective` içindeki **numaralı ya da madde işaretli her satır ayrı bir
alt-göreve** dönüşür ve **ayrı bir worker pane'inde ayrı bir ajana** verilir. Araç açıklaması bunu
"A numbered or bulleted list is ideal — each item becomes one worker subtask" diye söylüyor; tek bir
ajana verilecek çok adımlı bir işi numaralı liste hâlinde yazmak bu yüzden işi 6 parçaya böler.

Ölçülen olay (2026-09-06, fabrika/cekirdek): tek bir "çalışma ağacı temizliği" görevi 6 maddelik
"Yapılacaklar" listesiyle gönderildi → 6 pane açıldı (geli-tirici, blok-zincir-dse, customer-support,
blockzincir-pm, ex-en, blog-yazar), altısı da **aynı git ağacını** commit etmek üzereydi.
`agentspace_pane` action=close ile paneId tek tek kapatılarak durduruldu; `git log` ile hasar
olmadığı doğrulandı (commit yok, staged yok).

Kural:
- **Tek ajana** verilecek çok adımlı iş → adımları düz paragraf/akış cümlesi olarak yaz, numaralı liste
  KULLANMA. Detay yine görev kartının `description`'ında durur (worker board'dan okur).
- **Gerçekten paralelleştirilecek** iş → her madde bağımsız scope olmalı (ayrı dosya/dizin), aksi hâlde
  dosya yarışı çıkar (bkz. [[fabrika-parallel-agent-file-race]]).
- Tek ajan hedefliyorsan `workers: [{agentId}]` ver; ama agentId **kendi takımından** olmalı, yoksa
  502 ile reddedilir (bkz. [[agentspace-cross-team-delegation-grant]]).
