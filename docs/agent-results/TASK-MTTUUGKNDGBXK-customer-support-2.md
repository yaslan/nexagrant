# TASK-MTTUUGKNDGBXK — Alarm konsolu triyajı (re-triage)

**Ajan:** sec-en · **Tip:** runtime / analiz · **Kapsam:** SALT ANALİZ — kod sevkiyatı yok
**Platform:** macOS 26 (darwin 25.6.0), Node 26.5, Postgres (dev DB) · **Sonda:** salt-okunur, kendini doğruluyor
**Ölçüm anı:** 2026-09-10 11:19 UTC (14:19 TRT)

> **Dosya adı notu:** kart iki farklı ad veriyor — gövdede `…-blockzincir-pm.md`, `[KANIT ZORUNLU]`
> bloğunda "TAM ve TEK" olarak `…-customer-support-2.md`. En açık ve "tek" diye işaretlenmiş olanı
> aldım. Benim kalıcı kimlik jetonum ise `sec-en`; kartın verdiği yol kimliğimle uyuşmuyor,
> bilerek karta uydum.

---

## 0. Kartın iki öncülü de yanlış — işe başlamadan önce bunu söylemem gerek

Kart "önceki deneme boş iskelet yazdı, orada durdu" diyor. **Ölçtüm: doğru değil.**

```
$ wc -l docs/agent-results/TASK-MTTUUGKNDGBXK-customer-support.md
     307
$ grep -n "doldurulacak\|TODO\|(placeholder)\|XXX" docs/agent-results/TASK-MTTUUGKNDGBXK-customer-support.md
(eşleşme yok)
```

O dosya **307 satırlık, kanıt bağlantılı, tamamlanmış bir rapor** — QA-EN imzalı, 10 bölüm,
gerçek tarayıcı ölçümü, ekran görüntüleri, kapı çıktısı ve platform beyanı dahil. "(doldurulacak)"
başlığı **tek bir tane bile yok**. Kartın anlattığı sahte-tamamlanma hikâyesi bu dosyaya ait değil.
Dolayısıyla o dosyayı **değiştirmedim, silmedim** — geçerli bir kanıt artefaktı.

İkinci öncül: kart "bilinen gerçek" diye `SystemAlert` = **106 satır** veriyor ve "ölçüm zaten
yapıldı, tekrarlama" diyor. Ölçtüm çünkü **o sayı 2,5 kat bayat**:

| | kart | önceki rapor (14:09) | **şimdi (14:19)** |
|---|---|---|---|
| toplam satır | 106 | 256 | **263** |
| açık | 106 | 256 | **263** |
| çözülmüş | 0 | 0 | **0** |
| `invoice_buyer_identity_missing` | 82 (%77,4) | 221 (%86,9) | **229 (%87,1)** |

Yığın ben ölçerken de büyüdü: **260 → 261 → 262 → 263**, dört dakikada. "Tekrarlama" talimatına
uysaydım rapor daha yazılırken yanlış olacaktı. Kartın kaynak dağılımı da artık geçersiz
(`cordis-sync` ve `cordis-delta` kartta hiç yok; bugün 11 satır).

**Kanıt:** `TASK-MTTUUGKNDGBXK-evidence/08-retriage-secen.txt`, `10-headroom-at-report-time-secen.txt`

---

## 1. Triyaj tablosu — 263 açık alarmın tamamı, kök nedene göre

Her satır bir kova; "satır" = konsolda görünen satır, "oluşum" = `alertRepeatCount` ile katlanmış
gerçek olay sayısı. **Sıralama: temizlenebilirlikten gerçekliğe.**

| # | Kova | Satır | % | Oluşum | Kaynak(lar) | Bugün geçerli mi | Kimin işi |
|---|---|---|---|---|---|---|---|
| A | **Ölü test artığı — kiracı silinmiş** | **229** | **87,1** | 229 | `invoice_buyer_identity_missing` | **HAYIR — bir daha asla doğru olamaz** | test hijyeni |
| B | Test/sonda hostu artığı | 11 | 4,2 | 25 | `k2_monthly_cordis` ×8, `invoice_not_issued` ×2, `cordis-delta` ×1 | HAYIR — `127.0.0.1:*`, `localhost:8000`, `example.invalid`, `127.0.0.1:1` | test hijyeni |
| C | **Gerçek hata — tek eksik yapılandırma** | 3 | 1,1 | **153** | `cordis-sync` ×2, `cordis-delta` ×1 | **EVET** — `OPENAI_API_KEY not set` | ops/config |
| D | Gerçek veri kalitesi sinyali | 5 | 1,9 | 50 | `cordis-sync` ×4, `cordis-delta` ×1 | **EVET** — eşlenmeyen alan, PIC yok, projectId yok | ürün (ingest) |
| E | Bilinmiyor — koşmadan söylenemez | 7 | 2,7 | 7 | `k1_daily_calls` | **BİLİNMİYOR** — 6× yinelenen identifier, 1× `sedia` fetch hatası | ürün (K1) |
| F | Kendini iyileştirmiş, satır açık kalmış | 3 | 1,1 | 11 | `invoice_vat_country_unknown` ×2, `invoice_not_issued` ×1 | **HAYIR** — koşul artık yok (§2) | süpürücü |
| G | Duran politika beyanı — asla kapanmayacak | 1 | 0,4 | **231** | `invoice_profile_assumed` | evet ama **olay değil** | ürün kararı |
| H | Gerçek hata — kredi | 1 | 0,4 | 4 | `m10_document_generation_failed` | **EVET** — AI kredisi yetersiz | ops |
| I | Gerçek upstream 404 | 1 | 0,4 | 1 | `cordis-delta` (`ec.europa.eu`) | **EVET** | ürün (ingest) |
| J | Yapılandırma kararı bekliyor | 1 | 0,4 | 11 | `cordis-delta` "delta endpoint yapılandırılmamış" | evet ama **hata değil** | ürün kararı |
| | **TOPLAM** | **263** | 100 | ~722 | | | |

**Tek cümlelik okuma:** konsolun **%91,3'ü (A+B+F, 243 satır) ölü** — ya kiracısı silinmiş, ya test
hostu, ya da koşulu ortadan kalkmış. Operatörün bugün gerçekten bakması gereken **17 satır** var
(C+D+E+H+I), ve bunlar **215 oluşumu** temsil ediyor.

### A kovası: 229 satır tam olarak nereden geliyor

```
=== id shape of the gone tenants ===
 157  t-idem-*  (tests/stripe-webhook-idempotency.live.test.ts)
  70  cuid cmt* (tests/e2e/invoice-write-path.spec.ts)
tenants that STILL EXIST : 1 -> demo-tenant
rows whose tenant IS GONE: 229  <- can never become true again
```

İki testin de temizliği kiracıyı siliyor, **alarmı silmiyor** — doğrudan kaynaktan:

```
tests/stripe-webhook-idempotency.live.test.ts:103-110
  auditEvent, creditLedger, addOn, moduleState, invoice, subscription, tenant, plan  ← systemAlert YOK

tests/e2e/invoice-write-path.spec.ts:99-103
  invoice, tenantBillingIdentity, tenant                                             ← systemAlert YOK
```

`SystemAlert`'in `Tenant`'a FK'si ve cascade'i olmadığı için satırlar öksüz kalıyor.
Ve `.live.test.ts` vitest exclude listesinde **değil** (`vitest.config.mts:6` — sadece
`node_modules|dist|tests/e2e|.next|docs|.claude/worktrees`), yani **`pnpm test` koşan her
geliştirici konsola kalıcı, kapanamaz, error seviyesinde satır ekliyor.**

Doğru desen depoda zaten var: `tests/e2e/purge-failure-alert-console.spec.ts:80` kendi alarmını
`systemAlert.deleteMany` ile topluyor — repodaki **tek** `systemAlert.deleteMany`.

### C kovası: 153 oluşum, tek bir eksik değişken

Üç satır aynı şeyi söylüyor ve konsoldaki **en yoğun gerçek arıza** bu:

```
cordis-sync   error x93  CORDIS record failed to sync: OPENAI_API_KEY not set   projectId 101100001
cordis-delta  error x50  CORDIS delta item failed to ingest: OPENAI_API_KEY not set
cordis-sync   error x10  CORDIS record failed to sync: OPENAI_API_KEY not set   projectId 101100002
```

Tek bir ortam değişkeni bugünkü gerçek hata oluşumlarının **%71'ini** üretiyor.

---

## 2. Kendini iyileştirmiş satırlar (F) — koşul yok, alarm hâlâ açık

| satır | alarm ne diyor | bugünkü gerçek |
|---|---|---|
| `invoice_not_issued` ×9 oluşum | `INVOICE_VAT_RATE is not set…` | **o değişken koddan tamamen kaldırılmış** — `grep -rn INVOICE_VAT_RATE src/ prisma/ scripts/` → 0 sonuç |
| `invoice_vat_country_unknown` ×2 | `no sourced VAT rate for Türkiye; src/lib/billing/vat-rates.ts currently covers KW` | **TR artık tabloda** — `vat-rates.ts:102 country:'TR'`, `:109 aliases:['TR','TUR','TÜRKİYE',…]` |

İkincisi ayrıca bir yan bulgu: alarm mesajının içine **kaynak kodu dosya yolu** (`src/lib/billing/vat-rates.ts`)
ve o anki kapsam ("covers KW") gömülmüş. Dosya 460 satıra büyümüş, mesaj hâlâ "KW" diyor —
**mesaj gövdesine kod durumu yazmak, mesajı doğduğu anda bayatlatıyor.**

---

## 3. Yığın neden hiç küçülmüyor — üç eksik yazıcı

`resolvedAt` sütununu `SystemAlert` için yazan **tek yer** insanın tıkladığı düğme:

```
src/app/[locale]/admin/alerts/actions.ts:39
  await prisma.systemAlert.update({ where: { id }, data: { resolvedAt } });
```
(`admin/feedback/actions.ts:53` başka bir tablo — `SystemAlert` değil.)

- **Üretici kendi alarmını kapatmıyor.** Fatura başarıyla kesildiğinde, K2 koşusu düzeldiğinde
  hiçbir şey `resolvedAt` yazmıyor.
- **Süpürücü yok.** `src/lib/inngest/jobs/` içinde `alerts-daily.ts` **var ama alakasız** —
  o, kayıtlı-arama bildirim e-postası gönderen bir iş ve `recordAlert` ile alarm **üretiyor**.
  Saklama/temizlik işi yok. *(Önceki rapor "jobs içinde yok" demişti; dosya adı yanıltıcı,
  bu yüzden açıkça yazıyorum: sweeper diye bir şey yok, `alerts-daily` o değil.)*
- **Dedup, bu alarm ailesi için yanlış anahtar kullanıyor.** `alertIdentity`
  (`src/lib/observability/system-alert.ts:204-210`) çağıranın `meta`'sının tamamını anahtara
  alıyor. `meta.tenantId` her koşuda farklı → **hiç katlanmıyor** (229 satır). Buna karşılık
  `meta`'sı sabit olan `invoice_profile_assumed` **231 oluşumu tek satıra** katlamış.
  **Dedup bozuk değil — koşu-başına-değişen tanımlayıcı taşıyan alarmlar için yanlış anahtar.**

Sonuç aritmetiği kaçınılmaz: 263 satır, **0 çözülmüş**, ve hiç kimse 263 kez tıklamayacak.

---

## 4. Zaman baskısı — konsol ne zaman yalan söylemeye başlar

```
console MAX_ROWS        : 300      (src/app/[locale]/admin/alerts/page.tsx:12)
total rows              : 263
headroom left           :  37 rows
  last 1h :  18 rows (18.0/h)
  last 6h : 114 rows (19.0/h)
```

**37 ÷ 18/saat ≈ 2 saat.** Eşik aşıldığında ne olacağı kod okumasıyla kesin:

```
page.tsx:52-54   rows = findMany({ orderBy:{createdAt:'desc'}, take: MAX_ROWS })   ← kırpma
client.tsx:107   for (const r of rows) { … if (resolvedAtOf(r)===null) open += 1 } ← kırpılmış diziyi sayıyor
```

Başlık kutuları DB'den toplam saymıyor, **kırpılmış diziyi** sayıyor. 300 aşıldığında
"Toplam uyarı" **300'de donacak**, "Çözülmemiş" **eksik sayacak**, en eski satırlar arayüzden
tamamen erişilemez olacak — ve bunu söyleyen **tek bir kelime yok**:

```
$ grep -n "MAX_ROWS\|showing\|truncat\|daha fazla\|sayfa\|pagination\|limit" \
    src/app/[locale]/admin/alerts/client.tsx src/app/[locale]/admin/alerts/page.tsx
page.tsx:12: const MAX_ROWS = 300;
page.tsx:54:       take: MAX_ROWS,
(client.tsx'te hiç yok)

$ adminAlerts i18n anahtarları (messages/tr.json)
title, subtitle, total, openCount, errorCount, empty, loadError, filterAll, filterLevel,
filterSource, filterUnresolvedOnly, colLevel, colSource, colMessage, colCreated, colResolved,
levelinfo, levelwarn, levelerror, resolve, unresolve, resolvedAt, unresolvedLabel, saving,
saveFailed, metaLabel, privacyNote, feedbackLink, highlighted, repeatLabel, repeatNote, lastSeen
          ← kırpmayı/sayfalamayı anlatan anahtar YOK
```

**Dürüstlük şartı — bu iki saat prod'un saati değil:** ölçüm **geliştirme veritabanında** yapıldı
ve 18/saat hızın kaynağı kardeş ajanların `pnpm test` koşuları. Prod'da `t-idem-*` kiracıları
olmayacağı için o hız orada geçerli değil. **Prod'da acil olan saat değil, tasarım:** sayaçların
kırpılmış diziden okunması ve kırpmanın hiçbir yerde beyan edilmemesi, yığın hangi hızla büyürse
büyüsün 300'ü aştığı gün konsolu sessizce yanlış yapar. Prod'da aynı sondayı koşmadan
"prod da böyle" **denmemeli**.

---

## 5. ÖNERİ — tek öneri, ve neden bu sırayla

> **Yığını temizlemeden önce musluğu kapat. İlk iş, politika kararı içermeyen tek iş olan
> test hijyenidir; geri kalan her şey ürün kararı bekler ve ondan sonra gelir.**

**Adım 0 (tek gerçek "şimdi" işi) — iki teste birer `deleteMany` satırı.**
`tests/stripe-webhook-idempotency.live.test.ts:103-110` ve `tests/e2e/invoice-write-path.spec.ts:99-103`
temizliklerine `systemAlert` eklenir. Desen depoda hazır: `purge-failure-alert-console.spec.ts:80`.
Neden ilk: **A kovasının 229 satırını ve saatte ~18 satırlık girişi kaynağında durdurur**, iki
satırlık değişikliktir, ve **hiçbir politika kararı içermez** — bu yüzden diğerlerini beklemesi
gerekmez. Bu yapılmadan yığın temizlense bile birkaç günde geri gelir.

Sonraki adımlar, **her biri bir karar gerektirdiği için** ayrı kartlar (§6'daki açık sorulara
cevap gelmeden başlanmamalı):

1. **`dedupeKey`** — `RecordAlertInput`'a isteğe bağlı `dedupeKey?: string`; verilmişse
   `alertIdentity` `meta` yerine onu kullanır. `invoice-writer.ts` `dedupeKey: 'buyer_identity_missing'`
   geçer → 229 satır 1 satıra iner. *Karar: dedup anahtarını seçmek çağıranın mı yoksa modülün mü işi.*
2. **Süpürücü** (`alerts-sweep`, günlük) — `meta.tenantId` taşıyıp o kiracı artık olmayan açık
   alarmları `resolvedAt` + `meta.resolvedBy='sweep:tenant_gone'` ile **çözüldü işaretler (silmez —
   kayıt denetim izidir)**; çözülmüş ve N günden eski satırları siler. *Karar: N kaç gün.*
3. **Üretici kendi alarmını kapatsın** — `resolveAlerts(selector)`, `recordAlert`'in kardeşi
   (asla fırlatmaz, sır yazmaz). Çağrı yerleri: `invoice-writer.ts` (fatura kesilince),
   `k1-daily-calls.ts` / `k2-monthly-cordis.ts` (koşu başarılıysa). *Karar: hangi alarm
   kendiliğinden kapanmaya uygun.*
4. **Konsol sayaçları ve kırpma beyanı** — sayaçlar DB'den `count()` ile alınmalı, kırpma
   ekranda `t()`'li bir satırla söylenmeli (bugün ne kod ne i18n'de var). *Karar: sayfalama mı,
   yoksa "son 300 gösteriliyor" beyanı mı.*

**C kovası (`OPENAI_API_KEY`) bu sıranın dışında ve paraleldir** — kod değil ortam işi, 3 satır /
153 oluşum, ve tek değişkenle biter.

**Kod sevkiyatı yapılmadı** (kartın kapsamı). Yukarıdaki adımların hiçbiri uygulanmadı.

---

## 6. Açık sorular (karar gerekiyor)

1. Saklama süresi: çözülmüş alarm kaç gün sonra silinsin?
2. `invoice_profile_assumed` (G kovası, 231 oluşum) gibi **duran politika beyanları** alarm mı
   olmalı, yoksa ayrı bir "bilinen kısıtlar" listesi mi? Bugün asla kapanamayacak bir satır.
3. `cordis-delta` "delta endpoint yapılandırılmamış" (J) — yapılandırılacak mı, yoksa alarm mı susturulacak?
4. Alarm mesajları İngilizce mi kalacak? (Türkçe çerçeve + İngilizce gövde, hiçbir yerde beyan edilmemiş.)
5. Mevcut ölü satırlar tek seferlik bakım koşusuyla mı, süpürücüyle mi temizlensin?
6. **Kart hijyeni:** bu kart 4 kez düştü ve verdiği "bilinen gerçek" 2,5 kat bayattı. Kart metnindeki
   sayılar dondurulmuş kanıt olarak değil, **yeniden ölçülecek** olarak işaretlenmeli.

---

## 7. Kanıt artefaktları

| dosya | ne |
|---|---|
| `TASK-MTTUUGKNDGBXK-evidence/08-retriage-secen.txt` | bu oturumun ana ölçümü: 261 satır, kiracı-var/yok, büyüme hızı, kendi kendini doğrulayan salt-okunurluk |
| `.../09-nontenant-alerts-secen.txt` | `meta.tenantId` taşımayan 31 satırın tamamı, mesaj + meta + oluşum sayısıyla (B–J kovaları buradan çıktı) |
| `.../10-headroom-at-report-time-secen.txt` | rapor anındaki sayı: 263 satır, 37 satır pay, 18/saat |
| `.../probe-triage-secen.mts` | salt-okunur sonda (kaynak) — `before===after` self-check'li |
| `.../probe-nontenant-secen.mts` | salt-okunur sonda (kaynak) — `before===after` self-check'li |
| `.../01..07` + `probe-alert-*.mts` | önceki koşunun artefaktları — **dokunulmadı** |
| `TASK-MTTUUGKNDGBXK-customer-support.md` | QA-EN'in 307 satırlık tamamlanmış raporu — **dokunulmadı** |

**Sonda dürüstlüğü:** her iki sonda da çalıştıktan sonra satır sayısını yeniden okuyup
`before === after` doğruluyor; ikisi de `wrote nothing: YES` döndü. Hiçbir alarm yazılmadı,
çözüldü işaretlenmedi, silinmedi.

---

## 8. Riskler

- **Ölçüm dev DB'de.** Prod dağılımı farklı olacak (orada `t-idem-*`/`cmt*` kiracıları yok).
  Prod'da aynı sondayı koşmadan bu tablo prod'a atfedilemez. §4'teki "2 saat" **dev'e özgüdür**;
  prod'a taşınan bulgu, sayaçların kırpılmış diziden okunması ve kırpmanın beyan edilmemesidir.
- **Rapor yazılırken yığın büyümeye devam ediyor** (263 → …). Tablodaki mutlak sayılar
  11:19 UTC fotoğrafıdır; **oranlar** ve kova yapısı sabittir.
- **E kovası (7 satır) "bilinmiyor" olarak kaldı** — K1 koşusu tetiklenmeden yinelenen
  identifier uyarısının bugün hâlâ geçerli olup olmadığı söylenemez. Kart salt-analiz olduğu
  için iş tetiklenmedi. Tahmin yerine "bilinmiyor" yazdım.
- **§4'ün 300-üstü davranışı kod okumasıyla kanıtlandı, ekran görüntüsüyle değil.** Göstermek için
  37 alarm yazmak gerekirdi; sonda salt-okunur tutuldu. Aritmetik ve satır numaraları yukarıda.
- **Bu kart 4 kez düştü.** Beşincisinin de düşmemesi için: düşme nedeni ölçümün zorluğu değil,
  kart metnindeki bayat sayılara güvenilmesi olabilir (§0).

---

## 9. Değişen dosyalar

**Ürün kodunda değişiklik YOK.** Eklenenler yalnız kanıt artefaktı:

```
docs/agent-results/TASK-MTTUUGKNDGBXK-customer-support-2.md          (bu rapor)
docs/agent-results/TASK-MTTUUGKNDGBXK-evidence/probe-triage-secen.mts
docs/agent-results/TASK-MTTUUGKNDGBXK-evidence/probe-nontenant-secen.mts
docs/agent-results/TASK-MTTUUGKNDGBXK-evidence/08-retriage-secen.txt
docs/agent-results/TASK-MTTUUGKNDGBXK-evidence/09-nontenant-alerts-secen.txt
docs/agent-results/TASK-MTTUUGKNDGBXK-evidence/10-headroom-at-report-time-secen.txt
```

Hiçbir mevcut dosya değiştirilmedi veya silinmedi.

## 10. Sonraki adım

§5 Adım 0 için kart aç: **iki testin temizliğine `systemAlert.deleteMany`**. Tek gerçek "şimdi"
işi, iki satır, politika kararı içermiyor, 229 satırı ve saatte ~18 satırlık girişi kaynağında
durduruyor. §5'in 1–4 numaralı adımları §6'daki cevaplar gelmeden ayrı kartlara bölünmemeli.

---

**PLATFORM BEYANI:** macOS 26 (darwin 25.6.0), Node 26.5.0, `npx tsx` + Prisma → yerel Postgres
üzerinde doğrulandı. **Windows ve Linux'ta koşulmadı** — bu oturumda o platformlara erişim yok.
Koddan değerlendirme: bu kartın bulgularının **hiçbiri platforma bağlı değil**. Ölçülen şey
Postgres satırları ve TypeScript kaynak metni; sondalarda süreç öldürme, kabuk/ikili adı, ekran
ya da DPI ölçümü, mikrofon/kamera izni, kısayol metni yok. Kullanılan tek mutlak yol
`dotenv` ile okunan `.env`'dir ve her üç platformda da aynı şekilde çözülür. Bu rapordaki
sayıların tamamı (satır sayısı, kova dağılımı, 37 satır pay, dosya:satır referansları) her
platformda aynıdır — önceki raporun piksel ölçümlerinden farklı olarak burada görünüm alanına
bağlı **hiçbir** rakam yok.
