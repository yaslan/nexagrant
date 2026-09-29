# TASK-MUM3WSS7DOGJL — FB KAMU B12: B6 + B1 eşleme (cs-fb)

Commit: `af1905da` (dev, push yok). Yalnız `docs/legal/*` değişti; koda dokunulmadı.

## 1. Ne yapıldı

- **B6 işaretleri kaldırıldı.** Ekte (`docs/legal/agency-channel-notice-addendum.md`) önceden "[B6 — commit'i ile doğrulanacak]" diye yazılan her madde, fe-fb'nin `897d3608` commit'iyle dosya:satır karşılaştırıldı (§2). Hepsi kodla tuttu, bu yüzden hiçbir madde çıkarılmadı. İşaretler kaldırıldı: §0, §2.1, §2.4, TR §4 m.3 ve m.6, EN §5 item 3 ve 6, §6 m.8. Dosyada artık "doğrulanacak" ya da "to be verified" geçmiyor.
- **Kodda olup metinde eksik kalanlar eklendi** (§0 kuralı: metin koda uyar):
  - Sonuç yalnız yeni hesapta yazılır. Var olan hesaba girişte ya da karne sonradan yeniden yapıldığında yazılmaz. Bu cümle TR ve EN kullanıcı metnine de eklendi.
  - Bozuk ya da elle değiştirilmiş kod yok sayılır.
  - Karne kartı kurumun kendi panosunda görünür.
  - Ajans sayısında silinmiş kurum sayılmaz.
  - Karnenin analitik olayları cevap taşımaz ve bugün hiçbir yere gönderilmez.
- **Kodda olmayan ya da artık yanlış olanlar düzeltildi:**
  - §2.1'deki "bugün gönderilmez, 'Henüz ölçülmüyor'" cümlesi kaldırıldı. Karne adımı §2.1 tablosuna ölçülen bir satır olarak girdi.
  - §2.2'den "Karnesini tamamlayan kurum sayısı" satırı çıktı.
  - "Ortalama karne puanı" artık "B6 ile gelecek" diye yazılmıyor, "Kartı yok (B6 kapsamı dışında kaldı)" diye yazılıyor. Aynı düzeltme §3.1 madde 9'da da yapıldı.
  - Kod dayanağından silinmiş olan `code-limits.ts` çıkarıldı.
- **Yeni açık risk yazıldı (§2.4).** Sonuç kodu kayıt sayfasının adresinde (`karne=`) taşınıyor. Bu yüzden barındırma sağlayıcısının erişim kayıtlarına düşebilir. Taşınan veri kurum verisidir (kurum türü ve cevaplar), kişi verisi yoktur. Bu risk HUKUK-12 ile birlikte değerlendirilmeli.
- **B1: kullanım sınırı kaldırıldı** (be-fb §5.1'de sayılan satırlar):
  - :54 (şimdi :55): kod paneli satırından "üst sınır" çıktı, yerine "kodların kullanım sınırı yoktur" yazıldı.
  - :108 (şimdi :110): "kullanım sınırına ulaşıp ulaşmadığı" çıktı, yerine "sınır yok, 'tükendi' durumu yok" yazıldı.
  - :136: `MIN_MAX_USES` kuralı artık geçmiş olarak anlatılıyor. Üst sınırı 5'ten küçük eski kodların riskinin kapandığı da yazıldı.
  - :138: not yeniden yazıldı (şimdi :140-147). Kayıt formu yoklamasının artık kapalı olduğu yazıldı. Ayrıca şunlar maddelendi: kod yalnız son tarih ve iptalle yönetilir; ajans yalnız etkin / iptal edildi / süresi doldu durumlarını görür; önerilen son tarih 30 gün, en fazla 366 gün; kodu oluşturma ve iptal etme yetkisi `manage_users`'ta (kurum sahibi ve yöneticisi); sızan kod son tarihine kadar sınırsız kayıt açabilir, bunun için platform alarmı yok.
  - Aynı değişiklik şu yerlere de işlendi: §2.1 ret kaydı paragrafı (artık "hakkı bitmiş" yok), K-1 risk kabulü, TR m.6 ve EN item 6 (artık "hakkı bitmiş" ve "used up" yok).
- **Envanter §18c** (`docs/legal/processing-register.md`):
  - Başlık B6'yı kapsıyor ve ilgili kart numaraları eklendi.
  - Giriş cümlesindeki "B6 kodda yok" düzeltildi.
  - (c) davet kodları: kullanım sınırı yok (`agency-invite-no-max-uses.sql`), `usedCount` yalnız iç sayaç, varsayılan son tarih 30 gün / en fazla 366 gün, `exhausted` nedeni artık yazılmıyor.
  - (f) sayılara adım 2 eklendi.
  - **(g) B6 yeni:** `Tenant.settings.readiness`, onay kutusu (varsayılan işaretsiz), yalnız yeni kiracıya yazılır, OAuth çerezi, `karne=` parametresi riski.
  - Amaç, hukuki sebep (HUKUK-12), saklama, teknik tedbir ve kaynak dosya satırları güncellendi. `code-limits.ts` çıkarıldı. Eklenen dosyalar: B6 dosyaları, `invite-codes-panel.tsx`, `agency-invite-no-max-uses.sql`.
  - §20 tablosunda Tenant istisnasına `Tenant.settings.readiness → §18c (g)` eklendi.

## 2. Kod–metin eşleşme tablosu

Kod: `dev` @ `62a2715e` (B6 `897d3608` dahil). Metin satırları commit `af1905da` sonrasına göre verildi.

### 2.1 B6 — karne sonucu

| #   | Metin (ek)                                                                                                                                              | Kod (dosya:satır)                                                                                                                                                                                                                    | Sonuç                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| 1   | §2.4 :91, TR m.3 :176, EN :228 — kayıtsız karne sunucuya hiçbir şey yazmaz                                                                              | `src/lib/readiness/share.ts:88-97` (sonuç yalnız URL'de), `src/app/[locale]/fon-hazirlik/readiness-check.tsx:110` (`history.replaceState`, istek yok), `:591` (yalnız bağlantı)                                                      | Tutuyor                               |
| 2   | §2.4 :91 — analitik olayları cevap taşımaz, gönderilmez                                                                                                 | `readiness-check.tsx:113-117` (`orgType`, `total`, `level`), `:594-597` (`orgType`, `level`); `src/lib/analytics.ts:3-8` (yalnız dev'de `console.log`)                                                                               | Tutuyor (yeni cümle)                  |
| 3   | §2.4 :92 — bağlantı `karne=<kurum türü>.<15 cevap>` taşır                                                                                               | `share.ts:97` (`SIGNUP_PARAM_READINESS = 'karne'`), `:99-102` (encode), `:131` (`params.set`)                                                                                                                                        | Tutuyor                               |
| 4   | §2.4 :92, TR/EN m.3 — "Karne sonucumu hesabıma ekle" kutusu, varsayılan işaretsiz                                                                       | `src/app/[locale]/login/AuthCard.tsx:109` (`useState(false)`), `:505-525`; `messages/tr.json:359`, `en.json:359`                                                                                                                     | Tutuyor                               |
| 5   | §2.4 :92 — işaretsizse sunucuya gönderilmez                                                                                                             | `AuthCard.tsx:126` (`readinessToSend` yalnız `isRegistering && readiness && importReadiness`), `:164`, `:201`                                                                                                                        | Tutuyor                               |
| 6   | §2.4 :92 — ipucu satırı "ajans yalnız toplu sayı görür" der                                                                                             | `messages/tr.json:360`                                                                                                                                                                                                               | Tutuyor                               |
| 7   | §2.4 :93, TR/EN m.3 — yalnız yeni kiracıya, kayıtla aynı işlemde; var olan hesaba girişte yazılmaz                                                      | `src/lib/auth.ts:243`, `:305-320` (`tenant.create` içinde `settings: readinessSettings(readiness)`, yeni kullanıcı dalı); OAuth `:537`, `:548` (`events.createUser`, yalnız yeni kullanıcı); `src/lib/actions/auth.ts:29-34` (yorum) | Tutuyor                               |
| 8   | §2.4 :93, TR/EN m.3 — karneyi sonradan yeniden yapmak hesabı değiştirmez                                                                                | Yazan tek yer kayıttaki `tenant.create` (`auth.ts:316`, `:548`); başka bir `readiness` yazımı yok (`grep readinessSettings src` → yalnız bu iki yer + tanım)                                                                         | Tutuyor (yeni cümle; fe-fb raporu §5) |
| 9   | §2.4 :94 — saklanan: kurum türü + 15 cevap + eklenme zamanı, `Tenant.settings.readiness`; puan/düzey/eksik saklanmaz; şema değişmedi                    | `src/lib/readiness/account.ts:21`, `:37-43` (`{code, importedAt}`), `:1-8` (yorum); `git show --stat 897d3608` içinde `prisma/schema.prisma` yok                                                                                     | Tutuyor                               |
| 10  | §2.4 :94 — bozuk kod yok sayılır                                                                                                                        | `account.ts:32-34` (`toReadinessCode`), `:51-52`; `share.ts:104-115` (`decodeReadinessCode` → null)                                                                                                                                  | Tutuyor (yeni cümle)                  |
| 11  | §2.4 :95, TR/EN m.3 — panoda görünür                                                                                                                    | `src/app/[locale]/(app)/[workspace]/dashboard/page.tsx:87`, `readiness-card.tsx:24-42` (kendi `tenantId`'si, `scoreReadiness` ile yeniden hesap)                                                                                     | Tutuyor                               |
| 12  | §2.4 :96 — OAuth: 15 dk httpOnly çerez, yalnız kutu işaretliyse; öteki her başlangıçta silinir                                                          | `src/lib/registration-readiness-cookie.ts:15`, `:18`, `:21-35`; `src/lib/actions/auth.ts:126`                                                                                                                                        | Tutuyor (çerez adı metne eklendi)     |
| 13  | §2.4 :97, §2.1 :47 :62, TR m.6 :187, EN item 6 :239 — ajansa yalnız "karne sonucunu hesabına ekleyen kurum sayısı"; cevap/puan gitmez; sayılar sunucuda | `src/lib/agency/funnel.ts:17-22` (yorum), `:77` (`FUNNEL_STEPS`), `:455-467` (kohort `settings` okur, yalnız `+= 1`); `messages/tr.json:2107`                                                                                        | Tutuyor                               |
| 14  | §2.4 :97 — §3.1 kuralı altında, "kayıtlı kurum" içinde (tamamlayıcı gizleme)                                                                            | `funnel.ts:139` (`{ parent: 'registered', child: 'readiness' }`); `funnel.attack.test.ts` (fe-fb raporu §2: mutasyonla 8 tohum/mod kırmızıya dönüyor)                                                                                | Tutuyor                               |
| 15  | §2.4 :97 — silinmiş kurum sayılmaz                                                                                                                      | `funnel.ts:455-456` (`deletedAt: null`)                                                                                                                                                                                              | Tutuyor (yeni cümle)                  |
| 16  | §2.2 — ortalama karne puanı                                                                                                                             | `funnel.ts` içinde ortalama yok; fe-fb raporu §5: kapsam dışı                                                                                                                                                                        | Metin "Kartı yok" olarak düzeltildi   |
| 17  | §2.1 eski cümle: "'Henüz ölçülmüyor' yazar"                                                                                                             | `funnel.ts:87-91` (`UNMEASURED` boş)                                                                                                                                                                                                 | **Metin eskimişti, düzeltildi**       |

### 2.2 B1 — davet kodlarında kullanım sınırı yok

| #   | Metin                                                                                   | Kod (dosya:satır)                                                                                                                                                                 | Sonuç   |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | §2.1 :55, §3 :110, TR m.6, EN item 6 — kullanım sınırı yok, "tükendi" yok               | `prisma/migrations/agency-invite-no-max-uses.sql:1-24`, `:60-80` (`redeem_agency_invite` yalnız `revokedAt IS NULL AND expiresAt > now`); `src/lib/agency/code-limits.ts` silindi | Tutuyor |
| 2   | §3.1 :143, TR m.6 — ajans yalnız etkin / iptal edildi / süresi doldu görür              | `src/lib/agency/codes.ts:51`, `:86-90` (`inviteCodeStatus`, `usedCount` okunmuyor)                                                                                                | Tutuyor |
| 3   | §2.1 :60, TR/EN m.6 — ret nedeni yalnız iptal / süre dolumu; "exhausted" yok            | `agency-invite-no-max-uses.sql:17`, `:105-171` (`note_agency_invite_rejection`)                                                                                                   | Tutuyor |
| 4   | §3.1 :144 — önerilen son tarih 30 gün, en fazla 366 gün                                 | `src/app/[locale]/(app)/ajans/invite-codes-panel.tsx:45-46` (`isoDay(now, 30)`); `codes.ts:23` (`MAX_VALIDITY_DAYS = 366`)                                                        | Tutuyor |
| 5   | §3.1 :145 — oluşturma/iptal `manage_users` (sahip + yönetici); liste bütün üyelere açık | `src/app/[locale]/(app)/ajans/actions.ts:23-30`; `ajans/page.tsx:70`; `src/lib/rbac.ts:17-31` (`TENANT_OWNER`, `TENANT_ADMIN`)                                                    | Tutuyor |
| 6   | §3.1 :146 — kod başına alarm yok                                                        | be-fb raporu §6 ("isteğe bağlı kart"); kodda yok                                                                                                                                  | Tutuyor |
| 7   | Envanter §18c (c) — `maxUses` boş bırakılabilir, okunmuyor; eski satırlar değişmedi     | `agency-invite-no-max-uses.sql:18-21`, `:37`; be-fb raporu §2 ("satır değişmedi")                                                                                                 | Tutuyor |

## 3. Kanıt

```
$ npx -y prettier@3 --check docs/legal
Checking formatting...
All matched files use Prettier code style!
rc=0

$ grep -n "doğrulanacak\|to be verified" docs/legal/agency-channel-notice-addendum.md
(çıktı yok)

$ git show --name-only --oneline HEAD
af1905da docs(legal): agency addendum + register §18c — B6 matched to 897d3608 (markers removed), invite codes have no use limit (62a2715e) (TASK-MUM3WSS7DOGJL)
docs/legal/agency-channel-notice-addendum.md
docs/legal/processing-register.md

$ git diff --stat (commit öncesi)
 docs/legal/agency-channel-notice-addendum.md | 98 +++++++++++++++-------------
 docs/legal/processing-register.md            | 76 ++++++++++-----------
```

Kalan `MIN_MAX_USES` ve "üst sınır" geçişleri yalnız ekin :138 ve :140 satırlarındaki tarihçe notlarında duruyor. Bu bilerek yapıldı: notlar neyin neden kalktığını anlatıyor.

## 4. Değişen dosyalar

- `docs/legal/agency-channel-notice-addendum.md` (sürüm 0.3 → 0.4-taslak)
- `docs/legal/processing-register.md` (§18c ve §20 Tenant satırı)
- `docs/agent-results/TASK-MUM3WSS7DOGJL-cs-fb.md` (bu rapor, ayrı commit)

## 5. Riskler

- **`karne=` adres parametresi:** sonuç kodu erişim kayıtlarına düşebilir (§2.4). Kodu değiştirmek bu kartın kapsamında değil. Öneri: fe-fb/leed-fb ile ayrı bir kart açılsın. Örneğin kod, kayıt sayfasına geçerken bağlantıda değil tarayıcı içinde (sessionStorage) taşınabilir.
- **Kullanıcı metnine yeni bir vaat eklendi:** "karneyi sonradan yeniden yapmak hesabı değiştirmez". Bu, bugünkü kodun davranışı. fe-fb raporu §5'teki "Sonucu güncelle" kartı yapılırsa ek önce güncellenmeli.
- Ek hâlâ taslak: hukuk onayı yok, yayında değil. HUKUK-12 (kutunun niteliği, saklama süresi) açık.
- Sızan davet kodu artık sınırsız kullanılabilir. Önlem yalnız son tarih ve iptal; kod başına alarm yok (be-fb'nin önerisi).

## 6. Açık sorular

- HUKUK-12: Erişim kayıtlarındaki `karne=` parametresi de bu soruya eklensin mi? Önerim: evet, §2.4'te öyle yazıldı.
- `Tenant.settings.readiness` için ürün içinden silme yolu yok. "Karne sonucunu kaldır" gerekli mi? Bu bir ürün kararı (leed-fb).

## 7. Sonraki adım

- crw-fb: ek 0.4 ve §18c incelemesi.
- leed-fb: yukarıdaki `karne=` riski için kart açılıp açılmayacağına karar versin.

**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27; prettier 3 `npx` ile). İş yalnız doküman. Kod yolu değişmedi, bu yüzden platforma bağlı bir davranış yok. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. Markdown ve prettier çıktısı platforma göre değişmez.
