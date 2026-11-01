# TASK-MUM97YNXRH61 — FB İNCELEME-14 (crw-fb)

Kod değiştirilmedi, push yok. Kapılar ayrık worktree'de koşuldu (`git worktree add --detach` @ `9db8ba90`, kendi `node_modules`'u, `.env` kopyası). Paylaşılan ağaçta başka ajanların commit'lenmemiş işi vardı (`auth.ts`, `report.ts` vb.); bu incelemeye girmedi. Kart açıklamasını board aracından okuyamadım (`list_tasks` yalnız başlık döndürüyor). Kapsamı başlıktan, görev metninden ve İNCELEME-12 raporundan (`TASK-MUM5YQCBNF5QW-crw-fb.md`) çıkardım.

İnceleme sürerken be-fb `2ef3593e`'ü (İNCELEME-13 B-1, kapsam dışı) gönderdi. Bu commit `auth.ts`'e 10 satır ekliyor. `clearRegistrationChoiceCookies()` geçişleri `15f70b0d` ile aynı sayıda (6) duruyor; Kart 1 kararını etkilemiyor. Onu ayrıca incelemedim.

## Karar tablosu

| Kart | Görev | Ajan | Commit | Karar | Bulgular → kime |
| ---- | ----- | ---- | ------ | ----- | --------------- |
| 1 | TASK-MUM74FUB1DRCM (Ö-1 çerezler + signin sayfası, K-5, K-6) | be-fb | `15f70b0d` | **ONAY** | Ö-1 (M2 testi, hazır test aşağıda), K-1, K-2 → be-fb · K-3 → fe-fb |
| 2 | TASK-MUM743H8P5QFK (K-1, K-2, Ö-2, K-7) | fe-fb | `6f07ce7b` | **ONAY** | yok |
| 3 | TASK-MUM3WSS7DOGJL 2. tur (B-1, B-2, K-8, K-9) | cs-fb | `afeead2c` | **ONAY** | K-4 → cs-fb (fe-fb sonrası :145 cümlesi yazılmamış) |

**Bloke eden bulgu yok.** İNCELEME-13 B-1 (onay çerezi) kapsam dışı; be-fb ayrıca düzeltiyor.

## 1. Ne yapıldı

- Üç commit'in diff'ini satır satır okudum. En riskli yoldan başladım: `auth.ts` adaptörü, `signIn` callback'i, `events.createUser`, `pages.signIn`.
- Tam kapıyı ayrık worktree'de koştum.
- **M2 sorusu için** deterministik bir canlı test yazdım (commit'lenmedi). Test, kodu signIn yoklaması ile adaptör arasında öldürüyor. M2 mutasyonunu bu test yakalıyor.
- `pages.signIn` yan etkilerini :3000'deki dev sunucusuna curl ile denedim: açık yönlendirme ve `GET /signin/<sağlayıcı>` davranışı.
- K-6 yayın notundaki kontrol sorgusunu yerel Postgres'te koştum.
- fe-fb'nin `lastExpiryDay` sınırını iki ek mutasyonla denedim. Koşullu ipucunu canlı SSR çıktısında kontrol ettim.
- cs-fb'nin metin değişikliklerini (`--word-diff`) koda karşı tek tek kontrol ettim.

## 2. Kanıt

### Kapılar (worktree @ `9db8ba90`, `set -a; source .env; set +a`)

| Kapı | Sonuç |
| ---- | ----- |
| `db:generate` | rc=0 |
| `typecheck` | rc=0 |
| `lint` | rc=0 |
| `i18n:check` | rc=0 |
| `rls:check` | rc=0 |
| `rls:bypass-check` | rc=0 |
| `rls:verify` | rc=0 |
| `test` (tamamı) | rc=0: `Test Files 200 passed \| 2 skipped (202) · Tests 2322 passed \| 8 skipped (2330)`. be-fb'nin sayısıyla aynı. |
| `tests/oauth-registration.live.test.ts` | `Tests 14 passed (14)` (be-fb'nin 13 testi + benim M2 testim). Atlanan test yok. |

`test:e2e` ve `alerts:check` koşulmadı. Playwright kendi `next dev`'ini :3000'de açıyor (`reuseExistingServer: false`) ve o port başka bir ajanın sunucusunda.

### Kart 1 — M2 hayatta kalıyor: ölü kod mu, test boşluğu mu?

**Cevap: test boşluğu.** Yol gerçek ve ucuza test edilebiliyor.

- **Nasıl erişiliyor:** `signIn` callback'i kodu `probeInviteCode` ile geri alınan bir işlemde deniyor. Adaptör ise `registerOAuthUserWithInvite` içinde gerçekten harcıyor. Kod bu ikisi arasında iptal edilir, süresi dolar ya da ajans silinirse `InviteCodeRejectedError` fırlıyor. Bu durumda `events.createUser` hiç koşmuyor. Çerezleri o yolda yalnız adaptördeki silme temizliyor.
- **Deterministik test:** Yarışı zamanlamayla kurmadım. Bunun yerine test yalnız o koda bağlı bir `BEFORE UPDATE` trigger'ı açıyor. Trigger ilk `UPDATE`'i (yoklama) geçiriyor, ikincisini (`RETURN NULL`) atlıyor. Böylece `redeem_agency_invite` adaptörde NULL dönüyor; bu, "kod arada öldü" durumunun aynısı. Trigger, fonksiyon ve sequence `finally` içinde düşürülüyor.

```ts
// be-fb'nin tests/oauth-registration.live.test.ts harness'inin sonuna eklenir
describe('crw-fb M2: adapter throws after the signIn probe', () => {
  test('code dies between probe and adapter: choice cookies are spent', async () => {
    const { id, code } = await makeCode();
    const tag = RUN.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    await admin!.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS crw_m2_${tag}`);
    await admin!.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION crw_m2_${tag}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF nextval('crw_m2_${tag}') > 1 THEN RETURN NULL; END IF; RETURN NEW; END $$`);
    await admin!.$executeRawUnsafe(`CREATE TRIGGER crw_m2_${tag} BEFORE UPDATE ON "AgencyInviteCode"
      FOR EACH ROW WHEN (NEW."id" = '${id}') EXECUTE FUNCTION crw_m2_${tag}()`);
    try {
      const email = newEmail('crw-m2');
      parkInvite(code, lib.consent.registrationAcknowledgementToken({ agency: true }));
      jar.set(lib.province.REGISTRATION_PROVINCE_COOKIE, encodeURIComponent('Ankara'));
      jar.set(lib.readiness.REGISTRATION_READINESS_COOKIE, 'municipality.012120201012120');
      const res = await callback('google', { sub: `${RUN}-m2`, email, email_verified: true });
      expect(await userByEmail(email)).toBeNull();
      expect([lib.province.REGISTRATION_PROVINCE_COOKIE, lib.readiness.REGISTRATION_READINESS_COOKIE]
        .filter((n) => jar.has(n))).toEqual([]);
    } finally {
      await admin!.$executeRawUnsafe(`DROP TRIGGER IF EXISTS crw_m2_${tag} ON "AgencyInviteCode"`);
      await admin!.$executeRawUnsafe(`DROP FUNCTION IF EXISTS crw_m2_${tag}()`);
      await admin!.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS crw_m2_${tag}`);
    }
  });
});
```

Çıktı:

```
HEAD (9db8ba90):
[auth][cause]: InviteCodeRejectedError: invite code rejected
M2 probe location: http://localhost:3000/api/auth/error?error=Configuration
Tests  14 passed (14)

M2 mutantı (adaptör davet yolundaki `await clearRegistrationChoiceCookies();` silindi, python ile, tek eşleşme doğrulandı):
× crw-fb M2: adapter throws after the signIn probe > code dies between probe and adapter: choice cookies are spent
Tests  1 failed | 13 passed (14)
restored (git diff --stat src/lib/auth.ts boş)
```

Kullanıcı oluşmuyor (işlem geri alınıyor). Çerezler siliniyor. M2 öldü.

### Kart 1 — diğer kontroller

- **Dört silme noktası kodda doğru yerde.**
  - Adaptör davet yolu: okuma → silme → işlem. Hem ek reddinde hem hata yolunda siliniyor.
  - Olay `pending` yolu: okuma → silme → işlem.
  - Olay `created !== 'pending'` yolu: bağlama ve `bootstrapped`. Auth.js bağlamada da `events.createUser`'ı çağırıyor; `auth.ts:111-121` bunu belgeliyor ve M5 testi bunu kapsıyor.
  - `signIn` reddi.
- **`pages.signIn` açık yönlendirme açmıyor** (curl, :3000):

```
/api/auth/signin                              -> 302 /tr/giris?callbackUrl=http%3A%2F%2Flocalhost%3A3000
/api/auth/signin?callbackUrl=https://evil.example/x -> 302 /tr/giris?callbackUrl=http%3A%2F%2Flocalhost%3A3000
/api/auth/signin?callbackUrl=//evil.example   -> 302 /tr/giris?callbackUrl=http%3A%2F%2Flocalhost%3A3000%2F%2Fevil.example   (aynı köken)
/api/auth/signin/google (GET)                 -> 302 /api/auth/error?error=Configuration   (OAuth başlamıyor)
```

- **K-5:** `PROPERTY_TIMEOUT_MS = 30_000`. 13 `test(` çağrısından 12'si döngüyle üretilen özellik testleri ve hepsi sabite bağlı. Tam `test` kapısında yeşil.
- **K-6 yayın notu:**
  - `add-agency-invite-code.sql:207` gerçekten `'exhausted'` yazabiliyor. Nottaki iddia doğru.
  - Nottaki kontrol sorgusu bugünkü yerel DB'de `f` döndü; yani notta yazıldığı gibi pencere kapalı.

```
$ docker exec fabrika-postgres psql "$DATABASE_URL(:5432)" -tAc "SELECT prosrc LIKE '%maxUses%' FROM pg_proc WHERE proname = 'redeem_agency_invite';"
f
```

### Kart 2 — fe-fb

- **K-7 aritmetiği.** `lastExpiryDay(now) = gün(now + 366g − (1g − 1s))`. Bu günün sonu en geç `now + 366g`; ertesi günün sonu `now + 366g`'yi aşıyor. Sınır iki yönde de sıkı.
- **Ek mutasyonlarım** (fe-fb'nin mutasyonundan farklı):

```
lastExpiryDay +1 sn kaydırma      → Tests 1 failed | 9 passed (10)
(MAX_VALIDITY_DAYS - 1) * DAY_MS  → Tests 1 failed | 9 passed (10)
geri alındı → git status: yalnız benim test dosyam
```

- **Tek kaynak.** Panel `max`'ı, eylemin gün→tarih dönüşümü ve doğrulama artık `codes.ts`'teki aynı sabite bağlı. `codes.ts` istemci bileşenine değer olarak girmiyor, prop olarak geçiyor (`node:crypto` gerekçesi doğru).
- **Ö-2, canlı SSR** (:3000). İlk sayı katalogdaki iki anahtarın RSC yükündeki kopyası, +1 çizilen metin:

```
karne=…                     : nocode=2 agency=1   → kodsuz metin çiziliyor
karne=…&kod=ABCD-EFGH-JKLM  : nocode=1 agency=2   → ajanslı metin çiziliyor
```

- **K-1, K-2.** Yorumlar artık davranışı doğru anlatıyor. "Karne tamamlandı" ve "Readiness card completed" repoda hiçbir yerde kalmadı (`grep` boş). TR/EN anahtarları eşleşiyor; `i18n:check` yeşil.

### Kart 3 — cs-fb

| İnceleme-12 bulgusu | Metinde | Kodla | Sonuç |
| --- | --- | --- | --- |
| B-1 | Ek §2.4: "Biçimi bozuk bir kod yok sayılır. Geçerli biçimdeki her kod … kabul edilir; puan kurumun kendi beyanıdır" + sunucunun doğrulamadığı notu. Envanter (g) aynısı. | `share.ts` yalnız biçim ve tür kontrolü yapıyor (fe-fb'nin K-1 yorumuyla da uyumlu). | Kapandı |
| B-2 | Ek §2.4 yeni madde "Kodlu ya da kodsuz her kayıtta". Envanter (g) "davet koduna bakılmaz". İlgili kişi kategorisine kodsuz kayıt eklendi. HUKUK-12 ana metin sorusu (§2.4 ve §7). | `AuthCard.tsx:142` `agencyRegistration` kutudan ayrı; kutu `isRegistering && readiness`. | Kapandı. Karar hukukçuda (HUKUK-12). |
| K-8 | "Sunucu en fazla 366 … tarih alanı bugün en fazla 365" | O günün HEAD'ine göre doğru | Kapandı; bkz. K-4 |
| K-9 | Dört neden + `agency_inactive` okunamaz notu | `agency-invite-no-max-uses.sql:122-127` dört dal | Kapandı |

EN kullanıcı metninde B-1'in karşılığı olan bir iddia yok. `grep` ile doğruladım; cs-fb'nin tespiti doğru.

## 3. Bulgular

### Kart 1 (be-fb)

- **Ö-1 — M2 yolu testsiz.** Yol erişilebilir; yukarıdaki test M2'yi deterministik olarak öldürüyor. Öneri: testi `oauth-registration.live.test.ts`'e eklemek. Bloke etmez, çünkü kod doğru ve silme orada duruyor.
- **K-1 — Yarışı kaybeden davetli kayıt Auth.js'in İngilizce "Configuration" sayfasına düşüyor.**
  - Kanıt: `M2 probe location: /api/auth/error?error=Configuration`. Adaptör hatası Auth.js'te `AdapterError`, yani `kind = "error"`.
  - Kullanıcı "server configuration" hatası görüyor, oysa beklenen mesaj `invite_invalid`.
  - Bu davranış `9fbc81f8`'den beri var, bu kartla gelmedi. Olasılık düşük: kodun tam o saniyelerde iptal edilmesi ya da süresinin dolması gerekiyor.
  - Öneri: ayrı küçük bir kart. Seçenekler `pages.error` → `/tr/giris` ve `AuthCard`'da genel mesaj, ya da adaptörün bu hatayı `invite_invalid`'e çevirmesi. be-fb'nin açık sorusu (`pages.error`) ile birlikte ele alınabilir.
- **K-2 — Envanter (g) hâlâ "onay yoksa silinir" diyor.** Çerezler artık okunduktan hemen sonra ve ret durumunda da siliniyor (tek kullanım). Metin yanlış değil, eksik. Bir sonraki metin hizalamasında "okununca silinir (tek kullanım)" eklenebilir → cs-fb.

### Kart 2 (fe-fb)

- **K-3 — Auth.js `signIn` sınıfı hataları sessiz kalıyor.** be-fb'nin raporundaki Risk 1 doğru: `AuthCard.tsx:90-95` yalnız üç kodu çeviriyor. `pages.signIn` ile `OAuthAccountNotLinked`, `OAuthCallbackError` gibi hatalar artık mesajsız giriş kartına düşüyor. Bu kartın kapsamı dışında; be-fb'nin önerdiği genel mesaj → fe-fb.

### Kart 3 (cs-fb)

- **K-4 — "fe-fb sonrası :145 cümlesi" yazılmamış.**
  - `docs/legal/agency-channel-notice-addendum.md:145` hâlâ "İki sınırı tek sabite bağlama işi açık (fe-fb, TASK-MUM743H8P5QFK)" diyor. İş `6f07ce7b` ile kapandı.
  - `afeead2c`'den sonra `docs/legal`'e dokunan commit yok. Paylaşılan ağaçta da `docs/legal` değişikliği yok (`git status` / `git log afeead2c..9db8ba90 -- docs/legal` boş).
  - Sayılar hâlâ doğru, yalnız "açık" ifadesi eskidi. Önerilen cümle: "Tarih alanının üst sınırı aynı sabitten türetilir; kod seçilen günün sonuna kadar geçerli olduğu için bu normalde bugün + 365 gündür." Envanter (c) aynı şekilde güncellenebilir.
  - Kullanıcıya dönük bir veri işleme iddiası yanlış değil, bu yüzden bloke etmez.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUM97YNXRH61-crw-fb.md` (bu rapor). Repoda başka dosyaya dokunulmadı.
- M2 testi yalnız scratchpad worktree'sinde duruyordu. Worktree inceleme sonunda kaldırıldı.

## 5. Riskler

- M2 testi DB'de geçici bir trigger açıyor. Trigger yalnız o test koduna bağlı (`WHEN NEW."id" = …`) ve `finally` içinde düşürülüyor. Paralel koşan başka bir live test'i etkilemez; yine de CI'ya girecekse bu durum test yorumunda belirtilmeli.
- OAuth akışı gerçek Google/Microsoft ile koşulmadı. Callback'ler be-fb'nin sahte sağlayıcı harness'iyle, `fabrika_app` rolüyle koşuldu.
- be-fb Risk 3 (hazırlanmış POST ile eylemi atlama) açık. Çerezler tek kullanımlık olduğu için etki "A'nın vazgeçtiği seçim B'nin ilk kaydına" sınırlı. Tam kapatma ayrı kart.

## 6. Açık sorular

- M2 testi be-fb'nin dosyasına mı girsin, yoksa trigger kullandığı için ayrı bir `*.live.test.ts` dosyasına mı?
- K-1 ve be-fb'nin `pages.error` sorusu tek kartta birleşsin mi?

## 7. Sonraki adım

- be-fb: M2 testini eklemek (Ö-1). K-1 için isteğe bağlı kart.
- fe-fb: K-3 genel hata mesajı.
- cs-fb: :145 ve envanter (c) cümlesi (K-4), envanter (g) "tek kullanım" (K-2). Yalnız metin; yeniden inceleme gerektirmez, bir sonraki incelemede kontrol edilebilir.

## Platform beyanı

Doğrulama **macOS'ta** yapıldı (Darwin 27, Node, Docker `fabrika-postgres`, :3000'e curl).

- Koşulan kod yolları platformdan bağımsız: Auth.js yapılandırması, Next `cookies()`, PL/pgSQL, UTC tabanlı tarih hesabı (`Date.UTC` / `toISOString`), JSON çeviriler ve Markdown.
- Dosya yolu, süreç ya da kabuk bağımlılığı yok.
- Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koddan bakınca davranış farkı beklenmez. CI (Linux) aynı `pnpm test`'i koşuyor.
