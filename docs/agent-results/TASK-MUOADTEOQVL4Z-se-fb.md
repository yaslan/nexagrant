# TASK-MUOADTEOQVL4Z — se-fb — M4 claim taşıma: yayın penceresi (B-1) + T-1..T-3

**Durum:** TAMAM

Dal: `se-fb/muoadt-m4-release` (dev `32eff357`'den). Kaynak bulgular: `docs/agent-results/TASK-MUO9IS43PM2KI-se-fb.md` §3 (B-1, T-1..T-3), §2.9.
Ortam: kendi worktree'm, kendi konteynerlerim `sefbad-pg` (pgvector/pg16, :55801) ve `sefbad-mailpit` (SMTP :11801, API :18801). Paylaşılan fabrika (:5433) kullanılmadı.

## 1. Ne yapıldı

### 1.1 B-1 — yayın penceresi
- **Belge** (`docs/RELEASE_CHECKLIST.md` §3.1, §3.3):
  - Yeni adım **2a: eski worker'ı migration'dan (3. adım) önce durdur.** Yeni worker §3.3'te kalkana kadar hiçbir worker koşmaz.
  - "Claim taşıma penceresi" gerekçe paragrafı eklendi: backfill bir anlık görüntüdür. Kaçan 07:00 tikini yeni worker `fill=6h` ile koşar; 13:00 UTC'den sonra açılırsa özet gecikir ama kaybolmaz. Yedek yol da yazıldı: worker değiştikten sonra aynı UTC gününde `apply-migrations.sh`'i yeniden koş (idempotent).
  - §3.3 3. adıma "eski ve yeni sürümün worker'ı aynı anda koşmaz" notu eklendi. Geri dönüş satırına ters yön penceresi eklendi: down dosyası claim'leri üyeliklere geri kopyalamıyor.
  - Eskimiş sayılar düzeltildi: "36 dosya" → 41, `--list | tail` çıktısı güncel.
- **Kodda ucuz koruma** (`src/lib/relationships/stale-reminder.ts`, `legacyClaims`):
  - Yeni sürüm, gezdiği **her** kiracıda bugünün eski claim'ini (`Membership.staleDigestOn >= bugün`) okur ve o üyeleri "bugün gönderildi" sayar.
  - Okuma, kiracının kendi `withTenant` işleminde yapılır (RLS içinde, sistem kapsamı gerekmez). Kiracı başına tek sorgu var.
  - Okuma pilot ve M4 kapılarından **önce** yapılır.
  - Kolon kaldırılırken bu okuma da birlikte gider. Bu, JSDoc'ta ve `schema.prisma` yorumunda yazılı.
  - İlk taslağımda eski claim yalnız "bu kiracıda vadeli satırı olan sahibin üyeliğinden" okunuyordu. Bu, ölçülen senaryonun kendisini kaçırırdı: eski worker tA üzerinden claim eder, 07:20'de vadeli olan satır ise tB'dedir. Taslak bu yüzden kiracı başına sorguya çevrildi (§2.2'deki `Membership|tA/uA` satırı).

### 1.2 Test boşlukları (`tests/stale-relationship-reminder.live.test.ts`, +5 test)
| # | Test | Neyi kilitliyor |
|---|---|---|
| B-1 | `a claim the previous release wrote on a membership today holds; yesterday's does not` | Eski claim, vadeli satırı olmayan ve M4'ü kapanmış bir kiracıda. Aynı gün 0 özet ve `skippedMailedToday=1`. User satırına yazılmıyor. Ertesi gün özet gidiyor. |
| T-1 | `… −11 sends no second digest the same UTC day` | `process.env.TZ='Pacific/Pago_Pago'`. 07:00Z'de 1 özet, claim = UTC günü. 11:30Z'de yeni vadeli satır için 0 özet. |
| T-1 | `… +14 claims the UTC day, and the next UTC day still sends` | `Pacific/Kiritimati`. 23:30Z'de claim = UTC günü. Ertesi UTC günü 07:00Z'de özet gidiyor. |
| T-2 | `a rejected send gives back only its own day` | A, D gününü claim eder ve gönderimde bekler. B, D+1'i claim edip gönderir. A reddedilir. Claim D+1'de kalır, üçüncü koşu 0 özet gönderir. |
| T-3 | `the migration backfills the latest membership claim, never lowers one, and leaves Membership FORCEd` | Migration dosyasını sahip rolüyle iki kez koşar. Kontroller: `max`, "yalnız yükselt" ve FORCE'un geri konması. |

- Test, TZ'yi kendi içinde değiştirir. Bu yüzden CI'da (UTC) da çalışır. Bitişte eski TZ geri konur.
- **T-3 kapı tarafı** (`scripts/check-rls-live.ts`): `rls:verify` artık kiracı tablolarında `relforcerowsecurity` değerine de bakıyor. RLS açık ama FORCE yoksa → exit 1 ve tablo adı yazılır.

## 2. Kanıt

### 2.1 Yayın penceresi — gerçek eski / dev / düzeltilmiş worker, izole DB, mailpit (`-ekler/S*.txt`)
- Taban DB `relbase`: **eski** sürüm (`3eb40805`, f7a6dcf5'in 1. ebeveyni) CI sırasıyla kuruldu. 40 dosya, `rls:verify` ✅.
- Tohum: gün 2026-10-27.
  - uA: tA'da 07:00'de vadeli satır, tB'de 07:20'de vadeli satır.
  - uC: yalnız tB'de 07:20'de vadeli satır.
  - uE: yalnız tA'da vadeli satır.
- Her senaryo `CREATE DATABASE … TEMPLATE relbase` kopyasında koştu. İşler cron gibi eklendi: `_cron.ts`, kuyruk `m4-stale-relationships`. Her worker gerçek `scripts/jobs-worker.ts` süreciydi; `fabrika_app` rolüyle bağlandı ve SMTP mailpit'e gitti.

| Senaryo | Sıra | Worker'lar | uA özet | uC | uE |
|---|---|---|---|---|---|
| S1dev (hata) | bugünkü checklist: migrate → ESKİ 07:00 → yeni 07:22 | eski + **dev** | **2** | 1 | 1 |
| S1fix | aynı sıra | eski + **bu dal** | **1** (`skippedMailedToday:1`) | 1 | 1 |
| S2dev | **yeni checklist**: db push → ESKİ 07:00 → eski worker DUR (2a) → migrate → yeni 07:22 | eski + **dev** (koruma yok) | **1** | 1 | 1 |
| S3dev | eski sıra + worker değişiminden sonra `apply-migrations` yeniden | eski + **dev** | **1** | 1 | 1 |

```
S1dev  total=4 {'uA@example.test': 2, 'uC@example.test': 1, 'uE@example.test': 1}
S1fix  [wt] tick=2026-10-27T07:22 … "skippedMailedToday":1 "digestsSent":1
       total=3 {'uA@example.test': 1, 'uC@example.test': 1, 'uE@example.test': 1}
       Membership|tA/uA|2026-10-27   ← eski claim tA'da; uA'nın 07:22 satırı tB'de
       User|uA|(NULL)                ← koruma yalnız okur, User satırına yazmaz
       ertesi gün 07:00 → "digestsSent":1 → uA: 2 (bir önceki günün 1'i + bugünün 1'i; tB satırı gecikmeli gitti)
S2dev  total=3 {'uA@example.test': 1, 'uC@example.test': 1, 'uE@example.test': 1}
S3dev  total=3 {'uA@example.test': 1, 'uC@example.test': 1, 'uE@example.test': 1}
```
Her worker logunda `graceful shutdown complete` var (`shutdown: 1`, 9/9).

### 2.2 `rls:verify` FORCE kontrolü (`-ekler/verify-force.txt`)
```
Membership NO FORCE (SQL-M2 mutantının bıraktığı durum):
[wtdev] exit=0  ✅ 47 kiracıya özel tabloda politika yerinde …          ← boşluk (İNCELEME-95 T-3)
[wt]    exit=1  ❌ KİRACI İZOLASYONU EKSİK …
                   FORCE ROW LEVEL SECURITY yok (tablo sahibi politikaları atlıyor): Membership
[wt] FORCE geri: exit=0
```
S3 (`apply-migrations` `db:rls`'ten sonra yeniden koşuldu) ardından da `rls:verify` exit 0 verdi. Yani checklist'in yedek yolu FORCE'u bozmuyor.

### 2.3 Testler ve mutantlar (`-ekler/mutants*.txt`)
Taban: `tests/stale-relationship-reminder.live.test.ts` → **24/24** (19 eski + 5 yeni). `TZ=UTC` ile de 24/24.

| Mutant | Sonuç |
|---|---|
| K3 `utcDay` yerel gün (`toLocaleDateString('en-CA')`) | **öldü**: 2 failed (T-1 ×2). **`TZ=UTC` süreçte de** 2 failed, yani CI'da görünür. |
| K5 `releaseDigest` koşulsuz | **öldü**: 1 failed (T-2) |
| SQL-M1 backfill `max` → `min` | **öldü**: 1 failed (T-3) |
| SQL-M2 FORCE geri konmuyor | **öldü**: 1 failed (T-3). Ayrıca `rls:verify` exit 1 (§2.2). |
| SQL-M3 backfill "yalnız yükselt" koşulu yok | **öldü**: 1 failed (T-3) |
| B1-M1 eski claim yok sayılıyor | **öldü**: 1 failed (B-1) |
| B1-M2 eski claim günsüz (her eski claim engeller) | **öldü**: 4 failed |
| B1-M3 eski claim kapılardan sonra okunuyor | **öldü**: 1 failed (B-1). İlk koşuda yaşadı; test, eski claim'in kiracısında M4'ü kapatacak biçimde güçlendirildi (`2971a02f`). |

9/9 öldü. Mutant koşucusu her mutanttan sonra dosyayı `git checkout` ile geri alıp `Membership` FORCE'unu yeniden koydu. Sonuçta `git status` temizdi.

### 2.4 Kapılar (`-ekler/gates.txt`, `-ekler/vitest-full-summary.txt`)
Dal ucu, izole `fabrika_ci` (CI sırası: db push → db:rls-role → apply ×2 → db:rls → db:seed).
```
typecheck exit=0 · lint exit=0 · i18n:check exit=0 · rls:check exit=0 · build exit=0
rls:bypass-check ✅ SUCCESS … 36 on the sanctioned cross-tenant path, 0 still owed
rls:verify ✅ 47 … (FORCE denetimi dahil)
CI=true AUTH_SECRET=<ci fixture> npx vitest run --maxWorkers=4  → exit 0
 Test Files  296 passed | 2 skipped (298)
      Tests  3759 passed | 41 skipped (3800)      (İNCELEME-95 tabanı 3754 + bu işin 5 testi; skip sayısı değişmedi)
```
- `build` ilk denemede exit 1 verdi: Turbopack symlink'li `node_modules`'ü reddediyor (bilinen durum). Worktree'ye `pnpm install --frozen-lockfile --offline` yapıldı; ardından exit 0.

## 3. Değişen dosyalar
- `src/lib/relationships/stale-reminder.ts`: `legacyClaims`, kiracı gezisinde okunuyor ve `mailedToday`'e ekleniyor.
- `prisma/schema.prisma`: yalnız `Membership.staleDigestOn` yorumu değişti. Şema değişikliği yok.
- `scripts/check-rls-live.ts`: FORCE denetimi.
- `tests/stale-relationship-reminder.live.test.ts`: +5 test.
- `docs/RELEASE_CHECKLIST.md`: §3.1 2a + gerekçe, 41 dosya, §3.3 notu, geri dönüş penceresi.
- `docs/agent-results/TASK-MUOADTEOQVL4Z-se-fb.md` ve `-ekler/` (loglar, betikler, tohum).

## 4. Riskler
- **Koruma, eski claim'i bir kiracıyı okuyamayan koşuda göremez.** Kiracının okuması hata verirse (`tenantsFailed`) oradaki eski claim görülmez. Bu, bir geçiş günü, eski worker penceresi ve kiracı okuma hatası aynı anda olursa gerçekleşir; birincil düzeltme belgedeki 2a adımı.
- Eski claim bir üyelikte duruyorken üye aynı gün çıkarılırsa claim silinir (İNCELEME-69 D-1'in eski hali). Yalnız geçiş günü için geçerli.
- `legacyClaims` her koşuda kiracı başına bir sorgu ekler. Sorgu, `Membership`'te `tenantId` ile başlayan unique indeksi kullanır; tablo üye sayısı kadar küçük. Kolon kaldırılırken silinmeli; unutulursa zararsız ama ölü kod kalır (JSDoc'ta yazılı).
- `rls:verify` artık FORCE'suz kiracı tablosunda kırmızı. Bugünkü CI ve checklist sırasında hepsi FORCE'lu (ölçüldü). Bir ortam `db:rls`'siz kalmışsa artık yeşil geçmez; bu istenen davranış.

## 5. Açık sorular
- Yok. 2a adımının yayın sahibi (devop-fb) tarafından runbook'a işlenmesi yeterli.

## 6. Sonraki adım
- Kolonu (`Membership.staleDigestOn`) kaldıracak sonraki migration: `legacyClaims`'i ve bu testin B-1 bölümünü de silsin.
- devop-fb: yayın günü 2a adımı.

## Sonuç yolu notu
Sonuç, görev metninin verdiği repo içi yola yazıldı: `/Users/macbook/alan/FONBRIDGE/docs/agent-results/TASK-MUOADTEOQVL4Z-se-fb.md`. Bu repoda `results:index` betiği yok, o adım atlandı.

## Temizlik
- 9 worker logunun 9'unda `graceful shutdown complete`; kalan worker süreci 0.
- `sefbad-pg` ve `sefbad-mailpit` silindi (`docker ps -a | grep -c sefbad` → 0); `wtold` ve `wtdev` worktree'leri kaldırıldı. Dal worktree'si (`wt`) merge sonrası kaldırıldı.

**Platform:** mac'te doğrulandı (darwin 27, Node 26, pgvector/pg16 konteyneri, gerçek graphile-worker, mailpit).
- Değişen kod platforma bağlı değil: Prisma sorgusu, SQL ve bir tsx betiği. Süreç öldürme, dosya yolu ya da kabuk ikilisi yok.
- Saat dilimi süreç düzeyinde sınandı (UTC−11, UTC+14, UTC ve bu makinenin +03'ü).
- **Linux koşulamadı:** üretim worker imajı bu turda kurulmadı. Koddan beklenen fark yok. T-1 testleri TZ'yi kendileri kurduğu için CI ubuntu'sunda (UTC) da etkili; `TZ=UTC` ile ölçüldü.
- **Windows koşulamadı:** makine yok. Koddan beklenen fark yok. Node'da `process.env.TZ` ataması Windows'ta da saat dilimini değiştirir (ICU); ancak bu doğrulanmadı.
