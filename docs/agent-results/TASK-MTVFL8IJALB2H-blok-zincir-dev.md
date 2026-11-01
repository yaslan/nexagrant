# TASK-MTVFL8IJALB2H — `recordAlert` dedup anahtarı (`dedupeKey`)

**Ajan:** blok-zincir-dev (DevOps) · **Tarih:** 2026-09-10 · **Platform:** macOS (darwin 25.6.0)

## 1. Ne yapıldı

Bu kartın kodu 2026-09-10'da önceki bir pane'de yazılmış, ancak pane `exit 129` (SIGHUP)
ile düştüğü için commit edilmemiş ve raporlanmamıştı. Bu oturumda kod devralındı, diff
uçtan uca okundu, **gerçek veritabanına karşı davranışı ölçüldü** ve commit edildi.

Sorun: `recordAlert`'in dedup kimliği `(level, source, message, meta)` idi — yani
çağıranın **tüm** meta'sını kimliğe katıyordu. Meta her oluşumda değişen ama problemi
değiştirmeyen bir alan taşıdığında (request uuid, timestamp, run counter, geçici dosya
yolu) dedup **tanım gereği** hiç çalışmıyordu; her oluşum yeni satır açıyordu.

Çözüm: `RecordAlertInput.dedupeKey` opsiyonel alanı. Verildiğinde kimlik
`(level, source, dedupeKey)` olur; `message` ve meta'nın geri kalanı yalnızca satırda
görüntü detayı olarak kalır, karşılaştırmaya girmez. Verilmediğinde eski kimlik
**aynen** korunur (geriye dönük uyumlu).

Uygulamadaki iki incelik — ikisi de kodda gerekçesiyle yorumlanmış:
- `dedupeKey` varken aday sorgusu `message` üzerinde daraltılmaz; daraltsaydı anahtarın
  var olma sebebi olan "message değişse de aynı alarm" durumunu kaçırırdı.
- Aday kimliği adayın **kendi** `message`'ından kurulur, `row.message`'tan değil; aksi
  halde dedup anahtarı olmayan eski (legacy) bir aday için yanlış kimlik hesaplanırdı.
- `alertDedupeKey` rezerve meta anahtarıdır (`RESERVED_META_KEYS`), böylece çağıran onu
  meta üzerinden doğrudan enjekte edip kimliği taklit edemez.

## 2. Kanıt

### 2.1 Gerçek DB ölçümü — kopyalanmış çıktı

Aynı problem, meta'sında **koşu-başına-değişen** dört alanla (uuid + timestamp +
sayaç + geçici dosya yolu) iki kez `recordAlert` ile üretildi:

```
run marker: f20ee051

--- WITH dedupeKey (volatile meta: uuid + timestamp + counter + temp path) ---
  call 1 -> {"status":"recorded","id":"cmtvptdzk0000t6xkpozcmk3v"}
  call 2 -> {"status":"recorded","id":"cmtvptdzk0000t6xkpozcmk3v","deduped":true,"repeatCount":2}
  OPEN ROWS IN DB: 1   (expected 1)
  same row id?     true

--- WITHOUT dedupeKey (identical volatile meta) ---
  call 1 -> {"status":"recorded","id":"cmtvptdzv0001t6xkbr64ro3k"}
  call 2 -> {"status":"recorded","id":"cmtvptdzy0002t6xkyg8r893z"}
  OPEN ROWS IN DB: 2   (expected 2)

--- stored meta of the single folded row ---
{
  "tempFile": "/tmp/cordis-76885745-1301-4591-9d05-7d6ddf7d1ffe.json",
  "requestId": "03a55ab0-7709-44e0-9513-5546babc53a8",
  "observedAt": "2026-09-10T16:01:50.758Z",
  "runCounter": 1,
  "alertDedupeKey": "cordis:schema-drift",
  "alertRepeatCount": 2,
  "alertLastSeenAt": "2026-09-10T16:01:50.869Z"
}

RESULT: PASS  (keyed=1 expected 1, plain=2 expected 2)
```

İki yön de kanıtlandı: `dedupeKey` verilince **tek satır** (aynı id, `repeatCount: 2`),
verilmeyince **iki satır** — yani eski davranış bozulmadı.

### 2.2 Doğrulama çöpü temizlendi (ayrı sayım)

```
zzverify_ rows before delete : 3
deleted                      : 3
zzverify_ rows AFTER delete  : 0   (must be 0)
SystemAlert total: 37 -> 34
```

Oturum sonu bağımsız artık taraması:

```
zzverify_ rows (any state) : 0   (must be 0)
ghost-tenant rows          : 0   (must be 0)
SystemAlert total          : 34
SystemAlert open           : 34   (baseline was 34)
```

Tablo ölçüm öncesi taban değere (34 açık / 34 toplam) **birebir** döndü.
Doğrulama betikleri repoya değil scratchpad'e yazıldı (untracked `scripts/*.ts`
komşu ajanların lint/typecheck kapısını kırıyor).

### 2.3 Kapılar

```
$ pnpm typecheck
$ tsc --noEmit
=== exit: 0 ===

$ pnpm lint
$ eslint
(çıktı yok = temiz)

$ pnpm vitest run src/lib/observability/__tests__/system-alert-dedupe.test.ts \
    src/lib/inngest/jobs/alerts-sweep.test.ts \
    src/lib/billing/invoice-writer.test.ts tests/invoice-fx-tcmb.test.ts
 Test Files  4 passed (4)
      Tests  72 passed (72)
```

Bu kartı doğrudan kapsayan birim testleri (`recordAlert with dedupeKey`):
değişken meta'yı tek satıra katlama, iki farklı `dedupeKey`'in iki satır kalması,
ve `alertDedupeKey`'in meta üzerinden taklit edilememesi.

## 3. Değişen dosyalar

- `src/lib/observability/system-alert.ts` — `RecordAlertInput.dedupeKey`;
  `ALERT_DEDUPE_KEY_KEY` / `ALERT_RESOLVED_BY_KEY` rezerve anahtarları;
  `buildAlertRow`, `alertIdentity`, `findOpenDuplicate` güncellendi.
- `src/lib/observability/__tests__/system-alert-dedupe.test.ts` — yeni testler.

## 4. Riskler

- `dedupeKey` **çağıranın sorumluluğu**: kimliği fazla genişletirsek (ör. tenant'ı
  ayırt etmeyen bir anahtar) gerçekten farklı iki problem tek satıra katlanır. Kod
  yorumu bu tuzağı açıkça anlatıyor; şu an üretimde `dedupeKey` kullanan çağıran yok,
  yani davranış değişikliği **opt-in** ve mevcut alarmların hiçbiri etkilenmiyor.
- Aday sorgusu `dedupeKey` durumunda `message` ile daralmadığından aynı
  `(level, source)` altında `DEDUPE_CANDIDATE_LIMIT` (5) satırdan fazla açık alarm
  varsa katlama kaçabilir. Pratikte bu sayı 0-1; yalnız yazar yarışında artar.

## 5. Açık sorular

- Hangi mevcut çağıranlar `dedupeKey` almalı? Ölçülen aday: meta'sında değişken alan
  taşıyan K1/K2 çekicileri. Bu ayrı bir kart olmalı — bu kart mekanizmayı getiriyor,
  çağıranları dönüştürmüyor.

## 6. Sonraki adım

Değişken meta taşıyan üretim çağıranlarını tarayıp `dedupeKey` vermek (yeni kart).

## 7. Platform beyanı

**macOS (darwin 25.6.0) üzerinde doğrulandı** — gerçek Postgres'e karşı.
Windows/Linux **koşulmadı**. Bu değişiklik platforma bağlı değildir: dokunulan kod
yalnız Prisma sorgusu, JSON meta karşılaştırması ve `stableStringify` içerir; süreç
öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI veya cihaz izni kullanmaz. Testlerdeki
`/tmp/...` dizesi yalnız **meta içinde veri** olarak geçer, dosya sistemine
dokunulmaz. Diğer platformlarda davranış aynıdır.
