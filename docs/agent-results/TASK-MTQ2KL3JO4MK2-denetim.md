# TASK-MTQ2KL3JO4MK2 — Bağımsız Denetim: "İnsan Aksiyonuna Bloke" İddiası Doğru mu?

**Ajan:** QA-EN (QA / Test Mühendisi)
**Çalıştırılan:** 2026-09-10
**Görev türü:** Denetim (bloke iddiasını sınamak) — **üretim kodu değiştirilmedi**
**Sonuç:** ✅ **İDDİA DOĞRULANDI** — kartın "insan aksiyonuna bloke" gerekçesi **gerçek**, kod tarafında bunu gizleyen bir hata yok. Ama 3 ek bulgu var: (1) 4 kırmızının 1'i ("accuracy") kısmen farklı bir yoldan da açılabilir ama o yol kasıtlı olarak kapatılmış, (2) `RESEND_API_KEY` bu makinede tanımlı değil — roster gelse bile `--send` ikinci bir sürpriz engelle patlar, preflight bunu bugün söylemiyor, (3) "insan doldursun" istenen roster şablonu **zaten var ve tam istenen formatta** — yeni dosya üretmeye gerek yok, sadece nereye bakılacağı belirsizmiş.

---

## 1. Yöntem — ne çalıştırıldı, kanıt nerede

```bash
$ pnpm beta:esr-preflight
```
tam çıktı aşağıda (canlı koşum, 2026-09-10):
```
✅ Sample set parsed — 20/20 samples
✅ Fixture rows in the database — 20/20/20/20
❌ Design-partner roster is deliverable — 10/10 addresses sit on a reserved, undeliverable domain — --send refuses
❌ Survey actually sent — no send receipt on this machine
❌ Partner verdicts ingested — no verdicts ingested — labels are still provisional
⚠️  Labels are ESR-confirmed — provisional
❌ Accuracy ≥ 85% — rule A 80.0% < 85%
⚠️  Deadline is a real commitment — 2026-09-21 is only 11 day(s) away
❌ E11.3 BLOCKED — 4 blocker(s): roster, survey-sent, responses, accuracy — one chain, head: roster
```
Çıkış kodu 1. Salt okunur (kod içinde `runPreflight` hiçbir `fs.writeFileSync`/DB yazımı içermiyor — okundu: `scripts/esr-calibration.ts:781-845`).

Ayrıca doğrulama amaçlı ikinci bir koşum yaptım — kod tabanındaki `SELF_TEST_MARKER` korumasının gerçekten çalıştığını görmek için:
```bash
$ pnpm tsx scripts/esr-calibration.ts --preflight \
    --responses=docs/BETA_DATA/esr-survey-responses.example.csv
```
Sonuç: `accuracy` %85.0'a ÇIKTI (self-test dosyasındaki 8 sahte "verdict" etiketleri değiştirdi) ama `responses` kontrolü bunu **ayrıca** yakaladı: *"8 verdicts read from the committed self-test file — these are not partner answers"* → toplam bloke sayısı 3'e düştü ama gate hâlâ ❌ kapalı kaldı. **Kanıt:** kapı, tek bir kontrolü (accuracy) manipüle ederek geçilemiyor; anti-oyun tasarımı çalışıyor.

Ayrıca kontrol edildi: `RESEND_API_KEY` bu makinenin `.env`'inde **tanımlı değil** (değer yazdırılmadan, salt varlık kontrolü):
```
RESEND_API_KEY set: false
EMAIL_FROM set: true
```

---

## 2. 4 kırmızının tek tek incelemesi

| # | Kırmızı | Gerçekten dış veri mi? | Gerekçe |
|---|---|---|---|
| 1 | **roster** | ✅ EVET, gerçek insan/iş girdisi | `docs/BETA_DATA/beta-partners.csv` **tamamı** `@partnerNN@example.invalid` — RFC 2606 rezerve TLD, dosyanın kendi başlığı "STATUS: PLACEHOLDER" diyor. 10 satırın hepsi sahte. Bu, kodla ya da fixture'la üretilemez: gerçek 10 tasarım ortağının **var olması ve iletişim bilgisinin bilinmesi** gerekiyor — bu bir satış/BD/PM işi, mühendislik işi değil. |
| 2 | **survey-sent** | ✅ EVET (zincirin devamı) | Roster gerçek olmadan `--send` zaten reddediyor (`scripts/esr-calibration.ts:932-939`, test edildi). Kodla atlanamaz; atlamak = sahte adreslere gerçek anket göndermek gibi anlamsız bir iş olurdu. |
| 3 | **responses** | ✅ EVET (zincirin devamı) | Ortakların **kendi görüşü** gerekiyor — bu, sentetik/fixture veriyle taklit edilemez, çünkü kriterin amacı tam olarak "gerçek uzmanlar G0 kararına katılıyor mu?" sorusunu ölçmek. Self-test dosyası bunun için var ve preflight onu doğru şekilde eliyor (yukarıdaki kanıt). |
| 4 | **accuracy** | ⚠️ KISMEN — nüans var, aşağıda | %80.0 < %85, **20 satırlık kürate edilmiş (SAMPLE-*) fixture** üzerinden ölçülüyor. 4 yanlış sınıflandırılan örnek (`S04, S07, S10, S19`) CSV'de açıkça `"HARD CASE — ..."` notuyla **kasıtlı** edge-case olarak işaretli, kodda bug değil. |

### Madde 4 üzerine ayrıntı — "accuracy" tam olarak zincire bağımlı mı?

İki farklı açılma yolu var, ikisi de "insan" ama **farklı insanlar**:
- **Yol A (zincir):** gerçek ortak verdictleri gelir, provisional etiketler ESR-confirmed olur, accuracy yeniden ölçülür. — Bu, roster'a bağımlı.
- **Yol B (zincirsiz):** eşiği (bugün 70) düşürüp fixture'ı "geçirmek". Kod bunu **bilerek ve gerekçeli olarak** engelliyor: `docs/ROADMAP.md` Açık kararlar #8 (2026-09-06, patron onayı) eşiğin bileşik skora ve rule A'ya (composite ≥ 70) uygulanmasını **kapatmış** karar olarak kayda geçirmiş; `src/lib/beta/esr-readiness.ts:274` bunu açıkça yazıyor: *"Moving minScore to fit 20 fixture rows is overfitting and would need a NEW boss decision, not a re-read of #8."* Ayrıca üretilen raporun 5. bölümü en iyi eşiğin (54) n=20 için istatistiksel olarak güvenilmez olduğunu (Wilson aralığı çok geniş) zaten hesaplayıp yazıyor.

**Sonuç:** Yol B teknik olarak "kodla çözülebilir" (bir sabiti değiştirmek) ama bu, mevcut kapanmış bir patron kararını **19 satırlık fixture'a overfit etmek için** geri açmak olur — bu QA/dev'in bugün tek başına alabileceği bir karar değil, YENİ bir patron onayı gerektirir ve zaten kart/rapor bunu doğru şekilde reddediyor. Yani madde 4 de fiilen zincire bağımlı kalıyor, ama nedeni "veri yok" değil, "kısayol istatistiksel olarak sahtekârlık olurdu ve zaten veto edilmiş" — bu ayrım kartın açıklamasında net değildi, burada netleştiriyorum.

**Kartın "4 kırmızı = tek zincir, başı roster" iddiası: DOĞRU.** Hiçbiri bugün kodla/fixture'la dürüstçe kapatılamaz.

---

## 3. İnsan girdisi gereken TEK gerçek şey: roster — TAM veri isteği

İyi haber: patronun dolduracağı şablon **zaten var**, yeni dosya üretmeye gerek yok. Sadece nerede olduğu ve hangi kolonların gerçek olması gerektiği net değildi — netleştiriyorum:

- **Şablon dosyası (zaten repo'da, örnek satırlarıyla):** `docs/BETA_DATA/beta-partners.csv`
- **Doldurulmuş gerçek kopyanın gideceği yer (git'e ASLA commit edilmeyecek, `.gitignore`'da zaten kayıtlı):** `docs/BETA_DATA/beta-partners.local.csv`
- **Satır sayısı:** 10 (script `--per-partner=4` ile 20 örneği 10 ortağa, örnek başına 2 bağımsız görüş olacak şekilde dağıtıyor — 10 sabit değil ama script bunu destekliyor; 10'dan az/çok da çalışır, sadece anket dengesi değişir)
- **Format:** CSV, header satırı sabit:
  ```
  slug,orgName,country,orgType,contactName,contactEmail,locale,timezone,segment,notes
  ```
- **Hangi kolonlar GERÇEK olmalı (kod bunu reddeder/yanlış çalıştırır eğer değilse):**
  | Kolon | Zorunlu mu | Neden |
  |---|---|---|
  | `contactEmail` | **EVET, mutlaka gerçek** | `--send` bunu kontrol ediyor; `.invalid/.example/.test/.localhost` veya `example.com/net/org` alan adı varsa **gönderim tamamen reddediliyor** (`src/lib/beta/roster.ts:39-44`). |
  | `contactName` | Şiddetle önerilir | Kod bunu doğrulamıyor (gönderimi bloklamaz) ama e-posta şablonu "Sayın {contactName}" diye hitap ediyor — "Design Partner 01" ile gerçek bir ortağa mail gitmesi profesyonel görünmez. |
  | `orgName, country, orgType, locale` | Gerçek olmalı | Anket dilini (`tr`/`en`) ve raporlamayı (segment) belirliyor; format zaten doğru, sadece placeholder isimler gerçek şirket adlarıyla değişmeli. |
  | `slug, timezone, segment, notes` | Format korunabilir | `slug` benzersiz kebab-case olmalı (örn. `beta-<gerçek-şirket>`), diğerleri opsiyonel/varsayılanlı. |
- **Örnek satır (repo'daki mevcut placeholder — format budur, sadece isim/e-posta değişecek):**
  ```
  beta-anadolu-teknoloji,Anadolu Teknoloji A.Ş.,TR,SME,Design Partner 01,partner01@example.invalid,tr,Europe/Istanbul,sme,Horizon Europe Cluster 4 applicant
  ```
  → gerçek hali örneğin:
  ```
  beta-acme-arge,Acme Ar-Ge A.Ş.,TR,SME,Ayşe Yılmaz,ayse.yilmaz@acme.com.tr,tr,Europe/Istanbul,sme,Horizon Europe Cluster 4 applicant
  ```
- **Kim dolduracak:** Kartın kendi analizinde de belirsiz bırakılmış — bu bir **PM/BD** kararı (hangi 10 gerçek tasarım ortağı davet edilecek), mühendislik değil. Ben yeni bir dosya üretmedim çünkü var olan şablon zaten tam bu iş için tasarlanmış; tek eksik "boss bunu nerede bulacağını bilmiyor" idi.

Roster gerçek olduktan **sonra** izlenecek adımlar (kod tarafında zaten hazır, script açıklamasında var — `scripts/esr-calibration.ts:28-51`):
```bash
pnpm tsx scripts/esr-calibration.ts --apply --survey --send --roster=docs/BETA_DATA/beta-partners.local.csv
```
⚠️ Bu adım gerçek e-posta gönderir, geri alınamaz — patron onayı olmadan çalıştırılmamalı (kartın kendi notu da bunu söylüyor, doğru).

---

## 4. Yeni bulgu: `RESEND_API_KEY` — roster gelse bile ikinci bir sürpriz var

Bu, 4 kırmızının dışında ama aynı akışın bir parçası. Bu makinede (`.env`) `RESEND_API_KEY` **tanımlı değil**. Preflight bunu bugün **hiç kontrol etmiyor** — `evaluateEsrReadiness()` (`src/lib/beta/esr-readiness.ts`) 8 kontrolden hiçbiri bu env değişkenine bakmıyor. Sonuç: roster gerçek olup patron `--send` onayı verdiğinde, komut ilk partnerde şu hatayla **hemen** durur (kod: `scripts/esr-calibration.ts:1004`):
```
❌ --send requires RESEND_API_KEY in the environment
```
Daha önceki bir geçiş (`docs/agent-results/TASK-MTQ2KL3JO4MK2-blok-zincir-dev-4.md`) bu davranışın **güvenli** olduğunu (yarım gönderim yok, tek satır hata, DB'ye yazma yok) zaten doğrulamış — yani bu bir bug değil, ama preflight'ın "kapatılabilir mi?" sorusuna verdiği cevap **eksik**: roster düzelse preflight yine "sadece roster'ı düzelt, sonra gönder" diyecek, ama gönderim anahtarı yoksa boss ikinci bir tur "neden hâlâ çalışmıyor" sorusu sorar.

**Bunun için AYRI bir kart açılabilir (bugün kodla çözülür, insan verisi gerektirmez):**
> **Başlık:** ESR preflight, `RESEND_API_KEY` eksikliğini de bir kontrol olarak raporlamalı
> **Ne:** `evaluateEsrReadiness()`'e 9. bir kontrol ekle — `RESEND_API_KEY` (veya bir env katmanı) tanımlı değilse `warn` seviyesinde: *"Resend API key not configured on this machine — --send will fail even once the roster is real."*
> **Nerede:** `src/lib/beta/esr-readiness.ts` (yeni check) + `scripts/esr-calibration.ts:runPreflight` (input'a `hasResendKey: !!process.env.RESEND_API_KEY` ekle) + `tests/esr-calibration.test.ts`'e ilgili test.
> **Kapsam dışı not:** hangi ortamda (prod secrets) gerçek anahtarın olup olmadığını bu makineden göremedim — bu ayrı bir ops/PM doğrulaması, preflight sadece "bu makinede yok" diyebilir, "hiçbir yerde yok" diyemez (aynı mantık `sendReceipt` kontrolünde de var).

---

## 5. Kapsam dışı ama ilişkili — bir düzeltme (dokunulmadı, sadece not)

İlk taslakta `docs/ROADMAP.md` Açık kararlar #9'a dayanarak "kanonik `decideG0()`/`scoreG0()` üretimde hiç çağrılmıyor" diye yazmıştım — bunu **kendim kodda doğrulamadan** dokümandan aktarmıştım, bu da tam olarak "doğrulamadan önce doğrula" kuralının ihlali olurdu. Kodu kontrol ettim, **bu iddia güncel değil**:

```
src/app/[locale]/(app)/[workspace]/pipeline/actions.ts:241  → rescoreOpportunityG0(tenantId, created.id)
src/lib/gates/evaluate.ts:108                                → computeG0ForOpportunity(tx, tenantId, opportunityId)
src/lib/scoring/g0-compute.ts                                → son değişiklik 2026-09-10 09:59 (bugün, aktif geliştiriliyor)
```

Yani `decideG0()`/`scoreG0()` **üretime bağlı** (kendi hafızamdaki `g0-scoring-production-hooked.md`, 2026-09-07, bunu zaten doğru kaydetmiş). `docs/ROADMAP.md` Açık kararlar #9 (satır 132) ise hâlâ "hiçbir üretim çağrı noktasında kullanılmıyor" diyor — **bu satır artık yanlış/güncel değil**, muhtemelen düzeltme commit'inden önce yazılmış ve sonradan güncellenmemiş. ROADMAP.md'ye bu turda dokunmadım (kapsam dışı, ve dosya "üretim kodu" değil ama bu görevin işi değil) — ama takımın bunu görmesi gerekiyor: **Açık karar #9 muhtemelen kapanmış, ROADMAP güncellenmeli.**

E11.3 için pratik sonuç: kalibrasyon %85'i geçtiğinde bu **gerçekten** üretimdeki G0 kapı kararlarını etkileyecek (bağlantı zaten var) — önceki taslağımın aksine, ayrı bir "bağlama işi" beklemeye gerek yok.

---

## 6. Kartın açıklaması yanlış mı? — Hayır, ama netleştirilmesi gereken 2 nokta

1. Kart "4 bloker" diyor ve hepsini "insan aksiyonu" zincirine bağlıyor — bu **doğru**, ama madde 4 (accuracy) için "insan" kelimesi **iki farklı insanı** kapsıyor (dış ortak verisi VS. içeride patronun eşik kararı) ve kart bunu ayırmıyor. Pratik sonuç aynı (roster gelmeden hiçbiri kapanmaz) ama gerekçe farkı önemli: madde 4 asla "veri eksik" değil, "kısayol istatistiksel olarak yanlış ve zaten veto edilmiş".
2. Kart "roster kim sağlayacak, ne zaman?" diye açık soru bırakmış — şablon dosyası zaten var (`docs/BETA_DATA/beta-partners.csv`), sadece bunun "boss'un dolduracağı form" olduğu net yazılmamıştı. Şimdi §3'te netleştirildi.

Blokaj gerekçesi gerçek blokajı **gizlemiyor** — ölçülen 4 kırmızının hepsi gerçek ve kodla bugün dürüstçe kapatılamaz.

---

## 7. Platform beyanı

**Doğrulama platformu: macOS (Darwin 25.6.0, mac).** Bu görevdeki tüm komutlar (`pnpm beta:esr-preflight`, `pnpm tsx scripts/esr-calibration.ts ...`, `node -e ...` env kontrolü) platforma bağlı hiçbir şey içermiyor (süreç öldürme yok, dosya yolu/kabuk/ikili adı yok, ekran/DPI/mikrofon-kamera izni yok) — Node.js/tsx tabanlı, salt okunur bir CLI. Windows/Linux'ta aynı komutlar aynı şekilde çalışır (yol ayırıcıları `path.join`/`path.resolve` ile taşınabilir yazılmış, kod incelendi). Diğer platformda koşulamadı ama koşulmasına gerek de yok — platforma özgü hiçbir dal yok.

---

## 8. Değişen dosyalar

**Yok.** Bu tur salt denetim — hiçbir üretim kodu, script, config veya `docs/BETA_DATA/*.csv` dosyası değiştirilmedi. Yalnızca bu rapor dosyası eklendi.

---

## 9. Riskler / Açık sorular

- Roster'ı kimin/ne zaman sağlayacağı hâlâ belirsiz (PM/BD kararı, bu denetimin kapsamı dışında).
- `ESR_SURVEY_DEADLINE` (2026-09-21) zaten 14 günlük pencereyi karşılayamıyor — roster geldiği gün yeniden çivilenmesi gerekecek (kart bunu zaten doğru not etmiş, warn seviyesinde, blocker değil).
- `RESEND_API_KEY`'in prod/staging ortamında tanımlı olup olmadığı bu makineden görülemedi — ops/PM tarafından doğrulanmalı.

## 10. Sonraki adım

1. Bu raporu patrona ilet — özellikle §3 (roster şablonu zaten var, sadece 2 kolon gerçek olmalı) ve §4 (RESEND_API_KEY ayrı küçük kart önerisi).
2. Roster gerçek isimlerle dolduğunda: `pnpm beta:esr-preflight` yeniden çalıştırılıp zincirin ilk halkasının açıldığı doğrulanmalı (bu QA görevinin kapsamı dışında, roster geldiğinde tekrar denetlenebilir).
