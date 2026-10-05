# TASK-MTTUUGKNDGBXK — Alarm konsolu boğulmuş

**Ajan:** QA-EN (QA / Test Mühendisi) · **Tip:** runtime / bug · **Platform:** macOS (darwin 25.6.0), Chromium (Playwright Desktop Chrome 1280×720)
**Sonda:** salt-okunur. Hiçbir alarm yazılmadı, çözüldü işaretlenmedi, silinmedi. Prod DB'ye dokunulmadı.

> **Not:** Bu dosya bir kez yazıldı (14:13), eşzamanlı koşan başka bir pane tarafından diskten
> silindi ve 14:22'de yeniden yazıldı. Ayrıntı §8b. Bu kartın iki kez rapor üretmeden düşmüş
> olması muhtemelen aynı sebepten.

---

## 0. Önce sayı: kart bayat, iki kez değil üç kez bayat

| | kart metni | önceki koşu (12:33) | **bugün ölçüldü (14:09)** |
|---|---|---|---|
| SystemAlert satırı | 62 | 106 | **256** |
| açık (`resolvedAt` null) | — | 106 | **256** |
| çözülmüş | — | 0 | **0** |
| `invoice_buyer_identity_missing` | — | 82 (%77.4) | **221 (%86.9)** |

Yığın ölçülürken bile büyüdü: bu oturum içinde 250 → 252 → 254 → 256 → 259.
Son 24 saatte 182 satır, son 6 saatte 103 satır (**17/saat**).

**Bu kartın ölçülebilir en kısa fitili:** konsol `MAX_ROWS = 300` satır yüklüyor
(`src/app/[locale]/admin/alerts/page.tsx:12`). Bugün 256 satır var. **Kalan pay: 44 satır.**
24 saatlik hızla ~6 saat, son 6 saatlik hızla **~2,5 saat** sonra konsol satır düşürmeye başlar.

---

## 1. En büyük grubun kök nedeni kartın söylediği şey DEĞİL

Kart, %77'lik grubu `TASK-MTSY71BUMBLWM`'e (TenantBillingIdentity ekranı yok) bağlıyor.
Ölçüm bunu **221 satırdan 220'si için çürütüyor**.

```
total 221 | t-idem-* 147 | cuid (cmt*) 69 | other ["demo-tenant"]
tenantIds that STILL EXIST: [ { "id": "demo-tenant", ... } ]
```

- **147 satır** → `tests/stripe-webhook-idempotency.live.test.ts`. Temizliği (satır 103–109)
  auditEvent, creditLedger, addOn, moduleState, invoice, subscription, tenant, plan siliyor —
  **systemAlert silmiyor.**
- **69 satır** → `tests/e2e/invoice-write-path.spec.ts`. `afterAll` (satır 99–105) invoice,
  tenantBillingIdentity, tenant siliyor — **systemAlert silmiyor.** Üstelik ilk testi
  (satır 108) bilerek kimliksiz bir kiracı kurup alarmın yazıldığını *doğruluyor*.
- **1 satır** → `demo-tenant`. Kök nedeni gerçekten `TASK-MTSY71BUMBLWM` olan tek satır bu.

Yani konsolun %86'sı **ürün kusuru değil, test artığı**. 220 satır, kendisini yaratan
kiracı silindiği için bir daha asla doğru olamaz: `SystemAlert`'in `Tenant`'a FK'si yok,
cascade yok.

### Kanıt: `pnpm test` konsolu kendisi büyütüyor

`.live.test.ts` vitest exclude listesinde değil (`vitest.config.mts:6`), yani normal
`pnpm test` içinde koşuyor. Bu oturumda suite'i 14:09:39 yerel = **11:09:39 UTC**'de koştum:

```
2026-09-10T11:09:43.275Z invoice_buyer_identity_missing {"provider":"stripe","tenantId":"t-idem-b5th2hsn"}
2026-09-10T11:09:33.226Z invoice_buyer_identity_missing {"provider":"stripe","tenantId":"t-idem-q038yh8g"}
```

Test suite'ini koşan her geliştirici, operatörün alarm konsoluna **kalıcı, kapanamaz,
error seviyesinde iki satır** ekliyor. 254 → 256.

Doğru desen depoda zaten var: `tests/e2e/purge-failure-alert-console.spec.ts:80-85`
kendi alarmını `meta` yoluna göre kapsamlı `deleteMany` ile temizliyor. İki test bunu unutmuş.

---

## 2. (a) 256 alarmın kök nedene göre envanteri

Kanıt: `docs/agent-results/TASK-MTTUUGKNDGBXK-evidence/05-alert-inventory.txt`

| kaynak | sev. | satır | oluşum | ilk görülme | son görülme | **bugün hâlâ geçerli mi** |
|---|---|---|---|---|---|---|
| `invoice_buyer_identity_missing` | error | 221 | 267 | 08 Eyl 17:05 | 10 Eyl 11:09 | **HAYIR (220/221)** — kiracı silinmiş, test artığı. 1 satır (`demo-tenant`) canlı → TASK-MTSY71BUMBLWM |
| `k1_daily_calls` | warn | 6 | 6 | 07 Eyl 19:45 | 08 Eyl 06:11 | **BİLİNMİYOR** — yinelenen identifier uyarısı; koşulmadan söylenemez |
| `k2_monthly_cordis` | error | 5 | 11 | 07 Eyl 19:42 | 08 Eyl 14:41 | **HAYIR** — `127.0.0.1:59999`, `127.0.0.1:8123`, `month:"2026-09-probe-test"`. Sonda/test hostları |
| `cordis-delta` | warn | 4 | 32 | 07 Eyl 18:25 | 10 Eyl 07:03 | kısmen — biri `example.invalid` (test), biri "delta endpoint yapılandırılmamış" (yapılandırma kararı) |
| `cordis-sync` | warn | 4 | 40 | 10 Eyl 06:53 | 10 Eyl 07:03 | **EVET** — bugünkü ingest koşusu, kayıt atlanıyor |
| `k2_monthly_cordis` | warn | 3 | 4 | 08 Eyl 06:04 | 08 Eyl 06:06 | **HAYIR** — HTTP 401/500, `127.0.0.1:8123/8124` test hostları |
| `invoice_not_issued` | error | 3 | 11 | 08 Eyl 19:11 | 08 Eyl 20:22 | **HAYIR (3/3)** — 2'si `http://127.0.0.1:1/...` (bilerek erişilemez test hostu); 1'i `INVOICE_VAT_RATE` yok diyor, **o env değişkeni koddan tamamen kaldırılmış** (`grep -rn INVOICE_VAT_RATE src/ prisma/` → 0 sonuç, TASK-MTTTMECDO7RC8) |
| `invoice_vat_country_unknown` | error | 2 | 2 | 08 Eyl 20:11 | 08 Eyl 20:19 | **HAYIR** — `findCountryVatRate("Türkiye")` bugün `TR @ %20 (standard)` dönüyor. Alarm kendini iyileştirdi, satır açık kaldı |
| `cordis-sync` | error | 2 | **103** | 10 Eyl 06:53 | 10 Eyl 07:03 | **EVET** — 2 satır 103 oluşumu temsil ediyor; bugünün en yoğun gerçek hatası |
| `k1_daily_calls` | error | 1 | 1 | 08 Eyl 06:07 | 08 Eyl 06:07 | **BİLİNMİYOR** — `sedia` kaynağı fetch hatası |
| `invoice_profile_assumed` | warn | 1 | **231** | 08 Eyl 17:05 | 10 Eyl 10:30 | **EVET, ama olay değil** — duran politika beyanı (EARSIVFATURA varsayımı). Kendiliğinden hiç sönmeyecek |
| `m10_document_generation_failed` | error | 1 | 4 | 08 Eyl 17:58 | 10 Eyl 06:54 | **EVET** — AI kredisi yetersiz |
| `cordis-delta` | error | 1 | **50** | 10 Eyl 06:53 | 10 Eyl 07:03 | **EVET** — 1 satır 50 oluşum |

**Özet:** 256 satırın **~232'si (%90) bugün geçersiz** — ya kiracısı silinmiş test artığı, ya
kendiliğinden düzelmiş, ya da üreten kodu silinmiş. Gerçekten bugün geçerli olan
**~9 satır**, ama bunlar 157 oluşumu temsil ediyor (`cordis-sync` 103 + `cordis-delta` 50 + m10 4).

**Dedup neden 221'i katlamadı:** `alertIdentity` çağıranın `meta`'sının tamamını anahtara
alıyor (`src/lib/observability/system-alert.ts:212`). `meta.tenantId` her koşuda farklı →
hiçbir zaman katlanmaz. Buna karşılık `meta`'sı sabit olan `invoice_profile_assumed` **231
oluşumu tek satıra** katlamış. Dedup bozuk değil; **koşu-başına-değişen tanımlayıcı taşıyan
alarmlar için yanlış anahtar.**

---

## 3. (c) Konsol bugün neyi gizliyor — gerçek tarayıcı ölçümü

Kanıt: `docs/agent-results/TASK-MTTUUGKNDGBXK-evidence/04-console-browser-probe.txt`
Ekran görüntüleri: aynı dizinde `shot-01..03`, tam boy olanlar `test-artifacts/` (gitignore).

```
[probe] header tiles: ["Toplam uyarı\n252","Çözülmemiş\n252","Hata seviyesi\n234","Tekrar\n508"]
[probe] <tr> in tbody: 252
[probe] rows whose source cell is invoice_buyer_identity_missing: 219  -> 86.9% of the table
[probe] full page height: 22376px (31.1 screens of scrolling)
[probe] "Yalniz cozulmemisler" checkbox: 252 rows -> 252 rows (filtered out 0)
[probe] strings on the page hinting at a cap/pagination: []
[probe] newest alert in DB : invoice_buyer_identity_missing @ 2026-09-10T11:03:36.434Z
[probe] top row on screen  : invoice_buyer_identity_missing
[probe] -> a brand-new alert lands at row 1: YES, visible without scrolling
[probe] DB after the probe: total=252 open=252 (was 252/252)
```

**Kartın sorduğu soruya dürüst cevap: yeni bir alarm BUGÜN görünüyor — ama bu iyi haber değil.**

1. **Sıralama `createdAt desc`, sayfalama yok.** Yepyeni bir alarm 1. satıra düşer, kaydırmadan
   görünür. Konsol yeni alarmı gizlemiyor.
2. **Gizlediği şey: yeni olmayan her şey.** 256 satır tek tabloda, **22.376px = 31 ekran**
   kaydırma. Gerçek ve bugün geçerli olan `m10_document_generation_failed` alarmı
   **256 satırın 235'incisi** (y=20.599px, görünür alanın 28 ekran altında).
   `invoice_vat_country_unknown` 226., `invoice_profile_assumed` 238. sırada.
   17 alarm/saat hızında bir alarmın üst ekranda kalma ömrü **~40 dakika**.
3. **Tek triyaj kontrolü hiçbir şey yapmıyor.** "Yalnız çözülmemişler" kutusu işaretlendiğinde
   252 satır → 252 satır. **0 satır elendi**, çünkü 256 satırın hiçbiri hiç çözüldü işaretlenmemiş.
4. **Kaynak filtresi ağırlıksız.** Açılır listede 10 kaynak var ama hangisinin 221, hangisinin
   1 satır olduğu yazmıyor — operatör gürültüyü ancak seçtikten sonra öğreniyor.
5. **≤3 saat içinde konsol yalan söylemeye başlayacak.** `page.tsx:12` `MAX_ROWS = 300`,
   `take: MAX_ROWS`. `client.tsx` başlık kutuları `rows.length` (kırpılmış dizi) okuyor:
   satır sayısı 300'ü geçtiğinde **"Toplam uyarı" 300'de donacak, "Çözülmemiş" eksik
   sayacak**, en eski satırlar arayüzden tamamen erişilemez olacak — ve
   `capHints: []` kanıtladığı gibi sayfada bunu söyleyen **tek bir kelime yok**
   (ne "300", ne "sayfa", ne "daha fazla göster").
   *Not: bu 5. madde ekran görüntüsüyle değil kod okumasıyla kanıtlandı — 300'ü aşmak için
   alarm yazmak gerekirdi, sonda salt-okunur tutuldu. Aritmetiği yukarıda.*

---

## 4. (d) `t()` disiplini ve ham hata sızıntısı

**Konsol çerçevesi temiz.** `page.tsx` 25 anahtarı `getTranslations` ile geçiriyor,
`messages/tr.json:1053-1085` hepsini karşılıyor, `client.tsx` içinde tek bir sabit
kullanıcı metni yok. i18n kuralı (CLAUDE.md 8) çerçeve için karşılanıyor.

**Alarm içeriği hiç çevrilmiyor ve ham teknik gövde sızdırıyor.** Tarayıcıda, *hiçbir satır
açmadan*, Türkçe çerçeveli ekranda görünenler:

```
[probe] raw technical strings visible WITHOUT expanding any row:
        ["fetch failed", "HTTP 401", "HTTP 500", "HTTP 404", "src/lib/billing/vat-rates.ts"]
[probe] raw strings visible AFTER expanding a row:
        ["127.0.0.1", "fetch failed"]
```

Ekran görüntüsünde (`shot-03-raw-http-codes-on-screen.png`) tablo gövdesinde adıyla görünenler:
- `K1 source "sedia" failed: Page 1 fetch error: fetch failed` — ham fetch hata gövdesi
- `CORDIS worker returned HTTP 401` / `HTTP 500` / `HTTP 404` — çıplak HTTP kodu
- `no sourced VAT rate for Türkiye; src/lib/billing/vat-rates.ts currently covers KW` — **kaynak kodu dosya yolu**
- `Follow-up document generation failed for kind NDA: Insufficient AI credits.` — sağlayıcı hata dizesi

Satır açıldığında `meta` ham JSON olarak basılıyor (`client.tsx:334`, `JSON.stringify(row.meta, null, 2)`):
`{"host": "127.0.0.1:59999", "month": "2026-09-probe-test"}` (`shot-02-expanded-meta-probe-artifact.png`).

**Değerlendirme:** bu bir platform-admin ekranı, hedef kitlesi operatör — ham `meta`'nın
burada olması *tasarım*, ve gizlilik notu doğru şekilde t()'li. Kural ihlali değil.
Ama iki gerçek sorun var:
- **Kaynak kodu yolunun (`src/lib/billing/vat-rates.ts`) mesaj gövdesine yazılması**, mesajı
  koda bağımlı kılıyor: dosya taşındığında alarm yanlış yönlendirecek. Zaten öyle —
  mesaj "currently covers KW" diyor, tablo bugün 29 ülke taşıyor.
- Türkçe çerçeve + İngilizce hata düzyazısı karışımı. Bilinçli bir karar olabilir
  (operatör dili İngilizce), ama **hiçbir yerde beyan edilmemiş**.

---

## 5. (b) Bir alarm nasıl kapanmalı — `resolvedAt`'i KİM yazmalı

**Bugünün gerçeği:** `resolvedAt` sütununu yazan **tek bir yer** var —
`src/app/[locale]/admin/alerts/actions.ts:39`, yani konsoldaki "Çözüldü işaretle" düğmesine
basan insan. Ne bir iş, ne bir üretici, ne bir süpürücü onu yazıyor
(`grep -rn resolvedAt src/ scripts/ prisma/` — SystemAlert için tek yazıcı bu).
`SystemAlert` için **saklama/temizlik işi de yok** (`src/lib/inngest/jobs/` içinde yok).
Sonuç kaçınılmaz: 256 satır, 0 çözülmüş, hiç kimse 256 kez tıklamayacak.

Üç ayrı yazıcı gerekiyor; tek çözüm hepsini karşılamıyor:

**(1) Üretici — koşul yeniden yanlışsa alarmı kendi kapatır.**
`src/lib/observability/system-alert.ts` içine `recordAlert`'in kardeşi:
```ts
export async function resolveAlerts(
  selector: { source: string; meta?: Record<string, unknown> },
  options?: { client?: AlertDbClient }
): Promise<{ resolved: number }>
```
`recordAlert` ile aynı sözleşme: asla fırlatmaz, sır yazmaz. Çağrı yerleri:
- `src/lib/billing/invoice-writer.ts` — bir kiracı için fatura **başarıyla** kesildiğinde
  `resolveAlerts({ source: 'invoice_buyer_identity_missing', meta: { tenantId } })`
- `src/lib/inngest/jobs/k2-monthly-cordis.ts` — koşu başarılıysa o ay/host için
  `k2_monthly_cordis` alarmlarını kapat
- `src/lib/inngest/jobs/k1-daily-calls.ts` — aynı desen

**(2) Süpürücü — konusu ortadan kalkmış alarmı kapatır.**
Yeni iş `src/lib/inngest/jobs/alerts-sweep.ts` (günlük):
- `meta.tenantId` taşıyıp o kiracı artık var olmayan açık alarmları çözüldü işaretle,
  `meta.resolvedBy = 'sweep:tenant_gone'` damgasıyla. Bugün **220 satırı** temizler.
- Çözülmüş ve N günden eski satırları sil (saklama). Bugün hiçbir şey silmiyor;
  tablo sınırsız büyüyor.
- **Silme değil, çözme.** Kayıt denetim izidir; ekrandan düşmesi yeterli.

**(3) İnsan — yalnız yargı gerektiren satırlar için.** Bugünkü düğme doğru, yerinde kalsın.
Ama (1) ve (2) devreye girmeden anlamsız: 256 satırın 232'si insanın kararına muhtaç değil.

**Bastırma/gruplama penceresi gerekli mi?** Hayır — dedup zaten çalışıyor
(`invoice_profile_assumed` 231 oluşumu tek satıra katladı). Gereken **zaman penceresi değil,
doğru anahtar**: `recordAlert` isteğe bağlı bir `dedupeKey` almalı; `RecordAlertInput`'a
`dedupeKey?: string` eklenir, verilmişse `alertIdentity` `meta` yerine onu kullanır.
`invoice-writer.ts` `dedupeKey: 'buyer_identity_missing'` geçer → 221 satır 1 olur.

---

## 6. Kod değişikliği

**Ürün kodunda hiçbir değişiklik yapılmadı.** Gerekçe: yukarıdaki üç yazıcı da politika
kararı içeriyor (saklama süresi, hangi alarm kendiliğinden kapanır, dedup anahtarı kimin
sorumluluğu) ve bunlar bu kartın kapsamı değil. Kart "ölçümden sonrası" istedi; kararlar
lead/PM'e ait. Kartlar §8'de açıldı.

**Eklenen tek dosya:** `tests/e2e/qa-alert-console-probe.spec.ts` — salt-okunur konsol
sondası. Hiçbir şey yazmıyor/silmiyor; bunu kendi içinde doğruluyor
(`expect(afterOpen).toBe(dbOpen)`). Platform admin olmayan bir veritabanında
`test.skip` ile atlıyor (`purge-failure-alert-console.spec.ts` ile aynı koruma), böylece
paylaşılan e2e kapısını kızartamaz.

---

## 7. Kanıt artefaktları

| dosya | ne |
|---|---|
| `.../TASK-MTTUUGKNDGBXK-evidence/01-alert-pile-before.txt` | önceki koşunun ölçümü (106 satır) |
| `.../03-alert-pile-now.txt` | bugünkü dağılım (250 satır) |
| `.../02-alert-validity.txt` | grup grup "bugün hâlâ geçerli mi" |
| `.../04-console-browser-probe.txt` | gerçek tarayıcı ölçümü |
| `.../05-alert-inventory.txt` | kök nedene göre envanter tablosu |
| `.../probe-alert-validity.mts`, `probe-alert-inventory.mts` | salt-okunur sondalar |
| `.../shot-01-console-header.png` | konsol başlığı: Toplam 252 / Çözülmemiş 252 |
| `.../shot-02-expanded-meta-probe-artifact.png` | açılmış satırda `host:127.0.0.1:59999, month:"2026-09-probe-test"` |
| `.../shot-03-raw-http-codes-on-screen.png` | tabloda ham `HTTP 401/500`, `fetch failed` |
| `test-artifacts/TASK-MTTUUGKNDGBXK-screenshots/` | tam boy kareler (1280×22376px) — `.gitignore`'da, yerel |

### Kapı çıktısı

```
pnpm lint      → $ eslint            (temiz, çıktı yok)
pnpm test      → Test Files 149 passed | 2 skipped (151)
                 Tests 1795 passed | 8 skipped (1803)
pnpm typecheck → 4 hata, HEPSİ tests/billing-identity-action.test.ts içinde
```
`tests/billing-identity-action.test.ts` **benim dosyam değil**: `git status` onu `??`
(untracked) gösteriyor, git geçmişi yok — başka bir ajanın süren TASK-MTSY71BUMBLWM işi.
Benim eklediğim `tests/e2e/qa-alert-console-probe.spec.ts` hata listesinde yok.
Bu haliyle typecheck kapısı **kırmızı** ve bu kart onu yeşile çeviremez; sahibine bildirilmeli.
Playwright sondası ayrı koşuldu ve **geçti** (1 passed). Commit öncesi pre-commit kapısı
(`eslint` + `tsc`, staged kapsam) **temiz** geçti.

---

## 8. Açılan kartlar

| kart | ne | öncelik |
|---|---|---|
| `TASK-MTVFJ2XQOL489` | Test suite alarm konsoluna kalıcı çöp yazıyor (220 satır) | 1 |
| `TASK-MTVFJTNW6OW11` | `resolvedAt`'i insandan başka kimse yazmıyor — üretici + süpürücü | 2 |
| `TASK-MTVFKK8UZS5BF` | Konsol 300 satırı geçince sessizce yalan söyleyecek | 2 |
| `TASK-MTVFL8IJALB2H` | `recordAlert` dedup anahtarı: koşu-başına-değişen meta | 3 |

## 8b. Eşzamanlılık uyarısı — bu kartın neden iki kez rapor üretmeden düştüğü

Rapor yazılırken **başka bir pane aynı kartı aynı kanıt dizininde koşuyordu**: 14:12–14:15
arasında bana ait olmayan `06-alert-growth-rate.txt`, `07-console-browser-probe-final.txt`,
`08-messages-per-source.txt`, `probe-alert-rate.mts`, `probe-alert-messages.mts` dosyaları
belirdi. `07-...-final.txt` benim eklediğim `qa-alert-console-probe.spec.ts` sondasının
çıktısı — yani o pane benim spec'imi koşmuş.

Ölçüm açısından bu bir çatışma değil, **bağımsız doğrulama**: onların sayıları (259 satır,
%87.3, 22.971px, "yalnız çözülmemişler" 259→259, `capHints: []`) benimkilerle (256, %86.9,
22.376px, 252→252, `[]`) birkaç dakikalık büyüme farkı dışında aynı.

**Ama dosya açısından çatışma:** 14:13'te yazdığım bu rapor 14:19'da **diskten silinmişti**
(`ls` → No such file). Commit'i (`2131930`) 12 kanıt dosyasıyla geçti ama rapor `.md`'si
tree'de yok, çünkü commit anında dosya artık yoktu. Yeniden yazıldı ve **tek başına**
commit'lendi, ardından `git ls-tree` ile ağaçta olduğu doğrulandı.

**Kalıcı ders:** paylaşılan ağaçta rapor yazmak yetmez — yazdıktan sonra commit'le ve
`git ls-tree HEAD` ile ağaçta olduğunu DOĞRULA. Kartın "iki kez rapor üretmeden düştü"
notu büyük ihtimalle tam olarak bu.

## 9. Riskler

- **En acil:** ~2,5–6 saat içinde konsol 300 satırı aşacak ve sessizce satır düşürüp
  başlık sayaçlarında yanlış rakam gösterecek. Bunun ekran görüntülü kanıtı yok
  (sonda salt-okunur tutuldu), kod okuması + büyüme hızıyla gösterildi.
- **Sessiz körlük:** bugün gerçek olan 9 alarm, 232 ölü satırın arasında 226.–238. sıralarda.
  Operatör konsolu açtığında ilk gördüğü şey %87 gürültü; bu ekran bugün güven vermiyor.
- **`pnpm test` alarm üretiyor:** bu düzeltilmeden yığın temizlense bile birkaç günde geri gelir.
  Sıra önemli — önce test temizliği, sonra süpürücü.
- Ölçümler geliştirme veritabanında yapıldı. Prod'da `t-idem-*`/`cmt*` test kiracıları
  olmayacağı için oradaki dağılım farklı olabilir; **prod'da aynı sondayı koşmadan
  "prod da böyle" denmemeli.**

## 10. Açık sorular (karar gerekiyor)

1. Saklama süresi: çözülmüş alarm kaç gün sonra silinsin? (öneri: 90 gün)
2. `invoice_profile_assumed` gibi *duran politika* beyanları alarm mı olmalı, yoksa
   ayrı bir "bilinen kısıtlar" listesi mi? Bugün asla kapanamayacak bir satır olarak duruyor.
3. Alarm mesajları İngilizce mi kalacak? Kalacaksa bu bir yerde beyan edilsin.
4. Mevcut 232 ölü satır tek seferlik bir bakım koşusuyla mı çözülsün, yoksa süpürücü
   yazılıp doğal akışta mı temizlensin? (öneri: süpürücü — tek seferlik script tekrar etmez)

## 11. Sonraki adım

Sıra: **test temizliği → dedupeKey → süpürücü → konsol sayaç/sayfalama.**
İlk madde 220 satırı ve günde ~180 yeni satırı kaynağında durdurur ve tek satırlık iki
`deleteMany`'dir.

---

**PLATFORM BEYANI:** macOS 26 (darwin 25.6.0), Node/pnpm, Chromium (Playwright Desktop Chrome,
1280×720) üzerinde doğrulandı. **Windows ve Linux'ta koşulmadı** — bu oturumda o platformlara
erişim yok. Koddan değerlendirme: bulguların hiçbiri platforma bağlı değil; ölçülen şey
sunucuda üretilen HTML ve Postgres satırları, sondalarda süreç öldürme, kabuk/ikili adı,
mutlak dosya yolu, ekran/DPI izni ya da kısayol metni yok. **Tek platforma bağlı sayı**
piksel ölçümleri (y=20.599px, sayfa 22.376px): bunlar 1280×720 görünüm alanına özgüdür,
farklı DPI/çözünürlükte değişir. Bu yüzden aynı bulgu platformdan bağımsız sıra numarasıyla
da verildi: **m10 alarmı 256 satırın 235'incisi** — bu sayı her platformda aynıdır.
