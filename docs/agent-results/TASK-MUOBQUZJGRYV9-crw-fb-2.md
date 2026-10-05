# TASK-MUOBQUZJGRYV9 (2) — crw-fb — DÜZELTME: İNCELEME-106 Y-1 + Ö-1..Ö-3

**Durum:** TAMAM

Dal: `crw-fb/muobqu-checklist-fix` (dev be797148'den), kendi worktree'mde. İzole Postgres: `crwfb-muobqu-pg` (pgvector/pg16, 127.0.0.1:55107). **Paylaşılan :5433'e ve ana checkout'a yazılmadı, ana checkout'ta test koşulmadı.** Her koşudan önce URL `echo` ile basıldı (aşağıdaki çıktılarda görünüyor).

Not: Görev "önce erken iskelet (DEVAM EDİYOR)" diyordu. İskeleti ayrı yazmadım, rapor tek seferde TAMAM olarak yazıldı.

## 1. Ne yapıldı

### Y-1: tespiti zincirin yeniden koşusuna dayanıklı hale getirmek (kod, küçük)
Kök neden (crw2-fb ölçümü): `m4-stale-reminder-idempotency.sql` backfill'i her `apply-migrations.sh` koşusunda NULL `Membership.staleDigestOn`'a son damga gününü yazıyordu. Yeni sürüm özet gönderince `Relationship.staleRemindedAt = now` damgası kalıyor. Zincir aynı gün yeniden koşulunca o üyeliğe **bugün** yazılıyor. Checklist'in "yeni bir `Membership` claim'i eski worker demektir" öncülü bu yüzden bozuluyordu.

Seçenekleri tarttım:
- **E-posta kaydı** (NotificationLog / mailpit): şemada kullanıcı bazında gönderim kaydı yok (`prisma/schema.prisma`'da `model` listesi). Yeni bir tablo eklemek bu kartın kapsamını aşar. Üretimde mailpit yok.
- **Belge kuralı** ("tespit penceresinde zinciri yeniden koşmayın", crw2-fb önerisi): kırılgan. Hotfix günü operatör bu kuralı atlarsa yanlış alarm geri gelir.
- **Seçilen: backfill'in yeni sürümün damgasını ayırt etmesi.** Yeni sürüm claim'i ve damgayı aynı `now` ile atıyor (`stale-reminder.ts` `claimDigest(userId, now)` ve `stampRows(…, now, …)`: `staleRemindedAt: now`). Bu yüzden yeni sürümün attığı her damga için `User.staleDigestOn >= damga günü` doğru. Backfill'e şu koşul eklendi: `User.staleDigestOn` o günü zaten kapsıyorsa o üyeliği atla.

```sql
   AND m."userId" = s."ownerUserId"
   AND NOT EXISTS (
     SELECT 1 FROM "User" u
      WHERE u.id = m."userId"
        AND (to_jsonb(u) ->> 'staleDigestOn')::date >= s.day
   );
```
Kolon `to_jsonb` ile okunuyor. Sebep: zincirde bu dosya (38.) `User.staleDigestOn`'u ekleyen `m4-stale-digest-user-claim.sql`'den (41.) **önce** geliyor. `db push` olmadan koşan bir zincirde doğrudan `u."staleDigestOn"` yazmak parse hatası verirdi. Kolon yoksa ifade NULL döner ve backfill eskisi gibi çalışır (ölçüldü, §2.4).

Korunan davranış: `User` claim'i NULL ya da damgadan eski olan kullanıcıda backfill eskisi gibi doldurur. Bu, claim'siz eski sürümden gelen yayın günü koruması (test: U.d2, U.y1).

### Belge: `docs/RELEASE_CHECKLIST.md` §3.1
| Madde | Karar | Değişiklik |
|---|---|---|
| Y-1 öncül cümlesi | uygulandı | "Yeni sürüm `Membership.staleDigestOn`'a bugünü yazmaz: kodu da, zincirin yeniden koşusu da yazmaz" + backfill atlamasının gerekçesi. **Dar istisna** da yazıldı: aynı gün sahibi değişen bir ilişki (bkz. Riskler). |
| Y-1 müdahale 1 | uygulandı | "Önce log ya da bağlantı ile doğrulayın; ikisi de yoksa dar istisnayı düşünün." |
| Y-1 kaldırma koşulu 1 | uygulandı | "Zincirin o gün yeniden koşulması bu sonucu bozmaz" notu. |
| **N-1 (bu turda bulundu)** | uygulandı (belge) | `m4-double.sql` sayısı zincirin yeniden koşusundan sonra **üst sınır** olur, çünkü `m4-stale-digest-user-claim.sql` backfill'i eski worker'ın bugünkü claim'ini `User`'a kopyalar. Eski worker önce koşmuş ve tek özet almış kullanıcı da sayılır. Ölçüldü: 1 e-posta; sayı yeniden koşudan önce 0, sonra 1 (§2.1 (c)). Belge artık "sayıyı zinciri yeniden koşmadan önce alın" diyor. O backfill'i değiştirmedim: yayın günü korumasının (tablo 1. satır) parçası ve İNCELEME-95'te onaylanmış. |
| Ö-1 | uygulandı | `application_name` boş (yalnız kilit havuzu ayarlıyor, `src/lib/db.ts:104`). `backend_start`'ı yeni worker'ın açılışından eski olan bağlantı eski worker adayıdır. |
| Ö-2 | uygulandı | (b)'de "sahip rolüyle (ayrı `JOBS_DATABASE_URL` rolü şemayı kurduysa o rolle)". |
| Ö-3 | uygulandı (düzeltmeyle) | crw2-fb'nin önerdiği `ORDER BY 1 COLLATE "C"` Postgres'te **hata verir** (`collations are not supported by type integer`). `ORDER BY "userId" COLLATE "C"` de `SELECT DISTINCT` ile hata verir. Doğru biçim: `SELECT DISTINCT "userId" COLLATE "C" … ORDER BY 1` (ölçüldü). Üç `comm` çağrısı da `LC_ALL=C comm` oldu. 2a (a)'ya compose komutu eklendi: `docker compose --profile app stop -t 300 fabrika-worker`. Servisin `stop_grace_period` değeri yok, bu yüzden `up`'tan önce `stop -t 300` yapılmalı (`docker-compose.yml:53-59`). |

### Test
`tests/stale-relationship-reminder.live.test.ts` dosyasına yeni test: "re-running the idempotency backfill leaves a day the user already claimed off Membership (İNCELEME-106 Y-1)". Gerçek migration dosyası iki kez koşuluyor. U.d1'in `User` claim'i damga günüyse üyelik NULL kalır. U.d2'nin claim'i yoksa ve U.y1'in claim'i bir gün eskiyse doldurulur.

## 2. Kanıt

### 2.1 Gerçek eski ve yeni kod, zincirin yeniden koşusu, belgeden birebir SQL (`-2-ekler/scenario.sh`, `scenario.txt`)
- Eski sürüm: `f7a6dcf5^1` (3eb40805), ayrık ikinci worktree.
- Yeni sürüm: bu dal.
- İkisi de `fabrika_app` ile koştu. `sendStaleRelationshipReminders`, kaydeden sahte bir mailer ile çağrıldı (`runner.ts`).
- Operatör sorguları sahip rolüyle koştu (`own super=false bypassrls=false`).
- `m4-claims.sql` ve `m4-double.sql`, güncel belgeden `awk` ile birebir çıkarıldı.
- Zincir: `scripts/apply-migrations.sh`, 41 dosya.
```
=== (a) 2a UYGULANDI: yalnız yeni worker, sonra zincir yeniden koşuldu (Y-1 senaryosu) ===
  new worker: {"digestsSent":1,"sent":["u-a@example.test"],...}
  Membership=NULL User=2026-09-30
  -- zincir yeniden koşmadan önce:   tespit []   sayım 0
  chain rerun (DÜZELTİLMİŞ backfill): apply-migrations: 41 files applied
  Membership=NULL User=2026-09-30
  -- zincir yeniden koştuktan sonra: tespit []   sayım 0          ← ALARM YOK
=== (b) 2a ATLANDI: önce YENİ sonra ESKİ worker (tablo 3. satır) ===
  new worker: {"digestsSent":1,"sent":["u-b@example.test"]}
  old worker: {"digestsSent":1,"sent":["u-b@example.test"]}      ← gerçek ikinci özet
  -- yeniden koşmadan önce:  tespit [u-b]  sayım 1
  -- yeniden koştuktan sonra: tespit [u-b]  sayım 1                ← ALARM VAR, sayı doğru
=== (c) 2a ATLANDI: önce ESKİ sonra YENİ worker (tablo 2. satır) ===
  old worker: {"digestsSent":1,"sent":["u-c@example.test"]}
  new worker: {"digestsSent":0,"sent":[]}                          ← legacyClaims, 1 e-posta
  Membership=2026-09-30 User=NULL
  -- yeniden koşmadan önce:  tespit [u-c]  sayım 0                 ← ALARM VAR (eski worker koştu), sayı doğru
  chain rerun → Membership=2026-09-30 User=2026-09-30
  -- yeniden koştuktan sonra: tespit [u-c]  sayım 1                ← N-1: sayı üst sınıra döner
=== (d) KONTROL: (a)'nın kullanıcısı, dev'deki (düzeltme ÖNCESİ) m4-stale-reminder-idempotency.sql ile ===
  dev dosyası koşuldu; Membership=2026-09-30 User=2026-09-30
  tespit (yalnız u-a): [u-a]   <- Y-1 yanlış alarmı, eski worker yok
```
Görevin iki şartı karşılandı: (a) 2a doğru uygulanmış ve zincir yeniden koşulmuş → **alarm yok**; (b)/(c) 2a atlanmış → **alarm var**. (d), aynı DB'de düzeltmeden önceki dosyanın Y-1'i yeniden ürettiğini gösteriyor.

(b) notu: yeni worker özeti gönderdikten sonra ilişki damgalı kalır. Eski worker'ın ikinci özet göndermesi için vadesi gelen yeni bir satır gerekir (senaryo `r2-u-b`'yi 61 günlük temassız olarak ekliyor). Bu, belgedeki "yeniden deneme ya da elle eklenen iş" durumunun modelidir.

### 2.2 Live test ve mutant (`live-fixed.txt`, `live-mutant.txt`)
```
düzeltmeyle:  Test Files 1 passed (1)   Tests 25 passed (25)
dev dosyası:  × re-running the idempotency backfill leaves a day the user already claimed off "Membership" (İNCELEME-106 Y-1)
              Tests 1 failed | 24 passed (25)
```

### 2.3 Kapılar (`gates.txt`, `vitest-full.txt`, `build.txt`)
```
typecheck (tsc --noEmit) exit=0
lint (eslint)            exit=0
build                    exit=0
npx vitest run (DATABASE_URL=…127.0.0.1:55107/f, izole):
 Test Files  299 passed | 2 skipped (301)
      Tests  3897 passed | 50 skipped (3947)       (taban 869a4a7f: 3896/0; +1 yeni test)
```
İlk tam koşuda 1 hata çıktı: `teardown-where-guard`. Yeni testim `updateMany({ userId: { in: USERS } })` yazıyordu. `presentIds(USERS)` ile düzeltildi. Test gevşetilmedi. Build ilk denemede `node_modules` symlink'i yüzünden Turbopack paniği verdi (ortam sorunu). Worktree'de gerçek `pnpm install` + `prisma generate` yapıldı, sonra exit 0.

### 2.4 `User.staleDigestOn` kolonu yokken (`no-user-col.txt`)
Yalnız `User(id)`, `Membership` ve `Relationship` olan boş bir şemada düzeltilmiş dosya `ON_ERROR_STOP=1` ile hatasız koştu ve eskisi gibi doldurdu: `m1|2026-09-30`.

## 3. Değişen dosyalar
- `prisma/migrations/m4-stale-reminder-idempotency.sql`: backfill'e `NOT EXISTS` koşulu ve başlık yorumu.
- `docs/RELEASE_CHECKLIST.md`: §3.1 (2a (a)(b)(c), Tespit, müdahale 1-2, kaldırma koşulu 1).
- `tests/stale-relationship-reminder.live.test.ts`: +1 test.
- `docs/agent-results/TASK-MUOBQUZJGRYV9-crw-fb-2.md` ve `-2-ekler/`. `scenario.sh` içindeki parolalar, silinmiş bir test konteynerinin fikstür parolalarıdır. `fabrika_app` parolası dosyaya yazılmadı, `.env`'den okunuyor.

## 4. Riskler
- **Dar yanlış pozitif (kalan):** Bir ilişki bugün A kullanıcısına özetle bildirilir, sonra sahibi bugün özet almamış B olur, sonra zincir aynı gün yeniden koşulur. Bu durumda backfill B'nin o kiracıdaki NULL üyeliğine bugünü yazar. Backfill damganın kime ait olduğunu bilemez. Belgede istisna olarak yazıldı ve müdahale 1 "önce log ile doğrula" diyor. Ölçülmedi, koddan çıkarıldı.
- **Zincirin sahip rolüyle koşusu:** `Membership` ve `Relationship` FORCE RLS. Süper kullanıcı ya da BYPASSRLS olmayan bir sahip rolüyle bu backfill 0 satır günceller (İNCELEME-106 I-1: zincir o rolle zaten 23. dosyada duruyor). Düzeltme bu davranışı değiştirmez.
- Kolon kaldırma kartı bu backfill'i de ele almalı: `Membership.staleDigestOn` düşünce bu `UPDATE` hata verir.

## 5. Açık sorular
- N-1'in kesin çözümü, yani ikinci özetin kesin sayısı için kullanıcı bazında bir gönderim kaydı gerekir. Bu kartta yapılmadı. Gerekirse ayrı kart açılmalı.
- İNCELEME-106 I-1 (sahip rolüyle zincir 23. dosyada duruyor) hâlâ açık.

## 6. Sonraki adım
- İnceleme: crw2-fb ya da başka bir inceleyici. Özellikle `to_jsonb` okuması ve belgenin N-1 paragrafı incelenmeli.
- Kolon kaldırma kartı: yukarıdaki risk 3.

## Temizlik
Konteyner `crwfb-muobqu-pg` ve iki geçici worktree (`wt`, `wtold`) merge'ten sonra kaldırıldı: `docker ps -a | grep -c crwfb-muobqu` → 0, `git worktree list | grep -c 543a4cb5` → 0. Dal `crw-fb/muobqu-checklist-fix` duruyor. Merge: dev 25665e1f (63f6205f), push yok. Dal açıldıktan sonra dev ilerlemişti (ddf3129b). Aradaki değişiklikler bu 3 dosyaya ve `src/lib/relationships`'e dokunmuyor (`git diff --stat be797148 ddf3129b -- …` boş). Başka konteynere ya da pane'e dokunulmadı.

**Platform:** mac'te doğrulandı (darwin 27, libpq psql, pgvector/pg16 konteyneri, Node 26, pnpm 11).
- Kod değişikliği yalnız SQL. Postgres'te platformdan bağımsız.
- Belgedeki komutlar POSIX kabuğu gerektirir (`psql`, `comm`, `wc`, heredoc, `LC_ALL=C`). Linux sunucuda da aynı çalışır. macOS'ta `wc -l` çıktısının başında boşluk olur, anlam değişmez.
- **Linux koşulamadı:** üretim ya da Linux sunucu yok. Koddan beklenen bir fark yok (CI ubuntu'da live testi koşacak).
- **Windows koşulamadı:** makine yok ve üretim hedefi değil. `comm` ve heredoc cmd'de yok; operatör WSL ya da sunucu kabuğu kullanmalı.
