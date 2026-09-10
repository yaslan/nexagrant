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

## Ölçülen olay 2 (2026-09-09, fabrika/cekirdek): ORTAK KURALLAR başlığı işçileri yedi

8 maddelik bir objective'in başına 6 madde işaretli "ORTAK KURALLAR" bloğu (çakışma kuralı, commit
yetkisi, kanıt disiplini...) yazıldı ve `workers` dizisi 8 ajanla, madde sırasına EŞLEŞECEK biçimde verildi.
Bölücü preamble maddelerini de alt-görev saydı: ilk 6 worker'a **kural cümleleri** görev olarak düştü
(pane başlıkları kanıt: "COMMIT: yalnız blok-zincir-dev ve geli-tirici commit atabil…", "ÇAKIŞMA
KURALI: `pnpm dev`…"), gerçek 1. ve 2. madde listenin SONUNDAKİ iki ajana gitti:

- P0 kapı düzeltmesi (opus için yazılmıştı) → **blog-yazar/haiku**
- UBL-TR tevkifat birim testleri (opus için yazılmıştı) → **customer-support/haiku**
- 3-8. maddeler **hiç dağıtılmadı**; kural cümlesi alan 6 ajan kendi board kartlarına doğru
  doğaçlama yaptı ve şaşırtıcı biçimde kullanışlı çıktı üretti (kural-5 denetimi, i18n denetimi,
  destek metin envanteri) — ama rapor dosyaları BEKLENEN ajan adıyla değil, işi FİİLEN yapanın
  adıyla düştü (TASK-MTU64GP6UIC44-**blok-zincir-dev**.md gibi).

Sonuç zararsız çıktı (haiku'nun commit'i ce14101 bağımsız koşumda 7/7 yeşildi ve gerçek bir ürün
hatasını kapattı), ama model seçimi tamamen ıskalandı.

Kural (ek):
- `objective` içinde **madde işareti/numara YALNIZ gerçek alt-görevler için** kullanılır. Ortak kural,
  bağlam, uyarı → maddesiz düz paragraf; ya da daha iyisi **her kuralı ilgili maddenin İÇİNE** yaz.
  Madde başındaki `[agentId]` etiketi ajanı SEÇMEZ, yalnız worker'a kendini tanıtır.
- Dağıtımdan hemen sonra `agentspace_pane action=list` ile **pane başlıklarını oku**: başlık, o pane'e
  fiilen düşen metnin ilk satırıdır — eşleşme kaymasını 30 saniyede yakalatır. `delegation_status`
  bunu göstermez.
