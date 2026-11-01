---
görev: TASK-MVNSRON87S8T0
kod: FO-142
ajan: be-fb
tip: bug
hüküm: KABUL (dal push edilmedi; FO-62 dalındaki gerçek "M4'e ekle" tıklaması bu dalda yok, bkz. Açık sorular)
platform: mac (darwin). Sunucu eylemi, platformdan bağımsız; dosya yolu, süreç ya da ikili kullanmıyor. Windows/Linux koşulmadı (sunucu eylemi olduğu için koddan gerekçelendirildi).
---

# FO-142 — createRelationship: modül kapısı, Zod, tek PIC tek satır

**Dal:** `be-fb/fo142-relationship-guard` (worktree: `/Users/macbook/alan/FONBRIDGE-worktrees/fo142`, taban `origin/dev` = `86a1a1d0`)
**Dev'e karşı draft PR:** açılmadı (aşağıda neden). Merge yok.

## Ne yapıldı

1. **Tek kaynak.** `createRelationship` artık yalnız `src/modules/m4/server/actions.ts` içinde tanımlı. `src/app/[locale]/(app)/[workspace]/relationships/actions.ts` aynı adla kalıyor (FO-62 dalındaki sayfalar oradan import ediyor) ve yalnız `requireTenantAction({ can: 'edit_proposal' })` çağırıp M4 eylemine devrediyor.
2. **Modül kapısı.** M4 eylemi ilk yan etkiden önce `await assertModuleAccess('M4')` çağırıyor. Sarmalayıcıda ilk satır rol kontrolü (`requireTenantAction`), modül kapısı değil; ancak rol kontrolü yan etki üretmiyor ve modül kapısı M4 içindeki ilk yan etki öncesi çalışıyor.
3. **Zod.** `RelationshipCreateInput`:
   - `kind`: `z.enum(['partner','ncp','city','cluster','consultant','tto'])` (şema yorumundaki liste; dev'de yazan tek yer FO-62'nin `'partner'` göndermesi)
   - `organizationId`: `^\d{6,12}$` (CORDIS PIC). FO-61'deki `picSchema` dev'de yok, bu yüzden kendi regex'i yazıldı.
   - `partnerOrgId`: 1–64 karakter. `counterpartName`: 1–300. `counterpartEmail`: e-posta, en fazla 320. `notes`: en fazla 5000.
   - En az biri zorunlu: `organizationId` | `partnerOrgId` | `counterpartName`. Karar gerekçesi: FO-62 PIC'siz ilanlarda yalnız `counterpartName` gönderiyor (`AnnouncementCard.tsx`: `organizationId: pic ?? undefined`). Kartın "kırılmamalı" kuralı için `counterpartName` tek başına yeterli kabul edildi.
4. **Mükerrer koruma.** `organizationId` doluysa, aynı transaction içinde `pg_advisory_xact_lock(hashtextextended('<tenant>:<PIC>', 0))` alınır, sonra `findFirst`; varsa mevcut satırın `id`'si döner, yeni satır yazılmaz. Eşzamanlı çağrılar kilitte sıralanır.
   - Eski route kopyası "PIC'e göre tekillik" kontrolü yapmıyordu; M4 kopyası hata fırlatıyordu. Yeni davranış: idempotent (hata yok, aynı id).
5. **Birleştirilen davranış.** Canlı yol route kopyasıydı: `ownerUserId = userId`, `warmth: 'cold'`, `notes` yazılıyor. M4 kopyası üretimde hiçbir yerden çağrılmıyordu (dev'de yalnız testte). Birleşik tanım route'un davranışını korudu; M4'ün `warmth: 'active'` + `lastContactAt` davranışı kaldırıldı.
6. **Şema değişmedi.** Migration, RLS değişikliği ve `docs/DATA_MODEL.md` yok (advisory lock ile çözüldü; unique index eklenmedi).

## Neden unique index eklenmedi

Kart, index eklenmeden önce mevcut veride mükerrer satırı sorgulamayı istiyor. Paylaşımlı 5433 veritabanına erişim bu kartta yasak ("Ortak 5433 YOK"), ve Supabase MCP'de listelenen tek proje (`pxojxhvsvadqqaqudiok`) Fabrika'ya ait değil. Bu nedenle gerçek veride sorgu **çalıştırılamadı**. Index yerine uygulama katmanında advisory lock kullanıldı. Ölçüldü: lock kaldırılınca 20 eşzamanlı çağrı 4 satır üretiyor, lock ile 1 satır. Veri tarafında mükerrer satır olup olmadığı bilinmiyor; eski route yolu tekillik kontrolü yapmadığı için varsa bu satırlar yerinde kalır (kodda çökme yok, `findFirst` ilk satırı döner). Kısmi unique index (`organizationId IS NOT NULL`) ancak gerçek veride sorgu temizse eklenmeli.

## Değişen dosyalar

- `src/modules/m4/server/actions.ts` — `createRelationship` yeniden yazıldı, `assertModuleAccess`, Zod, advisory lock eklendi
- `src/app/[locale]/(app)/[workspace]/relationships/actions.ts` — `createRelationship` ince sarmalayıcı; eski Prisma çağrısı ve `RelationshipRow` importu kaldırıldı
- `tests/server-action-rbac.test.ts` — `m4.createRelationship` örneği `org-1` yerine geçerli PIC `123456789` ile (eski değer artık doğrulamada düşerdi; test yine rol kapısından geçtiğini ölçüyor)
- `tests/m4-create-relationship.live.test.ts` — yeni, 10 test (aşağıda)

## Kanıt (ham çıktı)

Test ortamı: izole Postgres `pgvector/pgvector:pg16`, konteyner `fo142-pg`, `127.0.0.1:5440`; `pnpm db:setup` çıktısı `db-setup: done (localhost:5440/fabrika)`. 5433 ve `fabrika-postgres` konteyneri dokunulmadı.

Kapılar:
```
$ pnpm typecheck
$ tsc --noEmit            (çıkış 0)
$ pnpm lint               → 0 hata; 4 uyarı, hepsi bu değişikliğin dışında (eslint: değiştirilen dosyalarda 0 uyarı)
```

Testler (`perl -e 'alarm 900;exec @ARGV' pnpm vitest run ...`):
```
 Test Files  5 passed (5)
      Tests  184 passed (184)
```
Kapsam: `m4-create-relationship.live.test.ts` (10), `server-action-rbac.test.ts`, `server-action-rbac-guard.test.ts`, `relationship-owner-assignment.live.test.ts`, `action-missing-id.live.test.ts`. Taban çizgisi (değişiklik öncesi) 174/174; şimdi 184/184.

Yeni testler:
- M4 kapalı: `ModuleAccessError` atar, satır sayısı değişmez
- geçersiz `kind`, PIC olmayan `organizationId`, bozuk e-posta, 5001 karakter `notes`, boş girdi: her biri reddedilir, satır yazılmaz
- aynı PIC iki kez: aynı id döner, tek satır
- aynı PIC 20 eşzamanlı çağrı: tek id, tek satır (mutasyon: lock kaldırılınca `expected 4 to be 1`)
- başka kiracıda aynı PIC: ayrı satır (kiracı izolasyonu)
- PIC'siz, yalnız `counterpartName` ile: kabul, `ownerUserId` oturumdaki kullanıcı

Mutasyon doğrulaması: `pg_advisory_xact_lock` satırı geçici silinince eşzamanlılık testi kırıldı; satır geri konuldu (`grep -c` = 1).

Gerçek tıklama: **yapılmadı.** "M4'e ekle" düğmesi FO-62 dalında (PR #167, `AnnouncementCard.tsx`). Bu dalda yok. Dev'de yalnız test yoluyla ölçüldü (gerçek action kodu, yalnız `auth` ve modül kapısı taklit edildi).

## Riskler

- **Davranış değişikliği:** M4 kapalı kiracıda artık reddediliyor (eskiden `edit_proposal` yeterdi). Düğme M4 kapalıyken zaten gizli; doğrudan çağrı artık yazmıyor. Bu istenen davranış.
- **Dönüş tipi:** route `createRelationship` artık satır değil `string` (id) döndürüyor. Dev'de çağıran yok; FO-62 `AnnouncementCard` sonucu yok sayıyor.
- **Sarmalayıcıda rol kontrolü tekrarı:** `requireTenantAction` iki kez çalışıyor (sarmalayıcı + M4). RBAC guard, dışa aktaran dosyada rol kontrolü görmeden kırmızıya düşüyor (re-export ile denendi, guard "re-export from another module" ile reddetti). Sayfa import'larını M4'e taşımak da denendi ama FO-62 sayfalarına dokunmak kapsam dışı; sarmalayıcı kaldı.
- **Mükerrer veri:** eski yoldan doğmuş mükerrer satırlar varsa bilinmiyor (yukarıda).
- **Eşzamanlılık:** advisory lock yalnız aynı kiracı+PIC için; başka bir yazıcı (ör. toplu içe aktarma) bu kilidi almazsa koruma yok. Bugün tek yazıcı bu eylem.

## Açık sorular

1. **Gerçek tıklama + FO-62 entegrasyonu.** FO-62 (PR #167) bu dal merge olunca rebase edilmeli; "M4'e ekle → sayfayı yenile → tekrar ekle" akışı orada doğrulanmalı. Kart bu adımı FO-62 ile birlikte bekliyor.
2. **Gerçek veride mükerrer sorgusu.** Dev/prod'da şu sorgu çalıştırılmalı, sonuç boş değilse birleştirme planı olmadan index eklenmemeli:
   ```sql
   SELECT "tenantId", "organizationId", count(*) FROM "Relationship"
   WHERE "organizationId" IS NOT NULL
   GROUP BY 1,2 HAVING count(*) > 1;
   ```
3. **PR.** Draft PR `dev`'e açılmadı: dal henüz push edilmedi; kart PR'ın FO-62 ile sırasını (merge öncesi ya da hemen sonrası) lidere bırakıyor.

## Sonraki adım

Dal `be-fb/fo142-relationship-guard` olarak commit edilip push edilebilir (lider onayı), ardından draft PR `dev`'e; FO-62 ile sıra ve gerçek tıklama lider kararı.

## Definition of Done

- [x] Tek `createRelationship` mantığı var; ikinci kopya ince sarmalayıcıya indirildi (diff: route dosyası −42/+ satır, m4'te tek tanım)
- [x] Eylemin ilk yan etkisinden önce `assertModuleAccess('M4')`; M4 kapalı için test yeşil (sarmalayıcıda ilk satır rol kontrolü, bkz. Riskler)
- [x] Zod şeması var; geçersiz girdi testleri yeşil
- [x] Aynı PIC iki kez → tek satır (birim/live test + eşzamanlılık); **gerçek tıklama yapılmadı** (FO-62 dalında)
- [ ] Şema değişmedi → migration/RLS/DATA_MODEL gerekmedi; mükerrer veri sorgusu **gerçek veride çalıştırılmadı** (5433 yasak)
- [x] `server-action-rbac` ve guard testleri yeşil; lint ve typecheck temiz (değiştirilen dosyalarda 0 uyarı)
- [x] Platform beyanı: mac (darwin); sunucu eylemi, platformdan bağımsız
