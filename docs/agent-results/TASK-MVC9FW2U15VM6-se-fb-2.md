---
sözleşme: 3
görev: TASK-MVC9FW2U15VM6
kod: TASK-MVC9FW2U15VM6
ajan: se-fb
motor: claude
tip: yayın
okur: ekip
hüküm: Kısmen bitti: İki iş de kodlandı, yerelde commit'lendi ve ölçüldü. public-intake artık 30 yerine yalnız 2 tabloyu açıyor ve AuditEvent yazması reddediliyor; iki mutant da kırmızı verdi. İki worktree'de de .env olmadığı için push ve FO-52 PR'ı bekliyor.
platform: mac (Darwin 27, zsh, yerel Docker Postgres fabrika-postgres :5433, origin/dev b252f168). Değişiklik SQL + TS + doküman; platforma bağlı kod yolu yok (süreç, kabuk, dosya yolu ayrımı yok), davranış Postgres'te aynı. Windows ve Linux koşulmadı, gerek yok.
sürüm: 1
tarih: 2026-10-18T16:22:47.435Z
---

# #94 dev merge + FO-52 public-intake kilidi (C) uygulaması

## Ne yapıldı

### (a) PR #94: FO-49 KVKK v2 (worktree `.claude-fo49`, dal `se-fb/fo49-kvkk-v2`)
- `origin/dev` (b252f168) dala merge edildi. Rebase ve force yapılmadı.
- Çakışma yalnız `docs/DATA_MODEL.md` §22 "Alanlar" satırındaydı. Dev'in FO-45 satırları (RLS açık, `system_scope`, F6, günlük kota) aynen alındı. Tek değişiklik: `consentTextVersion` artık `kvkk-v2, sunucu sabiti; eski satırlar kvkk-v1`.
- Triyajdaki NIT düzeltildi: `docs/legal/privacy-notice-gap-analysis.md` satır 233 ve 304'te unvan karar tarihi 2026-09-08 → **2026-10-17** (`EFATURA_SETUP.md` ile aynı).
- Merge commit'i: `20899dc3`. Pre-commit kapısı temizdi. İlk denemede Prisma client eskiydi; `prisma generate` koşulduktan sonra temiz geçti.
- **Push: .env bekliyor.** `.claude-fo49`'da `.env` yok. Dal origin'in 71 commit önünde.

### (b) FO-52: public-intake kilidi (C, K-569554); worktree `FONBRIDGE-se-fo52`, dal `se-fb/fo52-public-intake-lock` (origin/dev tabanlı)
1. `prisma/rls.sql` → `system_scope_open(tbl)`: mühürlü dala amaç koşulu eklendi. Owner dalına (`pg_has_role`) dokunulmadı.
   ```sql
   OR (public.system_scope_sealed()
       AND (coalesce(current_setting('app.system_scope_purpose', true), '') <> 'public-intake'
            OR (tbl IN (to_regclass('public."ExpertPreRegistration"'),
                        to_regclass('public."ExpertFounderCounter"'))) IS TRUE))
   ```
   `to_regclass` kullanıldı. Bu veritabanında henüz olmayan bir tablo (dev'de `ExpertFounderCounter`) NULL döner ve listede yokmuş gibi davranır; politika hata vermez. `IS TRUE` bu NULL'u false yapar. Üst yorum bloğu ve `COMMENT ON FUNCTION` güncellendi. Sınır yoruma yazıldı: amaç GUC'si de USERSET olduğu için bu koruma unutmaya karşıdır, saldırgana karşı değildir.
2. `scripts/check-rls-live.ts` → yeni `probePurposeTables`. İki bağlantı `pg_export_snapshot` ile aynı anlık görüntüyü kullanıyor, bu yüzden aynı anda yazan e2e süreçleri sayımı bozamıyor. Ölçülenler:
   - public-intake'te öteki tabloların hiçbiri kapsam dışından fazla satır göstermiyor.
   - public-intake kendi tablolarını tam görüyor.
   - public-intake'te AuditEvent INSERT reddediliyor.
   - public-intake'te ExpertPreRegistration INSERT kabul ediliyor (pozitif kontrol).
   - Öteki 5 amaç her tabloda tüm satırları görüyor.
   - cross-tenant-job'da AuditEvent INSERT kabul ediliyor (pozitif kontrol).
   Hepsi ROLLBACK ile geri alınıyor.
   **Ek düzeltme:** geçici ölçüm rolüne `enter_system_scope` EXECUTE yetkisi verildi. Bu yetki olmadan, `DATABASE_URL_RLS_TEST` tanımlı değilken FO-45 sondası `permission denied for function enter_system_scope` hatasıyla çöküyordu. Bu hata dev'de de var; aşağıdaki "önce" koşusunda görüldü.
3. `tests/system-scope.live.test.ts` → yeni describe bloğu, 3 kol:
   - public-intake fixture Membership'i ve ApiKey'i 0 görüyor, platform-admin hâlâ görüyor (regresyon);
   - public-intake'te AuditEvent INSERT reddediliyor;
   - public-intake ExpertPreRegistration'a yazıp okuyabiliyor.
   `asApp` ve `fixtureCount` modül düzeyine taşındı.
4. `src/lib/system-scope.ts` yorumu ve `docs/adr/ADR-0009` §5 eki. `DATA_MODEL.md`'ye bilerek dokunulmadı: #94 aynı yerin bitişik satırını değiştiriyor, çakışma çıkmasın.
5. Commit `ac61467f`. **Push ve PR: .env bekliyor.** Worktree'de `.env` yok; PR `--base dev` push'tan sonra açılacak.

## Kanıt (ham çıktı)

### #94
```
git merge origin/dev → CONFLICT docs/DATA_MODEL.md (tek) → çözüldü, 20899dc3
tsc --noEmit → 0
pnpm i18n:check → ✅ i18n check passed
vitest tests/expert-prereg-form.test.tsx src/lib/expert-prereg tests/expert-prereg-admin-route.test.ts tests/prompt-snapshots.test.ts
  Test Files 8 passed (8) · Tests 92 passed (92)
tam vitest (.env yok): 16 dosya / 56 test düşüyor, hepsi "Authentication failed … credentials for `fabrika` are not valid".
  Bu bir ortam hatası (bkz. fonbridge-worktree-pre-push-gate-env); düşen dosyaların hiçbiri FO-49 diff'inde değil.
```

### FO-52: önce (yerel DB, `SET LOCAL ROLE fabrika_app`, her amaç ayrı işlemde, ROLLBACK)
```
purpose=public-intake      tables=53 rows_outside=99 rows_inside=18313 tables_opened_beyond_outside=30
AuditEvent INSERT: ACCEPTED (rolled back)
(öteki 5 amaç: aynı, 30 tablo / 18313)
```
`rls:verify`, yeni kodla ama DB'de eski fonksiyon varken (bu, "koşul yok" mutantına denk):
```
❌ KİRACI İZOLASYONU UYGULANMIYOR
 • public-intake: 28 tablo kapsam dışından fazlasını gösteriyor (yalnız ExpertPreRegistration, ExpertFounderCounter açılmalı): ApiKey=1>0, ApplicationPart=5>0, AuditEvent=1257>0, …
 • public-intake: AuditEvent INSERT KABUL EDİLDİ
```
Eski kodla `rls:verify` (dev hali, `.env` yok): `❌ permission denied for function enter_system_scope` (yukarıdaki ek düzeltme bunun için).

### FO-52: `pnpm db:rls` (yerel DB)
```
✅ prisma/rls.sql applied. Policies in public: 116 → 116
system_scope_open ACL: {fabrika=X/fabrika,fabrika_app=X/fabrika,…}  (korundu)
```

### FO-52: sonra
```
purpose=public-intake      tables=53 rows_outside=99 rows_inside=105 tables_opened_beyond_outside=2
opened: ExpertFounderCounter=1(+1) ExpertPreRegistration=5(+5)
AuditEvent INSERT: REJECTED (new row violates row-level security policy for table "AuditEvent")
purpose=platform-aggregate | platform-admin | tenant-discovery | subject-scoped | cross-tenant-job:
  her biri tables_opened_beyond_outside=30, rows_inside=18352, AuditEvent INSERT: ACCEPTED (rolled back)

pnpm rls:verify → exit 0
 ✓ public-intake: 51 system_scope tablosunda kapsam dışıyla aynı satır sayısı (yalnız ExpertPreRegistration, ExpertFounderCounter açık)
 ✓ public-intake: AuditEvent INSERT reddedildi
 ✓ public-intake: ExpertPreRegistration INSERT kabul edildi (pozitif kontrol, geri alındı)
 ✓ tenant-discovery / subject-scoped / platform-admin / platform-aggregate / cross-tenant-job: 30 tablo kapsamla açıldı, her system_scope tablosunda tüm satırlar
 ✓ cross-tenant-job: AuditEvent INSERT kabul edildi (pozitif kontrol, geri alındı)
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon rls_verify_probe rolüyle GERÇEKTEN ölçüldü
```
Canlı test (geçici NOBYPASSRLS rol `se_fo52_app`, `fabrika_app` üyesi; iş bitince DROP edildi):
```
vitest --reporter=verbose tests/system-scope.live.test.ts → Tests 20 passed (20)
 ✓ public-intake opens only the expert form tables > another tenant's Membership and ApiKey rows stay at 0, while platform-admin still sees them
 ✓ … > a write outside the form tables is refused
 ✓ … > the form still reads and writes ExpertPreRegistration
vitest tests/system-scope.live.test.ts tests/expert-prereg-app-role.live.test.ts tests/expert-prereg.live.test.ts → 26 passed
```

### Mutasyon kontrolü
| Mutant | rls:verify | canlı test |
|---|---|---|
| M1: amaç koşulu kaldırıldı (origin/dev fonksiyonu) | ❌ 28 tablo sızdı + AuditEvent INSERT kabul | ❌ 2 failed: `expected [ 2, 1 ] to deeply equal [ +0, +0 ]`, `promise resolved … instead of rejecting` |
| M2: listeden ExpertFounderCounter çıkarıldı | ❌ `public-intake: kendi tablosunu tam göremiyor: ExpertFounderCounter=0/1` | #92 kodu: ❌ `new row violates row-level security policy for table "ExpertFounderCounter"` |
Her mutanttan sonra `pnpm db:rls` yeniden uygulandı, `rls:verify` yeniden yeşil (exit 0). DB'deki fonksiyon tanımında iki `to_regclass` satırı da var (doğrulandı).

### #92 ile uyum (seçimin kanıtı)
`origin/be-fb/fo50-prereg-retention` geçici bir worktree'de (scratchpad, iş sonunda kaldırıldı) yeni kilitle koşuldu. `expert-prereg-app-role.live` + `expert-prereg.live` → 6 passed. Retention suite kendini paylaşımlı `fabrika` DB'de bilerek atlıyor (#92'nin kendi koruması). M2 altında aynı test kırıldı, yukarıda.

### Tam kapı (FO-52 worktree)
```
pnpm lint → 0 hata (4 uyarı, hepsi dokunmadığım dosyalarda)
pnpm typecheck → 0 · pnpm rls:check → ✅ SUCCESS
vitest (tam, DATABASE_URL + geçici RLS rolü env ile): 4716 passed, 3 failed
  3 hata: iyzico/stripe-webhook-idempotency-rls, migration-owner-chain → "expected 'se_fo52_app' to be 'fabrika_app'"
  Bu testler rol ADINI doğruluyor; geçici rolün adından kaynaklanıyor, kod hatası değil. Gerçek fabrika_app ile (.env) yeşil olmalı, push kapısı bunu doğrular.
e2e: koşulmadı (.env yok; pre-push kapısı koşacak).
```

## Değişen dosyalar
- #94 (merge commit): `docs/DATA_MODEL.md`, `docs/legal/privacy-notice-gap-analysis.md`
- FO-52: `prisma/rls.sql`, `scripts/check-rls-live.ts`, `tests/system-scope.live.test.ts`, `src/lib/system-scope.ts`, `docs/adr/ADR-0009-signed-system-scope.md`
- Bu rapor.

## Riskler
- **Seçim (değiştirilebilir):** izin listesinde `ExpertFounderCounter` var, çünkü #92'nin doğrulaması bu sayacı public-intake içinde yazıyor (ölçüldü). Sayaç kişisel veri değil; tek satırlık bir tamsayı. Liste yalnız ExpertPreRegistration olsaydı #92 merge edildiği anda uzman doğrulaması RLS hatasıyla kırılırdı.
- **#95 (FO-26):** `ExpertPreRegAttempt`'e triyajın önerdiği gibi `system_scope` politikası konursa bu tablo da listeye eklenmeli. Eklenmezse register yazarken RLS hatası alır. be-fb'ye not.
- **Yayın sırası:** FO-52 `pnpm db:rls` ile uygulanır, migration'a gerek yok. Kodu dev'deki yollarla uyumlu; dev'deki public-intake yalnız ExpertPreRegistration kullanıyor.
- **Paylaşımlı yerel DB:** `fabrika` DB'de `system_scope_open` artık FO-52 hali. Dev'deki rls.sql'i yeniden uygulayan biri eski hale döndürür. Bu zararsız; yalnız public-intake daralması kalkar.
- **Gözlem:** `rls_verify_probe` rolü küme genelinde kalıntı olarak duruyor. Başka DB'lerdeki yetkileri yüzünden `DROP ROLE` sessizce başarısız oluyor (`drop().catch`). Güvenlik açığı değil (NOBYPASSRLS, yalnız SELECT/INSERT), ama temizlik işi olarak ayrı bir kart açılabilir.
- **Kapsam dışı (eski rapordan, hâlâ geçerli):** `User/Tenant/Account/Session` tablolarında RLS yok. C bunları korumaz.

## Sonraki adım
- Patron: `.claude-fo49` ve `FONBRIDGE-se-fo52`'ye `.env` kopyası. Sonra se-fb iki dalı push eder (pre-push kapısı tam koşar, ayrı E2E_PORT) ve FO-52 PR'ını `--base dev` açar.
- crw: #94'te yalnız merge commit'inin delta kontrolü. FO-52 PR'ının incelemesi.
- Lider: merge sırası #92 → #95 → #94. FO-52, #92'den önce ya da sonra girebilir (to_regclass sayesinde).
- Not: görev metnindeki "KANIT" satırı `TASK-MVC9FW2U15VM6-se-fb.md`'yi gösteriyordu. O dosya tasarım raporu ve commit'li (kanıt dosyası bir kez yazılır). Görev metnindeki açık yol `-2.md` olduğu için sonuç buraya yazıldı.
