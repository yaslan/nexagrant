# TASK-MUM9RP3R6S13K — FB İNCELEME-15, pilot kapısı (b) (crw-fb)

Kod değiştirilmedi, push yok. Kapılar ayrık worktree'de koşuldu: `git worktree add --detach … dev` @ `03377c94`, kendi `node_modules`'u ve `prisma generate`'i vardı. İş bitince worktree kaldırıldı.

## Karar tablosu

| Kart | Görev | Ajan | Commit | Karar | Bulgular |
| ---- | ----- | ---- | ------ | ----- | -------- |
| 1 | TASK-MUM676F010E9G (OAuth onay çerezi, **PİLOT KAPISI**) | be-fb | `2ef3593e` | **ONAY**: B-1 kapandı, Ö-1 ve Ö-2 kapandı | K-8 (not) |
| 2 | TASK-MUM97IPC2QSGC (B3 elle tetikleme yalnız kapanmış ay) | se-fb | `03377c94` | **ONAY**: Ö-3 kapandı | K-9 (not) |
| 3 | TASK-MUM97PKOEUQBA (B4 PNG ikinci IHDR / bölünmüş IDAT) | fe-fb | `69e239ae` | **ONAY**: Ö-4 kapandı, K-6 uyum değişikliği | yok |

**Bloke eden bulgu yok. Pilot kapısı (b) açılabilir.** Aşağıdaki K-notları bilgi amaçlı. Hiçbiri pilotu durdurmuyor, hiçbiri için yeni kart şart değil.

## 1. Ne yapıldı

- Üç commit'in `src/` diff'ini satır satır okudum. İlk olarak en riskli yolu inceledim: OAuth signIn callback'i, `events.createUser` ve onay çerezinin yaşam döngüsü.
- **B-1 senaryosunu aynen yeniden koştum.** Kullandığım dosya, İNCELEME-13'te yazdığım `crw-repro-stale-ack.live.test.ts`. Önceki oturumun scratchpad'inden birebir kopyaladım, **tek satırı bile değişmedi.** Gerçek Auth.js callback'i ve sahte Google sağlayıcısıyla, `fabrika_app` rolünde koştu.
- be-fb'nin 5 yeni canlı testini, se-fb'nin dönem testlerini ve fe-fb'nin PNG testlerini tek tek, verbose modda koştum. Atlanan test yok.
- B4 PNG repro betiğimi (İNCELEME-13'teki `fuzz-png.mts`) 8 yeni kenar durumuyla genişlettim. Ardından 200.000 girdilik bayt-çevirme fuzz'ını yeniden koştum.
- B3 için Inngest'in `invoke` yolunu (`inngest/function.invoked`) SDK tiplerinden kontrol ettim. Ay sonu sınırını da koddan inceledim.
- Tam kapıyı koştum: typecheck, lint, i18n, üç RLS kapısı ve tüm test paketi.

## 2. Kanıt

### Kapılar (worktree @ `03377c94`, `set -a; source .env; set +a`)

| Kapı | Sonuç |
| ---- | ----- |
| `typecheck` | rc=0 |
| `lint` | rc=0 |
| `i18n:check` | rc=0: "both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text" |
| `rls:check` | rc=0: "every one of them carries ENABLE + FORCE + tenant_isolation in its own migration" |
| `rls:bypass-check` | rc=0: "no new tenant bypass … 0 still owed" |
| `rls:verify` | rc=0: "47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü" |
| `test` (tamamı) | rc=0: `Test Files 201 passed \| 2 skipped (203) · Tests 2336 passed \| 8 skipped (2344)`. Sayılar be-fb ve se-fb raporlarındakiyle aynı. 8 atlanan test dış API adaptörlerine ait (be-fb §2). |
| Üç kartın testleri tek tek (verbose) | `oauth-registration(.live)`, `social-action-disclosure`, `cobrand.test`, `report.test`, `agency-report.live`, `src/lib/inngest` → `Test Files 9 passed (9) · Tests 97 passed (97)`. **Atlanan test yok.** |

### Kart 1: B-1 yeniden koşusu (aynı test, aynı adımlar)

A `/kayit`'te kutuyu işaretler, Google'a gider ve vazgeçer. B aynı tarayıcıda, kutu işaretlemeden, yeni bir Google hesabıyla başlar ve callback'e döner.

Önceki tur (`9fbc81f8` / `eba04a23`, İNCELEME-13):
```
after A, ack cookie present: true
after B start, ack cookie present: true
callback -> 302 http://localhost:3000 session: true
B user created: true memberships: 1 consent rows: [privacy-notice …, terms-of-service …]
Tests  1 failed (1)
```

Bu tur (`03377c94`, `2ef3593e` dahil):
```
A action -> NEXT_REDIRECT
after A, ack cookie present: true
B action -> NEXT_REDIRECT
after B start, ack cookie present: false          ← işaretsiz başlatma çerezi siliyor
callback -> 302 http://localhost:3000/tr/kayit?error=disclosure_required session: false
B user created: false memberships: undefined consent rows: []
 ✓ … CRW-FB repro: a stale plain tick from A registers B, who never ticked (shared machine) 1021ms
      Tests  1 passed (1)
```

be-fb'nin regresyon testleri de bu koşuda yeşil. Senaryo 2 (dönen giriş çerezi harcar), e-posta bağlama (ret ve kabul), davetli kayıt ve Ö-1 locale testi aynı dosyada geçti:
```
✓ acknowledgement cookie is spent by every OAuth outcome (İNCELEME-13 B-1) > crw-fb's scenario: … refused, no user, no consent
✓ … > a returning login spends a parked tick (it was not ticked for this person)
✓ … > linking to an existing address spends it, and so does a refused link
✓ … > an invite registration spends a stray plain tick as well
✓ … > Ö-1: an invite registration records the consent in the language it was read in
```

Temizlik sonrası DB (`fabrika-postgres`, `fabrika`): `users|0 · tenants|0` (`oauth-%` önekli satır kalmadı).

### Kart 3: B4 PNG repro (İNCELEME-13 betiği + 8 yeni vaka)

```
valid+tEXt                           OK stored=68 hasSECRET=false hasScript=false
second IHDR 5000x5000 after first    REJECT badPng        ← İNCELEME-13'te "OK stored=93" idi (Ö-4)
IDAT before IHDR                     REJECT badPng
IEND + trailing html                 REJECT badPng
private chunk with html              OK stored=68 hasSECRET=false hasScript=false
no IDAT                              REJECT badPng
huge length field                    REJECT badPng
IHDR after IDAT                      REJECT badPng        (yeni)
same-size 2nd IHDR                   REJECT badPng        (yeni)
IDAT IDAT (run)                      OK stored=91         (yeni: meşru bölünmüş IDAT dizisi kabul)
IDAT tEXt IDAT                       REJECT badPng        (yeni)
IDAT gAMA IDAT                       REJECT badPng        (yeni)
IDAT htMl IDAT                       REJECT badPng        (yeni)
IDAT tEXt IEND (ok, dropped)         OK stored=68 hasSECRET=false   (yeni: IDAT'tan sonraki metadata atılıyor, dosya reddedilmiyor)
IDAT IEND IDAT (trailing)            REJECT badPng        (yeni)
fuzz 200000: accepted 0 bad 0
```

Fuzz sonucu önceki turdaki gibi yalnız "çökmüyor" bilgisini veriyor. Her bayt çevirme CRC'yi bozduğu için hiçbir girdi kabul edilmiyor. Yapıya ilişkin kanıt elle kurulan vakalardan geliyor.

### Kart 2: B3 dönem kilidi

- `report.test.ts` testleri verbose koşuda yeşil: "always the last closed month", "earlier closed month is refused", "no period, a bad period or an extra key is refused" ve "open month: throws before reading or writing anything". `agency-report.live` testi `fabrika_app` rolüyle yeşil.
- se-fb'nin gerçek Inngest koşusu (raporu §2): yüksüz, açık ay ve eski ay olayları `Failed` oldu, 0,5 sn içinde tek denemeyle bitti. Kapanmış ay iki kez gönderildi, 7 satır yazıldı. Bu koşuyu tekrarlamadım: kod yolu koddan ve birim testlerden doğrulanıyor, ayrıca canlı Inngest dev sunucusu ayağa kaldırmak paylaşılan makinede port çakışması riski taşıyor.

## 3. Bulgular

### Kart 1: TASK-MUM676F010E9G (be-fb): ONAY

- **B-1 kapandı.** Çerez iki yerden silinir, dolayısıyla iki savunma hattı var:
  1. `loginWithSocialAction` her işaretsiz başlatmada çerezi siler. Davet kodlu başlatma da bu gruba girer.
  2. signIn callback, `plainRegistration` dışındaki her kararda (izin ya da ret) çerezi siler.

  Düz kayıtta çerezi okuyup silen tek yer `events.createUser`. Pending olmayan dalda da silme eklendi.
- Yaklaşım, benim ikinci önerimden (değeri `createdByAdapter`'a taşımak) farklı: kararın tipine bir bayrak konuyor. Bu daha sade, ve istekler arasında paylaşılan modül durumu gerektirmiyor. Kabul.
- **Ö-1 kapandı.** Davetli kayıtta `locale` imzalı davet çerezinden geliyor ve `tr|en`'e daraltılıyor. Canlı testte üç Consent satırının üçü de `en`.
- **Ö-2 kapandı.** `t('disclosureRequiredAgency')` kullanılıyor, `i18n:check` yeşil.

**K-8 (not, bloke etmez): çerezin hâlâ kalabildiği dar bir yol.** Karar `plainRegistration` olur, ama ardından adapter'ın `createUser`'ı hata verirse (DB kesintisi ya da eşzamanlı aynı e-posta) `events.createUser` hiç çağrılmaz. Bu durumda çerez 15 dakikalık ömrü boyunca kalır.

Bu kalıntının başka birinin kaydına geçmesi için sonraki kişinin uygulamanın düğmesini kullanmaması gerekir. Düğme işaretsiz başlatmada çerezi zaten siliyor. Geriye yalnız elle kurulan bir `POST /api/auth/signin/google` isteği (CSRF token'ıyla) kalıyor. `pages.signIn` yalnız GET sayfasını yönlendiriyor. POST yolunun proxy'de kapalı olup olmadığını **doğrulamadım**; bu bir varsayım.

Pratik risk düşük: iki bağımsız koşulun aynı anda gerçekleşmesi gerekiyor ve kişinin kasıtlı olarak form dışı bir istek yapması lazım. İstenirse şöyle kapatılabilir: signIn callback'te düz kayıtta çerezi okuyup hemen silmek, okunan değeri `createdByAdapter` girdisiyle `events.createUser`'a taşımak. Ayrı kart şart değil.

**Ö-2 hakkında be-fb'nin kendi risk notu:** Test `getTranslations`'ı next-intl'in `createTranslator`'ıyla değiştiriyor. Gerçek react-server bağlamındaki tıklamayı ben de koşmadım. Aynı çağrı biçimi `src/lib/modules/guard.tsx`'te sunucu tarafında zaten çalışıyor. Risk düşük, kabul.

### Kart 2: TASK-MUM97IPC2QSGC (se-fb): ONAY

- **Ö-3 kapandı.** Açık ay hiçbir yoldan üretilemiyor. Dönem üç yerde kontrol ediliyor: olay şeması (`.strict()`, `YYYY-MM`), `requestedReportPeriod` ve kütüphane içindeki `assertLastClosedPeriod`. Bu sayede gelecekte eklenecek bir çağıran da açık ayı yazamaz. Ret `NonRetriableError`'a çevriliyor.
- "Yalnız son kapanmış ay" kuralı benim önerimden daha sıkı. Gerekçesi doğru: eski bir ay için üretilen rapor, bugünün kümülatif sayılarını o ayın adıyla saklar.
- Inngest `invoke` ile tetiklenen koşu (`inngest/function.invoked`, SDK 4.18.1 `types.d.ts:1858`) `event.name` kontrolüne takılmıyor ve cron dalına düşüyor. Sonuç yine `reportPeriod(now)`, yani son kapanmış ay. Güvenli tarafa düşüyor. Bulgu yok.

**K-9 (not, bloke etmez):** Ay sonu sınırı. 30 Eylül 23:59 UTC'de `{period:"2026-08"}` gönderilir ve koşu 1 Ekim 00:00'dan sonra başlarsa, `now`'a göre kapanmış ay `2026-09` olur. Olay `NonRetriable` olarak düşer. Hata mesajı doğru ayı söylüyor ve 1 Ekim 06:00 cron'u `2026-09`'u zaten üretiyor. Veri kaybı ya da yanlış veri yok; yalnız operatör kafa karışıklığı. İşlem gerekmiyor.

### Kart 3: TASK-MUM97PKOEUQBA (fe-fb): ONAY

- **Ö-4 kapandı.** Kurallar şunlar:
  - IHDR yalnız ilk chunk olabilir. Sonraki her IHDR, IDAT'tan sonra gelen de dahil, reddediliyor.
  - IDAT'lar tek ve kesintisiz bir dizi olmalı. Araya giren chunk atılacak türden olsa da saklanacak türden olsa da dosya reddediliyor.
  - Meşru bir IDAT dizisi kabul ediliyor. IDAT'tan sonra, IEND'den önce gelen metadata atılıyor ama dosya reddedilmiyor.

  Mantık kontrolü: `idatEnded`, ilk IDAT görüldükten sonra gelen ilk IDAT olmayan chunk'ta (IEND dahil) set ediliyor. IEND'den sonra döngü `break` ediyor, sondaki veri `pos !== buf.length` ile ayrıca reddediliyor. Doğru.
- **K-6:** `env.NODE_ENV` değişikliği CLAUDE.md'ye uyum için yapıldı. fe-fb, bunun yanlış başlatılmış bir üretim sunucusu senaryosunu kapatmadığını kendi raporunda dürüstçe yazmış. Katılıyorum. Açık bayrak (`DEV_OBJECT_STORE`) kararı liderde kalmalı; pilotu etkilemiyor.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUM9RP3R6S13K-crw-fb.md` (bu rapor). Kod değişikliği yok.

## 5. Riskler

- K-8: çerezin kalabildiği dar yol. İki koşul aynı anda gerekiyor ve biri kasıtlı form dışı istek.
- Google OAuth'un gerçek hesapla uçtan uca son adımı hâlâ insan bekliyor (be-fb İNCELEME-13 raporu §6). Benim kanıtım sahte sağlayıcıyla, ama gerçek Auth.js callback'i ve gerçek DB rolü üzerinden.
- Paylaşılan ağaçta başka ajanların commit'lenmemiş dosyaları var (`.env.example`, `README.md`, `docs/ROADMAP.md`, `docs/legal/*`, `FON_BRIDGE.md`). Bunlara dokunulmadı; commit yalnız bu raporu içeriyor.

## 6. Açık sorular

- K-8 için ayrı bir sertleştirme kartı istenir mi? Önerim hayır: pilot için gerekli değil. Proxy'de `POST /api/auth/signin/*` yolu kapatılacaksa (Auth.js'in varsayılan sayfası zaten kapalı) iki iş birlikte ele alınabilir.

## 7. Sonraki adım

- Üç kart `done` olabilir. Pilot kapısı (b) açık.
- K-6'daki açık bayrak (fe-fb §5) ve K-7 (`jsonb_set`) kararı liderde.

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node 26.5, Docker `fabrika-postgres`, `fabrika_app` rolü). İncelenen kod platformdan bağımsız: çerez ve Auth.js callback'i, UTC tarih aritmetiği, zod, Inngest işlevi ve saf `Buffer`/`crc32` bayt işleme. Dosya yolu, süreç, kabuk ya da ekran bağımlılığı yok. `storage.ts` `devObjectPath` yolu değişmedi. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var. Koddan bakıldığında davranış farkı beklenmiyor; CI (Linux) aynı vitest kapılarını koşuyor.
