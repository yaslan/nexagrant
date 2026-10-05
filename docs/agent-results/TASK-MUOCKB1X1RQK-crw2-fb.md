# TASK-MUOCKB1X1RQK — FB İNCELEME-106 (crw2-fb)

**Durum:** TAMAM

**Karar:** **DÜZELTME GEREKLİ, ama bloke eden bulgu yok.** 1 orta bulgu var (Y-1, yalnız belge). Bu bulgu tespit kontrolünün temel varsayımını ölçerek çürütüyor. Ayrıca 3 öneri (Ö-1..Ö-3) var. Kod doğru; tablo, sıra ve geri dönüş sayımı ölçümle doğrulandı. İNCELEME-102'nin Ö-1..Ö-4'ü de uygulanmış.

İncelenen: TASK-MUOBQUZJGRYV9 (crw-fb), 3d5223d2, dev merge c4b0cc2d. Dosya: `docs/RELEASE_CHECKLIST.md` §3.1 2a, "Claim taşıma penceresi", "Tespit", "`legacyClaims` ne zaman kaldırılır", §3.3.

## 1. Ne yapıldı
Belgeyi bir operatör gözüyle okudum. Her iddiayı kodla ya da izole bir DB'de ölçerek karşılaştırdım.

### 1.1 Metin ve kod karşılaştırması (denetim 1)
| Belgedeki iddia | Kaynak | Sonuç |
|---|---|---|
| Yeni sürüm `User.staleDigestOn`'a yazar ve bugünkü `Membership` claim'ini de okur | `stale-reminder.ts:135-141` (`legacyClaims`, `gte: dayStartUtc(now)`), `:252-261` (`claimDigest` → `User`), `:392` (`legacy` → `mailedToday`) | doğru |
| Eski sürüm (f7a6dcf5 öncesi) yalnız `Membership`'i okur ve yazar | `git show f7a6dcf5^:src/lib/relationships/stale-reminder.ts` satır 165, 240-247, 265, 283-284 | doğru |
| Yeni sürüm **kodu** `Membership.staleDigestOn`'a hiç yazmaz | `src/`, `scripts/`, `prisma/` içinde `staleDigestOn` araması: `src` içinde yalnız okuma var | kod için doğru. **Migration zinciri için yanlış → Y-1** |
| Kaçan tik `fill=6h` ile, doldurma `last_execution`'dan başlar, iki sürüm aynı cron kimliğini paylaşır | `schedule.ts:94-100` (`id=m4-stale-relationships`, `0 7 * * *`, `fill: '6h'`) | doğru (Ö-2 ifadesi düzeldi) |
| SIGTERM → iş biter, `graceful shutdown complete` yazılır | graphile-worker 0.18.0 `dist/main.js:106-114`: info seviyesinde `Global graceful shutdown complete; killing self via SIGTERM`. `gracefulShutdownAbortTimeout` 5 sn yalnız `abortSignal`'ı tetikler. M4 görevi bu sinyali okumaz (`define.ts`, `m4-stale-relationships.ts`), bu yüzden iş biter. `worker.js:36-51` `release()` aktif işin sözünü döndürür. | doğru. Alt dize `grep` ile eşleşir. |
| Kilit 4 saat sonra düşer | `dist/sql/resetLockedAt.js:9` `locked_at < now - interval '4 hours'` | doğru |
| Log satırı `[m4-stale-relationships] DONE … "digestsSent":N` | `define.ts:54-55` (`DONE` / `DONE (reported failure)`, ikisi de `'\] DONE'` ile eşleşir), `summary()` 600 karakterde keser. `digestsSent`, `errors`'tan önce gelir ve şema `errors`'ı atar. f7a6dcf5^ ile HEAD arasında `define.ts`, görev dosyası ve `schedule.ts` değişmemiş. | doğru, iki sürümde de aynı |
| Worker kuyruğa `JOBS_DATABASE_URL` (yoksa `DATABASE_URL`) ile bağlanır | `worker.ts:15-17` | doğru |
| Down dosyası `User.staleDigestOn`'u düşürür | `m4-stale-digest-user-claim.down.sql:18` | doğru |
| Kolon düşürülünce eski worker `tenantsFailed` verir ve özet göndermez | eski `collectTenant` sorgusu `withTenant` içinde, `try/catch` → `tenantsFailed++` | koddan doğru, ölçülmedi |

### 1.2 Uygulanabilirlik (denetim 2)
Sıra (1 push → 2 rol → 2a durdur/kontrol/taban → 3 migrate → … → §3.3 worker) tutarlı. 2a (c) doğru yerde, 3. adımdan önce. İlk kurulum dalı (Ö-1) açık. `docker stop -t 300` + Dockerfile `CMD ["node_modules/.bin/tsx", …]` (PID 1 tsx, sinyali çocuğa iletir) + compose `restart: unless-stopped` (elle durdurulan konteyner yeniden kalkmaz) birlikte çalışır. Eksikler Ö-1..Ö-3'te.

### 1.3 Sorgular gerçekten koşuyor mu (denetim 3)
Hepsi izole DB'de, **belgeden birebir çıkarılan** SQL ile koşuldu (awk ile heredoc gövdeleri; `-ekler/m4-claims.sql`, `-ekler/m4-double.sql`):
- `m4-claims.sql`, `m4-double.sql` sahip rolüyle (süper kullanıcı değil, BYPASSRLS değil) çalışıyor. FORCE RLS altında `enter_system_scope` satırı gerekli.
- `SELECT count(*) FROM graphile_worker.jobs WHERE locked_at IS NOT NULL;` → `0` (0.18.0 şeması, `--schema-only`).
- `pg_stat_activity` sorgusu çalışıyor (bkz. Ö-1).
- Geri dönüş sayımı (down öncesi `m4-user-today.txt`, gün sonunda `comm -12`) doğru kullanıcıyı buluyor. Down sonrasında `m4-double.sql`'in hata verdiği iddiası da doğru.
- **Tespit (`comm -13`) ve `m4-double.sql` sayımı yanlış pozitif veriyor** → Y-1.

### 1.4 Ö-1..Ö-4 (denetim 4)
İNCELEME-102 (`TASK-MUOB16SD93PD9-crw-fb.md` §Ö-1..Ö-4) ile belge karşılaştırıldı:
| Madde | Durum |
|---|---|
| Y-1 (tek yön) | uygulanmış: 2a ZORUNLU, 3 satırlı sıra tablosu, "2a atlansa da ikinci özet gitmez" cümlesi yok |
| Ö-1 (ilk kurulum + durma kontrolü + `docker stop -t`) | uygulanmış (satır 124-126); 300 varsayım olarak işaretli |
| Ö-2 (fill mekanizması) | uygulanmış (satır 158) |
| Ö-3 (kafa karıştıran madde) | uygulanmış: madde kaldırılmış, yerine "yeniden koşmak ters yönü kapatmaz" cümlesi gelmiş. Doğru. |
| Ö-4 (kaldırma kapsamı + push sırası) | uygulanmış (satır 191-197): 3 koşul, 10 `tsc` hatası (B-1, T-3, eski üyelik testi), push sırası kolon kaldırma kartına açık soru olarak bırakılmış |

## 2. Bulgular (önem sırasıyla)

### Y-1 (orta, belge / operasyon) — Migration zinciri `Membership.staleDigestOn`'a yazıyor; tespit kontrolü ve `m4-double.sql` sayımı yanlış alarm veriyor
- **Yer:** `docs/RELEASE_CHECKLIST.md:164` ("Yeni sürüm `Membership.staleDigestOn`'a hiç yazmaz. Bu yüzden 3. adımdan sonra o kolona düşen her yeni claim, eski bir worker'ın hâlâ koştuğunu gösterir"), `:172` (ertesi gün "tamamen boş"), `:176-189` (müdahale ve sayım), `:193` (`legacyClaims` kaldırma koşulu 1). Kaynak: `prisma/migrations/m4-stale-reminder-idempotency.sql:54-64`.
- **Mekanizma:** `scripts/apply-migrations.sh` her koşuda 41 dosyanın hepsini uygular (`apply-order.txt:50`). `m4-stale-reminder-idempotency.sql` şu backfill'i içerir: `UPDATE "Membership" SET "staleDigestOn" = max("staleRemindedAt")::date … WHERE m."staleDigestOn" IS NULL`. Yeni sürüm özet gönderince `stampRows` `Relationship.staleRemindedAt = now` yazar (`stale-reminder.ts:316`), `Membership`'e dokunmaz. Kolonu NULL olan bir üyelik (yeni sürümden ilk özetini alan her kullanıcı; eski sürümden hiç özet almamış olanlar) zincirin bir sonraki koşusunda **bugünün tarihini** alır. Yani yazan, eski worker değil, 3. adımın kendisidir.
- **Senaryo:** Yayın günü D. Yeni worker 07:00'de uN'ye özet gönderir. Aynı gün 07:00'den sonra zincir yeniden koşulur: ikinci bir yayın ya da hotfix, ya da operatör "iki kez koşmak güvenli" diye yeniden koşar. D+1'de 07:00'den sonraki bir yayında da aynı şey olur.
  1. Tespit `comm -13` → `uN` → belge "eski worker hâlâ koşuyor, hemen bulun" der. Eski worker yoktur.
  2. `m4-double.sql | comm -23 … | wc -l` → `1` → belge bunu "ikinci özet gitti" diye yayın notuna yazdırır. Gerçekte ikinci özet gitmemiştir.
  3. Kaldırma koşulu 1 ("yayından sonraki bir günde `m4-claims.sql` boş") 07:00'den sonra yayın yapılan her gün yanlışlıkla boş olmaz.
- **Ölçüm** (`-ekler/y1.sh`, `-ekler/y1.txt`; sahip rolü `own super=false bypassrls=false`). Durum: uN'nin `Membership` kolonu NULL; uO'nunki dün (eski sürümden). İkisinin de `User` claim'i bugün, `Relationship.staleRemindedAt` = şimdi (yeni sürümün `stampRows` sonrası durumu):
  ```
  before (m4-claims.sql): []
  apply-migrations exit=0
  after  (m4-claims.sql): [uN]
  comm -13 (checklist 'boş olmalı'): [uN]
  m4-double.sql | comm -23 - before | wc -l = 1
  mN|2026-09-30        ← zincir yazdı (NULL → bugün)
  mO|2026-09-29        ← NULL değildi, dokunulmadı (NULL koruması)
  ```
  Hiçbir eski worker koşmadı. İkinci özet gitmedi.
- **Neden bloke değil:** Kod doğru ve e-posta davranışı değişmiyor. Bu satır `legacyClaims`'e görünür, ama `User` claim'i zaten var olduğu için zararsızdır. Yanlış alarm yalnız zincir 07:00'den sonra yeniden koşulursa oluşur. Ters durum (gerçek eski worker'ı kaçırmak) oluşmaz: yanlış pozitif var, yanlış negatif yok.
- **Önerilen düzeltme (yalnız belge):** 164. satırdaki cümleyi şöyle daraltın: "Yeni sürümün **kodu** o kolona yazmaz. Ama `apply-migrations.sh` her koşuda `m4-stale-reminder-idempotency.sql` backfill'ini de koşar ve NULL üyeliklere son damga gününü yazar." Ayrıca bir kural ekleyin: "Tespit penceresinde (yayın günü ve ertesi gün) 07:00 UTC'den sonra `apply-migrations.sh`'i yeniden koşmayın. Koştuysanız `m4-claims.sql` sonucu güvenilir değildir; eski worker'ı log (`[m4-stale-relationships] DONE`) ve `pg_stat_activity` ile arayın. `m4-double.sql` sayısını yayın notuna yazmayın." Kaldırma koşulu 1'e de "zincirin 07:00'den sonra koşmadığı bir gün" şartını ekleyin. Kalıcı çözüm için ayrı bir kart açılabilir (kod, kapsam dışı): backfill yalnız `User.staleDigestOn` kolonu yokken ya da tümü NULL iken koşsun. Bunu önermiyorum: kolon kaldırma kartı bu dosyayı zaten ele alacak.

### Ö-1 — `pg_stat_activity` ile eski worker'ı ayırt etmek pratikte zor
`application_name`'i yalnız kilit havuzu ayarlıyor (`src/lib/db.ts:104`). graphile-worker ve Prisma bağlantılarında bu alan boş, ölçümde yalnız `psql` göründü. Aynı makinede ya da aynı rolle koşan iki worker yalnız `client_addr` ve `backend_start` ile ayrılır. Öneri: "`backend_start`'ı yeni worker'ın açılış saatinden eski olan bağlantılar eski worker adayıdır" cümlesini ekleyin. İleride worker bağlantısına bir `application_name` verilebilir (kod, ayrı kart).

### Ö-2 — (b)'deki kuyruk sorgusu, worker ayrı bir rolle bağlanıyorsa sahip rolüyle koşmayabilir
`RELEASE_CHECKLIST.md:79` `JOBS_DATABASE_URL` için ayrı bir rol olabileceğini söylüyor. `graphile_worker` şemasını o rol kurar. O durumda sahip rolü `graphile_worker.jobs`'u okuyamayabilir (ölçülmedi: izole DB'de şemayı sahip rolü kurdu). Öneri: (b)'de "sahip rolüyle (ya da `JOBS_DATABASE_URL` rolüyle)" deyin.

### Ö-3 — `comm` sıralaması ve compose adı
- Listeler Postgres `ORDER BY` (DB collation) ile sıralanıyor, `comm` ise kabuk yerel ayarıyla karşılaştırıyor. cuid kimliklerinde sorun yok; crw-fb bunu riskler bölümüne yazmış. Yine de kesin olmak için `ORDER BY 1` → `ORDER BY 1 COLLATE "C"` ve `LC_ALL=C comm` önerilir.
- Compose'ta worker'ın adı sabit: `fabrika-worker`. Servisin `stop_grace_period` değeri yok, bu yüzden `docker compose up` yeniden oluştururken 10 sn sonra SIGKILL gönderir. 2a (a)'ya "`docker compose stop -t 300 fabrika-worker`" örneği eklemek operatöre doğru komutu verir.

### Bilgi notları (kusur değil)
- **I-1:** crw-fb'nin raporundaki kapsam dışı gözlem doğru: süper kullanıcı olmayan sahip rolüyle `apply-migrations.sh`, 23. dosyada (`add-agency-invite-code.sql:162`) `permission denied to set parameter "app.system_scope"` ile durdu. Ben de aynı hatayı aldım ve zinciri kurulumda süper kullanıcıyla koştum (operatör sorguları yine sahip rolüyle). Kart önerisi hâlâ açık.
- **I-2:** Tablonun 2. satırı ("eski → yeni = 1 özet") ve 3. satırı İNCELEME-102'nin gerçek worker + mailpit ölçümüne dayanıyor. Ben worker koşmadım; kodun iki yönü de satır satır okundu ve tabloyla uyumlu.

## 3. Kanıt
İzole ortam: kendi worktree'm (`scratchpad/wt`, c4b0cc2d, ayrık HEAD) ve kendi konteynerim `crw2fb106-pg` (pgvector/pg16, 127.0.0.1:55106). **Paylaşılan :5433'e ve ana checkout'a yazılmadı, ana checkout'ta test koşulmadı.** Kurulum (CI sırası):
```
prisma db push                → "Your database is now in sync" (sahip rol own)
db:rls-role                   → "fabrika_app connects as fabrika_app"
apply-migrations.sh           → "apply-migrations: 41 files applied" (mig exit 0; süper kullanıcıyla, I-1)
db:rls                        → "Policies in public: 112 → 112"
User|f|f|own   Membership|t|t|own   Relationship|t|t|own   (relrowsecurity|relforcerowsecurity|owner)
own super=false bypassrls=false
graphile-worker --schema-only → "Schema updated";  jobs WHERE locked_at IS NOT NULL → 0
```
Y-1: yukarıdaki çıktı (`-ekler/y1.txt`). Geri dönüş (`-ekler/rb.txt`):
```
m4-user-today: [uN,uO]
down.sql sahip rolle: ok
iki özet sayısı: 1  (beklenen 1: uO)
psql:m4-double.sql:5: ERROR:  column u.staleDigestOn does not exist
```

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUOCKB1X1RQK-crw2-fb.md` (bu rapor).
- `docs/agent-results/TASK-MUOCKB1X1RQK-crw2-fb-ekler/`: `y1.sh`, `y1.txt`, `rb.sh`, `rb.txt`, `m4-claims.sql`, `m4-double.sql` (belgeden birebir). Betiklerdeki parolalar, silinmiş bir test konteynerinin fikstür parolalarıdır.
- Kod ve `RELEASE_CHECKLIST.md` değişmedi (görev: kod değiştirme).

## 5. Riskler
- Y-1 düzeltilmezse, yayın günü ikinci bir yayın yapan operatör var olmayan bir eski worker'ı arar ve yayın notuna yanlış bir "ikinci özet" sayısı yazar.
- Senaryo DB durumu elle kuruldu (yeni sürümün `claimDigest` + `stampRows` sonrası kolonları). Zincir gerçek dosyalarla koşuldu. Worker koşulmadı.

## 6. Açık sorular
- Tespit penceresinde zincirin yeniden koşulmasını yasaklamak mı, yoksa backfill'i koşullu yapmak mı? Önerim belge kuralı.
- Üretimde worker ayrı bir `JOBS_DATABASE_URL` rolüyle mi bağlanacak (Ö-2)?

## 7. Sonraki adım
- crw-fb ya da se-fb: Y-1 ve Ö-1..Ö-3 için `RELEASE_CHECKLIST.md`'de küçük bir belge düzeltmesi (tek dosya).
- Kolon kaldırma kartı: `m4-stale-reminder-idempotency.sql` backfill'inin kolonla birlikte ne olacağını da kapsasın.

## Not: sonuç yolu
Görev metnindeki "KANIT ZORUNLU" satırı `/Users/macbook/alan/docs/agent-results/TASK-MUOBQUZJGRYV9-crw-fb.md` yolunu veriyor. Bu yol **incelenen** görevin raporu ve repo dışında. Oraya yazılmadı: crw-fb'nin raporunun üzerine yazılmasın diye rapor, gövdede verilen yola (bu dosya) yazıldı.

## Temizlik
`crw2fb106-pg` konteyneri silindi, geçici worktree kaldırıldı: `docker ps -a | grep -c crw2fb106` → 0. Başka konteynere ya da pane'e dokunulmadı.

**Platform:** mac'te doğrulandı (darwin 27, libpq psql, pgvector/pg16 konteyneri).
- İncelenen belge POSIX kabuk (`psql`, `comm`, `wc`, heredoc) ve SQL komutları içeriyor. Linux sunucuda da aynı çalışır; macOS'ta `wc -l` çıktısının başında boşluk olur, anlam değişmez.
- `docker stop -t` ve SIGTERM akışı Linux worker imajı için geçerli (Dockerfile `CMD` tsx).
- **Linux koşulamadı:** üretim ya da Linux sunucu yok. Koddan beklenen bir fark yok.
- **Windows koşulamadı:** makine yok ve üretim hedefi değil. `comm` ve heredoc Windows cmd'de yok; operatör WSL ya da sunucu kabuğu kullanmalı.
