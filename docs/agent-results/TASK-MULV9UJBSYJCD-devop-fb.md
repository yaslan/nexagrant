# TASK-MULV9UJBSYJCD — FB BAKIM (İNCELEME-3 Ö-3 / Ö-4 / Ö-6) — devop-fb

Commit: `b11a7b03` (dev, push yok).

## 1. Ne yapıldı

- **Ö-3:** `package.json` içindeki ölü `pnpm.onlyBuiltDependencies` alanı silindi. Build kararları zaten `pnpm-workspace.yaml#allowBuilds` içinde duruyor ve oradaki liste bu alanın tamamını kapsıyor: `@parcel/watcher` ve `@swc/core` her ikisi de `true`.
- **Ö-4:** şema, SQL migration'larıyla hizalandı. Yeni migration yazılmadı, çünkü migration dosyaları zaten doğruydu; kayma şema tarafındaydı.
  - `PlanVersion.modules` → `@default([])`. Karşılığı `add-plan-versioning/migration.sql:44 DEFAULT '{}'`.
  - `TenantBillingIdentity.updatedAt` → `@default(now()) @updatedAt`. Karşılığı `add-invoice-write-path.sql:57 DEFAULT CURRENT_TIMESTAMP`.
  - **Ek (aynı sınıf, incelemede "kozmetik K" diye geçiyordu):** 5 FK'ye `onUpdate: NoAction` eklendi: `PlanVersion.plan`, `PlanFeature.planVersion`, `PlanAssignment.plan`, `PlanAssignment.tenant` ve `Subscription.planVersion`.
    - Migration'da ON UPDATE yazılmamış, yani fiilen `NO ACTION`. Prisma'nın varsayılanı ise `Cascade`. Diff bu yüzden FK'leri drop edip yeniden ekliyordu.
    - Davranış farkı gerçekti, ama pratikte etkisizdi: id'ler güncellenmiyor.
  - **Ek (aynı sınıf, ilk diff'te görünmüyordu):** `MeetingBrief`'e `@@index([tenantId], map: "MeetingBrief_tenantId")` eklendi. Karşılığı `add-m9-meeting-schedule/migration.sql:13`.
    - Paylaşılan yerel DB'de bu index eksikti, o yüzden oraya karşı alınan diff farkı göstermiyordu. Fark, push + migration ile sıfırdan kurulan DB'de ortaya çıktı.
    - Yerel DB'ye migration'daki idempotent satırı (`CREATE INDEX IF NOT EXISTS …`) uyguladım.
- **Ö-6:** `.env.example` dosyasına koddaki eksik 16 anahtar eklendi.
  - **Boş değerle (boş = tanımsız olduğu kodla doğrulandı):** `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (`||` ile okunuyor, `src/lib/auth.ts:184-189`), `NEXT_PUBLIC_APP_VERSION` (`||`), `BILLING_ACTIVE_TIER` (trim kontrolü var), `R2_PUBLIC_HOST` ve `NEXT_PUBLIC_POSTHOG_HOST` (`optionalUrl`), `ALERTS_SWEEP_FAILURE_THRESHOLD` (boş → preprocess ile 3).
  - **Yorum satırı olarak, boş değil:** `BETA_SUPPORT_EMAIL`, `BETA_FEEDBACK_EMAIL`, `BETA_MEETING_URL`, `K1_EUROSTARS_URL`, `K1_TUBITAK_URL` ve `NEXT_PUBLIC_SMTP_FROM_ADDRESS`.
    - İlk beşi `??` ile okunuyor; `NEXT_PUBLIC_SMTP_FROM_ADDRESS` ise zod'un `.default()` değerini alıyor, o da yalnız `undefined` iken devreye giriyor. Bu yüzden boş bir satır varsayılanı `""` ile ezer ve boş adres ya da boş URL üretir.
    - Şablon aynı kuralı zaten `FEEDBACK_DIGEST_TO` ve `CALENDAR_ENCRYPTION_KEY` için uyguluyor. Yorum satırında gösterilen değerler koddaki varsayılanların aynısı; sır içermiyor.
  - `NEXT_RUNTIME` bilerek eklenmedi, çünkü Next.js çalışma anında kendisi atıyor.

## 2. Kanıt

```
# Ö-3 — pnpm install (önce: incelemedeki "The "pnpm" field in package.json is no longer read" uyarısı)
$ pnpm install
Already up to date
Done in 272ms using pnpm v11.25.0

# Ö-4 — önce (yerel DB, migration'la kurulu)
ALTER TABLE "PlanVersion" ALTER COLUMN "modules" DROP DEFAULT;
ALTER TABLE "TenantBillingIdentity" ALTER COLUMN "updatedAt" DROP DEFAULT;
+ 5 FK DROP/ADD (... ON UPDATE CASCADE)

# sonra — yerel dev DB
$ prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- This is an empty migration.

# sonra — throwaway DB fb_ts_devop: prisma db push + scripts/apply-migrations.sh ×2 (CI yolu)
run1 rc=0 apply-migrations: 29 files applied
run2 rc=0 apply-migrations: 29 files applied      (idempotent)
$ prisma migrate diff ... (fb_ts_devop)
-- This is an empty migration.
# yalnız db push sonrası kolon varsayılanları / FK'ler (CI DB'si artık migration DB'siyle aynı):
TenantBillingIdentity.updatedAt = CURRENT_TIMESTAMP
PlanVersion.modules = ARRAY[]::text[]
PlanVersion_planId_fkey FOREIGN KEY ("planId") REFERENCES "Plan"(id) ON DELETE RESTRICT
# modules vermeyen ham INSERT artık 23502 atmıyor:
INSERT INTO "PlanVersion"(id,"planId",version,...) → pv-devop|{}|t
# throwaway DB sonra DROP edildi.

# Ö-6 — anahtar sayımı (src içindeki process.env.* ∪ src/lib/env.ts envSchema)
code keys: 58
example keys (incl. commented): 73
MISSING: NEXT_RUNTIME            (Next.js'in kendi değişkeni)
bash-source-ok / zsh-source-ok   (set -a; source .env.example)

# Kapılar — izole worktree (HEAD + yalnız bu 3 dosya; set -a; source .env; set +a)
gen=0 tc=0 lint=0 test=0
 Test Files  191 passed | 2 skipped (193)
      Tests  2213 passed | 8 skipped (2221)
```

Paylaşılan ağaçta `pnpm typecheck` şu an rc=2 veriyor. Tek hata `src/modules/m5/ui/Dashboard.tsx(144,8): Cannot find name 'aside'`. Bu dosya başka bir ajanın commit'lenmemiş, yarım kalmış düzenlemesi ve bu işin kapsamı dışında. O dosya olmadan (izole worktree'de) typecheck 0 dönüyor. Aynı paylaşılan ağaçta, o düzenleme gelmeden önce de typecheck 0, lint 0 ve test 0 (191 passed) almıştım.

`pnpm db:generate` koşuldu. :3000'in yeniden başlatılması leed-fb'den (alan-c2) SendMessage ile istendi. İkinci bir next dev sunucusu açılmadı.
leed-fb teyidi: :3000 yeni Prisma istemcisiyle yeniden başlatıldı; `/tr`, `/tr/giris` ve `/tr/kayit` 200 döndü. Dashboard.tsx hatası fe-fb'ye iletildi.

## 3. Değişen dosyalar

- `package.json`: 7 satır silindi.
- `prisma/schema.prisma`: 2 varsayılan, 5 FK `onUpdate: NoAction` ve 1 `@@index(map:)` eklendi.
- `.env.example`: +31 satır.
- Yerel DB (repo dışı): `CREATE INDEX IF NOT EXISTS "MeetingBrief_tenantId"`. Geri alma: `DROP INDEX "MeetingBrief_tenantId";`

## 4. Riskler

- **FK `onUpdate: NoAction`:** migration'la kurulan DB'lerde (üretim dahil) hiçbir şey değişmiyor. CI'daki `db push` ile kurulan DB'de ise FK'ler ON UPDATE CASCADE yerine NO ACTION oluyor. Kod `Plan.id`, `PlanVersion.id` ya da `Tenant.id` güncellemiyor, dolayısıyla etkisiz.
- **`@@index` eklemesi:** `db push` ile kurulan her DB'de index oluşturur. Tablo küçük.
- **Geri alma:** commit'i `git revert` ile geri almak yeterli. Hiçbir DB nesnesi silinmedi.

## 5. Açık sorular

- Yerel dev DB'de başka migration nesneleri de eksik olabilir (bu index eksikti). Ö-2 kapsamında yerel DB'ye de `scripts/apply-migrations.sh` koşulması önerilir.

## 6. Sonraki adım

- Ö-2'deki CI kayma kapısı (`migrate diff` → boş değilse fail) bu sınıfı kalıcı olarak kapatır. Kapı artık boş diff'le başlayabilir.

## Platform beyanı

Doğrulama yalnız **mac** (darwin, zsh ve bash 3.2, Docker `fabrika-postgres` pg16) üzerinde yapıldı. Yapılan değişiklikler platformdan bağımsız: JSON, Prisma şeması ve dotenv şablonu.

- `.env.example` bash ve zsh'ta source edildi.
- Linux (CI runner) koşulamadı, çünkü push yasak. CI'ın izlediği yol (`db push` + `apply-migrations`) yerelde birebir koşuldu.
- Windows kapsam dışı; dosyalar yol ya da kabuk sözdizimi içermiyor.
