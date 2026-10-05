# TASK-MTTOUDNQ97X83 — İmha işi sessizce düşebiliyordu + sahipsiz ilişkiye sahip atanamıyordu

**Ajan:** blok-zincir-denet-i (QA-EN) · **Epik:** E10 · **Tarih:** 2026-09-09

Bu kart, kendi açtığım TASK-MTT1XL9NP2QYU raporundaki iki bulguyu kapatıyor:
**F-1** (imha işi düştüğünde `SystemAlert` yazılmıyor + başıboş `.sql` dosyaları yayın
listesinde yok) ve **F-2** (imhadan sonra ilişki kalıcı olarak sahipsiz kalıyor).

---

## 1. Ne yapıldı

### F-1a — Düşen imha artık alarm yazıyor

`purgeDueUsers()` bir hesabı silemediğinde tek iz `console.error` ve dönüş değerindeki
`failedCount` idi. Artık koşu sonunda `failedCount > 0` ise
`SystemAlert(level='error', source='users-scheduled-deletion')` yazılıyor.

- Uyarı gövdesi `buildPurgeFailureAlert()` **saf fonksiyonunda** üretiliyor (deponun
  `buildAlertRow` / `purgeDueUsers` kalıbı), böylece şekli veritabanı olmadan teste sabitlenebiliyor.
- **Kişisel veri yok:** meta yalnız `failedCount`, `failedUserIds` (id) ve `failureKinds`
  (hata **kodu**: `P2011`, `ENOENT`…) taşır. Ham hata metni ve e-posta **girmiyor** —
  `SystemAlert`'in `tenantId`'si ve RLS politikası yok, yani kiracı izolasyonunun dışında.
- **TASK-MTS80DUAF39Z8'in tekrar koruması OKUNDU ve tekrarlanmadı.** `recordAlert()` zaten
  `(level, source, message, meta)` kimliğiyle açık satıra katlıyor. Bu yüzden meta'ya koşudan
  koşuya **değişen hiçbir alan konmadı** (zaman damgası, deneme sayısı, hata metni yok) ve
  diziler sıralandı — `stableStringify` dizi sırasını anlamlı sayıyor. Aynı hata her gece
  tekrar ederse yeni satır açılmaz, `alertRepeatCount` artar (§2.1'de ölçüldü: `×2`).

### F-1b — Başıboş `.sql` dosyaları SAYILARAK yayın listesine girdi

Yeni: **`docs/RELEASE_CHECKLIST.md`** (§1 bloklayıcı madde). `docs/DATA_MODEL.md`'deki
"düz `.sql` dosyaları `migrate deploy`'un gözüne görünmez" notundan buraya bağ verildi.

Sayım tahmin değil, ölçüm (`probe-migration-inventory.mts`):

```
$ ls prisma/migrations/*.sql | grep -v "\.down\.sql$" | wc -l
12
TOTAL forward migrations in the tree: 17     (12 düz + 5 klasörlü)
prisma/migrations/migration_lock.toml present: false
_prisma_migrations table in this database: _prisma_migrations
rows Prisma has recorded as applied: 5       (yalnız klasörlü olanlar)
```

Yani **12 dosya deploy'dan önce elle koşulmak zorunda** ve veritabanı onların hiçbirini
"uygulandı" olarak bilmiyor.

### F-2 — Sahipsiz ilişkiye yeni odak noktası atanabiliyor

`updateRelationship` artık `ownerUserId` yazabiliyor:

- **Zod** (`RelationshipUpdateInput`) — eylemin daha önce hiç doğrulaması yoktu.
  `null` ("ata**ma**") ile `undefined` ("dokunma") ayrı tutuluyor; boş dize reddediliyor.
- **`can(...)`** — yalnız `manage_workspaces` taşıyan rol sahip atayabilir. Sıcaklık/not/
  sonraki adım **eskisi gibi her üyeye açık** (yetkiyi tüm eyleme genişletmek regresyon olurdu);
  yalnız `ownerUserId` alanı reddediliyor.
- **`withTenant` + üyelik kontrolü** — atanacak kişi aynı kiracının (silinmemiş) üyesi olmalı.
  Çapraz kiracı id'si ile **var olmayan** id **aynı** cevabı alır (`OWNER_NOT_IN_TENANT`) —
  farklı cevap bu alanı kullanıcı id'si yoklama aracına çevirirdi.
- **İmha mantığı yeniden yazılmadı**; `purgeDueUsers` olduğu gibi çağrılıyor.
- **UI:** `/[workspace]/relationships/[id]` ekranına odak noktası seçici eklendi.
  Sabit metin **yok**; `Relationships` ad alanına 28 anahtar iki dile de eklendi
  (ekranın eski sabit İngilizce metinleri de aynı anahtarlara taşındı — yarım çevrilmiş
  bir ekranın kanıt karesi geçersiz olurdu). Seçici, kaydetmenin sonucunu ekranda söylüyor;
  sessiz bir ret "kaydedildi" gibi okunuyordu.
- Üye listesi icat edilmedi: mevcut `getWorkspaceMembers(tenantId)` **yeniden kullanıldı**.

---

## 2. Kanıt

### 2.1 F-1 — canlı sonda: `failedCount: 1` VE `SystemAlert` yazılmış

`docs/agent-results/TASK-MTTOUDNQ97X83-evidence/probe-migration-ordering.mts`
(TASK-MTT1XL9NP2QYU'daki sondanın aynısı, kolonu ölçüm sonunda geri alır — **yalnız yerel dev DB**).
Tam log: `evidence/01-purge-alert-probe.txt`

```
--- Rolling the column back to the pre-migration shape (NOT NULL) ---
is_nullable now: NO

--- The erasure job runs against the un-migrated column ---
purgeDueUsers -> {"success":true,"dueCount":1,"purgedCount":0,"failedCount":1,...}
subject user row still present? true
subject id still in Relationship? 1
SystemAlert rows written by the failure: 1          <-- ÖNCE: 0
the alert row: {"level":"error","source":"users-scheduled-deletion",
                "message":"Scheduled erasure did not complete for every due account",
                "meta":{"failedCount":1,"failureKinds":["P2011"],
                        "failedUserIds":["qa-ord-s-mtttvaop"]},"resolvedAt":null}
alert body mentions the subject e-mail? false

--- The same failure a second night ---
purgeDueUsers -> {...,"failedCount":1,...}
SystemAlert rows after the second run: 1            <-- katlandı, yeni satır AÇILMADI
repeat counter on the open row: {...,"alertRepeatCount":2}

--- Can the production role (fabrika_app) write that row? ---
INSERT accepted and row read back (1 row), then removed

column restored, is_nullable: YES
(fixture and probe alert removed)
SystemAlert rows left by this probe: 0
```

Son satırdaki ölçüm bilinçli: TASK-MTSYH8LDGV5YU'da `AiUsageLog` yazma yolu **üretim rolünde
RLS yüzünden imkânsızdı** ve kimse ölçmemişti. Aynı hatayı tekrarlamamak için alarmın yazma
yolu `fabrika_app` rolüyle ayrıca ölçüldü — `SystemAlert`'te RLS yok, INSERT kabul ediliyor.

### 2.2 F-1 — alarm ekrana da ULAŞIYOR (kayıt ≠ belge)

Satırın veritabanında olması, operatörün onu görmesi demek değil. `tests/e2e/purge-failure-alert-console.spec.ts`
gerçek imhayı düşürüyor, sonra **gerçek tarayıcıda** platform admin olarak `/tr/admin/alerts`
açıp satırı arıyor ve satıra **tıklayıp** meta'yı açıyor:

```
✓ erasure failure reaches the alerts console › a platform admin sees the failed erasure on /admin/alerts
```

- `docs/agent-results/TASK-MTTOUDNQ97X83-screenshots/06-alerts-console.png` — listenin en üstünde
  `Hata · users-scheduled-deletion · Scheduled erasure did not complete for every due account · Açık`
- `.../07-alert-detail.png` — açılan satırda meta: `failedCount`, `failureKinds:["P2011"]`, `failedUserIds`
- Test ayrıca sayfanın gövdesinde `@qa.invalid` **geçmediğini** doğruluyor.

### 2.3 F-1 — birim testleri (KIRMIZI → YEŞİL)

`tests/users-scheduled-deletion.test.ts` 8 → 13 test. Düzeltme geri alınıp (`git show HEAD:…`)
aynı testler koşuldu:

```
KIRMIZI (iş dosyası HEAD'de):   Tests  4 failed | 9 passed (13)
                                TypeError: buildPurgeFailureAlert is not a function
YEŞİL  (düzeltme yerinde):      Tests  13 passed (13)
```

Yeni testler: alarmın yazıldığı, temiz koşuda **yazılmadığı**, gövdenin kişisel veri taşımadığı,
iki gecenin **aynı kimlik** ürettiği ve ikinci gecenin yeni satır değil `alertRepeatCount: 2` yaptığı.

### 2.4 F-2 — çapraz kiracı ataması REDDEDİLİYOR (canlı Postgres)

`tests/relationship-owner-assignment.live.test.ts` — 9 test, **gerçek veritabanı** (mock'lu Prisma
`where` şeklini kanıtlar, reddi kanıtlamaz). Düzeltme geri alınıp aynı dosya koşuldu:

```
KIRMIZI (actions.ts HEAD'de):   9 tests | 7 failed
  × an unassigned relationship can be given a new focal point
      AssertionError: expected null to be 'rel-u-a2-…'      <-- {success:true} DÖNÜYOR, hiçbir şey yazmıyor
  × a member of ANOTHER tenant is refused — and the column does not move
      expected { success: true } to deeply equal { success: false, error:'OWNER_NOT_IN_TENANT' }
  × a user id that does not exist is refused the same way — no id probe
  × a soft-deleted member of this tenant is refused
  × a role without manage_workspaces cannot reassign
  × an empty string is not an owner id
  × another tenant's session cannot touch this relationship at all

YEŞİL  (düzeltme yerinde):      Tests  9 passed (9)
```

### 2.5 F-2 — gerçek tıklama + ekran görüntüsü (offscreen DEĞİL)

`tests/e2e/relationship-owner-assign.spec.ts` — gerçek tarayıcı, gerçek giriş, gerçek seçim ve
`Kaydet` tıklaması; iddia ekranın değil **veritabanının**:

```
✓ an unassigned relationship gets a focal point by clicking (1.6s)
✓ the assignment survives a reload (1.1s)
✓ the same screen in English says the same thing (1.1s)
✓ the focal point can be cleared again (1.2s)
  4 passed
```

Kareler (`docs/agent-results/TASK-MTTOUDNQ97X83-screenshots/`):

| kare | ne gösteriyor |
|---|---|
| `01-unassigned-before.png` | imhadan sonraki hâl — "Odak noktası: Atanmadı" |
| `02-assigned-saved.png` | seçim yapıldı, `Kaydedildi.` — ekranın tamamı Türkçe |
| `03-after-reload.png` | atama yeniden yüklemede duruyor (yalnız istemci state'i değil) |
| `04-english.png` | aynı ekran EN: "Focal point / Only members of this tenant can be assigned." |
| `05-unassigned-again.png` | bilerek boşaltma da çalışıyor |

Test ayrıca **seçicinin başka kiracının kullanıcısını hiç listelemediğini** doğruluyor
(`expect(optionValues).not.toContain(REL_E2E.otherUserId)`).

**Bu koşuda iki gerçek KIRMIZI çıktı ve ikisi de gevşetilerek değil kök nedeni bulunarak kapandı:**

1. **`Argument 'ownerUserId' must not be null`** — ekran hata sayfası verdi. Kök neden ürün
   **değil**: :3000'deki dev sunucusu 8 Eyl 22:20'de başlamıştı ve belleğinde
   **eski üretilmiş Prisma istemcisi** vardı (`node_modules/.prisma/client` 8 Eyl 19:55;
   çözülen istemci bugün 11:26'da yeniden üretilmiş ve `ownerUserId?: string | null` içeriyor).
   Taze bir süreç (vitest live) aynı `null` yazmayı sorunsuz yapıyordu. Sunucu yeniden başlatıldı,
   **aynı test dosyası değiştirilmeden** koşuldu → 4/4 yeşil.
2. **`getByText('Odak noktası')` EN ekranında eşleşti** — kök neden yine sonda: fixture'ın
   *counterpart adı* "Sahipsiz İlişki — Odak Noktası Yok", yani **veri**, arayüz metni değil.
   İddia gevşetilmedi, **sıkılaştırıldı**: artık form etiketleri ve seçici seçenekleri
   tam liste olarak karşılaştırılıyor. Bu sırada gerçek bir kusur da çıktı: seçici
   `WorkspaceMember.role`'ü basıyordu, o etiket `ROLE_LABELS`'ta **sabit Türkçe** —
   İngilizce ekrana Türkçe koyuyordu. Seçici artık yalnız adı basıyor.

### 2.6 Regresyon

Rewrite ettiğim ekranın mevcut e2e paketi de koşuldu:

```
✓ M4 relationships — tenant isolation › tenant A signs in and reads its own relationship
✓ M4 relationships — tenant isolation › tenant B’s relationship id shows 404 for tenant A, and leaks no field
✓ M4 relationships — tenant isolation › the list shows tenant A’s rows only
  8 passed (üç dosya birlikte)
```

Sonda kalıntısı sıfır (`evidence/02-residue-check.txt`):

```
Relationship.ownerUserId is_nullable : YES
SystemAlert rows, source=users-scheduled-deletion: 0
leftover qa tenants  : 0
leftover qa users    : 0
unassigned relationships in db: 0
user.erased audit rows with reason "qa probe": 0
```

### 2.7 Kapı

```
$ pnpm gate   -> exit 0        (tam log: evidence/03-gate-full.txt)
  lint       ✖ 2 problems (0 errors, 2 warnings)
             — ikisi de TASK-MTSYH8LDGV5YU-evidence/*.mts kalıntısı, benim değil, sayı ARTMADI
  typecheck  exit 0
  test       Test Files 132 passed | 2 skipped · Tests 1559 passed | 8 skipped
  i18n       ✅ iki katalog da 1363 anahtar, fark yok
  rls:check  ✅ 43/43 · rls:verify ✅ fabrika_app rolüyle GERÇEKTEN ölçüldü
```

**Ölçülen ağaç, kartın söylediği ağaç DEĞİL.** Kart `984ba39` diyordu; ben çalışırken iki ajan
üç commit indirdi ve kapı `e011561` + benim değişikliklerim üzerinde koştu. Test sayısı farkı
tam olarak açıklanıyor: **1547 + 14 (benim) − 2 (`e011561`'in `efatura-unit` / `vat-by-country`
sadeleştirmesi) = 1559.** Benim 14'ü: `users-scheduled-deletion.test.ts` 8 → 13, artı 9 yeni canlı test.

---

## 3. Değişen dosyalar

**Ürün kodu**
- `src/lib/inngest/jobs/users-scheduled-deletion.ts` — `buildPurgeFailureAlert()` + `failedCount > 0` alarmı
- `src/app/[locale]/(app)/[workspace]/relationships/actions.ts` — Zod + `can()` + üyelik kontrolü + `ownerUserId` yazımı; `getAssignableMembers()`
- `src/app/[locale]/(app)/[workspace]/relationships/[id]/detail.tsx` — odak noktası seçici, kaydetme sonucu, tam i18n
- `src/app/[locale]/(app)/[workspace]/relationships/[id]/page.tsx` — üye listesi + yetki bayrağı, `← Geri` i18n
- `src/app/[locale]/(app)/[workspace]/relationships/[id]/data.ts` · `.../relationships/page.tsx` — `ownerUserId` select'e eklendi
- `src/types/db-rows.ts` — `RelationshipRow.ownerUserId`
- `messages/tr.json` · `messages/en.json` — `Relationships` ad alanına 28 anahtar (yalnız ekleme)

**Test**
- `tests/users-scheduled-deletion.test.ts` — +5 test
- `tests/relationship-owner-assignment.live.test.ts` — YENİ, 9 canlı test
- `tests/e2e/relationship-owner-assign.spec.ts` — YENİ, 4 gerçek tarayıcı testi
- `tests/e2e/purge-failure-alert-console.spec.ts` — YENİ, alarmın konsolda göründüğü

**Doküman / kanıt**
- `docs/RELEASE_CHECKLIST.md` — YENİ (F-1b)
- `docs/DATA_MODEL.md` — checklist'e bağ *(bu satır ben yazarken başka bir ajanın `e011561` commit'ine süpürüldü; içerik dev'de duruyor)*
- `docs/agent-results/TASK-MTTOUDNQ97X83-evidence/` — 3 sonda + 3 log
- `docs/agent-results/TASK-MTTOUDNQ97X83-screenshots/` — 7 kare

**DOKUNULMADI** (kart yasağı): `src/lib/money.ts`, `src/lib/efatura.ts`, `src/lib/billing/*`,
`src/lib/env.ts`, `scripts/efatura-preflight.ts`.

---

## 4. Riskler

Aşağıdakiler yolun üstünde görüldü; **kart açılsın diye adıyla bildiriliyor, düzeltilmedi.**

1. **`ROLE_LABELS` sabit Türkçe** (`src/lib/k5-pipeline/pipelineStore.ts:41`) — `getWorkspaceMembers`
   her çağırana Türkçe rol etiketi döndürür. Benim ekranımda etiketi basmayarak kaçındım, ama
   **pipeline panosunun sahip seçicileri** aynı etiketi İngilizce arayüzde de basıyor. CLAUDE.md §8 ihlali.
2. **`docs/INNGEST_SETUP.md` "Production Checklist" bayat** — "Sentry DSN set for error reporting"
   diyor; Sentry bu depodan kaldırıldı, alarmlar `SystemAlert` tablosuna gidiyor
   (`src/lib/observability/system-alert.ts` docstring'i). Yayın listesi yanlış yönlendiriyor.
3. **"FonBridge" hâlâ ürün arayüzünde** — TASK-MTSWM36QWC36Z `done`, ama kenar çubuğu logosu
   (`/logo.png`) her ekranda "FonBridge" yazıyor; kanıt karelerimin hepsinde görünüyor.
   O kart üretilen müşteri dokümanlarını kapatmış, **arayüz markasını değil**.
4. **`SystemAlert` saklama politikası yok** — bu veritabanında 61 satır, 49'u `Hata`, hiçbiri çözülmemiş.
   Yeni alarm bu yığının içine düşüyor; bir operatörün onu fark etmesi bugün şansa bağlı.
5. **Uzun ömürlü dev sunucusu bayat Prisma istemcisi tutuyor** (§2.5/1). Bir e2e'yi kırar ve
   ürün hatası gibi görünür. `pnpm gate`'in ilk adımı `db:generate` olduğu için şema değişen
   her günde tekrarlanabilir.
6. **`Relationship`'i `withTenant` dışında okuyan kod bu ölçümde denenmedi.** Atama kuralı
   RLS'e değil açık `where: { tenantId }` + üyelik kontrolüne dayanıyor, bu yüzden
   `DATABASE_URL` süper kullanıcı olsa da ölçüm geçerli; ama TASK-MTSZ0AL4QP2CT'deki
   "91 global prisma erişimi" sınıfı hâlâ açık.
7. **12 başıboş `.sql` yayın öncesi elle koşulmazsa** imha işi `P2011` ile düşer — artık
   sessizce değil, alarmla. Alarm kusuru **kapatmaz**, görünür yapar.

---

## 5. Açık sorular

1. Sahipsiz kalan ilişkiler kiracıya proaktif olarak nasıl gösterilecek? Bugün ancak biri
   ilişkiyi tek tek açarsa görülüyor; `m4WeeklySummary`'nin `unassignedCount`'u hâlâ iş
   çıktısında kalıyor, bildirim yolu `TODO`.
2. Odak noktası ataması için `manage_workspaces` doğru yetki mi, yoksa ayrı bir
   `assign_relationship_owner` eylemi mi açılmalı? Bugün `MEMBER` ve `WRITER` atayamıyor.
3. `SystemAlert` saklama/temizleme politikası (Risk 4) kimin kartı?

## 6. Sonraki adım

1. Kart `done` işaretlenebilir — iki bulgu da uçtan uca kanıtlı.
2. Riskler §4'teki 1, 2, 3 ve 4 için kart açılması önerilir (düzeltme yapılmadı).
3. `docs/RELEASE_CHECKLIST.md` ilk gerçek deploy'da koşulup sayı doğrulanmalı.
