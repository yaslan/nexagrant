---
sözleşme: 3
kod: FO-7
kart: TASK-MVBCEJXQWU2D3
ajan: devop-fb
motor: claude
tip: runtime
okur: kullanıcı
hüküm: Kısmen bitti: pnpm gate yerelde yeşil (8. koşu, GATE_EXIT=0), yedek ve geri yükleme provası geçti, B4 ölçüldü; CI koşulamadı (GitHub kullanım limiti), core.hooksPath düzeltilmedi, PR merge bekliyor.
platform: mac (darwin 27.0, Postgres 16 pgvector konteyneri, localhost:5433). Linux/Windows: koşulamadı — CI (ubuntu-latest) iş akışı limit nedeniyle çalışmıyor; Windows kapsam dışı (dağıtım ve CI Linux).
sürüm: 1
---

# FO-7 · Gate yeşil + CI kapsamı + rls:verify --require-db + yedekleme

Dal: `devop-fb/fo7-gate` (`origin/dev` tabanlı, ffb9c79f). PR `--base dev`, merge edilmedi.

## Ne yapıldı

1. **Yerel `fabrika_app` kurulumu.** `pnpm db:rls-role` (idempotent; parolayı `.env`'deki `DATABASE_URL_RLS_TEST`'ten alır, SQL dosyasına yazmaz). Parola hiçbir çıktıya yazılmadı. Ek bulgu: rol parolası koşular arasında dışarıdan değişiyor (bkz. Riskler); gate'e e2e'den önce `pnpm db:rls-role` adımı eklendi.
2. **`pnpm gate` yeşil.** İlk üç koşuda kırmızı nedenleri kanıtla sınıflandırıldı:
   - seed `Plan` silemiyordu (`PlanVersion_planId_fkey`, RESTRICT): `src/lib/billing/plan-admin.test.ts` `finally` bloğu versiyonu silmeden planı siliyordu → test düşünce iki `padm-empty-*` kalıntısı kaldı. Test düzeltildi (versiyon önce silinir); kalıntılar bağlı kayıt olmadığı doğrulanıp silindi; `pnpm db:seed` başarılı oldu.
   - `admin-plan-editor` testi `free` planını `private` bırakıyordu (önceki başarısız koşudan): başlangıçta `public`'e çekilir.
   - `team-members-ui` davet testi: SMTP yok. SMTP ayarı artık `playwright.config.ts` e2e ortamında (CI ile aynı değerler).
   - `bearer-token-hash.live.test.ts`: SMTP env gate'e verilince cooldown dalına giriyordu. SMTP artık yalnızca e2e'ye ait; unit adımında yok.
   - lint: `playwright-report/` ve `test-results/` (e2e çıktısı) ESLint'e dışlandı (257 hata → 0).
   - `rls.spec.ts`: `fabrika_app` parolası koşular arasında sapıyordu; e2e'den önce `db:rls-role` ile hizalanıyor.
3. **B4 (`rls:verify --require-db`).** Ölçüldü:
   ```
   DB kapalı, --require-db      → exit=1  "❌ Veritabanına ulaşılamadı … koşamadı ve --require-db verildi"
   DB kapalı, flag yok (eski)   → exit=0  "⏭ … ATLANDI (geçti sayılmaz)"   ← sessiz geçiş
   DB açık, --require-db        → exit=0  "✅ 47 kiracıya özel tabloda … GERÇEKTEN ölçüldü"
   ```
   `package.json` gate zincirinde `rls:verify --require-db`; CI adımı da `--require-db` ile.
4. **CI kapsamı.** `.github/workflows/ci.yml`: `pnpm rls:bypass-check` ve `pnpm alerts:check` eklendi (DB servis konteyneri hazırlandıktan sonra). `actionlint` kurulu değil; YAML doğrulaması yapılmadı, CI koşulmadı.
5. **Yedekleme ve geri yükleme.** `scripts/backup/pg-backup.sh` (`pnpm backup:db`) ve `scripts/backup/pg-restore-drill.sh` (`pnpm backup:restore-drill`). Gerçek DB üzerinde:
   ```
   [pg-backup] ok: fonbridge-20261016T193431Z.dump 300K toc_entries=743
   [restore-drill] checksum ok
   [restore-drill] ok: 77 tables, restore 1s, total 1s
   [restore-drill] scratch database dropped
   ```
   Negatif testler: kesilmiş dump → `FAIL: pg_restore failed` (exit 1); bozulmuş checksum → `FAIL: checksum mismatch` (exit 1). Restore sayım karşılaştırması: 77 tablo, iki tarafta birebir eşit (`public` + `graphile_worker`).
6. **Dokümanlar.** `CLAUDE.md` gate satırı `package.json` ile hizalandı. `docs/RELEASE_CHECKLIST.md` §4 başlığı ve durumu güncellendi (zamanlayıcı, dış kopya, 4 haftalık/12 aylık saklama **henüz yok**).

## Kanıt — son gate koşusu (8. koşu, GATE_EXIT=0)

```
✖ 4 problems (0 errors, 4 warnings)                     ← lint
 Test Files  330 passed | 7 skipped (337)               ← vitest
      Tests  4399 passed | 120 skipped (4519)
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
   318 passed (6.4m) · 8 skipped · 0 failed             ← e2e (playwright)
✅ Öksüz alarm yok                                       ← alerts:check
GATE_EXIT=0
```

Tam log yerelde: `scratchpad/gate-run8.log` (repo dışı).

## Değişen dosyalar

- `.github/workflows/ci.yml` — rls:verify --require-db; rls:bypass-check; alerts:check
- `CLAUDE.md` — gate satırı
- `docs/RELEASE_CHECKLIST.md` — §4 durumu
- `docs/agent-results/TASK-MVBCEJXQWU2D3-devop-fb.md` — bu rapor
- `eslint.config.mjs` — playwright-report/, test-results/ dışlandı
- `package.json` — yalnız `scripts`: gate zinciri, `backup:db`, `backup:restore-drill`
- `playwright.config.ts` — `.env` yükleme (dotenv), e2e SMTP/mailpit (CI ile aynı)
- `scripts/backup/pg-backup.sh`, `scripts/backup/pg-restore-drill.sh` — yeni
- `src/lib/billing/plan-admin.test.ts` — finally: versiyon önce silinir
- `tests/e2e/admin-plan-editor.spec.ts` — başlangıçta görünürlük sıfırlanır

## Riskler

- **Paylaşımlı DB ve rol parolası.** `fabrika_app` tek küme-geneli bir rol. Koşular arasında parolası dışarıdan değişti (en az iki kez); `db:rls-role` ile hizalayınca düzeldi. Kaynağı kanıtlanamadı. Bu, P0-1'in asıl kökü olabilir: her worktree'nin `.env`'i aynı değeri taşısa da başka bir süreç rolü yeniden üretiyor olabilir. Önerilen kalıcı çözüm: tek bir yerel test rolü ve parola, ya da agent başına ayrı DB.
- **Yerel e2e tuzağı.** `src/lib/db.ts` `DATABASE_URL` yoksa `fabrika:fabrika@localhost:5432` (CI varsayılanı) kullanıyor; yerelde 5432'de başka bir konteyner var. Playwright runner artık `.env` yüklüyor; bu olmadan testler yanlış DB'ye gidiyor.
- **Öksüz alarm sızıntısı (tekrarlanamadı).** `iyzico-webhook-idempotency-rls.live.test.ts` bir koşuda kendi `RUN` kimliğiyle iki `SystemAlert` bıraktı; wipe bunları silemedi. Tek başına koşu ve sonraki gate koşuları bırakmadı. Kök neden izole edilemedi; iki satır test çöpü olarak silindi.
- **CI koşulmadı.** GitHub kullanım limiti (P0-2, patron). Yeşil CI kanıtı yok; bu PR için yerel gate kanıtı geçerli.
- **Git hook yanlış dizinde.** Aşağıya bkz.

## Açık sorular / patrona

1. **Git kancası:** `core.hooksPath` repo yerel `.git/config`'te `/Users/macbook/AgentSpace/fabrika/githooks` gösteriyor. Düzeltme: `git config core.hooksPath githooks` (repo kökünde). Ayarı değiştirmedim.
2. **Yedek zamanlayıcısı ve dış kopya:** sunucu belli olunca `RELEASE_CHECKLIST` §4.1 (cron, R2/S3 kopya, `age` şifreleme, 4 haftalık/12 aylık saklama).
3. **Rol parolası stratejisi** (bkz. Riskler).

## Sonraki adım

PR açıldı (`--base dev`), merge edilmeyecek. CI limiti çözülünce iş akışlarının gerçek koşumu.
