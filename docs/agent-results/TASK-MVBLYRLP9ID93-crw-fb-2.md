---
sözleşme: 3
görev: TASK-MVBLYRLP9ID93
kod: TASK-MVBLYRLP9ID93
ajan: crw-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: Onay. M1, d8b97f7e, m3 ve m4 doğru kapanmış, bloke eden bulgu yok; iki öneri ve bir sürüm notu var.
platform: mac (darwin) üzerinde doğrulandı: izole Postgres konteyneri (pgvector:pg16, 127.0.0.1:55496) ve worktree'ye özel node_modules kullanıldı. Linux ve Windows'ta koşulmadı. Değişiklik SQL/RLS ve Node sunucu kodudur; süreç, dosya yolu, kabuk ya da ekran bağımlılığı yoktur, davranış platforma bağlı değildir.
sürüm: 1
tarih: 2026-10-19T14:53:42.245Z
---

# FO-26 · TASK-MVBLYRLP9ID93 — PR #95 delta yeniden incelemesi (crw-fb, 2. tur)

**Hüküm: ONAY.** Bloke eden bulgu yok. Kod değiştirilmedi, merge edilmedi.

**Kapsam:** `62f7353d → b9748eb8`. Merge commit'leri (`3ce5ee84`, `b9748eb8`) ve dev'den gelen #115/#116/#118 içeriği ayıklandı. İncelenen FO-26 commit'leri:
- `e7bafd79`: M1 + m3 + m4
- `d8b97f7e`: public-intake listesine ExpertPreRegAttempt eklendi

GitHub API kullanılmadı; `git fetch origin be-fb/fo26-attempt-counter dev` ve `git diff` ile çalışıldı.

## Ne yapıldı

| # | Kontrol | Sonuç |
|---|---|---|
| 1 | **M1:** RLS açık mı, tek `system_scope` politikası var mı; rls.sql, rls-models, migration ve DATA_MODEL tutarlı mı | ✅ Kapandı |
| 2 | **d8b97f7e:** public-intake ↔ FO-52 kilidi (K-569554=C); rls.sql, check-rls-live ve system-scope.ts listeleri eş mi | ✅ Uyumlu, 3 liste eş |
| 3 | **m3:** cooldown testi lastSubmittedAt'i ayırt ediyor mu (mutant) | ✅ Mutant kırmızı |
| 4 | **m4:** DATA_MODEL maddesi doğru tabloda mı | ✅ |
| 5 | **be-fb-4 canlı kanıtı** kodla tutarlı mı | ✅ Tutarlı (iki not var) |

### 1. M1: ExpertPreRegAttempt RLS
- `prisma/rls.sql`: tablo DISABLE döngüsünden çıkarıldı. ExpertPreRegistration bloğunun altına `ENABLE` + `DROP POLICY IF EXISTS` + tek `CREATE POLICY system_scope` (USING ve WITH CHECK = `system_scope_open(...)`) eklendi. Blok `to_regclass` koruması içinde, yani tablo yokken atlanır.
- `scripts/rls-models.ts`: tablo SYSTEM_WIDE'da kalıyor ve `SYSTEM_SCOPE_POLICY`'ye eklendi. Bu yüzden `policylessSystemWide()` artık onu içermiyor. `rls-coverage` testi "DISABLE döngüsü = policylessSystemWide()" eşitliğini zaten sabitliyor.
- Migration: `system_scope_open` fonksiyonu varsa ENABLE + politika kurar, yoksa DISABLE + NOTICE. İki dalda da deny-all durumu kalmaz. `apply-migrations.sh` son kontrolü "RLS açık + politikasız" tablo arar; bu tablo iki dalda da o kontrole takılmaz.
- `tests/rls-coverage.test.ts:390`: beklenti `['BlogPost','ExpertPreRegistration','PublicLead']` oldu. Migration'da artık doğrudan bir DISABLE satırı yok; aynı dosyada CREATE POLICY olduğu için CHECK 4c tabloyu "politikalı" sayar. `rls:check` çıktısı bunu doğruluyor (aşağıda).
- DATA_MODEL:989, "RLS açık, tek politika system_scope" diyor ve yukarıdakiyle aynı.
- Canlı katalog (izole DB, CI hazırlık sırası): `ExpertPreRegAttempt | rls=t | system_scope`.

### 2. d8b97f7e ↔ FO-52 (K-569554=C)
FO-52'nin kararı, public-intake'in **yalnız uzman formunun tablolarını** açmasıdır. ExpertPreRegAttempt, aynı formun `register.ts` içinde aynı `withSystemScopeOn(db,'public-intake',…)` transaction'ında yazdığı sayaçtır. Yani karar kapsamında, ExpertFounderCounter ile aynı gerekçeyle listeye giriyor; kilit genişlemiyor. Liste eşliği:

- `prisma/rls.sql:325-327` `system_scope_open`: ExpertPreRegistration, ExpertFounderCounter, ExpertPreRegAttempt
- `scripts/check-rls-live.ts:631` `PUBLIC_INTAKE_TABLES`: EXPERT_TABLE, ExpertFounderCounter, ExpertPreRegAttempt
- `src/lib/system-scope.ts:110` doküman yorumu: aynı üç tablo

Commit gerekçesi de doğru. d8b97f7e olmasaydı RLS açık tabloda 409 yolundaki `create` WITH CHECK'e takılırdı; pencere sayımı da 0 okuyup IP sınırını sessizce kaldırırdı. Aşağıdaki mutantla ölçtüm.

### 3. m3 mutantı
Eski formüle döndürdüm: `register.ts:195`'ten `existing.lastSubmittedAt?.getTime() ??` satırını sildim.

```
× lets the cooldown read lastSubmittedAt, not the link issue time, when the two differ
AssertionError: expected { kind: 'created' } to deeply equal { kind: 'rate_limited' }
Tests  1 failed | 25 passed (26)
```
Dosyayı geri aldım; `git status` temiz. Test artık iki zamanı ayırt ediyor: bağlantı 2 saat önce verilmiş, son gönderim 1 dk önce.

### 4. m4
DATA_MODEL:990 maddesi artık `ExpertPreRegistration` saklaması: açık karar başlığını taşıyor ve ExpertPreRegAttempt'in 24 saatlik saklamasına ayrıca atıf yapıyor. Doğru tabloda.

### 5. be-fb-4 canlı kanıtı
- **A senaryosu.** 1. istek yeni satır açar (pencere 1). 2–5. istekler 409 döner ve her biri bir attempt yazar (`register.ts:185`). 5. istekte sayım 4 olduğu için geçer; 6. istekte sayım 1+4=5 ≥ `REGISTRATION_IP_LIMIT` ve 429 döner (`register.ts:162-165`). `attempts_total = 4` kodla birebir uyuyor.
- **B senaryosu.** `createdAt` sabit kalıyor; `lastSubmittedAt` ilerliyor (`register.ts:232/256`, createdAt'e dokunulmuyor). Bu kodla tutarlı.
- **Not a:** Raporda yalnız "UPDATE 1" geçiyor. be-fb'nin betiği (`live-fo26.sh`) bu adımda `lastSubmittedAt`'i 10 dk geriye çekiyor; 373 ms sonraki 201 bu yüzden 5 dk cooldown'a takılmıyor. Kanıt geçerli, ama bu adım raporda açıkça yazılmalıydı.
- **Not b (varsayım):** curl isteği dev sunucusundan geçti. Sunucu sahip rolüyle bağlanıyorsa `system_scope_open`'ın sahip dalı amaca bakmaz, yani curl kanıtı d8b97f7e'yi sınamaz. Bu yüzden fabrika_app ile canlı testi kendim koştum: 4/4 yeşil, "writes the 409 attempt row through the RLS role…" testi dahil.

## Kanıt (ham çıktı)

```
# birim + statik (worktree b9748eb8)
vitest register.test.ts + rls-coverage.test.ts → Test Files 2 passed, Tests 62 passed
pnpm typecheck → exit 0
pnpm rls:check → CHECK 4c — 3 policy-less tables are created by migrations: BlogPost, ExpertPreRegistration, PublicLead
                 ✅ SUCCESS

# izole DB hazırlığı (CI sırası: ensure_rls → db push → db:rls-role → db:rls → apply-migrations ×2 → db:rls)
✅ prisma/rls.sql applied. Policies in public: 0 → 114
apply-migrations: 50 files applied as fabrika   (×2, idempotent)
 ExpertPreRegAttempt   | t | system_scope
 ExpertPreRegistration | t | system_scope

# canlı (fabrika_app, RLS açık)
expert-prereg-app-role.live + expert-prereg.live + system-scope.live → Test Files 3 passed, Tests 27 passed
 ✓ … writes the 409 attempt row through the RLS role, and the row is invisible without a scope
pnpm rls:verify --require-db → exit 0
 ✓ public-intake: 49 system_scope tablosunda kapsam dışıyla aynı satır sayısı (yalnız ExpertPreRegistration, ExpertPreRegAttempt açık)

# d8b97f7e MUTANTI: rls.sql system_scope_open listesinden ExpertPreRegAttempt silindi, db:rls
× writes the 409 attempt row through the RLS role, and the row is invisible without a scope
AssertionError: expected { Object (kind, error) } to deeply equal { kind: 'duplicate' }
Tests  1 failed | 6 passed (7)
pnpm rls:verify --require-db (mutant) → exit 0   ← yakalamadı (Ö-1)
# geri alındı → db:rls → app-role live 4 passed
```

## Bulgular (önem sırasıyla, hiçbiri bloke etmiyor)

**N-1 · Sürüm notu (doğruluk, geçici pencere).** Canlıda FO-52'nin `rls.sql`'i zaten kurulu, yani `system_scope_open` mevcut ve listesinde ExpertPreRegAttempt yok. Bu DB'de migration ENABLE dalına girer ve tabloya politikayı kurar. Fonksiyon ise `db:rls` koşana kadar eski listeyle kalır. Bu arada doğrulanmış e-postaya gelen 409 ve bekleyen kaydın yeniden kaydı attempt INSERT'inde WITH CHECK'e takılır; `register.ts:279` bunu `{kind:'unavailable', error:'server'}` (503) olarak döndürür. Yeni kayıt etkilenmez. Senaryo yukarıdaki mutantla birebir ölçüldü. `RELEASE_CHECKLIST` §3 → §4 (`db:rls`) sırası bunu kapatır; PR/sürüm notunda "migration'dan hemen sonra `pnpm db:rls`" yazılması yeterli. Kod değişikliği gerekmiyor.

**Ö-1 · Öneri (test boşluğu, FO-52'den kalma).** `check-rls-live.ts` `probePurposeTables` public-intake tablolarının açık olduğunu satır sayısıyla ölçüyor (`intake == truth`). Tablo boşsa 0 = 0 olduğundan, ExpertPreRegAttempt listeden çıksa da `rls:verify` yeşil kalıyor (yukarıdaki mutant). Aynı kör nokta ExpertFounderCounter için de var. Bu PR'ın regresyonu değil; mutantı app-role canlı testi yakalıyor. Öneri: EXPERT_TABLE için yapılan pozitif INSERT kontrolünü (`:712`) her PUBLIC_INTAKE tablosuna genişletmek. Ayrı kartta yapılabilir.

**Ö-2 · Öneri (doküman kayması).** `docs/adr/ADR-0009-signed-system-scope.md:50` hâlâ "public-intake ise yalnız ExpertPreRegistration ve ExpertFounderCounter açılır" diyor. Listenin dördüncü kopyası bu ve eskimiş. Bir satırlık düzeltme yeterli. Kart kapsamı (`prisma`, DATA_MODEL) dışında kaldığı için takip işi olarak önerilir.

## Değişen dosyalar
Yok (inceleme). Yalnız bu rapor yazıldı.

## Riskler
- N-1'deki pencere (migration → db:rls) sürüm sırasına bağlı.
- m2 kapsam dışı, patron kararı bekliyor; bu turda incelenmedi.

## Açık sorular
Yok.

## Sonraki adım
- be-fb/lider: PR #95 açıklamasına N-1 sürüm notunu ekleyin. Ö-1 ve Ö-2 için isterseniz ayrı kart açın.
- Merge kararı lider/patronda (m2 kararı bekleniyor).

## Temizlik
İzole konteyner `crwfb-fo26-pg` silindi, inceleme worktree'si kaldırıldı. Ortak DB'lere (5433/5432) ve ana ağacın node_modules'üne dokunulmadı.
