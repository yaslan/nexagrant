# TASK-MUOBNYACFPLPF — fe-fb — İNCELEME-100 Y-1: admin CORDIS importer iç hata metni eylem dönüşüne sızıyor

**Durum:** TAMAM
**Dal:** `fe-fb/muobny-cordis-leak` (dev `3e6e62f4`'ten). Ayrı worktree, izole DB `fefbny-pg` (pgvector pg16, 127.0.0.1:55777). DB CI sırasıyla kuruldu: push → rls-role → migrations ×2 → rls → seed. Paylaşılan `fabrika` :5433'e hiçbir şey yazılmadı; her koşudan önce `DATABASE_URL=postgresql://fabrika:***@localhost:55777/fabrika` doğrulandı.
**Kod commit'i:** `8ca11f55`
**Ekler:** `docs/agent-results/TASK-MUOBNYACFPLPF-fe-fb-ekler/`
**Bekçi:** `tests/api/action-leak-scan.ts` ve testine dokunulmadı; bekçi genişletmesi cs-fb'de (TASK-MUOBO31H8EPR5).

## 1. Ne yapıldı
1. **Servis katmanı (`src/lib/k2-cordis/importer.ts`):** `CordisImportResult.error?: string` kaldırıldı, yerine `errorCode?: CordisImportFailureCode` geldi. Kodlar sabit bir listeden geliyor: `SKIP_LIMIT_EXCEEDED` ve `IMPORT_FAILED`.
   - Atlama bütçesi aşımı artık özel bir `CordisSkipLimitError` fırlatıyor; catch bloğu kodu bu sınıftan seçiyor.
   - Ham metin yalnız üç yerde kalıyor: `logger.error('[k2-cordis] import failed', error, {runId, dataset, errorCode})`, `CordisImportRun.error` ve `recordAlert` meta'sı.
2. **Kod listesi (`src/lib/k2-cordis/failure-codes.ts`, yeni):** Liste ve `cordisImportFailureCode()` whitelist'i bağımlılıksız bir modülde. Böylece istemci de okuyabiliyor; importer Prisma ve fs çektiği için istemci onu içe aktaramaz. Desen `admin/billing/plans/failure-codes.ts` ile aynı.
3. **Eylem (`admin/cordis/actions.ts`):**
   - `handleRunCordisImportAction` yalnız `{ success:false, errorCode }` döndürüyor ve kod whitelist'ten geçiyor. İkinci katman bu: servis bir gün metni kod alanına koysa bile eylem onu `IMPORT_FAILED`'e çeviriyor (mutant M2a bunu kanıtlıyor).
   - **İkinci sızıntı yolu da kapatıldı:** `handleGetK2Status`, DB'de saklanan ham metni `lastRun.error` olarak döndürüyordu (aynı metin, DB üzerinden). İstemci bu alanı hiç göstermiyordu ama değer RSC yüküyle tarayıcıya gidiyordu. Alan döndürülmüyor.
4. **UI (`admin/cordis/client.tsx`):** Sabit metin `İçe Aktarım Hatası: {importResult.error}` yerine artık `t('adminCordis.importErrors.<kod>')` kullanılıyor, `role="alert"` ile. Eylem fırlatırsa (ağ ya da sunucu digest'i) `errorMessage(err)` artık basılmıyor; `IMPORT_FAILED` gösteriliyor ve ayrıntı console'a gidiyor. Yeni anahtarlar `messages/{tr,en}.json` › `adminCordis.importErrors.{SKIP_LIMIT_EXCEEDED, IMPORT_FAILED}`.
5. **Diğer tüketiciler:** Route (`/api/admin/cordis/import`) zaten sabit gövde dönüyordu, artık log'a kodu yazıyor (ayrıntı importer'ın kendi log satırında). CLI (`scripts/cordis-import.ts`) `kod (run <id>)` basıyor; neden hemen üstteki `[k2-cordis] import failed` satırında.
6. **Testler:**
   - `tests/cordis-csv.test.ts` içine gerçek importer ile gerçek eylemi uçtan uca koşan 3 test eklendi (yalnız Prisma, fetch ve komşu servisler mock):
     - indirme hatası → `{success:false, errorCode:'IMPORT_FAILED'}`, metin yok, metin run satırında;
     - bütçe aşımı → `SKIP_LIMIT_EXCEEDED`, CSV satırı yok;
     - `handleGetK2Status` saklı metni döndürmüyor.
   - Mevcut 2 importer testi, ayrıntıyı olması gereken yerde (run satırında) doğrulayacak biçimde güncellendi; gevşetilmedi, `JSON.stringify(res)` içinde "line 4" olmadığı ayrıca kontrol ediliyor.
   - `admin-cordis-import-500` ve `cordis-import` testleri yeni sözleşmeye uyarlandı.
7. **Tüm eylemlerde "servis catch → eylem dönüşü" taraması:** §2.3'te.

## 2. Kanıt

### 2.1 Canlı, önce/sonra (be-fb'nin Y-1 örneği tekrarlandı): `ekler/live-out.txt`
Kurulum: iki prod `next build` + `next start` koşuldu, önce (dev `4d7b5308`, düzeltmesiz) :47702'de, sonra (dal) :47701'de, ikisi de izole DB'ye bağlı. İndirmeyi düşürmek için sunucu `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9` ile başlatıldı (kapalı port), böylece CORDIS indirmesi gerçekten başarısız oluyor. Çağrı gerçek bir server-action POST (`Next-Action` + JSON gövde), çerez `next-auth/jwt encode()` ile `demo-user-superadmin` için üretildi. `handleGetK2Status` için son koşu satırına `relation "CordisProject" does not exist at /srv/secret/cordis.zip` yazıldı.
```
[ONCE(dev)] handleRunCordisImportAction → HTTP 200 {"success":false,"error":"fetch failed"} | iç metin: fetch failed
[ONCE(dev)]   DB'deki son koşu: FAILED | fetch failed
[ONCE(dev)] handleGetK2Status → HTTP 200 iç metin: CordisProject
[ONCE(dev)] GET /tr/admin/cordis (SSR+RSC) → 169733 bayt, iç metin: CordisProject, "Son Çalıştırma" var: true
[SONRA(dal)] handleRunCordisImportAction → HTTP 200 {"success":false,"errorCode":"IMPORT_FAILED"} | iç metin: YOK
[SONRA(dal)]   DB'deki son koşu: FAILED | fetch failed
[SONRA(dal)] handleGetK2Status → HTTP 200 iç metin: YOK
[SONRA(dal)] GET /tr/admin/cordis (SSR+RSC) → 169967 bayt, iç metin: YOK, "Son Çalıştırma" var: true
```
Ayrıntı sunucu log'unda duruyor (`ekler/server-log-detay.txt`): `[ERROR] [k2-cordis] import failed [TypeError: fetch failed] { [cause]: Error: connect ECONNREFUSED 127.0.0.1:9`.

### 2.2 UI mesajı tr/en
- **Gerçek tıklama (tr):** dal üzerinde `next dev` :47703 açıldı. İç tarayıcıda "Platform Yöneticisi" demo girişi → `/tr/admin/cordis` → "Şimdi Çalıştır" tıklandı. `[role="alert"]` okundu: **"İçe aktarım hatası: içe aktarım tamamlanamadı. Ayrıntı son çalıştırma kaydında ve sistem uyarılarında."**
- **Ekran görüntüsü alınamadı:** iç tarayıcı paylaşımlı. Ekran görüntüsü ve sonraki `readPage` başka bir sekmeyi (login/landing) döndürdü; tarayıcıyı başka bir pane kullanıyordu. Bu yüzden görsel kare YOK, kanıt DOM okuması. Sadece bir `<span>` içeriği değişti; düzen ya da sınıf değişikliği yok.
- **en:** prod :47701'de admin çerezle `/en/admin/cordis` ve `/tr/admin/cordis` çekildi. Her sayfa istemci sağlayıcısına kendi dilindeki metni taşıyor:
  - en: "Import failed: the import could not finish. Details are in the run record and in system alerts."
  - tr: "İçe aktarım hatası: içe aktarım tamamlanamadı. …"

### 2.3 Tüm eylemlerde "servis catch → eylem dönüşü" taraması
Üç ayrı geçiş yapıldı (betikler ve çıktılar `ekler/scan*`, `ret*`):
- **A:** Bekçinin kendi `actionReturnLeaks` analizcisi eylem olmayan tüm src modüllerinde koşuldu, eylem dosyalarından import grafiği (≤4 atlama) ile kesiştirildi.
- **B:** 36/37 eylem dosyasında, içe aktarılan bir servisin çağrısını doğrudan döndüren (`return svc()`) ya da `.error/.reason/.message` alanını ileten satırlar tarandı.
- **C:** `const r = await svc(); … return r | {...r} | { r }` biçimleri tarandı.

| Eylem → servis | Servis dönüşü | Karar |
|---|---|---|
| admin/cordis `handleRunCordisImportAction` → `runCordisImport` | catch'te `errorMessage(error)` | **SIZINTI → düzeltildi** (kod + whitelist + i18n) |
| admin/cordis `handleGetK2Status` → `prisma.cordisImportRun.error` | importer'ın saklı ham metni | **SIZINTI → düzeltildi** (alan döndürülmüyor) |
| `k2-cordis/raw-fetch.ts:74` `reason: error.message` | importer, k3 importer ve k2 job yalnız `.status` okuyor | Eyleme ulaşmıyor, dokunulmadı |
| `lib/tenant.ts` 195/215/300/314 (30 eylem import ediyor) | sabit Türkçe cümle + kod; yalnız `*Api` route yardımcıları | Yanlış pozitif |
| `lib/oauth-registration.ts:237` (35 eyleme dolaylı) | `boolean` | Yanlış pozitif |
| evidence 83/237/303 → `evidenceUploadType`, `copyIncomingObject` (`storeFailure`) | `EvidenceUploadRefusal \| 'object_missing' \| 'storage_unavailable'` birliği | Güvenli (tipli kod) |
| ajans/cobrand 35 → `sanitizeLogoPng` | `LogoRejection` kodu | Güvenli |
| pipeline 809 → `nextApplicationStatus` | `refused: 'WITHDRAWN' \| 'ALREADY_DECIDED' \| 'NOT_SUBMITTED'` | Güvenli |
| fon-hazirlik → `submitPublicLead` | catch → `{ error: 'server' }`, log'a yalnız ad | Güvenli |
| admin/cordis sync/delta/metrics/logs | catch metni yalnız `recordAlert`'e; dönüşte sayılar, logs `error` sütununu `select` etmiyor | Güvenli (be-fb'nin not ettiği alarm metni artık dönmüyor) |
| consortium `detectConflicts`/`scoreCandidatesForSeat`, approvals `dual-approval`, plans `plan-repository`, m6/m8, rag `retrieveChunks`, pipeline `getWorkspaceMembers` | catch yok ya da catch `throw` ediyor; dönüş veri | Güvenli |
| accept-invite 83 | `t('errors.' + outcome.reason)` | Güvenli (i18n) |

Sonuç: bugünkü ağaçta servis katmanından eyleme metin taşıyan tek yer CORDIS'ti, iki yolu vardı (dönüş ve DB). İkisi de kapatıldı.
Not: analizci düzeltilmiş importer'ı hâlâ işaretliyor (`importer.ts` 333…710), çünkü `errorCode` değeri `error instanceof …` koşulundan türüyor ve analizci bunu kirli sayıyor. Dosya eylem olmadığı için bekçi bugün koşmuyor. cs-fb bekçiyi modüller arası genişletirse burada bir yanlış pozitif görecek: iki sabit dizgiden birini seçen koşul ifadesi. Bu bilgiyi cs-fb'ye bırakıyorum.

### 2.4 Mutantlar (`ekler/mutants-out.txt`)
Her mutant commit `8ca11f55` üzerinde uygulandı ve `git checkout HEAD --` ile geri alındı; son `git status` temiz. Koşu: `tests/cordis-csv.test.ts` + `tests/api/admin-cordis-import-500.test.ts`.

| Mutant | Sonuç |
|---|---|
| M0 değişiklik yok | 11/11 yeşil |
| M1 importer + eylem dev'e (düzeltme tamamen geri) | **5 kırmızı** |
| M1b yalnız eylem dev'e | **3 kırmızı** |
| M2a importer kod alanına ham metni koyar | **3 kırmızı**; indirme testi yeşil kalıyor, çünkü eylem whitelist'i metni `IMPORT_FAILED` yaptı (savunma katmanı kanıtı) |
| M2b M2a + eylemde whitelist yok | **4 kırmızı** |
| M3 `handleGetK2Status` `error: lastRun.error` geri | **1 kırmızı** |
| M4 sınıflandırma hep `IMPORT_FAILED` | **3 kırmızı** |

(İlk mutant koşusu geçersizdi: `git checkout dev -- f` dosyayı index'e yazdığı için sonraki `git checkout -- f` dev sürümüne dönüyordu. Tekrar `git checkout HEAD --` ile koşuldu; yukarıdaki tablo o koşu.)

### 2.5 Kapılar (`ekler/gates.txt`, `ekler/vitest-summary.txt`), dal HEAD `8ca11f55`, izole DB
```
GATE tsc=0
GATE lint=0
GATE i18n=0
GATE build=0          (env -u NODE_ENV pnpm build, worktree'de pnpm install)
 Test Files  297 passed | 2 skipped (299)
      Tests  3832 passed | 50 skipped (3882)
GATE vitest=0         (CI=true npx vitest run, tam süit)
```

## 3. Değişen dosyalar
- `src/lib/k2-cordis/failure-codes.ts` (yeni)
- `src/lib/k2-cordis/importer.ts`
- `src/app/[locale]/admin/cordis/actions.ts`
- `src/app/[locale]/admin/cordis/client.tsx`
- `src/app/api/admin/cordis/import/route.ts`
- `scripts/cordis-import.ts`
- `messages/tr.json`, `messages/en.json` (`adminCordis.importErrors.*`)
- `tests/cordis-csv.test.ts`, `tests/api/admin-cordis-import-500.test.ts`, `tests/cordis-import.test.ts`
- `docs/agent-results/TASK-MUOBNYACFPLPF-fe-fb.md` + `-ekler/`

## 4. Riskler
- **CLI kullanıcısı:** `scripts/cordis-import.ts` artık kodu basıyor. Neden aynı süreçte, bir satır yukarıda (`[k2-cordis] import failed …`) duruyor; bilgi kaybı yok, yalnız yer değişti.
- **`CordisImportResult.error` kaldırıldı:** tüketicilerin tamamı tsc ile bulunup güncellendi (eylem, route, CLI, 3 test). Repo dışında tüketici yok.
- **İstemci `lastRun.error` alanı** tipten de çıkarıldı. Admin artık panelde neden göremiyor (zaten hiç render edilmiyordu). Neden `/admin/alerts` ve run satırında.

## 5. Açık sorular
- Admin panelinin kalanı sabit Türkçe metin (bu kartın kapsamı dışında; ratchet baseline'ı zaten sayıyor). Yalnız hata mesajı i18n'e alındı.
- cs-fb (TASK-MUOBO31H8EPR5): modüller arası bekçi importer'da §2.3'teki koşullu-sabit yanlış pozitifini verebilir.

## 6. Sonraki adım
- Dal dev'e merge edildi (push YOK). İnceleme için: `git show 8ca11f55`.

**Platform beyanı:** Doğrulama **macOS**'ta yapıldı (Darwin 27, Node 26.5, prod `next start` ve `next dev`, izole Docker Postgres). Değişen kod platforma bağlı değil: süreç, yol, kabuk ya da kısayol yok. Sabit dizgi kodları, i18n anahtarları ve bir `instanceof` kontrolü var. Windows ve Linux'ta aynı davranmalı. **Windows koşulamadı** (makine yok); **Linux** yalnız CI'da koşacak, yerelde koşulmadı. Canlı testteki `NODE_USE_ENV_PROXY` hilesi yalnız test aracıydı, ürün kodunda yok.
