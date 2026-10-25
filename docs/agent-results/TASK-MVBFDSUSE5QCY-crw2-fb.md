---
sözleşme: 3
görev: TASK-MVBFDSUSE5QCY
kod: TASK-MVBFDSUSE5QCY
ajan: crw2-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: Düzeltme gerekli. db:setup iki kez exit 0, RLS ve tam test temiz, ama tırnaklı bir DATABASE_URL'de parola hem pre-push çıktısına hem db-setup ret mesajına açık yazılıyor (B-1). Ayrıca üç küçük atlatma ya da gevşeme var.
platform: mac (Darwin 27, izole pgvector/pgvector:pg16 konteyneri 127.0.0.1:5478, ayrı worktree; 3000 ve 5433 kullanılmadı). Linux (CI) koşulamadı: GitHub CI ödeme sorunu yüzünden başlamıyor. Koddan: db-setup.sh ve pre-push POSIX sed -E ve bash kullanıyor, Linux'ta aynı davranır; B-1 sızıntısı da aynıdır. CLAUDE.md tarifindeki `sed -i ''` GNU sed'de çalışmaz (Ö-4). Windows: bash betiği, yalnız WSL/Git-Bash.
sürüm: 1
tarih: 2026-10-19T16:47:54.698Z
---

# FO-16 · PR #119 kod incelemesi (db:setup, migrate engeli, pre-push)

## Ne yapıldı
PR #119'un diff'i (10 dosya, +149/−24) satır satır okundu. Dal ayrı bir worktree'de (`scratchpad/wt119`, detached 1f3bb04a) ve ayrı bir Postgres konteynerinde (`crw2-fo16-pg`, 127.0.0.1:5478) koşuldu. Ortak 5433 DB'ye ve 3000 portuna dokunulmadı. Kod değiştirilmedi, merge edilmedi.

## Hüküm: **Düzeltme gerekli** (1 bloke eden, 3 orta/düşük, 3 öneri)

### B-1 (BLOKE EDER, güvenlik/sır sızıntısı): tırnaklı DATABASE_URL'de parola terminale yazılıyor
- **Yer:** `githooks/pre-push:13-14` ve `scripts/db-setup.sh:37,44-49`
- **Neden:** Maskeleme regex'i `^[a-z]+://…` ile başlıyor. Eşleşmediği her durumda `sed` girdiyi olduğu gibi basar. Pre-push `.env` değerinin tırnaklarını hiç soymuyor. db-setup yalnız çift tırnağı soyuyor, tek tırnağı soymuyor. dotenv iki tırnak biçimini de geçerli sayar, yani bu biçimler gerçek `.env`'lerde bulunur.
- **Kanıt (ham):**
```
.env: DATABASE_URL="postgresql://fabrika:Sekr3tPw@localhost:5478/fabrika"
→ veritabanı: "postgresql://fabrika:Sekr3tPw@localhost:5478/fabrika"          # pre-push, her push'ta
.env: DATABASE_URL='postgresql://postgres:REALPW@db.abc.supabase.co:5432/postgres'
db-setup: refusing 'postgresql://postgres:REALPW@db.abc.supabase.co:5432/postgres': only a local or CI database ...
POSTGRESQL://u:p@prod.example.invalid/db → db-setup: refusing POSTGRESQL://u:p@prod.example.invalid/db ...
```
- **Etki:** En kötü durum, korumanın tam var olduğu senaryoda oluşuyor. `.env`'e tırnakla yapıştırılmış bir canlı (Supabase) URL'si reddediliyor ve canlı parola ajan pane loguna yazılıyor. Worker raporundaki "parola yok" iddiası bu girdi için doğru değil.
- **Önerilen düzeltme (2-3 satır):** Maskeyi fail-closed yap: regex eşleşmezse `<ayrıştırılamadı>` yaz, girdiyi asla yazma. Örneğin `sed -nE 's#…#\2/\3#p'` ile yalnız eşleşmeyi bas ve boşsa sabit metin kullan. İki tırnak biçimini de iki dosyada aynı fonksiyonla soy.

### O-1 (orta, bloke etmez): `?host=` sorgu parametresi localhost reddini atlatıyor
- **Yer:** `scripts/db-setup.sh:44-49`. Kontrol yalnız yetki bölümündeki host'a bakıyor. libpq ise URI'deki `?host=` / `?hostaddr=` / `?service=` değerini önceliklendirir.
- **Kanıt:**
```
DATABASE_URL=postgresql://u:p@localhost:5478/fabrika?host=prod.example.invalid
db-setup: target localhost:5478/fabrika
db-setup: [1/7] ensure_rls event trigger
psql: error: could not translate host name "prod.example.invalid" ...   # psql localhost dışına gitmeye çalıştı
```
- Kazayla değil, ancak bilerek yazılmış bir URL ile oluşur. Bu yüzden kaza önleyici korumayı bozmaz, ama "atlatılamıyor" iddiası tam değil. **Düzeltme:** sorgu dizesinde `host=|hostaddr=|service=` varsa reddet.

### O-2 (orta, bloke etmez): `prisma --config prisma.config.ts migrate deploy` engeli aşıyor ve yarım DB'yi yeniden üretiyor
- **Yer:** `prisma.config.ts:12`. `filter(a => !a.startsWith('-'))` bayrağı atıyor ama bayrağın değerini atmıyor, bu yüzden `cmd` = `prisma.config.ts` oluyor.
- **Kanıt (boş `empty2` DB'si):**
```
$ prisma --config prisma.config.ts migrate deploy
DbError { ... message: "relation \"FollowupDoc\" does not exist" ... }   exit=1
_prisma_migrations | CalendarConnection ; add-calendar-connections|t ; add-m10-dual-approval-persistence|f
```
Engelli biçimler doğru çalışıyor. `migrate deploy`, `migrate dev --create-only`, `migrate reset --force` ve `migrate deploy --schema …` açık mesajla exit 1 veriyor ve DB boş kalıyor (0 tablo). `migrate status` ve `migrate diff` çalışıyor. `generate` ve `validate` exit 0 veriyor. Config'i Prisma CLI dışında yükleyen bir şey yok (`git grep prisma.config` yalnız CLI'yı gösteriyor). `@prisma/client` runtime'ı config'i yüklemiyor.
- **Düzeltme:** `const a = process.argv.slice(2); const i = a.indexOf('migrate'); if (i >= 0 && a.slice(i + 1).some((x) => x === 'deploy' || x === 'dev' || x === 'reset'))`

### O-3 (düşük-orta, bloke etmez): sıra testi bir mutantı artık yakalamıyor
- **Yer:** `tests/rls-coverage.test.ts:438-441`. `step 2 "prisma db push"` etiketi `prisma db push` iğnesini karşılıyor.
- **Mutant koşusu (ham):**
```
baseline:                                   1 passed
M1 `pnpm exec prisma db push` komutu silindi: 1 passed   ← eski test (CI adımı) bunu yakalardı
M2 ensure-rls db push'tan sonra:            1 failed  ✓
M3 4. adım `pnpm db:rls` silindi:           1 failed  ✓
M4 db:seed silindi:                         1 passed  (eskiden de kapsanmıyordu)
M5 CI'da db:setup tek kez:                  1 passed  (iki kez koşu artık testte değil)
```
- **Düzeltme:** iğneyi `'pnpm exec prisma db push\n'` yap. İsteğe bağlı: CI adımında `pnpm db:setup` iki kez geçmeli (`/pnpm db:setup\n\s*pnpm db:setup\n/`).

### Öneriler (kusur değil)
- **Ö-1:** `.claude/commands/add-table.md:4` hâlâ `pnpm db:migrate --name …` diyor. Bu komut artık reddediliyor, yani /add-table skill'i ajanı hataya götürür. `docs/DEVOPS-POSTGRES-SETUP.md:33,70`, `docs/SECURITY_COMPLIANCE.md:39` ve `docs/ARCHITECTURE.md:88` de eski tarifi anlatıyor. `package.json`'daki `db:migrate` script'i kaldırılabilir ya da mesaj veren bir script'e çevrilebilir.
- **Ö-2:** `playwright.config.ts` yer tutucusu yalnız boş değerde devreye giriyor (`||`). dotenv config başında yüklendiği için `.env`'deki gerçek değer kazanıyor ✓. Etki yalnız e2e webServer env'inde, prod'a sızmıyor ✓. Tek istisna: eski adla yalnız `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` tanımlayan bir geliştiricide yer tutucu `AUTH_GOOGLE_ID` bu çifti e2e'de ezer (`src/lib/auth.ts:368` önce `AUTH_GOOGLE_ID`'ye bakıyor). Bu yalnız test ortamını etkiler.
- **Ö-4:** CLAUDE.md worktree tarifindeki `sed -i ''` yalnız BSD/mac'te çalışır. Linux'ta `perl -pi -e` (tarifin bir sonraki satırı gibi) taşınabilir olur.

### Sorulara yanıtlar
1. **prisma.config engeli:** prod akışını kırmıyor (§3.1 `migrate` kullanmıyor). `migrate status` ve `migrate diff` çalışıyor. generate ve @prisma/client etkilenmiyor. Açık nokta O-2.
2. **db-setup.sh:** sıra, CI'ın eski adımıyla aynı (generate eklendi; CI'da zararsız tekrar). Localhost reddi kaza durumunda doğru ve fail-closed çalışıyor (`localhost.evil`, `localhost@evil`, çok-host, büyük harfli şema reddedildi). Açık noktalar O-1 ve B-1. İdempotent: iki koşu da exit 0. Normal koşu logunda parola yok (`grep -c Sekr3tPw` → 0/0). `db:rls-role` parolayı `***` ile maskeliyor.
3. **pre-push:** gevşemedi, daha sıkı oldu. `.env` de `DATABASE_URL` de yoksa exit 1 veriyor (kanıt aşağıda). Atlatma yolu eklenmedi. Sır sızıntısı B-1.
4. **playwright:** sorun yok (Ö-2 notu dışında).
5. **rls-coverage:** kısmen gevşedi (O-3, M1).
6. **İzole db:setup ×2:** exit 0 / exit 0.

## Kanıt (ham çıktı)
```
$ pnpm db:setup   (1. koşu) exit1=0
$ pnpm db:setup   (2. koşu) exit2=0
db-setup: target localhost:5478/fabrika
db-setup: [0/7] db:generate … [7/7] db:seed
db-setup: done (localhost:5478/fabrika)
pnpm db:setup  6.09s user 1.12s system 52% cpu 13.640 total
grep -c Sekr3tPw run1.log run2.log → 0 / 0
pg_policies count → 113   (worker: 113; fe-fb'nin 112'sine dev'deki FO-52 politikası eklendi)
pnpm rls:check  → exit=0 ; pnpm rls:verify → "✅ 47 kiracıya özel tabloda … GERÇEKTEN ölçüldü" exit=0
pnpm typecheck → exit=0 ; eslint (değişen 3 TS dosyası) → exit=0
vitest rls-coverage + prisma-cli-url → 44 passed
Tam vitest (CI=true): 363 passed | 4 failed dosya; 4799 passed | 108 skipped
  4 dosyanın düşme nedeni: AUTH_SECRET boştu (tarifin perl adımını ben atlamıştım, PR'ın kusuru değil)
  AUTH_SECRET verildikten sonra o 4 dosya: 4 passed, 54 tests passed
  → toplam 4853 geçti / 54 atlandı / 0 düştü (worker'ın sayılarıyla aynı)
pre-push, .env yok + DATABASE_URL yok → "pre-push: bu checkout'ta .env yok …" hook-exit=1
```

## Değişen dosyalar
Yalnız bu rapor. PR koduna dokunulmadı.

## Riskler
- B-1 merge edilirse tırnaklı `.env` kullanan her geliştirici her push'ta parolasını loga yazar.
- O-2 ve O-1 kaza değil, bilinçli bir biçim gerektiriyor. Düşük olasılık, ama O-2 tam da kartın kapatmak istediği yarım DB'yi üretiyor.
- `pnpm gate` / gerçek push bu incelemede koşulmadı (worker raporunda var). Tam vitest ve RLS gate parçaları bağımsız olarak doğrulandı.

## Açık sorular
Yok.

## Sonraki adım
devop-fb: B-1'i düzeltsin (O-1, O-2 ve O-3 aynı commit'te 1'er satır), sonra delta incelemesi. Temizlik: worktree `scratchpad/wt119` ve konteyner `crw2-fo16-pg` bu oturumda kaldırıldı.
