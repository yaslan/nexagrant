---
sözleşme: 3
görev: TASK-MUOGMQK3JAH4Y
kod: TASK-MUOGMQK3JAH4Y
ajan: be-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: fabrika_app düz SET / PGOPTIONS / sahte ya da yeniden oynatılmış mühürle 0 satır görüyor (önce: tüm kiracılar); düzeltme 5392550d dev'de (b2227b55), dev 0779e8f8 üzerinde temiz DB'de zincir ×2 + rls:verify + 53 hedef test yeşil, 3 DB mutantından 2'si KILLED, 1'i fabrika_app için eşdeğer.
platform: macOS, izole pgvector/pgvector:pg16 konteyneri (CI ile aynı kimlik bilgileri, CI=true). Tarayıcı/e2e koşulmadı: değişiklik yalnız DB politikası ve UI yüzeyi yok.
sürüm: 1
tarih: 2026-09-30T20:19:32.060Z
---

# FB GÜVENLİK (İNCELEME-115 Ö-1) — imzalı system_scope: fabrika_app düz SET/PGOPTIONS ile kiracı yalıtımını açamaz

## 1. Ne yapıldı
- **Düzeltme (önceki oturum, commit `5392550d`, dal `be-fb/o1-system-scope` → dev merge `b2227b55`):** `system_scope` politikası artık `(SELECT system_scope_open(tbl))` koşuluna bağlı. Koşul: `app.system_scope='on'` **VE** (çağıran tablo sahibinin yetkilerine sahip **VEYA** `app.system_scope_token` bu işlemin mührü). Mühür şu değerlerin SHA-256'sı: sır, `pg_backend_pid`, `transaction_timestamp`. Sır `fabrika_private.system_scope_key` içinde duruyor ve yalnız sahip okuyabiliyor. Mührü `enter_system_scope(purpose)` yazıyor. `rls.sql`'deki yanlış yorum (eski 122-127: "only way… / REVOKE EXECUTE closes the door") düzeltildi. ADR-0009 ve RELEASE_CHECKLIST §3.1 madde 4 notu eklendi. `rls:verify` üç sahte kapsam sondası kazandı. Testler: `system-scope.live` +9, `rls-coverage` +1.
- **Bu oturum:** Kartta sonuç raporu yoktu ve kart `in_progress`'te kalmıştı. Düzeltme dev HEAD `0779e8f8` üzerinde temiz bir DB'de baştan doğrulandı. Ayrıca DB düzeyinde 3 mutant koşuldu ve rapor yazıldı.

## 2. Kanıt
Ortam: ayrı worktree (dev `0779e8f8`, `git merge-base --is-ancestor 5392550d HEAD` → contains-fix), yeni `pgvector:pg16` konteyneri, CI sırası.
```
prisma db push → db:rls-role → apply-migrations.sh → PASS1 OK → apply-migrations.sh → PASS2 OK → db:rls → db:seed → PREP_OK (rc=0)
```
`pnpm rls:verify` (exit 0), ölçüm rolü fabrika_app (rolsuper=false, rolbypassrls=false):
```
✓ kapsam (pozitif): enter_system_scope ile ConsortiumSeat tablosunda 4 satır göründü (tabloda 4)
✓ sahte kapsam (set_config('app.system_scope','on',true)): 14 dolu tablonun hepsi 0 satır döndü
✓ sahte kapsam (SET app.system_scope = 'on' (oturum; PGOPTIONS/options= ile aynı)): 14 dolu tablonun hepsi 0 satır döndü
✓ sahte kapsam (önceki işlemin mührü yeniden oynatıldı): 14 dolu tablonun hepsi 0 satır döndü
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```
`pnpm rls:check` → exit 0. `vitest run tests/system-scope.live.test.ts tests/rls-coverage.test.ts tests/migration-owner-chain.live.test.ts` → **3 dosya, 53/53 geçti**.

**Elle saldırı, fabrika_app olarak psql ile (ConsortiumSeat, gerçekte 4 satır):**
| Saldırı | Sonuç |
|---|---|
| `SET app.system_scope='on'` | 0 |
| `PGOPTIONS='-c app.system_scope=on'` (bayrak `on` görünüyor) | 0 |
| PGOPTIONS + sahte `app.system_scope_token` | 0 |
| önceki işlemin geçerli mührünü yeni işlemde `set_config` ile yeniden oynatma | 0 |
| `select * from fabrika_private.system_scope_key` | `permission denied for schema fabrika_private` |
| meşru yol: `begin; select enter_system_scope('platform-aggregate'); count` | **4** |

**DB mutantları** (scratch DB'de `CREATE OR REPLACE`, her birinden sonra `db:rls` ile geri yüklendi):
| Mutant | system-scope.live | rls:verify | Hüküm |
|---|---|---|---|
| M1 `system_scope_sealed()` hep true (yalnız bayrak açar = eski delik) | 8 failed / 16 | exit 1 | KILLED |
| M2 mühürden `transaction_timestamp` çıkarıldı (yeniden oynatılabilir) | 1 failed / 16 | exit 1 | KILLED |
| M3 `system_scope_open` bayrak kontrolünü düşürdü | 16/16, owner-chain + coverage 37/37 | exit 0 | SURVIVED (fabrika_app için eşdeğer, aşağıya bkz.) |
| Geri yükleme | 16/16 | exit 0 | fonksiyon tanımında bayrak koşulu var (grep 1) |

## 3. Değişen dosyalar
Bu oturumda kod değişmedi, yalnız bu rapor yazıldı. Düzeltme `5392550d`'de: `prisma/rls.sql`, `prisma/migrations/auditevent-null-system-only.sql`, `scripts/check-rls-live.ts`, `src/lib/system-scope.ts`, `tests/system-scope.live.test.ts`, `tests/rls-coverage.test.ts`, `docs/adr/ADR-0009-signed-system-scope.md`, `docs/RELEASE_CHECKLIST.md`.

## 4. Riskler
- **M3 yaşıyor.** fabrika_app için eşdeğer, çünkü mühür yalnız `enter_system_scope` ile oluşuyor ve bu fonksiyon bayrağı da açıyor; bayraksız geçerli mühür elde edilemiyor. Değişen tek şey sahip rolü: M3 altında sahip bayraksız okumada tüm satırları görür. Sahip `NO FORCE` ile bunu zaten yapabildiği için yetki kazancı yok. Ancak "FORCE RLS altında sahip, kapsamsız okumada 0 görür" davranışı testle kilitli değil. Bu davranışa dayanan down/migration koruma notları var (bkz. İNCELEME-115 down dosyası bulgusu).
- Yayın: `fabrika_private.system_scope_key` her `db:rls` koşusunda korunmalı ya da yeniden üretilmeli. Açık işlemlerin mühürleri işlem sonunda zaten geçersizleşiyor, bu yüzden anahtar dönüşü güvenli; yine de canlıda ilk `db:rls` RELEASE_CHECKLIST §3.1'e göre sahip rolüyle koşulmalı.

## 5. Açık sorular
- M3 için "sahip rolü (NOSUPERUSER NOBYPASSRLS), bayrak kapalı → 0 satır" testi eklensin mi? Küçük bir iş (`migration-owner-chain.live`'a tek test). İstenirse ayrı kart açılabilir.

## 6. Sonraki adım
Bağımsız inceleme (crw-fb / crw2-fb): 5392550d + bu raporun mutant tablosu. Push, TASK-MUMACETT8NSI4 ile birlikte (1 Ekim).
