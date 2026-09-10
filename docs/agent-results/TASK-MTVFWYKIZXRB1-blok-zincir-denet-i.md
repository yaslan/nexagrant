# TASK-MTVFWYKIZXRB1 — e2e her koşuda alarm bırakıyor

**Ajan:** sec-en · **Tip:** bug (test hijyeni + kapı kuralı) · **Platform:** macOS (darwin 25.6.0, Node/pnpm, Postgres @ localhost:5432/fabrika)
**Seçilen çözüm:** **(B)** fixture temizliği + yeni bir kapı kuralı. Şema **değişmedi** — migration/RLS/`DATA_MODEL.md` gerekmedi.
**Sonuç:** öksüz alarm üretimi **0/saat**. Ölçüm öncesi 268 satırın 234'ü (%87) öksüzdü; şimdi 34 satır, 0 öksüz.

---

## 0. Kartın sayılarını kendi ölçümümle tazeledim

Kart 263 satır / 229 öksüz diyordu. Bunlar saatlik bayatlıyor, yeniden ölçtüm.

| an | kaynak | toplam satır | öksüz | konsol boşluğu (cap 300) |
|---|---|---|---|---|
| 2026-09-10T11:16:57Z | önceki kartın triyajı (`08-retriage-secen.txt`) | 261 | 227 | 39 |
| **2026-09-10T11:27:18Z** | **bu kart, T0** (`01-baseline-T0.txt`) | **268** | **234 (%87.3)** | **32** |

**Büyüme hızı, iki zaman damgasıyla:** +7 satır / 10 dk 21 sn → **~40.6 satır/saat** o anda.
T0'daki yuvarlanan pencereler: 18.0/sa (1s), 19.8/sa (6s), 8.1/sa (24s).
Konsol `MAX_ROWS = 300` (`src/app/[locale]/admin/alerts/page.tsx:12`); 32 satırlık boşlukla **~1.8 saat** sonra gerçek bir alarm ekrandan düşecekti.

Öksüzlerin kaynağı (T0): **hepsi** `invoice_buyer_identity_missing`; 164'ü `t-idem-*` (stripe live test), 70'i cuid-tenant (e2e invoice-write-path).

---

## 1. Kök neden — ve neden dedupe bunu tutmuyor

`SystemAlert` **tasarım gereği** tenant-agnostik: `tenantId` kolonu yok, RLS politikası yok (`src/lib/observability/system-alert.ts` başlığı bunu açıkça yazıyor; `prisma/rls.sql`'de iki listede de yok). Test fixture'ları ise ellerindeki tek süpürgeyi kullanıyor: "kiracıma ait tenant-scoped tabloların hepsini sil, sonra kiracıyı sil". `SystemAlert` bu süpürgenin **ulaşamadığı tek tablo**.

Kritik ayrım — ölçümle:

- **Tenant adı geçmeyen 31 satır** (K1/K2/CORDIS) **iyi davranıyor**: `recordAlert` tekrarları tek satırda katlıyor. Bir CORDIS satırı tek başına **231 oluşumu** temsil ediyor (`09-nontenant-alerts-secen.txt`). Bunlar satır sayısını büyütmüyor.
- **Tenant adı geçen satırlar** dedupe'u **yapısal olarak** yeniyor: dedupe kimliği çağıranın `meta`'sını içeriyor, `meta.tenantId` her koşuda yeni bir kiracı → her koşu **yeni satır**. Yığını büyüten sadece bu sınıf.

Yani sorun "alarm çok" değil; **kiracısı ölmüş, bir daha asla doğrulanamayacak** satırların birikmesi.

> **Yan bulgu (bu kartta ÇÖZÜLMEDİ, kayda geçiyor):** `system-alert.ts` başlığı "tenant ids must NOT go into an alert" diyor, ama `src/lib/billing/invoice-writer.ts:402` ve `:434` `meta`'ya `tenantId` yazıyor. Beyan edilen gizlilik sözleşmesi ile kod çelişiyor. İronik biçimde bu kartın çözümü **o çelişkiye dayanıyor** — `meta.tenantId` olmasa fixture alarmını eşleyemezdi. Ayrı bir karta değer: ya sözleşme güncellenmeli ya da alarm kiracıyı id ile değil, ayrı bir referansla göstermeli.

---

## 2. Üç seçenek — neden B, neden A ve C değil

### ❌ (A) `SystemAlert`'e nullable `tenantId` kolonu ekle
Reddedildi, iki ölçülmüş sebeple:

1. **Kolon dürüst olamaz.** Açık satırların **31'inde hiç kiracı yok** ve bunlar uydurma değil — K1/K2 çekicileri ve CORDIS importer'ı gerçekten kiracısız çalışıyor (`09-nontenant-alerts-secen.txt`: `k1_daily_calls`, `k2_monthly_cordis`, `cordis-sync`, `cordis-delta`). Kolon bu satırlarda kalıcı olarak NULL kalır; "tenant-scoped tablo" olma sözünü veremez.
2. **CLAUDE.md kural 1'i açar ve kapatamaz.** "RLS politikası olmayan tenant'lı tablo PR'ı geçmez" — ama NULL-kiracılı satırları hangi politika görecek? RLS koyarsak platform alarmları operatörden gizlenir; koymazsak kolon var + politika yok, kuralın ihlali. Şema kararını bozup yerine daha zor bir karar koyuyor.

Ek maliyet: migration + RLS + `DATA_MODEL.md` + `rls:check` CHECK 4b — en büyük değişiklik, en küçük kazanç.

### ❌ (C) Test ortamında `SystemAlert` yazımını bastır
Reddedildi, **ölçülmüş** sebeple: `tests/e2e/invoice-write-path.spec.ts:121` alarmın **var olduğunu** iddia ediyor ve `meta`'sının vergi numarasını sızdırmadığını kontrol ediyor:

```ts
const alert = await prisma.systemAlert.findFirst({ where: { source: 'invoice_buyer_identity_missing' }, ... });
expect(alert, 'the refusal must be reported, not silent').not.toBeNull();
expect(JSON.stringify(alert?.meta)).not.toContain(BUYER.buyerVknTckn);
```

C bu testi **anında kırar**. Kartın "alarm yazma yolunun kendisi test edilemez hale gelir" endişesi varsayım değil, mevcut bir testin ta kendisi. Üstelik gizlilik iddiası da körleşir.

### ✅ (B) Fixture temizliği + kapı kuralı
En küçük doğru değişiklik: şema aynı, üretim kodu aynı, alarm yazma yolu test edilmeye devam ediyor. Kartın "unutulursa sessizce geri gelir" itirazı gerçek — bu yüzden kapı kuralı **şart** ve aşağıda var.

---

## 3. Ne yapıldı

### 3.1 İki sızdıran fixture (kaynak)
- `tests/e2e/invoice-write-path.spec.ts:110` — `afterAll`'a `meta.tenantId` üzerinden `systemAlert.deleteMany`.
- `tests/stripe-webhook-idempotency.live.test.ts:110` — `cleanUp()`'a aynısı.

Desen zaten depoda vardı (`tests/e2e/purge-failure-alert-console.spec.ts:80`), icat edilmedi:
```ts
await prisma.systemAlert.deleteMany({ where: { meta: { path: ['tenantId'], equals: tenantId } } });
```

### 3.2 Kapı kuralı — `pnpm alerts:check` (yeni)
`scripts/check-orphan-alerts.ts`. Tuttuğu değişmez, dar ve doğru:

> **Açık bir alarm ya hiç kiracı adı taşımaz, ya da yaşayan bir kiracıyı gösterir. Hayalet gösteremez.**

`package.json`: `"alerts:check"` eklendi ve `gate` zincirinin **`test:e2e`'den SONRASINA** iliştirildi — yargıladığı koşunun geride ne bıraktığını görsün diye.

**Neden statik tarama (grep) değil, çalışma-zamanı ölçümü:** bir fixture'ın alarm sızdırıp sızdırmadığı, test edilen üretim kodunun hangi dala girdiğine bağlı; grep buna karar veremez. Ölçtüm: **19 test dosyası tenant siliyor, yalnız 2'si sızdırıyor.** Grep kuralı 17 dosyaya gereksiz ritüel dayatır ve 18.'yi yine kaçırır.

DB yoksa **yüksek sesle atlar** ve 0 döner (`rls:verify` ile aynı sözleşme). Kırmızıysa hangi fixture'ın sızdırdığını adıyla yazar.

### 3.3 Mevcut yığın — YALNIZ dev
`DATABASE_URL` host'u `localhost` olarak doğrulandı; script yerel olmayan host'ta **çalışmayı reddediyor**. Silinen: yalnız açık **ve** kiracısı yok olan 234 satır. Yaşayan kiracılı 3 satıra ve kiracısız 31 satıra **dokunulmadı**.
**PROD DB'ye DOKUNULMADI** — prod için yalnız öneri, §6.

### 3.4 Doküman
`CLAUDE.md` komut listesi + `gate` satırı; `docs/RELEASE_CHECKLIST.md` §3 "Kapı" maddesi.

---

## 4. Kanıt (kopyalanmış çıktı)

Kanıt dizini: `docs/agent-results/TASK-MTVFWYKIZXRB1-evidence/`

### (i) Değişiklik öncesi — kapı KIRMIZI (`02-gate-RED-before.txt`, exit **1**)
```
açık SystemAlert satırı            : 268
  meta.tenantId taşıyan             : 237
  tenant'ı YAŞAYAN                  : 3
  tenant'ı SİLİNMİŞ (öksüz)         : 234
  hiç tenant adı geçmeyen (normal)  : 31

❌ 234 açık alarm, artık var olmayan bir kiracıyı gösteriyor …
   •  164 satır  ←  tests/stripe-webhook-idempotency.live.test.ts
   •   70 satır  ←  kaynak "invoice_buyer_identity_missing" (tenant id bir cuid — fixture adı veriden okunamaz)
```

### Dev yığın temizliği (`03-dev-purge.txt`)
```
target host: localhost  (local dev)
rows before      : 268
orphans to delete: 234
deleted          : 234
rows after       : 34
```

### (ii) Çöp üreten süitleri koş — sayı ARTMADI

| koşu | toplam satır | öksüz | kapı |
|---|---|---|---|
| dev temizliği sonrası (`04`) | 34 | 0 | ✅ exit 0 |
| `vitest run tests/stripe-webhook-idempotency.live.test.ts` (`05`) | 34 (**+0**) | 0 | ✅ exit 0 |
| `playwright test tests/e2e/invoice-write-path.spec.ts` (`07`) | 34 (**+0**) | 0 | ✅ exit 0 |
| **tam vitest süiti** — 1795 test (`10`) | 34 (**+0**) | 0 | ✅ exit 0 |
| **tam e2e süiti** — 159 geçti, 3.6 dk (`11`) | 34 (**+0**) | 0 | ✅ exit 0 |

```
$ npx tsx scripts/check-orphan-alerts.ts        # tam e2e süitinden SONRA
açık SystemAlert satırı            : 34
  tenant'ı SİLİNMİŞ (öksüz)         : 0
✅ Öksüz alarm yok: her açık alarm ya bir tenant adı taşımıyor ya da yaşayan bir tenant’ı gösteriyor.
exit=0
```
Düzeltme öncesi aynı etkinlik yığını ~19–40 satır/saat büyütüyordu; **şimdi 0**.

### ZORUNLU mutasyon sondası — iki dosya için ayrı ayrı

**A) `tests/stripe-webhook-idempotency.live.test.ts`** (`06-mutation-probe-stripe.txt`)
```
temizlik satırı SİLİNDİ → spec tekrar koşuldu:
  önce : 34 satır / 0 öksüz / exit 0 (YEŞİL)
  sonra: 35 satır / 1 öksüz / exit 1 (KIRMIZI)
  ❌ 1 açık alarm … •  1 satır  ←  tests/stripe-webhook-idempotency.live.test.ts
geri alındı → 4 test geçti → sızan satır temizlendi → 34 / 0 / exit 0 ✅
```

**B) `tests/e2e/invoice-write-path.spec.ts`** (`08-mutation-probe-e2e.txt`)
```
temizlik satırı SİLİNDİ → spec tekrar koşuldu:
  önce : 34 satır / 0 öksüz / exit 0 (YEŞİL)
  sonra: 35 satır / 1 öksüz / exit 1 (KIRMIZI)
4 e2e testi HER İKİ durumda da GEÇTİ — sızıntı onlara görünmüyor.
Kapının ayrı bir ölçüm olmasının sebebi tam olarak bu.
geri alındı → 4 test geçti → sızan satır temizlendi → 34 / 0 / exit 0 ✅
```

### Kapı bileşenleri
```
$ npx tsc --noEmit                                  → exit 0
$ npx eslint scripts/check-orphan-alerts.ts tests/e2e/invoice-write-path.spec.ts \
             tests/stripe-webhook-idempotency.live.test.ts   → exit 0
$ npx vitest run   → Test Files 149 passed | 2 skipped (151)
                     Tests 1795 passed | 8 skipped (1803)
$ E2E_PORT=3117 npx playwright test → 159 passed, 8 failed, 1 skipped, 3 did not run (3.6m)
```

**e2e'deki 8 kırmızı benim değil, ÖNCEDEN VAR.** `docs/agent-results/TASK-MTV8W14FY9BKD-geli-tirici.md:383-386` aynı kümeyi HEAD'de kırmızı olarak kayda geçirmiş: `theme-no-script-warning` (2) + `theme-paint-timing` (2) tema/hydration; `price-lock` (3) + `document-export-tenant-isolation` (1) "HEAD'de de kırmızı". O kayıttaki 9. kırmızı (`partb-template-identity`, sıra-bağımlı flake) bu koşuda yeşildi. Değişikliğim iki test dosyasının `afterAll`/`cleanUp` gövdesi ve yeni bir script — tema render'ına veya fiyat kilidine dokunamaz.

---

## 5. Değişen dosyalar
| dosya | ne |
|---|---|
| `tests/e2e/invoice-write-path.spec.ts` | `afterAll`'a `SystemAlert` temizliği (+12 satır, gerekçesi yorumda) |
| `tests/stripe-webhook-idempotency.live.test.ts` | `cleanUp()`'a aynısı (+10 satır) |
| `scripts/check-orphan-alerts.ts` | **YENİ** — öksüz alarm kapısı |
| `package.json` | `alerts:check` script'i; `gate` zincirine `test:e2e`'den sonra eklendi |
| `CLAUDE.md` | komut listesi + `gate` satırı güncellendi |
| `docs/RELEASE_CHECKLIST.md` | §3 Kapı'ya `pnpm alerts:check` maddesi |
| `docs/agent-results/TASK-MTVFWYKIZXRB1-evidence/*` | 11 kanıt dosyası + dev-only purge script'i |

Şema/migration/RLS/`DATA_MODEL.md`: **değişmedi** (B seçildi). `rls:check` CHECK 4b konusu doğmadı.
P0 worker'ın dosyalarına (`settings/billing/*`, `src/lib/billing/billing-identity.ts`) **dokunulmadı**.

---

## 6. Riskler ve prod önerisi

1. **Kapı ağaç hijyeni de ölçüyor.** Başka birinin bıraktığı öksüz satır kapıyı senin PR'ında kırmızı yakabilir. Bilinçli: mesaj hangi fixture olduğunu yazıyor ve onarım tek satır. Yine de bu bir "ortam" kırmızısı; gürültü yaparsa uyarıya düşürülebilir.
2. **`blame()` cuid'li kiracıyı adlandıramaz.** `prisma.tenant.create` provenance taşımayan bir id üretiyor; o durumda alarmın `source`'unu yazıyorum, fixture adı **uydurmuyorum**.
3. **Ölçüm dev DB'de** (localhost:5432/fabrika). Prod'da öksüz alarm olup olmadığı **bilinmiyor** — ölçülmedi.
4. **PROD ÖNERİSİ (uygulanmadı, karar sizin):** önce `scripts/check-orphan-alerts.ts`'i prod'a karşı **salt-okunur** koşun; sayı 0 ise iş yok. Sıfır değilse prod'da satır **silmeyin** — orada öksüz bir alarm gerçek bir olayın kaydı olabilir; `resolvedAt` yazmak doğru hamledir. Ama bu §7'ye bağlı.
5. **8 e2e kırmızısı** hâlâ ağaçta ve bu kartın kapsamı değil (§4'te kaynağıyla).

## 7. Açık sorular
1. **`SystemAlert.resolvedAt` hiç yazılmıyor** — 268 satırın **sıfırı** çözülmüştü. Bu ayrı bir karar ve `TASK-MTTUUGKNDGBXK` raporlarının §4'ünde **1-3-1 olarak duruyor**; bu kartta çözmedim. Prod temizliği (§6.4) o kararın çıkmasını bekliyor: çözme mekanizması olmadan "resolvedAt yaz" tavsiyesi uygulanamaz.
2. **Gizlilik çelişkisi (§1 yan bulgu):** `system-alert.ts` "kiracı id'si `meta`'ya yazılmaz" diyor, `invoice-writer.ts:402,434` yazıyor. Hangisi doğru? Sözleşme mi güncellenecek, kod mu? **Not:** kod düzeltilirse bu kartın fixture eşleşmesi de kırılır — birlikte taşınmalı.
3. Kapı, alarm **sayısı** için bir tavan da koymalı mı (ör. açık satır > 250 → uyarı)? Öksüz olmayan gerçek bir alarm seli de konsolu doldurabilir; bu kart onu kapsamıyor.

## 8. Sonraki adım
- §7.1 (1-3-1 `resolvedAt`) karara bağlansın; sonra prod salt-okunur ölçümü + §6.4.
- §7.2 için ayrı kart: gizlilik sözleşmesi ile `invoice-writer.ts` meta'sını hizala (bu kartın fixture eşleşmesine bağımlı).
- 8 önceden var olan e2e kırmızısı hâlâ sahipsiz.

---

**PLATFORM BEYANI:** İş **macOS**'ta (darwin 25.6.0, zsh, Postgres @ localhost:5432) uçtan uca doğrulandı: birim, e2e ve kapı ölçümlerinin tamamı burada koşuldu. **Windows ve Linux koşulmadı — bu ortamda o platformlar yok.** Dokunduğum kod yolunun platform bağımlılığı **yok**, koddan söylüyorum: `scripts/check-orphan-alerts.ts` yalnız Prisma sorgusu + `console` çıktısı; süreç öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI veya cihaz izni kullanmıyor. Tek platforma değen ayrıntı `DATABASE_URL`'in **host adı** — script `localhost/127.0.0.1/::1` dışında çalışmayı reddeder; bu her üç platformda aynı davranır. Fixture değişiklikleri saf Prisma çağrısı. Bu yüzden Windows/Linux'ta farklı davranmasını bekletecek bir sebep yok, ama **ölçülmedi** — iddia değil, koddan çıkarım.
