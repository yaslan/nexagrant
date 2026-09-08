# TASK-MTQ2KL3JO4MK2 (3. geçiş) — kapının kendi yönlendirmesi eskimişti: "rule B" bir çıkış yolu değil

**Ajan:** DEV-EN (DevOps) · **Tarih:** 2026-09-08 · **Branch:** dev
**Durum:** Görev hâlâ BLOKE (insan aksiyonu) — ama bloke artık **4 ayrı sorun değil, tek zincir**.

---

## 1. Ne yapıldı

2. geçişte blokeyi çalıştırılabilir bir kapıya çevirmiştim (`pnpm beta:esr-preflight`, çıkış kodu 1).
Bu geçişte kapının **kendi tavsiye metnini** denetledim ve iki yerde **eskimiş** buldum — ikisi de
kriteri yanlış yoldan kapatmaya davet ediyordu.

### 1.1 Kapı, çözülmüş bir kararı "önce şunu karara bağla" diye gösteriyordu
`accuracy` blokesinin tavsiyesi şuydu:

> Close açık karar #8 (rule A vs rule B) and re-measure on partner-confirmed labels.

**Açık karar #8, 2026-09-06'da patron onayıyla KAPANDI** (commit `4bee05bb`,
`docs/ROADMAP.md` madde 8): eşik **bileşik skora** uygulanır, kapı kuralı **A**'dır
(`DEFAULT_G0_RULES`), `SPEC_LITERAL_G0_RULES` yalnız kalibrasyon karşılaştırması için saklanır.
Yani kapı, iki gün önce yapılmış bir işi yeniden yapmayı öneriyordu — ve daha kötüsü, **rule B'nin
%90'ını bir seçenekmiş gibi** ima ediyordu. Bu metni okuyan biri E11.3'ü "B ile zaten %90, kriter
karşılanıyor" diye kapatabilirdi; B kapıda kullanılmayan bir kural setidir, o %90 kabul kriteri
değildir.

Tavsiye artık kararı kayıt altına alıyor ve çıkış yolunu kapatıyor: tek dürüst yol ESR-onaylı
etiketler; eşiği 20 fixture satırına uydurmak overfit'tir ve **#8'in yeniden okunmasını değil, YENİ
bir patron kararını** gerektirir.

### 1.2 Üretilmiş kalibrasyon raporu da aynı kararı "bekliyor" diye yazıyordu
`docs/CORDIS-SAMPLE-CALIBRATION.md` her koşuda yeniden üretiliyor ve içinde
**"Karar bekleyen belirsizlik: … Açık kararlar #8'de kayıtlı"** paragrafı vardı. Bu paragraf
`72b2133` (2026-09-06) ile yazılmış, karar aynı gün `4bee05bb` ile kapanmış, paragraf güncellenmemiş.
Artık kararı kapanmış olarak yazıyor ve A/B farkını "seçenek" değil "iki kural setinin ölçüm farkı"
olarak çerçeveliyor.

Paragrafın **hâlâ doğru olan kısmını kaybetmedim**: `/settings/gates` aynı sayıyı hâlâ
`"Minimum AI Alignment Score"` diye etiketliyor (doğruladım:
`src/app/[locale]/(app)/[workspace]/settings/gates/page.tsx:35`, alan `minG0Score`), oysa
`gates/evaluate.ts` onu bileşik skora uyguluyor. Bu bir **karar değil, etiket hatası** ve sahibi başka
bir kart (**TASK-MTQ63RR8Z0G8E**) — rapor artık bunu bu şekilde, sahibiyle birlikte yazıyor. O dosyaya
**dokunmadım** (kapsam dışı).

### 1.3 Dört bloke tek zincir olarak raporlanıyor
Kart "4 kırmızı" diye okununca dört ayrı sorun / dört ayrı sahip gibi görünüyor. Değil:
roster olmadan anket gitmez → anket gitmeden yanıt gelmez → yanıt gelmeden etiketler geçici kalır →
(#8 kapandığı için) %85'e giden tek dürüst yol da o etiketlerden geçer. Özet satırı artık zincirin
**başını** söylüyor, böylece kartı okuyan kişi tek bir insan aksiyonu arıyor:

```
❌ E11.3 BLOCKED — 4 blocker(s): roster, survey-sent, responses, accuracy
   — one chain, head: roster (human action); survey-sent, responses, accuracy cannot clear before it does
```

Tek bloke varken bu not **yazılmıyor** (zincir gibi göstermemek için) — testle çivilendi.

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 Kararın gerçekten kapandığının kanıtı (metin iddiası değil, commit)
```
$ git log -1 --format="%h %ad %s" --date=short -S "KARARLAŞTIRILDI (2026-09-06" -- docs/ROADMAP.md
4bee05bb 2026-09-06 docs(roadmap): close open decision #8 — G0 threshold applies to the composite score

$ git log -3 --format="%h %ad %s" --date=short -- scripts/esr-calibration.ts
0c59340 2026-09-08 feat(e11): gate the ESR calibration criterion instead of asserting it
bfa2015 2026-09-08 fix(beta): pin the ESR survey deadline and stop the calibration report claiming a survey was sent
72b2133 2026-09-06 feat(m5): calibrate the G0 gate against real evaluation outcomes   ← eskimiş paragraf buradan
```

### 2.2 Etiket hatasının hâlâ orada olduğunun kanıtı
```
$ grep -rn "Alignment" src/app messages
src/app/[locale]/(app)/[workspace]/settings/gates/page.tsx:35:
    <label …>Minimum AI Alignment Score (0-100)</label>
        value={minG0Score}
```
Yani #8'in "etiket düzeltilecek" maddesi yapılmamış. (Kapsam dışı — kaydettim, dokunmadım.)

### 2.3 Kapının bugünkü gerçek çıktısı — 4 bloke, zincir başı adıyla, çıkış kodu 1
```
$ pnpm beta:esr-preflight
✅ Sample set parsed — 20/20 samples
✅ Fixture rows in the database — 20/20/20/20
❌ Design-partner roster is deliverable — 10/10 addresses sit on a reserved, undeliverable domain — --send refuses
      → HUMAN ACTION: supply the real design-partner addresses. Keep them out of git: …
❌ Survey actually sent — no send receipt — the survey has never been delivered to anyone
❌ Partner verdicts ingested — no verdicts ingested — labels are still provisional
⚠️  Labels are ESR-confirmed — sample ids are the curated SAMPLE-* fixture; any accuracy below is provisional
❌ Accuracy ≥ 85% — rule A 80.0% < 85%
      → Rule B is NOT an escape hatch: açık karar #8 closed on 2026-09-06 (patron approval) — the gate
        rule is rule A (composite ≥ 70 + hard rules) and SPEC_LITERAL_G0_RULES is comparison-only. The
        only honest route to ≥85% is ESR-confirmed labels, i.e. the blockers above. Moving minScore to
        fit 20 fixture rows is overfitting and would need a NEW boss decision, not a re-read of #8.
⚠️  Deadline is a real commitment — 2026-09-21 is 13 day(s) away, but nothing has been sent

❌ E11.3 BLOCKED — 4 blocker(s): roster, survey-sent, responses, accuracy — one chain, head: roster
   (human action); survey-sent, responses, accuracy cannot clear before it does

$ pnpm beta:esr-preflight >/dev/null 2>&1; echo "exit=$?"
exit=1
```

### 2.4 Yeni testler ESKİ kodda GERÇEKTEN kırmızı (yeşil iddiası değil, kırmızı kanıtı)
```
$ git checkout -- src/lib/beta/esr-readiness.ts && npx vitest run tests/esr-calibration.test.ts
 × the accuracy blocker does not offer rule B as a way out
   AssertionError: expected 'Do NOT move the threshold to fit 20 f…' to match /#8 closed on 2026-09-06/
 × the summary names the head of the blocked chain, not four separate problems
   AssertionError: expected 'E11.3 BLOCKED — 4 blocker(s): roster,…' to match /one chain, head: roster …/
      Tests  2 failed | 42 passed (44)

# düzeltme geri konunca:
$ npx vitest run tests/esr-calibration.test.ts
 Test Files  1 passed (1)
      Tests  44 passed (44)        # önce 41 idi: +3
```

### 2.5 Ölçüm değişmedi — yalnız metin değişti (regresyon koruması)
```
$ pnpm beta:esr-calibration      # kuru koşum, DB'ye yazmaz
  [score] rule A (composite ≥ 70): accuracy 80.0%
  [score] rule B (spec literal, no composite): accuracy 90.0%
  [sweep] best threshold 54 → accuracy 95.0%

$ git diff --stat docs/CORDIS-SAMPLE-CALIBRATION.md
 docs/CORDIS-SAMPLE-CALIBRATION.md | 6 ++++--
 1 file changed, 4 insertions(+), 2 deletions(-)
```
Değişen 4 satır: üretim damgası + iki paragraf. Tek bir metrik, tek bir matris hücresi oynamadı.

### 2.6 Tip + lint
```
$ npx tsc --noEmit -p tsconfig.json | grep -E "esr-readiness|esr-calibration|esr-send-receipt"
NONE of my files appear in tsc output

$ npx eslint scripts/esr-calibration.ts src/lib/beta/esr-readiness.ts tests/esr-calibration.test.ts
LINT CLEAN
```

### 2.7 Süitteki 4 kırmızı BENİM DEĞİL (kanıtlandı)
```
$ npx vitest run
 Test Files  1 failed | 118 passed | 2 skipped (121)
      Tests  4 failed | 1352 passed | 8 skipped (1364)
 FAIL  tests/efatura-foreign-currency.test.ts   ← git'te takipsiz (??), TASK-MTSWLWDONWA3W'nin işi

$ grep -c "esr\|beta" tests/efatura-foreign-currency.test.ts
0                                   # benim dosyalarımı hiç import etmiyor

$ git stash push -- <benim 4 dosyam> && npx vitest run tests/efatura-foreign-currency.test.ts
      Tests  4 failed | 3 passed (7)     # değişikliklerim yokken de aynı 4 kırmızı
$ git stash pop                          # geri alındı
```
(2. geçişteki 4 kırmızı `src/lib/iyzico.test.ts`'teydi ve **artık yeşil** — o ajan ilerlemiş.)

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/beta/esr-readiness.ts` | `accuracy` tavsiyesi güncellendi (#8 kapalı, B çıkış yolu değil); `CHAIN` sabiti + özet satırına zincir-başı notu |
| `scripts/esr-calibration.ts` | "Karar bekleyen belirsizlik" paragrafı → "Karar KAPANDI" + ayrı "kalan tutarsızlık: etiket hatası (TASK-MTQ63RR8Z0G8E)" paragrafı |
| `tests/esr-calibration.test.ts` | +3 test (41 → 44): tavsiye #8'i kapatmaya çağıramaz, özet zincir başını söyler, tek bloke zincir gibi gösterilmez |
| `docs/CORDIS-SAMPLE-CALIBRATION.md` | üretilmiş dosya, yeniden üretildi (yalnız iki paragraf + damga) |

Veritabanına yazma **yok**, e-posta gönderimi **yok**, sır/PII repoya girmedi. `/settings/gates`
sayfasına **dokunulmadı** (başka kartın kapsamı).

## 4. Geri alma

```bash
git revert <bu-commit-sha>
pnpm beta:esr-calibration      # üretilmiş raporu eski metinle tazele (kuru koşum, DB'ye yazmaz)
```
Yan etki yok: DB'ye yazılmadı, mail atılmadı, makbuz üretilmedi. Geri alma yalnız metni eski
(eskimiş) haline döndürür; hiçbir ölçüm değişmez.

**İzleme/uyarı:** 2. geçişteki karar sürüyor — `pnpm beta:esr-preflight` operatör komutu olarak
kalıyor, `pnpm gate`'e **eklenmedi** (DB'ye ve E11 operasyonuna bağlı; kapıyı sürekli kırardı).
E11.3 açıkken kırmızı, kapanabilir hâle geldiği gün yeşil.

---

## 5. Riskler

1. **Bu geçiş de blokeyi çözmez.** Gerçek design-partner roster'ı gelmeden E11.3 kapanmaz. Bu geçişin
   ürettiği şey, yanlış bir kapanış yolunu (B kuralı %90) kapatmaktır.
2. **Kapı metinleri eskiyebilir — bu ikinci kez oldu.** Tavsiye metni bir kararı işaret ediyorsa,
   karar kapandığında metin sessizce yanlışa döner. Testler artık bu iki cümleyi çiviliyor ama genel
   çözüm değil.
3. `/settings/gates` etiketi hâlâ yanlış; kullanıcı "AI Alignment Score" sanıp bileşik skor eşiğini
   değiştiriyor. Kapsam dışı bıraktım, sahibi TASK-MTQ63RR8Z0G8E.
4. 2. geçişin makbuz-taşınabilirliği riski **duruyor**: makbuz gitignore'lu dizinde, başka bir
   makinede preflight "gönderilmedi" der.

## 6. Açık sorular

1. **Gerçek design-partner roster'ı kim, ne zaman verecek?** (1. geçişten beri açık — üçüncü kez
   soruyorum, hâlâ cevapsız. Zincirin tek başı bu.)
2. `ESR_SURVEY_DEADLINE = 2026-09-21` bugün 13 gün uzakta ve kimseye tebliğ edilmedi; anket gönderim
   günü +14 olarak yeniden çivilenecek. Roster 2026-09-07'den sonra gelirse **21 Eylül tarihi
   matematiksel olarak tutulamaz** — sprint sahibi bunu bilerek mi taşıyor?
3. Etiket düzeltmesi (#8'in son cümlesi) TASK-MTQ63RR8Z0G8E'de gerçekten planlı mı, yoksa kart
   kapandı da madde mi unutuldu?

## 7. Sonraki adım

Değişmedi (2. geçişten). Roster geldiğinde, **açık onayla**:
```bash
pnpm beta:esr-preflight                                   # önce: neyin bloke olduğunu gör
pnpm tsx scripts/esr-calibration.ts --roster=/secure/path/partners.csv \
    --apply --survey --send --deadline=<gönderim+14>      # gerçek mail — geri alınamaz
pnpm beta:esr-preflight                                   # "Survey actually sent" ✅ olmalı
cat docs/BETA_DATA/generated/esr-calibration/survey/*.responses.csv > /secure/path/responses.csv
pnpm tsx scripts/esr-calibration.ts --responses=/secure/path/responses.csv --apply
pnpm beta:esr-preflight                                   # kapanabiliyorsa çıkış kodu 0
```
Kart ancak bu komut **0** döndüğünde `done` işaretlenmeli. Kart bu geçişte de `in_progress` bırakıldı.
