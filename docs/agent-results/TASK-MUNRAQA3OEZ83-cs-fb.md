# TASK-MUNRAQA3OEZ83 — cs-fb — signDocument: çift onay gerektiren türlerde doğrudan imza kapalı (İNCELEME-59 Y-4, Ö-5)

**Durum:** TAMAM
**Dal:** `cs-fb/munraq-sign` (dev fbce5bd6'dan), dev'e `--no-ff` ile merge edildi, push yok.
**Kod commit'i:** `5edc43d5`
**İzole DB:** kendi konteynerim `csfb-sign-pg` (127.0.0.1:5497, veritabanı `csfb_sign`). Paylaşılan `fabrika` DB'sine yazmadım. İş bitince konteyneri kaldırdım (§2.6).
**Platform beyanı:** Doğrulamayı mac'te yaptım (Darwin 27, Node, vitest 4.1.11, `pgvector/pgvector:pg16` konteyneri). Değişen kod platforma bağlı değil: sunucu tarafında tür/aşama karşılaştırması, Prisma sorgusu, i18n JSON ve istemcide sonuç okuma. Dosya yolu, süreç ya da kabuk kullanmıyor. Bu yüzden Windows ve Linux'ta aynı davranışı beklerim. İkisinde de koşmadım, çünkü bu makinede yalnız mac var. CI (ubuntu) ilk push'ta Linux'u koşacak.

## 1. Ne yapıldı

Patron kararı (30.09): çift onay gerektiren belge türlerinde doğrudan imza KAPALI.

1. **Tek kaynak: `src/lib/rbac.ts`**
   - `DUAL_APPROVAL_DOCUMENT_KINDS = ['NDA', 'LOI', 'COMMITMENT']` eklendi.
   - `documentKindRequiresDualApproval(kind)` eklendi. Liste başka hiçbir yere kopyalanmadı: aksiyon ve canlı test bu dosyadan import ediyor.
   - Tür listesi, İNCELEME-59 §5 madde 5'teki öneriyle birebir aynı (NDA/LOI/COMMITMENT). `AWARD_PACK` ve `ESR_DEBRIEF` listede değil; bkz. §5.
2. **`src/modules/m10/server/actions.ts` `signDocument`**
   - Belge `(id, tenantId)` ile, aynı `withTenant` transaction'ı içinde okunuyor.
   - Tür çift onay gerektiriyorsa akış durumu `deriveDualApprovalState` ile hesaplanıyor. Bu, `departmentApproveAction`'ın ve banner'ın kullandığı fonksiyonun aynısı. Aşama `APPROVED_AND_SIGNED` değilse sonuç `{ success:false, signedAt:null, refusal:'DUAL_APPROVAL_REQUIRED' }` oluyor ve **DB'ye yazılmıyor**.
   - Akış tamamsa imza geçiyor. Hukuk adımı `signedAt`'i zaten yazmıştı; o zaman damgası **korunuyor**, üzerine yazılmıyor. Böylece imza zamanı hukuk onayının anı olarak kalıyor.
   - Çift onay gerektirmeyen türler bugünkü gibi imzalanıyor (`signedAt = now`).
   - Yazma `where: { id, tenantId, version }` ile yapılıyor. `version`, okunan revizyonu sabitliyor: arada `createNewVersion` koşarsa onay adımları silinir ve sürüm artar. Bu durumda eski onaylarla imza atılmaz; sonuç `DOC_NOT_FOUND` olur.
   - Dönüş tipi artık açık: `SignDocumentResult` / `SignDocumentRefusal`.
3. **Ö-5:** `success:false` her yolda `signedAt: null` dönüyor: boş id, başka kiracının id'si ve çift onay reddi.
4. **Arayüz:** `documents/client.tsx` `handleSignDoc` eskiden aksiyonun sonucuna bakmadan satırı "imzalandı" gösteriyordu. Artık sonucu okuyor. Ret durumunda `m10.signRefusal.<kod>` metnini mevcut `docError` alanında gösteriyor. Başarıda sunucunun döndüğü `signedAt`'i kullanıyor.
   - i18n: `m10.signRefusal.DUAL_APPROVAL_REQUIRED` ve `m10.signRefusal.DOC_NOT_FOUND` anahtarları TR ve EN'de eklendi.
5. **Testler**
   - Yeni: `tests/m10-sign-dual-approval.live.test.ts` (7 test). Canlı ve izole DB'de koşuyor. Yalnız `auth()` sahte; rol kapısı, pilot kapısı, `withTenant`, Prisma ve aksiyon gövdeleri gerçek. Her ret satır anlık görüntüsüyle karşılaştırılıyor. Teardown kiracıları tek id ile siliyor (`requireId`).
   - Güncellenen: `tests/modules/m10.test.ts`. Eski birim testi "NDA doğrudan imzalanır" davranışını sabitliyordu; bu tam olarak kapatılan açık. Test ESR_DEBRIEF'e çevrildi, ayrıca NDA reddi ve Ö-5 için birim testleri eklendi.
   - Güncellenen: `tests/action-missing-id.live.test.ts`. Fixture belgesi NDA idi. Bu test "gerçek id tek satırı değiştirir" iddiasını ölçüyor, bu yüzden doğrudan imzalanabilen `ESR_DEBRIEF`'e çevrildi (yorumla).
   - Güncellenen: `tests/where-guard-src.test.ts` KNOWN listesine `version: existing.version` eklendi. Gerekçe: bir satır yukarıda okunan non-null Int kolon; bu, mevcut `DB_ROW` kalıbıyla aynı.

**DOKUNULMADI:** KARAR 4/8 (`updateNoteStatus`, partner linki) ve JWT Y-2.

## 2. Kanıt

### 2.1 İzole DB kurulumu (CI "Prepare database" ile aynı adımlar)
`migrate diff --from-empty` çıktısı konteyner psql'ine verildi. Ardından `db:rls-role`, `apply-migrations.sh` ×2, `db:rls` ve `db:seed` koşuldu:
```
apply-migrations: 38 files applied
apply-migrations: 38 files applied
✅ prisma/rls.sql applied. Policies in public: 28 → 112
Seeding completed with E10 data.
```

### 2.2 Canlı test, `csfb_sign` (`npx vitest run tests/m10-sign-dual-approval.live.test.ts --reporter=verbose`)
```
✓ WRITER cannot sign a NDA that never entered the flow; the row is unchanged
✓ WRITER cannot sign a LOI that never entered the flow; the row is unchanged
✓ WRITER cannot sign a COMMITMENT that never entered the flow; the row is unchanged
✓ WRITER cannot sign an NDA whose flow stopped after finance; the row is unchanged
✓ once the flow is APPROVED_AND_SIGNED the signature goes through and keeps the flow timestamp
✓ a kind without dual approval (ESR_DEBRIEF) is signed directly, as before
✓ a refusal carries no timestamp (Ö-5): another tenant's doc id is not found and not signed
Tests  7 passed (7)
```
Teardown sonrası kalan fixture kiracısı: `select count(*) from "Tenant" where slug like 'm10sign-%'` → `0`.

se-fb'nin i59 eki (`sefb_i59` → `csfb_sign`, geçici kopya, commit'lenmedi) `-t "H6|H1|H3"` ile koşuldu: `Tests 3 passed | 4 skipped`. H1 (MEMBER `signDocument` → `FORBIDDEN_ROLE`, satır değişmedi) ve H3 (çapraz kiracı `docB.signedAt` null) yeni kodla da yeşil. H6'daki senaryo (WRITER, akışa girmemiş NDA'yı imzalıyor) artık yukarıdaki ilk testte assert'li olarak reddediliyor.

### 2.3 Mutasyon (her biri geri alındı; `actions.ts` orijinaline döndü)
| # | Mutasyon | Sonuç |
|---|---|---|
| M1 | Çift onay kontrolü kaldırıldı (`if (false && documentKindRequiresDualApproval…)`) | **5 kırmızı**: NDA/LOI/COMMITMENT akışsız, finans-sonrası NDA ve "akış zaman damgası korunur" |
| M2 | Aşama kontrolü gevşetildi (`!== 'APPROVED_AND_SIGNED'` → `=== 'REJECTED'`) | **4 kırmızı** (ret testlerinin tümü) |
| M3 | Ö-5 geri getirildi (retle birlikte `signedAt: new Date()`) | **1 kırmızı** (Ö-5 testi) |
| M4 | Akış zaman damgası korunmuyor | **1 kırmızı** |

### 2.4 Kapılar
```
pnpm lint       → LINT=0
pnpm typecheck  → TC=0 (tsc --noEmit)
pnpm i18n:check → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```

### 2.5 Tam koşum: `CI=true pnpm test`, `AUTH_SECRET='ci-vitest-auth-secret-fixture-not-for-any-deployment'` (ci.yml Test adımı), DB `csfb_sign`
- **1. koşum:** `Tests 12 failed | 3096 passed`. Bunların 3'ü benim değişikliğimden geliyordu ve düzeltildi:
  - `where-guard-src`: `version: existing.version` → KNOWN listesine eklendi.
  - `tests/modules/m10.test.ts`: NDA'nın doğrudan imzalanmasını bekliyordu → güncellendi.
  - `action-missing-id.live`: NDA fixture'ı → `ESR_DEBRIEF`.

  Kalan 9 kırmızı yük kaynaklı: 5000 ms zaman aşımları, yük altında `public-lead`/`stripe-webhook` "Postgres unreachable" ve pdf.js `parse_too_heavy` CPU bütçesi.
- **2. koşum (düzeltmelerden sonra):**
  ```
  Test Files  3 failed | 254 passed | 2 skipped (259)
        Tests  3 failed | 3127 passed | 9 skipped (3139)
  FAIL rag-pdf-worker-isolation … PdfLimitError: PDF refused (parse_too_heavy)
  FAIL stale-relationship-reminder.live … Test timed out in 5000ms.
  FAIL withholding-rounding … Test timed out in 5000ms.
  ```
  O sırada makinenin yük ortalaması: `load averages: 35.82 41.53 35.19`.
- **Yük kaynaklı kırmızılar tek başına koşuldu** (`CI=true`, aynı DB). Koşulan dosyalar: rag-pdf-worker-isolation, stale-relationship-reminder.live, withholding-rounding, k3-topic-stats-parse, pilot-expired-write-paths ve invoice-writer. Sonuç: `Test Files 6 passed (6)`, `Tests 122 passed (122)`. public-lead, stripe-webhook-idempotency-rls, action-missing-id ve stale-reminder dosyaları ayrıca birlikte koşuldu: `Tests 71 passed (71)`. Bu dosyaların hiçbiri M10 imza yoluna dokunmuyor.

### 2.6 İzole konteynerin kaldırılması
Çıktı §7'de.

## 3. Değişen dosyalar
- `src/lib/rbac.ts`: `DUAL_APPROVAL_DOCUMENT_KINDS`, `documentKindRequiresDualApproval`
- `src/modules/m10/server/actions.ts`: `signDocument`, `SignDocumentResult`, `SignDocumentRefusal`
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/client.tsx`: `handleSignDoc` sonucu okuyor
- `messages/tr.json`, `messages/en.json`: `m10.signRefusal.*`
- `tests/m10-sign-dual-approval.live.test.ts` (yeni)
- `tests/modules/m10.test.ts`, `tests/action-missing-id.live.test.ts`, `tests/where-guard-src.test.ts`
- `docs/agent-results/TASK-MUNRAQA3OEZ83-cs-fb.md`

## 4. Riskler
- **Arayüz:** İmza düğmesi NDA/LOI/COMMITMENT için hâlâ görünüyor. Tıklanınca artık açık bir TR/EN mesajı çıkıyor ("…çift onay akışıyla imzalanır. Onaya gönderin."). Düğmeyi bu türlerde gizlemek daha iyi olurdu. Bunu yapmadım, çünkü `rbac.ts` `@prisma/client` import ediyor ve istemci paketine çekilmesi ayrı bir karar. Sonraki adım olarak öneriyorum.
- **Gerçek tarayıcı tıklaması koşulmadı.** Sunucu mantığı canlı DB'de uçtan uca doğrulandı. İstemci değişikliği küçük (sonucu okuyup mesaj gösteriyor); typecheck, lint ve i18n (anahtar çözümü) temiz. Uygulamayı giriş yapılmış bir kiracıyla ayağa kaldırmadım, çünkü makinenin yük ortalaması 35–41 idi. Bu, raporun açık bir boşluğu.
- **Mevcut veri:** Canlı ortamda çift onaysız imzalanmış NDA/LOI/COMMITMENT satırları varsa bu değişiklik onlara dokunmuyor. Geçmiş imzalar olduğu gibi kalıyor.
- **Davranış değişikliği (bilinçli):** Akış tamamlanmış belgede `signDocument` artık `signedAt`'i yenilemiyor, hukuk onayının zamanını koruyor.

## 5. Açık sorular (patron / ürün sahibi)
1. **`AWARD_PACK`** (TÜBİTAK ödül paketi) çift onay gerektirmeli mi? `dual-approval.ts` başlık yorumu "TÜBİTAK Award Packs"ı çift onay kapsamında sayıyor, İNCELEME-59 önerisi ise yalnız NDA/LOI/COMMITMENT diyor. Ben öneriye uydum. Eklemek tek satır (`DUAL_APPROVAL_DOCUMENT_KINDS`).
2. İmza düğmesi çift onaylı türlerde gizlensin mi? (§4)

## 6. Sonraki adım
- se-fb: Y-4 / Ö-5 için yeniden inceleme. `tests/m10-sign-dual-approval.live.test.ts` herhangi bir izole DB'de aynen koşulabilir.
- Push ve CI (ubuntu) patronun onayıyla.

## 7. İzole DB temizliği
`docker rm -f csfb-sign-pg` (yalnız benim konteynerim):
```
csfb-sign-pg
--- docker ps -a | grep csfb-sign-pg:
0
```
`docker rm -f`, imajın anonim veri volume'unu bırakır. Benim volume'um `75ff14d6…` (07:02:19Z, konteynerle aynı dakika) idi. Silmeden önce doğruladım: salt-okunur bağlandı ve `global/1262` (`pg_database`) içinde `csfb_sign` geçiyor. Yalnız bu tek volume silindi:
```
$ docker volume rm 75ff14d6efd17e8a692c65386c956dcd05d7cd97301756d776b5628e4c5c0393
75ff14d6efd17e8a692c65386c956dcd05d7cd97301756d776b5628e4c5c0393
$ docker volume ls -q | grep -c 75ff14d6
0
```
Diğer sahipsiz volume'lar (05:59–06:47Z) benim değil, dokunmadım.

## Not: görev sarmalayıcısındaki yol çelişkisi
Sarmalayıcı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUNOE0Q4FR2J-se-fb.md` yoluna yazmamı istiyordu. O dosya İNCELENEN görevin, se-fb'nin raporudur ve üstelik repo dışındadır. Üzerine yazmadım. Görev gövdesindeki SONUÇ DOSYASI yoluna (bu dosya) yazdım.
