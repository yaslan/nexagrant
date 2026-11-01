# TASK-MUM74TE5F3K44 — FB İNCELEME-13 (crw-fb)

Kod değiştirilmedi, push yok. Kapılar ayrık worktree'de koşuldu (`git worktree add --detach` @ `9cd87b8f`, kendi `node_modules`'u). Paylaşılan ağaçta fe-fb ve be-fb aynı anda çalışıyordu. İnceleme sürerken be-fb `15f70b0d` + `eba04a23`'ü (TASK-MUM74FUB1DRCM) gönderdi. B-1'i bu yeni HEAD'de de yeniden koştum; bulgu hâlâ tekrar üretiliyor.

## Karar tablosu

| Kart | Görev | Ajan | Commit'ler | Karar | Bulgular → kime |
| ---- | ----- | ---- | ---------- | ----- | --------------- |
| 1 | TASK-MULRR08Y9YI77 (B3 bölge raporu) | se-fb | `d091cf72` `8d448fa8` | **ONAY** | Ö-3 → se-fb |
| 2 | TASK-MULQLQIE3ES6G (prompt'lar dosyada + M9 `opportunityId`) | be-fb | `9a669d60` `3e7bf7ac` `2cc3fdf0` | **ONAY** | yok (K-5 not) |
| 3 | TASK-MULRRNIHVZM1Z (B4 ortak marka) | fe-fb | `0dde7031` `edfa581e` `abbbd818` `5ac3c6cc` `c5aa48d7` | **ONAY** | Ö-4, K-6, K-7 → fe-fb |
| 4 | TASK-MUM676F010E9G (OAuth-only kayıt, **PİLOT KAPISI**) | be-fb | `9fbc81f8` | **DÜZELTME GEREKLİ** | **B-1**, Ö-1, Ö-2 → be-fb |

**Bloke eden tek bulgu B-1.** Bir kişi kutuyu hiç işaretlemeden kayıt olabiliyor ve adına "aydınlatma metnini okudu" diyen Consent satırları yazılıyor. ADR-0006'nın "Onay, Consent kaydına belge sürümüyle yazılır" şartını bozuyor. Düzeltmesi küçük; aşağıdaki test regresyon testi olarak kullanılabilir. Kart 1-3'te bloke eden bulgu yok.

## 1. Ne yapıldı

- Dört kartın diff'ini satır satır okudum. En riskli yoldan başladım: OAuth kaydı, çerezler, signIn callback'i, adapter, Consent yazımı.
- Tam kapıyı ayrık worktree'de koştum.
- B-1'i gerçek Auth.js callback'i üzerinden, `fabrika_app` rolüyle çalışan canlı bir testle tekrar ürettim. Test be-fb'nin kendi harness'i, sahte Google sağlayıcısı kullanıyor. Aynı testi `9fbc81f8`'de ve `eba04a23`'te koştum.
- B3 için MILP saldırganımı pano ve raporun birlikte yayımlandığı modele uyarladım: 1.200 tablo ve iki pozitif kontrol.
- B4 PNG temizleyicisini kenar durumlarla ve 200.000 bayt-çevirme fuzz'ıyla denedim.
- Prompt taşımasında snapshot dosyasının `9a669d60`'dan beri değişmediğini git ile doğruladım.
- Auth.js e-posta normalizasyonunu `node_modules`'ta kontrol ettim (hesap ele geçirme var mı diye).

## 2. Kanıt

### Kapılar (worktree @ `9cd87b8f`, `set -a; source .env; set +a`)

| Kapı | Sonuç |
| ---- | ----- |
| `typecheck` | rc=0 |
| `lint` | rc=0 |
| `i18n:check` | rc=0: "both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text" |
| `rls:check` | rc=0: "every one of them carries ENABLE + FORCE + tenant_isolation" |
| `rls:bypass-check` | rc=0: "no new tenant bypass … 0 still owed" |
| `rls:verify` | rc=0: "47 kiracıya özel tabloda … fabrika_app rolüyle GERÇEKTEN ölçüldü" |
| `test` (tamamı) | rc=0: `Test Files 200 passed \| 2 skipped (202) · Tests 2314 passed \| 8 skipped (2322)` |
| Dört kartın testleri tek tek | `oauth-registration(.live)`, `agency-report.live`, `report.test`, `m9-brief-opportunity.live`, `prompt-snapshots`, `prompts.test`, `cobrand(.actions).test`, `funnel.attack` → `Test Files 10 passed (10) · Tests 116 passed (116)`. **Atlanan test yok.** |

### B-1: kutuyu işaretlemeyen kişi adına Consent yazılıyor (canlı, `fabrika_app`)

Testin gövdesi. be-fb'nin `tests/oauth-registration.live.test.ts` harness'inin üstüne eklenebilir:

```ts
const plain = lib.consent.registrationAcknowledgementToken();
// A: /kayit, kutuyu işaretler, Google'a tıklar, Google'ın onay ekranında vazgeçer.
try { await loginWithSocialAction('google', '/tr/dashboard', plain); } catch {}
// B: aynı tarayıcı, "Giriş Yap" sekmesi, kutu yok, YENİ bir Google hesabıyla Google'a tıklar.
try { await loginWithSocialAction('google', '/tr/dashboard', undefined); } catch {}
const res = await callback('google', { sub: `${RUN}-b`, email, email_verified: true });
expect(res.location ?? '').toContain('error=disclosure_required');   // ← KIRMIZI
```

Çıktı (`9fbc81f8` ve `eba04a23`'te aynı):

```
after A, ack cookie present: true
B action -> NEXT_REDIRECT            ← B'nin başlatması onay çerezine dokunmadı
after B start, ack cookie present: true
callback -> 302 http://localhost:3000 session: true
B user created: true memberships: 1 consent rows:
  [{"documentId":"privacy-notice","documentVersion":"2026-09-10.1","kind":"DISCLOSURE_ACK"},
   {"documentId":"terms-of-service","documentVersion":"2026-09-10.1","kind":"TERMS_ACCEPTANCE"}]
Tests  1 failed (1)
```

Pozitif kontrol: A'nın çerezi olmadan aynı B çağrısı reddediliyor. Bu, be-fb'nin kendi testi "no acknowledgement at all (no cookie): refused, no user"; bu koşuda da yeşil. Test verisi temizlendi (`leftover [] · agencies left 0`).

### B3: pano + rapor birlikte, MILP (D = 0)

- **Kurulum:** İNCELEME-12'deki `milp2.py` + üreteç, HEAD `9cd87b8f`'e uyarlandı. Script'ler scratchpad'de: `b3-gen.ts`, `milp-b3.py`, `run-b3.sh`.
- **Yayın:** Her tabloda panonun üç yanıtı var: kırılımsız, tür ve her il. Bunlara `buildAgencyReport`'un **kendi çıktısı** ayrı bir yayın olarak (`R#…`) ekleniyor. Davet kodu paneli yalnız durumu gösteriyor; B1 sonrası kullanım sınırı yok. Σ kod kullanımı = kayıt (D = 0).
- **Eşitlik kontrolü:** Üreteç her tabloda raporun her hücresini panonun aynı hücresiyle karşılaştırıyor. Ayrıca "listelenmeyen ama panoda sayı gösteren il" arıyor.

| Koşu | Tablo | Rapor ≠ pano | Sızan tablo | Küçük hedef | solver_warn |
| ---- | ----- | ------------ | ----------- | ----------- | ----------- |
| **HEAD**: 2 üreteç × 3 kod gruplaması × 2 dağıtım | 1.200 | **0** | **0** | 142.775 | 4 → yeniden çözüldü, 0 |
| Pozitif kontrol 1 (`MUT=raw`): rapor gösterdiği hücrelerin ham sayısını basar | 140 | 0 | 0 | — | 0 |
| Pozitif kontrol 2 (`MUT=small`): rapor "<5" hücreleri ham basar | 20 | — | **19** | 1.521 | 0 |

- `solver_warn=4`: hepsi tek bir tablodan (`cell type six seed=53009 inst=31`). HiGHS sayısal olarak "infeasible" dedi. Oysa gerçek değerin olurlu olduğu betikte assert ediliyor. `presolve=False, mip_rel_gap=0` ile yeniden çözüldü: `small_targets=37 leaking=0 solver_warn=0`.
- Kontrol 1'in 0 çıkması bilgi veriyor: panonun tamamlayıcı gizlemesi, gösterilen hücrelerin **ham** değerleri bilinse bile küçük hücreyi açmıyor. 5'e yuvarlama ikinci savunma hattı. Kontrol 2 harness'in rapor yayınını gerçekten okuduğunu gösteriyor.

### B4: PNG temizleyici

```
valid+tEXt                           OK stored=68 hasSECRET=false
second IHDR 5000x5000 after first    OK stored=93                  ← Ö-4
IDAT before IHDR                     REJECT badPng
IEND + trailing html                 REJECT badPng
private chunk with html              OK stored=68 hasScript=false   ← chunk atıldı
no IDAT                              REJECT badPng
huge length field                    REJECT badPng
fuzz 200000: accepted 0 bad 0        ← 200 bin bozuk girdide hiç exception yok
```

Fuzz'da her bayt çevirme CRC'yi bozduğu için hiçbir girdi kabul edilmedi. Yani fuzz yalnız "çökmüyor"u kanıtlıyor; kabul edilen çıktının yapısını kanıtlamıyor. Yapıyı elle kurulan vakalar gösteriyor.

### Prompt taşıması: bayt eşitliği

```
$ git diff --stat 9a669d60 9cd87b8f -- tests/__snapshots__/prompt-snapshots.test.ts.snap tests/prompt-snapshots.test.ts
(boş: snapshot ve test, eski koda karşı yazıldıkları günden beri değişmedi)
```

Tam koşuda `prompt-snapshots` yeşil. `llm`'i import eden 9 dosyadan 8'i `renderPrompt` kullanıyor. Dokuzuncusu `admin/settings/page.tsx`; yalnız `DEFAULT_MODELS` alıyor, prompt yok.

### Auth.js e-posta normalizasyonu (ele geçirme yok)

`@auth/core/lib/actions/callback/oauth/callback.js:225`: `email: userFromProfile.email?.toLowerCase()`. `decideOAuthSignIn` da küçük harfe çeviriyor, yani iki arama aynı anahtarla yapılıyor. Büyük/küçük harf farkıyla doğrulama kapısının atlanması mümkün değil. Bulgu yok.

## 3. Bulgular

### Kart 4 — TASK-MUM676F010E9G (be-fb, OAuth-only, PİLOT KAPISI): DÜZELTME GEREKLİ

**B-1 (BLOKE EDER, KVKK kaydı).** Onay çerezi, işaretsiz bir OAuth başlatmasında silinmiyor. Bir sonraki kişinin kaydı bu çerezle geçiyor ve o kişi adına sahte bir Consent satırı yazılıyor.

- **Kod:** `src/lib/actions/auth.ts:150-152`: `if (acknowledged) await setRegistrationAcknowledgementCookie();`. `else` dalında silme yok. Aynı fonksiyonun yorumu tersini söylüyor: "Every cookie is written or cleared on every start, so nothing from an earlier attempt on a shared machine rides along." Davet, il ve karne çerezleri gerçekten her başlatmada yazılıyor ya da siliniyor; yalnız onay çerezi silinmiyor.
- **Çerezin silindiği yerler yalnız iki:**
  - `auth.ts` adapter'ında davetli kayıt (`:158`)
  - `events.createUser` 'pending' dalı (`:694`)

  signIn'in `accountExists` dalında ve e-posta ile bağlama dalında silinmiyor. `15f70b0d` il ve karne çerezlerini bu dallarda da siliyor, ama onay çerezini değil.
- **Senaryo 1 (kanıtlandı):**
  1. Belediyede ortak bir bilgisayar kullanılıyor. A `/kayit`'te kutuyu işaretleyip Google'a gidiyor ve onay ekranında vazgeçiyor.
  2. 15 dakika içinde B `/giris`'ten (kutu yok) yeni bir Google hesabıyla giriyor.
  3. `decideOAuthSignIn` → `readAcknowledged()` true → kayıt kabul ediliyor.
  4. `events.createUser`, B adına `privacy-notice` ve `terms-of-service` satırlarını yazıyor.

  be-fb'nin kendi raporu bu yolun reddedileceğini söylüyor ("Giriş Yap sekmesinden yeni bir Google hesabıyla gelen kişi `/kayit?error=disclosure_required` sayfasına gidiyor"). Reddedilmiyor.
- **Senaryo 2 (koddan):** A'nın hesabı zaten var ama yanlışlıkla "Kayıt Ol"da kutuyu işaretleyip Google'la giriyor. `accountExists` → izin verilir, çerez silinmez. Girişi **başarılı** olduğu halde çerez 15 dakika kalıyor ve Senaryo 1'in 2-4. adımları aynen işliyor.
- **Neden bloke:** `events.createUser`'daki yorumun kendisi söylüyor: "a fabricated one is a false answer to an audit". ADR-0006 ve pilot kapısı TASK-MULWCFBTHDYZI'nin kabul şartı tam olarak bu kaydın doğruluğu.
- **Düzeltme önerisi:**
  1. `loginWithSocialAction`'da `acknowledged` false ise `clearRegistrationAcknowledgementCookie()` çağır. Asıl düzeltme bu.
  2. signIn callback'inde kararın hemen ardından (izin ya da ret) `readAcknowledged`'ın sonucunu bir kez okuyup çerezi sil; tüketen tek yer burası olsun. Yeni kayıtta `events.createUser` bu değeri okuyamayacağı için okunan değeri `createdByAdapter` girdisine taşımak gerekir. Bu karmaşıksa en azından `accountExists` ve e-posta bağlama dallarında silmek yeterli.
  3. Yukarıdaki test, `oauth-registration.live.test.ts`'e regresyon testi olarak eklensin. Varsayılan Auth.js sayfası `15f70b0d` ile kapandı. B-1 o sayfaya ihtiyaç duymuyor; uygulamanın kendi düğmesiyle tekrar üretiliyor.

**Ö-1 — Davetli kayıtta Consent `locale` sabit `'tr'`.** `oauth-registration.ts` `bootstrapOAuthTenant` → `writeRegistrationConsent(..., locale: 'tr')`. Yorumu "The OAuth round trip does not carry the locale" diyor. Ancak davetli yolda imzalı çerez `invite.locale`'i taşıyor (`registration-invite-cookie.ts`, `RegistrationInvite.locale`) ve ret yönlendirmesinde kullanılıyor.

- Senaryo: `/en/kayit?kod=…` üzerinden İngilizce metni okuyup onaylayan kişinin kaydı `locale='tr'` olarak yazılıyor. Denetimde yanlış dil kanıtlanmış olur.
- Öneri: `registerOAuthUserWithInvite`'a `locale: invite.invite.locale` geçirmek. Düz yolda `'tr'` kalabilir ya da onay çerezine locale eklenebilir.

**Ö-2 — Sunucu eyleminde gömülü TR/EN hata metni.** `src/lib/actions/auth.ts` `loginWithSocialAction` → `locale === 'tr' ? 'Devam edebilmek için…' : 'To continue…'`. CLAUDE.md kural 8 ("sabit metin yok; `t()`") ihlal ediliyor.

- Aynı metin `messages/*.json` `Auth.disclosureRequiredAgency`'de zaten var. `i18n:check` bunu yakalamadı; kontrol sunucu eylemlerindeki dizeleri taramıyor olabilir.
- Öneri: `getTranslations('Auth')` ile anahtardan okumak. İstemci metni zaten o anahtardan gösteriyor.

Doğrulanan ve sorunsuz noktalar:

- İmzalı çerez: HMAC, etiketle türetilmiş anahtar, `timingSafeEqual`, imzalı `exp`.
- `decideOAuthSignIn` sırası: bağlı hesap → e-posta bağlama → kayıt.
- Deneme kullanımı (`probeInviteCode`) her zaman geri alınan bir transaction içinde; ret sayılıyor.
- Tek transaction'lı davetli kayıt, sahte kullanıcı fallback'i yok.
- `createdByAdapter` ile ikinci boş kiracı hatası kapandı.
- Entra yalnız anahtarlarla kaydediliyor; `xms_edov` yoksa bağlama reddediliyor.
- Google `email_verified` + adres eşleşmesi.

### Kart 1 — TASK-MULRR08Y9YI77 (se-fb, B3): ONAY

- **Rapor yeni sayı üretmiyor.** Tek okuma `readAgencyFunnelRaw` (panonun sorgusu). Görünümler aynen `buildAgencyFunnel` yanıtları. MILP'te 1.200 tabloda rapor ≠ pano = 0, sızıntı 0.
- **"Yalnız sayı gösteren iller" kuralı doğru.** Tamamı "<5" olan il ile kurumu olmayan il panoda ayırt edilemiyor; listelemek bilgi eklerdi. Üreteçte "listelenmeyen ama panoda sayı gösteren il" = 0.
- **Zaman boyutu:** Aylık anlık görüntü panonun o anki yanıtı. Ajans aynı yanıtı panodan her gün kendisi de alabiliyor, bu yüzden arşiv yeni bir fark saldırısı yüzeyi açmıyor. Pencereler iç içe değil, kohort kümülatif (iç içe pencere farkı saldırı sınıfı burada yok).
- **Uç nokta:** Kiracı oturumdan geliyor, `withTenant` + `tenantId` koşulu uygulanıyor. Başka ajansın id'si 404; `no-store`, `nosniff`. HTML'de ajans adı kaçışlanıyor (testli). Şema `.strict()` ve yalnız 5'in katlarını kabul ediyor.
- **Ö-3 — Elle tetikleme o ayın raporunu kalıcı olarak yarım bırakıyor.** `reportPeriod(now)` = "dünün ayı". `generateAgencyReports` aynı `target` varsa atlıyor.
  - Senaryo: 15 Ekim'de `agency/report.generate` gönderiliyor → `target='2026-10'` yazılıyor (15 günlük veri). 1 Kasım cron'u `2026-10`'u "zaten var" diye atlıyor. Ekim raporu kalıcı olarak ayın ortasını gösteriyor.
  - se-fb bunu Riskler'de yazmış. Ancak etiket "kapanan ay" diye sunulduğu için yanlış bir resmî belge üretir.
  - Öneri: elle tetiklemeyi yalnız kapanmış ayla sınırlamak (`period < ay(now)`) ya da elle üretilen satırı cron'un üzerine yazmasına izin vermek. En azından olay yükü dönemi açıkça alsın.
- **K-4:** Tekrar koruması uygulama düzeyinde; elle eşzamanlı tetiklemede çift satır teorik olarak mümkün. se-fb yazmış, sayılar aynı olduğu için zararsız.

### Kart 2 — TASK-MULQLQIE3ES6G (be-fb, prompt'lar + M9): ONAY

- **Prompt:** 14 prompt dosyada. Tek yükleyici `renderPrompt`: eksik değişken ya da bildirilmemiş yer tutucu hata fırlatıyor, `$&` genişletmesi yok. `promptLocale` sırası başlık → çerez → `tr`, sonra `en`'e düşüyor. Snapshot eski koda karşı yazıldığı `9a669d60`'dan beri **değişmedi** ve HEAD'de yeşil. Bayt eşitliği kanıtlı. Çağrı noktalarında prompt metni kalmadı.
- **M9:**
  - `opportunityId` bir FK, `ON DELETE SET NULL`, index'li. Migration idempotent, `.down.sql` var, `apply-order` sonunda.
  - `generateMeetingBrief`, başka kiracının fırsat id'sini LLM çağrısından **önce** `withTenant` + `tenantId` ile reddediyor (kredi harcanmıyor).
  - Sayfa yalnız bu fırsatın ve bağsız olanların brief'lerini okuyor; iki sorgu da `tenantId` koşullu.
  - Canlı test atlanmadan geçti.
- **K-5:** `brief-lists.ts` interaktif transaction içinde `Promise.all` kullanıyor. Prisma bunu destekliyor, sorgular sırayla koşar. Davranış doğru, yalnız bilgi.

### Kart 3 — TASK-MULRRNIHVZM1Z (fe-fb, B4): ONAY

- **Sanitizer:**
  - Tür baytlardan okunuyor; SVG ve yeniden adlandırılmış SVG reddediliyor.
  - IEND sonrası veri ve bozuk CRC reddediliyor.
  - `tEXt` ve özel chunk'lar atılıyor (yukarıdaki kanıtta HTML içeren özel chunk atıldı).
  - Sunucu görüntüyü çözmüyor, yani sıkıştırma bombası yüzeyi yok.
- **Erişim:**
  - URL'de id yok; logoyu oturumun kiracısı belirliyor: ajansın kendisi ya da bağlı olduğu ajans.
  - Başka ajansın logosu istenemiyor.
  - Başlıklar: `image/png`, `nosniff`, `CSP default-src 'none'; sandbox`, `private`.
  - Yetki: rol kontrolü sunucu eyleminde yapılıyor (OWNER ve ADMIN); mutasyonla kanıtlanmış.
  - Silinen ajans logoyu göstermiyor.
- **Ö-4 — İkinci bir IHDR kabul ediliyor ve 1024 px sınırını atlıyor.** Yalnız ilk chunk'ın boyutu denetleniyor (`first`). Sonraki `IHDR` de `KEPT_CHUNKS`'ta.
  - Kanıt: 2×1 IHDR + 5000×5000 IHDR → `OK stored=93`.
  - Tarayıcılar çift IHDR'li dosyayı bozuk sayıp çizmiyor, bu yüzden güvenlik etkisi yok. Sonuç: bağlı kurumlar kırık bir logo görür ve dosya "geçerli PNG" diye saklanır.
  - Öneri: IHDR'yi yalnız ilk chunk olarak kabul et, sonrakini `badPng` say. İstenirse IDAT'ların ardışık olmasını da denetle.
- **K-6:** `storage.ts` `devObjectPath` üretim kilidi için `process.env.NODE_ENV`'i doğrudan okuyor. CLAUDE.md "Yapma" listesi `src/lib/env.ts` kullanımını istiyor.
  - Next, önceden verilmiş `NODE_ENV`'e dokunmuyor. `NODE_ENV=test next start` gibi yanlış bir üretim başlatmasında, R2 yoksa logolar instance diskine yazılır.
  - Etkisi düşük: veri gizli değil, yalnız kaybolabilir.
- **K-7:** `saveAgencyCoBrand` ayarları oku → birleştir → yaz deseniyle, transaction dışında güncelliyor. Aynı deseni `sso.ts` de kullanıyor. İki yönetici aynı anda SSO ayarını ve ortak markayı değiştirirse biri kaybolur. Olasılık çok düşük; ileride `jsonb_set` ya da satır kilidi düşünülebilir.

## 4. Değişen dosyalar

Yalnız bu rapor: `docs/agent-results/TASK-MUM74TE5F3K44-crw-fb.md` (+ aynı içerik `/Users/macbook/alan/docs/agent-results/` altında). Kod değişikliği yok.

Scratchpad'deki test ve script'ler repoya girmedi: `crw-repro-stale-ack.live.test.ts`, `b3-gen.ts`, `milp-b3.py`, `run-b3.sh`, `fuzz-png.mts`.

## 5. Riskler

- B-1 düzeltilmeden pilot açılırsa, ortak bilgisayarda (belediye, ajans ofisi) kutuyu hiç görmemiş kişiler adına Consent kaydı oluşabilir. Kayıt gerçek bir onaymış gibi görünür.
- Google OAuth'un uçtan uca son adımı (gerçek hesapla callback'e dönüş) hâlâ insan bekliyor; be-fb raporu §6. Benim B-1 kanıtım sahte sağlayıcıyla ama gerçek Auth.js callback'i üzerinden.

## 6. Açık sorular

- B-1 düzeltmesi TASK-MUM676F010E9G'ye mi dönsün, yoksa aynı alandaki TASK-MUM74FUB1DRCM takip kartına mı eklensin? Önerim: pilot kapısı kartı `review`'da kalsın, düzeltme ayrı küçük bir commit olsun, kart o commit'le kapansın.

## 7. Sonraki adım

- **be-fb:** B-1 (bloke eder) + regresyon testi; Ö-1, Ö-2.
- **se-fb:** Ö-3.
- **fe-fb:** Ö-4; K-6 ve K-7 isteğe bağlı.
- B-1 düzeltmesi gelince aynı testle kısa bir yeniden onay yaparım.

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26.5, yerel Postgres, `fabrika_app` rolü). Kapsanan kod platformdan bağımsız: çerez, HMAC, Postgres, Next route, saf TS/PNG bayt işleme. Tek dosya yolu B4'ün geliştirme yedeği `${cwd}/.dev-objects/<key>`; `/` ayırıcısını Node Windows'ta da kabul ediyor. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var. Koddan bakıldığında davranış farkı beklenmiyor. MILP scipy 1.13.1 / HiGHS ile koşuldu.
