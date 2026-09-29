# Yayın kontrol listesi (deploy öncesi)

Kaynak: TASK-MTTOUDNQ97X83 / F-1. Bu liste **tek bir soruya** cevap verir: kod
yayına çıkmadan önce elle koşulması gereken ne var? Ölçüm tarihi **2026-09-09**,
ölçülen ağaç `984ba39`. Sayılar iddia değil; her maddenin yanında onu üreten
komut var — yayından önce komutu tekrar koşun, sayı değiştiyse liste eskimiştir.

## 1. Şema: `prisma migrate deploy`'un görmediği `.sql` dosyaları — **BLOKLAYICI**

`prisma/migrations` altındaki **düz** `.sql` dosyalarını hiçbir komut uygulamaz.
`pnpm db:migrate` (= `prisma migrate dev`) yalnız klasörlü, `_prisma_migrations`
tablosuna kaydolan migration'ları uygular; depoda `migration_lock.toml` da yoktur.

Bugünkü sayım:

```
$ ls prisma/migrations/*.sql | grep -v "\.down\.sql$" | wc -l
12
```

```
prisma/migrations/add-feedback.sql
prisma/migrations/add-invoice-fx-rate.sql
prisma/migrations/add-invoice-write-path.sql
prisma/migrations/add-invoice.sql
prisma/migrations/add-lifetime-licence.sql
prisma/migrations/add-m6-evaluator-lens.sql
prisma/migrations/add-soft-delete.sql
prisma/migrations/add-subscription-price-lock.sql
prisma/migrations/add-systemalert-console-indexes.sql
prisma/migrations/relationship-owner-nullable.sql
prisma/migrations/rename-feedback-alert-columns.sql
prisma/migrations/retire-eur-plan-ladder.sql
```

Karşılaştırma — veritabanının Prisma'ya göre uyguladığı migration sayısı
(`docs/agent-results/TASK-MTTOUDNQ97X83-evidence/probe-migration-inventory.mts`):

```
TOTAL forward migrations in the tree: 17     (12 düz + 5 klasörlü)
prisma/migrations/migration_lock.toml present: false
rows Prisma has recorded as applied: 5       (yalnız klasörlü olanlar)
```

- [ ] Yukarıdaki **12** dosya hedef veritabanında **kodun yayınından ÖNCE**
      uygulandı (her biri idempotent yazılmıştır; sırayla koşulabilir).
- [ ] `ls prisma/migrations/*.sql | grep -v "\.down\.sql$" | wc -l` çıktısı
      yeniden sayıldı; 12'den büyükse yeni gelen dosyalar da uygulandı.

**RLS bu pencerede:** bu dosyaların her biri kurduğu kiracı tablosunun
`tenant_isolation` politikasını kendi içinde taşır, çünkü `pnpm db:rls` ayrı bir
adımdır ve arada tablo politikasız durur (kural ve ölçüm: `docs/DATA_MODEL.md`
§16; kapı: `pnpm rls:check` → CHECK 4b).

**Neden bloklayıcı:** kod önce çıkarsa, o kolonu bekleyen iş kırılır.
Ölçülmüş örnek: `relationship-owner-nullable.sql` uygulanmadan imha işi
(`purgeDueUsers`) `P2011` ile düşer, kişi silinmez ve yasal imha borcu büyür
(TASK-MTT1XL9NP2QYU F-1, tekrar üretimi bu kartın kanıt dizininde).

## 2. Yayından sonra izlenecek alarm

İmha işi artık sessiz düşmüyor: bir hesabı silemezse
`SystemAlert(level='error', source='users-scheduled-deletion')` yazar ve satır
`/[locale]/admin/alerts` ekranında görünür. Satır **kişisel veri taşımaz** —
`failedUserIds` + `failureKinds` (hata kodu) kadarını taşır.

- [ ] Yayından sonraki ilk 24 saat içinde `source='users-scheduled-deletion'`
      alarmı **yok** (iş 03:00 UTC koşar).
- [ ] Alarm varsa: `failureKinds` `P2011` ise madde 1 atlanmıştır — eksik `.sql`
      uygulanır, iş bir sonraki gece kendiliğinden tekrar dener.

Aynı hata her gece tekrar ederse **yeni satır açılmaz**, açık satırın
`alertRepeatCount` sayacı artar (TASK-MTS80DUAF39Z8). Yani "tek satır" az sorun
demek değildir — sayaca bakın. Alarmı **çözmek** pencereyi kapatır: sonraki
oluşta taze satır açılır.

## 3. Kapı

- [ ] `pnpm gate` hedef ağaçta exit 0 (lint + typecheck + test + i18n + rls).
- [ ] `pnpm rls:verify` gerçek `fabrika_app` rolüyle ölçüldü (BYPASSRLS yok).
- [ ] `pnpm alerts:check` exit 0 — hiçbir açık `SystemAlert`, silinmiş bir
      kiracıyı göstermiyor. `SystemAlert` tenant-agnostiktir ve `tenantId`
      kolonu yoktur, bu yüzden "kiracıma ait her şeyi sil" desenini kullanan
      test fixture'larının ulaşamadığı tek tablodur; ulaşamadığında alarm
      kiracısından uzun yaşar ve konsolun 300 satırlık penceresini gerçek
      alarmların önünden iter (TASK-MTVFWYKIZXRB1: 268 satırın 234'ü böyleydi).
      Kapı `test:e2e`'den SONRA koşar; kırmızıysa hangi fixture'ın sızdırdığını
      yazar.

## 4. Bilinen pencere: zincir koşarken davet kodu reddi (İNCELEME-12 K-6)

`scripts/apply-migrations.sh` her yayında `apply-order.txt`'in **tamamını**
baştan koşar. 23. dosya `add-agency-invite-code.sql`,
`redeem_agency_invite()`'ın ilk gövdesini (`"usedCount" < "maxUses"`) yeniden
yazar. Bu gövdeyi 30. dosya `agency-invite-no-max-uses.sql` kaldırır. İki dosya
arasında, eski gövde geçerlidir:

- `maxUses = NULL` olan her kod (TASK-MUM4WVYLSH9IT'ten sonra üretilen bütün
  kodlar) reddedilir, çünkü `< NULL` sonucu NULL'dır. O anda kayıt olan kişi
  "davet kodu geçersiz" mesajını görür; kod harcanmaz, kişi yeniden deneyebilir.
- Eski sınırı olan ve sınırın üstünde kullanılmış bir kod o arada reddedilirse,
  denetim kaydına `reason = 'exhausted'` düşebilir. Bu değer panelde gösterilmez.

Ölçüm (TASK-MUM74FUB1DRCM, yerel Postgres, docker): 23.-30. dosyalar
**1,2 sn** sürdü, dosya başına 0,08-0,10 sn. Aynı davranış bir `BEGIN … ROLLBACK`
işlemi içinde kanıtlandı: zincirin sonunda kod kabul ediliyor, 23. dosyadan sonra
reddediliyor, 30. dosyadan sonra yeniden kabul ediliyor.

- [ ] Zinciri düşük trafik saatinde koşun. Pilotta kayıtlar ajans davetleriyle
      geldiği için kampanya e-postasının gittiği saatten kaçının.
- [ ] Zincir yarıda kesilirse (`ON_ERROR_STOP`), 30. dosya uygulanana kadar
      pencere **açık kalır**. Hatayı giderip zinciri bitirmeden yayını bitmiş
      saymayın. Kontrol:
      `SELECT prosrc LIKE '%maxUses%' FROM pg_proc WHERE proname = 'redeem_agency_invite';`
      sorgusu `false` dönmeli.

Pencereyi tamamen kapatmanın yolu, 23. dosyanın fonksiyonu yalnız hiç yokken
oluşturmasıdır. Bu bir migration değişikliği olduğu için ayrı bir kartta
yapılmalıdır. Bu not yalnız bugünkü davranışı anlatıyor.
