# TASK-MUO9IN3HL4K5K — FB İNCELEME-93: m8 hata sızıntısı düzeltmesinin saldırgan incelemesi (devop-fb)

**Durum: TAMAM**

**Karar: ONAY.** Düzeltme (TASK-MUNZ7N9IT8VPY, crw-fb; kod 83e79ed7, dev merge b751595f) canlıda tuttu. Unique, FK, bağlantı kopması, P0001, NUL bayt ve kurcalanmış form alanlarının hiçbirinde istemciye iç metin, tablo/alan adı ya da kiracı id'si gitmedi. `KNOWN_ACTION_LEAKS = {}` bekçiyi gerçekten sıkılaştırdı: eski `{m8:1}` girdisiyle yaşayan bir mutant artık ölüyor. Engelleyici (B) bulgu yok. Bir düşük (D) bulgu var: bekçi, kalıp tarayan bir sezgisel olarak kaldığı için 6 biçimi kaçırıyor. m8'de bu biçimleri sıkı birim testleri yakalıyor. Bugün ağaçta bu biçimlerin gerçek bir örneği yok. Takip kartı öneriyorum (§4).

İnceleme ağacı: dev `2a3900b8` (b751595f'yi içeriyor, `git merge-base --is-ancestor` ile doğrulandı). Scratchpad'de iki ayrı worktree kullandım: `wt93` kapılar ve canlı test için, `wt93m` mutantlar için. İzole Postgres benim konteynerimde: `devopfb93-pg`, 127.0.0.1:5493, pgvector pg16. Paylaşılan `fabrika-postgres` (:5433) yalnız bir kez `pg_dump`/`pg_dumpall --roles-only` ile **okundu**, oraya hiçbir şey yazılmadı. Worktree `.env` içinde `grep -c 5433` → 0. **Kod değiştirilmedi**, yalnız bu rapor ve ekleri commit'lendi.

## 1. Ne yapıldı

1. **Kod okuma.** Okunanlar: 83e79ed7 diff'i, `src/modules/m8/server/{actions,errors,matching}.ts`, `find-candidates-button.tsx`, `useActionErrorText`, `tests/api/api-error-body-guard.test.ts` ve `response-status-scan.ts` (`catchReturnLeaks`).
2. **Canlı saldırı (HTTP, prod standalone).** `next build` çıktısı `.next/standalone/server.js` 127.0.0.1:47993'te `NODE_ENV=production DEMO_LOGIN_ENABLED=false` ile koştu. Oturum alice (PIPELINE_MANAGER, demo-tenant) için Auth.js'in kendi `jwt` callback'i ve `encode` ile basıldı. Çerez dosyaya yazıldı, ekrana basılmadı. Eylem, tarayıcının gönderdiği POST'un aynısıyla çağrıldı: `Next-Action: 60c06242…` (server-reference-manifest'ten `computeSeatCandidatesForm`) ve React `encodeReply` çok parçalı gövdesi. Gövde biçimi `next/dist/compiled/react-server-dom-webpack/client.edge` `encodeReply` çıktısıyla birebir doğrulandı. Hata enjeksiyonu `SeatCandidate` üzerinde `BEFORE DELETE FOR EACH STATEMENT` trigger'ı ile yapıldı; trigger yalnız devopfb93-pg'de kuruldu ve her senaryodan sonra silindi.
3. **Komşu yol.** m8'in throw eden eylemi (`inviteCandidateToSeat`) prod'da çağrıldı ve gövdede hata metni olup olmadığına bakıldı.
4. **Kalan örnek taraması.** `errorMessage(`, `.message`, `String(err)` kalıpları `src/` altında ve `'use server'` dosyalarında bekçinin kaçırdığı biçimler için ayrıca grep'lendi.
5. **Kendi mutantlarım.** 8 mutant yazıldı, her biri bekçiye ve m8 testlerine **ayrı ayrı** koşuldu.
6. **Tam kapılar.** tsc, eslint, i18n, next build, `npx vitest run`.

## 2. Kanıt
Ekler: `docs/agent-results/TASK-MUO9IN3HL4K5K-devop-fb-ekler/`

### 2.1 Canlı: `live93.mjs.txt` → `live93-out.txt` (16/16 GEÇTİ, exit 0)
Sızıntı deseni tüm yanıt gövdesine uygulandı. Desen `devopfb93|internal-detail|SeatCandidate|ConsortiumSeat|invocation|prisma|P0001|P20\d\d|P10\d\d|23505|23503|constraint|tablo=|kolon=|not found|terminat|connection|Key \(|fabrika|` ile DB'deki **13 kiracı id'sinin tamamı**ndan oluşuyor.
```
[sağlam] HTTP 200 | durum={"status":"ok","count":0}
[tr P0001 iç metin] HTTP 200 | durum={"status":"error","code":"computeFailed"} | gövde 110 bayt | sızıntı-eşleşme=0
[en P0001 iç metin] HTTP 200 | durum={"status":"error","code":"computeFailed"} | gövde 110 bayt | sızıntı-eşleşme=0
[unique 23505] HTTP 200 | durum={"status":"error","code":"computeFailed"} | gövde 110 bayt | sızıntı-eşleşme=0
[FK 23503] HTTP 200 | durum={"status":"error","code":"computeFailed"} | gövde 110 bayt | sızıntı-eşleşme=0
[bağlantı kopması] HTTP 200 | durum={"status":"error","code":"computeFailed"} | gövde 110 bayt | sızıntı-eşleşme=0
[kopma sonrası sağlam] HTTP 200 | durum={"status":"ok","count":0}
[yok olan koltuk] … seatNotFound | sızıntı-eşleşme=0
[BAŞKA kiracının koltuğu] … seatNotFound | sızıntı-eşleşme=0
[SQL-benzeri id] … seatNotFound | sızıntı-eşleşme=0
[5000 karakter id] … seatNotFound | sızıntı-eşleşme=0
[boş seatId] / [seatId alanı yok] / [başka fırsatın koltuğu] … seatNotFound | sızıntı-eşleşme=0
   yok-olan vs başka-kiracı gövdesi aynı mı: true
[NUL baytlı id] HTTP 200 | durum={"status":"error","code":"computeFailed"} | sızıntı-eşleşme=0
toplam: 16/16
```
- **Enjeksiyonların gerçekten tetiklendiğini** sunucu log'u gösteriyor (`server-log-excerpt.txt`). 6 kez `[m8] computeSeatCandidatesForm failed` yazıldı, gelen kodlar: `P0001` ×2 (mesajda `tablo=SeatCandidate kolon=seatId tenant=demo-tenant`), `P2002` (kısıt adıyla), `P2003`, `57P01` (backend sonlandırıldı), `22021` (NUL bayt). Ayrıntı log'da kalıyor, istemciye gitmiyor.
- **Kiracılar arası kahin yok.** Başka kiracıda gerçekten var olan bir koltuk id'si ile hiç var olmayan bir id, bayt bayt aynı gövdeyi döndü (`seatNotFound`). Yanıt, bir id'nin başka bir kiracıda var olup olmadığını ele vermiyor. Girdi yanıta yansımıyor: SQL-benzeri id, 5000 karakterlik id ve bilinmeyen id'nin hiçbiri gövdede görünmedi.
- **Bağlantı kopması** (`pg_terminate_backend`) sonrasında havuz toparlandı. Bir sonraki istek `ok` döndü.
- **İlk iki koşu geçersizdi, bu yüzden sayılmadı.** İkisinde de sağlam yol `seatNotFound` döndü. Neden: Next eylem gövdesini akışla çözüyor; kök alan `0` form alanlarından önce gönderilince FormData boş çözülüyor. Ayrıca önek `1_` değil `_1_` olmalıydı. Gövdeyi `encodeReply` çıktısına göre düzelttikten sonra sağlam yol `ok` döndü. Sonraki senaryolar da `computeFailed` döndü, yani eylemin gövdesine gerçekten ulaşıldı.

### 2.2 Komşu yol: throw eden m8 eylemi (`throw93-out.txt`)
```
inviteCandidateToSeat('devopfb93-nope-seat', …) → HTTP 500, gövde yalnız "digest":"782884172"
sızıntı (/devopfb93-nope-seat|not found in this workspace|cannot be offered|Seat devopfb93/): 0
```
Sunucu log'unda "cannot be offered" 3 kez geçiyor. Prod Next, throw edilen eylem hatasını digest'e çeviriyor. crw-fb'nin "diğer m8 eylemleri throw ediyor, metin istemciye gitmiyor" tespiti canlıda doğrulandı.

### 2.3 Mutantlar: `mutants93.py.txt` → `mutants93-out.txt`
Her mutant iki ayrı koşuda denendi: yalnız bekçi (`tests/api/api-error-body-guard.test.ts`) ve m8 testleri (`tests/m8-seat-candidates-form-errors.test.ts`, `src/modules/m8`, `tests/pilot-expired-write-paths.test.tsx`). Her mutanttan sonra `git checkout` yapıldı; son `git diff --stat` temiz.

| # | Mutant | Bekçi | m8 birim |
|---|---|---|---|
| X1 | `message: String(e)` ek alanı (kontrol) | **KIRMIZI** | KIRMIZI |
| X8 | X1 + eski `KNOWN_ACTION_LEAKS = {m8:1}` geri | **yeşil** | KIRMIZI |
| X2 | `catch ({ message })` yapıbozumu | yeşil | KIRMIZI |
| X3 | `const out = {…}; out.detail = String(e); return out` | yeşil | KIRMIZI |
| X4 | dışarıda `let why`; catch'te `why = String(e)` | yeşil | KIRMIZI |
| X5 | `await x().catch((err) => err)` + `created.message` | yeşil | KIRMIZI |
| X6 | yerel `function errorCode(x) { return String(x) }` (sahte sanitiser adı) | yeşil | KIRMIZI |
| X7 | `'use server'` üstüne `/** m8 */` yorumu + X1 | yeşil | KIRMIZI |

- **Sıkılaştırma gerçek.** X1 ile X8 karşılaştırılınca görülüyor: aynı sızıntı, eski `{m8:1}` listesiyle bekçiden geçiyordu (X8 yeşil); boş listeyle kırmızı (X1). Liste boşaldıktan sonra m8'e ya da başka bir dosyaya bekçinin tanıdığı biçimde **tek** bir sızıntı eklemek bile testi kırmızıya çeviriyor.
- **Bekçinin sınırı (D-1, aşağıda).** X2–X7 bekçiden geçiyor. m8'de hepsini crw-fb'nin sıkı `toEqual({status, code})` birim testleri yakalıyor (8/8 öldü, yaşayan 0). Böyle bir birim testi olmayan bir modülde tek savunma bekçi olurdu.

### 2.4 Kapılar (`gates.txt`, HEAD 2a3900b8)
```
tsc --noEmit exit=0
eslint src tests exit=0
i18n:check exit=0      (dev'den gelen "Baseline is looser … admin/settings/page.tsx 9 → 7" uyarısı; kırmızı değil)
next build exit=0
npx vitest run (2. koşu) exit=0
 Test Files  292 passed | 6 skipped (298)
      Tests  3696 passed | 99 skipped (3795)
```
1\. vitest koşusu 86 kırmızı verdi. Sebep bir ortam sorunuydu: izole DB paylaşılan DB'nin dump'ıydı ve şeması dev'in gerisindeydi (`ColumnNotFound`; eksikler `ApiKey.rateWindow*`, `Membership/User.staleDigestOn`, `Relationship.staleRemindedContactAt` ve 2 indeks). `prisma migrate diff` ile çıkan 4 ALTER ve 2 INDEX **yalnız devopfb93-pg**'ye uygulandı. Kırmızı olan 19 dosya tek başına koşulunca 196/196 geçti, tam koşu da 3696/0 bitti. Bu, paylaşılan `fabrika` DB'sinin şemasının dev'in gerisinde olduğunu da gösteriyor. Ona dokunmadım (§4 R-2).

### 2.5 i18n (tr/en)
`Consortium.seatNotFound` ve `Consortium.computeFailed` iki katalogda da var. tr metinleri "Bu koltuk ya da fırsat bu çalışma alanında bulunamadı. Sayfayı yenileyip tekrar deneyin." ve "Adaylar hesaplanamadı.", en metinleri "This seat or opportunity was not found in this workspace. Refresh the page and try again." ve "Could not compute candidates.". `Common.pilotExpired` ve `Common.forbiddenRole` de iki katalogda var. Buton kodu çeviriyor, ham metin göstermiyor. Bunu `pilot-expired-write-paths.test.tsx` (tr) sabitliyor. Gerçek tarayıcı tıklaması bu turda koşulamadı: AgentSpace kill-guard (R8, canlı uygulama açıkken e2e/tarayıcı) Playwright komutunu engelledi. Onay alınmadığı için guard'ı atlatmadım. Bunun yerine canlı kanıtı sunucu eyleminin ham HTTP gövdesi üzerinden aldım; bu, tarayıcının aldığı yanıtın aynısı. crw-fb'nin Chromium koşusu (tr/en alert metinleri) ayrıca duruyor.

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUO9IN3HL4K5K-devop-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUO9IN3HL4K5K-devop-fb-ekler/`: `live93.mjs.txt`, `live93-out.txt`, `throw93.mjs.txt`, `throw93-out.txt`, `mutants93.py.txt`, `mutants93-out.txt`, `gates.txt`, `server-log-excerpt.txt`. Eklerde sır taraması temiz: çerez, `AUTH_SECRET` ya da JWT yok.

Ürün kodu değişmedi.

## 4. Bulgular ve riskler
- **D-1 (düşük): eylem bekçisi hâlâ bir kalıp tarayıcısı ve 6 biçimi kaçırıyor** (X2–X7). Kaçan biçimler: yapıbozumlu `catch ({ message })`; bildirim olmadan nesneye ya da dıştaki değişkene atama; Promise `.catch(...)`; ada göre güvenilen sanitiser (`errorCode`); ve `'use server'` direktifinden önce yorum bulunan dosyalar. Sonuncusu dosyayı taramadan **tamamen** düşürüyor, çünkü `serverActionFiles` `^\s*'use server'` desenini `m` bayrağı olmadan arıyor. Bugün ağaçta bu biçimlerden hiçbirinin gerçek örneği yok. Tek `.catch` örneği `src/modules/m10/server/actions.ts:469` ve o da sabit kod dönüyor. `'use server'` içeren ama taranmayan tek dosya `portal/partner/[token]/page.tsx`'teki satır içi eylem, o da bir şey döndürmüyor. Öneri, takip kartı olarak: (a) `serverActionFiles` direktifi ilk ifade olarak arasın, önündeki yorumları atlasın; (b) route bekçisindeki yapısal yaklaşımın eylemlere uygulanması: dönüş tipindeki `error`/`code` alanlarının literal birleşim olmasını tsc ile zorlamak. Bu, kalıp listesini bitirmeye çalışmaktan daha kalıcı olur.
- **R-1: `SeatNotFoundError` log'a yazılmıyor.** Tasarım gereği bu bir alan hatası; fakat biri bir kiracının koltuk id'lerini tararsa sunucu tarafında iz kalmaz. Düşük öncelik, gözlemlenebilirlik notu.
- **R-2: paylaşılan `fabrika` DB şeması dev'in gerisinde.** 4 kolon ve 2 indeks eksik. O DB'ye karşı koşan ajanların live suite'leri `ColumnNotFound` ile kırmızı görür; bu gerçek bir regresyon sanılmamalı. Paylaşılan DB'ye yazmak kapsam dışı olduğu için dokunmadım.
- **NUL baytlı id** `computeFailed` dönüyor, `seatNotFound` değil. Sızıntı yok, yalnız mesaj daha az isabetli. Kozmetik.
- **Test ortamı notu.** Canlı DB bağlantısı süper kullanıcı `fabrika` ile yapıldı, yani RLS atlanıyor. Kiracı sınırı kanıtı bu yüzden uygulamanın kendi `(id, opportunityId, tenantId)` filtresine dayanıyor, RLS'ye değil. Prod'da `fabrika_app` rolü RLS'yi ek bir katman olarak getirir.

## 5. Açık sorular
Yok.

## 6. Sonraki adım
- D-1 için takip kartı: eylem bekçisinde direktif tespiti + dönüş tipinin literal zorlaması. Sahibi bekçinin yazarı (be-fb) ya da crw-fb olabilir.
- Paylaşılan `fabrika` DB'sine dev şemasını uygulamak (R-2) lider/DevOps onayıyla ayrı bir iş olmalı.

## Görev metnindeki ikinci kanıt yolu hakkında
Görev metninin sonundaki "KANIT ZORUNLU" bloğu, sonucun `/Users/macbook/alan/docs/agent-results/TASK-MUNY0O53ITDU4-be-fb.md` yoluna yazılmasını istiyor. Bu yol be-fb'nin başka bir görevinin rapor adı ve Bkz satırından türetilmiş; supervisor'ın bilinen "metindeki ilk docs/agent-results yolu = kanıt yolu" hatası (shared hafıza: agentspace-delegasyon-sonuc-yolu-kurali). Başka bir ajanın raporunun adını taşıyan bir dosya yazmadım. Görev metnindeki TEK sonuç yolu bu dosya.

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64; Node 26.5; Docker `pgvector/pgvector:pg16`; prod `next build` standalone). Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. İncelenen kod yolunda platforma bağlı bir şey yok: sunucu eylemi dönüş değeri, bir hata sınıfı ve bir i18n anahtarı. Süreç, dosya yolu ya da kabuk kullanımı yok. Bekçinin yol karşılaştırması `sep` ile `/`'ya normalleştiriliyor. Ekteki betikler (`docker exec`, `python3`, BSD `sed` kullanan komutlar) yalnız test aracı, ürün kodu değil.
