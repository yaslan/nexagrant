# TASK-MTVFJTNW6OW11 — `resolvedAt` üreticisi + öksüz alarm süpürücüsü

**Ajan:** blok-zincir-dev (DevOps) · **Tarih:** 2026-09-10 · **Platform:** macOS (darwin 25.6.0)

## 1. Ne yapıldı

Kartın kodu önceki bir pane'de yazılmış ama pane `exit 129` (SIGHUP) ile düştüğü için
commit edilmemişti. Kod devralındı, okundu, **gerçek DB'ye karşı ölçüldü**, bir eksiği
tamamlandı ve commit edildi.

Sorun: `resolvedAt` bugüne dek **yalnız** admin konsolunda bir insan "çözüldü" tıkladığında
yazılıyordu. Bu iki tür alarmı sonsuza dek açık bırakıyordu:
1. Koşulu kendiliğinden düzelen alarm (fatura alıcı kimliği sonradan tamamlanır).
2. Artık var olmayan bir kiracıyı gösteren alarm — `SystemAlert`'in `Tenant`'a FK'si ve
   cascade'i yok, silinen kiracı alarmlarını geride bırakır. Bunlar **hiçbir zaman**
   doğrulanamaz ve konsolun en yeni 300 satırını doldurur.

İki taraf da eklendi:

- **Üretici:** `resolveAlerts(selector)` (`system-alert.ts`). Alarmı **yükselten aynı kod
  yolu**, koşulun artık doğru olmadığını gördüğü anda kapatır. İlk çağıran:
  `createInvoiceForPayment`, alıcı kimliği tamamlanınca
  `resolveAlerts({ source: 'invoice_buyer_identity_missing', meta: { tenantId } })`.
  Kimliği düzelten operatörün ayrıca gidip "çözüldü" tıklaması gerekmiyor.
- **Süpürücü:** `alertsSweep` Inngest işi (günlük 04:15 UTC, K2'nin 04:00'ı ile
  alerts-daily'nin 08:00'ı arasında — ikisiyle de yarışmaz) + elle tetikleme için
  `pnpm jobs:alerts-sweep`. Kiracısı silinmiş açık alarmları kapatır.

Süpürücünün iki kasıtlı kısıtı ölçümle doğrulandı: **satırı SİLMEZ**, `resolvedAt` yazar
(denetim izi, temizlik değil) ve **yaşayan** bir kiracıyı gösteren satıra dokunmaz — o
hâlâ bir operatörün çözmesi gereken gerçek problemdir, gizlenmemelidir.

**Devralınan koddaki tek eksik:** `events.ts`, yaş eşiğinin gerekçesi için
`alerts-sweep.ts`'e yönlendiriyordu ama o dosyada gerekçe yazılmamıştı (sadece sabitin
adı vardı). Gerekçe bu oturumda yazıldı ve ölçümle desteklendi (aşağıda §2.2).

## 2. Kanıt

### 2.1 Başlangıç durumu (taban)

```
açık SystemAlert satırı            : 34
  meta.tenantId taşıyan             : 3
  tenant'ı YAŞAYAN                  : 3
  tenant'ı SİLİNMİŞ (öksüz)         : 0
✅ Öksüz alarm yok
```

### 2.2 Üç dallı kurulum (gerçek DB)

Süpürücünün üç davranışını da tek koşuda ölçmek için üç açık satır hazırlandı:

```
live tenant used: cmtv5qxop005tswxknw6fj3xz (M9-E2e Kuruluşu)
staged rows:
  orphan+old   id=cmtvpui0300008sxkjr0xo6e1 createdAt=2026-09-10T13:02:42.713Z   (3 saat)
  orphan+young id=cmtvpui0300018sxk67r31hz8 createdAt=2026-09-10T15:57:42.713Z   (5 dakika)
  alive+old    id=cmtvpui0300028sxkn497gr3k createdAt=2026-09-10T13:02:42.713Z   (3 saat, YAŞAYAN kiracı)
```

Kapı beklendiği gibi **KIRMIZI**ya döndü:

```
$ pnpm alerts:check
açık SystemAlert satırı            : 37
  tenant'ı SİLİNMİŞ (öksüz)         : 2
❌ 2 açık alarm, artık var olmayan bir kiracıyı gösteriyor — ...
   •    1 satır  ←  kaynak "zzverify_sweep_orphan_old"
   •    1 satır  ←  kaynak "zzverify_sweep_orphan_young"
[ELIFECYCLE] Command failed with exit code 1.
```

Süpürücü koşturuldu:

```
$ pnpm jobs:alerts-sweep
[jobs:alerts-sweep] start 2026-09-10T16:02:58.976Z
[jobs:alerts-sweep] {
  "success": true,
  "scanned": 36,
  "closed": 1
}
```

Satırların DB'deki hâli — **üçü de tabloda duruyor**, yani süpürücü silmedi:

```
rows still PRESENT in table: 3  (3 = sweep resolved, did NOT delete)
  zzverify_sweep_alive         resolvedAt=null (still open)              alertResolvedBy=-
  zzverify_sweep_orphan_old    resolvedAt=2026-09-10T16:02:58.976Z       alertResolvedBy=sweep:tenant_gone
  zzverify_sweep_orphan_young  resolvedAt=null (still open)              alertResolvedBy=-
```

Üç dal da kanıtlandı:
- **öksüz + yaşlı** → `resolvedAt` aldı, `alertResolvedBy=sweep:tenant_gone` damgalandı, **satır silinmedi**;
- **öksüz ama genç** → dokunulmadı → *yaş eşiği canlı olarak çalışıyor*;
- **yaşlı ama kiracısı yaşıyor** → dokunulmadı.

### 2.3 Kapı yeşile döndü — ve bunun sebebi süpürme

Yaş eşiğini ve "yaşayan kiracı" dalını kanıtlamak için konan iki **kontrol** satırı
silindi; **süpürülen satır kasıtlı olarak tabloda bırakıldı**. Böylece yeşil sonuç
doğrudan süpürücünün yazdığı `resolvedAt`'e atfedilebilir — satır hâlâ orada, ama artık
"açık" değil:

```
removed 2 control rows; the SWEPT row is deliberately left in place.

$ pnpm alerts:check
açık SystemAlert satırı            : 34
  meta.tenantId taşıyan             : 3
  tenant'ı YAŞAYAN                  : 3
  tenant'ı SİLİNMİŞ (öksüz)         : 0
  hiç tenant adı geçmeyen (normal)  : 31

✅ Öksüz alarm yok: her açık alarm ya bir tenant adı taşımıyor ya da yaşayan bir tenant’ı gösteriyor.
```

**Dürüst not:** süpürme tek başına kapıyı yeşile çevirmek için *yeterli değildir* —
bir saatten genç öksüzler kasıtlı olarak açık kalır. Bu bir kusur değil, tasarımın
kendisidir ve `MIN_AGE_MS` yorumunda gerekçesi yazılıdır: `alerts:check` `pnpm gate`'in
**en sonunda** koşar ve o koşunun sızdırdığı alarmı yakalamak içindir. Yaş tabanı
olmasaydı süpürücü, fixture kiracıyı siler silmez o sızıntıyı kapatıp kapıya haksız bir
yeşil verirdi — yani var olma sebebi olan kusuru gizlerdi.

### 2.4 Doğrulama çöpü temizlendi (ayrı sayım)

```
zzverify_ rows before delete : 1
deleted                      : 1
zzverify_ rows AFTER delete  : 0   (must be 0)
SystemAlert total: 35 -> 34
```

Bağımsız artık taraması:

```
zzverify_ rows (any state) : 0   (must be 0)
ghost-tenant rows          : 0   (must be 0)
SystemAlert total          : 34
SystemAlert open           : 34   (baseline was 34)
```

Tablo tabana **birebir** döndü (34/34). Bu ekipte doğrulama çöpü daha önce 286 satırla
kart açtırmıştı; tekrarlanmadı. Betikler repoya değil scratchpad'e yazıldı.

### 2.5 Kapılar

```
$ pnpm typecheck
$ tsc --noEmit
=== exit: 0 ===

$ pnpm lint
$ eslint
(çıktı yok = temiz)

$ pnpm vitest run ... (4 dosya)
 Test Files  4 passed (4)
      Tests  72 passed (72)
```

## 3. Değişen dosyalar

- `src/lib/observability/system-alert.ts` — `resolveAlerts()`, `ALERT_RESOLVED_BY_KEY`.
- `src/lib/inngest/jobs/alerts-sweep.ts` *(yeni)* — `sweepOrphanTenantAlerts` + cron işi;
  bu oturumda `MIN_AGE_MS` gerekçesi yazıldı.
- `src/lib/inngest/jobs/alerts-sweep.test.ts` *(yeni)* — 5 birim testi.
- `src/lib/inngest/events.ts` — `AlertsSweepEventSchema` / `AlertsSweepOutputSchema`.
- `src/lib/inngest/jobs/index.ts`, `src/app/api/inngest/route.ts` — iş kaydı.
- `src/lib/billing/invoice-writer.ts` (+ testi) — üretici tarafı `resolveAlerts` çağrısı.
- `scripts/run-alerts-sweep.ts` *(yeni)*, `package.json` — `pnpm jobs:alerts-sweep`.
- `tests/invoice-fx-tcmb.test.ts` — yeni çağrıya uyum.

## 4. Riskler

- **Geri alınabilirlik:** süpürücü satırı silmediği için işlem geri alınabilir —
  yanlış kapatılan satırlar `resolvedAt = null` ile geri açılabilir ve
  `meta.alertResolvedBy = 'sweep:tenant_gone'` damgası hangi satırların bu işten
  etkilendiğini tam olarak seçmeyi sağlar. Geri alma:
  `UPDATE "SystemAlert" SET "resolvedAt" = NULL WHERE meta->>'alertResolvedBy' = 'sweep:tenant_gone';`
- Cron 04:15 UTC'de sessizce koşar; `success:false` durumunda iş kırılmaz, yalnız
  konsola yazar (tasarım gereği: bakım işi kendi başına olay yaratmamalı). Bu yüzden
  **süpürücünün sürekli başarısız olması sessiz kalır** — izleme notu §6'da.
- `resolveAlerts` bir `source` altındaki tüm açık satırları çekip JS'te süzer; bu kaynak
  çok büyürse sorgu pahalılaşır. Bugünkü ölçekte (34 açık satır) önemsiz.

## 5. Açık sorular

- Süpürücü kapsamı şimdilik yalnız "kiracısı silinmiş" öksüzler. Kiracısı yaşayan ama
  aylardır açık duran alarmlar için ayrı bir yaşlandırma politikası isteniyor mu?
  (Bilerek kapsam dışı bırakıldı: bunlar gerçek problemler.)

## 6. Sonraki adım

- İzleme: `alertsSweep` çıktısındaki `closed` sayısı düzenli olarak 0'dan büyük
  kalıyorsa, bu bir fixture'ın alarm sızdırmaya devam ettiğini gösterir — kök neden
  `alerts:check`'in işaret ettiği fixture temizliğidir, süpürücü yalnız semptomu alır.
  `success:false` için ayrı bir uyarı eşiği kurulmalı (süpürücü sessizce başarısız olur).

## 7. Platform beyanı

**macOS (darwin 25.6.0) üzerinde doğrulandı** — gerçek Postgres'e karşı, `pnpm
jobs:alerts-sweep` ve `pnpm alerts:check` elle koşturuldu.
Windows/Linux **koşulmadı**. Bu değişiklik platforma bağlı değildir: dokunulan kod
Prisma sorguları, `Date` aritmetiği ve Zod doğrulamasından ibarettir; süreç öldürme,
dosya yolu, kabuk/ikili adı, ekran/DPI veya cihaz izni içermez. `scripts/run-alerts-sweep.ts`
`tsx` ile koşar ve `package.json` script'i kabuktan bağımsızdır. Cron UTC üzerinden
tanımlıdır, çalıştıran makinenin yerel saat diliminden etkilenmez. Diğer platformlarda
davranış aynıdır.
