# TASK-MULQL2NYKRGJX — İNCELEME-51 düzeltmesi (B-1, B-2 + Y-1, Y-2) — se-fb

**Durum:** TAMAM, yeniden inceleme bekliyor.
**Commit'ler (dal `dev`):**
- `5e196e86` fix(m4): gün başına tek özet çökmeden sonra da korunuyor, geriye tarihli temas hatırlatmayı yeniden kuruyor
- `9229fef4` test(m4): ilk turda yaşayan 4 mutantı öldüren testler
- `dca34806` test(gdpr): purge koruması yalnız vadesi gelmiş talepleri sayıyor (İNCELEME-54 Y-2, bu kartın test dosyasından doğan flake)

## 1) Ne yapıldı

### B-1 — idempotentlik: çökme aynı gün ikinci özeti göndermiyor
Eski akış: önce tüm özetler gönderiliyor, satırlar döngü bitince kiracı başına damgalanıyordu. `mailedToday` de bu damgadan türetiliyordu. Gönderimle damga arasında ölen bir süreç, yeniden denemede aynı özeti ikinci kez gönderiyordu.

Yeni akış, kullanıcı başına sırayla:
1. **Sahiplen (claim):** Özetin kapsadığı her üyelikte `Membership.staleDigestOn = bugün (UTC)` yazılır. Bu bir compare-and-set: `findUnique` ile önceki değer okunur, `updateMany where { tenantId, userId, staleDigestOn: <okunan> }` ile yazılır, `count === 1` değilse kazanılmamıştır. Benzersiz anahtar doğal olarak (kiracı, kullanıcı, gün) olur. `@@unique([tenantId, userId])` zaten var, gün de kolonun değeri.
2. **Gönder.**
3. **Onayla:** Posta kabul edilince o özetin satırları hemen damgalanır: `staleRemindedAt = tick` ve `staleRemindedContactAt = satırın lastContactAt'i`. Damgalama 200 satırlık işlemlerle yapılır.
4. **Reddedilirse:** Sahiplenme geri verilir (`staleDigestOn` önceki değerine döner). Aynı gün sonraki bir koşu yeniden dener.

Çökme pencereleri:
- Sahiplenmeyle gönderim arasında: o gün özet gitmez, damgasız satırlar ertesi sabah gider.
- Gönderimle damga arasında: aynı gün ikinci özet **yoktur** (sahiplenme duruyor), ertesi sabah aynı satırlar bir kez daha anılır.

Yani "günde en çok bir özet" her durumda korunuyor. Kalan tek bedel, aynı ilişkinin iki ayrı günde anılması (§4 R-1).

`collectTenant` bugün sahiplenilmiş üyelikleri okuyup o kullanıcıları baştan ayırıyor. Böylece `relationshipsDue` ve `no_mail_provider` sayımı doğru kalıyor. CAS ise asıl kilit.

### B-2 — doğruluk: geriye tarihli temas yeni 60 günlük dönemi başlatıyor
Eski kural `staleRemindedAt < lastContactAt` idi, yani "temas, hatırlatma **zamanından** sonra mı?". Hatırlatmadan sonra girilip hatırlatmadan önceye tarihlenen temas ilişkiyi kalıcı susturuyordu.

Yeni kural: damga **hangi temas hakkında** hatırlatıldığını saklıyor (`Relationship.staleRemindedContactAt`). `isReminderDue` artık `stale && staleRemindedContactAt !== lastContactAt`. Tarihi ne olursa olsun, başka bir `lastContactAt` değeri yeni dönemdir.

Yazma yollarına (`relationships/actions.ts`, `m4/server/actions.ts`) dokunmak gerekmedi. Kural yazan koddan bağımsız, gelecekteki bir içe aktarma ya da düzenleme yolu da unutamaz. Damga, satırın `lastContactAt`'i okunduğundan beri değişmediyse yazılıyor (`where: { id, lastContactAt }`). Gönderim sırasında girilen bir temas yanlışlıkla "hatırlatıldı" sayılmıyor.

**Geriye doldurma** (`m4-stale-reminder-idempotency.sql`):
- `staleRemindedContactAt`, yalnız damga o temas zaten eskiyken atıldıysa doldurulur (`staleRemindedAt >= lastContactAt + 60 gün`).
- Damga mevcut temastan 60 günden az sonraysa, damga daha eski bir temas içindir. Bu tam olarak B-2 satırıdır: NULL kalır ve teması eskiyince yeniden hatırlatılır. Yani B-2'nin şimdiye kadar susturduğu satırlar da uyanıyor.
- `staleDigestOn` üyenin en son damga gününe doldurulur. Deploy günü sabah özet almış kişiye aynı gün ikincisi gitmez.

### Y-1 — ölçek (aynı turda)
- Mevcut temasıyla zaten hatırlatılmış satırlar artık `count()` ile sayılıyor. Sayfa sorgusu onları SQL'de dışlıyor: `OR [staleRemindedContactAt NULL, NOT(staleRemindedContactAt = lastContactAt)]`, Prisma field-reference ile.
- Kiracı taraması artık vadesi gelenle büyüyor, geçmişte hatırlatılan her şeyle değil.

### Y-2 — K1 alarm boşluğu (tek satır)
`k1-topic-match.ts`: alarm koşulu `scored === 0 && (topicsWithoutEmbedding > 0 || noProfileEmbedding > 0)`.

### Ek: İNCELEME-54 Y-2 flake'i (bu kartın test dosyasından doğuyordu)
- **Kök neden:** `gdpr-data-subject.live`'ın purge koruması `deletionRequestedAt` dolu **herhangi** bir kullanıcıda düşüyordu. Benim `U.gone` kullanıcım bugün talep etmiş, vadesi 30 gün sonra.
- **Düzeltme:** koruma, purge'ün kendi süzgecini kullanıyor (`lte: now − 30 gün`). Yorumu zaten "a row it did not seed is also **due**" diyordu.
- Korumanın hâlâ koruduğu doğrulandı: 40 günlük yabancı talep → test kırmızı, satır silinmedi.

### Yapılmayanlar (bilinçli)
- **D-1:** crw'nin 9 mutantından yalnız M4 koşusunu doğrudan ilgilendirenler (M2 tenantId, M6 "gün başı") yeni testlerle örtüldü (claim günü testi, `dayStartUtc`). 25 satır sınırı, silinmiş çalışma alanı ve K1 `note` gibi diğerleri bu kartın kapsamında değil.
- **D-2 / D-3 / D-4** ayrı kart ya da karar bekliyor, dokunulmadı.
- **Y-1 ek notu** (kiracı hata sınıfının log'a yazılması) yapılmadı. §5'te açık soru.

## 2) Kanıt

**Ortam:** izole DB `sefb_i51` (fabrika-postgres :5433). Sıra: `prisma db push` → `apply-migrations.sh` (38 dosya, **iki kez**, ikisi de exit 0, idempotent) → `db:rls-role` → `db:rls` (28 → 112 politika) → `db:seed`. `.env` değiştirilmedi, URL'ler yalnız ortam değişkeniyle verildi. **Paylaşılan `fabrika` DB'ye yazılmadı.** psql yerel olmadığı için `docker exec fabrika-postgres psql` sarmalayıcısı kullanıldı.

**Temiz worktree** (`git worktree add --detach … 5e196e86`, `pnpm install --frozen-lockfile`):
```
typecheck exit 0
lint exit 0                       (pnpm lint, tüm repo)
rls:check  ✅ SUCCESS
pnpm build … build exit 0         (295 satır log, hata yok)
rls:verify ✅ 47 kiracıya özel tabloda politika yerinde … fabrika_app rolüyle GERÇEKTEN ölçüldü
```

**Hedefli vitest** (izole DB, fabrika_app, `9229fef4`):
```
stale-relationship-reminder.live, topic-match-nightly.live, k1-topic-match-m4-stale,
jobs-schedule, where-guard-src, rls-coverage, users-scheduled-deletion
Test Files  7 passed (7) · Tests  91 passed (91)
```
Yeni canlı testler (hepsi gerçek Postgres, `fabrika_app`):
- **B-1 çökme:** Mailer kabul ettikten sonra bütün DB çağrıları düşüyor, süreç orada ölmüş gibi. Sonuç: `sent = [tr]`, damga yok. Aynı gün yeniden koşu: 0 posta, `skippedMailedToday 1`, kuru sayım `relationshipsDue 0`. Ertesi gün: tek posta, crashA + crashB içinde.
- **CAS:** Okuma ile yazma arasında başka bir koşu günü sahipleniyor (proxy'lenmiş tx) → 0 posta, `skippedMailedToday 1`.
- **İki eşzamanlı koşu** (`Promise.all`) → toplam tek özet.
- **Reddedilen gönderim:** sahiplenme geri veriliyor, aynı gün yeniden deneme tek özet gönderip damgalıyor.
- **Gönderim sırasında girilen temas:** damgalanmıyor.
- **B-2:** 61. günde hatırlatma. Ardından 7 gün önceye tarihli temas girildi. 59. günde yok, 60. günde özette var. Saf testte temas daha önceye tarihli olsa bile yeni dönem.
- **Y-2:** topics embedded, `noProfileEmbedding 3`, `scored 0` → üretimde `k1-topic-match:no-embeddings` alarmı.

**Mutantlar** (`scratchpad/mut.py`; her birinden sonra `git checkout`, sonda `git temiz`). İlk turda M2, M5, M10 ve M11 yaşadı. `9229fef4` testleri eklendi. İkinci tur:
```
M1  claim hiç yapılmaz                               ÖLDÜ  6 failed
M2  claim CAS koşulu düşer                           ÖLDÜ  1 failed (compare-and-set testi)
M3  bugünkü claim sınırı >= → >                      ÖLDÜ  1 failed (eşzamanlı koşu)
M4  reddedilende claim geri verilmez                 ÖLDÜ  1 failed
M5  B-2: yalnız sonraki temas yeni dönem (<)         ÖLDÜ  1 failed
M6  damga temas değişmiş satırı da damgalar          ÖLDÜ  1 failed
M7  damga hangi temas olduğunu yazmaz                ÖLDÜ  7 failed
M8  gönderim sonrası damga yapılmaz                  ÖLDÜ  8 failed
M9  Y-2 profil yarısı düşer                          ÖLDÜ  1 failed
M10 collect'te bugünkü claim okunmaz                 ÖLDÜ  1 failed (kuru sayım)
M11 sayfa sorgusu hatırlatılmışları süzmez (Y-1)     ÖLDÜ  1 failed (tam sayım 7)
M12 B-2 orijinal hata (damga zamanıyla kıyas, 4 yer) ÖLDÜ  3 failed
```
Sonuç: 12/12 öldü.

**Geriye doldurma** (izole DB, göç öncesi veri şekli, dosya iki kez uygulandı):
```
   id    | covered | null_
 r-b2    |         | t        ← temas −75, damga −70 (B-2): NULL → yeniden hatırlatılacak
 r-edge  | t       | f        ← damga tam 60. gün
 r-legit | t       | f        ← temas −80, damga −10
 r-never |         | t
 staleDigestOn 2026-09-20 = beklenen 2026-09-20
```

**Gerçek SIGKILL + gerçek graphile worker + gerçek SMTP (mailpit `sefb-mailpit`, 127.0.0.1:11126):**
```
# scratch crash.ts (fabrika_app, smtpMailer): 2. kabul edilen postadan sonra process.kill(pid,'SIGKILL')
sent 1 -> t***@example.test
sent 2 -> e***@example.test
SIGKILL before stamp            crash exit 137
DB: EN61 damgasız · sefb-en/sefb-ta staleDigestOn 2026-09-30 (claim duruyor)
mailpit total 2

# pnpm jobs:worker (JOBS_CRON_ENABLED=false, DATABASE_URL=fabrika_app, JOBS_DATABASE_URL=owner) + jobs:enqueue
DONE job=1 {"success":true,…,"relationshipsDue":1,"skippedAlreadyReminded":4,"skippedMailedToday":1,"digestsSent":1,…,"durationMs":262}
DONE job=2 {"success":true,…,"relationshipsDue":0,"skippedAlreadyReminded":5,"skippedMailedToday":1,"digestsSent":0,…,"durationMs":40}
mailpit total 3 {'x.sefb@…': 1, 'en.sefb@…': 1, 'tr.sefb@…': 1}      ← her alıcıya TEK özet
tr.sefb | FonBridge: 3 ilişkiyle 60 gündür temas yok | ['A90', 'B70', 'BD geriye-tarihli'] | script-escaped
         (A59 yok: 59 gün · BR yok: mevcut temasıyla hatırlatılmış · BD VAR: B-2 satırı)
```
**Y-1, 100 000 hatırlatılmış eski satır + 1 taze satır, aynı worker:**
```
DONE job=3 {"success":true,"tenants":4,"tenantsFailed":0,"relationshipsDue":1,"skippedAlreadyReminded":100005,…,"digestsSent":1,"durationMs":178}
mailpit: y.sefb@… 1 özet · sefb-y80 damgalandı (staleRemindedContactAt = lastContactAt → t)
```
Karşılaştırma için crw'nin ölçümü (eski kod): `tenantsFailed 1`, `durationMs 5103`, taze satır hiç gitmedi.

**İNCELEME-54 Y-2** (ikinci izole DB, HEAD `3363e10c`):
```
düzeltmesiz: gdpr-data-subject.live + stale-relationship-reminder.live ×3 → 3/3 "6 failed | 28 passed (34)"
düzeltmeli:  ×10 → 10/10 "34 passed (34)"
koruma hâlâ korur: 40 gün önce talep etmiş yabancı kullanıcı → "expected ['sefb-due', …] to deeply equal [...]", 6 failed; satır silinmedi (count 1)
```

**Temizlik:** Worker'ım (kendi pid'im) SIGTERM ile kapatıldı: "Global graceful shutdown complete". `sefb-mailpit` silindi, `sefb_i51` iki kez DROP edildi, iki worktree kaldırıldı. Başka sürece dokunulmadı.

## 3) Değişen dosyalar
- `prisma/migrations/m4-stale-reminder-idempotency.sql` (+ `.down.sql`), `prisma/migrations/apply-order.txt`, `docs/RELEASE_CHECKLIST.md` (sıra listesi)
- `prisma/schema.prisma`: `Membership.staleDigestOn DateTime? @db.Date`, `Relationship.staleRemindedContactAt DateTime?`
- `src/lib/relationships/stale.ts` (`isReminderDue`)
- `src/lib/relationships/stale-reminder.ts` (claim → gönder → damga, SQL süzgeci, parça parça damga)
- `src/lib/jobs/tasks/k1-topic-match.ts` (Y-2)
- `tests/stale-relationship-reminder.live.test.ts`, `src/lib/jobs/tasks/__tests__/k1-topic-match-m4-stale.test.ts`, `tests/where-guard-src.test.ts` (KNOWN: eski `in: ids` çıktı, 3 gerekçeli giriş eklendi)
- `tests/gdpr-data-subject.live.test.ts` (İNCELEME-54 Y-2 koruma süzgeci)

Paralel çalışanların kirli dosyalarına (m11, rag, messages, upload route) dokunulmadı. Her commit `git commit -- <yollar>` ile atıldı ve `git show --name-only` ile doğrulandı.

## 4) Riskler
- **R-1 (bilinçli):** Gönderimle damga arasında çökme olursa aynı gün ikinci özet gitmez, ama o satırlar ertesi sabah bir kez daha anılır. "Önce damgala, sonra gönder" bunun tersini yapar: çökme hatırlatmayı sonsuza dek kaybettirir. "Kaçırmaktansa iki gün üst üste söylemek" tercih edildi.
- **R-2:** Sahiplenmeyle gönderim arasında çökme olursa o kullanıcıya o gün özet gitmez, ertesi gün gider.
- **R-3:** Audit satırı (kiracı başına sayılar) koşu sonunda yazılıyor. Çökme olursa o koşunun audit'i eksik kalır, damgalar doğrudur.
- **R-4 (davranış değişikliği):** Artık **her** `lastContactAt` değişikliği yeni bir dönemdir, zaten eskimiş bir tarihe geri çekmek de dahil. `relationships/actions.ts:188` `lastContactAt = data.at`'i koşulsuz yazıyor. Kullanıcı daha eski bir etkileşim kaydederse `lastContactAt` geriye gidebilir (önceden var olan davranış). O satır ertesi sabah yeniden hatırlatılır. B-2'nin istenen tarafı bu, ama "son temas geriye gidiyor" ayrı bir soru (§5 S-1).
- **R-5:** Geriye doldurma kuralı, iş tick'inin "temas + 60 gün"den önce damga atmamasına dayanıyor. Kod bunu garanti ediyor (`lte: cutoff`), elle yazılmış damga varsa yanlış sınıflanabilir.

## 5) Açık sorular
- **S-1:** `addInteraction` / `logInteraction` `lastContactAt`'i en yeni temasa göre mi (`max`) yazmalı? Şu an son girilen kaydın tarihi yazılıyor. Ayrı kart önerisi, M4 sahibi.
- **S-2:** Y-1 ek notu: kiracı hatasının kimlik taşımayan sınıfı (ör. Prisma `P2028`) SystemAlert meta'sına yazılsın mı? Şema `errors`'ı bilerek atıyor. Ürün ya da operasyon kararı.
- **S-3:** D-2 (abonelikten çıkma), D-3 (K1 `NULLS NOT DISTINCT`), D-4 (K1 toplu güncelleme) crw'nin önerdiği ayrı kartlarda.

## 6) Sonraki adım
- crw-fb yeniden inceleme: B-1 için çökme betiği (crw'nin `crash.ts`'i bu dalda 2 posta, ardından worker 1 posta ve alıcı başına tek özet vermeli), B-2 için geriye tarihli temas, Y-1 için 100 bin satır.
- Deploy: `apply-order.txt` sonuna eklenen `m4-stale-reminder-idempotency.sql` kod deploy'undan **önce** uygulanmalı (yeni kod iki kolonu okuyor).

**Platform:** mac (darwin 27, Node 26.5, Postgres 16 + pgvector konteyneri, graphile-worker 0.18, mailpit) üzerinde doğrulandı. Değişen kod platforma bağlı değil: süreç, dosya yolu ya da kabuk yok, yalnız Node + Prisma + SQL, gün sınırı UTC (`dayStartUtc`). SIGKILL yalnız benim test sürecime gönderildi. **Linux koşulamadı:** üretim worker imajı (Dockerfile `worker` hedefi) bu turda kurulmadı. Koddan beklenen fark yok, graphile kapanışı ve Postgres CAS platformdan bağımsız. **Windows koşulamadı:** makine yok. Koddan beklenen fark yok.
