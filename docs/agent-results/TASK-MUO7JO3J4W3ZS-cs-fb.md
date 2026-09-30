# TASK-MUO7JO3J4W3ZS — cs-fb — FB İNCELEME-90: createOpportunity zod + bağlantı-hatası allow-list + slug normalize (TASK-MUO64UQJUWEBI, crw-fb; dev merge cd4fc4f9)

**Durum:** TAMAM
**Karar:** **ONAY — push edilebilir.** İNCELEME-83'teki Y-1 ve O-1 kapandı. Kendi Y-1 girdilerim (NUL, nesne, dizi, sayı) ve 40'tan fazla yeni girdi açık bir retle dönüyor. DB'ye satır yazılmıyor, tampona bir şey düşmüyor, pano temiz. Gerçek DB kesintisinde (konteyner `docker kill`) allow-list doğru çalışıyor, doğrulama hatası tampona düşmüyor. O-1'de döngü yok, `default` takma adında 500 yok.
Push'u **engellemeyen** üç yeni bulgu var. Ayrı kart öneriyorum:
- **O-A:** Kesinti tam alan kontrolü sırasında olursa, üyesi olunmayan bir slug doğrulanmadan tampona giriyor.
- **Y-2 (kapsam dışı, önceden var):** `moveOpportunityStage` ve `assignOpportunityOwner` alan kısıtına bakmıyor. Yalnız ws-b'ye yetkili kullanıcı, ws-a'daki bir fırsatı G0'dan G4'e taşıdı ve sahipliğini kendine aldı. Bu iki aksiyonda Y-1'in "her hata = başarı" kalıbı da duruyor.
- **O-B:** Kiracının en eski alanının slug'ı dilbilgisine uymuyorsa, geçerli bir alan olsa bile `default` ve alan-bağımsız rota `no-workspace`'e gidiyor.

**İncelenen:** dev `c214f02d` (fix `083a4b05`, rapor merge'ü `cd4fc4f9` ve sonrası). Detached worktree `$SCRATCH/wt90`. İzole DB `csfb90-pg` (pgvector:pg16, 127.0.0.1:55890). Paylaşılan `:5433`'e **hiçbir şey yazılmadı**. `next build` + `next start -p 3590`. **Kod değiştirilmedi.**
**Platform beyanı:** Yalnız **macOS**'ta doğrulandı: Darwin 27, Apple Silicon, Node 26, Chrome (Playwright `channel:'chrome'`, 1280×900), Docker Desktop. Windows ve Linux **koşulamadı**, çünkü bu makinede yalnız mac var. Kod yolları platforma bağlı değil: zod doğrulaması, `decodeURIComponent`/NFC/`toLowerCase`, Prisma/pg hata sınıflandırması ve Next yönlendirmesi. Süreç öldürme, dosya yolu, kabuk ya da ikili adı yok. `isDatabaseUnavailable`'ın tanıdığı soket errno adları (`ECONNREFUSED`, `ECONNRESET`…) Node'da her platformda aynı ada sahip. Canlı kesintide görülen mesaj (`Connection terminated unexpectedly`) `pg` sürücüsünden geliyor ve o da platformdan bağımsız. Diğer platformlarda da aynı sonuç beklenir.

## 1. Ne yapıldı
- **İzole DB** (`ekler/dbprep.txt`), CI sırasıyla: şema (`migrate diff --from-empty`, konteyner psql), `db:rls-role`, `apply-migrations` ×2 (40 dosya), `db:rls` (112 politika), `db:seed`. Fikstürler `ekler/fixtures90.sql`: İNCELEME-83 fikstürleri (owner, restr=yalnız ws-b, restrc, del, none, nomem, t5u–t8u) ve yeni eklenenler:
  - `t9u`: en eski alanın slug'ı `Eski_Alan` (dilbilgisi dışı), ikinci alan `gecerli`.
  - T2'ye `kalite` alanı (Kelvin işareti denemesi için).
  - T2, T3, T7 ve T9'da M5 `ModuleState=ON`, pano görünsün diye.
- **Oturum:** `next-auth/jwt encode` ile imzalı `authjs.session-token` (`ekler/mint90.mts`, sır dosyada yok, env'den okunuyor). Çerez dosyası eklere **konmadı**.
- **Denemeler:**
  - 46 + 18 girdilik curl bataryası (`attack90.py`);
  - gerçek Chrome'da "Fırsatlara Ekle" tıklaması, istek gövdesi yolda değiştirildi (10 vaka);
  - DB kesintisi: `Workspace` tablosu kilitlendi, istekler askıdayken konteyner `docker kill` ile durduruldu;
  - O-1 için 33 yönlendirme zinciri (8 hop'a kadar, döngü tespiti) ve Chrome gezintisi;
  - kardeş aksiyonlar (`moveOpportunityStage`, `assignOpportunityOwner`);
  - 18 kendi mutantım;
  - tam kapılar.

## 2. Bulgular ve kanıt

### 2.1 Y-1 kapandı: girdi doğrulaması (ONAY)
restr (yalnız ws-b), ws-b detay sayfasındaki action'a doğrudan istek gönderdi (`ekler/attack90.txt`):
```
 1 Y1 NUL ws-a\0                 | 200 | {"success":false,"error":"INVALID_INPUT"}   (İNCELEME-83'te: success:true TAMPON)
 2 Y1 nesne {foo:1}              | 200 | INVALID_INPUT                               (önce TAMPON)
 3 Y1 nesne {contains:ws}        | 200 | INVALID_INPUT
 4 Y1 dizi ["ws-a"]              | 200 | INVALID_INPUT                               (önce TAMPON)
 5 Y1 sayı 7                     | 200 | INVALID_INPUT                               (önce TAMPON)
 6 uzun 63 (dilbilgisine uyar)   | 200 | WORKSPACE_NOT_FOUND
 7 uzun 64 / 8 uzun 200k         | 200 | INVALID_INPUT
 9 başlık 500 → success (DB, ws-b) · 10 başlık 501 → INVALID_INPUT · 11 notlar 10001 → INVALID_INPUT
12 gövde ~3MB                    | 500 | server.log: "Body exceeded 1 MB limit" (Next'in sınırı; action'a hiç girmedi, satır/tampon yok)
13 ｗｓ-ｂ · 14 ws‐b (U+2010) · 15 Kelvin "Kalite" · 16 ws-b+U+0301 · 17 WS-B · 18 ws-ı · 19 "ws-b\n" · 20 " ws-b"  → INVALID_INPUT (8/8)
21 "__proto__" → INVALID_INPUT · 22 "constructor", 23 "tostring" → WORKSPACE_NOT_FOUND
24 gövde {"__proto__":{"workspaceSlug":"ws-a"}} (slug yok) → INVALID_INPUT
25 gövde {"constructor":{"prototype":{…}}}              → INVALID_INPUT
26 gövde __proto__:{isAdmin,tenantId:o83-t8} + ws-b      → success, DB satırı o83-ws-b (ek anahtar yok sayıldı)
27 "" · 28 slug yok · 29 null · 30 [] · 31 [null]         → INVALID_INPUT
32 "$undefined" · 33 "$D2026-01-01" · 34 "$n7" · 35 "$@0" · 36 "$$ws-b" (Flight kodlamaları) → INVALID_INPUT
37 başlık "" · 38 "   " · 39 NUL · 40 ANSI \x1b          → INVALID_INPUT
41 başlık yalnız vekil \ud800 → success (DB'de U+FFFD) · 42 başlık RLO U+202E → success (bkz. §5)
43 stage "G9" → INVALID_INPUT · 44 ek alan tenantId/workspaceId → success, ws-b (yok sayıldı)
45 meşru ws-b → success (DB) · 46 ws-a (üyelik dışı) → WORKSPACE_NOT_FOUND
```
Hiç canlı alanı olmayan kullanıcılar (`attack90-extra.txt`): none, t5u ve t6u için `x\0`, `{foo:1}` ve `7` → INVALID_INPUT (9/9). `default` ve `kendi` → WORKSPACE_NOT_FOUND (6/6). nomem → TENANT_SCOPE_REQUIRED.

- **DB'nin son hâli.** Yalnız meşru satırlar yazıldı: 9, 26, 41, 42, 44, 45, 47, 48, 49; hepsi `o83-ws-b`'de.
- **Sunucu günlüğü.** Bu bataryada `resilient pipeline store` ve `refused by the database` satırları **0 kez** geçiyor. Yani her ret sorgudan önce gerçekleşti.
- **Pano** (`board90.txt`). owner'ın ws-a ve kalite panoları, restr'in ws-b panosu: `opp-<zaman damgası>` biçiminde tampon kimliği **0**.

**Gerçek Chrome tıklaması** (`click90.txt`, kareler `shots/c01..c10.png`). restr, ws-b detayında "Fırsatlara Ekle"ye bastı, gövde yolda değiştirildi:
```
1 değiştirilmemiş → success, DB o83-ws-b, /tr/ws-b/firsatlar
2 NUL · 3 {foo:1} · 4 ["ws-a"] · 5 7 · 6 64 karakter · 7 ｗｓ-ｂ · 8 __proto__ · 9 ""  → INVALID_INPUT, uyarı "Fırsat eklenemedi. Lütfen tekrar deneyin.", pageerror 0
10 ws-a → WORKSPACE_NOT_FOUND, aynı uyarı
```

### 2.2 Gerçek DB kesintisinde allow-list (ONAY, bir artıkla: O-A)
Betik `ekler/outage90.sh`, çıktı `outage90.txt`. Önce `LOCK TABLE "Workspace" IN ACCESS EXCLUSIVE` ile `findScopedWorkspace` askıya alındı. İki backend kilit bekliyorken konteyner `docker kill` ile durduruldu:
```
O1 restr slug ws-a (üyelik DIŞI) (5.1 sn) -> success:true id "opp-1790779521083" workspaceId "ws-a"   ⚠ O-A
O2 restr slug ws-b (izinli)      (5.1 sn) -> success:true id "opp-1790779521084" workspaceId "ws-b"   ✔ tasarım
O3 restr slug {foo:1}            (0.1 sn) -> INVALID_INPUT   ✔ doğrulama kesintiden önce, tampona düşmedi
O4 restr slug ws-a\u0000         (0.1 sn) -> INVALID_INPUT   ✔
== DB tamamen kapalıyken
O5 ws-b / O6 {foo:1}             (0.1 sn) -> TENANT_SCOPE_REQUIRED  (oturum geri çağrısı DB'ye bağlı)
server.log: [createOpportunity] DB query bypassed, stored in resilient pipeline store: Connection terminated unexpectedly  (×2)
```
- **Allow-list gerçek sürücü mesajını tanıyor.** `Connection terminated unexpectedly`, DRIVER_MESSAGES'teki `Connection terminated` ile eşleşiyor. Doğrulama hataları kesintiden bağımsız olarak INVALID_INPUT dönüyor.
- **Tampona giden yol dar.** DB tamamen kapalıyken oturum çözülemediği için kimse tampona ulaşamıyor. Tampon yalnız "oturum okundu, sonra DB düştü" penceresinde yazılıyor.

**O-A — Kesinti alan kontrolünü yarıda keserse, üyesi olunmayan slug doğrulanmadan tampona giriyor (Orta; push'u engellemez).** O1'de restr ws-a'ya üye değil. Kontrol hiç tamamlanmadı, ama satır `workspaceId:"ws-a"` ile tampona yazıldı ve `success:true` döndü. DB geri geldikten sonra, sunucu yeniden başlatılmadan:
```
owner /tr/ws-a/firsatlar  : CSFB90-O1 CSFB90-O2, tampon-id opp-1790779521083 opp-1790779521084
restr /tr/ws-b/firsatlar  : aynı iki kart          DB'de O-satırı: 0
```
- **Kök neden.** `catch` kesintiyi doğru tanıyor, ama kesintinin **nerede** olduğuna bakmıyor. `findScopedWorkspace` bitmeden gelen kesinti de tampona düşüyor. `tests/workspace-scoped-writes.test.ts:264-269` bu davranışı bilerek sabitliyor: "a real outage (connection refused) still falls back to the buffer" testi, `tx.workspace.findFirst`'i reddettirip tamponu bekliyor.
- **Etki.** Saldırgan kesintiyi kendisi tetikleyemiyor ve pencere dar. Satır yalnız bellekte duruyor, aynı kiracıyla sınırlı. Ama İNCELEME-83 DoD'undaki "üye olunmayan alana satır/tampon yok" koşulu kesinti anında tutmuyor.
- **Öneri (küçük).** `withTenant` içinde `findScopedWorkspace` null olmayan bir sonuç döndükten sonra `workspaceProven = true` yapılsın. `catch`'te tampona yalnız `workspaceProven && isDatabaseUnavailable(err)` durumunda düşülsün, aksi hâlde `CREATE_FAILED` (ya da `DB_UNAVAILABLE`) dönsün. Test 264 buna göre ikiye ayrılsın: alan sorgusunda kesinti → ret; `opportunity.create`'te kesinti → tampon.

### 2.3 O-1 kapandı: slug normalize ve yönlendirme (ONAY, bir artıkla: O-B)
`ekler/probe90.txt` (33 zincir) ve Chrome (`click90.txt`, `shots/nav-*.png`):
```
t8u /tr/calls/topic/…                     : 307 -> /tr/no-workspace -> 200         (İNCELEME-83: 8+ hop DÖNGÜ)
t8u /tr/default/cagrilar/… · /en/default/… : 307 -> …/calls/topic/… -> 307 -> …/no-workspace -> 200   (önce: 500)
t8u /tr/%C3%A7al…%20alan%C4%B1/… · %C3%87ALI…ALANI : 404
owner /tr/%E2%84%AAalite/… (Kelvin K)      : 307 -> /tr/kalite/… -> 200   (kanonik slug'a tek yönlendirme, döngü yok)
owner /tr/KALITE/… · /tr/%4B%41LITE/…      : 307 -> /tr/kalite/… -> 200
owner kal%C4%B0te (İ) · ws-a%00 · ws-a%20 · 64×a · __proto__ : 404
owner 63×a (dilbilgisine uyar, yok)       : 307 -> /tr/calls/topic/… -> 307 -> /tr/ws-a/… -> 200
owner constructor                          : aynı, -> /tr/ws-a/… 200
owner /tr/default/… · /tr/calls/topic/…    : 307 -> /tr/ws-a/… -> 200
restr WS-B → /tr/ws-b 200 · ws-a → …/calls/topic → /tr/ws-b 200 · default → /tr/ws-b 200   (regresyon yok)
t7u default (gerçek default alanı) → 200 · del default (silinmiş) → /tr/yeni 200
none topic / default → /tr/no-workspace 200 · oturumsuz ASCII-dışı → /tr/giris 200
Chrome: t8u tr topic → /tr/no-workspace 200; t8u en default → /en/no-workspace 200; owner Kelvin → /tr/kalite/… 200
```
Tek 500, `/tr/%E0%A4%A/…` (bozuk yüzde kaçışı). crw-fb raporunun §5.1'inde bu, Next'in segment çözümlemesinden gelen ve önceden var olan bir durum olarak zaten kayıtlı. Bu değişiklikten gelmiyor.

**O-B — En eski alanın slug'ı dilbilgisi dışıysa geri düşüş tümden kapanıyor (Düşük).** t9u'nun alanları: `Eski_Alan` (en eski, dilbilgisi dışı) ve `gecerli`.
```
t9u /tr/calls/topic/…    : 307 -> /tr/no-workspace -> 200
t9u /tr/default/…        : 307 -> …/calls/topic → /tr/no-workspace 200   (Chrome'da da aynı)
t9u /tr/gecerli/…        : 200   ← geçerli alan var ve doğrudan açılıyor
```
- **Neden.** `findScopedWorkspace` en eski alanı bulup dilbilgisine uymuyorsa `null` dönüyor; bir sonraki geçerli alana geçmiyor. crw-fb raporundaki "o alan yok sayılıyor" ifadesi tam değil: alan atlanmıyor, bütün geri düşüşü kapatıyor. Kullanıcı `gecerli`'ye doğrudan URL ile ulaşabiliyor, ama çağrı kartları ve `default` onu `no-workspace`'e yolluyor.
- **Etki.** Bugün yalnız elle DB yazımıyla oluşuyor (İNCELEME-83 O-1 notu). Güvenlik açığı değil, kullanılabilirlik sorunu.
- **Öneri.** En eski birkaç alanı sıralı çekip dilbilgisine uyan ilkini seçmek. Ya da crw-fb'nin önerdiği prod sorgusuyla (`slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'`) böyle satır olmadığını doğrulayıp bunu belgelemek.

### 2.4 Y-2 — Kardeş aksiyonlar alan kısıtını ve Y-1 dersini atlıyor (kapsam dışı, önceden var; ayrı kart)
`ekler/siblings90.txt`. owner ws-a'da bir fırsat oluşturdu, ardından restr (yalnız ws-b) bu fırsat üzerinde işlem yaptı:
```
önce  : o83-ws-a | G0 | o83-owner
restr move ws-a fırsatı G4            -> {"success":true}
restr assign ws-a fırsatı sahibi→restr -> {"success":true,"ownerId":"o83-restr"}
sonra : o83-ws-a | G4 | o83-restr        ⚠ yalnız ws-b'ye yetkili kullanıcı ws-a satırını değiştirdi
restr move stage "G9"                 -> {"success":true}   (DB değişmedi; server.log "DB update bypassed")
restr move id NUL                      -> {"success":true}   (aynı)
restr assign ownerId {foo:1}           -> {"success":true,"ownerId":"$T0:0:ownerId"}  (aynı)
```
- **Neden.** `moveOpportunityStage` ve `assignOpportunityOwner` (`pipeline/actions.ts:355-470`) `updateMany`'yi yalnız `{ id, tenantId }` ile filtreliyor; `scope.workspaceIds` hesaba katılmıyor. `catch` her hatayı yutup `success:true` döndürüyor, bu da Y-1'deki kalıbın aynısı. Tampon tarafında yeni hayalet kart **oluşmuyor**, çünkü `updateInMemory*` yalnız tamponda zaten var olan satıra dokunuyor.
- **Etki.** Aynı kiracıda alan kısıtlı bir `manage_workspaces` kullanıcısı, başka alanın fırsatını taşıyabiliyor ve sahipliğini kendine alabiliyor. İNCELEME-76 Y-1 (yalnız B'ye yetkili kullanıcı A'ya yazıyordu) oluşturma için kapandı, güncelleme için hâlâ açık. Pano da kiracı geneli listeliyor (crw-fb §5.2), bu yüzden restr ws-a kartlarını görüp id'lerini alabiliyor.
- **Neden push'u engellemiyor.** Bu fix'ten gelmiyor; fix bu iki fonksiyona dokunmadı. Fix de durumu kötüleştirmiyor.
- **Öneri (ayrı kart).** İki aksiyona `where: { id, tenantId, ...workspaceIdFilter(scope.workspaceIds) }` eklensin ve `count === 0` → `NOT_FOUND` dönsün. Girdiler zod ile doğrulansın (`Gate` enum, string id). `catch` yalnız `isDatabaseUnavailable` durumunda yutsun. `addOpportunityNote` da DB'ye hiç yazmıyor, notlar yalnız tamponda duruyor; ayrı bir ürün sorusu.

### 2.5 Mutantlar (kendi 18'im; `ekler/mut90.py`, `mut90.txt`)
Her mutant, fix'in üç test dosyasına karşı koşuldu (temel: 63/63 geçti).
```
K1  findScoped: slug!==null → truthy ("" = en eski)       | HAYATTA  (gizli: bugünkü çağıranlar "" geçiremiyor)
K2  başlık boşluk kontrolü yok                           | ÖLDÜ 1
K3  text(): NUL serbest                                   | ÖLDÜ 2
K4  zod slug dilbilgisi yok                               | ÖLDÜ 5
K5  PrismaClientInitializationError sınıfı yok            | ÖLDÜ 1
K6  sürücü mesajı geniş /connection|timeout/i             | HAYATTA  ⚠ en anlamlı boşluk
K7  PG kodu çapasız                                       | HAYATTA
K8  AggregateError.errors gezinmesi yok                   | HAYATTA  (ölçülen tx-refused şeklinde code üstte; yol ölü değil ama testsiz)
K9  ECONNRESET listeden çıktı                             | ÖLDÜ 1
K10 normalize NFC yok                                     | HAYATTA  (EŞDEĞER: ASCII'ye inen tek tekil ayrışım U+212A, toLowerCase onu da 'k' yapıyor)
K11 sayfa normalize sonucunu kullanmıyor                  | ÖLDÜ 1
K12 stage enum → serbest                                  | ÖLDÜ 1
K13 text(): ESC (\x1b) serbest                            | HAYATTA  (canlıda ret doğru, §2.1 #40; testsiz)
K14 başlık üst sınırı 500 → 5000                          | HAYATTA  (canlıda doğru, #10; testsiz)
K15 notlar üst sınırı yok                                 | ÖLDÜ 1
K16 kesinti dalı: her hata tampona                        | ÖLDÜ 1
K17 isWorkspaceSlug typeof kontrolü yok                   | HAYATTA  (gizli: çağıranlar string geçiriyor)
K18 isDatabaseUnavailable derinlik sınırı yok             | HAYATTA  (döngüsel cause → yığın taşması; bugün üretilemiyor)
```
- **Neden K6 önemli.** Allow-list'in güvenliği, mesaj eşleşmesinin dar olmasına dayanıyor. Mesajında "connection" geçen bir **ret** (ör. Prisma doğrulama mesajı değeri yansıtır) bugün testte kesinti sayılmıyor, ama bunu koruyan bir test yok. Canlı yoldan tetikleyemedim: `Opportunity`'nin tüm alanları `text`, FK yok. DB'nin reddettiği ve kullanıcı girdisini mesajına yansıtan bir hata yolu bulamadım (§2.1 #48'de `intendedRole: "Connection terminated due to connection timeout"` DB'ye düz yazıldı).
- **Öneri.** `db-unavailable.test.ts`'e iki test eklensin: (a) mesajı "connection" içeren bir `PrismaClientValidationError` → `false`; (b) döngüsel `cause` → `false`, fırlatmadan.

## 3. Değişen dosyalar
Kaynak kod değişmedi. Eklenenler yalnız bunlar:
- `docs/agent-results/TASK-MUO7JO3J4W3ZS-cs-fb.md`
- `docs/agent-results/TASK-MUO7JO3J4W3ZS-cs-fb-ekler/`:
  - `attack90.py/.txt`, `attack90-extra.txt`, `siblings90.txt`, `board90.txt`
  - `outage90.sh/.txt`, `probe90.py/.txt`, `click90.mjs/.txt`, `shots/` (14 kare)
  - `mut90.py/.txt`, `gates.txt`, `dbprep.txt`, `fixtures90.sql`, `mint90.mts`, `server-log-ozet.txt`

**Kapılar** (dev `c214f02d`, izole DB; `ekler/gates.txt`):
```
tsc --noEmit EXIT 0 · eslint EXIT 0 · i18n:check EXIT 0 ("both catalogs agree") · next build EXIT 0
npx vitest run EXIT 0: Test Files 290 passed | 6 skipped (296) · Tests 3606 passed | 91 skipped (3697) · 0 failed
```
Atlanan testler ortam kapısına bağlı. Bu koşuda RLS canlı testleri izole DB'de `fabrika_app` ile koştu.

## 4. Riskler
- **O-A.** Kesinti penceresinde doğrulanmamış alan tampona yazılıyor. Dar bir pencere, kalıcı değil (§2.2).
- **Y-2.** Alan-kısıtlı kullanıcı, başka alanın fırsatının aşamasını ve sahibini değiştirebiliyor. Önceden var, bu fix'le ilgisiz (§2.4).
- **Tampon kurtarma yok.** Kesintide `success:true` alan satır, DB geri geldiğinde de DB'ye yazılmıyor (O1/O2: DB'de 0 satır). Sunucu yeniden başlayınca kaybolacak. Önceden var; crw-fb §5.3'teki "tampon sınırı yok" notunun kardeşi.
- **Ortam notu.** Worktree'de `prisma generate` koşarken çıktı, symlink üzerinden ana repodaki `node_modules/.prisma`'ya yazıldı. Şema ana dev ile birebir aynı (`c214f02d`), yani içerik değişmedi. Build için sonra node_modules APFS klonuna geçildi.

## 5. Açık sorular
1. **O-A:** Kesinti anında alan kanıtlanmadan tampon mu, açık ret mi? Önerim açık ret (`workspaceProven` bayrağı). Lider ya da crw-fb kararı.
2. **Y-2:** `moveOpportunityStage` ve `assignOpportunityOwner` için alan kapsamı + zod + allow-list kartı açılsın mı? Önerim evet; İNCELEME-76 Y-1'in güncelleme karşılığı.
3. **Düşük (önceden var):**
   - `ownerId` kiracı üyeleriyle eşleştirilmiyor. Başka kiracının kullanıcı id'si (`o83-t8u`) DB'ye yazıldı (§2.1 #47).
   - `intendedRole` serbest metin; yorum `coordinator | partner` diyor (#48).
   - Başlıkta RLO (U+202E) ve yalnız vekil kabul ediliyor (#41, #42). Görüntü sahteciliği riski düşük.
   Hiçbiri push'u engellemiyor.

## 6. Sonraki adım
- **Push:** bu inceleme açısından engel yok. Karar liderde.
- **Önerilen kartlar:**
  1. O-A: `workspaceProven` + test 264'ün ikiye ayrılması;
  2. Y-2: kardeş aksiyonlarda alan kapsamı + zod + allow-list;
  3. O-B ve mutant boşlukları: K6 ve K18 testleri, en eski geçerli alana geri düşüş.
- **Temizlik yapıldı:** kendi sunucum (:3590) kapatıldı. `csfb90-pg` konteyneri ve `wt90` worktree'si rapor commit'inden sonra kaldırılacak.
