# TASK-MVCBU4S79YWC4 (FO-56) — PR #104 inceleme düzeltmesi (se-fb, tur 4)

**Hüküm:** Bitti: B-1 (`PRIVACY_NOTICE.version` bump) kapatıldı (`2026-10-17.1` → `2026-10-18.1`); HUKUK 1.14 eki yazıldı; i18n, lint, typecheck, consent testleri ve /tr/privacy + /en/privacy render'ı temiz. Push ve pre-push gate aşağıda.

Not: Kart `-se-fb-3.md` yolunu öngörüyordu, ancak bu dosya PR #104 dalında önceki turdan (`18226da2`) zaten commit'li. Üzerine yazmak önceki kanıtı silerdi ve kanıt guard'ı reddederdi; bu yüzden bu tur `-se-fb-4.md` olarak yazıldı (ana ağaçtaki kopya da aynı adla).

## Ne yapıldı

1. **B-1 — PRIVACY_NOTICE.version:** `src/lib/legal/consent-documents.ts:58` `'2026-10-17.1'` → `'2026-10-18.1'`. Kural (`consent-documents.ts:10-14`): metin değişince sürüm artar. Dev'deki `2026-10-17.1` iki farklı metne işaret ediyordu; bu PR merge edilince de düzelir. `2026-10-17.1` referansı repoda başka yerde kalmadı (`git grep`, sadece geçmiş sonuç dosyaları).
2. **HUKUK-SORULARI-2026-09.md:** başlık `Sürüm 1.14 · 18.10.2026 (1.13 dayanağı ve AuditEvent cümlesi güncellendi)`; 1.13 paragrafına 18.10.2026 yeniden koşumunun ham `rls:verify` çıktısı eklendi.
3. **Kod davranışı değişmedi.** `src/` altında yalnız sürüm sabiti değişti.
4. **AuditEvent iddiası:** PR head'de 6 yerde yeni cümle zaten vardı; `git grep` yalnız `dpa-{tr,en}.md:64` tablo tanımını gösteriyor (lider kararı, bilerek bırakıldı).
5. **Ekran görüntüleri:** bu turda gizlilik metni değişmedi (değişen yalnız sürüm sabiti ve hukuk belgesi); mevcut `TASK-MVCBU4S79YWC4-shots/privacy-{tr,en}-security.png` önceki turda yeni metinle üretilmişti. Yeniden üretilmedi.

## Kanıt (ham çıktı)

### `pnpm rls:verify --require-db` (18.10.2026, bu worktree)
```
Kiracıya özel model: 47 · RLS açık tablo: 56 · tenant_isolation politikası: 48
RLS açık + 0 politika (deny-all): 0 · RLS kapalı + anon/authenticated erişimi: 0

⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
   Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif) … ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
   ✓ ExpertPreRegistration: sistem kapsamı içinde 5/5 satır görüldü
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```
(Tam çıktı: 16 ✓ satırı; kısaltıldı.)

### i18n / lint / typecheck
- `pnpm i18n:check`: `✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.` (exit 0)
- `pnpm lint`: `✖ 4 problems (0 errors, 4 warnings)` — uyarılar `tests/` altında, bu PR'ın dokunmadığı dosyalarda (önceki turda da aynı).
- `pnpm typecheck` (`tsc --noEmit`): exit 0.

### Testler
- `vitest run tests/registration-consent.test.ts tests/oauth-registration.test.ts tests/social-action-disclosure.test.ts tests/accept-invite-rebind-failure.test.ts`: 4 dosya, 29 test geçti.
- `vitest run tests/prompt-snapshots.test.ts`: geçti.

### Render (PR head, `next dev -p 3197`, sunucu iş bitince kapatıldı — pid 71903, kendi başlattığım)
- `/tr/privacy` HTTP 200, 239805 bayt: `AuditEvent` 0 kez, yeni cümle 3 kez.
- `/en/privacy` HTTP 200, 230669 bayt: `AuditEvent` 0 kez, yeni cümle 3 kez.
- Sürüm sabiti sayfada gösterilmiyor (beklenen); sürüm doğrulaması tüketen testlerle yapıldı.

### Dev ile birleşme
- `git merge-tree --write-tree origin/dev HEAD`: exit 0 (çakışma yok).

## Değişen dosyalar
- `src/lib/legal/consent-documents.ts` (sürüm sabiti)
- `docs/legal/HUKUK-SORULARI-2026-09.md` (başlık + 1.13 ham çıktı)
- `docs/agent-results/TASK-MVCBU4S79YWC4-se-fb-4.md` (bu rapor)
- Ana ağaç kopyası: `/Users/macbook/alan/docs/agent-results/TASK-MVCBU4S79YWC4-se-fb-4.md`

## Riskler
- **R-2 (kapsam dışı, kart açılacak):** silme/kimliksizleştirme iddiası ile `docs/legal/processing-register.md:192,434` çelişiyor. Bu PR'da değil; lider ayrı kart açacak.
- **R-3 (öneri, bloke değil):** parantezdeki üç grup "tanımlı ve sınırlı" listesi gibi okunuyor; kodda `SYSTEM_SCOPE_PURPOSES` altı amaç var (`tenant-discovery`, `subject-scoped`, `platform-admin`, `platform-aggregate`, `cross-tenant-job`, `public-intake`). Bu turda metne dokunulmadı; "örneğin" eklenmesi ya da hukuk sorusuna iki amacın eklenmesi lider kararı.
- **Merge:** yapılmadı (kart gereği).

## Açık sorular
- R-3: parantez "örneğin" mi, yoksa altı amacın tamamı mı?
- Sonuç dosyası adı: kart `-se-fb-3.md` istiyordu; önceki tur dosyası korunsun diye `-se-fb-4.md` seçildi. Yanlışsa söylenirse yeniden adlandırılır.

## Sonraki adım
Commit + push (pre-push gate `pnpm gate`, `--no-verify` yok), sonra PR #104 yeniden incelemeye.

## Platform
mac (darwin). Yalnız metin, sürüm sabiti ve sayfa render'ı; platforma bağlı kod yolu yok.
