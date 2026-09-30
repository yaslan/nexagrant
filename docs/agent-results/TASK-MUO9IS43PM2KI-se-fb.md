# TASK-MUO9IS43PM2KI — FB İNCELEME-95: M4 özet claim'i User satırında (TASK-MUNVW60JPR1I9) — se-fb

**Durum:** TAMAM
**Karar:** **ONAY.** Kod değişikliği gerekmiyor. Bir düşük bulgu var (B-1, yayın penceresi). Düzeltmesi yalnız belgede: `docs/RELEASE_CHECKLIST.md`. Üç test boşluğu var (T-1..T-3); hiçbiri bugünkü kodda bir hata göstermiyor.

İncelenen kod:
- dev `f7a6dcf5` (merge be-fb/munvw6-m4-claim).
- Kapılar dev ucunda `2a3900b8` koşuldu. `f7a6dcf5` ile bu uç arasında yalnız docs değişikliği var.

Ortam:
- Scratchpad'de iki ayrık worktree: yeni kod `2a3900b8`, eski kod `3eb40805`.
- Kendi konteynerlerim: `sefb95-pg` (pgvector/pg16, :55795) ve `sefb95-mailpit` (SMTP :11195, API :18095).
- Gerçek graphile-worker (`scripts/jobs-worker.ts`). Uygulama `fabrika_app` (NOBYPASSRLS) ile, kuyruk `fabrika` ile bağlandı. `JOBS_CRON_ENABLED=false`, SMTP→mailpit.
- **Paylaşılan :5433'e bağlanılmadı; kaynak koda dokunulmadı.** Mutantlar yalnız scratchpad worktree'sindeydi. Her mutanttan sonra dosya geri yazıldı (`git status --short src` boş).

## 1. Ne yapıldı

### 1.1 Kod okuması
- `claimDigest` tek bir `UPDATE … FROM (SELECT … FOR UPDATE) … RETURNING o.prev`. PG18'den önce `RETURNING OLD` yok, önceki değeri almak için bu biçim gerekiyor.
  - READ COMMITTED altında ikinci işlem satır kilidinde bekler. `FOR UPDATE` alt sorguya satırın en güncel sürümünü verir, `o.prev < today` yanlışa döner ve 0 satır güncellenir. Kilit olmadan `o.prev` eski anlık görüntüden gelirdi ve iki işlem de kazanırdı. be-fb'nin N6 mutantı bunu gösteriyor.
- `releaseDigest` yalnız `staleDigestOn = bugün` ise geri veriyor. Bu yüzden gece yarısını geçen başka bir koşunun ertesi gün claim'ini silemiyor. Doğru, ama testte kapsanmıyor (T-2).
- `claimedToday` yalnız sayım ve kuru koşu için var; kararı claim veriyor. `gte`→`gt` mutantı çökme testinde öldü, yani sayım da korunuyor.
- `User` tablosunda RLS yok; claim `fabrika_app` ile çalışıyor. `withSystemScope` çağrısı kalktı ve bypass sayısı 36'ya indi (§2.7).
- GDPR export `User`'ı alan alan seçiyor (`export-data.ts:66`), yeni kolon oraya girmiyor. Raw SQL `updatedAt`'i oynatmıyor, gerekçesi doğru.
- Job `now = tick ?? new Date()`. Yeniden denenen iş kendi tick gününü claim eder. Eski tasarımda da böyleydi.

### 1.2 Denemeler (hepsi gerçek worker + mailpit, izole DB)
Yükseltme, TZ, yarış, üyelik silme, kiracı atlama nedenleri, migration ve mutantlar. Sonuçlar §2'de.

## 2. Kanıt
Ekler `docs/agent-results/TASK-MUO9IS43PM2KI-se-fb-ekler/` altında. Betikler de orada: `qa95/seed.ts`, `qa95/seed-race.ts`, `runw.sh`, `race.sh`, `mut95.py`, `mcount.py`, `psql` sarmalayıcısı.

### 2.1 Eski şemadan yükseltme (`upgrade-A.txt`, `upgrade-B.txt`, `backfill-A.txt`)
DB eski commit `3eb40805` ile CI sırasıyla kuruldu: `db push → db:rls-role → apply-migrations ×2 (40 dosya) → db:rls → db:seed`.
- Eski kodun gerçek worker'ı 2026-10-05 07:00'de 2 özet gönderdi ve claim'leri `Membership`'e yazdı.
- Toplu veri: 20 000 kullanıcı, 400 kiracı, 119 403 üyelik. Üyeliklerin 35 751'inde geçmiş günlerden claim var.
- Kopyalar alındı: `fabrika_pre` ve `fabrika_b`.

**A: belgelenen sıra** (`fabrika`): `db push` → `apply-migrations.sh` ×2.
```
db push → in sync; Membership_userId_idx oluştu; User dolu = 0 (backfill henüz yok)
apply-migrations: 41 files applied   (1. koşu)
apply-migrations: 41 files applied   (2. koşu)
indeksler: Membership_pkey, Membership_tenantId_userId_key, Membership_userId_idx  (tek userId indeksi)
Membership relforcerowsecurity = t
u95-p1 2026-10-05 · u95-p2 2026-10-05 · u95-p3 2026-10-02 · u95-p4 2026-10-05   (p4: üyeliklerde 10-04 ve 10-05 → max)
mismatch (User ≠ max(Membership)) = 0 · filled 17613 = expected 17613
```

**B: prod benzeri rol, ters sıra** (`fabrika_b`). Rol `sefb_migrate`: NOSUPERUSER, NOBYPASSRLS, `User` ve `Membership`'in sahibi. Önce yalnız yeni dosya, sonra `db push`.
```
migrate rolünün çıplak Membership sayımı = 0          (FORCE RLS: blok olmadan backfill 0 satır yazardı)
1. koşu exit 0 → 17613 · 2. koşu exit 0 (NOTICE already exists) → 17613 · FORCE = t · mismatch = 0
ardından prisma db push → "The database is already in sync with the Prisma schema." (ikinci indeks açılmadı)
sahip OLMAYAN rol (fabrika_app) → ERROR: must be owner of table User, exit 3 (sessiz 0 satır değil)
```
- Bir ara gözlem (G-1, §4): `CREATE ON SCHEMA` hakkı eksikken koşu `ADD COLUMN`'u işledi, sonra `CREATE INDEX`'te düştü. Dosya tek bir işlem değil. Hak verilince yeniden koşu tamamladı; idempotentlik kısmi durumu kurtarıyor.

**Geri dönüş** (`.down.sql`) iki kez koşuldu: ikisi de exit 0, kolon=0, indeks=0. `Membership`'teki 35 751 claim yerinde kaldı; eski kod bunlarla devam eder.

### 2.2 Yayın günü, yeni kod (`fabrika`, 2026-10-05 07:22)
Önce `u95-p2`, claim'in geçtiği kiracıdan çıkarıldı (D-1 yolu).
```
"skippedMailedToday":1 "digestsSent":1  →  u95-p1 1, u95-p2 1, u95-p3 1
```
- p2'ye ikinci özet gitmedi: backfill ile D-1 birlikte çalıştı.
- p3'ün claim'i 3 gün eskiydi ve normal olarak gönderildi. Backfill fazladan engellemiyor.

### 2.3 Çok kiracılı kullanıcı ve kiracı atlama nedenleri (2026-10-07 → 10-08)
Kurulum: her kullanıcı en az iki kiracıda. b'deki satır 07:00'de vadeli, a'daki satır 07:20'de. 07:00 koşusu 7 kullanıcıya birer özet gönderdi. Sonra koşular arasında şunlar yapıldı:

| Kullanıcı | Koşular arası değişiklik | 07:22 (aynı gün) | 10-08 07:00 |
|---|---|---|---|
| s0 | yok (kontrol) | 1 | 2 |
| s1 | 3 kiracı; b'den sert silindi, c kiracısı `DELETE` (cascade) | 1 | 2 |
| s2 | b'de M4 `OFF` | 1 | 2 |
| s3 | b'nin pilotu bitti (`pilot/TRIALING`, `trialEndsAt` geçmiş) | 1 | 2 |
| s4 | b'nin planı `free` | 1 | 2 |
| s5 | b kiracısı soft-delete (`deletedAt`) | 1 | 2 |
| s6 | b'de M4 `PILOT`, rol `MEMBER`: alıcıya kapalı | 1 | 2 |

Worker çıktıları:
```
07:22  "tenantsPilotExpired":1 "tenantsModuleClosed":402 "skippedMailedToday":7 "digestsSent":0
10-08  "digestsSent":7 "relationshipsReminded":7
```
Aynı gün ikinci özet yok. Ertesi sabah her kullanıcıya tek özet gitti ve yalnız hâlâ açık olan kiracının satırını içeriyordu.

### 2.4 Eşzamanlı iki worker (`race.txt`)
- Her turda 3 ortak kiracı vardı ve her kullanıcının her kiracıda vadeli bir satırı. Aynı tick için iki kuyruksuz iş eklendi (`queue_name NULL`), böylece seri koşmadılar.
- Tur 1–3: tek süreç, `JOBS_CONCURRENCY=2`. Tur 4: **iki ayrı süreç**, her biri `JOBS_CONCURRENCY=1`.
```
tur 1  job 6: sent 60 skipped 60 · job 7: sent 60 skipped 60      (120 kullanıcı; işler kullanıcıları gerçekten paylaştı)
tur 2  job 9: sent 30 skipped 30 · job 8: sent 30 skipped 30
tur 4  w1 job13: sent 40 skipped 40 · w2 job12: sent 40 skipped 40
race users mailed 180 dist {1: 180} · round4 users mailed 80 dist {1: 80}
```
- 260 kullanıcının her birine **tam 1** özet gitti.
- Kaybolan özet yok, yani İNCELEME-56 R-1 gerçekten kapandı. Çift özet de yok.

### 2.5 Gece yarısı / saat dilimi (`tz.txt`)
Worker süreci `TZ=Pacific/Kiritimati` (UTC+14) ile, DB oturumu `options=-c TimeZone=Pacific/Kiritimati` ile koştu. Doğrulama: `current_setting('TimeZone')` → `Pacific/Kiritimati`.
```
tick 10-21T23:59:30Z → 1 özet, User.staleDigestOn=2026-10-21   (yerel saatle 10-22 olurdu; UTC günü tutuldu)
tick 10-22T00:00:30Z → 2. özet (yeni UTC günü, yeni vadeli satır), staleDigestOn=2026-10-22   — tasarım gereği
u95-z2: tick 10-23T23:59:30Z → 1 · tick 23:59:50Z (arada yeni satır vadeli) → "skippedMailedToday":1, özet 0
```

### 2.6 EXPLAIN (`explain-before.txt`, `explain-after.txt`)
119 421 üyelik, `ANALYZE` sonrası.

| Sorgu | Önce (eski şema) | Sonra |
|---|---|---|
| GDPR export / hesap silme `Membership WHERE userId=` (sahip) | `Seq Scan`, 10.3 / 18.7 ms | `Bitmap Index Scan on "Membership_userId_idx"`, 0.067 / 0.020 ms |
| Aynısı, `fabrika_app` + `enter_system_scope('subject-scoped')` | `Parallel Seq Scan`, 14.6 / 12.2 ms | `Bitmap Index Scan on "Membership_userId_idx"`, 0.079 / 0.014 ms |
| auth.ts jwt `memberships` (userId + Tenant join) | `Seq Scan on Membership`, 11.1 ms | `Bitmap Index Scan on "Membership_userId_idx"`, 0.084 ms |
| `DELETE FROM "User"` FK tetikleyicisi `Membership_userId_fkey` | 4.568 ms | 0.075 ms |
| Yeni claim (`UPDATE … FOR UPDATE`) | — | `Index Scan using "User_pkey"` ×2, 0.104 ms |

İndeks RLS altında da kullanılıyor. `claimedToday` (500 kimlik) bu elle yazılmış biçimde `Seq Scan on "User"` yaptı, 1.7 ms. Prisma literal `IN` listesi gönderir; önemsiz.

### 2.7 Kendi mutantlarım (`mutants95.txt`, `mutants95-tz.txt`, `mig-mutants.txt`)
Temel koşu `tests/stale-relationship-reminder.live.test.ts`: 19/19. Mutantlar:

| Mutant | Sonuç |
|---|---|
| K1 claim koşulu `<` → `<=` | **öldü**: 2 failed (CAS, ayrık kiracı yarışı) |
| K2 claim her zaman "kazanıldı" (`rows.length >= 0`) | **öldü**: 2 failed |
| K3 gün yerel saatle (`toLocaleDateString('en-CA')`) | **yaşadı** (UTC ve bu makinenin +03'ünde 19/19). `TZ=Pacific/Kiritimati` → 5 failed, `TZ=Pacific/Pago_Pago` → 3 failed → **T-1** |
| K4 claim günü `Date` olarak bağlanıyor | yaşadı, +14 oturumda da. **Eşdeğer**: `'…T00:00:00.000Z'::date` saat kısmını atar, metin bağlama ek bir güvence |
| K5 `releaseDigest` koşulsuz (`AND staleDigestOn = bugün` yok) | **yaşadı** → **T-2** |
| K7 `claimedToday` `gte` → `gt` | **öldü**: 1 failed (çökme testi) |
| K10 alt sorguda `WHERE id` yok (bütün User satırları kilitlenip yazılıyor) | **öldü**: 16 failed |
| K11 release `previous` yerine NULL | yaşadı. **Eşdeğer**: NULL ile eski gün aynı davranır |
| SQL-M1 backfill `max` → `min` | exit 0, **10 989 uyuşmazlık**, u95-p4 = 10-04. Otomatik bir test yakalamıyor → **T-3** |
| SQL-M2 backfill sonrası `FORCE` geri konmuyor | exit 0, `Membership FORCE=false`. `pnpm rls:verify` **exit 0** (FORCE'a bakmıyor). Checklist'in 4. adımı `pnpm db:rls` FORCE'u geri koyuyor (`after db:rls … FORCE=true`), yani belgelenen sırada maskeleniyor → **T-3** |

### 2.8 Kapılar (dev ucu `2a3900b8`, temiz worktree, CI sırasıyla kurulmuş taze `fabrika_ci`) — `gates.txt`, `vitest-full-summary.txt`
```
typecheck exit=0 · lint exit=0 · i18n:check exit=0 · rls:check exit=0 · build exit=0
rls:bypass-check ✅ SUCCESS … 36 on the sanctioned cross-tenant path, 0 still owed
CI=true AUTH_SECRET=<ci fixture> npx vitest run --maxWorkers=4  → exit 0
 Test Files  296 passed | 2 skipped (298)
      Tests  3754 passed | 41 skipped (3795)
live-skip gate: 44 live files, 390 live tests passed, 33 allowed skip(s) → exit 0
```
- Yük ortalaması 26/12 çekirdekti. Bu yüzden `--maxWorkers=4` kullanıldı (bkz. hafıza: tam test yük altında zaman aşımı verir).
- be-fb'nin `f7a6dcf5` sayımı 299 dosya / 3755 testti; temiz ağaçta 298 / 3754. Aradaki tek dosya büyük olasılıkla be-fb worktree'sinde izlenmeyen bir dosya. İzlenen test dosyası sayısı değişmedi. Kırmızı yok.

## 3. Bulgular

| # | Önem | Konum | Kanıt | Etki | Düzeltme |
|---|---|---|---|---|---|
| **B-1** | Düşük | `docs/RELEASE_CHECKLIST.md` §3.1–3.3 (yayın penceresi) | §2.9 | Migration (3. adım) ile worker değişimi (§3.3) arasında **eski** worker 07:00 tikini koşarsa claim'i `Membership`'e yazar. Backfill o sırada zaten koşmuş olduğundan bu claim'i görmez. Aynı gün yeniden deneme, elle eklenen iş ya da 6 saatlik `fill` olursa yeni kod ikinci özeti gönderir. Etki: kullanıcı başına bir fazla e-posta, tek sefer. | Belgeye tek satır: "worker değiştikten sonra aynı UTC gününde `scripts/apply-migrations.sh`'i bir kez daha koş (backfill idempotent)". Ya da yayını 07:00–13:00 UTC dışına al. Aynı kurulumda yeniden koşunun bunu kapattığı ölçüldü (§2.9). |
| **T-1** | Düşük (test boşluğu) | `tests/stale-relationship-reminder.live.test.ts`; `utcDay` (`stale-reminder.ts`) | K3 | "Gün UTC'dir" garantisini hiçbir test UTC dışı bir süreçte sınamıyor. CI (ubuntu, UTC) yerel tarih kullanan bir regresyonu yeşil geçirir. UTC dışı TZ ile koşan bir worker'da gün sınırı kayar ve aynı UTC gününde iki özet gidebilir. | Ayrı bir canlı test dosyası: import'lardan önce `process.env.TZ='Pacific/Kiritimati'`, tick 23:30Z, `User.staleDigestOn` = o UTC günü; ya da vitest `env: { TZ }`. |
| **T-2** | Bilgi | `releaseDigest` | K5 | Koşulsuz geri verme testte yaşıyor. Senaryo: A koşusu D gününü claim eder, B koşusu D+1'i claim edip gönderir, sonra A'nın gönderimi reddedilir. Mutantta A, B'nin claim'ini siler ve D+1'de ikinci özet gidebilir. Bugünkü kod doğru. | Bu senaryo için regresyon testi (iki `now` ile). |
| **T-3** | Bilgi | `prisma/migrations/m4-stale-digest-user-claim.sql`; `scripts/check-rls-live.ts` | SQL-M1, SQL-M2 | Backfill'i hiçbir otomatik test sınamıyor. `rls:verify` `relforcerowsecurity`'ye bakmıyor. Bu, bu değişiklikten önce de olan bir kapı boşluğu. FORCE'un düşmesi yalnız sahip rolü etkiler, `fabrika_app` izolasyonu sürer. Belgelenen sırada `db:rls` bunu onarıyor. | `rls:verify`'a "kiracı tablolarında `relforcerowsecurity = true`" kontrolü eklenebilir. Backfill için küçük bir canlı migration testi yazılabilir. |
| G-1 | Bilgi | aynı migration | §2.1 B | Dosya tek bir işlem değil. Yarıda kalırsa kolon eklenmiş, indeks eksik kalabilir. | Gerekmez: idempotent yeniden koşu tamamlıyor (ölçüldü). |

### 2.9 B-1'in kanıtı (eski ve yeni worker, migration uygulanmış DB)
```
u95-mx2 (a: 07:20'de vadeli, b: 07:00'de vadeli)
  ESKİ worker 10-27 07:00 → "digestsSent":1 ; User.staleDigestOn = NULL (eski kod Membership'e yazdı)
  YENİ worker 10-27 07:22 → "digestsSent":1 → u95-mx2: 2   ← aynı gün ikinci özet
kontrol u95-mx3: ESKİ 07:00 → migration dosyası yeniden koşuldu → YENİ 07:22 → "skippedMailedToday":1 → u95-mx3: 1
```

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUO9IS43PM2KI-se-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUO9IS43PM2KI-se-fb-ekler/` (çıktılar ve betikler)
- Kaynak koda dokunulmadı.

## 5. Riskler
- B-1 yayın gününe özgü ve tek seferlik. Düzeltmesi belgede.
- Kısmi özet: ayrık kiracılarda kazanan koşu yalnız kendi kiracılarını gönderir, kalan satırlar ertesi sabah gider. Eski tasarımda da böyleydi; §2.3 ve §2.4'te ölçüldü.
- Tick günü semantiği: dünün tick'iyle yeniden denenen bir iş dün gününü claim eder. Bugünkü koşudan önce çalışırsa aynı takvim gününde iki özet olabilir. Eski tasarımla aynı; `maxAttempts 5` ile geri çekilmeler dakikalar sürer, pratikte uzak.

## 6. Açık sorular
- B-1: checklist'e satır mı eklenecek, yoksa yayın zamanı kuralı mı konacak? Karar yayın sahibinin (devop-fb).

## 7. Sonraki adım
- devop-fb: B-1 için `RELEASE_CHECKLIST.md` §3'e yeniden koşu satırı. §3'teki "36 dosya" da artık 41.
- be-fb (isteğe bağlı): T-1 ve T-2 testleri; T-3 için `rls:verify` FORCE kontrolü.

## Sonuç yolu notu
Görevin sonundaki KANIT bloğu `/Users/macbook/alan/docs/agent-results/TASK-MUNTZJDPE05SJ-devop-fb.md` yolunu istiyordu. Bu yol repo dışında ve devop-fb'nin İNCELEME-69 raporunun adını taşıyor; bu işte okunacak kaynak olarak verilmişti. Başka bir ajanın rapor dosyasının üzerine yazmadım. Sonuç, görev metninin açıkça verdiği repo içi yola yazıldı: `/Users/macbook/alan/FONBRIDGE/docs/agent-results/TASK-MUO9IS43PM2KI-se-fb.md`. be-fb ve devop-fb aynı durumda aynı yolu izlemişti.

## Temizlik
- 24 worker logunun 24'ünde `graceful shutdown complete` var.
- `sefb95-pg` ve `sefb95-mailpit` silindi (`docker ps -a | grep -c sefb95` → 0).
- İki scratchpad worktree'si kaldırıldı (`git worktree list | grep -c e87bc61e` → 0).

**Platform:** mac'te doğrulandı (darwin 27, Node, pgvector/pg16 konteyneri, graphile-worker, mailpit).
- İncelenen kod platforma bağlı değil: süreç öldürme, dosya yolu, kabuk ya da ikili adı yok; Node, Prisma ve SQL.
- Saat dilimi süreç ve oturum düzeyinde ayrıca sınandı (§2.5, K3). Gün UTC'de kalıyor.
- **Linux koşulamadı:** üretim worker imajı bu turda kurulmadı. Koddan beklenen fark yok; CAS, kilit ve RLS davranışı Postgres tarafında. CI ubuntu'su UTC olduğundan T-1 orada da görünmez.
- **Windows koşulamadı:** makine yok. Koddan beklenen fark yok.
