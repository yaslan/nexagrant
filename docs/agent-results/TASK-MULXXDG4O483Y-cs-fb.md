# TASK-MULXXDG4O483Y — FB KAMU B12 ek güncelleme: ajans eki ve envanter §18c bugünkü panoyla hizalandı

> Hazırlayan: CS-FB · Sprint: FB-KAMU-2 · Tarih: 29.09.2026 · Dal: `dev` · Platform: doküman (mac'te doğrulandı)
>
> Commit'ler: `b4cab2f3` (ek + envanter) · `8966826d` (ek: B6 maddeleri, leed-fb isteği) · `2b5a494b` (docs/legal'deki diğer 3 dosyada yalnız prettier) · rapor commit'i bu dosyanın kendisi (`git log -- docs/agent-results/TASK-MULXXDG4O483Y-cs-fb.md`).
>
> Aşağıdaki ek satır numaraları `8966826d` sonrasına göredir.
>
> Satır numaraları `b4cab2f3` anındaki `HEAD`'e göredir. Paylaşımlı ağaçta başka bir ajanın commit'lenmemiş değişiklikleri vardı (`src/lib/auth.ts`, `AuthCard.tsx`, `src/lib/actions/auth.ts`, `share.ts` …). Ben bunlara dokunmadım ve kod referanslarını `git show HEAD:<dosya>` ile aldım.

## 1. Ne yapıldı

`docs/legal/agency-channel-notice-addendum.md` (sürüm 0.2 → **0.3-taslak**) ve `docs/legal/processing-register.md` §18c, kartta sayılan 8 kod davranışıyla hizalandı. Kod ve `messages/*.json` dosyalarına dokunulmadı.

| #   | Kart maddesi                                           | Ekte                                                                                                                                                                                                                          | Envanterde                                                                                                                        |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | İl isteğe bağlı toplanıyor (`Tenant.province`)         | §2.2'deki "İl toplanmıyor" satırı çıktı; yeni **§2.3 "Kurumun ili — nasıl toplanır"** (:74-84); §4 madde 3 TR (:164) ve §5 item 3 EN (:216) yeniden yazıldı. Eski EN cümlesi "we do not collect new data for this" kaldırıldı | §18c başlığa TASK-MULV3JXS1AW5X; Veri kategorileri (e); saklama; tedbir; kaynak dosyalar + iki migration; §20 istisnası; §22 m.13 |
| 2   | Tek birikimli pencere                                  | §2 giriş (:37), §4 m.6 (:177), §5 item 6; "son 30 ya da 90 gün" her yerden çıktı                                                                                                                                              | (f) "tek birikimli pencere"                                                                                                       |
| 3   | Yanıt başına tek kırılım                               | §2 giriş (:39), §2.1 kırılım satırı (:53), §3 listesi, §3.1 kural 5 (:128)                                                                                                                                                    | (f) "il × tür çapraz tablosu yok"                                                                                                 |
| 4   | Her adım kurum sayısı (başvuru adımları da)            | §2 giriş (:38); §2.1'de "başvuru sayısı" satırları → 3 "kurum sayısı" satırı (gönderildi / kabul / red); §3'e "başvuru sayısı gitmez"                                                                                         | (f) "adım 6-7 dahil her adım kurum sayısı"                                                                                        |
| 5   | <5 + tamamlayıcı gizleme + 5'e yuvarlama               | §3.1 kurallar 1-7 (:124-130); §4/§5 m.6'ya "parçaların toplamı toplamı tutmayabilir"                                                                                                                                          | Alıcı satırı + tedbir satırı (`suppressedCells`, `roundToFive`)                                                                   |
| 6   | Kod panelinde sayı yok, "Tükendi" yok, maxUses ≥ 5 (6) | §2.1 kod satırı zaten doğruydu; §3'e "kullanım sayısı ve sınıra ulaşıp ulaşmadığı gitmez"; HUKUK-5 notunda `MIN_MAX_USES = 6` gerekçesi; **EN §5 item 6'daki "used up" durumu silindi** (kodda artık yok)                     | (c) `usedCount` tutulur ama panele gitmez; üst sınır ≥ 6                                                                          |
| 7   | Saldırgan testi kapı                                   | §3.1 kural 8 (:131)                                                                                                                                                                                                           | Tedbir satırı                                                                                                                     |
| 8   | Zaman kanalı HUKUK-5'e                                 | K-1 notu (:140) zaten vardı; HUKUK-5 metni (:134) ve §7 HUKUK-5 satırı (:266) "yuvarlama + tek kırılım + tek pencere + zaman kanalı yeterli mi" sorusuna çevrildi, **[HUKUK]** işaretli                                       | Alıcı satırı + §22 m.11                                                                                                           |

Ek olarak, **kapsamı kod gerektirdiği için** eklenen yeni bir soru: **[HUKUK-11]**. İl her kayıtta (kodsuz da) soruluyor. Şahıs şirketi olan bir KOBİ'de ilin kişisel veri sayılıp sayılmayacağı ve ana aydınlatma metnine yazılıp yazılmayacağı soruluyor (ek §2.3, §7 :272; envanter §20, §22 m.13). Leed-fb kararı ("kurum verisi") metinde aynen yazılı; soru bu kararı değiştirmiyor, hukukçunun onayına bırakıyor.

### 1.1 B6 — leed-fb isteğiyle eklendi, commit'i ile doğrulanacak

Leed-fb (29.09, oturumlar arası mesaj): "Ek güncellemene B6'yı da kat, metin iki kez yazılmasın." fe-fb'nin B6 işi (TASK-MULRR8P7HIII4) bu rapor yazılırken ortak ağaçta **commit'lenmemişti**. Eke şunlar yazıldı ve her biri **[B6 — commit'i ile doğrulanacak]** diye işaretlendi:

- §0 (:23): B6 kuralı — işaretli maddeler commit gelince kodla karşılaştırılır; commit gelmeden ek yayına girerse çıkarılır.
- §2.1 (:61): "karne tamamlandı" adımı bugün `dev`'de "Henüz ölçülmüyor"; B6 ile öteki adımlarla aynı §3.1 kuralı altında ölçülür.
- §2.2 (:69): satır "B6 ile geliyor (§2.4)".
- Yeni **§2.4** (:87): kayıtsız karne hiçbir şey yazmaz; yalnız kayıt anında, varsayılan işaretsiz "Karne sonucumu hesabıma ekle" kutusuyla; yalnız yeni kiracıya; `Tenant.settings.readiness`'te sonuç kodu (kurum türü + 15 cevap) + eklenme zamanı, puan saklanmaz; OAuth'ta 15 dk httpOnly çerez; ajansa yalnız kurum sayısı.
- §4 m.3 / m.6 (TR) ve §5 item 3 / item 6 (EN): kullanıcı metni cümleleri, işaretli.
- §6 yayın şartı 8 (:255): B6 doğrulaması.
- §7 **[HUKUK-12]** (:273): kutunun niteliği (rıza mı) ve karne cevaplarının saklama süresi.

Ortak ağaçta okuduğum ama commit'lenmemiş kanıt (dosya:satır **verilmedi**, commit'te değişebilir): `src/lib/readiness/account.ts` (başlık yorumu: `Tenant.settings.readiness`, "only when the person ticked"), `src/lib/registration-readiness-cookie.ts` (15 dk, yalnız işaretliyse), `AuthCard.tsx` farkı (`useState(false)` — işaretsiz başlar; `readinessToSend` yalnız işaretliyse), `src/lib/auth.ts` farkı (`readinessSettings(readiness)` yalnız yeni kiracıda), `funnel.ts` farkı (`UNMEASURED` boş; `NESTED_STEPS`'e `registered ⊇ readiness`), `messages/*.json:359` `readinessImportLabel`.

Envanter §18c'ye B6 **yazılmadı**: envanterin kuralı kodda olmayan faaliyeti yazmamak. B6 commit'i gelince §18c'ye (veri kategorisi + HUKUK-12) eklenmeli; ek §6 m.8 bunu şart olarak tutuyor.

## 2. Kod–metin eşleşme tablosu (dosya:satır, HEAD)

| Metin iddiası (ek §)                                                                     | Kod kanıtı                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| İl `Tenant.province` alanında, isteğe bağlı (§2.3)                                       | `prisma/schema.prisma:27` (`province String?`); `prisma/migrations/add-tenant-province.sql:32` (nullable sütun), `:17-18` (NULL = verilmedi)                                                   |
| Değer yalnız 81 il adı (§2.3)                                                            | `add-tenant-province.sql:34-52` (CHECK); `src/lib/province.ts:24-26` (`toTenantProvince` → `parseProvince`)                                                                                    |
| Geçersiz değer kaydı durdurmaz (§2.3)                                                    | `src/lib/auth.ts:233-235` ("A value outside the list is dropped, not refused"); `src/lib/province.ts:19-23`                                                                                    |
| Yalnız TR; her kayıt TR açılır (§2.3)                                                    | `src/lib/province.ts:15-16` (`country === 'TR'`); `src/lib/auth.ts:304`, `:533` (`country: "TR"`)                                                                                              |
| Her kayıtta sorulur, kodsuz da (§2.3)                                                    | `src/app/[locale]/login/AuthCard.tsx:457-481` (`isRegistering &&` — kod koşulu yok); `src/lib/auth.ts:306` (credentials), `:535` (OAuth)                                                       |
| Karneden `?il=` ile önceden dolar (§2.3, §4 m.3)                                         | `AuthCard.tsx:89-90`; `src/lib/readiness/share.ts:93-96` (`readinessSignupPath` `il` ekler)                                                                                                    |
| OAuth'ta 15 dk httpOnly çerez, her başlangıçta yazılır/silinir (§2.3)                    | `src/lib/registration-province-cookie.ts:22`, `:25-39`; `src/lib/actions/auth.ts:115`; okuma `src/lib/auth.ts:525`                                                                             |
| Sahip/yönetici ayarlardan değiştirir/siler; denetim kaydı (§2.3, §4 m.3)                 | `src/app/[locale]/(app)/[workspace]/settings/profile/actions.ts:25` (`manage_users`), `:35` (`''` siler), `:38-47` (`tenant.province.updated`, `actorId`, `{from, to}`)                        |
| Kurum verisi (leed-fb) (§2.3)                                                            | `add-tenant-province.sql:20-23`; `schema.prisma:26` ("Organisation data")                                                                                                                      |
| Tek birikimli pencere, 30/90 yok (§2, §4 m.6)                                            | `src/lib/agency/funnel.ts:20-24`, `:429` (`agency_funnel_counts_by_province(NULL)`); `src/app/[locale]/(app)/ajans/page.tsx:52-53` (eski `?gun=` yok sayılır); `messages/tr.json:2077`         |
| Tek kırılım: il YA DA tür, çapraz yok (§2, §2.1, §3.1-5)                                 | `funnel.ts:26-29`, `:91-100` (`FunnelBreakdown`), `:362-376`; `page.tsx:17-21` (`?kirilim=tur` / il); `messages/tr.json:2083`                                                                  |
| İlsiz kurum ayrı grup olarak hiç gösterilmez (§2.1, §3.1-4)                              | `funnel.ts:173-174`, `:243`, `:282` (`hidden.add(cellId(s, ALL, NO_PROVINCE))`)                                                                                                                |
| Her adım kurum sayısı, başvuru adımları DISTINCT kurum (§2, §2.1)                        | `funnel.ts:26-29`, `:456-460` (`{ unit: 'organisation' }`); `src/lib/k5-pipeline/applicationOutcome.ts:112-121`; `messages/tr.json:2077` ("başvuru sayısı gösterilmez")                        |
| Eşik 5, 0 dahil gizlenir (§3.1-1)                                                        | `funnel.ts:55` (`SMALL_CELL_THRESHOLD = 5`), `:241-242`, `:301`                                                                                                                                |
| Tamamlayıcı gizleme: iller, türler, iç içe adımlar; ≥2 sıfırdan büyük örtü, ≥5 (§3.1-2)  | `funnel.ts:128-138` (`NESTED_STEPS`), `:234-253`, `:285-299`, `:304-322` (`protectLine`)                                                                                                       |
| `registered` gizliyse grupta hiçbir adım yok (§3.1-3)                                    | `funnel.ts:253`, `:327-337`                                                                                                                                                                    |
| 5'e yuvarlama, tek tek; parçalar toplamı tutmayabilir; gösterilen 5 = 5..7 (§3.1-6)      | `funnel.ts:148-159` (`roundToFive`), `:161-163`; `messages/tr.json:2092` (`privacyNote`)                                                                                                       |
| Gizleme/yuvarlama sunucuda (§3.1-7)                                                      | `funnel.ts:36-37`; `page.tsx:32-33`, `:53` (sunucu bileşeni `getAgencyFunnel` çağırır)                                                                                                         |
| Saldırgan testi kapı, CI'da koşar (§3.1-8)                                               | `src/lib/agency/funnel.attack.test.ts:344`, `:363`, `:392`, `:459`; `.github/workflows/ci.yml:116` (`pnpm test`); `vitest.config` yalnız `docs/`, `e2e/` hariç                                 |
| Kod panelinde yalnız durum: etkin / iptal / süresi doldu; kullanım sayısı yok (§2.1, §3) | `src/lib/agency/codes.ts:56` (`'active' \| 'revoked' \| 'expired'`), `:85-96`, `:98-110` (`inviteCodeRow` sayı taşımaz), `:210` (`usedCount` seçilmez); `messages/tr.json:2167` (`countsNote`) |
| Yeni kod üst sınırı en az 6 (leed-fb "en az 5" + pay) (HUKUK-5 notu)                     | `src/lib/agency/code-limits.ts:6-12` (`MIN_MAX_USES = 6`); `codes.ts:117-120`; `messages/tr.json:2178`                                                                                         |
| Tükenen kod "etkin" görünür, kayıtta yine reddedilir (HUKUK-5 notu)                      | `codes.ts:85-96`                                                                                                                                                                               |
| Sayılar SECURITY DEFINER fonksiyonda, ajansın kendi kapsamında (envanter tedbir)         | `prisma/migrations/add-agency-funnel-province.sql:27-67` (`app.tenant_id`, AGENCY kontrolü, yalnız tamsayı); `funnel.ts:428-430`                                                               |
| Adım 6-7 kurum listesi sunucuda türetilir (envanter tedbir)                              | `funnel.ts:441-454`                                                                                                                                                                            |
| Karne adımı "Henüz ölçülmüyor" (§2.1, §2.2)                                              | `funnel.ts:81-82` (`UNMEASURED`); `messages/tr.json` `agency.funnel.steps.readiness.hint`                                                                                                      |

## 3. Kayıt ekranı metin önerisi — il işlenmesi eklendi (`messages` önerisi; dosyaya YAZILMADI)

Önceki öneri: `docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md` §3. Değişen anahtarlar aşağıda. Değişmeyenler (`title`, `body`, `notSees*`, `more`, `invalidCode`, `disclosure*`) aynı kalır; `unlinkHint` hâlâ **eklenmemeli**.

Değişiklik nedenleri: (1) eski `sees` "kaç başvuru yapıldı" diyordu, oysa pano başvuru değil kurum sayıyor; (2) "5'ten az sayılar gösterilmez" yuvarlamayı anlatmıyordu; (3) il işlenmesi hiç yoktu.

Not: kayıt formundaki il sorusunun kendi ipucu **zaten** kodda var ve doğru (`messages/tr.json:353` `provinceHint`: "Kalkınma ajansı raporlarında yalnızca il bazında sayı olarak kullanılır; sonradan kurum ayarlarından değiştirebilirsiniz."). Bu ipucu kodsuz kayıtta da görünür, ek bağlantısı taşımaz. Aşağıdaki `province` anahtarı yalnız **kodlu kayıttaki** bantta, ek bağlantısıyla birlikte gösterilmek içindir.

### `messages/tr.json`

```json
{
  "Auth": {
    "agencyInvite": {
      "sees": "Kodunuzla kayıt olan kurumların toplu sayıları: kaç kurum kayıt oldu, kaç kurum çağrı seçti, kaç kurum başvuru yaptı. Sayılar 5'in katına yuvarlanır; 5'ten az olan ya da başka sayılardan hesaplanabilen sayılar gösterilmez.",
      "province": "İlinizi verirseniz, ajansın sayıları il bazında da gösterilebilir. Kurumunuzun ili ajansa ayrıca gösterilmez. İl isteğe bağlıdır; kurum ayarlarından değiştirebilir ya da silebilirsiniz."
    }
  }
}
```

### `messages/en.json`

```json
{
  "Auth": {
    "agencyInvite": {
      "sees": "Aggregate numbers for organisations that signed up with your code: how many signed up, how many picked a call, how many applied. Numbers are rounded to a multiple of 5. Numbers under 5, or numbers that can be worked out from other numbers, are not shown.",
      "province": "If you give your province, the agency's numbers can also be shown per province. The agency is not shown your organisation's province on its own. The province is optional. You can change or remove it in your organisation settings."
    }
  }
}
```

Yerleşim: `province` satırı `sees` satırının hemen altında, yalnız `inviteCode` varken (`invite-code-banner` bandında). Uygulayan kart iki dile birden ekler (CLAUDE.md kural 8). Hukuk onayından önce kataloğa girmemeli (ek §6 m.1).

## 4. Doğrulama (kopyalanmış çıktı)

Prettier (repoda prettier yok, `npx -y prettier@3`):

```
$ npx -y prettier@3 --check docs/legal; echo EXIT=$?
Checking formatting...
All matched files use Prettier code style!
EXIT=0
```

İlk koşuda benim dışımdaki 3 dosya uyarı verdi (`dpa-en.md`, `dpa-tr.md`, `privacy-notice-gap-analysis.md`; önceden vardı, benim değişikliğim değil). DoD'deki "0" koşulu için biçimlendirildi ve ayrı commit'e (`2b5a494b`) kondu. İçeriğin değişmediğinin kanıtı: boşluk ve `-` silinince `dpa-en`/`dpa-tr` md5 aynı; `privacy-notice-gap-analysis` farkı yalnız `*…*` → `_…_` (ikisi de aynı italik çıktıyı verir).

Kod davranışının testleri (kartın dayandığı kapılar, bu metnin iddialarıyla aynı kod):

```
$ npx vitest run src/lib/agency/funnel.attack.test.ts src/lib/agency/funnel.test.ts src/lib/agency/codes.test.ts src/lib/province.test.ts
 Test Files  4 passed (4)
      Tests  51 passed (51)
```

Eski iddiaların kalmadığının kontrolü:

```
$ grep -n "30 ya da 90\|30 or 90\|İl toplanmıyor\|we do not collect new data" docs/legal/agency-channel-notice-addendum.md
(çıktı yok)
```

EN §5 item 6'da "used up" yalnız **ret nedeni** olarak kaldı (`agency.invite.rejected` hâlâ `exhausted` nedenini yazıyor, `funnel.ts:39-47`); durum listesinden çıktı.

Commit'ler:

```
$ git show --name-only --format='%h' HEAD~1 HEAD   (rapor commit'inden önce)
2b5a494b
docs/legal/dpa-en.md
docs/legal/dpa-tr.md
docs/legal/privacy-notice-gap-analysis.md
b4cab2f3
docs/legal/agency-channel-notice-addendum.md
docs/legal/processing-register.md
```

## 5. Değişen dosyalar

- `docs/legal/agency-channel-notice-addendum.md` — sürüm 0.3-taslak; §0, §2 (giriş, 2.1, 2.2, yeni 2.3 il, yeni 2.4 B6), §3, §3.1, HUKUK-5, §4 m.3/m.6, §5 item 3/6, §6 m.3/m.8, §7 (HUKUK-5, yeni HUKUK-11, HUKUK-12).
- `docs/legal/processing-register.md` — §18c (başlık, giriş, veri kategorileri, alıcı, saklama, tedbir, kaynak), §20 Tenant istisnası, §22 m.11 ve yeni m.13.
- `docs/legal/dpa-en.md`, `dpa-tr.md`, `privacy-notice-gap-analysis.md` — yalnız prettier (ayrı commit).
- Bu rapor.

Kod ve `messages/*.json`: dokunulmadı. Push yok.

## 6. Riskler

- **B6 maddeleri commit'siz koddan yazıldı** (§1.1). fe-fb commit'i farklı davranırsa işaretli maddeler yanlış olur; ek §6 m.8 yayın öncesi karşılaştırmayı şart koşuyor. B6 commit'i gelince §18c de güncellenmeli.
- **İl her kayıtta toplanıyor, ana aydınlatma metni bunu anlatmıyor.** Ek yalnız kodlu kayıt için. Kodsuz kayıtta il yalnız form ipucuyla anlatılıyor (`provinceHint`). HUKUK-11 buna bağlı.
- **Zaman kanalı (K-1) açık** — pilotta bilerek kabul edilen risk; metin bunu "yeterli mi" sorusuyla hukukçuya bırakıyor, "anonim" iddiasını kesinleştirmiyor.
- `MIN_MAX_USES` kodda **6**, kartta "≥ 5". Metin kodu (6) yazıyor ve farkı açıklıyor. Bu fazla bir beyan değil, çünkü kod 5'ten daha katı.

## 7. Açık sorular

- [HUKUK-5] Eşik 5 + tamamlayıcı gizleme + 5'e yuvarlama + tek kırılım + tek pencere, açık zaman kanalıyla birlikte yeterli mi? (ek §7)
- [HUKUK-11] Şahıs şirketinde `Tenant.province` kişisel veri mi; ana metne girmeli mi? (ek §7)
- [HUKUK-12] B6 kutusu rıza mı; karne cevaplarının saklama süresi? (ek §7)
- Eski `agency_funnel_counts()` fonksiyonu veritabanında duruyor, uygulama çağırmıyor (`add-agency-funnel-province.sql:9-14`). Temizlik kartı açılırsa envanter §18c'deki parantez notu silinir.

## 8. Sonraki adım

1. Hukuk incelemesi: ek §7 tablosu (HUKUK-1…11).
2. B6 commit'i gelince: ekteki **[B6 — commit'i ile doğrulanacak]** maddelerini dosya:satır ile doğrula, işaretleri kaldır; envanter §18c'ye karne sonucunu ekle.
3. Kayıt ekranı `sees` + `province` anahtarları hukuk onayından sonra uygulayan karta (§3).

**Platform beyanı:** Yalnız doküman değişikliği; macOS'ta doğrulandı (prettier + vitest). Platforma bağlı kod yolu yok; Windows/Linux'ta koşulmadı, gerekmez (Markdown).

Hafıza: bu görevden kalıcı öğrenim `kvkk-taslak-envanter-kurali-ve-kucuk-sayi` kaydına eklendi.
