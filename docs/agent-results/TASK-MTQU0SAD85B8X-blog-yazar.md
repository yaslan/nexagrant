# TASK-MTQU0SAD85B8X — ROADMAP ve PROJECT.md'yi bu dalganın kanıtlarıyla senkronla

**Ajan:** blog-yazar · **Tip:** dokümantasyon · **Sprint:** S10

## 1. Ne yapıldı

`PROJECT.md` ve `docs/ROADMAP.md`, S9–S10 dalgasının `docs/agent-results/` altındaki raporlarına ve doğrudan koda karşı doğrulanarak güncellendi. Kod dosyasına dokunulmadı.

1. **PROJECT.md** — G0 ağırlıkları satırının (81) altına, kuralın (75) ve ağırlıkların kanonik `scoreG0()`/`decideG0()`'da doğru tanımlı ama üretim kodunda hiç çağrılmadığını belirten bir dipnot eklendi.
2. **docs/ROADMAP.md**
   - E5'teki G0 puanlama satırı `[x]`'ten `[ ]`e çevrildi; aynı "üretimde çağrılmıyor" bulgusu kanıt yollarıyla eklendi.
   - E10 KPI panosu satırına, dashboard "Başarı Oranı" kartındaki büyük/küçük harf uyuşmazlığı bulgusu (TASK-MTQTYXC0NUT0B, hâlâ todo, koddan doğrulandı) eklendi.
   - Faz B (v1.1) bölümü — önceden tek satırdı — M6 Evaluator Lens, M9 Meeting Briefs + takvim senkronu ve iyzico için kanıta dayalı alt maddelere genişletildi.
   - Açık kararlar listesine 4 yeni madde eklendi (9–12): G0'ın üretime bağlanma zamanı/yeri, Evaluator Lens etiket bulgusu çelişkisi, dashboard case-mismatch düzeltmesi, M9 takvim entegrasyonunun production ön koşulları.
3. `docs/agent-results/INDEX.md` yok, `npm run results:index` script'i de yok → bu adım atlandı (talimata uygun).

## 2. Önemli bulgu: bir önceki bulgu YANLIŞLANDI

Görev tarifi "iki ölçüm proje dokümanlarını yanlışladı" diyordu; doğrulama sırasında bunun tersi bir durum da bulundu ve dokümana **öyle** yazıldı (uydurma değil, kanıtla):

- Board'daki açık **TASK-MTQTYE287FERM** ve `docs/agent-results/TASK-MTQ63RR8Z0G8E-ui-audit-customer-support.md` (bulgu #1), M6 Evaluator Lens ekranında "iç ön değerlendirme" etiketinin **olmadığını** iddia ediyor.
- Kod incelemesi: etiket hem `src/modules/m6/ui/EvaluatorForm.tsx:94` hem `src/modules/m6/ui/EvaluationDashboard.tsx:42`'de mevcut (`t('internalPreAssessment')`, `data-testid="m6-internal-badge"`; `messages/tr.json:417` ve `messages/en.json:417`'de anahtar tanımlı). Bu satır `02f7fd2` (bind Evaluator Lens UI to real tenant data) commit'inden beri kodda.
- M6 modülünde bu iki dosyadan başka UI/dışa aktarım yüzeyi yok (`find src/modules/m6 -type f` ile doğrulandı) — yani "başka bir görülmeyen ekran" ihtimali de düşük.
- Kendi hükmümü doküman içine "kesin doğru" olarak yazmadım — **çelişki** olarak, iki tarafı da kanıt yoluyla işaretleyip Açık kararlar #10'a taşıdım; kartı kapatma/açık tutma kararı bir insanın ekran görüntüsüyle doğrulamasına bırakıldı.

## 3. Kanıt

```bash
$ git log --oneline -5 -- PROJECT.md docs/ROADMAP.md   # önceki doküman güncelleme geçmişi
$ grep -n "internalPreAssessment" src/modules/m6/ui/*.tsx messages/*.json
src/modules/m6/ui/EvaluatorForm.tsx:94:        <strong>{t('internalPreAssessment')}:</strong> ...
src/modules/m6/ui/EvaluationDashboard.tsx:42:        <strong>{t('internalPreAssessment')}:</strong> ...
messages/en.json:417:    "internalPreAssessment": "Internal pre-assessment",
$ grep -n "SUBMITTED\|ABOVE_THRESHOLD" src/lib/dashboard/fetch-metrics.ts
39:  (o) => o.proposal && ['SUBMITTED', 'FUNDED', 'ABOVE_THRESHOLD'].includes(o.proposal.outcome || '')
$ git diff --stat PROJECT.md docs/ROADMAP.md
 PROJECT.md      |  2 ++
 docs/ROADMAP.md | 26 +++++++++++++++++++++++++-
$ git commit ...   # 3ab21cc
```

Kaynak raporlar okundu: `TASK-MTQ63RR8Z0G8E-blok-zincir-dse.md`, `TASK-MTQ63RR8Z0G8E-ui-audit-customer-support.md`, `TASK-MTPZL5YDY9TAW-blok-zincir-dse.md`, `TASK-MTPZLC9PI5VEH-blok-zincir-dse.md`, `TASK-MTPZL9GK4TFS1-geli-tirici.md`, `TASK-MTQ602Y8V5QOK-blog-yazar.md`.

## 4. Değişen dosyalar

- `PROJECT.md` (+2 satır, dipnot)
- `docs/ROADMAP.md` (+26/-1 satır)
- Commit: `3ab21cc` — "docs: sync PROJECT.md/ROADMAP.md to this wave's evidence (S9-S10)"

## 5. Riskler

- Board'da S9–S10'un çoğu kartı hâlâ `review` durumunda; PM kapanış doğrulaması (TASK-MTQTZNLS2CO2L) tamamlanmadan bu maddeler kesin "done" sayılmamalı — ROADMAP'te bu bilinçli olarak "kart statüsüne değil koda dayanır" notuyla belirtildi.
- M9 takvim entegrasyonu ve dashboard case-mismatch düzeltmeleri kod değişikliği gerektiriyor; bu görev kapsamında (yalnız doküman) yapılmadı.

## 6. Açık sorular

- ROADMAP Açık kararlar #10'daki etiket çelişkisi: TASK-MTQTYE287FERM ekibi (ex-en) kendi bulgusunu ekranda tekrar doğrulamalı; stale bulgu ise kart kapatılabilir.
- Açık kararlar #9 (G0'ın üretime nerede bağlanacağı) ürün/mimari kararı gerektiriyor — bu doküman görevinin kapsamı dışı.

## 7. Sonraki adım

TASK-MTQ63RR8Z0G8E (G0 üretime bağlama), TASK-MTQTYXC0NUT0B (case-mismatch fix) ve TASK-MTQTYE287FERM (etiket doğrulaması) ilgili ajanlar tarafından ele alınmalı; blockzincir-pm'in S8–S10 kapanış doğrulaması bu üç kartı ve M9/iyzico "review" kartlarını kanıtla kapatmalı.

---

## Hafıza notu

Bu turda kalıcı-faydalı olan tek şey zaten kişisel hafızama yazıldı (aşağıya bakın); bunun ötesinde kod/git'te zaten görünen bir bilgi yok.
