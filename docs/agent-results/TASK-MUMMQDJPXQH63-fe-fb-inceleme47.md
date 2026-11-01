# İNCELEME-47 — TASK-MUMMQDJPXQH63 (cs-fb, 823b946c) — fe-fb

**Durum:** tamamlandı · **Dal:** dev (HEAD b17d2ed2, 435f8f7d dahil) · **Kod değişikliği:** YOK (inceleme)
**Karar: ONAY.** Engelleyici bulgu yok. Aşağıdaki bulgular düşük önemde; ayrı kart önerisi olarak veriliyor.

## 1. Ne yapıldı
- 47 `scripts/*.ts` dosyasının ilk import'unu, app-import'unu, dinamik import'unu ve gövdede `dotenv.config` çağrısını taradım.
- Bekçi testine 11 mutant uyguladım. Bunlar izole bir worktree'de koştu, paylaşılan ağaca dokunulmadı.
- Canlı davranışı 4 senaryoda ölçtüm: .env var/yok × shell DATABASE_URL var/yok. Ayrıca eski kalıbı negatif kontrol olarak koştum.
- Worker'ı 435f8f7d Dockerfile'ı ile derledim (`--target worker`). Build bağlamına kasıtlı bir kanarya `.env` koydum ve imajda .env yokken worker ile bir betiği koştum.
- Temizlik: worktree ve `fefb-i47-worker:tmp` imajı silindi. Başka bir konteyner ya da süreç durdurulmadı.

## 2. Kanıt

**2.1 Tutarlılık: tek yöntem.** Uygulama koduna (`../src/…`, `@/…`) statik import yapan 35 betiğin hepsinde ilk import `import 'dotenv/config';`. Gövdede `dotenv.config(` çağrısı yok. `jobs-worker.ts` dosyasında bu ifade yalnız yorumda geçiyor. Kalan 12 betik ya app kodu import etmiyor ya da .env'i kendi okuyucusuyla okuyor:
- i18n, rls-models ve a11y gibileri app kodu import etmiyor.
- `apply-rls`, `setup-rls-role` ve `check-rls-live` kendi `readDotenv()` okuyucusunu kullanıyor: `process.env.X ?? dotenv.X`. Bu da ortam kazanır anlamına geliyor, yani anlamsal olarak aynı. `tsx --env-file` hiçbir yerde kullanılmıyor. package.json, Dockerfile ve compose bu commit'te değişmedi.

**2.2 Bekçi mutantları** (`tests/scripts-dotenv-first.test.ts`, temiz ağaçta 7/7):
```
M1  yeni betik, dotenv/config SONDA            → KIRMIZI "first import is `import { prisma } …`"
M2  yeni betik, eski gövde kalıbı              → KIRMIZI "calls dotenv.config() in the module body"
M3  yeni betik, dotenv hiç yok                 → KIRMIZI
M8  dotenv/config ilk + gövdede override:true   → KIRMIZI
M10 import { config } from 'dotenv'; config()  → KIRMIZI
M11 mevcut run-alerts-sweep'ten satırı sil     → KIRMIZI
M9  noktalı virgülsüz stil                      → KIRMIZI ama mesaj yanıltıcı: "has no import statements"
M4  app yalnız dinamik await import('../src/lib/db'), dotenv yok → YEŞİL (kaçış)
M5  require('../src/lib/db'), dotenv yok        → YEŞİL (kaçış)
M6  scripts/*.mts                               → YEŞİL (kaçış)
M7  scripts/sub/x.ts (alt dizin)                → YEŞİL (kaçış)
```
Görevin sorduğu "yeni betikte dotenv'i sona koyunca kırmızı mı?" sorusunun cevabı **evet** (M1).

**2.3 Canlı: shell DATABASE_URL tanımsızken .env'deki DB okunuyor.** Kullanılan komut `beta:esr-preflight`, salt-okuma bir kapı (`--preflight` yazma modlarıyla birleşemiyor, satır 173).
```
A)   repo cwd, env -u DATABASE_URL, YENİ kod:
     ❌ Fixture rows … SAMPLE-* projects 20            ← .env (localhost:5433/fabrika) okundu
NEG) repo cwd, env -u DATABASE_URL, ESKİ kod (823b946c^:scripts/esr-calibration.ts):
     Authentication failed against the database server … `fabrika`   ← db.ts varsayılanı localhost:5432 (başka bir Docker Postgres'i)
```

**2.4 .env shell değerini EZMİYOR** (dotenv varsayılanı `override:false`):
```
B)   repo cwd (.env = 5433), DATABASE_URL=postgresql://x:y@127.0.0.1:1/nope
     Can't reach database server at 127.0.0.1:1       ← shell kazandı
```

**2.5 .env yokken betik sessizce ortam değişkeniyle çalışıyor.** Worktree'de .env yok (`ls: .env: No such file or directory`):
```
C)   DATABASE_URL shell'den (5433) → ❌ Fixture rows … SAMPLE-* projects 20   (çökme yok, ortamla çalıştı)
D)   DATABASE_URL da yok           → Authentication failed … (db.ts localhost:5432 varsayılanı, bkz. B-3)
E1)  jobs-worker, NODE_ENV=production, JOBS_CRON_ENABLED yok → JobsCronUnsetInProductionError, exit=1
E2)  jobs-worker, JOBS_CRON_ENABLED=false, DB=127.0.0.1:1     → connect ECONNREFUSED 127.0.0.1:1, exit=1
```

**2.6 Docker (435f8f7d + 823b946c birlikte).** `docker build --target worker` exit=0. Build bağlamında kanarya bir `.env` vardı (`DATABASE_URL=…canary-env-file…`, `JOBS_CRON_ENABLED=false`).
```
imajda env dosyaları: .env.example   (yalnız şablon; .dockerignore `.env*` + `!.env.example`)
imajda "canary" izi: 0
/app/scripts/jobs-worker.ts: import 'dotenv/config';
E3) env'siz (yalnız DATABASE_URL):    JobsCronUnsetInProductionError   ← kanarya JOBS_CRON_ENABLED=false imaja SIZMADI
E4) -e JOBS_CRON_ENABLED=false -e DATABASE_URL=…host.docker.internal:1 → ECONNREFUSED 192.168.65.254:1  ← runtime env kullanıldı
E5) imajda DATABASE_URL YOK, tsx scripts/run-alerts-sweep.ts → "Invalid prisma.systemAlert.findMany()" + boş sebep, exit=1
```
dotenv/config, `.env.example` dosyasını okumuyor; yalnız `.env` dosyasına bakıyor. Compose iki servise de `DATABASE_URL` veriyor (docker-compose.yml:30, :57).

**2.7 Bekçi `pnpm test` içinde:** vitest exclude yalnız e2e/docs/node_modules; `pnpm gate` → `pnpm test`.

## 3. Bulgular
1. **(Düşük) Bekçi kaçış yolları (M4–M7).**
   - Bir betik app kodunu yalnız dinamik `await import('../src/…')` ya da `require` ile yüklerse `importsAppCode` false döner ve bekçi susar. Aynı durum `.mts` uzantılı dosyalar ve `scripts/` alt dizinleri için de geçerli.
   - Bugün bu kalıpta bir betik yok. `beta-*` ve `esr-calibration` dosyalarındaki dinamik `mailer` import'u zaten statik app import'u olan dosyalarda.
   - Öneri: `importsAppCode` regex'ine `import\(`/`require\(` + `../src|@/` eklenmeli, dosya taraması da özyinelemeli ve `.ts|.mts|.cts` kapsamlı olmalı.
2. **(Kozmetik) M9 mesajı.** Noktalı virgülsüz stilde `^import\b[^;]*;` eşleşmiyor ve rapor "has no import statements" diyor. Test yine kırmızı, yani güvenlik açığı yok; sadece teşhis yanıltıcı.
3. **(Orta, önceden var, commit kapsamı dışı) `src/lib/db.ts:6` `localhost:5432` varsayılanı.**
   - DATABASE_URL tanımsızken betikler ve worker sessizce localhost:5432'ye gidiyor. Bu makinede o portu başka bir Docker Postgres'i dinliyor (D ve NEG, "Authentication failed").
   - Container içinde hata sebebi boş basılıyor (E5), bu yüzden operatör hangi DB'ye gidildiğini göremiyor.
   - cs-fb bunu Açık soru olarak kaydetmiş; ben de ayrı kart açılmasını destekliyorum: DATABASE_URL yoksa açık hata verilmeli, en azından `NODE_ENV=production` iken.
   - Compose DATABASE_URL verdiği için bugünkü dağıtım yolu etkilenmiyor.
4. **(Bilgi) Yeni .env yükleyen 9 betik.** Bu betikler shell'de karşılığı olmayan her .env anahtarını artık alıyor: `NODE_ENV=development`, `DEMO_LOGIN_ENABLED=true`, boş `STRIPE_SECRET_KEY=` (bu `""` olarak gelir, `undefined` değil). `stripe-sync` `||` kullandığı için etkilenmiyor. Diğer betiklerde `??` ile boş dize ayrımı yapan bir yol görmedim. Bu durum mevcut 20+ betikle ve Next'in kendi .env yüklemesiyle aynı; yalnızca bilgi için yazıyorum.
5. **(Bilgi) cwd bağımlılığı.** dotenv `.env` dosyasını `process.cwd()` üzerinden arıyor. `pnpm <script>` paket kökünde koşar. Betik `cd scripts && tsx x.ts` şeklinde koşulursa .env bulunmaz ve bulgu 3'teki varsayılana düşülür. Dokümana bir satır eklemek yeterli.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUMMQDJPXQH63-fe-fb-inceleme47.md` (yalnız bu rapor).

## 5. Riskler / Açık sorular
- Görev metninde iki ayrı sonuç yolu vardı. Birincisi "SONUÇ DOSYASI" satırındaki bu yol. İkincisi köşeli parantezli kanıt notundaki `/Users/macbook/alan/docs/agent-results/TASK-MUMMQDJPXQH63-cs-fb.md`. İkinci yol cs-fb'nin kendi rapor adı ve proje reposunun dışında. Açık "SONUÇ DOSYASI" yolunu seçtim; cs-fb'nin dosyasının üzerine yazmadım.
- Windows ve Linux'ta host üzerinde koşulmadı (aşağıya bakın).

## 6. Sonraki adım
- B-3 için kart: db.ts'te DATABASE_URL yoksa açık hata verilsin (be-fb/lider kararı).
- B-1 ve B-2 için bekçi sertleştirmesi: dinamik import/require, özyinelemeli tarama ve `.mts`; M4–M7 mutantları bu işin kabul testi olarak kullanılabilir.

**Platform beyanı:** Doğrulama **mac** (Darwin 27, host tsx) ve **Linux** (node:22-alpine worker imajı, Docker Desktop; E3–E5) üzerinde yapıldı. **Windows koşulmadı**, çünkü bu makinede Windows yok. Koddan bakınca `import 'dotenv/config'` `path.resolve(process.cwd(), '.env')` kullanıyor; ayraçtan bağımsız olduğu için davranış aynı olmalı. Bekçi testi `path.join` ve `readdirSync` kullanıyor. CRLF riski ölçüldü: Windows'ta autocrlf ile checkout edilmiş bir ağaçta dosyalar CRLF olur. Bekçinin aynı regex'lerine CRLF'li bir örnek verildiğinde ilk import `"import 'dotenv/config';"` olarak yakalandı, kabul edildi (`true`) ve app import'u tespit edildi (`true`). Yani yanlış kırmızı beklenmiyor. Ölçüm Node ile mac üzerinde yapıldı; Windows'ta koşulmadı.
