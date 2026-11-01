# TASK-MUNRATZ4A1Z6V — İNCELEME-64: se-fb teardown bekçisi düzeltmesi (be-fb)

**Durum:** TAMAM
**Karar:** ONAY
**İncelenen kart:** TASK-MUNQ9IGG6R59R. Test commit'i `8765d957`, dev merge'ü `8abfffcd`, se-fb raporu `47f75927`.
**Platform:** yalnız macOS'ta doğrulandı (Darwin 27, Node 26.5, pnpm 11.25, pgvector/pgvector:pg16 konteyneri). Linux (CI ubuntu-latest) ve Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var. İncelenen değişiklik tek bir test dosyasında: Proxy ve Prisma çağrıları. Süreç, dosya yolu ya da kabuk kullanmıyor, yani platforma bağlı değil. Kurulumda platforma bağlı tek parça benim psql sarmalayıcım (aşağıda). CI'da psql ubuntu-latest'te hazır geldiği için orada gerekmiyor.

## 1. Ne yapıldı
- Worktree: `git worktree add --detach <scratchpad>/wt64 dev` (HEAD `fbce5bd6`, `8abfffcd`'yi içeriyor). Kod değiştirilmedi. Mutasyonların hepsi `git checkout --` ile geri alındı.
- İzole DB: kendi konteynerim `befb-i64-pg` (`--rm`, 127.0.0.1:55464, DB `fabrika`). Paylaşılan `fabrika-postgres` (:5433) kullanılmadı. Kurulum ci.yml'deki "Prepare database" adımıyla aynı: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 → `db:rls` → `db:seed`. Makinede `psql` olmadığı için `PSQL` değişkenine, konteynerin içindeki psql'i çağıran bir sarmalayıcı verdim (`docker exec -i … psql -f - < dosya`).
- Koşum ortamı: `CI=true`, `AUTH_SECRET='ci-vitest-auth-secret-fixture-not-for-any-deployment'` (ci.yml Test adımındaki değer), `DATABASE_URL=postgresql://fabrika:***@localhost:55464/fabrika`, `DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@localhost:55464/fabrika`.
- İş bitince konteyner durduruldu (`--rm` olduğu için silindi) ve worktree kaldırıldı. Elle silme yapılmadı. DB'ye testlerin kendi yazdıkları dışında hiçbir şey yazılmadı.

## 2. Kanıt

### Madde 1 — Bekçi yeşil mi, bekçi dosyası değişmemiş mi?
```
$ git diff 9229fef4..dev -- tests/teardown-where-guard.test.ts tests/helpers/where-guard-scan.ts | wc -l
       0
$ git log --oneline 9229fef4..dev -- tests/teardown-where-guard.test.ts tests/helpers/where-guard-scan.ts
(boş)
```
Bekçi testi ve tarayıcı yardımcısı hiç değişmemiş. İstisna ya da satır yorumu eklenmemiş.

DB kurulumu: `==> [38/38] m4-stale-reminder-idempotency.sql`, `MIG1=0`, `MIG2=0`, `Policies in public: 28 → 112`, `RLS=0`, `SEED=0`.

```
$ vitest run tests/teardown-where-guard.test.ts tests/stale-relationship-reminder.live.test.ts --reporter=verbose
✓ … teardown-where-guard … > no test file in the repo has an unguarded where 618ms
✓ … (bekçinin diğer 5 testi)
✓ … > two runs racing for the same day send one digest (the claim is a compare-and-set) 34ms
✓ … > the claim is a compare-and-set: a run that loses the race between its read and its write sends nothing 33ms
Test Files  2 passed (2)
Tests  20 passed (20)          # 6 bekçi + 14 stale-reminder, hepsi ✓, ↓ (atlanan) yok
```

### Madde 2 — Test hâlâ gerçek bir yarışı sınıyor mu?
Koddaki claim (`src/lib/relationships/stale-reminder.ts:231-242`) şöyle çalışıyor. `findUnique` ile `select: { staleDigestOn: true }` okunuyor. Sonra `updateMany({ where: { tenantId, userId, staleDigestOn: m.staleDigestOn } })` çalışıyor. `count === 1` değilse sonuç `false`.

Testteki Proxy yalnız `select.staleDigestOn` içeren `findUnique` çağrısını yakalıyor (`recipientFor`'un select'inde bu alan olmadığı için o çağrıya dokunmuyor). Proxy önce gerçek okumayı yapıyor, sonra ayrı bağlantı olan `admin` ile günü rakip koşu adına alıyor, en son eski değeri döndürüyor. Kodun `updateMany`'si sarılmıyor. Rakibin yazması commit'lendi. Kodun tx'i READ COMMITTED'da olduğu için `updateMany` satırı yeniden değerlendiriyor, CAS koşulu tutmuyor ve `count` 0 dönüyor. Yarış gerçek.

Testte kalan doğrulamalar: `raced === true`, `sent` uzunluğu 0, `skippedMailedToday === 1`, `casA` damgası `null`. Hepsi yeşil (yukarıda). Rakip yazmanın sonucu gerçekten belirlediğini T1 mutantı gösteriyor (aşağıda).

### Madde 3 — Mutasyonlar (her biri kendim yapıldı, sonra `git checkout --` ile geri alındı, `git diff --stat` boş)
| # | Mutasyon | Sonuç |
|---|---|---|
| M1 | `stale-reminder.ts:238` `where: { tenantId, userId, staleDigestOn: m.staleDigestOn }` → `where: { tenantId, userId }` (CAS koşulu silindi) | **KIRMIZI**: `× the claim is a compare-and-set…`, `AssertionError: expected [ { …(4) } ] to have a length of +0 but got 1`, `Tests 1 failed \| 13 passed (14)` |
| M2 | `:241` `count === 1 ? {…} : false` → her zaman `{ previous: … }` | **KIRMIZI**: aynı test, `… to have a length of +0 but got 1` |
| M4 | `:234` `select: { staleDigestOn: true }` silindi (claim okumasının biçimi değişti) | **KIRMIZI**: `AssertionError: expected false to be true` (`raced`). se-fb'nin 4. riskte söylediği gibi sessizce geçmiyor, sesli kırmızı |
| T1 | Testte rakibin `admin.membership.updateMany(...)` satırı silindi | **KIRMIZI**: `… to have a length of +0 but got 1`. Test yarış olmadan geçemiyor, yani rakip yazma sonucu belirliyor |
| M3 | `:238` `staleDigestOn: m.staleDigestOn ?? undefined` (önceki değer null ise Prisma anahtarı düşürür) | **YEŞİL kaldı**, `Tests 14 passed (14)` → Ö-1 |

### Madde 4 — Bekçiyi atlatan yeni bir kalıp var mı?
- se-fb'nin diff'i: `updateMany`'ye `where: args` aktarımı kaldırılmış. Yeni Proxy yalnız `findUnique`'i sarıyor. `findUnique` okuma yaptığı için bekçinin kapsamında değil ve olması da gerekmiyor. Kalan tek yazma `admin.membership.updateMany({ where: { tenantId, userId: U.tr }, … })`. Bu satır daha önce de vardı ve değişmedi. `tenantId`, `withTenant(tenantId, …)` argümanı olduğu için bekçinin kuralına göre geçerli. `U`, alanları sonradan yazılmayan bir `const` nesne (`tests/stale-relationship-reminder.live.test.ts:68`).
- Repo taraması: `/usr/bin/grep -rnE "new Proxy|Reflect\.apply|\[prop\]\(|\.\.\.args\)|target\.(update|delete)Many" tests src`. Kalan Proxy ve aktarıcılar şunlar: `invitation-mail-limit.live.test.ts` (`upsert` kapısı), `users-scheduled-deletion.test.ts` / `k1-adapters.test.ts` (DB'siz `vi.fn` mock'ları), `server-action-rbac.test.ts` / `pipeline-actions-pilot-digest.test.ts` (erişilemez-prisma Proxy'leri). `git log 9229fef4..dev` bu dosyalardan hiçbirinin bu aralıkta değişmediğini gösteriyor. Hiçbiri gerçek DB'ye filtresiz `deleteMany`/`updateMany` aktarmıyor.
- Tarayıcıyı (`unguardedWheres`) geçici bir probe testiyle denedim. Probe dosyası silindi, `git status` boş.
  ```
  PROBE forwardArgs ["forwardArgs.test.ts:1 where: args (not a const object literal)"]   # eski kalıp: yakalanıyor
  PROBE bindSpread []                                                                     # tx.m.updateMany.bind(tx.m) + um(...a): yakalanmıyor
  PROBE reflectGet []                                                                     # Reflect.get(tx.m,'updateMany')(...a): yakalanmıyor
  ```
  Bu iki kalıp repoda **hiç kullanılmıyor**: `grep -rlE "(delete|update)Many(AndReturn)?\.bind|Reflect\.get\([^)]*'(delete|update)Many" tests src` → `grep_exit=1`. Bilinen-pozitif kontrolü (`updateMany` araması) sonuç döndü. Bu açıklar bekçide önceden de vardı; se-fb getirmedi → Ö-2.

### Madde 5 — Tam koşum
**stale-reminder izole DB'de tam:** 14/14 ✓, atlanan yok (Madde 1'deki çıktı).

**`CI=true pnpm test`, 1. koşu** (başlangıçta yük ortalaması 4.67):
```
exit=0
 Test Files  256 passed | 2 skipped (258)
      Tests  3122 passed | 9 skipped (3131)
```
**3131 toplam / 3122 geçen / 0 başarısız / 9 atlanan.** se-fb'nin 3095/0/9 sonucundan 27 fazla. Sebep: dev o merge'den sonra ilerledi (`8abfffcd..dev` içinde cs-fb'nin RBAC merge'ü `62fd07c2` var, +1 test dosyası). Atlanan sayısı aynı.

**Atlanan 9 test** (2. koşunun JSON'undan; se-fb'nin 5. açık sorusunun yanıtı): `tests/adapters.test.ts` 2, `tests/k1-daily-calls.test.ts` 4, `tests/k1-embeddings.live.test.ts` 1, `tests/sedia-adapter.test.ts` 2. Stale-reminder ya da bekçiyle ilgisi yok.

**2. koşu** (JSON reporter ile, yük ortalaması koşu sırasında **120.68**'e çıktı, başka pane'ler çalışıyordu): `Test Files 17 failed | 239 passed | 2 skipped`, `Tests 20 failed | 3097 passed | 9 skipped (3126)`. Hataların dağılımı: 17× `Test timed out in 5000ms`, 1× `stripe-event-retention.live` "Postgres is unreachable" (dosya düzeyinde, bağlantı zaman aşımı), 1× `expected 5575.97 to be less than 3000` (süre bütçesi), 1× `PdfLimitError parse_too_heavy` (zaman bütçesi). Hiçbiri stale-reminder ya da bekçide değil.
- Düşen 17 dosya ayrı koşuldu (yük 47–99): 10 dosya geçti, 7 dosyada kalan hatalar zaman aşımı ya da süre bütçesi.
- Bu 7 dosya `--maxWorkers=1` ile koşuldu (yük 36): 4 dosya geçti, 3 dosya hâlâ zaman aşımında.
- Son 3 dosya `--maxWorkers=1 --testTimeout=60000` ile: `Test Files 3 passed (3)`, `Tests 48 passed (48)`, exit 0.

Sonuç: 2. koşunun kırmızısı makinenin yükünden geliyor, incelenen değişiklikle ilgisi yok. Aynı commit ve aynı DB'de, düşük yükteki 1. koşu 0 hatayla bitti.

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUNRATZ4A1Z6V-be-fb.md` (bu rapor). Kod ve testte değişiklik yok.

## 4. Riskler / Gözlemler (hiçbiri ONAY'ı engellemiyor)
- **Ö-1 (kapsam boşluğu, önceden de vardı):** CAS testi yalnız önceki `staleDigestOn` değeri **dolu** olan yolu sınıyor. U.tr daha önceki testlerde başka günlerde mail aldığı için değer null değil. İlk kez digest alan kullanıcıda (`staleDigestOn = null`) yarışan yol sınanmıyor. M3 (`?? undefined`) bu yüzden hayatta kaldı. Oysa bu yolda Prisma anahtarı düşürür ve CAS tamamen kaybolur. Önerim: taze bir kullanıcıyla (staleDigestOn null) aynı Proxy'yi kullanan ikinci bir yarış testi. Bu, se-fb'nin işinin kapsamı dışında ayrı bir kart olarak açılabilir.
- **Ö-2 (bekçi açığı, önceden de vardı):** `unguardedWheres`, `x.updateMany.bind(x)` + spread ile yapılan çağrıyı ve `Reflect.get(x, 'updateMany')(...)` kalıbını yakalamıyor. Bu kalıplar şu an repoda yok. Bekçinin sahibi Ö-1 kaçış listesine bu iki biçimi ekleyebilir.
- **Ö-3:** Tam koşum yüklü makinede zaman aşımlarıyla kırmızıya dönebiliyor (se-fb de aynısını gördü). CI'da benzer bir sinyal çıkarsa CPU-yoğun özellik ve süre bütçesi testleri ayrı bir iş olarak ele alınmalı.

## 5. Açık sorular
- Yok. se-fb'nin açık sorusu (atlanan 9 test hangileri) yukarıda yanıtlandı.

## 6. Sonraki adım
- Lider: `8765d957` ONAY. Push liderde.
- İsteğe bağlı ayrı kartlar: Ö-1 (null-önceki-değer yarış testi), Ö-2 (bekçiye bind ve Reflect.get kalıpları).
