# HANDOVER-2 — kayıt düzenini gerçeğe oturt

**Ajan:** blockzincir-pm (PM-EN) · **Kapsam:** yalnız `docs/` (src/, tests/'e dokunulmadı) · **Tarih:** 2026-09-06

## 1. Ne yapıldı

### (a) `docs/ROADMAP.md` — 29 kutu tek tek doğrulandı
`git log`, `docs/agent-results/` ve gerçek kod (grep/find ile dosya, model, cron,
CI adımı varlığı) karşılaştırılarak her E0–E11 kutusu incelendi:

- **Uçtan uca doğrulanan** kutular `[x]` işaretlendi (18 kutu).
- **Kısmen tamamlanan** kutular `[ ]` bırakıldı ve altına `kısmi: <ne eksik>`
  notu eklendi (9 kutu) — somut eksikler:
  - `docker-compose.yml`'de redis/mailpit yok, yalnız postgres-vector + web var.
  - Sentry ve PostHog `package.json`'da hiç yok.
  - `TopicMatch` gece hesaplama cron'u yok (model var, iş yok — yalnız bir yorum
    satırında geçiyor: `src/lib/scoring/g0-canonical.ts:29`).
  - T-6 plan şablonu / görev listesi / takvim modeli/ekranı yok (`Task`/`Calendar`
    modeli şemada yok).
  - E9'da yalnız haftalık vade özeti var (`m4-weekly-summary.ts`), ayrı "60 gün
    etkileşimsiz ilişki" hatırlatma cron'u yok.
  - CI'da Lighthouse a11y ≥ 90 eşiğini uygulayan adım yok (`axe-core` de yok).
  - **KPI panosu (`dashboard/client.tsx`) gerçek değer `'0'` geldiğinde sabit
    rakamlara düşüyor** (`84.2`, `68.5`, `14.2`, `fundedOpps || 4`) — bu CLAUDE.md
    §7 "kanıt disiplini" kuralını ihlal ediyor. Bu bir kod düzeltmesi gerektirir;
    kapsam dışı olduğu için düzeltilmedi, yalnız işaretlendi.
  - K6 LLM adaptörü CLAUDE.md §5'in istediği `src/core/k6-ai/llm.ts` yolunda değil;
    `src/lib/llm.ts` ve `src/lib/ai/llm.ts` diye iki ayrı dosya var (mimari sapma,
    ayrı görev gerektirir).
- **Doğrulanamayan/operasyonel** madde bilinçli olarak işaretlenmedi: E11'in
  "10 tasarım ortağı fiilen kayıtlı, 8 haftalık beta fiilen yürütüldü" iddiası
  koddan doğrulanamaz — altyapı (onboarding CLI, fiyat anketi, ESR kalibrasyonu,
  P0-P3 triyaj) hazır ve kısmen kullanılmış, ama bu bir operasyon kanıtı ister.

### (b) `docs/agent-results/` — iki takımın raporları ayrıştırıldı
İlk geçişte yalnız `-0c1f10` dosya-adı soneği mekanik ölçüt olarak kullanıldı
(28 dosya + 2 ekran görüntüsü klasörü arşivlendi). Ardından kökte kalan
`cora`/`derin`/`defne`/`sora`/`product`-adlı dosyaların **içeriği** okununca
(her raporun "Ajan:" satırı) bunların da eski takıma ait olduğu ortaya çıktı —
dosya adı sonek taşımasa bile. Kanıt zinciri:
`.agentspace/memory/agents/blok-zincir-lead/agentspace-cross-team-delegation-grant.md`
şunu ölçüyor: *"Fabrika uzmanları (cora/defne/sora/derin) cekirdek takımında
değil"*. Örnek: `TASK-MTQ3DZS6W6DFC-product.md` dosya adında "product" yazıyor
ama içeriği `Ajan: Sora (sora-0c1f10)` diyor; `TASK-MTPZC55KNA4FU-cora.md`
içeriği `Yürüten ajan: derin-0c1f10` diyor. Bu ek 14 dosya + 2 ekran görüntüsü
klasörü + planlama dokümanı (`PLAN-E10-FINAL-20-E11-M6.md`, eski takıma iş
dağıtan doküman) da `archive-team-0c1f10/` altına taşındı.

Sonuç: kökte yalnız içeriği Çekirdek'in bilinen ajan adlarıyla imzalı 3 rapor
kaldı (`geli-tirici`, `blok-zincir-dse`, `blok-zincir-lead`) + bu rapor.

### (c) Tekilleştirme
`DALGA-1-geli-tirici.md` ile `TASK-MTQ61HQDX035M-geli-tirici.md` md5 ile
karşılaştırıldı: ikisi de `bfced4bf43b673dddf4726a3f002f34c`, 16480 bayt —
birebir aynı. Görev-kodlu dosya adı tutuldu, diğeri silindi. Arşivdeki 29
dosya arasında başka md5 çakışması yok (tek tek kontrol edildi).

### (d) `docs/agent-results/README.md`
Hangi sonekin/agent-adının hangi takım olduğu, arşiv klasörünün ne olduğu,
dosya-adı yerine **içerik** doğrulamasının neden gerekli olduğu ve yeni
raporlar için adlandırma kuralı yazıldı.

## 2. Kanıt

```
$ md5 -r docs/agent-results/DALGA-1-geli-tirici.md docs/agent-results/TASK-MTQ61HQDX035M-geli-tirici.md
bfced4bf43b673dddf4726a3f002f34c docs/agent-results/DALGA-1-geli-tirici.md
bfced4bf43b673dddf4726a3f002f34c docs/agent-results/TASK-MTQ61HQDX035M-geli-tirici.md   # (taşınmadan önce ölçüldü)

$ grep -m1 "Ajan" docs/agent-results/archive-team-0c1f10/TASK-MTQ3DZS6W6DFC-product.md
Ajan: Sora (`sora-0c1f10`) · Sprint: S8–S9 (E11 Beta) · Tarih: 2026-09-06

$ ls docs/agent-results/
archive-team-0c1f10  README.md  TASK-MTQ0BIV9UXVRU-blok-zincir-dse.md
TASK-MTQ61HQDX035M-geli-tirici.md  TASK-MTQ6CJE26N2UL-blok-zincir-lead.md

$ find docs/agent-results/archive-team-0c1f10 -maxdepth 1 -type f | wc -l
43   # dosya sayısı
$ find docs/agent-results/archive-team-0c1f10 -maxdepth 1 -type d | wc -l
5    # kendisi + 4 ekran görüntüsü klasörü

$ git log --oneline -3
4e78be0 docs(handover): archive old-team reports misfiled without the -0c1f10 tag
45dc253 docs(handover): verify ROADMAP.md checkboxes against code and git log
0f8bbea feat(db): RLS-subject fabrika_app role so tenant isolation is measurable locally
```

Her iki commit öncesinde `git diff --cached` ile sahnelenen içerik tek tek
gözden geçirildi (bu depoda paralel ajanların önceden içerik kaybettiği
bilindiği için — bkz. `[[fabrika-parallel-agent-file-race]]`).

## 3. Değişen dosyalar
- `docs/ROADMAP.md` — 29 kutu doğrulandı, kısmi notlar eklendi.
- `docs/agent-results/README.md` — yeni, sonra takım-ayrımı bölümü güncellendi.
- `docs/agent-results/DALGA-1-geli-tirici.md` — silindi (kopya).
- `docs/agent-results/*-0c1f10.md`, `TASK-MTQ3DLVLT42VF-screenshots/`,
  `E10.1-E11.1-retry-screenshots/` → `archive-team-0c1f10/` altına taşındı.
- `docs/agent-results/TASK-MTPVAYDFKQ187-cora.md` ve benzeri 13 dosya + 2 ekran
  görüntüsü klasörü + `PLAN-E10-FINAL-20-E11-M6.md` → `archive-team-0c1f10/`
  altına taşındı (içerik doğrulamasıyla, ikinci geçiş).

## 4. Riskler
- ROADMAP'teki "kısmi" notları birer görev değil, birer **bulgu**dur — board'a
  ayrı görev olarak açılmadı (bu görevin kapsamı yalnız docs/ kayıt
  düzeniydi). Özellikle KPI panosundaki sabit-rakam fallback'i (CLAUDE.md §7
  ihlali) ve K6 LLM adaptörünün yanlış dizinde olması (CLAUDE.md §5 ihlali)
  öncelikli görülmeli.
- `archive-team-0c1f10/` adı artık yalnızca "sonek taşıyan" değil, "o takıma
  ait" anlamına geliyor — ileride biri yeniden yalnız dosya adına bakarak
  sınıflandırma yaparsa aynı hata tekrarlanır. README bunu açıkça uyarıyor.
- E4/E5/E8/E9/E10'daki "kısmi" tespitler grep/find ile yapıldı; çok satırlı
  iş mantığının içine (ör. adaptörlerin ülke-filtresi mantığı, CORDIS
  worker'ın DuckDB/Parquet adımları) satır satır girilmedi — bunlar
  "doğrulanmadı" olarak işaretlendi, "yok" değil.

## 5. Açık sorular
- KPI panosundaki sabit-rakam fallback'i kim/ne zaman düzeltecek? (src/
  kapsamında, bu görevin dışında.)
- K6 LLM adaptörünün `src/core/k6-ai/llm.ts`'e taşınması mı, yoksa CLAUDE.md'nin
  güncellenmesi mi doğru yön? (mimari karar gerektirir.)
- `docs/agent-results/`'a yeni rapor yazacak her ajanın "Ajan:" satırını
  **kalıcı kimlikle** (görünen adla değil) doldurması sağlanmalı — bu
  karışıklığın kök nedeni buydu.

## 6. Sonraki adım
Board'da bu bulgulardan (KPI sabit-rakam, K6 dizin sapması, eksik cron'lar)
ayrı görevler açılabilir; şu an için yalnız ROADMAP.md'ye not düşüldü.
