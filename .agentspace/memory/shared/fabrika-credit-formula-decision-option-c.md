---
name: fabrika-credit-formula-decision-option-c
description: Patron kararı 2026-09-08 — YZ kredi fiyatı token'dan hesaplanmaz, docs/BILLING.md'de yayımlanmış eylem-başına rakamdan gelir (Seçenek C); M7=1 ve M6:esr-parser=0 onaylandı
metadata:
  type: project
  updatedAt: 2026-09-08
---

2026-09-08 patron kararı (TASK-MTSXGXBCJ007W). Depoda bir YZ çağrısı ÜÇ ayrı fiyatla
ücretlendiriliyordu: `src/lib/ai/llm.ts` formülü `max(1, ceil(toplam/10000))`,
`src/lib/llm.ts` formülü `ceil(giriş/1000)×1 + ceil(çıkış/1000)×3`, ve `docs/BILLING.md`'nin
**eylem-başına** tablosu (M2=1, M6=3…) — ki kodda hiç karşılığı yoktu. Aynı 4.000/1.000
tokenlık çağrı bir yoldan 1, diğerinden 7 kredi (12K/3K'da 10,5×) düşüyordu; dahası M2
içinde bile ekrana göre değişiyordu.

**KARAR: Seçenek C — kod dokümana uyar.** Kredi token'dan HESAPLANMAZ; `catalog.ts`'teki
yayımlanmış eylem-başına rakamdan okunur (`creditsForUsage({module, purpose, ...})`).
Token'lar `AiUsageLog`'a yazılmaya devam eder (ileride katsayı uygulanabilsin).
Gerekçe: A ve B "iki yanlıştan birini seç"ti — hangisi seçilse müşteriye satılan doküman
yanlış kalıyordu ve kart bir sonraki denetimde yeniden açılacaktı.

Yayımlanmamış iki rakam da **onaylandı**:
- `M7` (tto_ip_checklist) = **1** — M9 brifing ve M10 belge de 1; aynı şekil (tek tık, tek belge).
- `M6:esr-parser` = **0** — üretimde çağıranı yok (yalnız `tests/modules/esr-parser.test.ts`
  import ediyor); bağlandığında M6 değerlendirmesinin alt adımı olacak ve M6 zaten 3 tahsil
  ediyor. Ayrıca ücretlendirmek aynı kullanıcı eylemini iki kez faturalamak olurdu.

Gömme (`embedText`) `credits: 0` KALIR — BILLING.md gömmeyi fiyatlamıyor, uydurma rakam yasak.
Varsayılan model önerisi: genel `claude-sonnet-5`, M6 değerlendirme `claude-opus-5`
(itiraz gelmedi, varsayım olarak sürüyor). UYARI: Sonnet 5 / Opus 5'te `temperature`
kaldırıldı — gönderilirse istek 400 döner.

Bkz. [[fabrika-verify-the-tree-not-just-the-report]] — bu kararın Faz 1'i bir ara onaysız
uygulanmıştı, ağaçtan yakalandı.
