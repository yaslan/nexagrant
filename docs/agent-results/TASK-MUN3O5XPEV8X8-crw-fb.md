# TASK-MUN3O5XPEV8X8 — crw-fb: İNCELEME-35, TASK-MUN2KUHP1BP18 (be-fb)

**Konu:** İNCELEME-27'deki (`TASK-MUN26P5IDKGST-crw-fb.md`) B-1, B-2 ve Ö-1..Ö-3 bulgularının düzeltilmesi.
**İncelenen commit'ler:** `a2c2a9b3`, `a2c89b99`, `f09e910a`, `4f391ae8`, rapor `db762138`. Hepsi dev HEAD `81d171c4` içinde.
**Ortam:**
- Ayrık worktree: scratchpad `wt35`, HEAD `81d171c4`. İncelemenin sonunda `git status` temizdi.
- İzole DB: kendi `pgvector/pgvector:pg16` konteynerim `crwfb-mun35`, adresi `:55481/fbcrw35`.
- Paylaşılan `fabrika` (:5433) DB'sine yalnız `SELECT count(*)` attım.
- Kanıt betiklerim, URL `:55481/fbcrw35` değilse `throw` ediyor.
- Önceki oturum rapor yazılmadan kesilmişti. Bu rapor iskelet olarak erken yazıldı ve inceleme ilerledikçe güncellendi.

## KARAR: ONAY (TASK-MUN2KUHP1BP18)

- **B-1 kapandı.** İçerik kaybını kanıtladığım iki yol da (m11 ve m2) artık reddediyor. 8 farklı "kötü id" biçiminin hiçbiri satır değiştirmiyor. Guard kaldırıldığında kayıp geri geliyor, yani test gerçekten guard'ı ölçüyor.
- **B-2 kapandı.** İNCELEME-27'de satır içi yazılan biçimlerin (`AND: [{ id: x }]`, `notIn: presentIds(...)`) hepsi artık yakalanıyor.
- **Ö-3 kapandı.** Çağıranları okudum; guard'lar doğru yerde duruyor.
- **Ö-2 kapandı.** be-fb'nin kanıtı yeterli, yeniden koşmadım (§6).
- **Tam süit:** izole DB'de 2640 test geçti, 0 kırmızı. Kiracı sayısı iki DB'de de 1'den 1'e, değişmedi.
- **tsc:** exit 0.
- **Bloke eden bulgu yok.** Aşağıdaki Ö-1..Ö-3, bekçinin bugün repoda sömürülmeyen kaçışları ve bir rapor düzeltmesi.
- **Ayrıca:** Karttaki EK kontrol gerçek bir hata buldu (K-1: consortium `findCandidates`). Bu hata bu kartın kapsamında değil ve TASK-MUN3W76B4XEJE'de zaten düzeltiliyor.

## KARAR: ONAY (TASK-MUMSUA77J1C6Q)

- İNCELEME-27'de bu kartın bütün iddiaları doğrulanmıştı. Kök neden, 3 guard, bekçi, mutantlar ve seed'in hepsi tutuyordu.
- Kartı "DÜZELTME GEREKLİ"de tutan tek şey B-1 ve B-2 idi. İkisi de TASK-MUN2KUHP1BP18 ile kapandı ve yukarıda doğrulandı.
- Bu yüzden TASK-MUMSUA77J1C6Q de **ONAY**.

---

## 1) tsc (dev HEAD)

```
wt35 HEAD 81d171c4
npx tsc --noEmit  4.13s user … 2.958 total
tsc_exit=0
```

## 2) B-1 yolları, izole DB'de canlı

### 2.1 be-fb'nin canlı testi, benim DB'mde
- Test dosyası: `tests/action-missing-id.live.test.ts`. Test `fabrika_app` rolüyle çalışıyor (NOBYPASSRLS).
- 31 action'ın her biri `undefined`, `null` ve `""` ile çağrıldı. Ayrıca saved-search için 400 kontrolü, `evaluateGate` ve gerçek id ile yapılan 1-satır kontrolü koşuldu.

```
tests/action-missing-id.live.test.ts  34 passed (34)
(+ required-id, where-guard-src, teardown-where-guard: 4 dosya, 55/55)
```

### 2.2 Kendi bağımsız testim (`crw35-b1.test.ts`)
- **Mock'lananlar:** yalnız `requireTenantAction` ve `revalidatePath`. `withTenant` ve Prisma gerçek.
- **Veri:** İNCELEME-27'de içerik kaybını ürettiğim veri yeniden kuruldu: 3 ApplicationPart ve 3 ConceptNote.
- **Denenen id biçimleri:** `undefined`, `null`, `""`, `"   "`, `0`, `{}`, `["crw-p-1"]` ve `{not:"x"}`. Nesne ve dizi biçimleri önemli: Flight kodlaması düz nesneyi de taşıyabiliyor.

```
["m11","undefined",{"success":false},{"success":false},"unchanged",true]   ← acquireSectionLock + updateSectionContent
["m2","undefined",{"success":false},"unchanged",true]
… "", "   ", 0, {}, ["crw-p-1"], {"not":"x"} → hepsi {"success":false}, "unchanged", true
["m2 real id",{"success":true},["{\"marker\":\"note-1\"}","{\"overwritten\":true}","{\"marker\":\"note-3\"}"]]  ← yalnız hedef satır
["m10 sign undefined",{"success":false,"signedAt":null}]
Tests 18 passed (18)
```

**Mutant:** m2'deki `if (!isPresentId(noteId)) return …` satırı silindi.
```
Tests 1 failed
["m2","undefined",{"success":true},"unchanged",false]   ← tüm notlar yine eziliyor
```
Mutantı `git checkout` ile geri aldım; ardından `git status` yalnız benim takip edilmeyen test dosyalarımı gösterdi.

**Neden `{}` önemli:** `isPresentId` yalnız `typeof === 'string'` olan değeri kabul ediyor, bu yüzden nesne biçimli id'yi de reddediyor. Aşağıdaki §3.2, Prisma'nın `id: {}` filtresini tüm satırlar olarak okuduğunu gösteriyor. Yani guard'ın dize kontrolü yapması şart; yalnız doğruluk (truthiness) kontrolü yetmezdi.

## 3) Statik bekçi: yeni kaçış biçimleri

### 3.1 Fixture sonuçları (`unguardedWheres` doğrudan çağrıldı)

| # | Biçim | Bekçi | Çalışma anındaki etki |
|---|---|---|---|
| kontrol | parametre `{ id }` | CAUGHT | — |
| E1 | `const conds = [{ id }]; where: { AND: conds }` | **MISSED** | `AND:[{}]` → tümü |
| E2 | `const keep: string[] = []; id: { notIn: keep }` | **MISSED** | `notIn:[]` → tümü |
| E3 | `const keep = [...ids]; id: { notIn: keep }` | **MISSED** | boş olabilir → tümü |
| E4 | `if (!id) return;` + `{ id }`, istemci `{}` gönderirse | **MISSED** | `id:{}` → tümü |
| E5 | guard'dan sonra `input.id = other` | MISSED | tümü (yapay bir örnek) |
| E6 | `$queryRawUnsafe('DELETE FROM "Tenant" RETURNING id')` | MISSED | filtresiz |
| E7 | `$executeRaw(Prisma.sql\`DELETE FROM "Tenant"\`)` | MISSED | filtresiz |
| E16 | `NOT: { id: { in: presentIds([x]) } }` | **MISSED** | `NOT:{in:[]}` → tümü |
| E17 | `NOT: [{ id: { in: presentIds([x]) } }]` | **MISSED** | aynı |
| E19 | dıştaki `id` guard'lı, `ids.map((id) => deleteMany({ where: { id } }))` | **MISSED** | içteki `id` guard'sız |
| E20 | `withTenant(tenantId, tx => { const tenantId = input.t; … })` | MISSED | gölgeleyen değer kontrol edilmiyor |
| E8, E9, E10, E11, E13, E14, E18, E21 | OR'da çok bildirimli değişken, `&&` guard, `none`, `in: list`, geri çağrı içindeki guard, try içindeki guard, `not: x`, callback parametresi | CAUGHT | — |
| E12 | `withTenant(t)` argümanının kendisi | (güvenli) | `assertTenantScope` fırlatıyor |

**Kök nedenler:**
- **E1-E3:** `identifierIsSafe` fonksiyonu const başlatıcıyı `valueIsSafe(init, next, null)` ile denetliyor. Anahtar bilgisi (`AND`/`notIn`) bu çağrıda kayboluyor. `arrayIsSafe` fonksiyonu `key === null` gördüğünde "`in` gibi" varsayıp `true` dönüyor.
- **E16/E17:** `presentIds` yalnız `key === 'in'` ise güvenli sayılıyor. `NOT` altındaki `in: []` ise "hiçbir şey değil"den "her şey"e dönüyor.
- **E4:** `guardedByStatement` fonksiyonu çıplak `!x` koşulunu da guard sayıyor (satır 189).
- **E19:** `guardedByStatement` yalnız metin eşleşmesi yapıyor, gölgelemeyi dikkate almıyor. Aynı fonksiyonda `isParameterAt` kontrolünden önce çalışıyor.

### 3.2 Prisma semantiği (izole DB, yalnız `count`, yazma yok)

```
total {} -> 5
{ id: "nope" } -> 0
{ id: {} }  (client sends {} as id) -> 5
{ id: { not: "nope" } } -> 5
{ NOT: { id: { in: [] } } }  (presentIds([undefined]) under NOT) -> 5
{ NOT: [{ id: { in: [] } }] } -> 5
{ AND: [{}] } -> 5
{ id: { notIn: [] } } -> 5
```

### 3.3 Bugün repoda sömürülüyor mu? Hayır
- **E4 için:** bekçinin bir kopyasında çıplak `!x` kabulünü kapattım (`if (false && …)`) ve src'yi taradım. Asıl bekçiye göre **0 yeni bulgu** çıktı. src'de çıplak `!x` guard'ına dayanan bir `updateMany`/`deleteMany` yok. Hepsi `isPresentId` ya da `requireActionId` kullanıyor.
- **E19/E20 için:** bekçinin bir kopyasına gölgeleme kontrolü ekledim. `guardedByStatement`, adı parametre ya da yerel bildirim olarak bağlayan bir fonksiyon veya blok sınırını geçemiyor. Bu kopyayla src ve tests altındaki 788 dosyayı taradım: **0 yeni bulgu**.
- **E1-E3 ve E16 için:** `/usr/bin/grep` ile `notIn:|AND:|NOT:|OR:` + değişken araması yaptım. Tek eşleşme `consortium.ts:118 notIn: existingOrgIds`. O da bir `findMany` ve uzunluk koşullu. `seat-limit.ts:58 NOT: { email }` de bir `count` ve `email` oturumdan geliyor.

## 4) M21 "eşdeğer mutant" iddiası: kısmen doğru

Mutantı kendim koştum: `evaluateOpportunityGate`'in giriş guard'ını kaldırdım, `runGate` guard'ı yerinde kaldı. Action'ın dönüşünü kaydettim.

```
== guard present
["undefined",{"success":false,"error":"OPPORTUNITY_NOT_FOUND"}]
["null",{"success":false,"error":"OPPORTUNITY_NOT_FOUND"}]
["",{"success":false,"error":"OPPORTUNITY_NOT_FOUND"}]
== M21 entry guard removed
["undefined",{"success":false,"error":"GATE_EVALUATION_FAILED"}]
["null",{"success":false,"error":"GATE_EVALUATION_FAILED"}]
["",{"success":false,"error":"OPPORTUNITY_NOT_FOUND"}]
Tests 2 passed   ← test yine yeşil
```

- **DB açısından eşdeğer:** anlık görüntü aynı, `GateDecision` yazılmıyor.
- **Gözlemlenebilir davranış açısından eşdeğer değil:**
  - Yanıt `OPPORTUNITY_NOT_FOUND`'dan `GATE_EVALUATION_FAILED`'a dönüyor; araya bir `console.warn` da giriyor.
  - Arada `findFirst({ id: undefined, tenantId })` kiracının ilk fırsatını "sahiplenilmiş" diye buluyor. Savunma tek başına `runGate`'e kalıyor.
- Test yalnız `success === false` diye baktığı için mutant yaşıyor. Rapordaki "eşdeğer" ifadesi bu yüzden fazla güçlü. Bkz. Ö-3.

## 5) Ö-3 çağıranları

**`src/lib/gates/evaluate.ts` (`runGate`, updateMany :216):**
- Tek dış çağıran `pipeline/actions.ts:462` (`evaluateOpportunityGate`).
- `opportunityId` istemciden geliyor ve action girişinde `isPresentId` ile kontrol ediliyor (:449).
- `runGate` guard'ı ikinci katman.

**`src/lib/agency/codes.ts` (`revokeInviteCodeIn`, updateMany :193):**
- İki çağıran var: `app/[locale]/(app)/ajans/actions.ts:85` (`revokeInviteCode`) ve `lib/agency/actions.ts:43` (`revokeAgencyInviteCodeAction`).
- İkisi de istemci `id`'sini doğrudan geçiriyor. Guard fonksiyonun kendisinde, ilk DB yazmasından önce: `assertAgency` yalnız okuma yapıyor.
- `required-id.test.ts`, 4 kötü id biçiminde `updateMany`'nin hiç çağrılmadığını doğruluyor (M19 öldü).

## 6) Tam süit, yalnız izole DB

```
DATABASE_URL=postgresql://fabrika:***@localhost:55481/fbcrw35
DATABASE_URL_MIGRATE=postgresql://fabrika:***@localhost:55481/fbcrw35
DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@localhost:55481/fbcrw35
isolated before: 1 fabrika-beta
shared before: 1 fabrika-beta
 Test Files  224 passed | 2 skipped (226)
      Tests  2640 passed | 8 skipped (2648)
vitest exit=0
isolated after: 1 fabrika-beta
shared after: 1 fabrika-beta
atlanan 8: adapters 2, k1-daily-calls 4, sedia-adapter 2 (RUN_LIVE_ADAPTER_TESTS)
```

- Sayılar be-fb'nin koşusuyla birebir aynı.
- Agency ve oauth canlı testleri (56 test) koşuyor ve geçiyor.
- Worktree `.env`'inde `5433` sayısı 0.
- Süiti koşmadan önce kendi `crw35-*` dosyalarımı ağaçtan çıkardım.

**Ö-2 (seed):** be-fb'nin §2.5 kanıtını yeterli buldum ve yeniden koşmadım. Diff'te `update` kolu `changedAt: new Date(), changedBy: null` yazıyor.

---

## Bulgular

### Bloke eden
Yok.

### Öneri (bu kartı bloke etmez; bugün repoda sömürülmüyor, §3.3)
- **Ö-1: Bekçi, const değişken üzerinden gelen dizide anahtarı unutuyor (E1-E3) ve `NOT` altındaki `presentIds`'i güvenli sayıyor (E16/E17).**
  - Bu B-2'nin dolaylı hâli: satır içi yazılan biçim kırmızı veriyor, aynı ifade bir `const`'a alınınca yeşil kalıyor.
  - **Senaryo:** `const keep = presentIds(kept); … deleteMany({ where: { id: { notIn: keep } } })` ya da `const keep: string[] = []` → tablo boşalıyor, bekçi yeşil.
  - **Düzeltme:**
    - `identifierIsSafe` fonksiyonu, `valueIsSafe`'e çağıranın `key`'ini aktarmalı.
    - `arrayIsSafe`, `key === null` durumunda `true` dönmek yerine muhafazakâr davranmalı.
    - `presentIds` ve spread/değişken içeren bir `in`, `NOT` altındayken güvenli sayılmamalı. Pratik yol: `objectIsSafe` fonksiyonuna "tersine çevrilmiş bağlam" bayrağı eklemek.
    - `teardown-where-guard.test.ts`'e E1, E2, E16 ve E17 eklenmeli.
- **Ö-2: `guardedByStatement` gölgelemeyi ve çıplak `!x` koşulunu hesaba katmıyor (E19, E4, E20).**
  - **E19:** dıştaki `id` guard'lıyken `ids.map((id) => …deleteMany({ where: { id } }))`. İçteki `id` bir parametre, ama önce guard kontrolü çalıştığı için `isParameterAt`'e hiç sıra gelmiyor. Gerçekçi bir biçim.
  - **Düzeltme:** Yukarı yürürken adı parametre ya da yerel bildirim olarak bağlayan bir sınırda durmak. Bunu kopyada denedim: repoda 0 yeni bulgu, E19 yakalanıyor.
  - **E4:** Çıplak `if (!x)` koşulu, `x = {}` olduğunda (§3.2 → tüm satırlar) geçer. Kaldırılırsa src'de kırılan bir şey yok (§3.3). Test tarafındaki `continue` kullanımı (cs-fb döngüsü) için yalnız `tests/` altında kabul edilebilir.
  - **E20:** `isTenantWrapperArg`'da aynı gölgeleme sorunu var. Düşük öncelikli.
- **Ö-3: Rapor düzeltmeleri.**
  - M21 "eşdeğer" değil; "DB-eşdeğer, yanıt kodu farklı" (§4). `evaluateOpportunityGate` satırında `refused` yerine `error: 'OPPORTUNITY_NOT_FOUND'` beklenirse mutant ölür.
  - Rapor `KNOWN` için "17 anahtar" diyor. `tests/where-guard-src.test.ts`'te 19 anahtar var.
  - E6/E7 (`$queryRawUnsafe` ile DELETE, `$executeRaw(Prisma.sql…)`) raporun "bilerek bırakılanlar" listesine eklenmeli.

### Kayıt
- **K-1: consortium `findCandidates`, `readOnly: true` ile SeatCandidate siliyor ve yazıyor.** Karttaki EK kontrol; se-fb'nin gözlemi doğrulandı.
  - **id guard açısından temiz:** `isPresentId(seatId)` guard'ı ilk sorgudan önce duruyor, `runScoring` de ikinci bir guard taşıyor. `action-missing-id.live` testinde de bu yol var.
  - **Asıl sorun pilot kapısı.** `readOnly` bayrağı yalnız pilot kontrolünü atlatıyor, ama `runScoring` `seatCandidate.deleteMany` + `create` yapıyor. Bu, İNCELEME-30 B-1'de m8 için düzeltilen hatanın konsorsiyum ikizi.
  - **Canlı kanıt** (`crw35-pilot.test.ts`): gerçek `requireTenantAction` kullanıldı; oturum ve süresi dolmuş pilot mock'landı, DB gerçek.
    ```
    ["seat","demo-seat-opp1-research","before",["crw-org-1#1","crw-org-2#2"]]
    ["m8 computeSeatCandidates (not readOnly)",{"threw":"PilotExpiredError","digest":"PILOT_EXPIRED"},"after",["crw-org-1#1","crw-org-2#2"]]
    ["consortium assignSeat (not readOnly)",{"threw":"PilotExpiredError","digest":"PILOT_EXPIRED"}]
    ["consortium findCandidates (readOnly:true)",{"ok":[]},"after",[]]     ← süresi dolmuş pilotta 2 aday silindi
    ```
  - **Bu kartın kapsamında değil:** `readOnly` bayrağı `a6b22241`'den (pilot özelliği) geliyor, be-fb'nin commit'lerinden değil.
  - **Zaten ele alınıyor:** İnceleme sırasında düzeltme `362ee353` olarak commit'lendi (`fix(consortium): an expired pilot can no longer rewrite seat candidates …`, TASK-MUN3W76B4XEJE). `readOnly` kaldırılmış; ben incelemedim. Yeni kart açmadım. O kartın incelemesinde bu testin (süresi dolmuş pilotta satırlar aynı) canlı olarak geçtiği görülmeli.

## Değişen dosyalar
- Yalnız bu rapor. Kod değiştirilmedi.
- Mutantlar ve geçici test dosyaları worktree'de kaldı ve geri alındı.
- Kanıt dosyaları scratchpad'de (`ev/`): `b1-proof.txt`, `escapes.txt`, `escapes2.txt`, `prisma-where.txt`, `m21.txt`, `pilot.txt`, `full.txt`, `full.json`, `bare-guards.txt`, `shadow-diff.txt` ve `crw35-*.test.ts`.

## Riskler / sınırlar
- **Canlı kanıtın kapsamı:** 31 yolun hepsini be-fb'nin canlı testiyle koştum. Kendi bağımsız testim yalnız m11, m2 ve m10'u (sign) 8 biçimle kapsıyor.
- **Flight POST denenmedi:** Gerçek bir Flight `$undefined` / `{}` POST'unu çalışan bir sunucuya karşı denemedim. Ret action gövdesinde olduğu için taşıma yolundan bağımsız.
- **Gölgeleme yaması yalnız deneme amaçlı:** Ö-2 için kopyada denediğim yama yalnız ölçüm içindi, önerilen kesin düzeltme değil. Bloklar arası sıralama kontrolü kaba.

## Temizlik
- `crwfb-mun35` konteyneri (`--rm`) durduruldu ve `:55481` kapandı. `wt35`, `git worktree remove` ile silindi. Ayrıntı ve doğrulama bu raporun sonunda.
- `:3000` ve `.next`'e dokunulmadı.
- Başkalarının worktree'lerine (`FONBRIDGE-wt-fefb-mun3o` vb.) ve konteynerlerine (`befb-mun39`) dokunulmadı.

## Platform
- **Doğrulandığı yer:** mac (Darwin 27, Docker `pgvector/pgvector:pg16`, Node 26.5, vitest 4.1.11).
- **İncelenen kod platforma bağlı değil:** dize kontrolü (`isPresentId`), Prisma `where` semantiği, TS AST taraması, seed upsert. Bekçi raporladığı yolları `split(path.sep).join('/')` ile üretiyor, bu yüzden Windows'taki `\` ayracı `KNOWN` eşleşmesini bozmaz.
- **Windows ve Linux:** koşulamadı, çünkü bu makinede yalnız mac var. Koddan bakınca aynı sonuç beklenir.
