---
sözleşme: 3
görev: TASK-MUPYHVSBW47GD
kod: TASK-MUPYHVSBW47GD
ajan: be-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: düzeltme devop-fb'nin a617188a'sıyla dev'de ve canlıda; temiz PG16'da doğrulandı, eksik kapsam testi dev'e merge edildi (1d2c54f3), EXCEPTION bloğu karar gereği eklenmedi.
platform: mac (Darwin 27, Homebrew PostgreSQL 16.15 + pgvector 0.8.1, yalıtılmış scratch küme :55341). Değişiklik yalnız SQL + vitest; platforma bağlı kod yolu yok. Linux CI aynı adımları koşar (ci.yml); Windows koşulmadı (proje CI'ı Linux, apply-migrations.sh bash betiği). Canlı Supabase'e BAĞLANILMADI.
sürüm: 1
tarih: 2026-10-01T20:13:32.461Z
---

# 5 migration fonksiyonunda app.system_scope: gövde içi set_config (Supabase uyumu)

## 1. Ne yapıldı

- **Çift atama tespit edildi.** Dal `be-fb/supabase-system-scope` (taban `dev` 26f8121c) üzerinde 9 fonksiyon tanımını (5 ileri + 2 down dosyası) gövde içi `set_config` + her çıkışta geri yüklemeye çevirdim. `apply-migrations.sh` ön kontrolünden `SET ON PARAMETER` şartını kaldırdım, `migration-owner-grant.sql`'i emekliye ayırdım ve testleri yazdım. Bu sırada `dev` ilerledi: devop-fb aynı işi TASK-MUOG51GJ3PUOG altında `a617188a` ile yapmış, `ff177df7` ile dev'e merge etmiş ve canlı Supabase'de koşmuş (`63bed6a5`: 41 migration + rls:verify exit 0).
- İki uygulama neredeyse aynı. Tek fark: devop-fb'de `EXCEPTION … geri yükle; RAISE;` bloğu yok.
- **Karar:** ikinci bir uygulamayı dev'e itmedim. Canlıdaki fonksiyonlarla repo farklılaşırdı ve ölçülebilir hiçbir şey kazanılmazdı (aşağıda D4). Benim özgün işim `be-fb/supabase-system-scope-v1-ozgun` dalında (9e0d29f6) referans olarak duruyor. `be-fb/supabase-system-scope` dalını yeni `dev`'e (63bed6a5) taşıdım. Üstüne **yalnız eksik kapsamı dolduran bir test** ekledim: `91e93717`.
- **Eklenen test** (`tests/migration-owner-chain.live.test.ts`, NOSUPERUSER/NOBYPASSRLS sahip rolünün fonksiyonları, `fabrika_app` ile koşar): *"definer functions put the caller's app.system_scope back on every exit, and tenant A still sees no row of B"*
  - Çağıranın değeri unset, `'off'` ve `'on'` iken: normal çıkış (funnel, province), erken `RETURN` (redeem) ve **hata yolu** sonrasında değer birebir geri dönüyor. Hata yolu şöyle kuruldu: `SystemAlert` üzerinde hata fırlatan bir tetikleyici. Hata, fonksiyon kapsamı açtıktan sonra fırlıyor ve hata mesajı `scope probe: on` olarak orijinal haliyle dışarı çıkıyor.
  - İşlem **COMMIT** ile bitiyor, sonrasında bayrak yok. ROLLBACK, oturum düzeyi `set_config`'i gizliyordu.
  - `fabrika_app` için `has_parameter_privilege` false. `CREATE FUNCTION … SET app.system_scope` → `permission denied to set parameter`. Düz `SET app.system_scope='on'` ile `Membership` 0 satır döner.
  - Ajans bağlamı üye satırını görmüyor. Kiracı A yalnız `lm-a`'yı görüyor, `lm-b`'yi hiç görmüyor.

## 2. Kanıt

**Temiz DB'de zincir** (dev 63bed6a5 kodu; `docs/agent-results/TASK-MUPYHVSBW47GD-be-fb-ekler/temiz-db-zincir.txt`):
```
### db:rls-role       ✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
### apply-migrations #1  exit=0  apply-migrations: 41 files applied as fabrika
### apply-migrations #2  exit=0  apply-migrations: 41 files applied as fabrika
### db:rls            ✅ prisma/rls.sql applied. Policies in public: 28 → 112
### rls:verify        exit=0  ✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
### definer proconfig
agency_funnel_counts | search_path=public, pg_temp
agency_funnel_counts_by_province | search_path=public, pg_temp
note_agency_invite_rejection | search_path=public, pg_temp
redeem_agency_invite | search_path=public, pg_temp
funcs with app.* in proconfig: 0
```
**Süper kullanıcı olmayan sahip zinciri:** owner-chain 12/12 yeşil, parametre yetkisi yok (`ekler/owner-chain-12.txt`).

**İlgili suite'ler** (seed sonrası, `CI=true`): agency-funnel / agency-invite / agency-report / oauth-registration (live + unit) / system-scope / rls-coverage / migration-owner-chain → `Test Files 8 passed (8) · Tests 131 passed (131)`.

**`npx tsc --noEmit`:** exit 0, çıktı yok.

**grep:** `grep -rnE "^[[:space:]]*SET[[:space:]]+app\." prisma/migrations` → eşleşme yok (exit 1). `grep -rn "SET app\." prisma/migrations` 11 satır döner ve hepsi yorum satırı (yorum dışı eşleşme sayısı 0).

**Mutantlar** (dev kodunda; her biri dosyada uygulandı, `git checkout` ile geri alındı, `git diff --quiet` temiz; `ekler/mutantlar.txt`):

| Mutant | Sonuç | Yakalayan |
|---|---|---|
| D1 redeem `set_config('on', false)` (oturum düzeyi) | KILLED | **yalnız yeni test**. devop-fb'nin testi geçiyordu (ROLLBACK ile bitiyor) |
| D2 funnel `set_config('on', false)` | KILLED | **yalnız yeni test** |
| D3 note: `EXCEPTION WHEN OTHERS THEN RETURN` (hatayı yutar) | KILLED | yeni test |
| D4 note: kartın tarif ettiği `EXCEPTION … geri yükle; RAISE;` eklemek | 12/12 geçer, davranış farkı yok | eşdeğer |

Özgün dalımda (v1) da aynı sonuç çıktı: handler'daki geri yüklemeyi silen mutant yaşadı. Fonksiyon hata ile çıktığında PostgreSQL ya işlemi ya da çağıranın savepoint'ini geri alır. Bu alt-işlem geri alması `set_config(..., true)` değişikliğini de kendiliğinden geri döndürür. Hatanın yakalanmadan dışarı sızdığı bir yol yok.

**Kırmızı ama ilgisiz:** Tam vitest'te 9 test kırmızı: `settings-profile-update.test.ts` ×8, `server-action-rbac-guard.test.ts` G6, `e2e-profile-save.spec.ts` (vitest'e alınmış bir Playwright dosyası). Aynı 9 test taban `dev`'de, ayrı bir detached worktree'de de kırmızı. Bu iş bu dosyalara dokunmuyor.

## 3. Değişen dosyalar
- `tests/migration-owner-chain.live.test.ts` (+95 satır, commit `91e93717`, dal `be-fb/supabase-system-scope`)
- Rapor ve ekler: `docs/agent-results/TASK-MUPYHVSBW47GD-be-fb.md`, `…-be-fb-ekler/{temiz-db-zincir,owner-chain-12,mutantlar}.txt`
- Referans dalı (merge edilmeyecek): `be-fb/supabase-system-scope-v1-ozgun`

## 4. Riskler
- **Kart DoD'si ile fark:** kart "EXCEPTION'da eski değere geri yükle + RAISE" istiyor, dev'deki kodda bu blok yok. Davranış olarak eşdeğer (D4). Bloğu eklemek her çağrıya bir alt-işlem ekler. Ayrıca canlı Supabase'deki fonksiyon tanımı, zincir yeniden koşulana kadar repodan farklı kalır.
- Yeni testin oturum düzeyi kontrolü yalnız `fabrika_app` bağlantısında ölçülüyor. Bağlantı havuzu (pgbouncer/Supavisor transaction modu) ayrıca ölçülmedi. Fonksiyonlar `is_local=true` kullandığı için havuz modundan bağımsız olması beklenir.
- Yalıtım gevşemedi. `system_scope_open()` fabrika_app için hâlâ mühür istiyor, bunu test ölçüyor (düz SET → 0 satır).

## 5. Açık sorular
- **Lider/patron:** kartın birebir DoD'si için `EXCEPTION … RAISE` bloğu yine de eklensin mi? Önerim: **eklenmesin**. Ölçülmüş bir eşdeğer, canlıyla repo farklılaşmasın. Eklenecekse v1 dalındaki desen hazır.
- Aynı kart iki ajana (devop-fb TASK-MUOG51GJ3PUOG, be-fb TASK-MUPYHVSBW47GD) gitmiş. Pano tarafında not alınmalı.

## 6. Sonraki adım
- Test commit'i (`91e93717`) inceleme sonrası dev'e merge edilebilir. Push/merge yapılmadı.
- se-fb/crw güvenlik incelemesi devop-fb'nin a617188a'sı için zaten gerekiyor. Bu test o incelemenin kanıtına eklenebilir.

## 7. Karar ve merge (01.10.2026)

- **Karar (kullanıcı):** EXCEPTION bloğu eklenmeyecek. dev'deki a617188a uygulaması olduğu gibi kalıyor.
- Test dalı yerel `dev`'e merge edildi: `1d2c54f3` (`be-fb/supabase-system-scope` → 91e93717). Push edilmedi.
- Merge sonrası `dev` (1d2c54f3) üzerinde koşu: migration-owner-chain + agency-invite + agency-funnel + system-scope live → `Test Files 4 passed (4) · Tests 60 passed (60)`. `npx tsc --noEmit` exit 0.
