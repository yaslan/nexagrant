# TASK-MTU6HUB8FUHMG — B-1 + C-2: RLS güvenlik açığı

**Ajan:** blok-zincir-dev (DevOps) · **Dal:** `dev` · **Tarih:** 2026-09-09
**Parçalar:** B-1 (`ClaimEvidenceLink`, `EvidenceReminder` kiracısız sanılıyordu) ·
C-2 (`AuditEvent.tenantId` `String?` iken sıkı `tenant_isolation` altındaydı)

---

## 1. Ne yapıldı

### Çakışma kuralı — ne oldu

Göreve başlarken `ps aux | grep -E "playwright|next dev"` **canlı Playwright süreci gösterdi**
(PID 84609, `@playwright/test/cli.js test` + 4 chromium alt süreci). Bu yüzden veritabanına
dokunan hiçbir komut koşulmadı; yalnız dosya işi yapıldı. İş ortasında süreçler **bitti**
(sayım 0'a düştü, iki kez doğrulandı), bundan sonra migration ve `pnpm rls:verify` gerçekten
koşuldu. **Koşulamayan komut kalmadı** — hepsinin çıktısı §2'de.

`pnpm db:migrate` (= `prisma migrate dev`) **bilerek koşulmadı**: bu depo el yazımı
`prisma/migrations/*.sql` dosyaları kullanıyor (10+ örnek), `migrate dev` ise şema sapması
görüp veritabanını sıfırlamayı önerebilir. Onun yerine SQL, tek bir transaction içinde
uygulandı ve sonuç `information_schema` + `pg_policies` ile ölçüldü.

### B-1 — iki bağlantı tablosu kiracı verisi

`scripts/rls-models.ts:19`'daki `SYSTEM_WIDE`, `ClaimEvidenceLink` ve `EvidenceReminder`'ı
"kiracısız sistem tablosu" sayıyordu. `SYSTEM_WIDE` üyeliği **iki kapıdan da muafiyettir**
(statik `rls:check` ve canlı `rls:verify` aynı listeyi okur), yani kapı bu iki tablo için
kırmızı yanamıyordu. Ölçüm bunu doğruladı: ikisinde de `tenantId` kolonu **yoktu**, RLS
**kapalıydı**, politika **yoktu**.

- `prisma/schema.prisma` — ikisine de `tenantId String` (zorunlu) + `@@index([tenantId])`;
  `EvidenceReminder` ayrıca `@@index([sent, notifyAt])` (hatırlatma taramasının okuduğu çift).
- `prisma/migrations/add-evidence-link-tenant-id.sql` — ADDITIVE, `IF NOT EXISTS`, idempotent.
  Backfill gerekmedi: `src/` içinde bu iki modele **hiçbir yazıcı yok** (yalnız
  `src/modules/m3/manifest.ts:25` adlarını sayıyor) ve iki tablo da **0 satır**.
- `prisma/rls.sql` — ikisi `tenant_isolation` dizisine eklendi.
- `scripts/rls-models.ts` — `SYSTEM_WIDE`'dan çıkarıldı; küme `export` edildi ki test
  denetleyebilsin, ve yorumda "bir tablo buraya kiracısı yok diye girer, kapı sussun diye
  değil" kuralı yazıldı.

Neden kolon şart: **RLS satırdaki kolonu okur, yabancı anahtarı takip etmez.** `Evidence.tenantId`
üzerinden dolaylı koruma diye bir şey yok.

### C-2 — `AuditEvent` sıkı politikanın altında kaybediyordu

`prisma/schema.prisma:1107`'de `tenantId String?`, `prisma/rls.sql:8`'de sıkı `tenant_isolation`.
SQL'de `NULL = 'x'` sonucu `true` değil **`NULL`**'dur, yani `tenantId`'si boş satır ne `USING`
ne `WITH CHECK` koşulunu geçer: yazılamaz **ve** okunamaz, üstelik sessizce.

`AuditEvent`, `Document`/`Chunk`/`ConceptTemplate` ile aynı `tenant_or_shared` desenine taşındı
(`prisma/rls.sql`, `prisma/migrations/auditevent-tenant-or-shared.sql`) ve
`scripts/rls-models.ts` `NULLABLE_TENANT` kümesine eklendi. Bu **dolu `tenantId` için hiçbir
gevşeme değildir** — kanıt §2.4'te ölçüldü.

İki ayrıntı, sessiz gerilemeyi önlemek için:

1. **Eski politika DROP ediliyor.** Permissive politikalar `OR` ile birleşir; geride bırakılan
   `tenant_isolation`, zaten migrate edilmiş her veritabanında bu düzeltmeden uzun yaşardı.
   `tenant_or_shared` döngüsüne `DROP POLICY IF EXISTS tenant_isolation ON %I` eklendi.
2. **`FORCE ROW LEVEL SECURITY` korundu.** Sıkı döngü FORCE veriyor, paylaşımlı döngü vermiyor.
   `AuditEvent` sıkı döngüden çıkarken FORCE'u kaybedecekti — yani C-2 düzeltmesi tablo
   sahibini sessizce muaf tutacaktı. `prisma/rls.sql:54` ayrı bir satırla geri veriyor.
   **Yalnız `AuditEvent`:** paylaşımlı döngüye FORCE eklemek `Document`/`Chunk`/
   `ConceptTemplate`'in seed/import yazımını değiştirirdi, o bu değişikliğin işi değil.

### Görevde adı geçmeyen, aynı hatadan etkilenen iki yazıcı daha

Görev `src/actions/user/request-deletion.ts:235`'i işaret ediyordu. Aynı şekilde kiracısız
`AuditEvent` yazan **iki yer daha** var ve ikisi de aynı sessiz düşüşü yaşıyordu:

| Dosya | Satır | Olay | Neden önemli |
|---|---|---|---|
| `src/lib/inngest/jobs/users-scheduled-deletion.ts` | 218 | `user.erased` | **Geri dönüşü olmayan silmenin gerçekleştiğini kanıtlayan kayıt.** `docs/DATA_MODEL.md` §1 bunu zorunlu tutuyor. |
| `src/actions/user/export-data.ts` | 215 | `user.data.exported` | `tenantId` yoksa `...(tenantId ? …)` ile atlanıyor, satır kiracısız yazılıyor. |
| `src/actions/user/request-deletion.ts` | 235 | `user.erasure.requested/.cancelled` | Görevde adı geçen kayıt. |

Üçü de C-2 ile birlikte düzeldi; üçü de `tests/rls-coverage.test.ts` ile politikaya bağlandı,
biri taşınırsa test kırmızı yanar. **Bu dosyalara kod değişikliği yapılmadı** — sorun kodda
değil, politikadaydı.

### Testler — `tests/rls-coverage.test.ts` (YENİ, 19 test)

Dosya seviyesinde, veritabanı gerektirmez: canlı kapının koşamadığı anda da bir şeyin doğru
kalması gerekir. Yapısal koruma:

- `SYSTEM_WIDE` üyesi **hiçbir** modelde `tenantId` olamaz → B-1'in hata sınıfı bir daha
  sessizce geri gelemez.
- `NULLABLE_TENANT` üyesinin `tenantId`'si `String?` olmak **zorunda** → C-2'nin tersi
  (zorunlu alanı paylaşımlı politikaya koymak) da yakalanır.
- İki küme aynı tabloyu iddia edemez; `tenantScopedModels()`'in tamamı `rls.sql`'de olmalı.
- `AuditEvent` için: `tenant_or_shared` var / `tenant_isolation` yok, eski politika DROP
  ediliyor, FORCE satırı duruyor.

### Değiştirilmeyen, bilerek

`docs/DATA_MODEL.md` §1.1 eklendi (üç politika sınıfı tablosu + iki uyarı + neden). §1'deki
"Kiracıya özel: geri kalan tümü; `tenantId` zorunlu" satırı artık `String?` istisnasına
işaret ediyor.

---

## 2. Kanıt

### 2.1 Çakışma kontrolü (ilk komut) ve sonrası

```
$ ps aux | grep -E "playwright|next dev" | grep -v grep
macbook  84609  node .../@playwright/test/cli.js test          ← CANLI
macbook  84937  node .../playwright/lib/worker/workerProcessEntry.js
macbook  84938  chrome-headless-shell ...  (+84939, 84940, 85191)
```
→ DB komutları KOŞULMADI, dosya işi yapıldı.

```
$ ps aux | grep -E "playwright|next dev" | grep -v grep | wc -l
       0
$ sleep 3; ps aux | grep -E "playwright|next dev|vitest" | grep -v grep | wc -l
       0
```
→ süreç bitti, buradan sonrası gerçek koşum.

### 2.2 ÖNCE / SONRA — veritabanı durumu (`information_schema` + `pg_class` + `pg_policies`)

**ÖNCE (migration'dan önce):**
```
ClaimEvidenceLink  | tenantId: YOK      | satır: 0   | rls: false/force:false | politika: YOK
EvidenceReminder   | tenantId: YOK      | satır: 0   | rls: false/force:false | politika: YOK
AuditEvent         | tenantId: nullable | satır: 149 | rls: true/force:true   | politika: tenant_isolation
```

**SONRA (migration + `pnpm db:rls`):**
```
ClaimEvidenceLink  | tenantId: NOT NULL | satır: 0   | rls: true/force:true | politika: tenant_isolation
EvidenceReminder   | tenantId: NOT NULL | satır: 0   | rls: true/force:true | politika: tenant_isolation
AuditEvent         | tenantId: nullable | satır: 167 | rls: true/force:true | politika: tenant_or_shared
```
`satır: 0` iki tablo için de ölçülmüş değerdir — NOT NULL'ın backfill'siz güvenli olmasının
sebebi bu, varsayım değil.

### 2.3 Migration ve politika uygulaması

```
$ npx tsx <apply> prisma/migrations/add-evidence-link-tenant-id.sql prisma/migrations/auditevent-tenant-or-shared.sql
▶ prisma/migrations/add-evidence-link-tenant-id.sql
  ✓ uygulandı (commit)
▶ prisma/migrations/auditevent-tenant-or-shared.sql
  ✓ uygulandı (commit)

$ pnpm db:generate
✔ Generated Prisma Client (v7.10.0)

$ pnpm db:rls
✅ prisma/rls.sql applied. Policies in public: 58 → 60
```

**İdempotency — ikisi de ikinci kez koşuldu:**
```
▶ prisma/migrations/add-evidence-link-tenant-id.sql   ✓ uygulandı (commit)
▶ prisma/migrations/auditevent-tenant-or-shared.sql   ✓ uygulandı (commit)
$ pnpm db:rls
✅ prisma/rls.sql applied. Policies in public: 60 → 60      ← yeni politika üretmedi
```

### 2.4 Davranışsal ölçüm — RLS'e TABİ rolle (`fabrika_app`, NOBYPASSRLS)

Katalog metadata'sı değil, gerçek okuma/yazma. Her yazma geri alındı.

```
Ölçüm rolü: fabrika_app (bypassrls=false, super=false)

SQL gerçeği — NULL = 'x'  →  NULL (true DEĞİL)
  tenant_isolation USING/WITH CHECK bunu kullanır: tenantId'si NULL satır ASLA geçemez.

✓ YAZMA : tenantId=NULL, app.tenant_id yok → INSERT KABUL EDİLDİ
✓ OKUMA : aynı satır geri okundu → {"id":"c2probe_1788964099383","tenantId":null}
  (işlem geri alındı — hiçbir satır kalmadı)

✓ ÇAPRAZ : 'tenant-A' bağlamında 'tenant-B' satırı RLS ile REDDEDİLDİ
✓ ClaimEvidenceLink : çapraz kiracı INSERT RLS ile REDDEDİLDİ
✓ EvidenceReminder  : çapraz kiracı INSERT RLS ile REDDEDİLDİ
```

Yani: C-2 kiracısız satırı kurtardı, **kiracılı satırda hiçbir gevşeme yok** (çapraz yazma hâlâ
reddediliyor), B-1'in iki tablosu artık kiracı sınırını gerçekten uyguluyor.

### 2.5 `pnpm rls:check` (statik kapı) — 43 → 44 model

```
$ pnpm rls:check
Found 44 tenant-scoped models requiring RLS policies:
AddOn, AiUsageLog, ApiKey, ..., Claim, ClaimEvidenceLink, ConceptNote, ..., Evidence,
EvidenceReminder, Feedback, ...
✅ SUCCESS: All 44 tenant-scoped models have RLS policies registered.
```
43 → 44: `AuditEvent` çıktı (−1), `ClaimEvidenceLink` + `EvidenceReminder` girdi (+2).

### 2.6 `pnpm rls:verify` (canlı kapı) — YEŞİL

```
$ pnpm rls:verify
Kiracıya özel model: 44 · RLS açık tablo: 51 · tenant_isolation politikası: 44

⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 19 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi

✅ 44 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü.
```

### 2.7 Birim testler — 19 yeni test, ve KIRMIZI kontrolü

```
$ pnpm vitest run tests/rls-coverage.test.ts
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

Yeşil test bir şey kanıtlamaz; hatayı geri koyup kırmızıya döndüğünü ölçtüm. `rls-models.ts`
eski hâline döndürüldü (iki tablo `SYSTEM_WIDE`'a, `AuditEvent` `NULLABLE_TENANT`'tan çıktı):

```
× no SYSTEM_WIDE table carries a tenantId
    AssertionError: expected [ 'ClaimEvidenceLink', …(1) ] to deeply equal []
× every strict model is declared in prisma/rls.sql
    AssertionError: expected [ 'AuditEvent' ] to deeply equal []
× ClaimEvidenceLink is no longer exempt from the gates
× EvidenceReminder is no longer exempt from the gates
× it is classified as nullable-tenant, not strict and not exempt
      Tests  5 failed | 12 passed (17)
```
Sonra geri alındı → tekrar 17/17 (o an henüz 17 testti; üç yazıcı testi eklenince 19 oldu).

### 2.8 Tam süit

```
$ pnpm test
 Test Files  135 passed | 2 skipped (137)
      Tests  1613 passed | 8 skipped (1621)

$ pnpm typecheck          → temiz (tsc --noEmit, çıktı yok)
$ npx prisma validate     → The schema at prisma/schema.prisma is valid 🚀
$ pnpm lint               → ✖ 2 problems (0 errors, 2 warnings)
      warning'lerin ikisi de docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/*.mts
      içinde, benim dokunmadığım dosyalarda, önceden var.
$ pnpm i18n:check         → ✅ i18n check passed
$ npx eslint tests/rls-coverage.test.ts scripts/rls-models.ts → çıktı yok (temiz)
```

### 2.9 `pnpm test:e2e` — 12 kırmızı, HİÇBİRİ benim değil (ölçüldü, iddia edilmedi)

```
$ pnpm test:e2e
  12 failed
    admin-plan-editor.spec.ts:160 · f10-absence-not-zero.spec.ts:66/87/100/128
    fabricated-fallbacks.spec.ts:105 · g0-computed-score.spec.ts:200
    m8-matching.spec.ts:212/300 · m9-calendar-connect.spec.ts:75
    plan-entitlement-from-version.spec.ts:120 · st6-empty-tenant-no-fabrication.spec.ts:97
  1 skipped · 4 did not run · 130 passed (4.2m)
```

Hata biçimi RLS ile ilgili değil — örnek (st6):
```
Error: strict mode violation: getByText('Bu çalışma alanında henüz fırsat yok')
  resolved to 2 elements
```

**Bunu iddia olarak bırakmadım, ölçtüm.** Tam geri alma provası yaptım: iki `.down.sql`
uygulandı, dosya değişiklikleri `git stash` ile kaldırıldı, Prisma client yeniden üretildi —
yani **değişiklik öncesi ağaç + değişiklik öncesi veritabanı**. Bu temiz temelde aynı spec'ler:

```
$ pnpm exec playwright test <12 kırmızının bulunduğu 8 dosya>     # DEĞİŞİKLİK ÖNCESİ
  7 failed
    admin-plan-editor.spec.ts:160 · f10-absence-not-zero.spec.ts:66
    fabricated-fallbacks.spec.ts:86/125 · m9-calendar-connect.spec.ts:75
    plan-entitlement-from-version.spec.ts:120 · st6-empty-tenant-no-fabrication.spec.ts:97
  10 did not run · 22 passed (43.9s)
```
Aynı spec'ler değişiklik öncesinde de kırmızı → **regresyon değil, mevcut durum.** (Sayının
12 yerine 7 çıkması alt küme koşumundan: bu spec'ler ortak seed kiracıları üzerinden
birbirini etkiliyor, sıraya duyarlılar — §5'te not düştüm.)

Sonra her şey geri kuruldu: `git stash pop`, migration'lar yeniden uygulandı, `pnpm db:rls`,
`pnpm db:generate` — §2.2 SONRA tablosu ve §2.6 bu son durumun ölçümüdür.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `prisma/schema.prisma` | `ClaimEvidenceLink.tenantId String` + `@@index`; `EvidenceReminder.tenantId String` + iki `@@index`; üç modele neden-yorumu (`AuditEvent` dâhil) |
| `prisma/rls.sql` | `AuditEvent` sıkı diziden çıktı → `tenant_or_shared` dizisine; `ClaimEvidenceLink`+`EvidenceReminder` sıkı diziye; paylaşımlı döngüye `DROP POLICY IF EXISTS tenant_isolation`; `AuditEvent` için ayrı `FORCE ROW LEVEL SECURITY` |
| `scripts/rls-models.ts` | İki tablo `SYSTEM_WIDE`'dan çıktı; `AuditEvent` `NULLABLE_TENANT`'a girdi; iki küme `export` edildi; muafiyet kuralı yoruma yazıldı |
| `docs/DATA_MODEL.md` | YENİ §1.1 "RLS politika sınıfları" (tablo + iki uyarı + gerekçe); §1'e `String?` istisnası işareti |
| `prisma/migrations/add-evidence-link-tenant-id.sql` | **YENİ** — additive, idempotent |
| `prisma/migrations/add-evidence-link-tenant-id.down.sql` | **YENİ** — geri alma |
| `prisma/migrations/auditevent-tenant-or-shared.sql` | **YENİ** — politika-only, idempotent |
| `prisma/migrations/auditevent-tenant-or-shared.down.sql` | **YENİ** — geri alma (uyarı notuyla) |
| `tests/rls-coverage.test.ts` | **YENİ** — 19 test |

`src/` altında **hiçbir dosya değişmedi**.

---

## 4. Geri alma (değişiklikten ÖNCE yazıldı, ve §2.9'da gerçekten koşuldu)

```bash
# 1. Politika + şema geri (sırası önemli: politika kolonu kullanıyor)
npx tsx <apply> prisma/migrations/auditevent-tenant-or-shared.down.sql \
                prisma/migrations/add-evidence-link-tenant-id.down.sql
# 2. Depo geri
git revert <commit>          # veya: git checkout <önceki> -- prisma scripts/rls-models.ts docs/DATA_MODEL.md
# 3. İstemci + politikaları tekrar hizala
pnpm db:generate && pnpm db:rls && pnpm rls:check && pnpm rls:verify
```

Her iki `.down.sql` de idempotent ve `IF EXISTS` kullanıyor. **Uyarı, dosyanın başında da
yazılı:** C-2'nin geri alınması `AuditEvent`'i sıkı politikaya döndürür, yani kiracısız
KVKK/GDPR iz kayıtları yeniden yazılamaz ve okunamaz hâle gelir — bu, düzeltilen kusurun
kendisidir. B-1'in geri alınması iki tablodaki `tenantId` kolonunu düşürür; `prisma/rls.sql`
ve `scripts/rls-models.ts` aynı adımda geri alınmazsa statik kapı artık taşıyamayacağı bir
tablodan politika ister.

**Sır sızıntısı yok:** hiçbir dosyaya kimlik/anahtar yazılmadı; ölçüm rolünün parolası
`scripts/check-rls-live.ts`'in mevcut deseniyle session GUC üzerinden gidiyor, log'a düşmüyor.

---

## 5. Riskler

1. **`NULLABLE_TENANT` tabloları canlı kapı tarafından ÖLÇÜLMÜYOR.** `scripts/check-rls-live.ts:422`
   yalnız `policyname = 'tenant_isolation'` sorguluyor ve `tenantScopedModels()` bu tabloları
   zaten dışlıyor. `AuditEvent`'i oraya taşımak, onu canlı kapının görüş alanından **çıkardı**
   — B-1'in hata sınıfının aynısı, bir sınıf aşağıda. Şu an `tests/rls-coverage.test.ts` dosya
   düzeyinde bağlıyor ve §2.4 sondası davranışı ölçüyor, ama **kapıda değil**. Kalıcı çözüm
   §6'da.
2. **`prisma migrate dev` sapma görecek.** Bu iki migration el yazımı ve `_prisma_migrations`
   tablosuna kayıtlı değil (depoda 10+ dosya aynı durumda). Yeni bir ortam kurulurken
   `prisma/migrations/*.sql` dosyalarının elle uygulanması gerekiyor — bu düzeltmenin
   getirdiği bir durum değil, devraldığı bir durum.
3. **`tenantId` yazacak kod henüz yok.** İki tablonun ilk yazıcısı yazıldığında `tenantId`'yi
   `withTenant` bağlamından doldurmak zorunda; unutulursa RLS `WITH CHECK` reddedecek (sessiz
   kayıp değil, gürültülü hata) — istenen davranış bu.

---

## 6. Açık sorular / Sonraki adım

1. **Canlı kapı `tenant_or_shared`'ı da ölçmeli.** `scripts/check-rls-live.ts` şu an tek bir
   politika adı tanıyor. `NULLABLE_TENANT` için ikinci bir sorgu + "NULL satır yazılabiliyor mu,
   dolu satır çapraz yazılamıyor mu" davranış sondası eklenmeli. Ayrı görev önerilir.
2. `EvidenceReminder.recipientEmails` kişisel veri; `docs/DATA_MODEL.md`'nin KVKK/saklama
   bölümünde bu alanın saklama süresi tanımlı değil. PM/hukuk kararı gerekli.

---

## 7. Yolda gördüğüm, dokunmadığım sorunlar

1. **`scripts/check-rls-live.ts:422` — canlı kapı `tenant_or_shared` politikasını hiç
   sormuyor.** Sorgu `policyname = 'tenant_isolation'` ile sabit. `Document`, `Chunk`,
   `ConceptTemplate` (ve artık `AuditEvent`) için veritabanında politika **silinmiş olsa bile**
   `pnpm rls:verify` yeşil yanar. Bu tam olarak dosyanın kendi başlığındaki "bir gate yalan
   söylüyorsa hiç gate olmamasından kötüdür" durumu, bir sınıf aşağıda tekrarlanıyor.
   *(Düzeltmedim: görev kapsamı dışında ve kapı davranışını değiştirmek ayrı bir onay ister.)*

2. **`prisma/rls.sql:39-46` — paylaşımlı döngü `FORCE ROW LEVEL SECURITY` vermiyor.**
   `Document`, `Chunk`, `ConceptTemplate` için tablo sahibi rolü politikalara tabi değil.
   `AuditEvent`'e FORCE'u ayrıca verdim (satır 54), ama diğer üçü açıkta. Kasıtlı mı, unutulmuş
   mu bilmiyorum; seed/import yazımını etkileyeceği için dokunmadım.

3. **`src/actions/user/request-deletion.ts:243` ve `src/actions/user/export-data.ts:224` —
   denetim yazımı hatası yalnız `console.warn`.** "Best-effort: an audit failure must not block
   the subject's request" yorumu makul, ama bu sessizlik C-2'yi **kiracısız her özne için
   %100 kayıp** hâline getirdi ve kimse görmedi. `SystemAlert` üretilmiyor
   (`src/lib/observability/system-alert.ts` mevcut ve tam bu iş için var). Aynı desen
   `src/lib/inngest/jobs/users-scheduled-deletion.ts:218`'de — orada `try/catch` bile yok, ama
   olay `user.erased`, yani geri dönüşü olmayan silmenin kanıtı.
   *(Düzeltmedim: `src/` bu görevin kapsamında değil ve alarm politikası PM kararı.)*

4. **`prisma/migrations/` içinde iki farklı migration rejimi bir arada.** `prisma migrate dev`
   klasörleri (`add-m9-meeting-schedule`, `add-plan-versioning`, …) ile el yazımı `*.sql`
   dosyaları yan yana duruyor ve ikincisini uygulayan/izleyen bir script yok — hangi ortamda
   hangisinin koştuğu ölçülemiyor. Yeni ortam kurulumu için gerçek bir risk.
   *(Düzeltmedim: `db:migrate` politikası değişikliği, onay ister.)*

5. **`tests/e2e` alt küme koşumu sıraya duyarlı.** Tam süitte 12, aynı 8 dosyanın alt küme
   koşumunda 7 kırmızı çıkıyor ve **kırmızı setler birebir aynı değil**
   (`fabricated-fallbacks.spec.ts` tam koşumda `:105`, alt kümede `:86`/`:125`). Bu spec'ler
   ortak seed kiracıları üzerinden birbirini kirletiyor. Ayrı bir görev hak ediyor: "e2e
   izolasyonu" — çünkü şu hâliyle "hangi test benim yüzümden kırıldı" sorusu ancak §2.9'daki
   gibi tam geri alma provasıyla cevaplanabiliyor.

6. **`docs/DATA_MODEL.md:10` paylaşımlı tablo listesi güncel değil.** Listedeki
   `Organization`, `Project`, `Participation`, `OrgTopicStat`, `Collab` adlarıyla
   `prisma/schema.prisma`'da **model yok** (ölçüm: `grep -cE "^model X \{"` → hepsi 0;
   yalnız `Programme` → 1). CORDIS tarafı `CordisProject`, `CordisOrganization`, … olarak
   yeniden adlandırılmış ama liste güncellenmemiş; okuyucuyu yanıltıyor.
   *(Düzeltmedim: hangi adın kaldığını doğrulamak ayrı bir tarama işi; §1.1'i gerçek sınıflarla
   yazdım ki en azından bir yerde doğru olsun.)*

---

## 8. Definition of Done

- [x] `ClaimEvidenceLink` + `EvidenceReminder`: `tenantId String` eklendi (additive migration, 0 satır **ölçüldü**)
- [x] İkisi `prisma/rls.sql` `tenant_isolation` dizisinde
- [x] İkisi `scripts/rls-models.ts` `SYSTEM_WIDE`'dan çıkarıldı
- [x] `AuditEvent` → `tenant_or_shared` + `NULLABLE_TENANT`; eski politika DROP edildi; FORCE korundu
- [x] `docs/DATA_MODEL.md` güncellendi (§1.1 + §1 işareti)
- [x] Her iki parça için birim test (19 test) + **kırmızı kontrolü** yapıldı
- [x] Migration gerçekten uygulandı, ÖNCE/SONRA veritabanı durumu ölçüldü
- [x] Davranışsal ölçüm: RLS'e tabi rolle okuma+yazma, çapraz kiracı reddi
- [x] `pnpm rls:check` (44 model) ve `pnpm rls:verify` YEŞİL — çıktılar yapıştırıldı
- [x] `pnpm test` 1613 geçti · `pnpm typecheck` temiz · `pnpm lint` 0 error
- [x] `pnpm test:e2e` koşuldu; 12 kırmızının **değişiklik öncesinde de kırmızı olduğu** tam geri alma provasıyla ölçüldü
- [x] Adımlar idempotent (migration + `db:rls` iki kez koşuldu, çıktı §2.3)
- [x] Geri alma yolu yazıldı **ve gerçekten koşuldu** (§2.9)
- [x] Sır sızıntısı yok
- [x] Canlıya geçiş YAPILMADI — yalnız yerel geliştirme veritabanı
