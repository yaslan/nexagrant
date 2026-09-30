# TASK-MUNSGZ4K6M5KL — crw-fb — İNCELEME-65: signDocument dual approval gate (TASK-MUNRAQA3OEZ83)

**Durum:** TAMAM
**Karar:** **DÜZELTME GEREKLİ.** 1 bulgu bloke ediyor (B-1), 1 önemli bulgu (Y-1), 2 test boşluğu (D-1, D-2) ve 2 öneri (Ö-1, Ö-2) var.
**İncelenen:** kod `5edc43d5` (cs-fb), dev merge `13b7d41f`. İnceleme dev HEAD `02231b33` üzerinde, ayrı bir worktree'de yapıldı. İncelenen dosyalar merge'den bu yana değişmedi: `git log 13b7d41f..02231b33 -- src/modules/m10 src/lib/rbac.ts src/lib/dual-approval.ts documents/` boş.
**İzole ortam:**
- DB: kendi konteynerim `crwfb65-pg` (`pgvector/pgvector:pg16`, 127.0.0.1:5465). Hazırlık CI "Prepare database" adımlarıyla aynı.
- Sunucu: aynı worktree'nin `next build` + `next start` çıktısı, :3065.
- Paylaşılan fabrika-postgres :5433'e yazmadım. Kod değiştirmedim.

**Platform beyanı:** Doğrulamayı mac'te yaptım (Darwin 27, Node 26.5, vitest 4.1.11, Next 16.3.4). İncelenen kod platforma bağlı değil: sunucuda string karşılaştırması, Prisma sorgusu, i18n JSON ve React state. Dosya yolu, süreç veya kabuk kullanmıyor. Bu yüzden Windows ve Linux'ta da aynı davranmalı. B-1 de platformdan bağımsız, çünkü `'NDA '` ile `'NDA'` her yerde farklı string. Windows ve Linux'ta koşmadım, çünkü bu makinede yalnız mac var. CI (ubuntu) push'ta Linux'u koşar.

---

## 1. Bulgular (önem sırasına göre)

### B-1 (BLOKE EDER): Tür kapısı serbest metin bir kolonda birebir eşleşmeye bakıyor. `"NDA "`, `"nda"` ve `"loi"` çift onaysız imzalanıyor.
- **Yer:**
  - `src/lib/rbac.ts:113-117`: `DUAL_APPROVAL_DOCUMENT_KINDS.includes(kind)` birebir eşleşme arıyor.
  - `src/modules/m10/server/actions.ts:46-49,148-152`: `generateStandardDoc(opportunityId, kind: … | string)`, `kind`'ı hiç doğrulamadan `FollowupDoc.kind`'a yazıyor.
  - `prisma/schema.prisma:1401`: `kind String`. Enum da CHECK constraint de yok.
- **Senaryo:** WRITER (`edit_proposal`), `generateStandardDoc`'un Next-Action'ını elle POST ediyor. Argüman `kind = "NDA "`, `"nda"`, `"Nda"`, `" NDA"`, `"loi"`, `"Commitment"` ya da `"NDA​"` olabilir. LLM bu türden gerçek bir NDA metni üretiyor. Ardından `signDocument(id)` çağrılıyor → `{ success: true }`, `signedAt` yazılıyor, `DualApprovalStep` sayısı 0. Kapatılmak istenen Y-4 açığı (WRITER'ın finans ve hukuk görmeden NDA imzalaması) aynı aktörle geri geliyor.
- **Arayüzde daha kötü görünüyor:**
  - `docKindLabel` bilinmeyen türü ham hâliyle basıyor (`client.tsx:228-237`). Satır tabloda **"NDA — İmzalandı (30.09.2026)"** olarak görünüyor.
  - "Yasal Anlaşmalar (NDA / LOI)" filtresi `d.kind === 'NDA'` diye bakıyor (`client.tsx:222`). Bu yüzden sahte satır hukuk filtresinde **hiç görünmüyor**.
  - `.docx` ve PDF başlığı `${kind} - …`, yani "NDA  - …".
- **Kanıt:**
  - Canlı test (ek `crwfb65-attack.live.test.ts.txt`, A1). Gerçek olan: rol kapısı, `withTenant`, Prisma ve aksiyon gövdeleri. Sahte olan: yalnız `auth()`, modül kapısı ve LLM metni. **7/7 tür yazımı imzalandı:**
    ```
    A1 "nda"  stored kind="nda"  sign={"success":true,"signedAt":"2026-09-30T07:38:11.619Z"} … steps=0
    A1 "NDA " stored kind="NDA " sign={"success":true,"signedAt":"2026-09-30T07:38:11.644Z"} … steps=0
    A1 "loi" … success:true … steps=0     A1 "Commitment" … success:true … steps=0     A1 "NDA​" … success:true … steps=0
    Tests  7 failed | 6 passed (13)      ← 7 kırmızı = 7 atlatma (beklenen güvenli sonuç "reddedildi")
    ```
  - `next start` + ham HTTP Next-Action POST. `signDocument` action id'si `408e9d76…`, `.next/server/server-reference-manifest.json`'dan alındı. WRITER JWT çerezi kullanıldı:
    ```
    == nda  before: [NDA]||0          → 1:{"success":false,"signedAt":null,"refusal":"DUAL_APPROVAL_REQUIRED"}  HTTP=200  after: [NDA]||0
    == "NDA " before: [NDA ]||0       → 1:{"success":true,"signedAt":"$D2026-09-30T07:54:01.411Z"}            HTTP=200  after: [NDA ]|2026-09-30 07:54:01.411|  (steps 0, approvalSubmittedAt boş)
    == esr  → success:true (karşı-olgu: doğrudan tür imzalanıyor)
    == çerezsiz → E{"digest":"NEXT_REDIRECT;replace;/tr/giris;307;"}  after: [NDA]||0
    ```
    Tam log: `…/scratchpad/i65-http.log`. `"NDA "` satırını SQL ile açtım, çünkü sunucuda LLM anahtarı yok. `generateStandardDoc`'un aynı kind'ı olduğu gibi yazdığı A1'de ayrıca kanıtlı.
  - Tarayıcı: aynı tabloda `readPage` → `NDA  v1  30.09.2026  İmzalandı (30.09.2026)`. Ek: `i65-tr-narrow-spoofed-nda-signed.png`.
- **Önerilen düzeltme (en küçük, ikisi birlikte):**
  1. `generateStandardDoc` girişte `kind`'ı kapalı bir listeyle doğrulasın (`'NDA'|'LOI'|'COMMITMENT'|'ESR_DEBRIEF'|'AWARD_PACK'`). Doğrulama `assertModuleAccess`'ten hemen sonra, **LLM çağrısından ve kredi düşümünden önce** olmalı; listede olmayan tür reddedilsin. Tip imzasındaki `| string` de kalksın.
  2. `documentKindRequiresDualApproval` savunma katmanı olarak normalize etsin: NFKC, sıfır genişlikli karakterleri silme, `trim`, `toUpperCase`. Bu, tabloda zaten var olabilecek varyant satırları da kapsar. İsteğe bağlı: `FollowupDoc.kind` üzerine CHECK constraint. Önce canlıda `select distinct kind from "FollowupDoc"` ile varyant var mı bakılmalı.
  3. Regresyon testi: `generateStandardDoc(opp, 'NDA ')` reddedilir; tabloya doğrudan yazılmış `'nda'` satırında `signDocument` `DUAL_APPROVAL_REQUIRED` döner.

### Y-1 (önemli, bloke etmez): Ret mesajı sayfanın en üstünde çıkıyor, tıklanan satırdan görünmüyor
- **Yer:** `client.tsx:280-284`. `docError` bileşenin ilk çocuğu, düğme ise sayfanın altındaki tabloda (`client.tsx:612-620`).
- **Senaryo:** Dar ekranda kullanıcı NDA satırında "Elektronik İmzala"ya basıyor. Mesaj DOM'a geliyor ama ekranın dışında kalıyor. Kullanıcı hiçbir şey olmadı sanıyor ve tekrar basıyor. Ö-5'in amacı ("satırı imzalı göstermek yerine metin göster") yarım kalıyor: metin var ama görülmüyor.
- **Kanıt (AgentSpace iç tarayıcısı, gerçek tıklama, yaklaşık 370 px genişlik):**
  - `i65-tr-narrow-after-click-alert-offscreen.png`: tıklamadan hemen sonraki görüntü. Mesaj görünmüyor.
  - `i65-tr-narrow-alert.png`: yukarı kaydırınca mesaj orada.
  - `read p[role=alert]` TR sonucu: "Bu doküman hukuki bir taahhüt: doğrudan değil, çift onay akışıyla (önce finans, sonra hukuk) imzalanır. Onaya gönderin."
  - EN sonucu (`i65-en-narrow-alert.png`): "This document is a legal commitment: it is signed by the dual approval flow (finance, then legal), not directly. Send it for approval."
  - DB: `i65-ui-nda` → `signedAt` boş kaldı.
- **Masaüstü:** koşulamadı. İç tarayıcının pane genişliği sabit, viewport ayarı yok. Playwright koşumunu (390 + 1440, spec hazır) AgentSpace kill-guard'ı `[R8-canli-app-varken-acilis]` engelledi. Patron onay verdi ama guard `MURAT_LIVE_OK=1` önekini de kabul etmedi; guard'ı başka yoldan atlatmadım. Koddan çıkarım: uyarı yine en üstte ve tablo bir ekrandan daha aşağıda (banner, onay kutusu ve üretim kartları üstte). Bu yüzden masaüstünde de büyük olasılıkla görünmez. Ölçülmedi.
- **Öneri:** Mesajı satırın yanında göster ya da `scrollIntoView`/toast kullan. Daha iyisi Ö-2.

### D-1 (test boşluğu): Tür listesi boşaltılınca 3 test hata vermeden kayboluyor
- `tests/m10-sign-dual-approval.live.test.ts:84`, `test.each([...DUAL_APPROVAL_DOCUMENT_KINDS])` ile koşuyor. Yani test ettiği listeyi kodun kendisinden alıyor.
- M2 mutantında test sayısı **33 → 30** düştü; üç "akışa girmemiş NDA/LOI/COMMITMENT" testi hiç koşmadı. Mutant yine de öldü, ama yalnız sabit yazılmış finans-sonrası NDA testi ve birim testi sayesinde.
- **Öneri:** Listeyi testte sabit yaz (`['NDA','LOI','COMMITMENT']`) ya da `expect(DUAL_APPROVAL_DOCUMENT_KINDS).toEqual([...])` ekle.

### D-2 (test boşluğu): Revizyon sabitlemesinin (version pin) davranışsal testi yok
- M3 mutantında (`where`'den `version` kaldırıldı) cs-fb'nin canlı testlerinin **hepsi yeşil**. Mutantı yalnız birim testindeki `toHaveBeenCalledWith({ where: {…, version: 1} })` şekil kontrolü ve benim A2 yarış testim öldürdü.
- A2 gerçek bir araya girme durumunu kuruyor:
  1. Satır `FOR UPDATE` ile kilitleniyor.
  2. `signDocument` onaylı NDA'yı okuyup UPDATE'te bekliyor. `pg_stat_activity` kanıtı: `blocked sessions on FollowupDoc lock: 1`.
  3. Kilit sahibi `createNewVersion`'ın yazdıklarını commit'liyor.
  4. Doğru kodda sonuç `{"success":false,…,"refusal":"DOC_NOT_FOUND"}` ve `{"version":2,"signedAt":null,"approvalSteps":[]}`. M3 mutantında v2, eski onaylarla imzalanıyor (kırmızı).
- **Öneri:** A2'yi (ekteki dosya) canlı teste ekle.

### Ö-1 (öneri): Yarışta dönen ret kodu yanıltıcı
Sürüm değiştiğinde ret `DOC_NOT_FOUND` oluyor ve kullanıcı "Doküman bu çalışma alanında bulunamadı" görüyor. Oysa belge duruyor, yalnız yeni revizyonu var. `REVISION_CHANGED` gibi ayrı bir kod ve metin daha doğru olur.

### Ö-2 (öneri): Çift onaylı türlerde "Elektronik İmzala" düğmesi hiç gösterilmesin
cs-fb §4/§5'te zaten açık soru olarak yazdı. Bu hem Y-1'i hem gereksiz bir round-trip'i ortadan kaldırır. Tür listesini istemciye `@prisma/client` import etmeyen küçük bir modülden vermek yeterli.

## 2. Doğrulanan, sorun çıkmayan saldırılar
| # | Saldırı | Sonuç |
|---|---|---|
| A2 | Okuma ile yazma arasına yeni revizyon (gerçek kilit ile araya girme) | Reddedildi; v2 imzasız, adımlar silinmiş. Yukarıda D-2'ye bakın |
| A3 | Başka kiracının ESR_DEBRIEF belgesi (TENANT_OWNER oturumu) | `DOC_NOT_FOUND`, satır değişmedi |
| A4 | GUEST_PARTNER / MEMBER, doğrudan imzalanan türde bile | `ForbiddenRoleError: Forbidden: this role cannot edit_proposal.`, satır değişmedi |
| A5 | Akışa girmemiş NDA'ya eşzamanlı iki imza; onaylı LOI'ye eşzamanlı 5 imza | İkisi de reddedildi. 5'i de başarılı ve hukuk zaman damgası korundu (`[true,true,true,true,true]`, `signedAt` = hukuk anı) |
| A6 | Yalnız finans onaylı COMMITMENT'ı finans onaycısının doğrudan imzalaması | Reddedildi |
| HTTP | Çerezsiz Next-Action POST | `/tr/giris`'e 307 yönlendirme, satır değişmedi |
| HTTP | WRITER + düz `NDA` | `DUAL_APPROVAL_REQUIRED`, satır değişmedi |

Log satırları: `…/scratchpad/i65-attack-A2-6.log` (`--reporter=verbose`) `Tests 6 passed`.

## 3. Mutantlar (her biri `git checkout -- <dosya>` ile geri alındı; worktree temiz)
Koşulan: `tests/m10-sign-dual-approval.live.test.ts` + `tests/modules/m10.test.ts` + benim A2–A6'm.
| # | Mutasyon | Sonuç |
|---|---|---|
| M1 | Kapı terslendi (`if (!documentKindRequiresDualApproval…)`) | **Öldü:** 10 kırmızı (cs-fb 6 + birim 2 + benim 2) |
| M2 | Tür listesi boşaltıldı (`= []`) | **Öldü:** 5 kırmızı, ama 3 test kayboldu (33 → 30). Bkz. D-1 |
| M3 | Revizyon kontrolü kaldırıldı (`where`'den `version`) | **Öldü:** 2 kırmızı. Davranışsal olan yalnız benim A2'm; cs-fb'nin canlı testleri yeşil. Bkz. D-2 |

## 4. Kapılar
```
tam koşum: CI=true AUTH_SECRET=<ci fixture> npx vitest run --exclude <benim saldırı dosyam>  (DB crwfb65-pg)
  Test Files  5 failed | 253 passed | 2 skipped (260)
       Tests  5 failed | 3127 passed | 22 skipped (3154)
  - teardown-where-guard: "tests/zz-crwfb65-attack.live.test.ts:77 followupDocId: d.id"  ← BENİM izlenmeyen dosyam (guard repo ağacını tarıyor, --exclude'dan etkilenmiyor). Dosyayı çıkardım.
  - invoice-writer, withholding-rounding: Test timed out in 5000ms; rag-pdf-real-parse, rag-pdf-worker-isolation: CPU bütçesi — yük ortalaması 31–40.
yeniden koşum (5 dosya + m10 imza/birim/action-missing-id/where-guard-src): Test Files 9 passed (9), Tests 132 passed (132)
pnpm typecheck → TC=0   (saldırı dosyalarım worktree'den çıkarıldıktan sonra; içerideyken yalnız o dosyalar hata verdi)
pnpm lint      → LINT=0
pnpm i18n:check → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
pnpm build     → BUILD=0, "✓ Compiled successfully in 31.4s"
```
- Build log'da `instrumentation`'ın `process.exit`'i için Edge runtime uyarısı ("Ecmascript file had an error") var. Build'i durdurmuyor ve bu değişiklikle ilgisi yok.
- Yan not: İNCELEME-56 B-1'deki `stale-relationship-reminder` where-guard kırmızısı bu koşumda yoktu. dev'de düzeltilmiş görünüyor.

## 5. Değişen dosyalar
Kod değiştirmedim. Eklenenler:
- `docs/agent-results/TASK-MUNSGZ4K6M5KL-crw-fb.md` (bu dosya)
- `docs/agent-results/TASK-MUNSGZ4K6M5KL-crw-fb-ekler/`: 4 ekran görüntüsü ve `crwfb65-attack.live.test.ts.txt`. Bu, saldırı testinin kopyası; `tests/` altına `.ts` olarak koyulursa aynen koşar. B-1 düzeltmesinden sonra A1'in 7 satırı yeşile dönmeli.

## 6. Riskler / açık sorular
- **Mevcut veri:** Canlıda NDA/LOI/COMMITMENT'ın varyant yazımıyla, önceden imzalanmış satırlar olabilir. B-1 düzeltmesi bunları kendiliğinden temizlemez; önce `select kind, count(*) from "FollowupDoc" group by 1` çalıştırılmalı.
- **AWARD_PACK:** Çift onay gerekip gerekmediği cs-fb §5-1'deki açık ürün sorusu. Ben karar vermedim.
- **Masaüstü görsel kanıtı eksik.** Sebebi Y-1'de. Kill-guard onayı işler hâle gelince hazır Playwright spec'i (`…/scratchpad/crwfb65/i65.spec.ts`) tek komutla 390 + 1440 × TR/EN koşar.

## 7. Sonraki adım
- cs-fb: B-1 (girişte tür doğrulaması + normalize + regresyon testi), D-1 ve D-2 (A2'yi ekle). Y-1 için Ö-2 ya da mesaj konumu.
- crw-fb: kısa yeniden inceleme. Ekteki A1–A6'yı ve tam `vitest run`'ı `crwfb65-pg` üzerinde koşacağım.

## 8. Ortam
- `crwfb65-pg` konteyneri ve `wt65` worktree'si (detached `02231b33`, temiz) yeniden inceleme için **bırakıldı**. İkisi de benim; sonraki turdan sonra kaldırılacak.
- :3065 sunucusu ve :3066 çerez yardımcısı (kendi süreçlerim) kapatıldı.
- İNCELEME-56'dan kalan `crwfb56-pg` ve `crwfb56-mailpit` ayrı konu; o yeniden inceleme için bekliyorlar.

## Not: sarmalayıcıdaki yol çelişkisi
Sarmalayıcı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUNOE0Q4FR2J-se-fb.md` yoluna yazmamı istiyordu. Bu, başka bir görevin (se-fb) rapor adı. Sonucu görev gövdesindeki SONUÇ DOSYASI'na (bu dosya) yazdım. O yola yalnız bu dosyayı gösteren kısa bir yönlendirme bıraktım. FONBRIDGE'deki se-fb raporuna dokunmadım.
