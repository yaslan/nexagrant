# ADR-0003 — Stripe webhook idempotency anahtarı nerede yaşar

- **Durum:** **KABUL — Seçenek C** (uygulandı, bu kartta)
- **Tarih:** 2026-09-10
- **Bağlam kartı:** TASK-MTVSBEO7VX6Y4 (P1, para) · ölçüm: TASK-MTVRACMDFRGKV §2.4 · kapsam kararı: TASK-MTSZ0AL4QP2CT §3.5 · kapatılıp geri açılan hata: TASK-MTSY88Q6AMCGB
- **Hazırlayan / karar veren:** BE-FB (backend) · **Ön koşulu olduğu iş:** uygulamanın ana bağlantısını `fabrika` → `fabrika_app` rolüne geçirmek

## Problem

Stripe webhook'unun tekrar-gönderim koruması, uygulama RLS'e tabi bir veritabanı rolüne (`fabrika_app`, NOBYPASSRLS) geçtiği gün ne yazılabiliyor ne okunabiliyor; anahtar parayı yazan transaction'ın dışında ve ondan sonra durduğu için "para yazıldı, anahtar yazılmadı" hâli oluşabiliyor.

## Bağlam — ölçüm (kendi koşum, başkasının raporu değil)

Üç handler (`syncStripeSubscription`, `handleSubscriptionCancellation`,
`logInvoicePayment`) `auditForStripeEvent(eventId)` ile açılıyordu; anahtar bir
`AuditEvent` satırının `data->>'stripeEventId'` alanıydı ve o satır **en sonda**,
para yazıldıktan sonra, `withTenant` sarmalayıcısının **dışında** yazılıyordu.

`AuditEvent` bilerek `tenant_isolation` dizisinde değil: `tenantId`'si nullable
ve NULL "bu KVKK olayı hiçbir kiracıya ait değil" demek
(`prisma/rls.sql`, TASK-MTU6HUB8FUHMG C-2). Taşıdığı politika `tenant_or_shared`:

```sql
USING      ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
WITH CHECK ("tenantId" IS NULL OR "tenantId" = current_setting('app.tenant_id', true))
```

Yani kiracısı OLAN bir satır, ancak `app.tenant_id` o kiracıya ayarlıyken
yazılabilir ve okunabilir. Sarmalayıcının dışında bu değişken ayarlı değil.
Ölçüm (`.qa-scratch/repro-fabrika-app.ts`, çıktı sonuç raporunda §2.1):

```
handler role: {"current_user":"fabrika_app","rolbypassrls":false}
  after first delivery: Subscription=1 AddOn=1 CreditLedger=1 AuditEvent=0
  guard row visible as fabrika (BYPASSRLS):        1
  guard row visible as fabrika_app, no tenant set: 0
  guard row visible as fabrika_app, tenant set:    1
```

Zincirin sonu, `fabrika` ile `fabrika_app` yan yana koşulduğunda
(`.qa-scratch/repro-money-loop.ts`, §2.2): iptal edilmiş bir abonelik, bayat bir
`active` olayının tekrar gönderimiyle **ACTIVE'e geri dönüyor** ve aylık kredi
tahsisi **ikinci kez** yazılıyor (777 → 1554). `fabrika` rolünde aynı senaryo
`already processed; skipping` diyor ve bakiye 777'de kalıyor. Yani bu, rol
geçişinin ürettiği yeni bir para hatası — TASK-MTSY88Q6AMCGB'de kapatılan
hatanın aynısı, başka bir kapıdan.

Ölçümün düzelttiği bir ayrıntı: kayıp "her tekrar gönderimde bir tahsis daha"
değil. Düz bir tekrar gönderim ACTIVE bir satırın üstüne geldiğinde tahsis
dalı hiç çalışmıyor. Kayıp **iptal → bayat `active` tekrar gönderimi**
döngüsünde, döngü başına bir tahsis + bir dirilme. Bu, raporlanandan küçük ama
sıfır değil ve dirilme kısmı paradan daha kötü: ücretsiz plana düşmüş bir
kiracı ücretli erişimini geri alıyor.

## Seçenekler

### Seçenek A — Anahtarı `withTenant`'ın içine al, `AuditEvent` anahtar olarak kalsın
`tenantId` çıkarımını guard'ın üstüne taşı; guard okumasını ve
`auditEvent.create`'i para yazmalarıyla **aynı** transaction'a al.

- **Artı:** Migration yok, şema değişikliği yok, en küçük diff. `fabrika_app`
  altında çalışır. Anahtar ile para artık ya birlikte ya hiç — kartın (d) maddesi karşılanır.
- **Eksi:** Hâlâ **oku-sonra-yaz** guard'ı. İki gerçekten eşzamanlı teslimat
  ikisi de "satır yok" görür ve ikisi de yazar (READ COMMITTED); dosyanın kendi
  docstring'i bu boşluğu zaten itiraf ediyor. Anahtar sorgusu büyüyen bir denetim
  tablosunda Json yol taraması olarak kalır — indekslenmiş bir anahtar değil.
  Ve idempotency semantiği "denetim izi de aynı zamanda kilit" belirsizliğinde kalır:
  denetim satırı bir gün başka bir sebeple silinirse (KVKK süpürmesi) kilit de gider.

### Seçenek B — Anahtarı PARADAN ÖNCE, aynı transaction'da yaz (yine `AuditEvent`)
A ile aynı, ek olarak `auditEvent.create` transaction'ın **ilk** ifadesi olur.

- **Artı:** A'nın hepsi. "Önce anahtar" sezgisel olarak daha güvenli okunur.
- **Eksi:** Tek bir transaction içinde ifade **sırası atomikliğe hiçbir şey
  katmaz** — ya hepsi commit olur ya hiçbiri; A ile B arasındaki fark ölçülebilir
  değil. Sıranın gerçekten değer taşıdığı tek durum, çakışmayı veritabanının
  reddettiği bir UNIQUE kısıt olmasıdır; `AuditEvent.data` üzerinde böyle bir kısıt
  yok ve JSON yolu üzerine unique indeks koymak denetim tablosunun anlamını
  (aynı olay için birden çok denetim satırı meşrudur) bozar. Yani B, A'nın
  eksisini gidermiyor, yalnız giderdiği izlenimi veriyor.

### Seçenek C — Ayrı `StripeEventLog` idempotency tablosu, UNIQUE `stripeEventId`
Kiracıya özel yeni bir tablo; `stripeEventId` üzerinde UNIQUE. Satır, paranın
yazıldığı `withTenant` transaction'ının **ilk** ifadesi olarak eklenir; çakışma
(P2002) transaction'ı geri alır ve handler `skipped` döner. Var olan
`AuditEvent` satırları denetim izi olarak kalır ama artık kilit değildir.
Migration mevcut `AuditEvent` satırlarından geriye dönük dolum yapar.

- **Artı:** Çakışmayı **veritabanı** reddediyor, uygulama değil: iki gerçekten
  eşzamanlı teslimat da kapanıyor — A ve B'nin kapatamadığı boşluk, ve dosyanın
  kendi docstring'inin "bunu kapatmak bir unique kısıt ister, o da bu değişiklik
  değil" dediği iş. Anahtar indekslenmiş bir sütun; Json yol taraması yok.
  Kilit ile denetim izi ayrışıyor: denetim satırı silinse bile kilit duruyor.
  `tenantId NOT NULL` olduğu için düz `tenant_isolation` politikası alıyor ve
  `withTenant` içinde sorunsuz yaşıyor.
- **Eksi:** Migration + RLS politikası + `docs/DATA_MODEL.md` (bu kartın maliyeti).
  Geriye dönük dolum ZORUNLU: boş bir tabloyla, Stripe'ın hâlâ tekrar gönderdiği
  (üç güne kadar) eski olaylar bir kez daha işlenir. Tablo süresiz büyür —
  budama işi bugün yok (bkz. Riskler).

## Karar: Seçenek C

Gerekçe: bu kart bir **para** kartı ve A/B'nin bıraktığı boşluk para boşluğu.
A ve B "handler ortasında çökme" senaryosunu kapatıyor ama "aynı olayın iki
eşzamanlı teslimatı" senaryosunu kapatmıyor; Stripe'ın tekrar gönderim
davranışında ikisi de gerçek. Bir kez migration yazıp çakışmayı Postgres'e
devretmek, aynı hatayı üçüncü kez açmamanın tek yolu. Ayrıca kilidi denetim
izinden ayırmak, "denetim satırı hem iz hem kilit" belirsizliğini bitiriyor —
bu belirsizlik `AuditEvent`'in RLS kapsamı dışında bırakılmasıyla birleşince
bu kartın hatasını doğurmuştu.

`AuditEvent` yazması yine de `withTenant` içine taşınıyor (C, A'nın o yarısını
içerir): aksi hâlde denetim izi `fabrika_app` altında hâlâ yazılamaz ve handler
para yazdıktan sonra patlamaya devam eder.

## Definition of Done

- `StripeEventLog` tablosu: `tenantId` NOT NULL, `stripeEventId` UNIQUE,
  `tenant_isolation` RLS politikası; `prisma/rls.sql` + `pnpm rls:check` + `pnpm rls:verify` yeşil.
- Migration additive ve idempotent (iki kez koşma kanıtı çıktıyla), `down.sql` geri alma yolu var.
- Geriye dönük dolum: mevcut `AuditEvent` satırlarındaki `stripeEventId` değerleri taşındı.
- Üç handler'ın hepsi: `tenantId` guard'dan önce çıkarılıyor; kilit + para + denetim satırı
  **tek** `withTenant` transaction'ında; çakışmada `skipped`.
- `fabrika_app` rolü altında: birinci teslimat tam yazıyor, tekrar teslimatta
  Subscription/AddOn/CreditLedger/AuditEvent sayıları **değişmiyor** (tek tek ölçülmüş).
- Handler ortasında çökme: para yazılmış + anahtar yazılmamış hâli ölçümle üretilemiyor.
- `pnpm vitest run src/lib/billing/` + `pnpm typecheck && pnpm lint` temiz.

## Riskler

1. **Tablo süresiz büyür.** Satır başına ~150 bayt, webhook başına bir satır.
   Budama (ör. 90 günden eski satırları sil) bu kartta YOK — Stripe üç gün
   tekrar gönderiyor, dolayısıyla 90 gün fazlasıyla güvenli bir eşik, ama
   silme işi ayrı bir kart. Kartsız bırakmıyorum: sonuç raporunun "sonraki adım"ında.
2. **Dolum yalnız migration anındaki satırları kapsar.** Doğru olan bu, ama
   migration ile rol geçişi arasında yazılan olaylar için dolum tekrar
   koşulmalı — migration idempotent olduğu için bu güvenli.
3. **UNIQUE kısıt RLS'e tabi değildir.** Başka bir kiracının olay id'si için
   yapılan ekleme, satırı göremese bile çakışma alır. İstenen davranış bu
   ("bu olay işlendi"), ama teknik olarak varlık sızıntısıdır; Stripe olay
   id'leri kullanıcı girdisi değil, kabul edilebilir.
4. **`logInvoicePayment`'ta fatura belgesi transaction'ın DIŞINDA kalıyor.**
   `createInvoiceForPayment` ağ çağrısı (TCMB kuru) yapıyor ve `recordAlert`
   üzerinden çıplak singleton'a gidiyor; transaction içine almak 10'luk havuzda
   ikinci bağlantı istemek olur (TASK-MTVRACMDFRGKV §1.3'ün kilitlenme kuralı).
   Bugünkü sıra korundu: kilit + denetim satırı commit, sonra fatura, hata
   yutulup `SystemAlert`. Fatura kesilemezse tekrar gönderim onu tekrar
   denemez — bugünkü davranış, bu kartta değişmedi.
