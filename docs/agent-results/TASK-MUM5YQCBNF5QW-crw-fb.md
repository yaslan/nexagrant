# TASK-MUM5YQCBNF5QW — FB İNCELEME-12 (crw-fb)

Kod değiştirilmedi. Kapılar ayrık worktree'de koşuldu: HEAD `3e7bf7ac`, kendi `node_modules`'u ve kendi `prisma generate` çıktısıyla. Paylaşılan ağaçta o sırada başka ajanların commit'lenmemiş işi vardı (M9, B3, `schema.prisma`, `apply-order.txt`), bu yüzden kapılar orada koşulmadı. İncelenen commit'lerin hepsi bu HEAD'in atası.

| Kart | Görev                                    | Commit'ler                                  | Karar                                                  |
| ---- | ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| 1    | TASK-MULRR8P7HIII4 (fe-fb, B6)           | `897d3608` `ce0abff7`                       | **ONAY** (Ö-1, Ö-2 ve K notları var)                   |
| 2    | TASK-MUM4WVYLSH9IT (be-fb, sınır yok)    | `62a2715e`                                  | **ONAY**. Kendi MILP'im: 1.800 tabloda 0 sızıntı       |
| 3    | TASK-MULXXDG4O483Y (cs-fb, KVKK eki)     | `b4cab2f3` `2b5a494b` `8966826d` `5294480f` | **ONAY**                                               |
| 4    | TASK-MUM3WSS7DOGJL (cs-fb, B6/B1 eşleme) | `af1905da` `850cbb55`                       | **DÜZELTME GEREKLİ** (B-1, B-2; ikisi de yalnız metin) |

Bloke eden bulgu yalnız Kart 4'te var ve iki metin düzeltmesiyle kapanır. Kodda bloke eden bulgu yok.

## 1. Ne yapıldı

- Dört kartın diff'ini satır satır okudum: B6 akışı (`share.ts`, `account.ts`, `registration-readiness-cookie.ts`, `AuthCard.tsx`, `auth.ts` iki kayıt dalı, `readiness-card.tsx`, `funnel.ts`), B1 migration + down, `codes.ts`, panel/aksiyonlar ve iki hukuk dosyası.
- Kapıları kendim koştum (typecheck, lint, test, rls ×3, i18n, `apply-migrations.sh --list`).
- Kart 2 için MILP saldırganımı yeni modele uyarladım. Model: kullanım sınırı yok, kayıt formu yoklaması, B6 adımı dahil, D = 0. Eski kuralla bir pozitif kontrol de koştum.
- :3000'de (leed-fb'nin sunucusu) kayıt sayfasını HTTP ile yokladım.
- Hukuk metinlerindeki 14 iddiayı koddan tek tek doğruladım (§3, Kart 3/4).

## 2. Kanıt

### Kapılar (worktree @ `3e7bf7ac`, `set -a; source .env; set +a`)

| Kapı                                       | Sonuç                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `typecheck`                                | rc=2 — `src/lib/agency/cobrand.test.ts(76,5): TS2532`. **Kapsam dışı:** dosya `850cbb55`'te yok, B4 `0dde7031` ile geldi, `edfa581e` ile düzeltildi                                              |
| `lint`                                     | rc=0                                                                                                                                                                                             |
| `i18n:check`                               | rc=0 — "both catalogs agree, every key used in src/ resolves"                                                                                                                                    |
| `rls:check`                                | rc=0 — "every one of them carries ENABLE + FORCE + tenant_isolation"                                                                                                                             |
| `rls:bypass-check`                         | rc=0 — "no new tenant bypass … 0 still owed"                                                                                                                                                     |
| `rls:verify`                               | rc=0 — "47 kiracıya özel tabloda … fabrika_app rolüyle GERÇEKTEN ölçüldü"                                                                                                                        |
| `test` (tamamı)                            | rc=1 — `193 passed \| 1 failed \| 2 skipped`. Kırmızılar `funnel.attack.test.ts`'in 4 özellik testi: **"Test timed out in 5000ms"**. O sırada 6 paralel MILP işim CPU'yu dolduruyordu (bkz. K-5) |
| `funnel.attack.test.ts` tek başına, yüksüz | ×2: `Tests 24 passed (24)`, 7,8 s. En yavaş özellik testi 715 ms                                                                                                                                 |
| B1/B6 + canlı testler                      | `vitest run tests/agency-invite.live.test.ts tests/agency-funnel.live.test.ts src/lib/agency src/lib/readiness` → `Test Files 9 passed · Tests 124 passed`, skip yok (`fabrika_app`)             |
| `apply-migrations.sh --list`               | rc=0; `agency-invite-no-max-uses.sql` zincirin son dosyası                                                                                                                                       |
| `prettier --check` (5 hukuk dosyası)       | "All matched files use Prettier code style!"                                                                                                                                                     |

### Kart 2: kendi MILP'im (D = 0)

Kullandığım dosyalar: scratchpad'de `gen3.ts` + `milp3.py`, scipy HiGHS ile tam sayılı çözüm.

- **Veri.** Tablolar HEAD'deki gerçek `buildAgencyFunnel` ile yayımlanıyor: ajans geneli, tür görünümü ve her il görünümü, 8 adım (`readiness` dahil). Kodlar gerçek `inviteCodeRow` + JSON'dan geçiyor. Üreteç, satırda `usedCount` ya da `maxUses` görürse hata fırlatıyor.
- **Saldırganın bildiği:**
  - Yayımlanan her sayının aralığı: `[max(5, v−2), v+2]`.
  - İç içe adım kısıtları (`registered ⊇ readiness` dahil).
  - Σ kod kullanımı = grubun kayıt sayısı (D = 0).
  - Her kodun durumu.
  - Her kodunu formda deneyince aldığı cevap.
- **Form kuralları:**
  - `FORM=now`: yeni SQL kuralı. Kod iptal edilmemişse ve süresi dolmamışsa kabul edilir. Formun cevabı paneldeki durumun aynısı olduğu için kullanım üst sınırı yok.
  - `FORM=limit`: pozitif kontrol, eski kural. Durumu "etkin" olan bir kod reddedilirse kullanım = sınır; kabul edilirse kullanım ≤ sınır − 1.
- **Hedefler:** Gerçek değeri 1..4 olan her gizli hücre, her adım farkı ve her kodun kullanımı. Sızıntı ölçütü: MILP min ≥ 1 ve MILP max ≤ 4.
- **Kod dağıtımı:** `one` (grup başına tek kod), `split` (1-4 koda rastgele bölünmüş), `tiny` (her kod 1-4 kullanım). Grup üç türlü: ajans geneli, tür başına, il başına. Kodların %15'i iptal, %15'i süresi dolmuş.

| Model                                                       | Tablo | Sızan tablo | Küçük hedef | solver_warn |
| ----------------------------------------------------------- | ----- | ----------- | ----------- | ----------- |
| **HEAD, `FORM=now`**, 2 üreteç × 3 gruplama × 3 dağıtım     | 1.800 | **0**       | 218.445     | 0           |
| **Pozitif kontrol, `FORM=limit`** (sınır 6), 6 yapılandırma | 600   | **15**      | —           | 0           |

Kontroldeki sızıntılar (tablo / 100): org-global 0 · org-type 2 · org-province 3 · cell-global 3 · cell-type 4 · cell-province 3. Örnekler:

```
org type legacy6    inst=66 code#5[PUBLIC|*,active]   true=2 ILP=[2,2]
cell global legacy6 inst=59 code#4[*|*,active]        true=3 ILP=[2,3]
cell province legacy6 inst=85 code#4[*|Amasya,active] true=2 ILP=[1,2]
```

Her sızıntı, "etkin" görünen ama formda reddedilen kodların yanındaki bir kodun kullanımı. Bu, İNCELEME-11 Ö-1'in sınıfının aynısı. Yeni kuralda form hiçbir koda ret vermediği (iptal ve süre dolumu hariç) için aynı veride 0 sızıntı çıkıyor.

### Canlı :3000 (HTTP, kayıt sayfası SSR)

```
[karne=municipality.012120201012120] http=200 box=yes checked=0 score=50
[karne=municipality.01212020101212x] http=200 box=no
[karne=municipality.222222222222222] http=200 box=yes checked=0 score=100   ← elle düzenlenmiş kod
[karne yok]                          http=200 box=no
```

Hiçbir istekte davet kodu yoktu, yani kutu kodsuz kayıtta da çıkıyor (B-2). Aynı sonucu birim olarak da gördüm: `toReadinessCode('municipality.222222222222222')` kodu kabul ediyor ve `readinessSettings` onu yazıyor. Geçerli kod uzayı 4 × 3^15 = 57.395.628.

Gerçek tarayıcıyla e2e koşmadım. Bu makinede Playwright koşusu AgentSpace kill-guard'a takılıyor. fe-fb'nin e2e karelerine (`TASK-MULRR8P7HIII4-screenshots/`) güvenmedim, yalnız okudum.

## 3. Bulgular

### Kart 1 — TASK-MULRR8P7HIII4 (B6): ONAY

DoD'yi koddan doğruladım:

- **Kayıtsız karne sunucuya bir şey yazmıyor.** `fon-hazirlik/` altında fetch ya da server action yok. `readiness-check.tsx:110` yalnız `history.replaceState` çağırıyor. `analytics.ts` bir taslak.
- **Kutu varsayılan olarak işaretsiz** (`AuthCard.tsx:109`). Kod sunucuya yalnız `isRegistering && readiness && importReadiness` doğruysa gidiyor (`:126`).
- **Yazım yalnız yeni kiracıda.** Credentials'ta yeni kullanıcı dalında (`auth.ts:316`), OAuth'ta `events.createUser` içinde (`:548`). Mevcut hesaba girişte yazma yolu yok.
- **Şema değişmedi.** Veri `Tenant.settings.readiness`'ta. Ayarları yazan öteki iki yer var: `sso.ts:82` ve `cobrand-store.ts:115`. İkisi de mevcut ayarları birleştirerek yazıyor, readiness'ı silmiyor.
- **Pano kartı** kendi `tenantId`'siyle okuyor. Okuma hata verirse kart `null` dönüyor.
- **Huni:** `NESTED_STEPS` `registered ⊇ readiness` (`funnel.ts:139`). Saldırgan testinde `SUBSETS` ve `STEPS` güncellendi. Benim MILP'im 8 adımla koştu.
- **Kohort aynı.** SQL fonksiyonu ile Prisma kohortu aynı kümeyi seçiyor: `agencyId` = ajans ve `deletedAt IS NULL`.

**ÖZEL soru — karne kodu URL'de: tahmin ya da başkasının kodunu ekleme riski var mı?**

Gizlilik riski yok. Kod bir yetki anahtarı değil, kurum türü ve 15 cevaptan ibaret. Kimseyi tanıtmıyor ve hiçbir hesaba bağlı değil. "Başkasının kodunu eklemek" yalnız o cevapları kendi yeni kiracına kopyalamak demek. Tahmine de gerek yok: her geçerli kod elle yazılabiliyor (canlıda `222…` = 100 puan). Etkisi yalnız bütünlük düzeyinde:

- Kurum kendi panosunda uydurma bir puan görebilir.
- Ajans hunisinde karne adımı yalnız "sonucu olan kurum" sayısını sayar. Puan ya da cevap kullanılmadığı için sahte kod ajansın gördüğü sayıyı sahte olmayandan farklı etkilemez.

Aktarım: `next.config.ts`'te Referrer-Policy başlığı yok. Tarayıcı varsayılanı `strict-origin-when-cross-origin` olduğu için başka bir kökene (Google/Microsoft OAuth) giden isteklerde sorgu dizesi taşınmaz. Kalan yüzey sunucu erişim kayıtları; ek §2.4'te bu açık risk olarak yazılı. Aynı cevaplar B6'dan önce de karne paylaşım bağlantısında (`cevap=`) URL'deydi, yani yeni bir sınıf değil.

**ÖZEL soru — OAuth çerezi 15 dk.**

Değer yalnız kutu işaretliyse yazılıyor. Çerez httpOnly, SameSite=Lax, üretimde Secure. Okunurken `toReadinessCode` ile yeniden doğrulanıyor. Her `loginWithSocialAction` çağrısında yeniden yazılıyor ya da siliniyor. Kalan boşluk Ö-1'de.

- **Ö-1 — Çerez kullanıldıktan sonra silinmiyor. Varsayılan Auth.js giriş sayfası, akışı eylemden geçmeden başlatabiliyor.**
  - `src/lib/registration-readiness-cookie.ts:38-45` (`readRegistrationReadiness`) çerezi yalnız okuyor, `auth.ts:537` `createUser`'dan sonra silmiyor.
  - `auth.ts`'te `pages:` tanımı yok (`git show HEAD:src/lib/auth.ts | grep pages:` boş). Yani `/api/auth/signin` varsayılan Auth.js sayfası, Google/Microsoft akışını `loginWithSocialAction` olmadan başlatabilir.
  - Senaryo (ortak bilgisayar, belediye): A kutuyu işaretler, Google'a gider, onay ekranında vazgeçer. 15 dakika içinde B aynı tarayıcıda `/api/auth/signin` üzerinden yeni bir Google hesabıyla kayıt olur. `createUser`, A'nın karne cevaplarını B'nin yeni kiracısına yazar.
  - Aynı desen il çerezinde ve onay çerezinde de var, B6'yla gelmedi. Ancak B6 bu desene kurum cevaplarını ekledi.
  - Etki düşük: veri kurum verisi ve senaryo alışılmadık bir giriş yolu gerektiriyor.
  - Öneri: `createUser` içinde üç kayıt çerezini okuduktan hemen sonra silmek. İsteğe bağlı olarak `pages.signIn` ile varsayılan sayfayı kapatmak (ADR-0006 OAuth-only kararıyla birlikte).
- **Ö-2 — Kutu kodsuz kayıtta da çıkıyor, ama ipucu metni ajanstan söz ediyor.** `messages/tr.json` `Auth.readinessImportHint`: "…davet eden kalkınma ajansı bunu yalnızca toplu sayı olarak görür." Kodsuz kayıt olan kişi için ortada bir ajans yok. Metin yanlış değil ama o kişiye olmayan bir alıcıyı anlatıyor. Aynı kapsam sorunu hukuk metninde B-2 olarak var. Öneri: ipucunu koşullu yapmak ("davet koduyla kaydoluyorsanız…").
- **K-1** — `share.ts:88-96` ve `account.ts:12-13` yorumları "a hand-edited code imports nothing" diyor. Doğrusu "yalnız bozuk kod". Elle düzenlenmiş ama geçerli bir kod kabul ediliyor (bkz. kanıt). Davranış kabul edilebilir, yorum düzeltilmeli. Kart 4 B-1'in kaynağı bu yorum.
- **K-2** — Ajans panosundaki adım başlığı `agency.funnel.steps.readiness.title` = "Karne tamamlandı". Ölçülen şey "sonucunu hesabına ekleyen kurum"; ipucu satırı bunu doğru söylüyor. Karneyi tamamlayıp kutuyu işaretlemeyen kurumlar sayılmıyor, bu yüzden başlık ajansa olduğundan düşük bir tamamlama oranı okutur. Öneri: "Karne sonucu eklendi".
- **K-3** — `funnel.ts` `registered`'ı SQL fonksiyonundan, `readiness`'ı ayrı bir `findMany` ile okuyor, ikisi aynı anlık görüntüde değil. İki sorgu arasında bir kayıt girerse bir grupta `readiness` geçici olarak `registered + 1` olabilir. Bu durumda iç içe satır `rest < 0` diye atlanır. Olasılık ve etki ihmal edilebilir. Tek bir `REPEATABLE READ` işlemi bunu kapatır.
- **K-4** — OAuth kaydında kiracı `orgType: "SME"` ile açılıyor (`auth.ts:546`), karne ise kamu türleri için. Belediye OAuth ile kayıt olup karnesini eklerse huni onu KOBİ satırında sayar. B6'dan önce de vardı (kayıt formu tür sormuyor). Bilgi olarak yazıyorum.

### Kart 2 — TASK-MUM4WVYLSH9IT (sınırsız kod): ONAY

- **`usedCount < maxUses` gerçekten yok.** `agency-invite-no-max-uses.sql:75-84`'teki tek `UPDATE` yalnız `revokedAt IS NULL AND expiresAt > now` ve ajansın canlılığına bakıyor. İmza, `SECURITY DEFINER`, `SET search_path`, `SET app.system_scope` ve `REVOKE`/`GRANT` korunmuş.
- **İdempotent.** `DROP NOT NULL` ikinci koşuda etkisiz. Kısıt yalnız tanımı `maxUses` içerirken değiştiriliyor. Kısıt adını koruma gerekçesi doğru: `add-agency-invite-code.sql` kısıtı ada bakarak ekliyor.
- **Down** veriyi değiştiriyor ve bunu başlığında, kontrol sorgusuyla yazıyor (be-fb R-3).
- **UI.** Panelde `maxUses` alanı yok, varsayılan son tarih 30 gün (`invite-codes-panel.tsx:46`). Sunucu `maxUses` almıyor ve yazmıyor. Denetim olayında da yok; `codes.test.ts` "writes no use limit and records none in the audit event" yeşil.
- **ÖZEL — yoklama kanalı kapandı mı?** Evet. Form yalnız iptal edilmiş ya da süresi dolmuş kodu reddediyor, bu da panelin zaten gösterdiği durum. Kendi MILP'im (D = 0, B6 adımı dahil) 1.800 tabloda ve 218.445 küçük hedefte 0 sızıntı buldu. Aynı saldırgan eski kuralda 600 tablonun 15'inde sızıntı buluyor. Model sızıntıyı görebiliyor.
  - Başarılı bir kullanım, ajans kiracısına hiçbir iz bırakmıyor. `agency.invite.redeemed` kurum kiracısına yazılıyor (`auth.ts:360-365`). Ajansa yalnız ret satırı yazılıyor.
- **ÖZEL — iptal ve süre dolumu için ret mesajı hâlâ tek tip mi?** Evet.
  - `redeem_agency_invite` her durumda `NULL` döndürüyor.
  - `auth.ts:401-405` → `InvalidInviteCodeSignin`.
  - `actions/auth.ts:60-66` → tek cümle: "Davet kodu geçersiz ya da artık kullanılamıyor." Bilinmeyen kod da, ajansı silinmiş kod da aynı cevabı alıyor. Canlı test "only revoke or expiry refuses, with the same NULL" yeşil.
  - Nedeni ayırt eden tek yer, ajansın kendi denetim satırı: `reason` = `revoked` / `expired` / `agency_inactive` / `lost_race`. Bu satırı ekranda gösteren bir yer yok.
- **Kötüye kullanım riski** raporda yazılı (R-1). Oran sınırı yok, platform alarmı yok. Pilot kararı için bu açık risk kabul edilmeli.
- **K-5** — `funnel.attack.test.ts`'in özellik testlerinde açık bir zaman aşımı yok (varsayılan 5 s). Yüksüz makinede her biri 0,6-0,7 s sürüyor. Benim 6 paralel MILP işim sırasında 4 tanesi 5,4-6,1 s sürüp zaman aşımına düştü. Bu bir sızıntı değil. CI tek başına koştuğu için risk düşük, ama CI yavaşlarsa kapı yanlış kırmızı verebilir. `test(..., 30_000)` yeterli.
- **K-6** — Zincir yeniden koşarken kısa bir pencere açılıyor. `apply-migrations.sh` bütün zinciri baştan koşuyor. Önceki dosyalardaki eski `redeem_agency_invite` gövdesi (`usedCount < maxUses`), son dosya uygulanana kadar geçerli. O aralıkta `maxUses = NULL` olan yeni kodlar reddedilir (`< NULL` → NULL). Pencere saniyeler mertebesinde ve yalnız migration koşusu sırasında açık. Yayın notuna girebilir.
- **K-7** — Ek ve envanter "en fazla 366 gün seçilebilir" diyor. Sunucu 366 günü kabul ediyor (`codes.ts:23`), ama tarih alanında `max = bugün + 365` (`invite-codes-panel.tsx:125`). Kullanıcı 365 gün seçebilir.

### Kart 3 — TASK-MULXXDG4O483Y (KVKK eki: il, tek pencere, tek kırılım, yuvarlama): ONAY

Metinde doğrulanan iddialar:

- **Tek birikimli pencere.** `getAgencyFunnel` SQL fonksiyonunu `NULL::timestamp` ile çağırıyor, dönem parametresi yok.
- **Tek kırılım.** `FunnelBreakdown` none / province / orgType. `ajans/page.tsx:20-23` `?kirilim=tur` ya da tek bir il alıyor.
- **İlsiz grup hep gizli.** `funnel.ts` `hidden.add(cellId(s, ALL, NO_PROVINCE))`.
- **5'e yuvarlama.** `roundToFive`, `cell()`.
- **81 il CHECK kısıtı** (`add-tenant-province.sql:35`).
- **İl değişikliği.** `manage_users` gerekiyor (`settings/profile/actions.ts:25`) ve `tenant.province.updated` `{from, to}` yazılıyor (`:44-45`).
- **`2b5a494b` yalnız biçim değişikliği.** Üç dosyada boşluk, `*`, `_`, `-` ve `|` çıkarılınca md5'ler birebir aynı (dpa-en `3b3e6290…`, dpa-tr `3b15384e…`, gap `6b320bdd…`).

`8966826d`'deki "[B6 — doğrulanacak]" işaretleri Kart 4'te kaldırıldı; HEAD'de "doğrulanacak" geçmiyor.

### Kart 4 — TASK-MUM3WSS7DOGJL (eki B6 ve sınırsız kodla eşleme): DÜZELTME GEREKLİ

Doğrulanan iddialar. cs-fb'nin tablosundaki dosya:satır referanslarını HEAD'de tek tek açtım; 14 referansın 14'ü tutuyor:

1. `share.ts:97` `SIGNUP_PARAM_READINESS = 'karne'`.
2. `AuthCard.tsx:109` `useState(false)`.
3. `AuthCard.tsx:126` `readinessToSend` koşulu.
4. `auth.ts:316` ve `:548` `settings: readinessSettings(readiness)`: yalnız iki yazım yeri.
5. `registration-readiness-cookie.ts:18` 15 dk; `actions/auth.ts:126` onay yoksa `null` → silme.
6. `funnel.ts:139` `registered ⊇ readiness`; `:455` `deletedAt: null`.
7. `readiness-check.tsx:110` yalnız `replaceState`. Analitik olayları `{orgType, total, level}` ve `{orgType, level}` taşıyor, cevap taşımıyor.
8. `codes.ts:23` `MAX_VALIDITY_DAYS = 366`; `invite-codes-panel.tsx:46` 30 gün.
9. `agency-invite-no-max-uses.sql:79` `revokedAt IS NULL`, sınır karşılaştırması yok.
10. `ajans/actions.ts:28` oluşturma/iptal `manage_users`; `listInviteCodes` üyelere açık.
11. Envanter (b) `agency.invite.redeemed` `{agencyId}` + `actorId` → `auth.ts:360-365`.

"Tükendi" ve kod kullanım sayısı yalnız "yoktur / kaldırıldı" bağlamında geçiyor, iddia olarak geçmiyor. HUKUK-5 (:136, :138, :140, :150, :276) ve HUKUK-12 (:99, :176, :283) işaretli. Prettier temiz.

- **B-1 (fazla beyan) — "elle değiştirilmiş kod yok sayılır" yanlış.**
  - Nerede: `docs/legal/agency-channel-notice-addendum.md:94`: "Bozuk ya da elle değiştirilmiş bir kod yok sayılır." Aynısı cs-fb raporu §1'de de var. Eşleşme tablosu satır 10 yalnız "bozuk kod yok sayılır" diye doğrulamış.
  - Senaryo: `/tr/kayit?…&karne=municipality.222222222222222` → kutu çıkıyor, puan 100 (canlı :3000). İşaretlenirse bu kod `Tenant.settings.readiness`'a yazılıyor (`readinessSettings` birim çıktısı yukarıda).
  - Ek, yok olan bir güvenceyi beyan ediyor.
  - Düzeltme: "Biçimi bozuk bir kod yok sayılır. Geçerli biçimdeki her kod, kimin doldurduğundan bağımsız olarak kabul edilir; puan kurumun kendi beyanıdır." Envanterin teknik tedbir satırı ("bozuk kod yok sayılır") zaten doğru.
- **B-2 (eksik beyan) — B6 yalnız davet koduyla kayıtta değil, her kayıtta işliyor; envanter ve ek bunu söylemiyor.**
  - Kod: `AuthCard.tsx` kutuyu `isRegistering && readiness` koşuluyla gösteriyor, davet koduna bakmıyor. `auth.ts:316` ve `:548` `inviteCode`'dan bağımsız yazıyor. Canlıda kodsuz istekte kutu var.
  - Metin 1: §18c "İlgili kişi kategorileri" yalnız "Davet koduyla kayıt olan platform kullanıcıları" diyor.
  - Metin 2: ekin kapsamı "davet koduyla kayıt olan kurumlar" (§0, TR m.1).
  - Sonuç: kodsuz kayıt olup kutuyu işaretleyen kurumun karne cevaplarının saklanması hiçbir kullanıcı metninde anlatılmıyor.
  - Aynı durum il için doğru yazılmış ("Her kayıtta (kodlu ya da kodsuz) sorulur" + HUKUK-11 "ana metne de yazılmalı mı?"). B6 için bunun karşılığı yok.
  - Düzeltme:
    - §18c (g)'ye "kodlu ya da kodsuz her kayıtta" ekle.
    - İlgili kişi kategorisine kodsuz kayıt olanları ekle.
    - HUKUK-12'ye "ana aydınlatma metnine de yazılmalı mı?" sorusunu ekle. Ya da B6'yı ana metin için ayrı bir envanter satırına taşı.
- **K-8** — §3.1 :144 ve §18c (c) "en fazla 366 gün" diyor, UI'da 365 (K-7). Metin sunucuyu anlatıyor; "formda en fazla 365 gün" demek daha doğru olur.
- **K-9** — §2.1 :60 ret nedenlerini "süresi dolmuş ya da iptal edilmiş" diye sayıyor. Kod `agency_inactive` ve `lost_race` de yazabiliyor (`agency-invite-no-max-uses.sql:122-127`). `agency_inactive` satırı pasif ajansa yazılıyor ve ajans onu okuyamıyor. Envanter (c) için tam liste daha doğru olur.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUM5YQCBNF5QW-crw-fb.md` (bu rapor). Başka dosyaya dokunulmadı.

## 5. Riskler

- MILP bir ispat değil, 1.800 tabloluk bir arama. Kurum başına tek kod gibi uç dağıtımları `one` yalnız grup düzeyinde kapsıyor.
- Zaman kanalı (ek §3.1 K-1) bu kartların kapsamı dışında ve risk kabulüyle açık.
- Sınırsız kodun sızması (be-fb R-1): oran sınırı ve alarm yok.
- OAuth akışı gerçek Google/Microsoft ile koşulmadı (Ö-1 koddan).
- Gerçek tarayıcı e2e koşulmadı (kill-guard). Canlı kanıt HTTP/SSR düzeyinde.

## 6. Açık sorular

- Ö-1'deki çerez silme: B6'ya mı ait, auth sahibine mi? ADR-0006 (OAuth-only) ile birlikte ele alınabilir.
- B-2: B6 metni ana aydınlatma metnine mi girmeli, yoksa ek kapsamı mı genişlemeli? (HUKUK-12'ye ekle)

## 7. Sonraki adım

- cs-fb: B-1 ve B-2 metin düzeltmesi (+ K-8, K-9). Sonra Kart 4 yeniden ONAY'a gelir.
- fe-fb: K-1 yorumu, K-2 başlığı ve Ö-2 ipucu (küçük). Auth sahibi: Ö-1.
- be-fb: K-5 zaman aşımı (tek satır). K-6 yayın notuna.

## Platform beyanı

Doğrulama **macOS'ta** yapıldı (Darwin 27, Docker `fabrika-postgres`, Node 26, :3000'e curl). Koşulan kod yolları platformdan bağımsız: SQL fonksiyonları, TypeScript sunucu kodu, sunucu çerezi, URL parametresi, React formu. Dosya yolu, süreç ya da kabuk bağımlılığı yok. Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koddan bakınca davranış farkı beklenmez. CI (Linux) aynı `pnpm test` ile koşuyor. K-5'teki zaman aşımı yalnız CPU yüküne bağlı, işletim sistemine bağlı değil.
