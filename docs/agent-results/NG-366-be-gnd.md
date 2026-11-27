# NG-366 — CookieConsentRecord saklama süresi ve gecelik temizlik (NG-363 B-1)

**Hüküm: TAMAMLANDI — draft PR #453 açık, merge YOK.** Canlıya çıkış NG-371 birleşmesine bağlı (aşağıda).

**Ajan:** be-gnd (Backend Mühendisi) · **Tip:** feature · **Sprint:** —
**Dal:** `task/ng-366` · **Base:** `origin/dev` (1da8036e) · **Commit:** `e38c6986`
**PR:** https://github.com/yaslan/nexagrant/pull/453 (draft, base `dev`)
**Platform kapsamı:** Linux (WSL Ubuntu-24.04) + CI. mac/Windows koşulmadı; sebep: değişiklik sunucu tarafı (cron/job + DB), istemci platformuna bağlı değil.

## Ne yapıldı

- Saklama **1095 gün**, her satırın kendi `createdAt` değerinden. Yenilenen rıza eski satırı silmez; istisna yok (patron onayı, `NG-366-pm-gnd.md` seçenek B).
- `src/lib/cookie-consent-retention.ts`: sabit, cutoff, tek filtre (`purgeableCookieConsentWhere`, geçersiz cutoff hata fırlatır), `purgeOldCookieConsents()` `withSystemScope('cross-tenant-job', …)` ile. Dönüş yalnız sayı.
- `src/lib/jobs/tasks/cookie-consent-cleanup.ts`: gecelik iş, `40 3 * * *` (03:40 UTC). Loglar: silinen sayı, saklama, cutoff. Satır içeriği loglanmaz. Hata → `error` SystemAlert + yeniden deneme.
- `schedule.ts`, `tasks/index.ts`: işi kaydet. `scripts/tenant-bypass-baseline.json`: gerekçeli `cross-tenant-job` girdisi.
- `docs/DATA_MODEL.md` §34: saklama maddesi.

## Kanıt (ham çıktı)

**Birim (`cookie-consent-retention.test.ts` + job testi):** 6 + 3 test yeşil (toplam ilgili birim 26/26 tüm yeni+ilgili dosyalar).

**Lint / typecheck:** `pnpm lint && pnpm typecheck` → temiz (çıkış 0).

**Canlı DB kurulumu:** `pnpm db:setup` → `DBSETUP_EXIT=0` (izole DB, son adı `fabrika_test_ng366`).

**Canlı RLS testi (`tests/cookie-consent-retention.live.test.ts`):**
```
✓ saklama sabiti 1095 gün
✓ eski satırları siler, taze satırı tutar, sayıyı raporlar
✓ idempotent: ikinci koşu 0 satır
✓ yenilenen rıza eski satırı silmez
Tests 4 passed (4)
```

**Mutant (kırmızı→yeşil):** `lt` → `gt` yapılınca 2 canlı test KIRMIZI (`MUTANT_EXIT=1`); orijinal dosya geri yüklendi (satır 37 `lt`), tekrar yeşil.

**Tam izole gate (`pnpm gate:isolated`):**
```
Test Files  623 passed | 2 skipped (625)
Tests  8970 passed | 68 skipped (9038)
GATE_EXIT=0
```
Bu koşudan önce iki koruma testi (`where-guard-src`, `live-suite-shared-db-guard`) yeni dosyalarımı bilinen listelere eklemediği için düştü; kayıtlar eklendi, 86/86 yeşil, sonra tam gate yeniden koşuldu.

**Push (pre-push kancası tam gate):** İlk denemede `jobs-enqueue-force.live` DB adını (`ng366`) reddetti (kural: `fabrika_test…` ya da `fabrika_gate`). Yerel DB adı `fabrika_test_ng366` yapıldı, `db:setup` yeniden koştu, push yeniden denendi:
```
PUSH_EXIT=0
 * [new branch]        task/ng-366 -> task/ng-366
```

**Uzak doğrulama:** `git ls-remote origin refs/heads/task/ng-366` → `e38c6986f6f840b56ff3662ee0586bd00595e47d refs/heads/task/ng-366` (yerel commit ile aynı).

**PR:** `gh pr view 453` → `isDraft: true`, `baseRefName: dev`, `headRefName: task/ng-366`, `state: OPEN`.

## Değişen dosyalar

- Yeni: `src/lib/cookie-consent-retention.ts`, `src/lib/jobs/tasks/cookie-consent-cleanup.ts`, `src/lib/jobs/tasks/__tests__/cookie-consent-cleanup.test.ts`, `tests/cookie-consent-retention.test.ts`, `tests/cookie-consent-retention.live.test.ts`
- Değişen: `src/lib/jobs/schedule.ts`, `src/lib/jobs/tasks/index.ts`, `tests/jobs-schedule.test.ts`, `tests/live-suite-shared-db-guard.test.ts`, `tests/where-guard-src.test.ts`, `scripts/tenant-bypass-baseline.json`, `docs/DATA_MODEL.md`
- Dokunulmadı: `prisma/rls.sql`, `prisma/schema.prisma`, `src/lib/cookie-consent-record.ts` (NG-367 alanı).

## Riskler

- **NG-371 birleşmeden canlıya çıkmasın.** Kullanıcıya gösterilen çerez metni, bu saklama süresiyle tutarlı olmalı; metin hukuk onayı bekliyor. Bu PR'ı NG-371 olmadan canlıya almak, metinle çelişen bir saklama süresi yaratır.
- **NG-367 çakışması:** NG-367 dev'e girmedi. Aynı tabloya (`CookieConsentRecord`) yazıyorsa `tenant-bypass-baseline.json` ve `DATA_MODEL.md` satırlarında çakışma olabilir; `cookie-consent-record.ts`, `rls.sql` ve system-scope'a dokunmadığım için kod çakışması beklemiyorum.
- **Sunucu kodu:** Gecelik işin gerçek kuyrukta (graphile-worker) çalışması ve cron kaydı yalnız canlı ortamda doğrulanabilir; canlı koşu bu PR'ın birleşmesinden sonra izlenmeli.

## Açık sorular

1. NG-371 birleşme tarihi ne zaman? Canlıya çıkış bu tarihe bağlı.
2. NG-367 dev'e girdiğinde bu PR'da rebase/çakışma çözümü be-gnd tarafından mı yapılsın?

## Sonraki adım

- Lider onayıyla draft PR #453'ü incelemeye aç; NG-371 birleşmesini bekle.
- Birleşme sonrası: worktree ve `task/ng-366` dalını temizle (PR birleşince).
- Geçici izole konteyner `ng366-pg` (DB `fabrika_test_ng366`) PR birleşince kaldırılacak.
