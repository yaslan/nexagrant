# TASK-MVIB70K677R5M (FO-116): CRW-FB bulguları + push + PR (be-fb, 4. tur)

**Hüküm:** BAŞARILI. CRW-FB'nin 1. ve 2. bulgusu kapandı. Dal push edildi, pre-push kapısının tamamı yeşil geçti. PR #147 `dev`'e açık, merge edilmedi.
**Tip:** bug (FO-58 D1 takibi) + teslim (push/PR)
**Platform:** mac (darwin) üzerinde doğrulandı. Değişen kod saf TS; I/O, dosya yolu, süreç ya da kabuk kullanmıyor, bu yüzden Windows ve Linux'ta da aynı davranır. Bu iki platformda koşulmadı, ama platforma bağlı bir kod yolu da yok.
**Dal / worktree:** `be-fb/fo58-partner-search-dev` · `.claude/worktrees/fo58-ps-dev` (origin/dev `0125d91f` + 79cfe31e + f466f378 + **5c4a811c**). Eski `fo58-ps-model` dalına dokunulmadı.

## Ne yapıldı

1. **Bulgu 1: boş adlı kurumlarda anahtar çakışması** (`match-pic.ts` `matchKeyFor`). PIC yoksa ve ham ad da boşsa (`''` ya da yalnız boşluk) fonksiyon artık `null` döner. İki adsız kurumu ayırt edecek bir bilgi yok: ortak bir `name:<ÜLKE>:` anahtarı ikisini tek kayda yazardı, rastgele bir anahtar da her ingest'te yeni satır açardı. Bu yüzden `null` seçtim; K2 bu durumda `UnmatchedOrganization` satırı yazmaz.
   - Dönüş tipi değişti: `matchKeyFor(): string | null` ve `PicMatch.unmatched.matchKey: string | null`. Kodda henüz çağıran yok (`grep` ile bakıldı, yalnız test kullanıyor). Değişiklik DATA_MODEL'de iki maddeye yazıldı: `UnmatchedOrganization` ve "PIC eşleme".
   - `GmbH` gibi, normalize edilince boşalan ama ham hali dolu adlar eskisi gibi ham büyük harf anahtarı alır.
   - Seçim docstring'e ve yeni bir teste yazıldı: `gives no key to an organisation with neither a PIC nor a name`. Test `''` ve `'   '` için `null`, PIC'i olup adı boş olan kurum için `pic:999888777` ve `matchPic` sonucunun `{unmatched, matchKey: null, bestScore: 0}` olduğunu doğrular.
2. **Bulgu 2: aday kapsamı yorumu.** Modül docstring'i ve tam PIC bloğuna eklenen satır iki adımı ayırıyor:
   - Adım 1 (tam PIC) ülkeden bağımsız olarak tüm kurumlara karşı yapılır. K2, kurumu PIC ile ülke filtresi koymadan aramalı.
   - Adım 2 (bulanık) yalnız aynı ülkedeki adayları okur.
   - DATA_MODEL'e de aynı ayrım yazıldı.
3. **Bulgu 3: fark payının birebir skor çiftleriyle testi.** Bu tura istenmediği için yapılmadı. Mevcut fark payı testleri davranışı kapsıyor. PR açıklamasında açıkça belirtildi.
4. Commit `5c4a811c`: `fix(m1): no matchKey for a nameless, PIC-less organisation; document candidate scope per step (FO-116)`. Yalnız şu 3 dosya: `git commit -- <yollar>`.
5. Push ve PR: izole DB'ye karşı normal pre-push kapısı koştu (`--no-verify` kullanılmadı), sonra `gh pr create --base dev`.

## Kanıt (ham çıktı)

### Hedefli testler, lint, typecheck
```
$ perl -e 'alarm 900; exec @ARGV' pnpm exec vitest run src/modules/m1/server/partner-search tests/rls-coverage.test.ts tests/api/api-error-body-guard.test.ts
 Test Files  3 passed (3)
      Tests  81 passed (81)
VITEST_EXIT=0

$ pnpm lint && pnpm typecheck
✖ 4 problems (0 errors, 4 warnings)     # uyarıların hepsi daha önce vardı, ilgisiz dosyalarda (ör. tests/settings-profile-update.test.ts)
$ tsc --noEmit
LINT_TC_EXIT=0
```

### Commit
```
5c4a811c fix(m1): no matchKey for a nameless, PIC-less organisation; document candidate scope per step (FO-116)
docs/DATA_MODEL.md
src/modules/m1/server/partner-search/match-pic.test.ts
src/modules/m1/server/partner-search/match-pic.ts
```

### Migration up/down (izole `fo116-pg`, pgvector:pg16, `localhost:5616/fabrika`)
```
pnpm db:setup → setup1 exit=0 · setup2 exit=0 (2. koşuda 174 "already exists, skipping")
-- before:     tables=6 cordis_ps_cols=3 policies=PartnerSearchQuotaUsage:system_scope,PartnerSearchQuotaUsage:tenant_isolation
==> [down] add-partner-search.down.sql
apply-migrations: rolled back with add-partner-search.down.sql as fabrika
down exit=0 · down2 exit=0
-- after-down: tables=0 cordis_ps_cols=0 policies=-
up1 exit=0 · up2 exit=0
-- after-up:   tables=6 cordis_ps_cols=3 policies=PartnerSearchQuotaUsage:tenant_isolation
PartnerSearchQuotaUsage rls=true force=true; diğer 5 tablo rls=false force=false
pnpm db:rls → ✅ prisma/rls.sql applied. Policies in public: 115 → 116   (system_scope rls.sql'den gelir)
```

### RLS
```
rls:check exit=0 — ✅ All 48 tenant-scoped models have RLS policies registered.
rls:verify --require-db exit=0
Kiracıya özel model: 48 · RLS açık tablo: 56 · tenant_isolation politikası: 48
RLS açık + 0 politika (deny-all): 0 · RLS kapalı + anon/authenticated erişimi: 0
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
✅ 48 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

### Push (pre-push = tam `pnpm gate`)
Load ilk ölçümde 14.24'tü, 11.18'e düşmesi beklendi. Komut: `E2E_PORT=3916 git push -u origin be-fb/fo58-partner-search-dev` (3916 portunun boş olduğu `lsof` ile doğrulandı).
```
→ veritabanı: localhost:5616/fabrika
 Test Files  368 passed | 7 skipped (375)
      Tests  4891 passed | 120 skipped (5011)
✅ i18n check passed
✅ SUCCESS (rls:check ×3, rls:bypass-check)
✅ 48 kiracıya özel tabloda ... izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
  380 passed (10.1m)   9 skipped        # e2e
✅ Öksüz alarm yok
 * [new branch]        be-fb/fo58-partner-search-dev -> be-fb/fo58-partner-search-dev
PUSH_EXIT=0
```
Kapıda hiç kırmızı test yok (`N failed` satırı 0), yük kaynaklı kırmızı da çıkmadı. E2E web sunucusunun `process.exit … Edge Runtime` uyarıları daha önce de vardı ve testi kırmıyor.

### PR
```
$ gh pr list --head be-fb/fo58-partner-search-dev
147	feat(m1): partner search data model, migration and PIC matching (FO-58, FO-116)	be-fb/fo58-partner-search-dev	OPEN	2026-10-21T20:57:10Z
```
URL: https://github.com/yaslan/fonbridge/pull/147. PR açıklamasında migration up/down ve rls:verify kanıtı, kapı özeti ve CRW-FB onayları var (`TASK-MVCH1YZXDOED-crw-fb.md`, `TASK-MVIB70K677R5M-crw-fb.md`). Merge yapılmadı.

## Değişen dosyalar
- `src/modules/m1/server/partner-search/match-pic.ts`
- `src/modules/m1/server/partner-search/match-pic.test.ts`
- `docs/DATA_MODEL.md`
- (repo dışı / gitignored) worktree `.env`: izole DB'yi gösteriyor, commit edilmedi.

## Riskler
- K2 entegrasyonu: `matchKey` artık `null` olabilir. Ingestor null anahtarla `UnmatchedOrganization` yazmamalı. Şemada `matchKey String @unique` alanı null kabul etmez, bu yüzden null'u yazmaya kalkarsa sessiz kalmaz, hata verir. Bu kural DATA_MODEL'de yazılı.
- K2, tam PIC araması için adayları ülkeye göre süzerse başka ülkede kayıtlı bir PIC'i kaçırır. Bu davranış artık docstring'de ve DATA_MODEL'de açıkça yazıyor.

## Açık sorular
- Bulgu 3 (fark payı için 0.95/0.93 ve 0.97/0.80 skor çiftleriyle testler) ayrı ve küçük bir iş olarak açılsın mı? Lider karar verir.

## Ortam / temizlik
- Bu turda yeni izole konteyner `fo116-pg` (5616) kuruldu, iş bitince `docker stop` ile durduruldu (silinmedi). Önceki tur konteyneri `fo58-psdev-pg`'de `fabrika_app` parolası bilinmiyordu ve rollback bağımlı nesneler yüzünden çalışmadı, bu yüzden yeni konteyner kuruldu. `fo58-psdev-pg` de durdurulmuş halde duruyor. İkisi de `docker rm -f` ile silinebilir.

## Sonraki adım
- PR #147'nin incelenmesi ve merge kararı (lider/patron). Sonra K2 ingestor'un `matchPic`'e bağlanması.

## Hafıza
Yazıldı: önceki turdan kalan izole konteynerde `.env` bulunmadığında `fabrika_app` parolası kaybolur ve rollback çalışmaz. En hızlı çözüm yeni bir konteyner kurmak (`fabrika-reused-pg-container-rls-role-lost`).
