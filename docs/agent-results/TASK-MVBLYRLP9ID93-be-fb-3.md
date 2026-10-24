---
sözleşme: 3
görev: TASK-MVBLYRLP9ID93
kod: TASK-MVBLYRLP9ID93
ajan: be-fb
motor: claude
tip: hata
okur: kullanıcı
hüküm: Kısmen bitti: M1, m3 ve m4 kodda uygulandı, izole DB'de RLS kapıları yeşil; push ise pre-push gate'te reddedildi (exit 1), çünkü origin/dev'in kendisinde de kırmızı olan admin-blog-rich-editor.spec.ts:157 testi başarısız — uzak dal 62f7353d'de kaldı, merge yapılmadı.
platform: mac (darwin, arm64) ile doğrulandı. Windows ve Linux koşulmadı; değişiklik yalnız SQL/RLS ve TS sunucu mantığı, platforma bağlı kod yolu yok.
sürüm: 1
tarih: 2026-10-19T11:17:38.186Z
---

# FO-26 — crw-fb M1/m3/m4 kapanışı, izole RLS kapıları, push (dev'deki blog testi nedeniyle reddedildi)

## Kararlar

```karar
kimlik: karar-1
soru: origin/dev'de başarısız olan admin-blog-rich-editor.spec.ts:157 ("a paste from Word keeps only what the site shows") yüzünden FO-26 push'u gate'te takılıyor. Nasıl ilerleyelim?
seçenek: A | Blog editörünün sahibi (fe-fb) testi/kodu düzeltir, dev yeşile döner, sonra FO-26 aynı gate ile push edilir
seçenek: B | Lider, dev'deki bu testi kapı kuralı değişikliğiyle geçici olarak dışlar; FO-26 o zaman push edilir
öneri: A
karar_kimligi: K-569965
```

## Ne yapıldı

- **crw-fb M1 (RLS):** `ExpertPreRegAttempt` RLS açık, tek politika `system_scope`; `SYSTEM_SCOPE_POLICY` (`scripts/rls-models.ts`) ve `prisma/rls.sql` bloğu aynı. Migration yorumu ve `docs/DATA_MODEL.md` buna göre düzeltildi. Commit'ler: e7bafd79, d8b97f7e.
- **m3 (cooldown testi):** `register.test.ts` "lets the cooldown read lastSubmittedAt, not the link issue time, when the two differ" — `lastSubmittedAt` ile `verifyTokenExpiresAt − TTL` ayrışıyor; test bunu doğruluyor.
- **m4 (DATA_MODEL):** ExpertPreRegAttempt maddesi 24 saatlik saklamayı açıkça söylüyor; "saklama açık karar" maddesi ExpertPreRegistration için yazılmış.
- **m2:** Dokunulmadı. Soğuma ve günlük kota 429'ları deneme yazmıyor; DATA_MODEL'de bilinçli istisna olarak duruyor — **açık, patron kararı**.
- **FO-52 etkileşimi (d8b97f7e):** `public-intake` amacı artık üç tabloyu açıyor: ExpertPreRegistration, ExpertFounderCounter, ExpertPreRegAttempt. Gerekçe: FO-52 (K-569554 = C) amaç→tablo kilidi "anonim uzman formunun tabloları" diye tanımlıyor; ExpertPreRegAttempt bu formun kendi IP sayacı ve yalnız `register.ts`'te, `public-intake` kapsamında yazılıyor. Yani kilit kavramıyla tutarlı. Liste üç yerde tutuluyor (`prisma/rls.sql` `system_scope_open`, `scripts/check-rls-live.ts` `PUBLIC_INTAKE_TABLES`, `src/lib/system-scope.ts` amaç yorumu); yeni tablo eklenirse üçü birlikte güncellenmeli. `rls:verify` bunu doğruladı (aşağıda).

## Kanıt (ham çıktı)

İzole DB: Homebrew PG16 geçici küme, `localhost:55321/fabrika`. Paylaşılan :5433 yalnız `pg_dump --schema-only` ile okundu, değiştirilmedi. Şema dump'ı 0 ERROR ile yüklendi.

```
pnpm db:rls            → ✅ prisma/rls.sql applied. Policies in public: 117 → 117   (exit 0)
pnpm rls:check         → CHECK 4c ✅ SUCCESS: every one of them DISABLEs row level security ... (BlogPost, ExpertPreRegistration, PublicLead)
pnpm rls:bypass-check  → ✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed ..., 44 on the sanctioned cross-tenant path, 0 still owed.
pnpm rls:verify --require-db →
  Kiracıya özel model: 47 · RLS açık tablo: 57 · tenant_isolation politikası: 48
  ⚠ DATABASE_URL rolü fabrika (rolsuper=true) → ölçüm rolü fabrika_app (rolsuper=false, rolbypassrls=false)
  ✓ ExpertPreRegistration: sistem kapsamı dışında okuma 0 satır / INSERT reddedildi
  ✓ public-intake: 51 system_scope tablosunda kapsam dışıyla aynı satır sayısı (yalnız ExpertPreRegistration, ExpertFounderCounter, ExpertPreRegAttempt açık)
  ✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

Tam pre-push gate (`git push` → hook `githooks/pre-push` → `pnpm gate`; `--no-verify` kullanılmadı):

1. **İlk deneme (seed'siz DB):** vitest 8 test başarısız (`Plan not found: free`, `Plan plan-pro is not available to this tenant (not-visible)`) — eksik seed, kod sorunu değil. `pnpm db:seed` çalıştırıldı; `pilot.test.ts` + `cron-tenant-scope.test.ts` 30/30 geçti.
2. **İkinci deneme (seed'li):**
```
 Test Files  361 passed | 7 skipped (368)
 Tests  4784 passed | 120 skipped (4904)
 ✅ i18n check passed ...
 ✘   25 [chromium] › tests/e2e/admin-blog-rich-editor.spec.ts:157:7 › ... a paste from Word keeps only what the site shows ...
   Error: expect(locator).toHaveText(expected) failed   Expected: "Word başlığı"   Error: element(s) not found
   1 failed
   375 passed (10.0m)
error: failed to push some refs to 'https://github.com/yaslan/fonbridge.git'
push exit=1
```
3. **Tek başına yeniden koşu (FO-26 dalı):** aynı test `1 failed / 1 passed`, hata aynı.
4. **Temiz origin/dev (3a7b627f; geçici worktree, gerçek `pnpm install --frozen-lockfile`):** aynı test aynı hatayla başarısız → **dev'de zaten kırmızı, FO-26 kaynaklı değil.** Geçici worktree kaldırıldı, izole küme durduruldu.

Not: `pnpm test:e2e -- <dosya>` dosya filtresini yok saydı ve tüm paketi koşturup `perl alarm 900` ile öldü; o koşu sonuç vermez.

## Değişen dosyalar (origin/dev...HEAD, 15 dosya)

Yalnız `src/lib/expert-prereg/**`, `prisma/` (migration, rls.sql, schema), `scripts/rls-models.ts`, `scripts/check-rls-live.ts`, `src/lib/system-scope.ts`, `docs/DATA_MODEL.md` ve ilgili testler. Blog/editör dosyası yok.

## Riskler

- **Dev'deki blog testi tüm push'ları gate'te durduruyor.** FO-26 dışında bir değişiklik olmadan bu dal yayınlanamaz.
- **node_modules:** Baseline denemesinde geçici worktree, FO-26 worktree'sinin `node_modules`'ünü gösteren bir symlink ile `pnpm exec` çalıştırdı (hafıza notu: symlink'li ortamda pnpm hedef node_modules'ü değiştirebiliyor). Symlink kaldırılıp gerçek install yapıldı; FO-26'nın node_modules'ünün etkilenip etkilenmediği **doğrulanmadı** — lider bilsin.
- **Paylaşılan :5433 DB'ye dokunulmadı**; yalnız salt okunur dump alındı.
- **Platform:** yalnız mac; Windows/Linux koşulmadı.

## Açık sorular

- Yukarıdaki karar: blog testinin düzeltilmesi (A, önerilen) ya da lider onaylı geçici dışlama (B).
- m2: patron kararı (soğuma/kota 429'ları sayılsın mı).

## Sonraki adım

- Karar A ise: fe-fb blog testini düzeltir → dev yeşil → FO-26 `git push origin be-fb/fo26-attempt-counter` (gate tam koşar) → PR #95 güncellenir. Merge yok.
- Push'tan sonra gate sonucunu bu rapora ekle.
