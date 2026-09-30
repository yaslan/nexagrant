# TASK-MUOF85BU7BV3X — cs-fb: İNCELEME-103 G-1, havuz zaman aşımı → tipli SERVICE_BUSY

**Durum:** Dalda bitti. **Entegrasyona hazır: `cs-fb/g1-pool-timeout` dal ucu (bu raporu taşıyan commit; sha final mesajda ve `git log -1 cs-fb/g1-pool-timeout`)** (düzeltme commit'i `6665259e`). Merge yok, push yok.

**Özet:**
- Uygulama havuzu doluyken bir server action artık pg-pool'un ham metniyle ("timeout exceeded when trying to connect") reddetmiyor.
- Havuz tutulurken 150 confirm denendi. Ham metinli ret 150 → **0**.
- Aynı 150 çağrı şimdi `digest = SERVICE_BUSY` taşıyan sabit mesajlı, tipli bir hatayla reddediyor. İstemci bunu tr/en `Common.serviceBusy` cümlesine çeviriyor.
- ⚠ **DoD'dan sapma, açıkça:** "fırlatma 0" kelimesi kelimesine sağlanmadı. Action hâlâ reddediyor, ama artık tipli ve sızıntısız. Nedeni aşağıdaki 1-3-1'de. Kalan karar patronun: Ö-1.

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26.5, pnpm 11.25, Docker'da `pgvector/pgvector:pg16` + `bitnamilegacy/minio`). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız mac var. Koddan çıkarımlar:
- Değişiklik platforma bağlı değil. Sınıflandırma `isDatabaseUnavailable` ile yapılıyor: mesaj regex'i, Prisma/Postgres kodları ve Node soket errno'ları. Yol, kabuk, sinyal ya da ikili adı yok.
- pg-pool'un zaman aşımı metni her işletim sisteminde aynı. `ECONNREFUSED` gibi errno adları da Node'da her işletim sisteminde aynı.
- Prod'da Linux konteynerinde çalışıyor; davranış aynı.

## 1. Ne yapıldı

**Başlangıç.** `be-fb/g1-wip` (5d2ac526) zaten vardı, beklemek gerekmedi. `git worktree add <scratchpad>/wtg1 -b cs-fb/g1-pool-timeout be-fb/g1-wip` ile başladım.

**be-fb'nin değişikliğini değerlendirdim, kabul etmedim, yerine koydum.** Ölçüm ek 03'te: 150/150 ret, `digest=SERVICE_BUSY`, ham metin 0. Yani sızıntıyı kapatıyordu ama beş eksiği vardı:
1. Yalnız üst düzey mesajı `includes` ile arıyordu. `cause` ya da `AggregateError` içine sarılmış havuz hatası kaçıyordu. Testte gösterildi: bu şekiller artık SERVICE_BUSY.
2. Türkçe mesaj koda gömülüydü; i18n yoktu.
3. Sürücü metni hiçbir yere loglanmıyordu, teşhis kayboluyordu.
4. `useActionErrorText` bu digest'i tanımıyordu. İstemci yine "tekrar deneyin" ya da ham mesaj gösterecekti.
5. Hiç testi yoktu.

Havuz tanıma işini sıfırdan yazmadım. Repoda zaten `src/lib/db-unavailable.ts#isDatabaseUnavailable` var (İNCELEME-83); onu kullandım.

**Değişiklik (tek nokta: `assertTenantActionWritable`).** 131 çağrı yerinin tamamı `requireTenantAction` üzerinden ya da doğrudan bu fonksiyondan geçiyor.
- `src/lib/tenant.ts`: yeni `ServiceBusyError` sınıfı. `code` ve `digest` = `SERVICE_BUSY`; İngilizce sabit mesaj; `cause` yok.
- Pilot kontrolü `isDatabaseUnavailable` ile tanınan bir hatayla düşerse:
  - sürücü metni `console.error('[requireTenantAction] pilot check could not reach the database: …')` ile yalnız sunucu loguna yazılıyor;
  - `ServiceBusyError` fırlatılıyor.
- `PilotExpiredError` eskisi gibi `PILOT_EXPIRED` digest'iyle çıkıyor. Diğer her hata aynı nesne olarak, dokunulmadan fırlıyor.
- `src/lib/service-busy.ts` (yeni, istemci için de güvenli): `SERVICE_BUSY_DIGEST`, `SERVICE_BUSY_CODE`, `isServiceBusy`. `pilot-expired.ts` ve `forbidden-role.ts` ile aynı kalıp.
- `src/lib/hooks/use-action-error-text.ts`: `isServiceBusy` → `t('serviceBusy')`.
- `messages/tr.json` + `messages/en.json`: `Common.serviceBusy`.
  - tr: "Sistem şu an çok yoğun; hiçbir şey kaydedilmedi. Birkaç saniye sonra tekrar deneyin."
  - en: "The system is very busy right now, so nothing was saved. Try again in a few seconds."
  - "Hiçbir şey kaydedilmedi" doğru: kontrol, action gövdesinden ÖNCE koşuyor.
- Testler:
  - `tests/service-busy-action.test.tsx` (12 test): eşleme, 4 sarılı şekil, PILOT_EXPIRED'ın korunması, 3 "dokunma" durumu, gerçek evidence confirm, tr/en kanca.
  - `tests/service-busy-pool.live.test.ts`: **gerçek** uygulama havuzu dolu (10 × `pg_sleep(2.5)`), 20 `requireTenantAction`. Hepsi SERVICE_BUSY; log'da sürücü metni 20 kez var; havuz boşalınca kontrol yeniden geçiyor. Bu test, pg ya da Prisma sürümü hata şeklini değiştirirse kırmızıya döner.

### 1-3-1 (adım 4)

**Sorun:** Pilot kontrolü her action'ın `try`'ının dışında. Havuz dolunca 131 çağrı yerinin hepsi ham sürücü metniyle reddediyor. Görev, tek noktada **tipli bir sonuç döndürmeyi** istiyor. Ama çağrı yerlerinin ortak bir sarmalayıcısı yok: `requireTenantAction` bir `TenantScope` döndürüyor, action sonucu değil. Action'ların dönüş şekilleri de farklı (`{success,error}`, `{ok,error}`, `void`, sayfa verisi…). Kontrolün kendisi bir action sonucu döndüremez.

**Seçenekler:**
- **A: Tek noktada tipli hata** (`digest = SERVICE_BUSY`) + istemci kancası + i18n. **SEÇİLDİ.**
  - Artısı: 131 yerin hepsi tek değişiklikle kapsanıyor. Aynı kontrolün diğer iki reddiyle aynı sözleşme: `PILOT_EXPIRED` ve `FORBIDDEN_ROLE` de digest'le fırlıyor ve aynı kancadan okunuyor. Prod'da tarayıcıya giden tek şey zaten digest.
  - Eksisi: action hâlâ *reddediyor*. Ret sayısı 150 kalıyor; ham metinli ret 0'a iniyor.
- **B: A + değer döndüren action'larda kontrolü `try` içine almak**, `{…, error: 'service_busy'}` döndürmek.
  - Artısı: "fırlatma 0" kelimesi kelimesine sağlanıyor.
  - Eksisi: 131 yerde tek tek değişiklik, her birine i18n anahtarı (ör. `evidence upload.error.service_busy`), dönüş tiplerinde genişleme. "Tek nokta" değil, kapsam patlar.
- **C: Pilot kontrolünü havuz beklemesine dayanıklı yapmak** (tek sefer yeniden deneme ya da daha uzun `connectionTimeoutMillis`).
  - Artısı: çoğu durumda ret hiç olmaz.
  - Eksisi: garanti yok (havuz 2 sn'den uzun doluysa yine ret). Gecikme sözleşmesini değiştirir. Sızıntıyı tek başına kapatmaz.

**Öneri:** A şimdi. B, yalnız görünür akışlar için (ör. evidence confirm) patron isterse ayrı kartta yapılır. A'nın üstüne oturur. → Ö-1.

## 2. Kanıt

Ham çıktıların hepsi `TASK-MUOF85BU7BV3X-cs-fb-ekler/` klasöründe.

**Ortam** (ek 01; kurulum CI sırasıyla: `db push` → `db:rls-role` → `apply-migrations` ×2 "41 files applied" → `db:rls` → `db:generate` → `db:seed`):
```
DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55133/fabrika
DATABASE_URL_RLS_TEST=postgresql://fabrika_app:fabrika_app_ci@127.0.0.1:55133/fabrika
csfb-g1-pg pgvector/pgvector:pg16 127.0.0.1:55133->5432/tcp
```
- Ölçüm suite'inde uygulama havuzu `fabrika_app` rolüyle koştu (D7 gibi): `ATK app pool role=fabrika_app`.
- MinIO: `csfb-g1-minio` 127.0.0.1:59133. :5433'e hiç bağlanılmadı.

**Ölçüm.** Suite: `zz-csfbg1.live.test.ts.txt`. D7 harness'ından uyarlandı; repoya girmedi.
- (a) D7'nin aynısı ×6 tur.
- (b) S2: 10 uygulama-havuzu bağlantısı `pg_sleep(1.6)` ile tutulurken 150 eşzamanlı confirm.

| | a: D7 ×6 (900 confirm) | b: S2 havuz dolu (150 confirm) |
|---|---|---|
| ÖNCE, dev `a806cc51` (ek 02) | 0 fırlatma | **150 THROW, 150'si ham metin** `"timeout exceeded when trying to connect"`, digest yok |
| be-fb WIP `5d2ac526` (ek 03) | — | 150 THROW `digest=SERVICE_BUSY`, ham metin 0, mesaj koda gömülü Türkçe |
| SONRA, `6665259e` (ek 07) | 0 fırlatma | 150 THROW `digest=SERVICE_BUSY`, **ham metin 0**, mesaj `"Service busy: the database had no connection…"` |

```
ÖNCE  ATK S2 holders: {"held":10}
ÖNCE  ATK S2 150 confirm in 1018 ms: {"THROW no-digest RAW-POOL-TEXT msg=\"timeout exceeded when trying to connect\"":150}
SONRA ATK S2 holders: {"held":10}
SONRA ATK S2 150 confirm in 1019 ms: {"THROW digest=SERVICE_BUSY no-pool-text msg=\"Service busy: the database had no connection for this reques\"":150}
```

Notlar:
- D7'nin 9/150'si devop-fb'de 4 koşudan yalnız birinde çıkmıştı. Bende 6 turda (900 confirm) hiç çıkmadı. D7 rastlantısal; bu yüzden tekrarlanabilir S2 senaryosunu ekledim.
- "9 → 0" yerine ölçülen: **ham metinli ret 150 → 0** (S2). **Tipli ret 150 → 150**, bkz. 1-3-1 ve Ö-1.

**İstemciye ne gidiyor?**
- ÖNCE: dev'de `evidence-client.tsx:244` `alert("Yükleme hatası: timeout exceeded when trying to connect")` gösteriyor. Sürücü metni kullanıcıya gidiyordu. Prod'da Next mesajı saklıyor, kullanıcı genel hata görüyordu.
- SONRA: prod'da tarayıcıya giden `digest=SERVICE_BUSY`. `useActionErrorText` bunu `Common.serviceBusy`'ye çeviriyor. Kanca testi bunu prod şekliyle (`new Error('An error occurred in the Server Components render.')` + digest) doğruluyor.

**Çağrı yerleri (adım 3):**
```
grep -rn 'requireTenantAction\|assertTenantActionWritable' src | grep -v '^src/lib/tenant.ts' | wc -l   →  131
grep -rln … src | wc -l  →  36 dosya
```
- `withTenant` doğrudan bir action girişinde tenant kontrolü yapmıyor. Zincir `assertTenantActionWritable → assertTenantWritable → getPilotState → withTenant` şeklinde, yani tek nokta yeterli.
- `auth()` havuz hatasını zaten kendisi ele alıyor (`auth.ts:305 NOT_CONNECTED`).

**Bekçi, İNCELEME-107 (ek 05):**
```
tests/api/action-leak-scan.test.ts + api-error-body-guard.test.ts: Test Files 2 passed, Tests 155 passed (155)
gerçek ağaç taraması: use-server files scanned: 37, findings: 0; evidence/actions.ts (confirm, imports @/lib/tenant): []
```
Not: bekçi action'ın **döndürdüğü** değeri izliyor, fırlatılanı izlemiyor. Bu yüzden M2'yi bekçi değil, yeni birim testi öldürüyor (sabit mesaj `toBe`, `cause` yok, alanlarda sürücü metni yok).

**Mutantlar (ek 06).** Döngü: uygula → 4 suite (37 test) → `git checkout` → `git diff --quiet`.

| Mutant | Sonuç | Öldüren |
|---|---|---|
| M1 yakalama kaldırıldı | **KILLED** 7 failed | birim 6 test + **canlı havuz testi** |
| M2 sürücü metni `message`'a | **KILLED** 7 failed | birim (sabit mesaj) |
| M2b sürücü hatası `cause`'a (ek) | **KILLED** 1 failed | birim (`cause` undefined) |
| M3 her hata SERVICE_BUSY | **KILLED** 3 failed | P2002, TypeError, string "aynı değer, digest yok" |
| M4 kanca SERVICE_BUSY tanımıyor (ek) | **KILLED** 2 failed | tr + en kanca testi |

Her geri almadan sonra `git diff --quiet exit = 0`.

**Tam kapılar (ek 08).** HEAD `6665259e`, `CI=true`, CI'nin kendi komutlarıyla:
```
vitest: Test Files 303 passed | 2 skipped (305) · Tests 4037 passed | 51 skipped (4088) · exit=0 · numFailedTests 0
live-skip-gate (scripts/check-live-skips.ts): exit=0 (atlananlar izinli listede)
tsc exit=0 · lint exit=0 · i18n:check exit=0 ("both catalogs agree")
next build exit=0 (✓ Compiled successfully)
```
**dev merge'ünden sonra (ek 10–12).** Dev bu arada 17 commit ilerlemişti; kodlar da var: K1 NULLS NOT DISTINCT, migration zinciri, HSTS. `merge-tree` temiz çıktı. dev'i DALA merge ettim (`7b8fffa0`; dev'e merge YOK), taze konteynerde DB'yi CI sırasıyla yeniden kurdum ve kapıları yeniden koştum:
```
tsc 0 · lint 0 · i18n 0 · next build 0 · live-skip-gate 0
vitest 1. koşu: 4042 passed | 2 failed → rag-pdf-worker-isolation ("fast": 5080 ms < 3000 beklendi) + api-error-body-guard (40 sn test zaman aşımı, bulgu değil)
vitest 2. koşu: 4042 passed | 2 failed → rag-pdf-worker-isolation (3610 ms < 3000) + k1-embeddings.live (önce/sonra durum eşitliği)
tek başına: bekçi 2/2 yeşil, rag+k1 35/35 yeşil
```
Bu kırmızılar ortamdan geliyor, değişiklikten değil. Kanıt:
- (1) Makinenin yük ortalaması 12 çekirdekte **33–42** (ek 12'de `uptime` var); diğer pane'ler yük bindiriyor.
- (2) Kırmızılar koşudan koşuya yer değiştiriyor.
- (3) Aynı yükte bekçi süresi dalda dev'den kısa: dal 13.9/12.1 sn, dev 16.6/15.0 sn.
- (4) rag ve k1 test yolları `@/lib/tenant`'ı hiç çağırmıyor.
- (5) Merge'den önceki tam koşu `4037 passed / 0 failed`.

CI'nin ayrılmış runner'ında yeşil beklenir. Yine de merge sonrası CI koşusu bakılacak ilk yer.

Build logundaki "Ecmascript file had an error" satırı `src/instrumentation.ts:18` `process.exit` Edge uyarısı (ek 09). Bu dosyaya dokunulmadı; eskiden beri var.

## 3. Değişen dosyalar

Dal `cs-fb/g1-pool-timeout`, taban `be-fb/g1-wip`, onun tabanı `a806cc51`; sonra dev `c25a1623` DALA merge edildi (`7b8fffa0`).
- `src/lib/tenant.ts`: be-fb'nin 7 satırı çıktı; `ServiceBusyError` + `isDatabaseUnavailable` dalı girdi.
- `src/lib/service-busy.ts`: yeni.
- `src/lib/hooks/use-action-error-text.ts`
- `messages/tr.json`, `messages/en.json`: `Common.serviceBusy`.
- `tests/service-busy-action.test.tsx`: yeni.
- `tests/service-busy-pool.live.test.ts`: yeni. CI'de DB var, atlanmaz. DB yoksa `skipOrFailInCi`.
- `docs/agent-results/TASK-MUOF85BU7BV3X-cs-fb.md` + `-ekler/`

## 4. Riskler

- **Kapsam genişledi (bilinçli):** yalnız havuz zaman aşımı değil, `isDatabaseUnavailable`'ın tanıdığı her "veritabanına ulaşılamadı" durumu da SERVICE_BUSY oluyor: ECONNREFUSED, P1001, 57P01…
  - Kullanıcıya doğru cümle bu ("tekrar deneyin, hiçbir şey kaydedilmedi").
  - Eskiden bu durumlar ham fırlıyordu. Prod izleme artık bu hataları `[requireTenantAction] pilot check could not reach the database:` log satırından görmeli, action hatası olarak değil.
- **Değer döndüren ve kontrolü `try` İÇİNDE olan action'lar:** bunların `catch`'i `failureCode(e, 'failed')` → `'failed'` döndürür, "tekrar deneyin" der. Bu doğru bir mesaj, ama `serviceBusy` cümlesi değil. `failureCode`'u genişletmedim: dönüş birliklerini genişletir ve `t(\`errors.${code}\`)` aramalarında eksik anahtar riski doğar.
- **Route handler'lar** (`requireTenantApi({ write: true })`): havuz hatası orada da ham `throw` ediyor. Next bunu 500 yapar, metni istemciye vermez. Bu kartın kapsamı server action; dokunulmadı → Ö-2.
- Bekçi fırlatılan hatayı izlemiyor. Bu yolun sızıntı sözleşmesini yeni birim testi tutuyor (M2/M2b ölüyor).

## 5. Açık sorular

- **Ö-1 (patron kararı):** DoD'daki "fırlatma 0" kelimesi kelimesine isteniyorsa, 1-3-1'deki B seçeneği gerekiyor: çağrı yeri başına değişiklik. Önerim: yalnız kullanıcıya görünen, değer döndüren kritik akışlar için ayrı kart (ilk aday evidence confirm: `{success:false, error:'service_busy'}` + `upload.error.service_busy`).
- **Ö-2:** `requireTenantApi({ write: true })` için aynı eşleme (503 + `SERVICE_BUSY` gövdesi) ayrı kart olarak açılsın mı?
- **Ö-3 (sonuç yolu):** Kart, sonucu ana checkout yoluna (`/Users/macbook/alan/FONBRIDGE/docs/agent-results/…`) yazmamı istiyor. Aynı zamanda raporu dalda commit'lememi ve ana checkout'ta çalışmamamı da istiyor. Ben raporu yalnız dalda commit'ledim, ana checkout'a kopya BIRAKMADIM. Denendi: aynı yolda izlenmeyen özdeş bir dosya, devop-fb'nin `git merge`'ünü "untracked working tree files would be overwritten by merge" hatasıyla durduruyor. Dal merge edilince dosya o yolda olacak.

## 6. Sonraki adım

- devop-fb: `cs-fb/g1-pool-timeout` dalını dev'e merge etsin (dal ucu). Dal, dev'i (`c25a1623`) zaten içeriyor (`7b8fffa0`). Dev bu arada ilerlemediyse merge fast-forward'a yakın ve çakışmasız olur.
- Merge'den sonra CI'de `service-busy-pool.live.test.ts` koşmalı (DB servisli job'da atlanmaz).
- Ö-1 ve Ö-2 için patron kararı.

## Temizlik

- Konteynerler `csfb-g1-pg` ve `csfb-g1-minio` ile worktree `wtg1` silindi; kanıtı final mesajda.
- Dal SİLİNMEDİ.
- `csfb-80x-pg` (55880) bu görevin konteyneri değil; ona dokunulmadı.
