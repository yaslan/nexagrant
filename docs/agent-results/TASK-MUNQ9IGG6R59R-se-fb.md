# TASK-MUNQ9IGG6R59R — teardown-where-guard kırmızısı düzeltmesi (se-fb)

**Durum:** TAMAM
**Platform:** yalnız macOS (Darwin 27, Node 26.5, pnpm 11.25) üzerinde doğrulandı. Değişiklik yalnız bir test dosyasında; platforma bağlı kod yolu yok (süreç, dosya yolu, kabuk kullanılmıyor). Linux (CI ubuntu-latest) ve Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koddan: Proxy ve Prisma çağrıları platformdan bağımsız.

## İnceleme notu (crw-fb, İNCELEME-56)
Bu düzeltme TASK-MULQL2NYKRGJX'in (9229fef4) üzerine **ayrı bir commit**:
- `8765d957` test(stale-reminder): race the CAS at the claim's read, not by forwarding updateMany args
- `8abfffcd` dev'e merge (--no-ff). push YOK.

## 1. Ne yapıldı
Bekçinin bulgusu: `tests/stale-relationship-reminder.live.test.ts:395`, `where: args (not a const object literal)`. "the claim is a compare-and-set" testindeki Proxy, `tx.membership.updateMany` çağrısını yakalıyor ve `target.updateMany(args)` ile olduğu gibi aktarıyordu.

**Seçilen yol:** yarış artık başka bir noktada simüle ediliyor (görevdeki ikinci örnek). Proxy `updateMany` yerine claim'in **okumasını** sarıyor: `findUnique` çağrısı `select.staleDigestOn` içeriyorsa önce gerçek okuma yapılıyor, ardından rakip koşu `admin.membership.updateMany({ where: { tenantId, userId: U.tr }, … })` ile günü alıyor, sonra eski değer döndürülüyor. Kodun kendi `updateMany`'si hiç sarılmıyor ve kendi `where`'i ile çalışıyor.

**Neden örnekteki "sabit literal where kur" yolu seçilmedi:** `{ where: { tenantId, userId: U.tr, … }, data: args.data }` biçiminde test kendi `where`'ini kurardı. Bu durumda kaynaktaki CAS koşulu (`staleDigestOn: m.staleDigestOn`) teste hiç ulaşmaz. CAS'ı bozan mutasyon testi kırmızıya çeviremez, yani 3. madde tutmaz. Okuma noktasında yarış kurunca kaynağın CAS'ı gerçekten sınanıyor (aşağıda mutasyon kanıtı var).

- Bekçi (`tests/teardown-where-guard.test.ts`, `tests/helpers/where-guard-scan.ts`) **değişmedi**. Genel istisna eklenmedi, satır yorumu da kullanılmadı (2. madde gereksiz kaldı).
- Testin anlamı korundu: `raced === true`, `sent.length === 0`, `skippedMailedToday === 1`, `casA` damgası `null`. Kaynak koddaki `findUnique` erişim kontrolü (satır 103) `staleDigestOn` seçmediği için yarışı tetiklemiyor, dolayısıyla doğrudan geçiyor.

## 2. Kanıt
İzole DB: kendi konteynerim `sefb-q9i-pg` (pgvector/pgvector:pg16, 127.0.0.1:55491, DB `fabrika`). Paylaşılan `fabrika-postgres` (:5433) kullanılmadı. Kurulum CI'daki "Prepare database" adımıyla aynı: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 (38 dosya, iki geçiş de exit 0) → `db:rls` (Policies 28 → 112) → `db:seed`. Koşum ortamı: `DATABASE_URL=postgresql://fabrika:***@localhost:55491/fabrika`, `DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@localhost:55491/fabrika`, `CI=true`, `AUTH_SECRET` = ci.yml'deki test değeri. İş bitince konteyner durduruldu (`--rm`). Silme yapılmadı; testlerin kendi teardown'ları dışında DB'ye elle yazılmadı.

**Bekçi, önce (leed-fb, dev 30.09 09:31):** `1 failed | 5 passed`.
**Bekçi, sonra (worktree ve merge sonrası dev):**
```
 Test Files  1 passed (1)
      Tests  6 passed (6)
```
**Bekçi + stale-reminder (izole DB, verbose, atlama yok):**
```
 ✓ … > the claim is a compare-and-set: a run that loses the race between its read and its write sends nothing
 ✓ … > two runs racing for the same day send one digest (the claim is a compare-and-set)
      Tests  20 passed (20)      # 14 stale-reminder + 6 guard, hepsi ✓, ↓ yok
```
**Mutasyon (3. madde):** `src/lib/relationships/stale-reminder.ts` claimDigest `where: { tenantId, userId, staleDigestOn: m.staleDigestOn }` → `where: { tenantId, userId }`:
```
     × the claim is a compare-and-set: a run that loses the race between its read and its write sends nothing
AssertionError: expected [ { …(4) } ] to have a length of +0 but got 1
      Tests  1 failed | 13 passed (14)
```
Sonra `git checkout -- src/lib/relationships/stale-reminder.ts` ile geri alındı, `git diff --stat src` boş.

**Tam koşum (`CI=true pnpm test`, izole DB):**
- 1. koşu (varsayılan paralellik, makinede yük ortalaması 18–30 / 12 çekirdek): `Test Files 12 failed | 243 passed | 2 skipped (257)`, `Tests 18 failed | 3072 passed | 9 skipped (3099)`. Başarısızlıkların hiçbiri dokunduğum dosyada değil. Hatalar: 11× `Test timed out in 5000ms`, 1× 30000ms, 1× 120000ms, 1× `Connection terminated due to connection timeout` (pipeline-surface dosya düzeyinde düştü; bu yüzden toplam 3099), 1× PdfLimitError `parse_too_heavy` (zaman bütçesi). Bunlar property/fuzz ve pdf testleri.
- Bu 12 dosya tek başına yeniden koşuldu: `Test Files 12 passed (12)`, `Tests 174 passed (174)`. Yani kırmızılar yük kaynaklı zaman aşımı.
- 2. koşu (`pnpm test --maxWorkers=4`):
```
 Test Files  255 passed | 2 skipped (257)
      Tests  3095 passed | 9 skipped (3104)
test exit 0
```
**total 3104 / passed 3095 / failed 0 / skipped 9.**

**`pnpm typecheck`** → `tsc --noEmit`, exit 0.
**`pnpm lint`** → `eslint`, exit 0 (çıktı yok).

## 3. Değişen dosyalar
- `tests/stale-relationship-reminder.live.test.ts` (+8 / −4). Yalnız bu dosya; commit `git commit -- <yol>` ile alındı.
- `docs/agent-results/TASK-MUNQ9IGG6R59R-se-fb.md` (bu rapor)

## 4. Riskler
- Proxy, claim okumasını `select.staleDigestOn` üzerinden tanıyor. Kaynakta claimDigest'in okuması başka bir biçime geçerse (ör. `findFirst`, ya da select'siz okuma) yarış tetiklenmez. Bu sessiz bir geçiş olmaz: `expect(raced).toBe(true)` testi kırmızıya çevirir.
- Tam koşum bu makinede varsayılan paralellikte zaman aşımlarıyla kırmızı olabiliyor. Bu değişiklikle ilgisi yok, ama 1 Ekim öncesi CI koşusunda zaman aşımları görülürse ayrı iş olarak ele alınmalı (property testleri 5 sn sınırında).

## 5. Açık sorular
- 9 atlanan test (2 dosya) varsayılan reporter'da adıyla görünmüyor. Bu işin kapsamında incelenmedi. stale-reminder ve guard dosyalarında atlanan yok (verbose ile doğrulandı).

## 6. Sonraki adım
- crw-fb İNCELEME-56'da `8765d957`'yi ayrı commit olarak değerlendirsin.
- Push liderde (1 Ekim).
