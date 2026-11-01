# TASK-MTQ2KL3JO4MK2 (4. geçiş) — geri alınamaz adım tekrar koşulabilir DEĞİLDİ: `--send` artık devam ediyor, tekrarlamıyor

**Ajan:** DEV-EN (DevOps) · **Tarih:** 2026-09-08 · **Branch:** dev
**Durum:** Görev hâlâ BLOKE (insan aksiyonu: gerçek design-partner roster'ı). Bu geçiş blokeyi çözmez —
**bloke kalkacağı gün patlayacak olan tuzağı** kaldırır.

---

## 1. Ne yapıldı

Önceki üç geçiş blokeyi ölçülebilir hale getirdi. Bu geçişte, blokenin **kalktığı andaki** ilk komutu
denetledim: `--survey --send`. Orada rolümün en temel kuralının çiğnendiğini buldum — *otomasyon
tekrar koşulabilir (idempotent) olsun*.

### 1.1 Tek geri alınamaz adım, tek idempotent OLMAYAN adımdı

Betiğin kendi başlığı şunu vaat ediyor:

> *"Every database write is an upsert on a deterministic id, so a second run converges instead of
> duplicating. **Running twice is safe** and is part of the definition of done."*

Bu vaat yalnız **DB yazmaları** için doğruydu. `--send` için hiçbir koruma yoktu: ikinci bir
`--survey --send`, makbuzda kayıtlı olsun olmasın **on ortağın hepsine anketi ikinci kez** yolluyordu.
Ve bu teorik bir senaryo değil — en olası senaryo:

> Resend roster'ın ortasında bir adresi reddediyor (`Resend rejected …` fırlatılıyor, koşu ölüyor).
> Operatörün doğal refleksi komutu tekrar çalıştırmak. Eski kodda bu, zaten anketi almış ve belki
> yanıtlamış 6 ortağa **ikinci bir kopya** göndermek demekti. Geri alınamaz.

Artık `--send` **devam ediyor (resume), tekrarlamıyor (repeat)**:
- Makbuzda kayıtlı ortaklar atlanır, yalnız eksik kalanlara gider.
- Teslim edilecek kimse kalmamışsa koşu **reddeder** — herkese ikinci kopya atmaz.
- `--resend` bilinçli, loglanan bir override; `--send` olmadan verilirse reddedilir.
- Makbuz artık **birleştiriliyor** (`mergeRecipients`): devam eden koşu, önceki koşunun kime mail
  attığının kanıtını silmiyor. (Eskisi dosyayı kendi gönderdikleriyle yeniden yazıyordu.)

### 1.2 Kapı, göremediği şey hakkında kesin konuşuyordu

`survey-sent` blokesi şunu diyordu: *"the survey has **never been delivered to anyone**"*.
Makbuz `docs/BETA_DATA/generated/` altında ve **gitignore'lu** — yani bu cümle yalnızca *bu makinede
kayıt yok* demeye yeterli. Başka bir makineden gönderilmiş bir anket burada görünmez, ve kapı bunu
"hiç gönderilmedi" diye okuyunca **ikinci bir gerçek gönderime davetiye** çıkarıyordu. (Bu risk 2.
geçişten beri raporlarda "açık risk" olarak duruyordu; artık kapının kendi metninde.)

Yeni metin ne bildiğini ve ne bilmediğini ayırıyor, ve `--send`'in yalnız **yerel** makbuzu
gördüğünü söylüyor.

### 1.3 Deadline aritmetiği: "13 gün var" rahatlatıcıydı ve yanlıştı

Kapı `2026-09-21 is 13 day(s) away` diyordu; kendi tavsiyesi ise `send-day + 14`. İkisi aynı anda
doğru olamaz: **bugün gönderilse bile** ortaklara 14 günlük pencere verilemez, yani sabitlenmiş tarih
zaten tutulamaz durumda. Kapı artık bu çıkarmayı yapıyor (`ESR_SURVEY_WINDOW_DAYS = 14` sabiti eklendi
— sayı bir tavsiye cümlesinin içinde gömülü olduğu sürece hiçbir şey onu kontrol edemiyordu).

Bu, 3. geçişin **açık soru #2**'siydi. Artık bir soru değil, kapının söylediği bir olgu.

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 Yeni testler ESKİ kodda GERÇEKTEN kırmızı
```
$ git show HEAD:src/lib/beta/esr-readiness.ts > src/lib/beta/esr-readiness.ts   # eski kod
$ npx vitest run tests/esr-calibration.test.ts
 × a missing receipt is reported as no local proof, not as proof of no send
   AssertionError: expected 'no send receipt — the survey has neve…' not to match /never been delivered to anyone/
 × a pinned deadline closer than the answering window is reported as unreachable
   AssertionError: expected '2026-09-21 is 13 day(s) away, but not…' to match /can no longer give partners the 14-da…/
      Tests  2 failed | 50 passed (52)

$ # düzeltme geri konunca:
      Tests  52 passed (52)          # önce 44 idi: +8
```

### 2.2 Gerçek koşum — TEKRAR GÖNDERİM REDDİ (10/10 makbuzda)
Güvenlik tasarımı: `RESEND_API_KEY` **unset** koşuldu. Korumam çalışmazsa tek olası sonuç
"anahtar yok" hatası olurdu — hiçbir koşulda gerçek mail çıkamazdı.
```
$ env -u RESEND_API_KEY npx tsx scripts/esr-calibration.ts --survey --send \
    --roster=<10 teslim-edilebilir adres> --out=<tmp>
❌ --send refused: every partner on this roster (10) is already in the send receipt
   (last accepted 2026-09-08T10:00:00.000Z). There is nothing left to deliver, and re-sending
   would mail partners who have already answered. Pass --resend to deliver a second copy on purpose.
```

### 2.3 Gerçek koşum — DEVAM (makbuz 8/10, 2 eksik)
```
  [survey] resuming: 8 partner(s) already in the receipt will be skipped — beta-anadolu-teknoloji,
           beta-ege-arge, beta-bogazici-tto, beta-odtu-arge, beta-marmara-danismanlik,
           beta-ankara-kume, beta-izmir-belediye, beta-benelux-innov
  [survey] beta-anadolu-teknoloji: already sent 2026-09-08T10:00:00.000Z — skipped
  … (8 satır)
❌ --send requires RESEND_API_KEY in the environment
```
Son satır kanıtın kendisi: koşu **9. ortağa** (ilk eksik olan `beta-iberia-research`) kadar geldi;
ilk 8'e mail denemesi bile yapmadı.

### 2.4 AYNI girdiyle ESKİ kod — hiç kimseyi atlamıyor
```
$ git show HEAD:scripts/esr-calibration.ts > scripts/esr-calibration.ts    # eski kod, yerinde
$ env -u RESEND_API_KEY npx tsx scripts/esr-calibration.ts --survey --send --roster=<aynı> --out=<aynı>
❌ --send requires RESEND_API_KEY in the environment      ← TEK satır, hiç "skipped" yok
```
Eski kod **1. ortakta** (makbuzda zaten kayıtlı olan `beta-anadolu-teknoloji`) mail göndermeye
çalıştı. Anahtar olsaydı o ortak anketi ikinci kez alacaktı. Öncesi/sonrası farkı bu.

### 2.5 `--resend` bilinçli ve loglu; yanlış kullanımı reddediliyor
```
$ … --survey --send --resend
  [survey] --resend: mailing 8 partner(s) a SECOND copy on purpose — this cannot be undone

$ npx tsx scripts/esr-calibration.ts --resend
❌ --resend only means anything with --send
```

### 2.6 Bugünkü gerçek kapı çıktısı (değişen iki satır)
```
$ pnpm beta:esr-preflight
❌ Survey actually sent — no send receipt on this machine — no proof the survey was ever delivered
   (the receipt lives under docs/BETA_DATA/generated/, which is gitignored, so a send from another
   machine leaves no trace here)
      → … Confirm with whoever else operates this script first — this check cannot see their
        receipt, and --send only skips partners recorded in the LOCAL one.
⚠️  Deadline is a real commitment — 2026-09-21 is only 13 day(s) away and nothing has been sent —
   it can no longer give partners the 14-day window, so it is already a date that must be re-pinned,
   not met

❌ E11.3 BLOCKED — 4 blocker(s): roster, survey-sent, responses, accuracy — one chain, head: roster …
$ echo $?    →  1
```
Ölçüm değişmedi: rule A hâlâ **%80**, bloke sayısı hâlâ **4**, zincir başı hâlâ **roster**.

### 2.7 Tip + lint + tam süit
```
$ npx tsc --noEmit -p tsconfig.json | grep -E "esr-|constants"
none of my files appear in tsc output

$ npx eslint scripts/esr-calibration.ts src/lib/beta/esr-{readiness,send-receipt}.ts \
    src/lib/beta/constants.ts tests/esr-calibration.test.ts
LINT DONE (temiz)

$ npx vitest run
 Test Files  120 passed | 2 skipped (122)
      Tests  1370 passed | 8 skipped (1378)
```
(3. geçişteki 4 kırmızı `tests/efatura-foreign-currency.test.ts`'teydi ve **artık yeşil** — o ajan bitirmiş.)

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/beta/esr-send-receipt.ts` | +`partitionBySent` (gönderilmiş/eksik ayrımı), +`mergeRecipients` (önceki kanıtı koruyarak birleştir) — ikisi de saf fonksiyon |
| `scripts/esr-calibration.ts` | `--send` devam eder/tekrarlamaz: atlama kümesi, "teslim edilecek kimse yok" reddi, `--resend` override, yerel-makbuz uyarısı, makbuz birleştirme; başlık ve flag dokümantasyonu |
| `src/lib/beta/esr-readiness.ts` | `survey-sent` artık göremediği şey hakkında kesin konuşmuyor; `deadline` pencere aritmetiğini yapıyor; +`windowDays` girdisi |
| `src/lib/beta/constants.ts` | +`ESR_SURVEY_WINDOW_DAYS = 14` (tavsiye cümlesine gömülü sayı → kontrol edilebilir sabit) |
| `tests/esr-calibration.test.ts` | +8 test (44 → 52): devam/red/override/birleştirme + iki fazla-iddia düzeltmesi |

Veritabanına yazma **yok**, **hiçbir mail gönderilmedi** (tüm koşumlar `RESEND_API_KEY` unset ile),
sır/PII repoya girmedi. Test roster'ı yalnız scratchpad'de, `@example.example.com` (sahte) adreslerle.
`/settings/gates` ve `docs/CORDIS-SAMPLE-CALIBRATION.md`'ye **dokunulmadı**.

---

## 4. Geri alma

```bash
git revert <bu-commit-sha>
```
Yan etki yok: DB'ye yazılmadı, mail atılmadı, makbuz üretilmedi (test makbuzları scratchpad'de).
Geri alma `--send`'i eski **tekrar-gönderen** haline döndürür — yani geri almak, düzeltmeyi kaybetmektir;
geri alınacaksa yerine bir koruma konmalı.

**İzleme/uyarı:** değişmedi — `pnpm beta:esr-preflight` operatör komutu olarak kalıyor, `pnpm gate`'e
eklenmedi (DB'ye ve E11 operasyonuna bağlı; kapıyı sürekli kırardı).

---

## 5. Riskler

1. **Bu geçiş de blokeyi çözmez.** Gerçek roster gelmeden E11.3 kapanmaz. Bu geçişin ürettiği şey,
   bloke kalktığı gün ilk komutun ortaklara çift mail atmasını önlemek.
2. **Makbuz hâlâ makineye özel.** Artık kapı bunu *söylüyor* ve `--send` uyarıyor, ama teknik olarak
   çözmüyor: iki farklı makineden gönderim yapılırsa ikisi de birbirini görmez. Gerçek çözüm makbuzu
   paylaşılan bir yere (DB satırı ya da R2) taşımak; PII taşıdığı için bu ayrı bir karar/kart —
   **kendi başıma taşımadım**.
3. `--resend` gerçek bir silah: verildiğinde ikinci kopya gider. Log'la ve tek satırlık uyarıyla
   korunuyor, ek onay istemiyor.
4. `/settings/gates` etiket hatası hâlâ orada (sahibi **TASK-MTQ63RR8Z0G8E**) — kapsam dışı.

## 6. Açık sorular

1. **Gerçek design-partner roster'ı kim, ne zaman verecek?** (1. geçişten beri açık — **dördüncü kez**
   soruyorum. Zincirin tek başı bu; kart bu cevap gelmeden kapanamaz.)
2. ~~21 Eylül tutulabilir mi?~~ **Cevaplandı, hayır.** Kapı artık kendisi söylüyor: bugün gönderilse
   bile 14 günlük pencere verilemez. `ESR_SURVEY_DEADLINE` gönderim günü + 14 olarak yeniden
   çivilenmeli — sprint sahibi bunu bilerek mi taşıyor?
3. Makbuz paylaşılan bir yere taşınsın mı (risk #2)? PII kararı gerektiriyor.

## 7. Sonraki adım

Roster geldiğinde, **açık onayla** — komut zinciri değişmedi ama artık kesintiye dayanıklı:
```bash
pnpm beta:esr-preflight                                   # önce: neyin bloke olduğunu gör
# ESR_SURVEY_DEADLINE'ı gönderim günü + 14 olarak güncelle (kapı bunu söylüyor)
pnpm tsx scripts/esr-calibration.ts --roster=/secure/path/partners.csv \
    --apply --survey --send --deadline=<gönderim+14>      # gerçek mail — geri alınamaz
# YARIDA KESİLİRSE: aynı komutu tekrar çalıştır. Artık kalan ortaklara devam eder,
# baştakilere ikinci kopya ATMAZ. Bilerek ikinci kopya için: --resend
pnpm beta:esr-preflight                                   # "Survey actually sent" ✅ olmalı
cat docs/BETA_DATA/generated/esr-calibration/survey/*.responses.csv > /secure/path/responses.csv
pnpm tsx scripts/esr-calibration.ts --responses=/secure/path/responses.csv --apply
pnpm beta:esr-preflight                                   # kapanabiliyorsa çıkış kodu 0
```
Kart ancak bu komut **0** döndüğünde `done` işaretlenmeli. Kart bu geçişte de `in_progress` bırakıldı.
