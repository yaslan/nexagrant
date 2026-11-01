# TASK-MUO3BUQY9739B — FB İNCELEME-86 (be-fb): silinmiş kiracıdaki üyelik oturuma yetki vermez (TASK-MUO2B59ZNY7D7, cs-fb)

**Durum:** TAMAM · **Ajan:** be-fb · **Tarih:** 30.09.2026
**Karar:** **ONAY.** Düzeltme doğru ve regresyon yok. Sorgu sayısı 2 → 2. Test borcu Ö-1..Ö-4 gerçekten kapanmış: kendi yazdığım 13 N-mutantının 13'ü de kırmızı. Kapsam dışında kalan iki yol ayrı kart istiyor (**Y-1**, canlı kanıtlı): silinmiş kiracının API anahtarı veri okumaya, partner portal token'ı da yazmaya devam ediyor. Bu kartın merge'ünü engellemiyor.
**İncelenen:** `501e1db3` (düzeltme), dev merge'ü `6a5c3c62`. İnceleme ağacı dev `8ddcb5b6`, ayrı worktree'de (detached), kod değiştirilmedi.
**Ortam:** İzole Postgres `befb-o3bu-pg` (pgvector:pg16, 127.0.0.1:5486). Hazırlık CI ile aynı sırada: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 ("40 files applied" ×2) → `db:rls` (112→112) → `db:seed`. Paylaşılan `fabrika` :5433'e bağlanılmadı, worktree'de `.env` yok, tüm DB URL'leri env'den verildi.
**Platform:** Doğrulama macOS'ta (Darwin 27.0.0) yapıldı. İncelenen değişiklik yalnız bir Prisma `where` filtresi ve testlerden oluşuyor. Süreç, dosya yolu, kabuk ya da ekran koduna dokunulmuyor, bu yüzden Windows ve Linux'ta da aynı SQL üretilir. CI (ubuntu-latest) tam vitest'i zaten koşuyor. Windows ve Linux burada koşulamadı, çünkü bu makinede yalnız macOS var.

## 1. Ne yapıldı
1. jwt callback'teki (`src/lib/auth.ts:704-760`) değişiklik satır satır okundu. `tenant: { deletedAt: null }` filtresi bağlı, istenen ve "en eski" dallarının üçüne de aynı `where` üzerinden uygulanıyor. `delete token.*` ile "hiçbir şey taşınmaz" ilkesi korunuyor. `boundTenantId` silinmiş kiracıda kalıyor, bu yüzden geri alma aynı çereze kiracıyı geri veriyor.
2. Kendi canlı problarım (`ekler/review-o3bu.live.test.ts.txt`) yazıldı. Gerçek `auth()`, `unstable_update`, `acceptInvitationAction`, `/api/v1/opportunities` `GET` ve `addBudgetLineByToken` kullanıldı, izole DB'de koşuldu. Dosya commit edilmedi, ağaçtan çıkarıldı.
3. Sorgu sayısı `log_statement=all` açıkken, koşu başına benzersiz işaretlerle ölçüldü. Plan için EXPLAIN alındı.
4. Kendi yazdığım 21 mutant koşuldu (N2/N4/N7/N8/N11'in yeni biçimleri ve 8 silinmiş-kiracı varyantı), önce 5 dosyada, sonra yalnız canlı testlerde.
5. Kiracı çözen diğer yollar koddan tarandı (API anahtarı, partner portalı, cron/job'lar, faturalama portalı, hesap silmeyi iptal).
6. Tam kapılar: tsc, lint, i18n, tam vitest (CI=true, izole DB) + live-skip kapısı, build.

## 2. Kanıt

### A. Canlı problar (`ekler/probe-out.txt`, 6/6 koştu)
```
J1 {"before":{"t":"A","role":"TENANT_OWNER","admin":true},"after":{"t":null,"role":null,"admin":true}}      ← platform admin: kiracı düşer, admin bayrağı (DB'den) kalır
J2 {"s":{"t":null,"role":null},"plain":{"t":"A","role":"TENANT_OWNER"}}                                    ← tüm üyelikler silinmiş kiracıda: giriş kiracısız; A geri alınınca sonraki istek A (bkz. Ö-3)
J3 {"stranded":{"t":null},"moved":{"t":"D","role":"TENANT_OWNER"},"refused":{"t":"D"}}                    ← bağlı A silindi → kiracısız; canlı D'ye açık istekle geçiş olur; silinmiş A'ya geri dönme isteği reddedilir
J4 {"out":"ok:{\"error\":\"errors.revoked\"}","after":{"t":"A","role":"TENANT_OWNER"},"joined":0}         ← silinmiş kiracının daveti: "revoked", üyelik açılmadı, oturum yerinde kaldı
P1 {"live":200,"deleted":200,"total":1,"title":"rv86-muo3gqsu secret opp"}                                 ← ⚠ Y-1: silinmiş kiracının API anahtarı fırsatları hâlâ döndürüyor
P2 {"out":"ok:{\"success\":true,\"requestedTotal\":13750}","budget":1}                                     ← ⚠ Y-1: silinmiş kiracının partner token'ı bütçe satırı YAZDI
```
cs-fb'nin kendi canlı testleri (O1_BOUND_DELETED, O1_SIGNIN, O1_A9) ve Y2/Y1 testleri tam koşuda yeşil. Silme, geri alma ve [A9] senaryoları bağımsız olarak tekrar üretildi.

### B. Sorgu sayısı 2 → 2 (`ekler/sql-plain.txt`, `ekler/sql-deleted.txt`, `ekler/explain.txt`)
Hem canlı hem silinmiş bağlı kiracıda, işaretler arasında tam **2** ifade var:
```
SELECT "User"."id","User"."name","User"."isPlatformAdmin" FROM "User" WHERE ("User"."id" = $1 AND 1=1) LIMIT $2 OFFSET $3
SELECT … FROM "Membership" LEFT JOIN "Tenant" AS "j0" ON ("j0"."id") = ("Membership"."tenantId")
  WHERE ((("j0"."deletedAt" IS NULL AND ("j0"."id" IS NOT NULL)) AND "Membership"."tenantId" = $1) AND "Membership"."userId" = …
```
EXPLAIN (`enable_seqscan=off`) sonucu: bağlı dal `Membership_tenantId_userId_key` üzerinden okuyor, JOIN `Tenant_pkey` (ya da `Tenant_deletedAt_idx`) üzerinden. Ek tur yok.

### C. Mutantlar: kendi biçimlerim (`ekler/mutants-rv86.py.txt`, `…-out.txt`, `…-live-out.txt`)
Taban: 5 dosya, `Tests 63 passed (63)`. Geri yüklemeden sonra da `63 passed`, `src restored clean`.

| Mutant | 5 dosya | Yalnız canlı (26) |
|---|---|---|
| N2a regex'e `statement timeout` eklendi | 1 kırmızı ✅ | — |
| N2b `/Connection terminated/` (unexpectedly de) | 1 kırmızı ✅ | — |
| N2c regex'e `Query timeout` eklendi | 1 kırmızı ✅ | — |
| N4a kabulde catch yeniden fırlatıyor | 1 kırmızı ✅ | — |
| N4b log `error.message` basıyor (sızıntı) | 1 kırmızı ✅ | — |
| N4c hata sonrası `return` (yönlendirme yok, çerez kalıyor) | 1 kırmızı ✅ | — |
| N7a istenen yerine bağlı tercih ediliyor | 3 kırmızı ✅ | 1 kırmızı |
| N7b yalnız ilk satır (istenen yok sayılıyor) | 2 kırmızı ✅ | 1 kırmızı |
| N7c `orderBy desc` | 8 kırmızı ✅ | 7 kırmızı |
| N8a uyarı iki kez (yeniden denemede de) | 1 kırmızı ✅ | — |
| N8b ikinci hata `undefined` dönüyor | 1 kırmızı ✅ | — |
| N11a `session.user.boundTenantId` | 1 kırmızı ✅ | — |
| N11b oturum `demoAdmin`'i açığa veriyor | 1 kırmızı ✅ | — |
| D1 bağlı satır silinmiş olsa da tutuluyor (`OR tenantId=bound`) | 12 kırmızı ✅ | 1 kırmızı |
| D2 istenen satır silinmiş olsa da tutuluyor | 12 kırmızı ✅ | 1 kırmızı |
| D3 filtre yalnız yeniden bağlamada | 11 kırmızı ✅ | 2 kırmızı |
| D4 ters filtre (`not: null`) | 18 kırmızı ✅ | 7 kırmızı |
| D5 filtre `user.deletedAt` üzerinde | 14 kırmızı ✅ | 3 kırmızı |
| D6 **eşdeğer** `tenant: { is: { deletedAt: null } }` | 11 kırmızı (yalnız şekil) | **0, yaşıyor (doğru)** |
| D7 ileri tarihli `deletedAt` canlı sayılıyor | 11 kırmızı (yalnız şekil) | **0, yaşıyor** (Ö-2) |
| D8 boş sonuçta oturuma `boundTenantId` düşüyor | 7 kırmızı ✅ | 3 kırmızı |

### D. Kapılar (`ekler/gates.txt`, `ekler/vitest-summary.txt`; ağaç dev `8ddcb5b6`, izole DB, `CI=true`)
```
tsc exit=0 · lint exit=0 · i18n exit=0
vitest exit=1 · Test Files 1 failed | 288 passed | 2 skipped (291) · Tests 2 failed | 3551 passed | 36 skipped (3589)
  └ 2 kırmızı: tests/rag-pdf-worker-isolation.test.ts zaman eşiği (7226 ms < 3000, 8513 ms < 5000). Makinenin yük ortalaması 36.
    Dosya tek başına tekrar koşuldu: Test Files 1 passed · Tests 25 passed (25). Bu değişiklikle ilgisiz, PDF bombası testi (se-fb alanı).
live-skip gate: 43 live files, 380 live tests passed, 28 allowed skip(s) → exit 0
build exit=0
```

## 3. Bulgular

### Y-1 (kapsam dışı ama canlı; ayrı kart önerisi): oturumsuz kiracı yolları silinmiş kiracıya bakmıyor
- **API anahtarı:** `src/lib/api-auth.ts:67` anahtarı `keyHash` ile buluyor ve `keyRecord.tenantId` ile devam ediyor. `Tenant.deletedAt` kontrolü yok. Canlı sonuç (P1): kiracı silindikten sonra `GET /api/v1/opportunities` → **200**, 1 fırsat, başlığıyla birlikte. `/api/v1/calls`, `/api/v1/partners`, `/api/v1/partners/[pic]` de aynı `authenticateApiKey`'i kullanıyor.
- **Partner portalı:** `addBudgetLineByToken` (`src/modules/m11/server/actions.ts:580`) ve `portal/partner/[token]/page.tsx` token'ı `withSystemScope` ile çözüyor. Yalnız pilot süresine bakılıyor (`assertTenantWritable`), `deletedAt`'e bakılmıyor. Canlı sonuç (P2): silinmiş kiracıya bütçe satırı **yazıldı** (`budget: 1`).
- **Etki:** Bugün `Tenant.deletedAt`'e yazan uygulama kodu yok (grep: yalnız `add-soft-delete.sql` sütunu ve dizini ekliyor), yani bu yalnız operatörün yaptığı yumuşak silmede tetikleniyor. Yine de KVKK silme bekleme süresindeki bir kiracının verisi dışarıya açık kalıyor, hatta yazılabiliyor. Oturum yolu artık kapalı olduğu için tutarsızlık da göze batıyor.
- **Öneri (tek sorgu, ek tur yok):** keşif sorgusunu `tx.apiKey.findFirst({ where: { keyHash, tenant: { deletedAt: null } } })` biçimine çevirmek ya da `include: { tenant: { select: { deletedAt: true } } }` eklemek, silinmişse `invalidKey()` döndürmek. Portalda da aynı `applicationPart` sorgusuna `tenant: { deletedAt: null }` eklenmeli. Canlı testler P1/P2'nin tersini doğrulamalı. Kart sahibi olarak be-fb ya da se-fb uygun.

### Ö-1: `credits-monthly-grant` silinmiş kiracıya da kredi veriyor
`src/lib/jobs/tasks/credits-monthly-grant.ts:157` `tenant.findMany({ select: { id: true } })` çağrısında filtre yok. Kardeş job'lar (`topic-match`, `embeddings`, `stale-reminder`) `deletedAt: null` ile filtreliyor. `alerts-sweep` ise yumuşak silinmiş kiracıyı bilerek "yaşıyor" sayıyor, bu doğru (bekleme süresinde alarm kapatılmaz). Etkisi düşük, bir defter satırı yazılıyor, erişim açılmıyor. Y-1 kartına eklenebilir.

### Ö-2: birim testleri `where`'in şeklini sabitliyor
`src/lib/auth-callbacks.test.ts` `where`'i tam şekliyle karşılaştırıyor. Bu yüzden eşdeğer bir yeniden yazım (D6, `is:`) 11 testi kırmızıya çeviriyor. Tersine, D7 (ileri tarihli `deletedAt` canlı sayılıyor) yalnız bu şekil sabitlemesiyle ölüyor, davranış testi onu yakalamıyor. Bugün ileri tarihli `deletedAt` yazan bir akış yok. Bir "planlı silme" gelirse (deletedAt = bekleme bitişi), anlam "deletedAt dolu = silinmiş" olarak kalmalı ve canlı bir testle sabitlenmeli. Engelleyici değil.

### Ö-3: bağsız oturum geri alınan kiracıyı kendiliğinden buluyor (bilgi)
J2: tüm üyelikleri silinmiş kiracıda olan bir kullanıcı kiracısız giriş yapıyor. Bu durumda `boundTenantId` yazılmıyor. Kiracılardan biri geri alınınca bir sonraki düz istek en eski canlı kiracıyı seçiyor. Bu, "bağ yoksa en eski" kuralının beklenen sonucu (taze bir giriş de aynı sonucu verirdi), kimse "arkasından başka kiracıya taşınmıyor". Kabul edilebilir, not olarak düşüldü.

### Ö-4: sahip için geri alma ekranı yok (ürün kararı)
Kartta "OWNER geri alma ekranına erişebiliyor" maddesi var ama FONBRIDGE'de kiracı geri alma rotası yok (grep `undelete|restoreTenant|cancelTenantDeletion|tenantDeletion` → boş). Sahip `/no-workspace` görüyor. Tek "iptal" akışı `cancelAccountDeletion` (`src/actions/user/request-deletion.ts:138`), yalnız `session.user.id` istiyor ve kiracı filtresinden etkilenmiyor (koddan okundu). cs-fb'nin §4/§5'teki önerisine katılıyorum: bu ekran eklenirse jwt'nin genel bağını açmayan dar bir rota olmalı.

### Ö-5: `Membership(userId)` dizini yok (önceden vardı, bu değişiklikle gelmedi)
Kiracısız giriş dalı (`where: { userId, tenant: {deletedAt: null} }`) yalnız `userId` ile filtreliyor. `(tenantId, userId)` unique dizini bu sorguya hizmet etmiyor, ölçek büyüyünce tam tarama olur. JOIN durumu kötüleştirmiyor. İleride additive `CREATE INDEX IF NOT EXISTS "Membership_userId_createdAt_idx" ON "Membership"("userId","createdAt")` düşünülebilir (ayrı iş).

### Doğrulanan, sorun olmayanlar
- Davet kabulü: silinmiş kiracının daveti `revoked` dönüyor (`accept.ts:85`) ve oturum yerinde kalıyor (J4).
- `session.update` / [A9]: silinmiş kiracı istenince bağ taşınmıyor (J3 ve cs-fb O1_A9). Canlı kiracıya açık istekle geçiş çalışıyor (J3 `moved`).
- Platform admin: kiracı düşüyor, admin bayrağı DB'den okunmaya devam ediyor (J1).
- Faturalama portalı (`api/billing/portal`) oturum kiracısını kullanıyor, dolayısıyla jwt filtresini miras alıyor.
- `Tenant` tablosunda RLS kapalı olduğu için kapsam dışı JOIN çalışıyor. İleride RLS eklenirse sonuç fail-closed olur (cs-fb'nin yorumu yerinde).

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUO3BUQY9739B-be-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUO3BUQY9739B-be-fb-ekler/`: `probe-out.txt`, `review-o3bu.live.test.ts.txt`, `sql-plain.txt`, `sql-deleted.txt`, `explain.txt`, `mutants-rv86.py.txt`, `mutants-rv86-out.txt`, `mutants-rv86-live-out.txt`, `gates.txt`, `vitest-summary.txt`. Sır taraması (`[0-9a-f]{64}|sk-…|AUTH_SECRET=`) boş çıktı.
- Uygulama kodu değişmedi.

## 5. Riskler
- Y-1 kapanana kadar silinmiş bir kiracı Partner REST API'si ve partner portalı üzerinden okunabilir (portalda yazılabilir) durumda.
- P1/P2 route ve action fonksiyonları süreç içinde çağrılarak denendi, gerçek bir HTTP sunucusu üzerinden değil. Kod yolu aynı (`authenticateApiKey` → `withTenant`), ama ağ katmanı (middleware) bu probda yok.

## 6. Açık sorular
- Y-1 ve Ö-1 için ayrı bir kart açılsın mı? Önerim: evet, tek kart ("oturumsuz kiracı yolları silinmiş kiracıyı reddeder" ve canlı testler).
- Kiracı silme ve geri alma bir ürün özelliği olacak mı (Ö-4)? Bu bir ürün kararı.

## 7. Sonraki adım
- Lider: `6a5c3c62` ONAY'lı, push kararı liderde. Y-1 kartını açmak lidere kalıyor.
- İzole konteyner `befb-o3bu-pg` ve worktree iş sonunda kaldırıldı.
