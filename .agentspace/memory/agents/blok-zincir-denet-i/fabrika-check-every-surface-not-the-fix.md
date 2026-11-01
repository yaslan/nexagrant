---
name: fabrika-check-every-surface-not-the-fix
description: "Kanonik hesaplayıcıya bağlandı" raporu bir yüzeyi anlatır, hepsini değil — aynı değeri okuyan her ekranı ayrı ayrı grep'le; Fabrika'da board önbellek kolonunu, detay sayfası canlı hesabı gösteriyordu
metadata:
  type: project
  updatedAt: 2026-09-07
---

TASK-MTQ63RR8Z0G8E'de kart "kanonik skorlayıcı hiç çağrılmıyor" diyordu; ölçünce **5 yüzeyin 4'ü**
önceki dalgalarda düzeltilmişti. Kalan biri sessizce yanlış cevap veriyordu ve hiçbir rapor bundan
bahsetmiyordu:

| Yüzey | Kaynak |
|---|---|
| `gates/evaluate.ts`, `pipeline/[id]/page.tsx`, `pipeline/actions.ts` | `computeG0ForOpportunity()` — canlı hesap ✅ |
| `pipeline/page.tsx` → `board.tsx` | **`Opportunity.g0Score` kolonu — ham önbellek** ❌ |

Sonuç: kanıtı olmayan bir fırsat board'da yeşil **"⭐ 92"** rozetiyle dururken, aynı fırsatın detay
sayfası **"Hesaplanamadı"** diyordu. İki ekran, aynı fırsat, iki farklı sayı — ve ikisi de "düzeltildi"
diye raporlanmış bir işin içindeydi.

**Kalıp:** bir hesap "kanonik fonksiyona bağlandı" dendiğinde, düzeltilen çağrı yolu genelde
**hesabın yazıldığı** yoldur. Aynı değeri **okuyan** yüzeyler (liste, pano, kart rozeti, dashboard
ortalaması, CSV/PDF dışa aktarımı) çoğu zaman kolonu okumaya devam eder — ve önbellek kolonu, içine
bir kez uydurma girmişse onu ölümsüzleştirir.

**Nasıl uygularım:** böyle bir kartta ilk komut düzeltme değil sayımdır —
`grep -rn "<alan>" --include="*.ts" --include="*.tsx" src/ prisma/ tests/` → her isabet için
"bu değer HANGİ satırdan geliyor" sorusunu ayrı cevapla. Yazan yol ile okuyan yolları ayır;
okuyanların her biri kendi kanıtını hak eder. Fabrika'da doğru kaynak, kolon değil, kırılımı
taşıyan kanıt kaydıdır (`TopicMatch.g0Score` + `breakdown`) — CLAUDE.md §7.

Ucuz çözüm kalıbı: kart başına yeniden hesaplama (~8 sorgu/fırsat) yerine tüm liste için **iki toplu
sorgu** ile kanıt kayıtlarını çek; kanıt kaydı olmayan kartta rozeti hiç gösterme (0 da gösterme).

İlgili: [[fabrika-fabricated-fallback-antipattern]] · [[fabrika-done-reports-can-be-wrong]] ·
[[fabrika-evidence-file-may-answer-a-different-task]]
