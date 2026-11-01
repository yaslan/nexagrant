# TASK-MUN509G2ICKWI — se-fb — M8 koltuk durumu sahteleme (İNCELEME-36 Y-1)

**Commit:** `1e98fdfb` (dev) · **Kaynak bulgu:** `docs/agent-results/TASK-MUN3O7W748ZQH-se-fb.md` Y-1
**Platform beyanı:** macOS (darwin, Apple Silicon) üzerinde doğrulandı. Değişen kod yalnız sunucu action'ları, Prisma sorguları ve React bileşenleri; dosya yolu, süreç, kabuk ya da ekran bağımlılığı yok. Windows ve Linux'ta aynı davranış beklenir (koddan). Bu platformlarda koşulamadı, çünkü ofiste yalnız bu mac makinesi var.

## Özet

| # | Bulgu (önce) | Önem | Durum |
|---|---|---|---|
| Y-1a | M8 `assignCandidateToSeat`: MEMBER, `status='CONFIRMED'` ve **uydurma PIC** gönderip koltuğu onaylayabiliyordu | Orta (kiracı içi yetki + veri bütünlüğü; eşleştirmede tutulan ülke ve rakip dışlama bu koltuklardan besleniyor) | **Kapandı** |
| Y-1b | Aynı action, başka kiracının aday listesindeki org'u ya da herhangi bir serbest dizeyi yazabiliyordu | Orta | **Kapandı** |
| Y-1c | Konsorsiyum `assignSeat`: serbest `organizationId` yazıyordu ve **onaylı koltuğu ezip INVITED'a düşürebiliyordu** | Orta | **Kapandı** |
| N-1 | Konsorsiyum `addSeat`: `roleKey` ve `required` istemciden serbest geliyor, rol kontrolü yok | Düşük (durum ya da org değil; `roleKey` React'te kaçışlanarak gösteriliyor) | Not, kapsam dışı |
| N-2 | Onaylı koltukta "Davet Et" düğmesi hâlâ görünüyor. Tıklama sunucuda reddediliyor ama kullanıcıya sessiz kalıyor (düğmenin mevcut "pilot dışı hata sessiz" politikası) | UX | Açık soru |

## 1. Ne yapıldı

1. **Önce kanıt** (izole DB, düzeltme öncesi kod `bf213b0d`). Kendi konteynerimi kurdum: `sefb-mun50`, `pgvector:pg16`, `:55500`. Sıra: `db push` → migrasyonlar → `db:rls-role` → migrasyonlar (2. kez) → `db:rls` (28→112 politika) → `db:seed`. `fabrika_app` için `rolbypassrls=f`. Worktree `.env`'inde `5433` geçmiyor. Action'lar gerçek `fabrika_app` (RLS) üzerinden koşuldu, yalnız oturum MEMBER olarak mock'landı. Sonuç: 4 yolun 4'ü de açıktı (§2.1).
2. **Düzeltme:**
   - Yeni `src/modules/m8/server/seat-transitions.ts` dosyası geçiş kurallarını tek yerde topluyor, M8 ve konsorsiyum aynı kuralı çağırıyor.
     - `inviteSeatCandidate(tx, {tenantId, seatId, organizationId, opportunityId?})`. Status her zaman `INVITED`. `organizationId` o koltuğun **kendi** `SeatCandidate` satırlarında `(tenantId, seatId, organizationId)` olarak bulunmalı. Organizasyonu atanmış `CONFIRMED` bir koltuk ezilmez. `CONFIRMED|null` ise davet edilebilir, çünkü seed'de böyle koltuklar var ve bunlar kimseyi onaylamıyor. Id'ler `isPresentId` ile korunuyor.
     - `canConfirmSeat(role)` = `can(asRole(role), 'manage_approvals')`. Mevcut `src/lib/rbac.ts` yardımcısı kullanıldı, yeni kural icat edilmedi. Bu izin TENANT_OWNER, TENANT_ADMIN ve PIPELINE_MANAGER'da var.
   - `src/modules/m8/server/actions.ts`: `assignCandidateToSeat(seat, org, status, opp)` **kaldırıldı**. Yerine iki action geldi:
     - `inviteCandidateToSeat(seat, org, opp)`: status parametresi yok.
     - `confirmSeatAssignment(seat, opp)`: rol kontrolü var. Yalnız `INVITED` koltuğu onaylıyor ve org'u koltuktan okuyor, istemciden almıyor. Aynı çağrıdaki çakışma kuralı buraya aynen taşındı. Status ve org WHERE'de de tekrarlanıyor, böylece okuma ile yazma arasında yeniden davet edilen bir koltuk onaylanmaz.
   - Konsorsiyum `assignSeat`, `inviteSeatCandidate`'ı çağırıyor. `manager.tsx` artık `{success:false}` dönünce satırı ekranda INVITED göstermiyor.
   - `invite-candidate-button.tsx` yeni action'ı çağırıyor.
   - Pilot kapısı (`requireTenantAction`, readOnly değil) ve id guard'ları korundu. Pilot testleri yeni action'larla genişletildi.
3. **Tarama (M8 + `pipeline/[id]/consortium`):** `ConsortiumSeat` ve `SeatCandidate` yazan her yol tarandı: `consortiumSeat.create|update*`, `seatCandidate.*`, raw SQL. Kalan yollar şunlar: `computeSeatCandidates` ve `findCandidates` (sunucunun hesapladığı adayları yazıyor, istemciden durum ya da org almıyor, zaten doğru), `addSeat` (N-1) ve `getConflicts` (readOnly, yalnız okuma). Bu dizinlerde başka `'use server'` modülü, API route'u ya da raw SQL yazması yok.
4. **Testler** (commit'li):
   - Yeni `tests/seat-assignment-authz.live.test.ts`, 27 test. Kendi 2 kiracısını, çağrısını ve konusunu kuruyor. RLS rolü doğrulanıyor. Her ret için satır anlık görüntüsü değişmemeli.
   - Konsorsiyum ekranında reddin INVITED gösterilmemesi için bileşen testi.
   - Mevcut 3 test dosyası yeni imzaya uyarlandı. `action-missing-id` artık geçerli bir aday org'u kullanıyor, yoksa ret yanlış nedenle gelirdi.
5. **Mutantlar:** 15 mutant uygulandı. 13'ü öldü. 2'si eşdeğer: ikinci WHERE katmanı aynı koşulu tutuyor. İki katmanı birlikte kaldıran sürümleri (M5b, M9b) öldü (§2.3).
6. **Gerçek tıklama:** Paylaşılan DB'de tek id'li fixture kuruldu, tr/en ve 390 px'te denendi, sonra id ile silindi (§2.4).

## 2. Kanıt

### 2.1 Önce: açık gerçek (izole DB, `bf213b0d`, MEMBER oturumu, `fabrika_app`)
```
PROBE role=MEMBER m8 forged org + CONFIRMED: OPEN|null -> CONFIRMED|SEFB50-FORGED-PIC ("ok")
PROBE role=MEMBER m8 other tenant org + CONFIRMED: OPEN|null -> CONFIRMED|sefb50p-mun5h2cz-org-b ("ok")
PROBE role=MEMBER consortium assignSeat forged org over CONFIRMED: CONFIRMED|sefb50p-mun5h2cz-org-b -> INVITED|SEFB50-FORGED-2 ({"success":true})
PROBE role=MEMBER consortium assignSeat forged org: OPEN|null -> INVITED|SEFB50-FORGED-3 ({"success":true})
```

### 2.2 Sonra: canlı test (`1e98fdfb`, izole DB)
```
tests/seat-assignment-authz.live.test.ts      Tests  27 passed (27)
hedefli 8 dosya (authz + pilot + missing-id + where-guard ×2 + src/modules/m8)   Tests  129 passed (129)
```
Kapsanan durumlar:
- **MEMBER daveti:** listedeki aday → `INVITED|org`. Reddedilen ve satırı değiştirmeyen girdiler: uydurma PIC, başka kiracının adayı, aynı fırsatta başka koltuğun adayı, boş org, başka fırsatın koltuğu, onaylı koltuk. Eski 4 argümanlı `CONFIRMED` çağrısı da (sahte PIC ya da listedeki org ile) hiçbir şey yazmıyor. `CONFIRMED|null` seed koltuğu davet edilebiliyor.
- **Onay:** MEMBER, WRITER, GUEST_PARTNER ve tanımsız rol reddediliyor, koltuk `INVITED` kalıyor. PIPELINE_MANAGER, TENANT_ADMIN ve TENANT_OWNER onaylayabiliyor. Reddedilen diğer onaylar: hiç davet edilmemiş koltuk, `DECLINED` olup org taşıyan koltuk, başka kiracının koltuğu, başka fırsatın koltuğu. Aynı çağrıda başka fırsatta onaylı org için `Conflict:` reddi korundu.
- **Konsorsiyum `assignSeat`:** listedeki aday → `{success:true}`. Uydurma org, başka kiracının adayı, başka koltuğun adayı ve onaylı koltuk → `{success:false}`, satır değişmiyor.

### 2.3 Mutantlar (her biri commit'li 4 test dosyasına karşı, sonra geri alındı)
```
M1 aday listesi kontrolü yok: rc=1 Tests  6 failed | 84 passed (90)
M2 CONFIRMED koltuk ezilebilir: rc=1 Tests  2 failed | 88 passed (90)
M2b onaylı-boş koltuk istisnası yok: rc=1 Tests  1 failed | 89 passed (90)
M3 rol kontrolü her zaman true: rc=1 Tests  4 failed | 86 passed (90)
M4 aday aramasında seatId yok: rc=1 Tests  2 failed | 88 passed (90)
M5 onay findFirst INVITED şartı yok (tek katman): rc=0 Tests  90 passed (90)   ← eşdeğer: updateMany WHERE status:'INVITED' tutuyor
M5b onay INVITED şartı iki katmanda da yok: rc=1 Tests  1 failed | 89 passed (90)
M6 çağrı çakışma kuralı yok: rc=1 Tests  1 failed | 89 passed (90)
M7 konsorsiyum eski doğrudan yazma: rc=1 Tests  4 failed | 86 passed (90)
M8 izin manage_approvals yerine view_proposal: rc=1 Tests  2 failed | 88 passed (90)
M9 onay findFirst opportunityId yok (tek katman): rc=0 Tests  90 passed (90)  ← eşdeğer: updateMany WHERE opportunityId tutuyor
M9b onay opportunityId iki katmanda da yok: rc=1 Tests  2 failed | 88 passed (90)
M10 düğme eski 4-arg çağrı: rc=1 Tests  1 failed | 89 passed (90)
M11 davette opportunityId kapsamı yok: rc=1 Tests  2 failed | 88 passed (90)
M12 manager success yok sayılır: rc=1 Tests  1 failed | 89 passed (90)
```

### 2.4 Gerçek tarayıcı (Chrome; `dave@` = MEMBER, `alice@` = PIPELINE_MANAGER; paylaşılan `fabrika` DB)
**:3000 hakkında:** Paylaşılan :3000 sunucusu (pid 3186, cwd FONBRIDGE) doğrulama sırasında kapanmıştı (`ERR_CONNECTION_REFUSED`). Onu ben başlatmamıştım ve yeniden başlatmadım, çünkü devop-fb paralelde Dockerfile/compose üzerinde çalışıyor ve web konteyneri :3000'i isteyebilir. Onun yerine aynı kodla (worktree `b17d2ed2` + değişikliklerim; `src` ana ağaçla aynı, m11 komşu değişikliği hariç) ve **aynı paylaşılan DB** ile kendi `next dev -p 3361`'imi açtım. İş bitince yalnız kendi pid'imi kapattım.

Fixture: `ConsortiumSeat` `sefb50-seat` (demo-opp-1, `dissemination`, OPEN) ve 2 `SeatCandidate` (`SEFB50-ORG-A`/`-B`).
```
1 before: OPEN|null
1 after real click (MEMBER, listed candidate): INVITED|SEFB50-ORG-A | captured action id 70d8a5eb26…
2 MEMBER invite forged PIC: http 500 → row INVITED|SEFB50-ORG-A
2 MEMBER invite legacy 4-arg CONFIRMED + forged PIC: http 500 → row INVITED|SEFB50-ORG-A
2 MEMBER invite legacy 4-arg CONFIRMED + listed org: http 500 → row INVITED|SEFB50-ORG-A
3 confirm action id in manifest: null            ← confirmSeatAssignment'ı hiçbir sayfa import etmiyor; istemciden erişilemez (404)
5 MEMBER assignSeat forged: http 200 … → row OPEN|null
5 MEMBER assignSeat listed: http 200 … → row INVITED|SEFB50-ORG-B
4b before: CONFIRMED|SEFB50-ORG-A                ← yönetici onayı SQL ile simüle edildi (onay için UI yok)
4b action responses: [ 500 ] | after MEMBER click on ORG-B: CONFIRMED|SEFB50-ORG-A
6 en/390 page width [ 390, 390 ]
```
Kareler: `docs/agent-results/TASK-MUN509G2ICKWI-se-fb/`
- `1-member-before.png`: OPEN
- `2-member-invited.png`: "Durum: DAVET EDİLDİ"
- `3-member-over-confirmed.png`: tıklamadan sonra "Durum: ONAYLANDI" kalıyor
- `4-en-390-invited.png`: en, 390 px, yatay kaydırma yok

**Temizlik:** Tek bir DO bloğunda boş id reddedildi, `ROW_COUNT` 2 ve 1 olarak kontrol edildi. Sonuç: `0 seats, 0 candidates, 0 seats pointing at SEFB50 orgs left`. Demo koltuklarına (`demo-seat-opp1-*`) dokunulmadı.

### 2.5 Kapılar (`1e98fdfb`, temiz worktree, `git status` boş)
```
tsc=0
lint=0
i18n:check → ✅ i18n check passed … (rc=0)
tam vitest (yalnız izole DB :55500) → Test Files 236 passed | 2 skipped (238) · Tests 2776 passed | 8 skipped (2784) · rc=0
pnpm build (rm -rf .next; env -i PATH HOME) → rc=0
```
Ara koşu: ilk tam süitte iki bekçi (`where-guard-src`, `teardown-where-guard`) yeni kodumu yakaladı. Helper'daki `where` değerleri korunmuyordu, test teardown'unda da `in: ids` kullanılmıştı. İkisini de kod düzelterek kapattım. KNOWN listesine istisna eklemedim.
Build notu: aynı commit'te bir build `rc=1` verdi (`/_global-error` prerender, `useContext` null). Nedeni, kabuğa export ettiğim worktree `.env`'indeki `NODE_ENV=development` idi. Temiz ortamla (`env -i`) build `rc=0`. Kod kaynaklı değil.

## 3. Değişen dosyalar (`1e98fdfb`)
- `src/modules/m8/server/seat-transitions.ts` (yeni)
- `src/modules/m8/server/actions.ts`
- `src/modules/m8/components/invite-candidate-button.tsx`
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions.ts`
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/manager.tsx`
- `tests/seat-assignment-authz.live.test.ts` (yeni)
- `tests/pilot-expired-write-paths.test.tsx`, `tests/pipeline-actions-pilot-digest.test.ts`, `tests/action-missing-id.live.test.ts`
- Rapor ve kareler: bu dosya ile `docs/agent-results/TASK-MUN509G2ICKWI-se-fb/*.png`

Paralel ajanların dosyalarına dokunulmadı: devop-fb Dockerfile/compose/credits, be-fb `docs/SMTP-SUNUCU.md`, cs-fb/fe-fb belgeleri ve ana ağaçtaki commit'lenmemiş m11 değişikliği.

## 4. Riskler
- **İmza değişti:** `assignCandidateToSeat` artık yok. Eski bir istemci paketi eski action ID'sine POST ederse 404 alır. Yeni ID'ye 4 argümanla gelirse 3. argüman `opportunityId` sayılır ve "koltuk bulunamadı" ile reddedilir (test ve canlı POST ile doğrulandı). Repoda başka çağıran yok.
- **Davet hâlâ her rolde açık** (GUEST_PARTNER dahil, eşleştirme sayfasına erişebiliyorsa). Kural bunu org ve geçişle sınırladı, rolle sınırlamadı. Bilerek böyle bırakıldı: bugünkü UX'te MEMBER davet ediyor.
- `confirmSeatAssignment` için UI yok. Bir sayfa import edene kadar istemciden erişilemiyor. Onay akışı kurulunca aynı kurallarla çalışır.
- Aday listesi `computeSeatCandidates` / `findCandidates` her koşuda yeniden yazılıyor. Liste yeniden hesaplanınca listeden düşen bir org artık davet edilemez. Bu kasıtlı: davet yalnız sunucunun önerdiği adaylar için.

## 5. Açık sorular
1. **N-2:** Onaylı koltukta "Davet Et" düğmesi gizlensin mi, yoksa reddi kullanıcıya göstersin mi? Şu an sessiz; yeni bir i18n anahtarı gerekir.
2. Davet için rol eşiği olsun mu (örn. WRITER+)? Bu bir ürün kararı. Bugünkü davranış korundu.
3. Onaylı bir koltuğu serbest bırakma ya da reddetme (`DECLINED`) akışı yok. Yönetici yanlış onayı geri alamıyor. Ayrı kart önerisi.
4. **N-1:** `addSeat` için `roleKey` izin listesi ve rol kontrolü eklensin mi?

## 6. Sonraki adım
- crw-fb incelemesi: kural tek dosyada (`seat-transitions.ts`), testler `tests/seat-assignment-authz.live.test.ts`.
- Onay UI'sı yazılırsa `confirmSeatAssignment` kullanılmalı. Yeni bir status parametresi açılmamalı.
