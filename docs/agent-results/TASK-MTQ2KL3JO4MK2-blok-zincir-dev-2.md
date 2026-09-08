# TASK-MTQ2KL3JO4MK2 (2. geçiş) — E11.3 blokesi artık makineyle ölçülüyor

**Ajan:** DEV-EN (DevOps) · **Tarih:** 2026-09-08 · **Branch:** dev
**Durum:** Görev hâlâ BLOKE (insan aksiyonu bekliyor) — ama bloke artık **beyan değil, kapı**.

---

## 1. Ne yapıldı

1. geçişte blokeyi teşhis etmiştim: roster placeholder → `--send` reddediyor → hiçbir ortağa anket
gitmedi → 21 Eylül'de veri gelmesi imkânsız; ayrıca A kuralı doğruluğu %80 < %85. Teşhis bir rapor
satırıydı ve **eskiyordu**: raporu okumayan biri kartı "yanıt bekliyoruz" diye açık tutmaya devam
edebiliyordu. Bu geçişte teşhisi çalıştırılabilir bir kapıya çevirdim.

### 1.1 `pnpm beta:esr-preflight` — salt-okunur hazırlık kapısı
E11.3 kabul kriterinin **sekiz ön koşulunu** tek komutta ölçen, hiçbir şey yazmayan/göndermeyen,
bloke varken **çıkış kodu 1** dönen bir mod (`scripts/esr-calibration.ts --preflight`). Her kırmızı
satır, onu açacak **insan aksiyonunu adıyla** yazıyor. `--apply/--survey/--send/--rollback` ile
birleştirilmesi reddediliyor — "bunu koşmak hiçbir şeyi değiştirmez" garantisi ancak böyle doğru
kalır.

### 1.2 Gönderim makbuzu — geri alınamaz adımın denetim izi
`--send` on gerçek ortağa mail atıyor ve bugüne kadar **hiçbir iz bırakmıyordu**: gönderilmiş bir
anketle yalnızca diske render edilmiş bir anket dosya sisteminde birbirinin aynısı. "Anket gerçekten
gitti mi?" sorusu — beklemenin anlamlı olup olmadığını belirleyen tek soru — cevaplanamıyordu. Artık
her kabul edilen gönderimden **sonra** `survey/send-receipt.json` yazılıyor (kısmi gönderimde bile
kime ulaştığı kayıtlı), preflight bunu okuyor. Makbuz `--rollback` ile **silinmiyor**: kiracı satırı
geri alınabilir, on ortağa giden mail geri alınamaz.
PII: makbuz gitignore'lu dizinde ve adresi maskeli tutuyor (`p******@…`); gönderim logu da artık
tam adres yerine `slug + maskeli adres` yazıyor.

### 1.3 Kendi kendini test eden dosyanın kriteri kapatması engellendi
`docs/BETA_DATA/esr-survey-responses.example.csv` bir harness self-test'i ve **%85 üretiyor**.
Preflight bu dosyayı adından değil, başlığındaki `HARNESS SELF-TEST` işaretinden tanıyor (kopyalayıp
yeniden adlandırarak bulguya dönüştürülemesin) ve doğruluk ✅ olsa bile kriteri kapatmayı reddediyor.

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 Kapı, bugünkü gerçek durumda — 4 bloke, çıkış kodu 1
```
$ pnpm beta:esr-preflight
🎯 ESR calibration (E11.3)
   mode      : PREFLIGHT (read-only)

✅ Sample set parsed — 20/20 samples
✅ Fixture rows in the database — 20/20/20/20
❌ Design-partner roster is deliverable — 10/10 addresses sit on a reserved, undeliverable domain — --send refuses
      → HUMAN ACTION: supply the real design-partner addresses. Keep them out of git: docs/BETA_DATA/beta-partners.local.csv (gitignored) or --roster=/secure/path/partners.csv.
❌ Survey actually sent — no send receipt — the survey has never been delivered to anyone
      → After the roster is real, with explicit approval: pnpm beta:esr-calibration --roster=<real> --survey --send (this sends real mail and cannot be undone).
❌ Partner verdicts ingested — no verdicts ingested — labels are still provisional
      → cat <out>/survey/*.responses.csv > /secure/path/responses.csv && pnpm beta:esr-calibration --responses=… --apply
⚠️  Labels are ESR-confirmed — sample ids are the curated SAMPLE-* fixture; any accuracy below is provisional
❌ Accuracy ≥ 85% — rule A 80.0% < 85%
      → Do NOT move the threshold to fit 20 fixture rows — that is overfitting, not calibration. Close açık karar #8 (rule A vs rule B) and re-measure on partner-confirmed labels.
⚠️  Deadline is a real commitment — 2026-09-21 is 13 day(s) away, but nothing has been sent — no partner has ever seen this date

❌ E11.3 BLOCKED — 4 blocker(s): roster, survey-sent, responses, accuracy

$ pnpm beta:esr-preflight >/dev/null 2>&1; echo "exit=$?"
exit=1
```

### 2.2 Yakaladığı gerçek tuzak — self-test dosyası %85 gösteriyor, kapı yine de kapanmıyor
```
$ pnpm tsx scripts/esr-calibration.ts --preflight --responses=docs/BETA_DATA/esr-survey-responses.example.csv
❌ Partner verdicts ingested — 8 verdicts read from the committed self-test file — these are not partner answers
✅ Accuracy ≥ 85% — rule A 85.0%
❌ E11.3 BLOCKED — 3 blocker(s): roster, survey-sent, responses
```
Yani kriter, "doğruluk yeşile döndü" diye **kapatılamıyor**; yeşili üreten girdinin ne olduğu da
kontrol ediliyor.

### 2.3 Salt-okunurluk kanıtı
```
$ pnpm tsx scripts/esr-calibration.ts --preflight --apply
❌ --preflight is read-only and cannot be combined with --apply, --survey, --send or --rollback

# iki preflight koşumundan sonra üretilmiş dosyanın damgası değişmedi:
$ ls -la docs/BETA_DATA/generated/esr-calibration/calibration-summary.json
-rw-r--r--  1 macbook  staff  5436 Sep  8 19:47 …/calibration-summary.json
```
DB'ye yazma yok (`countCalibrationRows()` yalnız `count` çağırıyor); DB kapalıysa satır **"cannot
verify" (⚠️)** olarak raporlanıyor, asla ✅ olmuyor.

### 2.4 Refactor ölçümü değiştirmedi (regresyon koruması)
`--responses` yolu iki yerde kopya olmasın diye `applyResponses()`'a çıkarıldı. Değişiklikten önce ve
sonra üretilen rapor **üretim damgası dışında birebir aynı**:
```
$ diff base.md after.md
4c4
< > Üretim zamanı: 2026-09-08T17:00:09.522Z · Kural sürümü: g0-canonical-1.0 …
> > Üretim zamanı: 2026-09-08T17:04:56.469Z · Kural sürümü: g0-canonical-1.0 …
```
Sayılar da aynı: `rule A 80.0% · rule B 90.0% · best threshold 54 → 95.0%`.

### 2.5 Kapı (birim test + tip + lint)
```
$ npx vitest run tests/esr-calibration.test.ts
 Test Files  1 passed (1)
      Tests  41 passed (41)        # önce 31 idi: +10 yeni test

$ npx tsc --noEmit -p tsconfig.json      → TYPECHECK CLEAN
$ npx eslint scripts/esr-calibration.ts src/lib/beta/esr-*.ts tests/esr-calibration.test.ts → LINT CLEAN
```
Yeni testler kapının kendisini çiviliyor: dolu durumda kapanır; bugünkü durumda **tam olarak
`['roster','survey-sent','responses','accuracy']`** blokesini verir; self-test dosyası %85'te bile
kapatamaz; DB erişilemezse ⚠️ olur (✅ değil); her bloke satırının `fix` metni boş olamaz.

### 2.6 Tam süit — 4 kırmızı BENİM DEĞİL (kanıtlandı)
```
$ npx vitest run
 Test Files  1 failed | 117 passed | 2 skipped (120)
      Tests  4 failed | 1345 passed | 8 skipped (1357)
 FAIL  src/lib/iyzico.test.ts > handleIyzicoWebhook > … (4 test)
```
Kırmızılar başka bir ajanın **commit edilmemiş** fatura yazma-yolu çalışmasından (`src/lib/iyzico.ts`,
`src/lib/billing/invoice-writer.ts`, `prisma/schema.prisma` çalışma ağacında değişik). Kanıt: kendi
dosyalarımı stash'leyip aynı testi koştum, **4 kırmızı aynen duruyor**:
```
$ git stash push -u -- <benim dosyalarım> && npx vitest run src/lib/iyzico.test.ts
      Tests  4 failed | 16 passed (20)
```
Bu yüzden commit'ime yalnız kendi dosyalarımı ekledim (bkz. §4).

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/beta/esr-readiness.ts` | **yeni** — saf `evaluateEsrReadiness()`: 8 ön koşul, her biri severity + insan aksiyonu |
| `src/lib/beta/esr-send-receipt.ts` | **yeni** — `SurveySendReceipt`, `maskEmail()`, bozuk makbuzu "kanıt yok"a çeviren `parseSendReceipt()` |
| `scripts/esr-calibration.ts` | `--preflight` modu (salt-okunur, çıkış kodu 1), gönderim makbuzu yazımı, `applyResponses()` çıkarımı, maskeli gönderim logu, `main()` artık çıkış kodu döndürüyor |
| `package.json` | `beta:esr-preflight` script'i |
| `tests/esr-calibration.test.ts` | +10 test (31 → 41) |
| `docs/CORDIS-SAMPLE-CALIBRATION.md` | üretilmiş dosya — kabul tablosunun altına "bu tablo eskir, kapıyı koş" yönlendirmesi |

Veritabanına yazma **yok**, e-posta gönderimi **yok**, sır/PII repoya girmedi.

---

## 4. Geri alma

```bash
git revert <bu-commit-sha>
pnpm beta:esr-calibration          # üretilmiş raporu eski script'ten tazele
```
Kod dışında hiçbir yan etki bırakılmadı: DB'ye yazılmadı, mail atılmadı, makbuz dosyası üretilmedi
(hiç gönderim olmadığı için). `--rollback --apply` yolu değişmedi.

**İzleme/uyarı:** `pnpm beta:esr-preflight` idempotent ve çıkış kodlu olduğu için bir cron/CI adımına
takılabilir; E11.3 açıkken kırmızı kalır, kapanabilir hâle geldiği gün yeşile döner. CI'a **eklemedim**
— DB'ye ve E11 operasyonuna bağlı olduğu için `pnpm gate`'i sürekli kırardı; operatör komutu olarak
kalması bilinçli.

---

## 5. Riskler

1. **Kapı blokeyi çözmez, görünür kılar.** Gerçek roster gelmeden E11.3 kapanmaz; bu bir insan
   aksiyonu ve hâlâ bekliyor.
2. **Gerçek roster girildiği anda `--send` artık reddetmeyecek.** O koşum gerçekten mail atar ve geri
   alınamaz; açık onayla yapılmalı. Makbuz bunu artık kayıt altına alıyor.
3. **Doğruluk kriteri hâlâ %80.** Eşiği 54'e çekmek n=20'de overfit; kapı bunu metin olarak da
   yasaklıyor ama kodu değiştirecek biri yine de yapabilir.
4. Makbuz gitignore'lu dizinde: başka bir makinede/CI'da preflight "gönderilmedi" der. Operasyon tek
   makineden yürütülüyorsa sorun değil; dağıtık yürütülecekse makbuzun paylaşılan bir yere taşınması
   gerekir.

---

## 6. Açık sorular

1. **Gerçek design-partner roster'ı kim, ne zaman verecek?** (1. geçişten beri açık, hâlâ cevapsız.)
2. **Açık karar #8** (A kuralı mı B kuralı mı) kim kapatacak? Kapanmadan eşik tartışması yapılamaz.
3. `ESR_SURVEY_DEADLINE = 2026-09-21` gönderim gününe göre yeniden mi çivilensin? (Preflight bunu
   ⚠️ olarak her koşumda hatırlatıyor.)
4. **Kapsam dışı bulgu (başka kartın işi):** `docs/ROADMAP.md:51` hâlâ "`decideG0()` üretimde hiç
   çağrılmıyor" diyor. Bu ölçüm 2026-09-07 tarihli ve **eskimiş**: `7a40d72` sonrası zincir
   `pipeline/actions.ts → gates/evaluate.ts:108 → g0-compute.ts:287 → decideG0()` olarak bağlı.
   Satır TASK-MTQ63RR8Z0G8E'nin kapsamında olduğu ve o dosyada paralel ajan çalışması olduğu için
   **dokunmadım**; kart sahibi düzeltmeli.

---

## 7. Sonraki adım

Roster geldiğinde, **açık onayla**:
```bash
pnpm beta:esr-preflight                                   # önce: neyin bloke olduğunu gör
pnpm tsx scripts/esr-calibration.ts --roster=/secure/path/partners.csv \
    --apply --survey --send --deadline=<gönderim+14>      # gerçek mail — geri alınamaz
pnpm beta:esr-preflight                                   # sonra: "Survey actually sent" ✅ olmalı
# yanıtlar döndüğünde
cat docs/BETA_DATA/generated/esr-calibration/survey/*.responses.csv > /secure/path/responses.csv
pnpm tsx scripts/esr-calibration.ts --responses=/secure/path/responses.csv --apply
pnpm beta:esr-preflight                                   # kriter kapanabiliyorsa çıkış kodu 0
```
Kart ancak bu komut **0** döndüğünde `done` işaretlenmeli.
