# TASK-MUNSQNEWO1LPS — FB İNCELEME-66: kanıt yükleme tür/boyut imzası + kiracı kontrollü indirme (TASK-MUNODY0DVDWC5, fe-fb) — devop-fb

**Durum:** TAMAM
**Karar:** **ONAY.** Kartın kapsamı olan B-1, B-2 ve B-3 gerçek MinIO ve izole Postgres üzerinde saldırgan gözle denendi ve kapalı. Denemelerde yeni bir engelleyici bulunmadı. Yeni bulgular bu düzeltmenin gerilemesi değil. Hepsi takip kartına yazılabilir: bir Orta (önceden var olan misafir ortak erişimi) ve birkaç Düşük/Bilgi maddesi (§3).
**Karar güncellemesi (30.09.2026, § E2E):** **ONAY korunuyor.**
- Patron onaylı e2e tekrar denendi. Playwright koşusu yine **koşulamadı**: kill-guard onayı komut önekinden değil, pane ortamından okuyor (ayrıntı § E2E).
- Onun yerine gerçek tarayıcıda, izole DB üzerinde `evidence-unverified-badge` spec'inin 1. testi elle yürütüldü: **yeşil**.
- Yükleme içeren 2 test tarayıcıda koşulamadı, çünkü tarayıcı aracı dosya seçemiyor.
- Kırmızı sonuç yok. Koşulamayan 2 test açık kalıyor.
**İncelenen:** `7e24d1a6`, `a2a54966`, dev merge `592c2174`. Ayrı worktree, detached, dev HEAD `33b5602d`.
**Kaynak:** `docs/agent-results/TASK-MUNODY0DVDWC5-fe-fb.md`, `docs/agent-results/TASK-MUN80W2VFY56R-se-fb-inceleme58.md` §3
**Platform beyanı:** Doğrulama **mac**'te yapıldı: Darwin 27, Node 26.5, vitest 4.1.11, `pgvector/pgvector:pg16` ve `bitnamilegacy/minio` konteynerleri.
- Sunucu kodu platforma bağlı değil. S3 SigV4 imzası, route handler'lar ve Buffer karşılaştırması her yerde aynı çalışır.
- Tek dosya yolu kodu dev deposundaki `devObjectPath` fonksiyonu. `${cwd}/.dev-objects/<key>` yolunu `/` ile kuruyor. Node Windows'ta `/` ayırıcısını kabul eder. Anahtar deseni `\` ve `:` karakterlerine izin vermez. Bu yüzden Windows'ta da dizin dışına çıkamaz. Bu kısım koddan okundu, Windows'ta koşulmadı.
- **Platforma bağlı tek risk istemcide (D-6):** `uploadFile.type`, tarayıcının işletim sisteminden okuduğu MIME değeri. Windows'ta Office kurulu değilse `.docx` ve `.xlsx` için `""` gelebilir. Sunucu bu durumda `unsupported_type` döner.
- Windows ve Linux koşulamadı, çünkü bu makinede yalnız mac var. CI (ubuntu) MinIO suite'ini hâlâ atlıyor, çünkü job'da S3 servisi yok (fe-fb §4, açık).

## 1. Ne yapıldı
- Ayrı worktree açıldı ve `pnpm install --frozen-lockfile` koşuldu. Kendi konteynerlerim kuruldu: `devfb66-pg` (127.0.0.1:55466) ve `devfb66-minio` (127.0.0.1:59466, **private** kova). Paylaşılan fabrika DB'sine (:5433) yazılmadı.
- DB, CI sırasıyla hazırlandı: `prisma db push`, `db:rls-role`, `apply-migrations.sh` ×2 (38+38), `db:rls` (28→112 policy), `db:generate`, `db:seed`.
- fe-fb'nin testleri benim yığınımda yeniden koşuldu: S3 live 13 ve object-key live ile public-url testleri, toplam **21/21**.
- Düzeltilmiş koda karşı iki saldırı suite'i yazıldı. Commit edilmedi, ekte duruyor:
  - `zz-devfb66-attack.live.test.ts`: gerçek MinIO, A1–A8
  - `zz-devfb66-devstore.live.test.ts`: S3 yok, dev deposu ve `mock-upload`, D1–D2
- Resmi test setine karşı 24 mutant koşuldu (§2.4).
- Kapılar koşuldu: tsc, lint, i18n, build ve iki tam `CI=true npx vitest run` (§2.5).
- Production build `next start` ile ayağa kaldırıldı. Dev yükleme rotasının production'da kapalı olduğu gerçek HTTP ile doğrulandı.
- Tarayıcı e2e'si denendi. Kill-guard **[R8-canli-app-varken-acilis]** koşuyu engelledi. Kart zorlamamamı söylüyor, zorlanmadı (§5).

## 2. Kanıt
Ekler: `docs/agent-results/TASK-MUNSQNEWO1LPS-devop-fb-ekler/`. İçinde `attack-run1.txt`, `devstore-run1.txt`, `mutants-out.txt`, `mut.py`, `m1.mjs`, `gates.txt`, `full-test-run1-summary.txt`, `full-test-run2-summary.txt`, `rerun-failed.txt` ve iki saldırı suite'i var.

### 2.1 Kartın atlatma listesi, gerçek MinIO (`attack-run1.txt`)
| Atlatma denemesi | Sonuç |
|---|---|
| İmzalı URL'e farklı Content-Type (`text/html`) | **403** |
| Content-Type parametreli (`application/pdf; charset=utf-8`) | **403** |
| Content-Type yok | **400** |
| Uzunluk yok (chunked, Content-Length başlığı yok) | **411** |
| Farklı uzunluk | 403 (fe-fb testi; ayrıca `m1.mjs` ile: 10 bayt imzaya 11 bayt → 403) |
| İmzasız ek başlıklar (`Content-Disposition: inline`, `Content-Encoding`, `x-amz-meta-*`, `Cache-Control`) | **400**, nesne yazılmadı |
| `X-Amz-Expires` 900→604800 | **403** |
| Aynı imzayla başka anahtar | **403** |
| 25 MB + 1 presign | `file_too_large`. Tam 25 MB (26214400) kabul, sınır kapsayıcı. |
| Argüman karışıklığı: `__proto__`, `x.constructor` + `mimeType=undefined`, dizi argümanlar, `'10'`, `1e20`, `Application/PDF`, `x.pdf ` | Hepsi reddedildi (`unsupported_type`/`empty_file`). `typeof` kontrolü prototip anahtarı yolunu kapatıyor. |
| A'nın oturumuyla B'nin anahtarını confirm etme: ham, URL, `../`, `%2e%2e`, baştaki boşluk ve `//` biçimleri | 6/6 **`invalid_object_key`**. B'nin nesnesi yerinde duruyor. |
| Oturumsuz indirme | **401**, `Location` yok |
| Başka kiracının kaydı / uydurma id | **404** (fe-fb testi, yeniden koşuldu) |
| Presigned GET'te `response-content-disposition=inline`, eklenen `response-content-type=text/html`, `X-Amz-Expires`, yol içinde kiracı değişimi | 4/4 **403** |
| Kovaya imzasız GET / LIST (`R2_PUBLIC_HOST` ile genel okuma senaryosu) | **403 / 403** |
| `x-amz-acl: public-read` ile PUT | MinIO **200** döndü, ama sonrasında imzasız GET yine **403**. Nesne private kaldı (D-5). |
| Rol: MEMBER / GUEST_PARTNER presign | `ForbiddenRoleError`. WRITER'a URL verildi (doğru). |
| **İmza sonrası nesne değiştirme** (A1) | Confirm edilmiş PDF'in üzerine, aynı URL ile 15 dk içinde **aynı uzunlukta HTML baytı** `application/pdf` olarak yazılabiliyor: **200**. Ayrıntı D-1. |

### 2.2 Dev deposu ve `mock-upload` (S3 yok, `devstore-run1.txt`)
```
D1 {"noSession":401,"memberRole":403,"otherTenantKey":403,"noKey":403,"traversal":403,"htmlType":415,
    "htmlKey":415,"declaredTooBig":413,"chunkedTooBig":413,"htmlBytesPdfType":200}
D1 confirm of html bytes via dev store -> {"success":false,"error":"unsupported_type"} stat after: null
D2 dev download 200 {"cache-control":"private, no-store","content-disposition":"attachment; filename=\"belge.pdf\"",
   "content-security-policy":"default-src 'none'; sandbox","content-type":"application/octet-stream","x-content-type-options":"nosniff"}
D2 other tenant dev download 404 · anon dev download 401
```
`htmlBytesPdfType:200` bekleniyordu. Rota bayt koklamıyor, confirm kokluyor. Confirm nesneyi reddedip sildi (`stat after: null`).

### 2.3 Dev yükleme rotası production'da kapalı mı? (gerçek `next build` + `next start`, R2 env yok)
```
PUT mock-upload (no session, prod): 404     ← dev'de aynı istek 401 (D1 noSession): kapı auth'tan önce
GET mock-upload (no session, prod): 405
download (no session, prod): 401
```
Object store tanımlıyken rota yine 404 döner (A7, `mock.PUT` → 404).

### 2.4 Mutantlar (`mutants-out.txt`). Resmi set: S3 live, object-key live, storage-public-url, server-action-rbac (86 test)
```
M1  content-length not signed            SURVIVED  → EŞDEĞER: SDK ContentLength verilince content-length'i her durumda imzalıyor
                                                     (m1.mjs: signableHeaders=['content-type'] → yine content-length;content-type;host, 11B PUT → 403)
M1b content-type not signed              KILLED    (m1.mjs: signableHeaders=[] → content-type imzalanmıyor; yani bu satır gerçekten yük taşıyor)
M1c ContentLength not in PUT command     KILLED
M2  ContentType not in PUT command       KILLED
M3  stored content type not compared     KILLED
M4  magic not checked                    KILLED
M5  stored size limit dropped            KILLED
M6  refused object not deleted           KILLED
M7  row size from browser                KILLED
M8  download skips tenant prefix         KILLED
M9  no attachment disposition            KILLED
M10 download TTL 3600                    KILLED
M11 mock-upload open in prod/with store  SURVIVED  ← test yok (canlı olarak §2.3'te doğrulandı)
M12 mock-upload no tenant key check      SURVIVED  ← test yok (D1 otherTenantKey 403 elle doğrulandı)
M13 mock-upload no role check            SURVIVED  ← test yok (D1 memberRole 403 elle doğrulandı)
M14 limit exclusive (>=)                 SURVIVED  ← tam 25 MB sınır testi yok
M15 declared mime not compared           KILLED
M16 dev download inline w/o sandbox      SURVIVED  ← dev indirme başlıklarının testi yok
M17 statObject drops stored content type KILLED
M18 FormData path skips byte check       SURVIVED  ← createEvidence/uploadFileToR2 bayt kontrolü testsiz
M19 download no session                  KILLED
M20 checksum default back                KILLED
M21 download where {id} only             SURVIVED  → EŞDEĞER: RLS (withTenant) başka kiracının satırını zaten gizliyor (fe-fb M15 ile aynı)
M22 confirm accepts URL form of own key  SURVIVED  → pratikte eşdeğer: tenantObjectKeyOf URL'yi kendi anahtarına indiriyor, kaydedilen yine o anahtar
```
Sonuç: 24 mutantın 15'i öldü, 3'ü eşdeğer (M1, M21, M22). Kalan 6 mutantın hepsi dev rotası, sınır ya da FormData yolunda: M11, M12, M13, M14, M16, M18. Bu bir test boşluğu (D-4). Güvenlik davranışı canlı koşuda doğru çıktı.

### 2.5 Kapılar (`gates.txt`, `full-test-run*-summary.txt`)
```
pnpm typecheck  rc=0
pnpm lint       rc=0
pnpm i18n:check rc=0  (✅ both catalogs agree)
pnpm build      rc=0  (ƒ /api/evidence/[id]/download · ƒ /api/evidence/mock-upload)
```
**Tam `CI=true npx vitest run`** (izole DB, MinIO env açık, AUTH_SECRET = ci.yml değeri). İki koşunun ikisi de kırmızı çıktı. Hepsi yük kaynaklı `Test timed out in 5000ms`. Makine yükü 33–57 arasındaydı.
- Koşu 1: `Test Files 13 failed | 245 passed | 2 skipped (260)`, `Tests 18 failed | 3088 passed | 48 skipped (3154)`. Kırmızı 13 dosya tek başına yeniden koşuldu: **13/13 dosya, 209/209 test geçti**.
- Koşu 2 (yük 56): `8 failed | 250 passed`, `Tests 9 failed | 3136 passed | 9 skipped`. Yeniden koşuda 4 dosya hâlâ zaman aşımına düştü. O 4 dosya `--maxWorkers=1` ile koşuldu: **4/4 dosya, 67/67 test geçti**.
- Kırmızı dosyaların hiçbiri kanıt kodunu içe aktarmıyor: rag-pdf, billing, vat, withholding, agency, cordis, oauth, invitation, stale-reminder, schema-contract ve use-server-exports. Kırmızı çıkan her dosya en az bir koşuda yeşil. Tek koşuda 0 hata ile biten bir tam koşum yok. Bunu dürüstçe kayda geçiriyorum. Önceki kartta (TASK-MUNQD2XTNSH9U) yük düştüğünde aynı set 3132/0 geçmişti.

### 2.6 Temizlik
```
MinIO kovası: 0 nesne · DB: 0 dv66*/evs3-* kiracı → docker rm -f devfb66-pg devfb66-minio
next start (kendi pid'im, :3966) durduruldu → lsof :3966 = 0 · worktree wt66 kaldırıldı
```

## § E2E (patron onaylı)
Onay: patron, 30.09.2026, "e2e onayı veriyorum, izole DB'de koştur". Kart: TASK-MUNSQNEWO1LPS EK.

**Kurulum (hepsi kendime ait, paylaşılan :5433'e dokunulmadı):**
- Worktree: ayrı, detached, dev HEAD `62ce8770`. `592c2174` bu HEAD'in atası. `git diff 592c2174 HEAD` kanıt kodunda boş: `src/lib/storage.ts`, `src/app`, `tests/e2e/evidence-*`.
- DB: kendi konteynerim `devfb66e-pg` (`pgvector/pgvector:pg16`, 127.0.0.1:55467). CI sırasıyla hazırlandı: `prisma db push`, `db:rls-role`, `apply-migrations.sh` ×2 (38+38), `db:rls`, `db:generate`, `db:seed`. Hepsi `prep=0`.
- MinIO: `devfb66e-minio` (127.0.0.1:59467) açıldı ama kullanılmadı, çünkü playwright koşusu gerçekleşmedi.
- Koşu öncesi `echo` çıktısı:
```
DATABASE_URL=postgresql://fb:***@127.0.0.1:55467/fb66e
container: devfb66e-pg 127.0.0.1:55467->5432/tcp
```

**1) Playwright koşusu: KOŞULAMADI. Kırmızı değil, hiç başlamadı.**
- Komut kartta verilen komuttu (`MURAT_LIVE_OK=1 E2E_PORT=3471 DATABASE_URL=<izole> npx playwright test tests/e2e/evidence-*.spec.ts`).
- Önek üç biçimde denendi: komutun başında, `bash -c` içinde ve `npx --prefix … --version` ile. Üçü de aynı ret mesajını aldı:
```
⛔ AgentSpace kill-guard [R8-canli-app-varken-acilis] — bu komut ÇALIŞTIRILMADI.
```
- Kök neden `/Applications/AgentSpace.app/…/killGuard.cjs` dosyasında. `contextFromEnv()` şu satırla `allowLive: String(e.MURAT_LIVE_OK || '') === '1'` değeri **pane sürecinin ortamından** okuyor, komut metninden değil.
- Kod yorumu da aynı şeyi söylüyor: "Bu değişkeni yalnız Murat verir; ajanın kendi kendine yazması bir KARAR değil, kartın ihlalidir." Yani karttaki yazılı onay, ajan tarafında kapıyı açmıyor.
- Kapıyı atlatacak yollar (komutu gizleme, `AGENTSPACE_KILL_GUARD=0`) **denenmedi**. Bunlar bir güvenlik kontrolünü delmek olurdu.
- Koşmanın iki yolu var:
  - (a) Pane `MURAT_LIVE_OK=1` ortamıyla başlatılır ve bu kart yeniden atanır.
  - (b) Patron komutu kendisi koşar (aşağıdaki "Tekrar").

**2) Gerçek tarayıcı yürütmesi (kapıya takılmayan yol): 1/1 yeşil.**
- Sunucu: kendi `pnpm dev --port 3471` sürecim. Ortam olarak izole DB ve `playwright.config.ts` `testEnv`'inin aynısı kullanıldı: test AUTH_SECRET, `DEMO_LOGIN_ENABLED=true`, INVOICE_*.
- Fixture: spec'lerin kendi `evidenceTenant('fabrication')` ve `evidenceTenant('badge')` kurulumları ile `UNVERIFIED_ROW`. Ekteki `e2e-onayli/fixture.ts` bunları doğrudan içe aktarıyor.
- Tarayıcı: AgentSpace iç tarayıcısı (headed, `agentspace_browser`). Adımlar:
  1. `/tr/giris?callbackUrl=/tr/ev-badge-e2e/evidence` açıldı.
  2. `ev-badge-e2e@fabrika.test` yazıldı.
  3. Çerez bandı kabul edildi. Spec bunu `localStorage` init script'iyle yapıyor; araçta bu seçenek yok.
  4. Submit tıklandı.
- Sunucu logu:
```
POST /tr/giris?callbackUrl=%2Ftr%2Fev-badge-e2e%2Fevidence 200 in 417ms
GET /tr/ev-badge-e2e/evidence 200 in 2.1s
```

| Spec / test | Assert | Tarayıcıda görülen | Sonuç |
|---|---|---|---|
| unverified-badge · "a document nothing has verified is not shown as verified" | başlık görünür | `Doğrulanmamış Test Belgesi` | ✅ |
| 〃 | `evidence-badge` sayısı 1 | sayfada tek kart; `read [data-testid="evidence-badge"]` tek sonuç | ✅ |
| 〃 | badge metni `Doğrulanmamış` | `Doğrulanmamış` | ✅ |
| 〃 | `0 Geçerli Belge` görünür | `0 Geçerli Belge`, `0/100 SAĞLIK SKORU` | ✅ |
| 〃 | `data-badge-kind="UNVERIFIED"` | araç öznitelik okuyamıyor, **doğrulanmadı** | — |
| unverified-badge · "a fresh upload is recorded as unverified" | yükleme → satır `UNVERIFIED` | **koşulamadı**: araçta dosya seçme (setInputFiles) yok | — |
| fabrication · "no invented metadata" | yükleme → çekmecede uydurma yok | **koşulamadı**: aynı sebep | — |

- Yükleme zinciri (presign → PUT → confirm) tarayıcı dışında zaten sınanmıştı: §2.1–2.2'de gerçek HTTP ile, hem MinIO'da hem dev deposunda.
- Kareler:
  - `docs/agent-results/TASK-MUNSQNEWO1LPS-devop-fb-ekler/e2e-onayli/01-evidence-page-signed-in.png`: girişten sonra kanıt sayfası
  - `…/e2e-onayli/02-unverified-badge-row.png`: tek kart, "Doğrulanmamış" rozeti
- Playwright koşmadığı için trace dosyası yok.

**Temizlik:**
```
fixture teardown → left evidence 0 tenants 0
kendi next dev'im (:3471) durduruldu → lsof :3471 = 0
docker rm -f devfb66e-pg devfb66e-minio → konteyner 0 · worktree kaldırıldı
```
Canlı uygulama ve başka pane süreçleri durdurulmadı.

**Tekrar (patron için ya da `MURAT_LIVE_OK=1` ortamlı bir pane için):**
1. DB yukarıdaki sırayla izole bir konteynerde hazırlanır.
2. Karttaki komut `DATABASE_URL` o konteyneri gösterecek şekilde koşulur.
3. Beklenen: 2 dosya, 3 test.

## 3. Bulgular
| # | Önem | Konum | Bulgu | Öneri |
|---|---|---|---|---|
| Y-1 | **Orta** (önceden var; kapsam dışı ama yeni indirme rotası bu yüzeyi kullanıyor) | `download/route.ts:24` (`requireTenantApi()` rolsüz), `actions.ts:27` (`readOnly:true`) | **GUEST_PARTNER** rolünde `view_proposal` yok. Buna rağmen kiracının bütün kanıtlarını listeleyip indirebiliyor, CONFIDENTIAL olanlar dahil. Canlı: A6 `role GUEST_PARTNER download 302`. `confidentiality` alanı yalnız bir etiket, hiçbir yerde uygulanmıyor. Eskiden liste satırlarında genel `fileUrl` vardı, yani misafir önceden de okuyabiliyordu. Bu bir gerileme değil. | Ayrı kart: indirme ve liste `can(role,'view_proposal')` (ya da ayrı bir kanıt izni) istesin; CONFIDENTIAL için daha üst rol. |
| D-1 | Düşük | `storage.ts` `getPresignedUploadUrl` (15 dk) + `confirmEvidenceUploadAction` | **Confirm sonrası değiştirme:** Presigned URL confirm'den sonra da geçerli kalıyor. Aynı tür ve uzunlukta, istenen baytlarla yeniden PUT yapılabiliyor (A1: HTML baytı, `application/pdf`, 200). Magic kontrolü böylece atlanıyor. Etki sınırlı: nesne `application/pdf` olarak ve `attachment` ile iniyor, render edilmiyor. D-2 zaten aynı sonucu confirm öncesinde de veriyor. | Yüklemeyi geçici bir anahtara (`incoming/…`) al. Confirm'de CopyObject ile son anahtara taşı ve geçiciyi sil; son anahtar hiçbir imzalı PUT'ta yer almasın. Alternatif: confirm'de ETag'i kaydet, indirmede HEAD ile karşılaştır. |
| D-2 | Düşük / Bilgi | `storage.ts` `EVIDENCE_TYPES.magic` | Magic kontrolü yalnız ilk baytlara bakıyor. `%PDF-1.4\n<html><script>…` confirm'den geçiyor (A8 `true`). fe-fb docx/xlsx için ZIP başlığı riskini zaten yazmıştı; PDF için de geçerli. | `attachment` + imzalı tür + nosniff ile yetinilebilir. İstenirse sunucu tarafında içerik taraması. |
| D-3 | Düşük | `confirmEvidenceUploadAction` | **Aynı anahtar iki kez confirm edilebiliyor.** A2'de iki satır oluştu. Birini silmek diğerinin dosyasını da siliyor: route 302 döndü, depo 404. | Confirm'de aynı `r2ObjectKey` ile satır var mı diye bak, ya da `(tenantId, r2ObjectKey)` için unique index ekle. |
| D-4 | Bilgi (test boşluğu) | `tests/` | M11, M12, M13, M14, M16 ve M18 sağ kalıyor. `mock-upload` rotası, dev indirme başlıkları, tam 25 MB sınırı ve FormData yolunun bayt kontrolü için otomatik test yok. | Bu raporun ekindeki `zz-devfb66-devstore.live.test.ts` assert'lere çevrilip kalıcı hale getirilebilir. Production kapısı için env mock'lu bir birim testi eklenebilir. |
| D-5 | Bilgi | MinIO davranışı | MinIO imzasız `x-amz-acl: public-read` başlığını kabul etti (200), ama nesne private kaldı (403). R2 ACL'yi yok sayar. AWS S3 imzasız `x-amz-*` başlığını reddeder. Sorun yok. | — |
| D-6 | Bilgi (platform) | `evidence-client.tsx` (`uploadFile.type`) | Tarayıcının verdiği MIME işletim sisteminden geliyor. Windows'ta Office kurulu değilse docx/xlsx için `""` gelebilir. Kullanıcı bu durumda "desteklenmeyen tür" hatası görür. Koddan çıkarım, Windows'ta koşulmadı. | İstemci `type` boşsa uzantıdan eşlesin. Sunucu kontrolü zaten değişmiyor. |
| D-7 | Bilgi | `mock-upload/route.ts` | `content-length` olmayan (chunked) istekte gövdenin tamamı belleğe alınıyor, 413 ancak ondan sonra dönüyor (D1 `chunkedTooBig` 413). Yalnız dev ortamını etkiliyor. | Akış halinde oku, sınırı aşınca kes. |

Kapsam dışı olup değişmeyenler: B-4 (DB hatasında `success:true`) ve CI'da MinIO servisinin olmaması. İkisi de fe-fb raporunda açık olarak duruyor. `createEvidence` (FormData yolu) UI'da hiçbir yerden çağrılmıyor. Reddedilen dosya için anahtarsız satır açıyor; bu da Bilgi düzeyinde bir not.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUNSQNEWO1LPS-devop-fb.md` (bu rapor; iskelet `701706ef`)
- `docs/agent-results/TASK-MUNSQNEWO1LPS-devop-fb-ekler/`: kanıt ekleri. Saldırı suite'leri `tests/` altına konmadı, commit edilmedi.
- Kod değiştirilmedi.
- **Yol çelişkisi:** Dispatch'teki [KANIT ZORUNLU] bloğu `/Users/macbook/alan/docs/agent-results/TASK-MUN80W2VFY56R-se-fb-inceleme58-2.md` yolunu veriyor. Bu yol repo dışında ve başka bir kartın (se-fb İNCELEME-58) adını taşıyor. Tam rapor gövdedeki SONUÇ DOSYASI yoluna yazıldı. O yola yalnız bu rapora işaret eden kısa bir özet konuldu. Dosya daha önce yoktu, hiçbir şeyin üzerine yazılmadı. Klasör git dışında olduğu için commit yok.

## 5. Açık sorular
- **Tarayıcı e2e'si koşulamadı.** `tests/e2e/evidence-fabrication.spec.ts` ve `evidence-unverified-badge.spec.ts` için komut `E2E_PORT=3476 npx playwright test …` idi. Kill-guard `[R8-canli-app-varken-acilis]` engelledi: canlı AgentSpace açık ve Murat'ın onayı gerekiyor. Kart gereği zorlanmadı. Onay gelirse `MURAT_LIVE_OK=1` ile koşulabilir. Aynı kod yolu (presign → PUT → confirm → indirme) gerçek HTTP ile hem MinIO'da hem dev deposunda sınandı.
- R2'nin imzalı `content-length` ve `content-type` başlıklarını MinIO gibi uygulayıp uygulamadığı gerçek R2'ye karşı doğrulanmadı. Prod kovasının genel erişime kapalı olup olmadığı ve `R2_PUBLIC_HOST` değeri de hâlâ açık (fe-fb §5).
- Tek koşuda 0 hata veren bir tam koşum yok, sebebi yük (§2.5).

## 6. Sonraki adım
- Karar ONAY. Kartı `done` durumuna almak lider/PM'nin işi.
- Takip kartları önerisi:
  - (a) Y-1: misafir ortak ve kanıt gizlilik seviyesi yetkisi
  - (b) D-1 ve D-3: geçici anahtar + CopyObject, çift confirm
  - (c) D-4: dev rotası ve sınır testleri
  - (d) ci.yml'e MinIO servisi (açık)
- E2E (30.09 güncel): 3 testin playwright koşusu `MURAT_LIVE_OK=1` ortamlı bir pane'de ya da patronun kendi koşusunda yapılmalı (§ E2E "Tekrar"). Tarayıcıda 1/3 test elle yeşil.
