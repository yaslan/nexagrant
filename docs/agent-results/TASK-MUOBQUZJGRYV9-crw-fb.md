# TASK-MUOBQUZJGRYV9 — crw-fb — FB BELGE: RELEASE_CHECKLIST claim taşıma penceresi (İNCELEME-102 Y-1, Ö-1..Ö-4)

**Durum:** TAMAM

Dal: `crw-fb/muobqu-checklist` (dev 4d7b5308'den), kendi worktree'mde. Yalnız belge değişti; kod değişikliği gerekmedi.

## 1. Ne yapıldı
`docs/RELEASE_CHECKLIST.md` §3.1 ve §3.3 yeniden yazıldı. Artık `legacyClaims`'in **tek yönlü** olduğunu söylüyor ve operatöre adım adım ne yapacağını veriyor.

| Madde | Karar | Belgedeki karşılığı |
|---|---|---|
| **Y-1** | uygulandı | 2a "ZORUNLU, atlanamaz". Yeni **sıra tablosu** (ölçülen 3 durum): 2a ile 1 özet; eski→yeni 1 özet; yeni→eski **2 özet**. Tabloda neden eski sürümün `User` claim'ini okuyamadığı da yazıyor. "2a atlanmış olsa bile ikinci özet gitmez" cümlesi kaldırıldı. |
| **Y-1: tespit** | eklendi | Yeni sürüm `Membership.staleDigestOn`'a hiç yazmaz. Bu yüzden 3. adımdan sonra o kolona düşen her claim, eski bir worker'ın koştuğunu gösterir. Adımlar: 2a (c) taban listesi → aynı gün `comm -13` ile karşılaştırma → ertesi gün çıktı tamamen boş olmalı. |
| **Y-1: ne yapılır** | eklendi | (1) Eski worker'ı bul ve durdur (`pg_stat_activity`, `docker logs … grep '[m4-stale-relationships] DONE'`). (2) Kaç kişiye ikinci özet gittiğini `m4-double.sql` ile say. (3) Veriyi elle düzeltme, `apply-migrations`'ı yeniden koşma. Olayı yayın notuna yalnız sayı olarak yaz. |
| **Ö-1** | uygulandı | İlk kurulumda 2a yalnız "worker yok" kontrolüdür. Durma kontrolü: `graceful shutdown complete` ve `graphile_worker.jobs WHERE locked_at IS NOT NULL` → 0; 0 değilse ne olacağı. `docker stop -t 300` önerisi eklendi; 300 değeri **varsayım** olarak işaretlendi. |
| **Ö-2** | uygulandı | "Yeni worker'ın `fill=6h` telafisi ikinci özeti gönderir" cümlesi kaldırıldı. Doğru mekanizma yazıldı: iki sürüm aynı cron kimliğini paylaşır ve doldurma `last_execution`'dan başlar. İkinci işi getiren, bir yeniden deneme ya da elle eklenen iştir. |
| **Ö-3** | uygulandı (madde kaldırıldı) | "Korumasız yeni sürüm (geri dönüp yeniden ileri alma)" maddesi silindi. Yerine şu cümle geldi: "`apply-migrations.sh`'i yeniden koşmak ters yönü kapatmaz". Eski→yeni yönünü zaten `legacyClaims` kapatıyor. |
| **Ö-4** | uygulandı | "`legacyClaims` ne zaman kaldırılır" bölümü eklendi: 3 koşul (her ortamda `m4-claims.sql` boş, geri dönüş planı yok, `tsc`'nin 10 hatasının hepsi: B-1, T-3 ve eski claim testi dahil). Ayrıca `db push` ile düşürme sırası açık soru olarak **kolon kaldırma kartına** bırakıldı. Kolonsuz ve kolonlu kaldırmanın sonucu da yazıldı. |
| **Ek (bu turda bulundu)** | düzeltildi | §3.3 geri dönüş: down dosyası `User.staleDigestOn`'u **düşürüyor**, yani `m4-double.sql` geri dönüşten sonra koşmaz (ölçüldü: `column u.staleDigestOn does not exist`). Belge artık down'dan **önce** `User` listesini kaydettiriyor ve gün sonunda `comm -12` ile sayıyor. |

## 2. Kanıt
Sorgular izole bir konteynerde denendi: `crwfbqu-pg`, pgvector/pg16, 127.0.0.1:55119. **Paylaşılan :5433'e dokunulmadı.** Worktree'de `.env` yok, yazdırılan URL'ler:
```
rls-role DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55119/q2      (yalnız db:rls-role, süper kullanıcı)
DATABASE_URL=postgresql://own:***@127.0.0.1:55119/q2                     (sahip rol: own super=false bypassrls=false)
apply-migrations: 41 files applied
✅ prisma/rls.sql applied. Policies in public: 112 → 112
Membership relforcerowsecurity = t
```
Sahip rolü **süper kullanıcı değil**; üretimdeki "sahip, BYPASSRLS değil" durumu böyle taklit edildi. Böylece FORCE RLS gerçekten uygulandı.

**Sıra tablosundaki durumlar** (`-ekler/sim.sh`, `-ekler/sim.txt`). Durumlar İNCELEME-102'nin gerçek worker ölçümlerinden (R0/R1/R2) alındı. Backfill, gerçek migration bloğu sahip rolüyle koşularak yapıldı:
```
=== R2   (2a uygulandı)
N0=3  düz sorgu (enter_system_scope YOK)=0      ← FORCE RLS: sahip rol claim'leri göremiyor
N1=3  yeni Membership claim'i: []
iki özet adayı: []
=== R0   (2a atlandı, eski → yeni)
N0=0  N1=3  yeni Membership claim'i: [uA,uC,uE]
iki özet adayı: []                               ← tespit uyarır, legacyClaims ikinci özeti önledi
=== R1   (2a atlandı, yeni → eski = Y-1)
N0=0  N1=2  yeni Membership claim'i: [uA,uC]
iki özet adayı: [uA]                             ← İNCELEME-102 R1'de mailpit'te 2 özet alan kullanıcı
```

**Belgedeki bash blokları birebir** koşuldu. Bloklar python ile checklist'ten çıkarıldı (`-ekler/literal.txt`):
```
--- R1 literal: 2a atlandı; 3. adım öncesi taban
       0
--- tespit (boş olmamalı)
uA
uC
--- iki özet sayısı (beklenen 1: uA)
       1
```

**Geri dönüş** (`-ekler/rb.txt`):
```
User bugün (down öncesi): uA,uE
down.sql uygulandı; User.staleDigestOn var mı: 0
m4-double.sql down sonrası: psql:double.sql:7: ERROR:  column u.staleDigestOn does not exist
ikinci özet (comm -12): [uA]
ileri alındı: 1
```

**Diğer:**
- `SELECT count(*) FROM graphile_worker.jobs WHERE locked_at IS NOT NULL` graphile-worker 0.18.0 şemasında (`--schema-only`) sahip rolüyle koştu: `0`. `jobs` görünümünde `locked_at` ve `locked_by` var.
- Backfill sonrası `Membership` FORCE hâlâ `t`.

**Koddan doğrulananlar:**
- `stale-reminder.ts:135-141`: `legacyClaims` yalnız `Membership`'i okuyor.
- 3eb40805 (eski sürüm) `stale-reminder.ts:164-168, 237-248`: yalnız `Membership` okuyor ve yazıyor.
- `m4-stale-digest-user-claim.down.sql`: `DROP COLUMN "staleDigestOn"` (User).
- graphile-worker 0.18.0 `gracefulShutdownAbortTimeout` 5 sn (`dist/config.js:53`). Bu yalnız iptal sinyalidir; iş bitene kadar beklenir (`scripts/jobs-worker.ts:7`).
- Doldurma mekanizması (Ö-2) İNCELEME-102'de `dist/cron.js:30`'dan okunmuştu.

## 3. Değişen dosyalar
- `docs/RELEASE_CHECKLIST.md`: §3.1 2a, "Claim taşıma penceresi" bölümü, yeni "Tespit" ve "`legacyClaims` ne zaman kaldırılır" bölümleri, §3.3 madde 3 ve geri dönüş paragrafı.
- `docs/agent-results/TASK-MUOBQUZJGRYV9-crw-fb.md` ve `-ekler/`: `sim.sh`, `claims.sql`, `double.sql`, `sim.txt`, `rb.txt`, `literal.txt`. Parolalar atılmış bir konteynerin fikstür parolalarıdır.
- Kod değişmedi.

## 4. Riskler
- **Gerçek worker ile yeniden koşulmadı.** Tespit sorguları, İNCELEME-102'de gerçek eski/yeni worker ve mailpit ile ölçülen **son DB durumları** üzerinde denendi; durumlar elle kuruldu. Sorguların okuduğu tek şey bu iki kolondur, o yüzden bu yeterli. Ama yöntem budur, bir iddia değil.
- `docker stop -t 300`: M4 koşu süresi üretim hacminde ölçülmedi. Belgede varsayım olarak işaretli.
- `comm` sıralaması: listeler Postgres `ORDER BY` ile sıralanıyor. Kimlikler cuid (`[a-z0-9]`), bu karakterlerde C ve en_US sırası aynı. Başka biçimde bir kimlik gelirse `comm` sıralama uyarısı verebilir.
- **Kapsam dışı gözlem (yeni bulgu adayı, belgeye yazılmadı):** süper kullanıcı olmayan bir sahip rolüyle `apply-migrations.sh`, 23. dosyada (`add-agency-invite-code.sql:162`, fonksiyon düzeyinde `SET app.system_scope = 'on'`) PG16'da `ERROR: permission denied to set parameter "app.system_scope"` ile duruyor. `GRANT SET ON PARAMETER app.system_scope, app.system_scope_purpose TO <sahip>` sonrasında 41 dosya geçti. CI süper kullanıcı kullandığı için bunu görmüyor. Üretimdeki sahip rolü süper kullanıcı değilse §3.1 3. adım burada durur (ON_ERROR_STOP). Bu durumda zincir 23. dosyada, K-6 penceresinin içinde kalır. Üretim rolünün özellikleri bilinmiyor; **devop-fb için ayrı bir kart önerilir.**

## 5. Açık sorular
- Kolon kaldırma yayınında `db push` ile düşürme dosyasının sırası. Checklist'te kolon kaldırma kartına bırakıldı.
- Üretimde migration'ı koşan sahip rolü süper kullanıcı mı? (§4'teki gözlem.)
- Staging ya da başka bir ortamda f7a6dcf5 öncesi worker koşuyor mu? Belge bunu artık `m4-claims.sql` ile ölçülebilir kılıyor.

## 6. Sonraki adım
- Yayın sahibi (devop-fb): §3.1 2a'yı ve tespit kontrolünü yayın günü uygulamak. Sahip rolü ve `SET ON PARAMETER` gözlemi için kart açmak.
- Kolon kaldırma kartı: "`legacyClaims` ne zaman kaldırılır" bölümündeki üç koşulu kabul ölçütü yapmak.

## Temizlik
- `crwfbqu-pg` silindi (`docker ps -a | grep -c crwfbqu` → 0).
- Worktree'deki geçici `node_modules` sembolik bağı silindi.
- Başka konteynere ya da pane'e dokunulmadı.

**Platform:** mac'te doğrulandı (darwin 27, libpq psql, pgvector/pg16 konteyneri).
- Belgedeki komutlar POSIX kabuk komutlarıdır (`psql`, `comm`, `wc`, heredoc) ve SQL'dir. Linux sunucuda aynı çalışır; macOS'taki `wc -l` çıktısındaki baştaki boşluklar Linux'ta yoktur, anlam değişmez.
- `docker stop -t` ve SIGTERM, Linux worker imajı için geçerlidir.
- **Linux koşulamadı:** üretim sunucusu yok (§1.2 PATRON). Koddan beklenen fark yok.
- **Windows koşulamadı:** makine yok ve üretim hedefi değil. `comm` ile heredoc Windows cmd'de yoktur; operatör WSL ya da sunucu kabuğu kullanmalıdır.
