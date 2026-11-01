# TASK-MUOB16SD93PD9 — crw-fb — FB İNCELEME-102: M4 claim taşıma yayın penceresi (TASK-MUOADTEOQVL4Z, dev d83d14a5)

**Durum:** TAMAM
**Karar:** **ONAY — bloke eden bulgu yok.** 1 orta bulgu var (Y-1). Bu bir belge doğruluğu sorunu: `legacyClaims` koruması tek yönlü, checklist onu iki yönlü gibi anlatıyor. Ayrıca 4 öneri (Ö-1..Ö-4) ve 2 bilgi notu var. Bunlar merge sonrası bir belge düzeltmesiyle kapanır, kod değişikliği gerekmez.

İncelenen: `32eff357..d83d14a5` içinde yalnız bu görevin dosyaları: `stale-reminder.ts`, `check-rls-live.ts`, `schema.prisma` yorumu, `RELEASE_CHECKLIST.md` ve canlı test. Aynı merge aralığındaki admin/plans ve bekçi değişiklikleri başka kartların işi, kapsam dışı. Bu dosyalara d83d14a5'ten sonra dev'de dokunulmadı (`git diff --stat d83d14a5 HEAD -- …` boş).

## Ortam
- Kendi worktree'lerim:
  - `wt` = d83d14a5 (dev HEAD, yeni sürüm)
  - `wtold` = 3eb40805 (f7a6dcf5'in 1. ebeveyni, Membership üzerinde claim yazan **eski** sürüm)
- Kendi konteynerlerim: `crwfb102-pg` (pgvector/pg16, 127.0.0.1:55102) ve `crwfb102-mailpit` (SMTP :11102, API :18102). Gerçek `scripts/jobs-worker.ts` (graphile-worker 0.18.0) kullanıldı.
- **Paylaşılan fabrika :5433'e yazılmadı.** Her adımdan önce yazdırılan URL'ler (parola maskeli):
  ```
  [wt] DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55102/r0
  [wtold] DATABASE_URL=postgresql://fabrika_app:***@127.0.0.1:55102/r1 JOBS=postgresql://fabrika:***@127.0.0.1:55102/r1
  gates: DATABASE_URL=postgresql://fabrika:***@127.0.0.1:55102/fabci RLS=postgresql://fabrika_app:***@127.0.0.1:55102/fabci
  ```
  Worktree'lerde `.env` yok (yalnız `.env.example`). Bu yüzden env unutulursa hiçbir betik :5433'e düşemez. İlk denemede göreli yol hatası yüzünden env boş kaldı ve betikler "DATABASE_URL is not set" ile durdu; hiçbir DB'ye dokunulmadı.
- Taban DB `relbase` eski sürümle CI sırasıyla kuruldu (40 dosya, `rls:verify` exit 0), se-fb'nin tohumu kullanıldı (gün 2026-10-27):
  - uA: tA'da 07:00'de vadeli satır, tB'de 07:20'de vadeli satır
  - uC: yalnız tB'de 07:20'de vadeli satır
  - uE: yalnız tA'da vadeli satır

  Her senaryo `TEMPLATE relbase` kopyasında koştu ve mailpit her senaryodan önce boşaltıldı.

## 1. Bulgular (önem sırasıyla)

### Y-1 (orta, belge / operasyon) — `legacyClaims` yalnız "eski worker önce, yeni worker sonra" sırasını kapatıyor; checklist ise "2a atlanmış olsa bile aynı gün ikinci özet gitmez" diyor
- **Yer:** `docs/RELEASE_CHECKLIST.md` §3.1, "Claim taşıma penceresi" bölümünün 2. ve 3. maddeleri. `src/lib/relationships/stale-reminder.ts:135-141`.
- **Senaryo:** Operatör 2a'yı atlıyor, eski worker ayakta kalıyor.
  1. 3. adım (migrate) koşar.
  2. Yeni worker 07:00 tikini koşar ve claim'i `User.staleDigestOn`'a yazar.
  3. Aynı gün eski worker bir iş alır (elle eklenen iş ya da çöken bir koşunun yeniden denemesi; iki worker aynı kuyruktan iş çeker).
  4. Eski kod yalnız `Membership.staleDigestOn`'u okur. Yeni sürüm oraya hiç yazmaz, bu yüzden eski kod claim görmez ve ikinci özeti gönderir.

  `legacyClaims` yeni koddadır, eski kodu durduramaz. 3. maddedeki yedek yol (`apply-migrations`'ı yeniden koşmak) da bu yönde işe yaramaz, çünkü backfill yalnız Membership → User yönünde kopyalar.
- **Ölçüm (R1, `-ekler/R1.txt`):**
  ```
  [wt]    tick=2026-10-27T07:00  "digestsSent":2
  [wtold] tick=2026-10-27T07:22  "skippedMailedToday":0 "digestsSent":2
  total=4 {'uA@example.test': 2, 'uC@example.test': 1, 'uE@example.test': 1}   ← uA aynı UTC gününde 2 özet
  User|uA|2026-10-27  Membership|tB/uA|2026-10-27   ← iki sürüm iki ayrı yere claim yazdı
  ```
  Karşılaştırma için ters sıra (R0, se-fb'nin S1fix'inin bağımsız tekrarı): uA 1 özet, `skippedMailedToday:1`. Kod, iddia edilen yönde doğru çalışıyor.
- **Neden bloke değil:**
  - 2a doğru uygulanırsa pencere hiç açılmıyor (R2, aşağıda).
  - `origin/main` hâlâ ilk commit (`0858e2d9`). Görebildiğim hiçbir canlı ortam eski sürümün worker'ını koşmuyor. §3.3 de ilk kurulumun boş DB olduğunu söylüyor.
- **Önerilen düzeltme (yalnız belge):** 2. maddeyi şöyle yazın: "Yeni sürüm bugünkü eski claim'i okur. Bu yalnız eski worker'ın yeni worker'dan **önce** koştuğu sırayı kapatır. Eski worker yeni sürümün claim'ini okuyamaz. 2a atlanır ve eski worker yeni worker'dan sonra iş alırsa ikinci özet gider (ölçüldü: 2). **2a zorunludur.**" 3. maddeye de "yalnız eski → yeni sırası için" notu eklenmeli.
- Kodda iki yönlü koruma da mümkün: geçiş günü claim ederken bir üyeliğe de yazmak. Önermiyorum. Bu, D-1'de terk edilen üyelik yazımını geri getirir ve RLS/kiracı kapsamı ister. Belge ile 2a yeterli.

### Ö-1 — 2a, ilk kurulum için ne yapılacağını söylemiyor ve "worker durdu" için bir kontrol vermiyor
- K-6 penceresi "İlk canlı kurulumda … etkisizdir" diye açıkça yazıyor. 2a'da böyle bir cümle yok. İlk kurulumda operatör durduracak bir "eski worker" arayacak ama bulamayacak. Öneri: "İlk kurulumda eski worker yoktur; 2a = 'bu DB'de koşan worker yok' kontrolü."
- "Durdu" için somut bir kontrol yok. Öneri: `SELECT count(*) FROM graphile_worker.jobs WHERE locked_at IS NOT NULL;` → 0, ve worker logunda `graceful shutdown complete`.
- **Varsayım, ölçülmedi:** worker Docker konteynerinde koşuyorsa `docker stop` varsayılan olarak 10 sn sonra SIGKILL gönderir. Uzun bir M4 koşusu bu sürede bitmeyebilir. O durumda "elindeki işi bitirip" ifadesi tutmaz; kilitli iş 4 saat sonra yeni worker'da yeniden koşar. Bu, `legacyClaims` sayesinde zararsız. Yine de `docker stop -t <sn>` önerilebilir.

### Ö-2 — "yeni worker'ın `fill=6h` telafisi ikinci özeti gönderir" ifadesi mekanizma olarak yanlış
graphile-worker 0.18 geriye dönük doldurmaya `_private_known_crontabs.last_execution`'dan başlar (`node_modules/graphile-worker/dist/cron.js:30` `notBefore = known.last_execution || known.known_since`). İki sürüm aynı cron kimliğini (`m4-stale-relationships`) paylaşır. Eski worker'ın cron'la koştuğu 07:00 tiki yeni worker tarafından yeniden **doldurulmaz**. İkinci özeti tetikleyen şey yeniden deneme ya da elle eklenen iştir. se-fb'nin senaryoları da zaten elle eklenen işle ölçüldü. Öneri: yalnız ifadeyi düzeltmek. Sonuç değişmez.

### Ö-3 — 3. maddedeki "yeni sürümün bu koruması yoksa (ör. geri dönüp yeniden ileri alma)" örneği kafa karıştırıyor
Yeniden ileri alınan sürüm bu sürümün kendisidir, yani koruması vardır. Korumasız "yeni sürüm" yalnız d83d14a5'ten önceki dev'dir ve hiç yayınlanmadı. Operatör bu maddeye hangi durumda başvuracağını anlayamaz. Öneri: maddeyi Y-1 düzeltmesiyle birlikte "yalnız eski → yeni sırası için ek güvence" diye yeniden yazmak ya da kaldırmak.

### Ö-4 — Kolonu kaldırma işi: derleyici zorluyor, ama kaldırma kapsamı ve yayın sırası belirtilmemiş
- `Membership.staleDigestOn` şemadan çıkarılıp `tsc` koşuldu (`-ekler/drop-column-tsc.txt`). **10 hata** çıktı: `stale-reminder.ts:137` (`legacyClaims`) ve testte satır 282, 283, 621 (B-1), 740–766 (T-3). Yani ölü kod unutulamaz; bu iyi. Ama se-fb raporunun §6'sı yalnız "legacyClaims + B-1 bölümü" diyor. Aslında **T-3 ve satır 282'deki eski test de** yeniden yazılmalı.
- **Ne zaman kaldırılabilir:** `legacyClaims` yalnız `>= bugün` claim'lerini okur. Eski worker tamamen durduktan sonraki UTC gününden itibaren işlevsizdir. Kaldırmanın güvenli koşulu "hiçbir ortamda eski sürüm worker'ı yok ve geri dönüş planı yok" durumudur.
- **Kaldırılınca ne olur:** `legacyClaims`'in korunduğu senaryo mutant CM4 ve B1-M1 ile aynıdır; o durumda eski → yeni sırasında 2 özet gider. Kolon düşürüldükten sonra hâlâ koşan bir eski worker hata verir (`tenantsFailed`), yani özet göndermez ama ikinci özet de göndermez.
- **Açık soru (kolonu düşürecek yayın için):** §3.1 1. adım `prisma db push`'tur ve `--accept-data-loss` yasaktır. Şemadan çıkarılmış, veri içeren bir kolon push'u durdurur. Düşürme dosyası push'tan önce mi koşacak, yoksa kolon önce NULL'lanacak mı? O kartta yazılmalı.

### Bilgi notları (kusur değil)
- **I-1:** CM5 (`legacyClaims`'ten `tenantId` filtresini kaldırmak) hayatta kaldı. Bu eşdeğer bir mutant: sorgu `withTenant` + FORCE RLS altında koşuyor, satırları RLS zaten süzüyor. Filtre derinlemesine savunma olarak kalmalı.
- **I-2:** `rls:verify` FORCE denetimi yalnız `tenantScopedModels()` tablolarına bakıyor. DB'de RLS açık ama FORCE'suz 6 tablo var: `Chunk`, `ConceptTemplate`, `Document`, `Plan`, `PlanFeature`, `PlanVersion`. Bunlar paylaşılan katalog tabloları, bu diff'in kapsamı dışında. Ayrıca T-3 migration'ı sahip DB'de bütünüyle koşuyor, yani backfill test kullanıcılarıyla sınırlı değil. Dosya idempotent olduğu ve paket `fabrika` DB'sini CI dışında reddettiği için kabul edilebilir.

## 2. Kanıt

### 2.1 Yayın penceresi — gerçek eski/yeni worker, izole DB, mailpit (`-ekler/R*.txt`)
| # | Sıra | uA | uC | uE | Sonuç |
|---|---|---|---|---|---|
| R0 | eski checklist: migrate → ESKİ 07:00 → YENİ 07:22 | **1** (`skippedMailedToday:1`) | 1 | 1 | `legacyClaims` çalışıyor (se-fb S1fix tekrarlandı) |
| R1 | 2a atlandı, **ters yön**: migrate → YENİ 07:00 → ESKİ 07:22 | **2** | 1 | 1 | **Y-1** |
| R2 | **yeni checklist**: push + rls-role → ESKİ 07:00 → eski worker SIGTERM (2a) → migrate + db:rls + verify → YENİ 07:22 | **1** | 1 | 1 | Birincil yol doğru; backfill `User|uA|2026-10-27` yazdı |

- Her worker logunda `shutdown: 1` (`graceful shutdown complete`) var.
- Her deploy'da `apply-migrations: 41 files applied`, `rls:verify` exit 0.

### 2.2 `rls:verify` FORCE denetimi (`-ekler/verify-force.txt`)
```
F1: Membership + Relationship NO FORCE
  [wt]    ❌ … FORCE ROW LEVEL SECURITY yok (tablo sahibi politikaları atlıyor): Membership, Relationship  exit=1
  [wtold] ✅ 47 kiracıya özel tabloda politika yerinde …                                               exit=0   ← eski sürümün boşluğu
F2: + AuditEvent RLS DISABLE
  [wt]    RLS kapalı: AuditEvent / FORCE yok: Membership, Relationship                                exit=1
F3: onarım `db:rls` → üç tablo da t|t → [wt] exit=0
```
Denetim gerçek bir FORCE eksikliğini yakalıyor, birden çok tabloyu tek seferde adıyla listeliyor, ve belgelenen onarım (`pnpm db:rls`) sorunu gerçekten gideriyor.

### 2.3 Testler ve kendi mutantlarım (`-ekler/mutants.txt`)
- Taban: `CI=true npx vitest run tests/stale-relationship-reminder.live.test.ts` → **24/24** (izole `fabci` DB).

| Mutant | Sonuç |
|---|---|
| CM1 `legacyClaims` yalnız vadeli sahibi olan kiracıda (se-fb'nin ilk taslağı) | öldü (B-1) |
| CM2 `gte` → `lt` (dünkü claim tutar) | öldü (4 test) |
| CM3 gün `now` yerine duvar saatinden | öldü (4 test) |
| CM4 legacy kümesi filtre döngüsünden SONRA ekleniyor | öldü (B-1) |
| CM5 `tenantId` filtresi yok | **yaşadı**: eşdeğer, RLS süzüyor (I-1) |
| CM6 legacy kümesi kiracılar arasında sıfırlanıyor | öldü (B-1) |

5/6 öldü; kalan 1 mutant eşdeğer. Her mutanttan sonra `git checkout` yapıldı ve Membership FORCE'u geri kondu; sonunda `git status` temiz (yalnız benim `seed.ts` kopyam vardı).

### 2.4 Kapılar (d83d14a5, izole `fabci`: db push → rls-role → apply ×2 → db:rls → db:seed)
```
CI=true AUTH_SECRET=<fikstür> npx vitest run --maxWorkers=4 → exit 0
 Test Files  296 passed | 2 skipped (298)
      Tests  3793 passed | 41 skipped (3834)
typecheck exit=0
lint exit=0
rls:verify exit=0   ✅ 47 … (FORCE denetimi dahil)
build exit=0
(`-ekler/gates.txt`, `-ekler/vitest-full-summary.txt`; 3793 = se-fb'nin 3759'u + aradaki dev merge'lerinin testleri, 0 başarısız)
```

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUOB16SD93PD9-crw-fb.md`, `-ekler/`: senaryo çıktıları ve betikler (fikstür parolaları maskeli).
- Kod değiştirilmedi.

## 4. Riskler
- Y-1 düzeltilmezse checklist'i okuyan bir operatör 2a'yı "koruma var nasılsa" diye atlayabilir. Eski worker yeni worker'dan sonra iş alırsa kullanıcıya aynı gün 2 özet gider. Bugün eski sürümü koşan bir canlı ortam görünmüyor; risk, eski sürümün kurulu olduğu bir ortam (staging vb.) varsa gerçektir.
- R senaryolarında işler cron gibi elle eklendi (se-fb ile aynı yöntem). Gerçek cron saatinde 07:00 tiki ölçülmedi; saat sahteleme yok. Doldurma davranışı koddan okundu (Ö-2).

## 5. Açık sorular
- Kolonu düşürecek yayında `db push` ile düşürme dosyasının sırası (Ö-4).
- Staging ya da başka bir ortamda f7a6dcf5'ten önceki sürümün worker'ı koşuyor mu? Koşmuyorsa 2a yalnız ilk kurulum kontrolüdür (Ö-1).

## 6. Sonraki adım
- se-fb (ya da yayın sahibi devop-fb): Y-1, Ö-1, Ö-2 ve Ö-3 için checklist ifadesini düzeltmek (tek dosya, yalnız belge).
- Kolon kaldırma kartı: Ö-4'teki kapsamı (T-3 ve satır 282 dahil) ve push sırasını karta yazmak.

## Sonuç yolu notu
- Görev metni sonuç yolunu açıkça veriyor: `/Users/macbook/alan/FONBRIDGE/docs/agent-results/TASK-MUOB16SD93PD9-crw-fb.md`. Rapor oraya yazıldı.
- Ek talimattaki `/Users/macbook/alan/docs/agent-results/TASK-MUO9IS43PM2KI-se-fb.md` yolu başka bir ajanın (se-fb) önceki görevine ait. Hem başka bir repoda, hem de o dosyanın üzerine yazmak se-fb'nin raporunu bozardı. Bu yüzden **oraya yazılmadı**.
- Bu repoda `results:index` betiği yok, o adım atlandı.

## Temizlik
- Kalan worker süreci 0; her worker logunda `graceful shutdown complete` var.
- `crwfb102-pg` ve `crwfb102-mailpit` silindi (`docker ps -a | grep -c crwfb102` → 0).
- `wt` ve `wtold` worktree'leri kaldırıldı (`git worktree list | grep -c fb697819` → 0).

**Platform:** mac'te doğrulandı (darwin 27, Node 26.5, pgvector/pg16 konteyneri, gerçek graphile-worker 0.18.0, mailpit).
- İncelenen kod platforma bağlı değil: Prisma sorgusu, SQL, bir tsx betiği ve bir Markdown checklist. Süreç öldürme, dosya yolu ya da kabuk ikilisi yok.
- Checklist'teki SIGTERM adımı POSIX sinyaline dayanıyor. Linux konteynerinde (üretim worker imajı) aynı şekilde çalışır. Windows'ta SIGTERM yoktur, ama üretim worker'ı Linux imajıdır.
- **Linux koşulamadı:** üretim worker imajı bu turda kurulmadı; koddan beklenen fark yok.
- **Windows koşulamadı:** makine yok; üretim hedefi değil.
