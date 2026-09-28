# TASK-MULRUCLPGIVIL — FB ORTAM K-8: .gitignore sır desenleri, source edilebilir .env, izlenen .env.example

Ajan: devop-fb · Sprint: FB-GAP-1 · Dal: dev (push yok)

## 1. Ne yapıldı

1. **.gitignore'a genel sır desenleri eklendi** (yalnız `/AB Project SaaS/` değil, her yerde): `client_secret*.json`, `service-account*.json`, `*.p12`, `*.key`, `*.pfx` (`*.pem` zaten vardı). `git ls-files -ci --exclude-standard` boş döndü: bu desenlere uyan **izlenen dosya yok**, o yüzden `!` istisnası gerekmedi.
2. **`!.env.example` istisnası** eklendi (`.env*` kuralının hemen altına, gerekçe yorumuyla). `.env.example` artık izleniyor ve bu commit'le repoya girdi. Git geçmişinde daha önce hiç yoktu (`git log --all -- .env.example` boş).
3. **EMAIL_FROM tırnağa alındı**, hem `.env`'de hem `.env.example`'da: `EMAIL_FROM="<ad> <adres>"`. Değer boşluk ve `<`/`>` içerdiği için kabuk bunu yönlendirme olarak okuyordu. Değerde `"`, `$`, `` ` `` ya da `\` olmadığı önceden kontrol edildi, yani çift tırnak değeri değiştirmiyor.
4. `.env` commit'lenmedi (ignore'da kalıyor). Değişmeden önceki hali, 600 izinle scratchpad'e yedeklendi.

## 2. Kanıt

### git check-ignore (örnek yollar)

```
.gitignore:106:client_secret*.json	client_secret_x.apps.googleusercontent.com.json
.gitignore:106:client_secret*.json	docs/client_secret.json
.gitignore:107:service-account*.json	service-account-prod.json
.gitignore:107:service-account*.json	keys/sa/service-account.json
.gitignore:108:*.p12	cert.p12
.gitignore:108:*.p12	sub/dir/signing.p12
.gitignore:109:*.key	private.key
.gitignore:109:*.key	a/b/server.key
.gitignore:110:*.pfx	cert.pfx
.gitignore:34:.env*	.env
.gitignore:34:.env*	.env.local
.gitignore:34:.env*	.env.production
.gitignore:34:.env*	sub/.env
== .env.example
.gitignore:38:!.env.example	.env.example        # -v negation eşleşmesini gösterir
check-ignore -q rc=1 (1=not ignored)
== AB Project SaaS altındaki gerçek client_secret dosyası
ignored
== tracked files now ignored by new patterns
(end)                                            # boş
```

### source .env (öncesi / sonrası)

```
OLD .env zsh rc=126      # önce: 57/58. satır parse hatası
OLD .env bash rc=1
--- düzeltmeden sonra ---
zsh-ok len=30   zsh rc=0
bash-ok len=30  bash rc=0
sh-ok           sh rc=0
example bash rc=0
example zsh rc=0
```

Uygulamanın kendi ayrıştırıcıları tırnağı soyuyor, yani değer aynı kalıyor:

```
next/env EMAIL_FROM len 30 quoted false    # @next/env 16.3.4 loadEnvConfig
dotenv len 30 false                        # dotenv.parse
```

`scripts/check-rls-live.ts`, `setup-rls-role.ts` ve `apply-rls.ts` içindeki elle yazılmış ayrıştırıcılar da `replace(/^["']|["']$/g, '')` ile tırnağı soyuyor (kod okundu).

### .env.example sır kontrolü (değer basılmadı)

md5 parmak iziyle, `.env.example`'daki her dolu değer `.env`'deki tüm dolu değerlerle karşılaştırıldı:

- **Gerçek sır ile eşleşme: 0.** `.env`'de dolu olan AUTH_SECRET, AUTH_GOOGLE_\*, GOOGLE_CLIENT_\*, CALENDAR_ENCRYPTION_KEY ve RLS rol parolasının hiçbiri şablonda yok. Bu anahtarlar şablonda boş. RLS URL parolasının md5'i `.env`'dekinden farklı.
- Parmak izi eşleşen değerlerin hepsi gizli değil. Tek tek eşitlik kontrolüyle doğrulandı:
  - Genel ayarlar: NODE_ENV, NEXT_PUBLIC_APP_URL, DEFAULT_LOCALE, REDIS_URL, WORKER_URL, AI_PROVIDER, EMBEDDING_\*, SEDIA/CORDIS genel URL'leri, R2_BUCKET, EMAIL_FROM (gönderen adresi), DEMO_LOGIN_ENABLED / EFATURA_INTEGRATOR_TEST_MODE (`true`).
  - `WORKER_TOKEN == "change-me"`, yani yer tutucu.
  - `SEDIA_API_KEY == "SEDIA"`, AB portalının herkese açık anahtarı.
  - DATABASE_URL / \_MIGRATE parolası yerel dev parolası. Zaten izlenen `docker-compose.yml`'de duruyor (`DB pw appears in docker-compose.yml True`).
  - DATABASE_URL_RLS_TEST parolası `== "generated-by-pnpm-db-rls-role"`, yani yer tutucu.
- Desen taraması (`sk-…`, `AKIA…`, `AIza…`, `GOCSPX-`, `whsec_`, `-----BEGIN`, ≥32 karakterlik base64): tek eşleşme SEDIA_TOPIC_DETAILS_URL'in URL yolu, yanlış pozitif.

Yer tutucuya çevrilmesi gereken değer çıkmadı.

### git ls-files

Commit sonrası `git ls-files .env.example` şunu döndürür: `.env.example` (aşağıdaki commit'e bakın).

## 3. Değişen dosyalar

- `.gitignore`: `!.env.example` ve 5 genel sır deseni (commit'lendi)
- `.env.example`: ilk kez izleniyor, EMAIL_FROM tırnaklı (commit'lendi)
- `.env`: yalnız EMAIL_FROM satırı tırnaklandı (**commit YOK**, ignore'da)
- `docs/agent-results/TASK-MULRUCLPGIVIL-devop-fb.md`: bu rapor

## 4. Riskler

- `*.key` geniş bir desen. Gelecekte `.key` uzantılı sır olmayan bir dosya (ör. Keynote) sessizce ignore edilir. Bugün izlenen böyle bir dosya yok. Gerekirse `!yol/dosya.key` ile istisna açılır.
- `.env.example` artık herkese açık bir şablon. Buraya **gerçek değer yazılmamalı**. Kural, `.gitignore`'daki yorumda yazıyor. Bu kontrolü otomatik yapan bir kanca yok (bkz. sonraki adım).
- `.env` değişti. `:3000`'deki dev sunucusu (leed-fb'nin) eski ortamla çalışıyor olabilir. Değer aynı kaldığı için davranış değişmemeli, yine de yeniden başlatması leed-fb'ye bırakıldı.

## 5. Açık sorular

- Şablonda `admin@…` platform-admin adresi bir yorum satırında geçiyor. Bu adres zaten izlenen `src/lib/demo-login.ts` ile aynı bilgi. PII açısından sorun görmedim, ama patron isterse jenerikleştirilebilir.

## 6. Sonraki adım

- leed-fb: `.env` güncellendi, :3000 dev sunucusunu yeniden başlatın.
- İsteğe bağlı: `githooks/` ön-commit kancasına `.env.example` için "dolu SECRET/KEY/TOKEN/PASSWORD değeri yok" kontrolü eklenebilir. Ayrı kart konusu.

## Geri alma

`git revert <bu commit>`: `.gitignore` eski haline döner ve `.env.example` repodan çıkar (yerel dosya kalır). `.env` yedeği scratchpad'de duruyor. Tırnak eklemek değeri değiştirmediği için `.env`'i geri almak gerekmez.

## Platform beyanı

Doğrulama **macOS**'ta yapıldı (Darwin 27, zsh 5.9, /bin/bash 3.2, /bin/sh). `.gitignore` desenleri git tarafından platformdan bağımsız uygulanır. Tırnaklı `KEY="değer"` satırı POSIX sh, bash ve zsh'de aynı şekilde çalışır, yani **Linux**'ta da aynı sonuç beklenir (koşulmadı, Linux makine yok). **Windows**'ta `source` yok. Orada .env'i yalnız Node tarafı (@next/env / dotenv) okur ve bu ayrıştırıcılar tırnağı soyduğu için değer aynı kalır. Windows'ta koşulmadı, makine yok.
