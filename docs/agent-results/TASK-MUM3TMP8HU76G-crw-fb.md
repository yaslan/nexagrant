# TASK-MUM3TMP8HU76G — FB İNCELEME-11 (crw-fb)

Repo `/Users/macbook/alan/FONBRIDGE`, dal `dev`. Kod değiştirilmedi, push yok.

Kapılar ayrık worktree'de HEAD `5294480f` üzerinde koşuldu. Bu HEAD dört kartın commit'lerinin hepsini içeriyor (`git merge-base --is-ancestor` ile kontrol edildi). Paylaşılan ağaçta o sırada fe-fb'nin commit'lenmemiş B6 işi vardı. İnceleme sürerken B6 `897d3608` olarak dev'e girdi. Kart 1'in MILP'ini ayrıca bu commit'e karşı da koştum (bkz. Kart 1, "B6 sonrası").

| Kart | Görev                                          | Commit'ler                                | Karar                                                                                  |
| ---- | ---------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | TASK-MUM2RMN3YIBGC "Tükendi" kaldırma, D=0     | `fb133d28`                                | **ONAY**. Ö-1 yeni bir kanal: kayıt formu üzerinden yoklama. Pilot öncesi karar ister. |
| 2    | TASK-MULXYTBJAK2U3 dev ortamı README           | `ae9420fc` `a51ccfa3`                     | **ONAY** (Ö-1 libpq keg-only)                                                          |
| 3    | TASK-MUM033NPP7UFI E2E networkidle göçü        | `056e83f6` `959bf02c` `7abb31a4` `12ada5cd` | **ONAY** (Ö-1, K-1, K-2)                                                               |
| 4    | TASK-MULV9UJBSYJCD bakım (şema, pnpm, env)     | `b11a7b03` `83fc292f` `09c612e2`          | **ONAY** (K-1)                                                                         |

**PİLOT KAPISI (a) KAPANDI.** Bu hüküm kod paneli ve sunucu yanıtı kanalı için geçerli. Kendi MILP saldırganım yeni kodda 2.420 tabloda 0 sızıntı buldu:

- D = 0 ve D ≥ 0 için ayrı ayrı;
- 2 üreteç × 3 kod dağılımı (ajans geneli, tür başına, il başına) × 2 verme stratejisi;
- funnel 5'e yuvarlanmış, kod paneli yalnız durum gösteriyor.

Aynı saldırgan eski kodda (pozitif kontrol) 1.200 tablonun 22'sinde sızıntı buldu. B6 sonrası HEAD'de (`897d3608`, D = 0) de 1.200 tabloda sızıntı yok.

Bloke etmeyen ama pilot öncesi karar isteyen bir kanal kaldı (Ö-1). Davet kodunu bilen ajans, kayıt formunda kendi kodunu deneyerek "tükendi" bilgisini geri alabilir. Bugün üretimde kodla kayıt kapalı (kapı c), bu yüzden kanal şu an çalışmıyor. Kapı (c) açılınca çalışır.

## 1. Ne yapıldı

1. Kapıları ayrık worktree'de (`5294480f`, `.env` kopyası) kendim koştum. Ayrıca `apply-migrations.sh --list`, `gh run list/view` ve :3000'de canlı ajans paneli kontrolü yaptım.
2. **Kart 1:**
   - `fb133d28` diff'ini satır satır okudum.
   - `inviteCodeStatus`, `listInviteCodesIn`, i18n, UI ve testleri inceledim.
   - Kayıt yolunu okudum: `auth.ts` authorize, `redeem_agency_invite` SQL fonksiyonu.
   - #17 testini eski kodda koşturup kırmızı olduğunu gördüm.
   - MILP saldırganımı (`milp2.py` + `gen2.ts`) yeni statü modeliyle yeniden koştum: 24 yapılandırma, pozitif kontrol ve B6 varyantı.
3. **Kart 2:**
   - Scratchpad'e temiz bir klon açtım (`5294480f`). README akışını adım adım koştum.
   - İzolasyon: ayrı proje adı (`crwfbclean`), konteyner ve volume adlarını değiştiren bir ek `-f` dosyası, 55533/56479/51125/58125/3237 portları.
   - Sonra `down -v` ile kapattım. Paylaşılan `fabrika-postgres`'e yalnız okuma sorgusu attım.
4. **Kart 3:**
   - Diff'i okudum.
   - Lint kuralını üç biçimde yokladım.
   - CI koşularını `gh run view` ile doğruladım: job durumu, E2E özeti, skip ve retry.
5. **Kart 4:**
   - `prisma migrate diff` koştum: paylaşılan dev DB'ye karşı (yalnız okuma) ve temiz klon DB'sine karşı.
   - Eski şema + migration DB'si kurup karşılaştırdım.
   - `.env.example`'ı md5 ile sır taramasından geçirdim. Değer basılmadı.

## 2. Kanıt

### Kapılar (ayrık worktree, HEAD `5294480f`, `set -a; source .env; set +a`)

| Kapı                    | Sonuç                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `tsc --noEmit`          | rc=0                                                                                            |
| `eslint`                | rc=0                                                                                            |
| `vitest run`            | rc=0 — `Test Files 191 passed \| 2 skipped (193)` · `Tests 2213 passed \| 8 skipped (2221)`     |
| `rls:check`             | rc=0 — "All 47 tenant-scoped models … carries ENABLE + FORCE + tenant_isolation"                |
| `rls:verify`            | rc=0 — "47 kiracıya özel tabloda … izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü"             |
| `rls:bypass-check`      | rc=0 — "no new tenant bypass. 0 … with a recorded reason, 32 on the sanctioned … 0 still owed" |
| `i18n:check`            | rc=0 — "both catalogs agree, every key used in src/ resolves …"                                 |
| `apply-migrations --list` | 29 dosya, sonuncusu `add-agency-funnel-province.sql`                                          |

Kart 1'e ait dosyalar ayrıca verbose koşuldu (`src/lib/agency/`, `ajans/`, `tests/agency-invite.live`, `tests/agency-funnel.live`): `Test Files 7 passed (7) · Tests 83 passed (83)`, atlanan test yok. Saldırgan özellik testi 12 koşu olarak görünüyor: 3 tohum × {D ≥ 0, D = 0} × {rastgele, art arda 6'lık kodlar}.

### Kart 1: kod ve test

- `inviteCodeStatus` artık yalnız `revoked`, `expired` ve `active` döndürüyor. `listInviteCodesIn` `usedCount`'u select etmiyor.
- `src/` içinde "exhausted" yalnız yorumlarda geçiyor. `billing/catalog.ts`'teki eşleşme ilgisiz.
- i18n: `status.exhausted` anahtarı iki katalogdan da silindi, `countsNote` güncellendi.
- **#17 kırmızıdan yeşile:** HEAD'deki `funnel.attack.test.ts`'i eski koda (`fb133d28^`) kopyalayıp koştum:

  ```
  × D = 0, crw-fb org-global-zero-six #17: 4 used-up 6-use codes + funnel "25", types "15"/"15" do not bound the fifth code to 2..3
  AssertionError: expected [ Array(1) ] to deeply equal []   + "target": "code#4"
  ```

  HEAD'de aynı test ✓.

- Aynı örnek, gerçek fonksiyonlarla (`tsx`):

  ```
  yeni (HEAD):        kod paneli: [[6,"active"],[6,"active"],[6,"active"],[6,"active"],[6,"active"]] usedCount alanı var mı: false
  eski (fb133d28^):   kod paneli: [[6,"exhausted"],[6,"exhausted"],[6,"exhausted"],[6,"exhausted"],[6,"active"]]
  ```

- **Canlı :3000** (leed-fb'nin sunucusu, var olan demo kullanıcısı `b2v0219-ajans@example.org`, veri eklenmedi):

  ```
  login 302 · /tr/ajans 200 161557 bayt
  Tükendi 0 · exhausted 0 · usedCount 0 · Used up 0 · "kullanım sınırına ulaşan kod da" 2
  ```

### Kart 1: kendi MILP'im (D = 0 dahil)

Yöntem: İNCELEME-10'daki `milp2.py` + `gen2.ts`, scipy HiGHS, tam sayılı.

- **Veri:** Her tablo gerçek `buildAgencyFunnel` ile yayımlanıyor: ajans geneli, tür görünümü ve her il görünümü. Her kod gerçek `inviteCodeRow` + JSON'dan geçiyor. Üreteç `usedCount` sızarsa hata fırlatıyor.
- **Yayın kuralı:** Her sayı `[max(5, v−2), v+2]` aralığında.
- **Kod bilgisi:** Yeni statü modelinde (`NEWSTAT=1`) "Etkin" hiçbir şey söylemiyor, yani 0 ≤ kullanım ≤ max. Model yalnız `active`, `revoked` ve `expired` kabul ediyor, başka statü gelirse assert düşüyor.
- **D:** Σ kullanım = R + D. `zero` modunda D = 0 ve saldırgan bunu biliyor.
- **Hedefler:** Gerçek değeri 1..4 olan her gizli hücre, her adım farkı ve her kodun kullanımı.
- **Ölçüt:** Önce MILP min, min ≥ 1 ise MILP max. Sızıntı = 1 ≤ min ve max ≤ 4. LP ile budama yok.
- **Solver kontrolü:** Solver durumu 0 olmayan her hedef `solver_warn` olarak sayılıyor.

| Model                                                                   | Tablo                     | Sızan tablo | solver_warn |
| ----------------------------------------------------------------------- | ------------------------- | ----------- | ----------- |
| **yeni (HEAD), D = 0**, 2 üreteç × 3 dağılım × {six, mix}               | 1.200 (+20 ön deneme)     | **0**       | 0           |
| **yeni (HEAD), D ≥ 0**, aynı 12 yapılandırma                            | 1.200                     | **0**       | 0           |
| **pozitif kontrol: eski kod (`fb133d28^`), D = 0**, aynı 12 yapılandırma | 1.200                     | **22**      | 79 (tek dosya) |
| B6 sonrası (`897d3608`, readiness adımı), D = 0, 12 yapılandırma        | 1.200                     | **0**       | 0           |
| B6 pozitif kontrol: aynı veri, eski kesin sayaçlı panel (`OLD=1`)       | 200 (2 yapılandırma)      | **5 + 17**  | 0           |

Dökümler:

- **Yeni, D = 0**, sızan / 100 tablo: org-global six 0 · mix 0 · org-type 0 · 0 · org-province 0 · 0 · cell-global 0 · 0 · cell-type 0 · 0 · cell-province 0 · 0. Kontrol edilen küçük hedef sayısı yapılandırma başına 8.684–11.774.
- **Eski, D = 0**, sızan / 100 tablo: org-global six 1, mix 0 · org-type 3, 0 · org-province 2, 0 · cell-global 2, 1 · cell-type 5, 3 · cell-province 5, 0.
  - Eski koddaki örnek: `inst=48 code#3[*|*,active,max6] true=4 ILP=[3,4]`. Sızan her hedef bir "Etkin" kodun kullanımı. Bu, İNCELEME-10 B-1'in sınıfının aynısı.
  - 79 solver uyarısının hepsi tek bir pozitif kontrol dosyasından geliyor (`old-org-province-zero-mix`, "infeasible"). Yeni koddaki 24 dosyada 0 uyarı var. Uyarı sonucu etkilemiyor: kontrol tarafında bir örnek atlanmış oluyor, yani 22 bir alt sınır.
- Yeni koddaki 541 kodun 462'si tam kullanılmış (`org-global-zero-six`) ve hepsi `active` yayımlanıyor.

**Kodlar il ya da tür başına dağıtıldığında** (`province` ve `type` satırları) da sızıntı yok. #17 örneğinde saldırgan yeni kodda şunu elde ediyor: R ∈ [26, 27], 5 kodun her biri ≤ 6 → her kod [2, 6]. Üst sınır 4'ün üstünde, yani sızıntı yok.

### Kart 2: temiz klon, README akışı

Klon `5294480f`. README adımları sırayla (psql için docker-exec sarmalayıcısı, port 55533; README "portu değiştirirsen 3 URL'yi çevir" diyor):

```
[01] cp .env.example .env                                   rc=0
[02] perl -pi -e "s|^AUTH_SECRET=\$|…|" .env                rc=0   AUTH_SECRET len=44
     ikinci koşu: md5 aynı (idempotent, ayrı denemede)
[03] docker compose config -q                               rc=0
[03b] docker compose --env-file .env config -q              rc=0
[04] docker compose up -d --wait                            rc=0   crwfbclean-{postgres,redis,mailpit} Healthy
[05] pnpm install --frozen-lockfile                         rc=0   (pnpm-field uyarısı yok)
[05b] pnpm db:generate                                      rc=0
[06] pnpm exec prisma db push                               rc=0
[07] pnpm db:rls-role                                       rc=0   DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@localhost:55533/fabrika
[08] apply-migrations.sh                                    rc=0   29 files applied
[08b] apply-migrations.sh (2. geçiş)                        rc=0   29 files applied
[09] pnpm db:rls && pnpm db:seed                            rc=0   "Seeding completed with E10 data."
     pnpm dev (PORT=3237): GET /tr 200 · GET /tr/giris 200
     pnpm test: Test Files 191 passed | 2 skipped (193) · Tests 2213 passed | 8 skipped (2221) · rc=0
docker compose down -v → crwfbclean konteyner 0, volume 0; fabrika-postgres "Up 7 hours" (dokunulmadı)
```

Repo kökünde `docker compose --env-file .env config -q` rc=0. `--env-file .env.example` (boş AUTH_SECRET) rc=1 ve şu mesajı veriyor: `required variable AUTH_SECRET is missing a value: set AUTH_SECRET (openssl rand -base64 32)`. README'nin anlattığı gibi.

### Kart 3: CI ve lint

```
gh run list --repo yaslan/fonbridge
36508751097 056e83f6 push              failure   (saved-search, 959bf02c ile düzeltildi)
36508795169 / 36508801527 056e83f6 dispatch  success ×2
36510434729 959bf02c push              success   E2E: 177 passed (14.3m), 1 skipped
36510439038 959bf02c workflow_dispatch success   E2E: 177 passed (10.6m), 1 skipped
36510445197 959bf02c workflow_dispatch success   E2E: 177 passed (14.5m), 1 skipped
36510679772 2d4bbbb6 · 36510698317 a7aaf7ca · 36512126673 12ada5cd  push  success  (E2E 177 passed)
```

- 959bf02c'den sonra dev'de art arda 6 yeşil koşu var.
- `playwright.config.ts`'te `retries` tanımı yok, varsayılan 0.
- Atlanan 1 test önceden vardı: koşullu `test.skip` desenlerinden biri. Göç yeni `skip` eklemedi.
- Diff'te eklenen satırlarda yeni timeout, retry ya da skip yok. `waitForTimeout(1500)` iki spec'te yerinden taşındı, değeri değişmedi.
- `grep -rn networkidle tests/e2e` → yalnız `fixtures/hydration.ts:6` (yorum).

Lint kuralı yoklaması (geçici dosya, sonra silindi):

```
waitForLoadState(`networkidle`)            → yakalanmadı
const s='network'+'idle'; waitForLoadState(s) → yakalanmadı
waitForLoadState('networkidle')            → 3:66 error … no-restricted-syntax
```

### Kart 4: şema ve migration hizası

```
prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
  paylaşılan dev DB (:5433, yalnız okuma)          → -- This is an empty migration.
  temiz klon DB (push + migrations, :55533)        → -- This is an empty migration.
  eski şema push + migrations (crw_old)  → yeni şema:
     5 FK DROP/ADD (… ON UPDATE NO ACTION), modules SET DEFAULT ARRAY[], updatedAt SET DEFAULT CURRENT_TIMESTAMP
  eski şema push + migrations → eski şema: DROP INDEX "MeetingBrief_tenantId"   (index'i migration kuruyor)
```

- Migration kaynakları: `add-plan-versioning/migration.sql:35,54,68,69,86` REFERENCES satırlarında ON UPDATE yok; `:44 "modules" TEXT[] NOT NULL DEFAULT '{}'`. `add-invoice-write-path.sql:57 "updatedAt" … DEFAULT CURRENT_TIMESTAMP`. `add-m9-meeting-schedule/migration.sql:13 CREATE INDEX IF NOT EXISTS "MeetingBrief_tenantId"`. Şema bunlarla aynı.
- Paylaşılan dev DB'de `MeetingBrief_tenantId` var. Raporda geri alma komutu yazılı: `DROP INDEX "MeetingBrief_tenantId";` ✓.
- `pnpm-workspace.yaml#allowBuilds` `@parcel/watcher` ve `@swc/core`'u kapsıyor. Temiz klonda `pnpm install` uyarısız rc=0.
- `.env.example` sır taraması (md5, değer basılmadı):
  - 73 anahtar var, 30'unun değeri dolu.
  - `b11a7b03`'ün eklediği 8 satırın hepsi boş.
  - Sağlayıcı deseni (sk_live, whsec_, re_, AKIA, ghp_…) eşleşmesi 0.
  - `.env` ile aynı değeri taşıyan 8 anahtar var: `NODE_ENV`, `WORKER_TOKEN`, `AI_PROVIDER`, `EMBEDDING_MODEL` ve 4 kamu URL'si. Hiçbiri sır değil. `WORKER_TOKEN=change-me` bir yer tutucu ve `195f80ab`'den beri var.

## 3. Bulgular

### Kart 1: TASK-MUM2RMN3YIBGC — ONAY

DoD'nin her maddesi doğrulandı:

- "Tükendi" durumu yok: kod ✓, i18n ✓, UI ✓, canlı ✓.
- Kayıtta tükenen kodun reddi değişmedi (`redeem_agency_invite`: `usedCount < maxUses`).
- Saldırgan testi D ≥ 0 ve D = 0 ile koşuyor ✓.
- #17 kırmızıdan yeşile ✓.
- Ö-2 yorumu `funnel.ts:39-47`'de ✓.
- HUKUK-5 notu güncel ✓. Ö-1'deki cümle hariç.

**Ö-1: Davet kodunu bilen ajans, kayıt formunu yoklayarak "tükendi" bilgisini geri alabilir. Bu, kaldırılan durumun aynısı.**

- Yer:
  - `src/lib/auth.ts:271-297`: kullanıcı transaction içinde oluşturuluyor, `redeemInviteCode` null dönerse `InviteCodeRejectedError` fırlatılıyor ve hepsi geri alınıyor;
  - `prisma/migrations/add-agency-invite-code.sql:148-158`: kod yalnız `revokedAt IS NULL AND expiresAt > now AND usedCount < maxUses` ise kullanılıyor.
- Mekanizma:
  - Ajans kodun düz metnini biliyor (oluşturulunca bir kez gösteriliyor, zaten dağıtıyor).
  - İptal ve süre bilgisini de biliyor.
  - Yeni bir e-postayla kendi kodunu kayıtta dener. Ret gelirse tükenmiştir, çünkü iptal ya da süre dolması değildir. Yani kullanım = max.
  - Tükenmiş kodda ret yan etkisiz: hesap açılmıyor, yalnız ajansın kendi kiracısına `reason='exhausted'` denetim satırı yazılıyor.
  - Tükenmemiş kodda kayıt başarılı olur ve sahte bir kurum açılır (R + 1). Ajans bunu bildiği için bilgi kaybetmez. Ama #17 türü saldırıda buna gerek yok: yalnız dolu olduğundan şüphelendiği kodları dener.
- **Somut örnek (#17):**
  - Ajans 4 kodu dener, 4 ret alır, yan etki olmaz.
  - "Tükendi ×4" bilgisi eski panelle aynı olur.
  - Sonuç: R ∈ [26, 27], R = 24 + a, yani **a ∈ [2, 3]**.
  - Bu, pozitif kontrol modelinin kendisi. Aynı veride D = 0 ile 1.200 tablonun 22'si sızıyor.
- Neden bloke etmiyor:
  - Kodla kayıt bugün yalnız `DEMO_LOGIN_ENABLED` açıkken var. Üretimde kapalı (ROADMAP açık karar #21, pilot kapısı c).
  - Kanal etkin bir kötüye kullanım gerektiriyor: ajans kendi koduyla sahte kayıt denemesi yapmalı.
  - Kartın kapsamı panel ve yanıt kanalıydı.
- Gereken:
  1. HUKUK-5 notundaki "ajans tükenen kodu **ancak** kayıt olamayan bir kurumun kendisine söylemesiyle öğrenir" cümlesi yanlış (`docs/legal/agency-channel-notice-addendum.md:138`). "Ajans kendi kodunu kayıtta deneyerek de öğrenebilir" diye düzeltilmeli ve R-1/R-2 gibi açık risk kabulüne yazılmalı.
  2. Kapı (c) kartına (kalıcı giriş yöntemi) not düşülmeli. Kalıcı kayıt akışı açılınca bu yoklama çalışır.
     - Hafifletme adayları: kayıt denemelerinde IP/e-posta hız sınırı; aynı kod için `reason='exhausted'` ret satırlarında platform alarmı (satırlar zaten var).
     - Tam kapatma ürün kararı gerektirir, örneğin "üst sınır yumuşak, sınırı aşan kayıt kabul edilir ve ajansa sayılmaz". Leed-fb/HUKUK-5'in kararı.

**K-1:** `funnel.attack.test.ts:403` test adı hâlâ `'one code, used up: the panel says "exhausted", never how many'`. Panel artık bunu söylemiyor. Ad "reads active" olmalı. Kozmetik.

**K-2:** Paylaşılan dev DB'de `maxUses = 1`, `usedCount = 1`, iptal edilmemiş, süresi dolmamış bir kod var. Bu R-1'deki "minimumdan önce üretilmiş kod" sınıfı. HUKUK-5 notu bu kodların pilottan önce iptal edilmesini öneriyor. Pilot DB'si kurulurken aynı kontrol yapılmalı. Dev verisi, kod kusuru değil.

**B6 notu (kapsam dışı, bilgi):** `897d3608` funnel'a `readiness` adımını ekledi. Bu adım `registered`'ın içine yerleşik ve NESTED_STEPS'e eklenmiş. fe-fb saldırgan testini güncellemiş. Ben de MILP'imi bu commit'e karşı D = 0 ile koştum (tablo yukarıda). Sonuç: 12 yapılandırmanın 1.200 tablosunda 0 sızıntı (yapılandırma başına 10.185–13.682 küçük hedef). Aynı veriye eski kesin sayaçlı paneli verince 200 tablonun 22'si sızıyor, yani `readiness` eklenmiş model sızıntıyı görebiliyor. B6'nın kendi incelemesi bunu tekrar etmeli; bu koşu yalnız kapı (a) hükmünün B6 sonrası HEAD'de de geçerli olduğunu gösteriyor.

### Kart 2: TASK-MULXYTBJAK2U3 — ONAY

DoD:

- Temiz klonda README akışı baştan sona çalışıyor: kurulum, migration ×2, rls, seed, dev 200 ve test 2213 ✓.
- AUTH_SECRET üretme adımı idempotent. `:?` korunmasının gerekçesi compose yorumunda ve README'de yazılı ✓.
- `docker compose --env-file .env config` rc=0 ✓.
- Önceki K bulguları değerlendirilmiş: K-1 düzeltilmiş, K-2 belgelenmiş, K-3 gerekçeyle bırakılmış ✓.

**Ö-1: README'nin macOS önerisi `brew install libpq` tek başına `psql`'i PATH'e koymuyor** (`README.md:41`).

- libpq keg-only. Bu makinede kurulu (`libpq 18.4 [keg-only]`) ama `which psql` → "psql not found". İkili `/opt/homebrew/opt/libpq/bin/psql`'de.
- README'yi harfiyen izleyen bir geliştirici adım 8'de `psql: command not found` alır.
- Düzeltme: `PSQL="$(brew --prefix libpq)/bin/psql"` ya da `brew link --force libpq` satırı. Alternatif olarak compose'daki konteynerle çalışan bir docker-exec sarmalayıcısı `scripts/`'e konabilir.
- README `PSQL=` seçeneğini zaten anıyor, bu yüzden bloke etmiyor.

### Kart 3: TASK-MUM033NPP7UFI — ONAY

DoD:

- `grep networkidle tests/e2e` → 0 (yalnız fixture yorumu) ✓.
- Beklemeler somut sinyale bağlı: hidrasyon, locator ya da pozitif çapadan sonra `toHaveCount(0)` ✓.
- Timeout, retry ya da skip eklenmemiş ✓.
- Lint kuralı var ✓.
- 959bf02c'de 3/3 yeşil (`gh run view` ile, E2E 177 passed), ardından 3 yeşil push daha ✓.
- **saved-search sorunu ele alındı:** Kök neden, `fill`'in hidrasyondan önce sunucu HTML'ine düşmesi ve React'in kontrollü değeri `''`'ya sıfırlamasıydı. `expectHydrated(searchBox)` bunu kapatıyor. Sonraki 6 koşu yeşil.

**Ö-1: saved-search'te `waitForRequest` hidrasyondan ÖNCE kuruluyor, ikisi aynı 30 sn bütçeyi paylaşıyor** (`tests/e2e/saved-search.spec.ts:84-94`).

- Senaryo: Hidrasyon yavaş bir runner'da 28 sn sürerse `debouncedQuery`'nin 30 sn'si `fill` ve 400 ms debounce'tan önce dolar, test yanlış kırmızı verir.
- `expectHydrated` kendi başına zaman aşımına düşerse `debouncedQuery` promise'i sahipsiz reddedilir. Hata mesajı da karışır.
- Düzeltme: bekleyiciyi `expectHydrated`'dan sonra, `fill`'den hemen önce kurmak. Sıra korunur, çünkü istek `fill`'den sonra çıkıyor.

**K-1: Lint kuralı yalnız düz string literal'i yakalıyor** (`eslint.config.mjs:43`). `` `networkidle` `` (template literal) ve birleştirilmiş string geçiyor (yokladım). Ek seçici önerisi: `TemplateLiteral[quasis.0.value.raw='networkidle']`. Kasıtsız bir kaçış olası değil, düşük öncelik.

**K-2: Lint mesajı mekanizmayı yanlış anlatıyor.** Mesaj "next dev never goes idle (HMR websocket)" diyor. Playwright networkidle websocket'i saymıyor (İNCELEME-10 Kart 4 K-1, kaynak alıntısıyla). Mesaj "a dev server rarely goes 500 ms without an HTTP request" gibi olmalı. `fixtures/hydration.ts`'teki açıklama zaten doğru.

### Kart 4: TASK-MULV9UJBSYJCD — ONAY

DoD:

- Ölü `pnpm` alanı silindi, `allowBuilds` kapsıyor ✓.
- `modules @default([])` ve `updatedAt @default(now())` migration'larla aynı. `migrate diff` iki DB'de boş ✓.
- FK `onUpdate: NoAction` ve `MeetingBrief_tenantId` hizası kaynak satırlarıyla gerekçeli ✓.
- Yerel DB'ye uygulanan index için geri alma komutu raporda ✓.
- `.env.example`'daki yeni anahtarlar boş ya da yorum satırı, sır yok (md5) ✓.

**K-1: Bu commit'ten ÖNCE `db push` ile kurulmuş DB'ler kendiliğinden hizalanmaz.**

- Migration'lar `CREATE … IF NOT EXISTS`. Eski şemayla push edilmiş bir DB'de FK'ler `ON UPDATE CASCADE` olarak kalır, `modules` ve `updatedAt`'in varsayılanı da olmaz.
- Ölçüm: `crw_old` DB'sinde migration'lardan sonra diff'te 5 FK ve 2 varsayılan kaldı.
- CI DB'si her koşuda sıfırdan kuruluyor, paylaşılan dev DB ise migration'la kurulmuş ve boş diff veriyor. Bu yüzden bugün etkisi yok.
- Ö-2'deki CI kayma kapısı eklenirse elle kurulmuş eski bir DB'de kırmızı verir. Beklenen davranış bu; README'de bir satırla anılabilir.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUM3TMP8HU76G-crw-fb.md` (bu rapor). Başka dosyaya dokunulmadı.
- Repo dışı: scratchpad'de worktree'ler (`wt`, `wt-old`, `wt-b6`) ve klon `fbclean`. Klonun compose yığını `down -v` ile silindi. Paylaşılan DB'ye yazma yok. :3000'de var olan demo hesabıyla oturum açıldı, veri eklenmedi.

## 5. Riskler

- MILP üreteçleri benim modelim: gruplara dağıtılan kodlar, "tükenince yenisi" stratejisi ve iki tablo üreteci. Kurum başına tek kod gibi başka dağıtımlar koşulmadı. Sonuç bir ispat değil, 2.420 tabloluk bir arama.
- Ö-1'in ciddiyeti kapı (c)'ye bağlı. Kalıcı kayıt akışı açılmadan kanal çalışmıyor.
- Kart 2'nin temiz klonunda `apply-migrations` için host psql yerine docker-exec sarmalayıcısı kullanıldı. psql'in kendisi (Ö-1) denenmedi.

## 6. Açık sorular

1. **leed-fb / HUKUK-5:** Ö-1 (kayıt yoklaması) risk kabulü olarak mı yazılsın, yoksa kapı (c) tasarımında hafifletme mi istensin?
2. **leed-fb:** K-2'deki `maxUses < 6` kodlar için pilot DB'sinde otomatik bir kontrol (seed ya da migration sonrası uyarı) istenir mi?

## 7. Sonraki adım

- Kart 1: HUKUK-5 notundaki cümle düzeltmesi ve kapı (c) kartına not (Ö-1), test adı (K-1). fe-fb ya da cs-fb, küçük iş.
- Kart 2: README'ye libpq PATH satırı (devop-fb).
- Kart 3: saved-search'te bekleyicinin sırası (se-fb), isteğe bağlı lint seçicisi ve mesajı.
- Kart 4: yok.

## Platform beyanı

Doğrulama **mac** üzerinde yapıldı (darwin, zsh + bash 3.2, Docker Desktop, pgvector pg16 konteynerleri). Kart 3'ün E2E doğrulaması **Linux** CI runner koşularına dayanıyor (`gh run view` ile okundu, E2E'yi yerelde koşmadım).

- Kart 1 platformdan bağımsız: saf TS fonksiyonları, SQL ve JSON.
- Kart 2 platforma bağlı:
  - `perl -pi -e` ve `openssl` macOS ve Linux'ta var.
  - `sed -n 's/^…//p'` GNU ve BSD'de aynı çalışıyor.
  - Ö-1 yalnız macOS/Homebrew'a özgü. Linux'ta `postgresql-client` paketi psql'i PATH'e koyar.
  - Windows'ta bu akış (perl, bash betiği) ancak WSL/Git Bash ile çalışır. Koşulamadı: bu makinede Windows yok.
- Kart 4: şema ve dotenv şablonu platformdan bağımsız.
