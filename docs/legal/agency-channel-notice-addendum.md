# Ajans Kanalı Aydınlatma Eki — TASLAK (TR + EN)

> Sürüm **0.4-taslak** · 29.09.2026 · Hazırlayan: CS-FB · Kart: TASK-MULRRHM9N7XPM (FB-KAMU-2, B12) · Kodla hizalama: TASK-MULWC74HGLY9T, TASK-MULXXDG4O483Y (il, tek pencere, tek kırılım, yuvarlama), TASK-MUM3WSS7DOGJL (B6 karne sonucu kodla eşlendi; davet kodlarının kullanım sınırı kalktı; İNCELEME-12 düzeltmesi: `TASK-MUM3WSS7DOGJL-cs-fb-2.md`) · 29.09 gece: "Google / Microsoft ile kayıtta" → "Google ile kayıtta" (Microsoft girişi `acc35b07` ile kaldırıldı; TASK-MUMNAUBUDL5E7)
>
> **Durum: TASLAK. Hukuk onayı YOK. Yayında DEĞİL.** Bu belge bir hukuki metin değildir; hukuk ekibinin önüne konacak bir çalışma taslağıdır. Hukuk incelemesi gereken her yer **[HUKUK]** diye işaretlidir. İşaretsiz bir cümle de hukuken onaylı sayılmaz.
>
> Dayanak: `docs/kamu/OKA-KANAL-ONERISI.md` §2, §4, §6 (B1, B2, B3, B6, B12) · `docs/legal/processing-register.md` §1, §2, §13, §18b, §18c · `docs/legal/privacy-notice-gap-analysis.md` §4, §6 · `src/lib/legal/consent-documents.ts`.
>
> Kod dayanağı: `prisma/schema.prisma` (`Tenant.agencyId`, `Tenant.province`, `AgencyInviteCode`) · `src/lib/auth.ts` (kodla kayıt, il) · `src/lib/province.ts` · `src/app/[locale]/(app)/[workspace]/settings/profile/actions.ts` (il düzenleme) · `src/lib/agency/codes.ts` · `src/lib/agency/funnel.ts`, `funnel.attack.test.ts` · B6: `src/lib/readiness/share.ts`, `src/lib/readiness/account.ts`, `src/lib/registration-readiness-cookie.ts`, `src/app/[locale]/login/AuthCard.tsx`, `src/app/[locale]/(app)/[workspace]/dashboard/readiness-card.tsx` · `prisma/migrations/add-agency-invite-code.sql`, `add-agency-funnel.sql`, `fix-agency-invite-rejection-audit.sql`, `add-tenant-province.sql`, `add-agency-funnel-province.sql`, `agency-invite-no-max-uses.sql`.
>
> İşleme envanteri satırı: `docs/legal/processing-register.md` §18c.

## 0. Bu belge nedir, ne değildir

**Nedir:** Bir kurum, bir kalkınma ajansının verdiği **toplu davet koduyla** kayıt olduğunda, ana aydınlatma metnine (`/[locale]/privacy`) **ek olarak** gösterilecek metnin taslağı. Metin iki soruyu açıkça cevaplar:

1. Davet koduyla kayıt olunca **hangi ek veri** işlenir?
2. Ajansa **hangi veri gider**, hangisi **gitmez**?

**Ne değildir:**

- Ana aydınlatma metninin yerine geçmez. Ana metnin hukuki içeriği hâlâ hukuk girdisi bekliyor (TASK-MTSWIFJKGTYC, `privacy-notice-gap-analysis.md` §6). Bu ek, ana metnin veri sorumlusu kimliği gibi boşluklarını **kapatmaz**; aynı boşlukları kendi içinde de taşır.
- Planı anlatmaz, **bugünkü kodu** anlatır (29.09.2026, `dev`). B1 (davet kodu, kodla kayıt) ve B2 (ajans panosu) kodda. B3 (aylık bölge raporu) henüz kodda **yok**; ona bağlı maddeler "**B3 ile gelecek**" diye işaretlidir, bugün işlenen ya da ajansa giden veri **değildir** ve kullanıcı metnine (§4, §5) girmez. B6 (karne sonucunu hesaba ekleme, TASK-MULRR8P7HIII4, fe-fb) da kodda (`dev`, commit `897d3608`). B6 maddeleri önce kod gelmeden yazılmış ve işaretlenmişti; B6 commit'i ile dosya:satır karşılaştırıldı, işaretler kaldırıldı (TASK-MUM3WSS7DOGJL). Davet kodlarının kullanım sınırı da kalktı (TASK-MUM4WVYLSH9IT, commit `62a2715e`); metin buna göre güncellendi. Kod bu metinden farklı davranırsa **metin yanlış olur**. Kodla eşleşme tablosu (güncel): `docs/agent-results/TASK-MUM3WSS7DOGJL-cs-fb.md` §2; önceki sürümler: `TASK-MULXXDG4O483Y-cs-fb.md` §2, `TASK-MULWC74HGLY9T-cs-fb.md` §2.

## 1. Taraflar ve roller (taslak)

| Taraf                                                                 | Bu akıştaki rolü                                                                                                                   | Not                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FonBridge işletmecisi** (ölçülen aday unvan: `FonBridge Ltd. Şti.`) | Kayıt olan kişinin hesap verisi ve **kurumun ajansa bağlanma kaydı** için veri sorumlusu                                           | **[HUKUK-1]** Unvan, MERSİS, adres, KEP henüz teyitli değil (`privacy-notice-gap-analysis.md` §4.1). Ekte ana metinle **aynı** kimlik yazılmalı.                                                                                                                                                  |
| **Kalkınma ajansı** (ör. OKA)                                         | Davet kodunu dağıtır. Yalnız **anonim, toplulaştırılmış sayılar** alır (§2). Kurumların hesaplarına, içeriğine ve kişilere erişmez | **[HUKUK-2]** Ajans, yalnız anonim veri aldığı için kişisel veri **alıcısı** sayılmaz varsayımıyla yazıldı (KVKK md.3/1-b anonimleştirme; md.28/1-ç istatistik). Bu varsayım §3'teki küçük sayı kuralına bağlıdır. Ajansın **ortak veri sorumlusu** sayılıp sayılmayacağı da hukukçuya sorulmalı. |
| **Kurum** (kiracı: belediye, KOBİ, …)                                 | Bugün olduğu gibi, kendi yüklediği proje verisi için veri sorumlusu; FonBridge bu veride veri işleyendir (`dpa-tr.md` §1)          | Bu ek kurumun kendi içeriğiyle ilgili rolleri **değiştirmez**.                                                                                                                                                                                                                                    |

## 2. Ajansa GİDEN veri — tam liste

Kaynak: kod (`src/lib/agency/funnel.ts`, `src/app/[locale]/(app)/ajans/page.tsx`). Tamamı **toplu sayıdır**; kişi düzeyinde veri ve kurum kimliği yoktur. Sayılar yalnız ajans panosunda (B2) görünür ve şu kurallarla gider:

- **Tek, birikimli pencere.** Sayılar, ajansın kodlarıyla bugüne kadar kayıt olmuş bütün kurumları kapsar. Dönem seçici (30 / 90 gün) **yoktur**: iki pencerenin farkı, 31-90. günlerde kayıt olan kurumları tek tek gösterebiliyordu.
- **Her adım kurum sayısıdır.** Başvuru adımları da "en az bir başvurusu olan kurum" sayısıdır (her kurum bir kez sayılır); başvuru sayısı gönderilmez.
- **Bir yanıtta tek kırılım.** Toplamın yanında ya **tek bir il** (bütün kurum türleri birlikte) ya da **kurum türleri** (bütün iller birlikte) gösterilir. İl × kurum türü çapraz tablosu **yoktur**.
- **Küçük sayı kuralı ve yuvarlama** (§3.1): 5'ten küçük ya da başka sayılardan geri hesaplanabilen sayı "<5" olur; gösterilen her sayı 5'in katına yuvarlanır. Bu yüzden parçaların toplamı toplamı tutmayabilir.

### 2.1 Bugün giden (kodda var)

| Veri                                                                                                                                                           | Düzey                         | Nerede görünür                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Davet koduyla açılan kurum sayısı                                                                                                                              | Kurum sayısı                  | Ajans panosu                                                        |
| Karne sonucunu hesabına ekleyen kurum sayısı (B6; cevaplar ve puan gitmez, §2.4)                                                                               | Kurum sayısı                  | Ajans panosu                                                        |
| En az 1 kayıtlı araması olan kurum sayısı                                                                                                                      | Kurum sayısı                  | Ajans panosu                                                        |
| En az 1 çağrıyı takibe (pipeline) alan kurum sayısı                                                                                                            | Kurum sayısı                  | Ajans panosu                                                        |
| En az 1 konsept not üreten kurum sayısı                                                                                                                        | Kurum sayısı                  | Ajans panosu                                                        |
| En az 1 başvurusunu gönderildi olarak işaretleyen kurum sayısı                                                                                                 | Kurum sayısı                  | Ajans panosu                                                        |
| En az 1 başvurusu kabul edildi olarak işaretlenen kurum sayısı                                                                                                 | Kurum sayısı                  | Ajans panosu                                                        |
| En az 1 başvurusu reddedildi olarak işaretlenen kurum sayısı                                                                                                   | Kurum sayısı                  | Ajans panosu                                                        |
| Kırılım (bir seferde **biri**): **kurum türü** (belediye, kamu, KOBİ, …) **ya da** seçilen **tek bir il**                                                      | Yukarıdaki sayıların dağılımı | Ajans panosu                                                        |
| Ajansın kendi davet kodları: etiket, son 4 karakter, son tarih, durum (etkin / iptal / süresi doldu). **Kullanım sayısı yok**; kodların kullanım sınırı yoktur | Kodun kendisine ait bilgi     | Pano (kod yönetimi)                                                 |
| Davet kodunuzla yapılan reddedilmiş denemelerin sayısı ve nedeni (kişi bilgisi yok)                                                                            | Deneme kaydı, kişi yok        | Ajansın kendi kayıt alanı (denetim kaydı). Bugün panoda gösterilmez |

İl kırılımında yalnız ilini bildiren kurumlar ilde sayılır. İlini bildirmeyen kurumlar toplamda vardır ama ayrı bir grup olarak **hiç** gösterilmez.

Son satır hakkında: bilinen ama kullanılamayan bir kod denendiğinde, kodun sahibi ajansın kiracısına bir denetim kaydı yazılır: neden, kodun kayıt kimliği ve zaman. Neden dört değerden biridir: süresi dolmuş (`expired`), iptal edilmiş (`revoked`), ajans hesabı etkin değil (`agency_inactive`: ajans kiracısı silinmiş ya da artık ajans değil) ve yarışı kaybetmiş (`lost_race`: kod kontrol ile kullanım arasında kullanılamaz hale gelmiş). `agency_inactive` satırı etkin olmayan ajansın kiracısına yazılır; o ajansın kullanıcıları ajans sayfasına giremediği için bu satırı ürün içinden okuyamaz. Deneyen kişi, kod ve kodun özeti yazılmaz. Hiç var olmayan bir kod ajansa yazılmaz; yalnız platform yöneticisinin gördüğü bir sayaç artar. Kodların kullanım sınırı kalktığı için "hakkı bitti" nedeni artık yazılmaz (`agency-invite-no-max-uses.sql`); bu değişiklikten önce yazılmış kayıtlar durur.

Karne adımı (adım 2) B6 ile ölçülür: karne sonucunu hesabına ekleyen kurum sayısı. Öteki adımlarla aynı küçük sayı kuralı altında gider (§3.1: <5, tamamlayıcı gizleme, 5'e yuvarlama, saldırgan testi). Ayrıntı: §2.4.

### 2.2 Bugün GİTMEYEN, ileride gelebilecek

Aşağıdakiler bugün kodda **yoktur**. Kullanıcı metnine (§4, §5) yazılmaz. Kod gelince bu ek ve envanter §18c **önce** güncellenir, sonra özellik canlıya çıkar. (İl kırılımı bu listeden çıktı: TASK-MULV3JXS1AW5X ile kodda, §2.1 ve §2.3. Karne adımı da çıktı: B6 ile kodda, §2.1 ve §2.4.)

| Veri                                     | Bugünkü durum                               | Bağlı kart                           |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------ |
| Ortalama karne puanı                     | Hiç yok                                     | Kartı yok (B6 kapsamı dışında kaldı) |
| **Program** kırılımı (Erasmus+, …)       | Hiç yok                                     | B3 ile gelecek                       |
| Aylık bölge raporu (dosya ya da e-posta) | Hiç yok; ajans sayıları yalnız panoda görür | B3 ile gelecek (HUKUK-6)             |

### 2.3 Kurumun ili — nasıl toplanır (TASK-MULV3JXS1AW5X)

İl kırılımı için kurumun ili `Tenant.province` alanında tutulur. Kurallar (kaynak: kod):

- **İsteğe bağlıdır.** Kayıt formunda "Kurumun ili (isteğe bağlı)" sorusu vardır; "Seçilmedi" bırakılabilir. Geçersiz bir değer kaydı durdurmaz, yok sayılır.
- **Yalnız Türkiye'deki kurum için tutulur.** Bugün kayıtta açılan her kurum hesabı `country = "TR"` ile açılır; bu yüzden soru her kayıtta sorulur.
- **Yalnız kodlu kayıtta değil, her kayıtta sorulur.** Davet kodu olmadan kayıt olan kurum da ilini verebilir. Ajansa giden sayılarda yalnız o ajansın kodlarıyla kayıt olmuş kurumlar sayılır.
- **Karneden önceden doldurulur.** Fon hazırlık karnesinden gelen kayıt bağlantısı `?il=<il>` taşır; ad 81 il listesindeyse seçim o ille başlar. Kullanıcı değiştirebilir ya da boşaltabilir.
- **Google ile kayıtta** seçilen il, yönlendirme sırasında 15 dakikalık, yalnız sunucunun okuyabildiği (httpOnly) bir çerezde taşınır. Her kayıt başlangıcında çerez yeniden yazılır ya da silinir. Hesap açılırken okunduktan hemen sonra, kayıt reddedilse de silinir (tek kullanım, `15f70b0d`).
- **Sonradan değiştirilebilir.** Kurum ayarlarında (Profil) kurum sahibi ya da yöneticisi ili değiştirebilir ya da silebilir. Her değişiklik kurumun kendi denetim kaydına yazılır (`tenant.province.updated`: değiştiren kullanıcı, eski ve yeni il).
- **Değer yalnız 81 il adından biridir** (veritabanında CHECK kısıtı).
- **Kurum düzeyinde bir veridir, kişi verisi değildir** (leed-fb kararı, 29.09.2026; `add-tenant-province.sql` yorumu). **[HUKUK-11]** Kurum şahıs şirketi olan bir KOBİ ise il, o kişinin iş yerinin ilidir. Bu durumda ilin kişisel veri sayılıp sayılmadığı ve ana aydınlatma metninde (kodsuz kayıt dahil) yazılması gerekip gerekmediği hukukçuya sorulmalı. Ajansa il yalnız §3.1 kuralıyla, toplu sayı olarak gider.

### 2.4 Karne sonucunu hesaba ekleme (B6)

Kaynak: kod, commit `897d3608` (TASK-MULRR8P7HIII4, fe-fb). Dosya:satır eşlemesi: `docs/agent-results/TASK-MUM3WSS7DOGJL-cs-fb.md` §2.

- **Kayıtsız karne sunucuya hiçbir şey yazmaz.** Fon hazırlık karnesini dolduran kişi kayıt olmazsa cevaplar hiçbir yerde saklanmaz. Sonuç yalnız adres çubuğundaki bağlantıda durur (`src/lib/readiness/share.ts`). Karnenin analitik olayları (`readiness_completed`, `readiness_signup_clicked`) kurum türü, puan ve düzey taşır, cevapları taşımaz; bugün `src/lib/analytics.ts` bir taslaktır ve hiçbir yere göndermez (envanter §19).
- **Yalnız kayıt anında ve açık onayla.** Karneden gelen kayıt bağlantısı karne sonucunu `karne=<kurum türü>.<15 cevap>` olarak taşır. Kayıt formunda "Karne sonucumu hesabıma ekle" kutusu görünür; kutu **varsayılan olarak işaretsizdir**. Kutu işaretlenmezse sonuç sunucuya gönderilmez ve hiçbir şey yazılmaz. Kutunun altındaki satır, ajansın bu bilgiyi yalnız toplu sayı olarak göreceğini söyler.
- **Kodlu ya da kodsuz her kayıtta.** Kutu, davet kodu olup olmamasına bakılmadan, karne bağlantısından gelen her kayıtta çıkar. Sonuç, kodsuz kayıtta da aynı kurallarla yazılır. Bu yüzden B6, bu ekin kapsamından (davet koduyla kayıt, §0) daha geniş bir kümeye uygulanır: kodsuz kayıt olan kurum bu eki görmez. Ajansa giden adım 2 sayısında yalnız o ajansın kodlarıyla kayıt olmuş kurumlar sayılır. Ana metin sorusu: [HUKUK-12].
- **Yalnız yeni kurum hesabına.** Sonuç yalnız kayıtta açılan yeni kiracıya, kayıtla aynı işlemde yazılır. Var olan bir hesaba giriş hiçbir şeyi değiştirmez. Karneyi sonradan yeniden yapmak da hesaptaki sonucu değiştirmez.
- **Ne saklanır:** kurum türü ve karnenin 15 cevabı (sonuç kodu) ile eklenme zamanı, `Tenant.settings.readiness` alanında (şema değişikliği yok). Puan, düzey ve eksikler saklanmaz; cevaplardan her açılışta yeniden hesaplanır. Biçimi bozuk bir kod yok sayılır. Geçerli biçimdeki her kod, kimin doldurduğundan bağımsız olarak kabul edilir; puan kurumun kendi beyanıdır. (Bağlantıdaki cevaplar elle değiştirilirse ve biçim geçerliyse kod kabul edilir; sunucu cevapların karnede gerçekten verildiğini doğrulamaz.)
- **Nerede görünür:** kurumun kendi panosunda "Hazırlık durumu" kartında (puan, düzey, eksik adımlar). Kartı kurumun kendi kullanıcıları görür.
- **Google ile kayıtta** sonuç, yalnız kutu işaretliyse, il çerezi gibi 15 dakikalık httpOnly bir çerezde (`fabrika_registration_readiness`) taşınır; öteki her başlangıçta çerez silinir. Okunduktan hemen sonra, kayıt reddedilse de silinir (tek kullanım, `15f70b0d`).
- **Ajansa giden:** yalnız "karne sonucunu hesabına ekleyen kurum sayısı" (adım 2). Cevaplar, tek bir kurumun puanı ve ortalama puan **gitmez**. Sayı sunucuda, ajansın kurum listesinden sayılır; ayar alanı sunucudan çıkmaz. Sayı §3.1'deki bütün kurallarla gider; adım 2, "kayıtlı kurum" adımının içindeki adımlardan biridir (tamamlayıcı gizleme). Silinmiş kurum sayılmaz.
- **Açık risk (kayıt bağlantısı):** sonuç kodu kayıt sayfasının adresinde (`karne=`) taşındığı için, sayfa isteğinin adresi barındırma sağlayıcısının erişim kayıtlarına yazılırsa kod orada da görülebilir. Bu kurum verisidir (kurum türü + cevaplar), kişi adı ya da e-posta taşımaz. Erişim kayıtlarının saklanması bu belgenin kapsamı dışındadır; HUKUK-12 ile birlikte değerlendirilmeli.
- **[HUKUK-12]** Karne cevapları kurumun kendi hazırlık değerlendirmesidir. Kutunun hukuki niteliği (rıza mı, aydınlatma + kullanıcının kendi eylemi mi) ve saklama süresi hukukçuya sorulmalı. Bugün sonuç kurum hesabı açık kaldıkça durur; ürün içinden silme yoktur. Kutu davet kodu olmadan kayıt olan kurumlara da çıktığı için, bu işlemenin **ana aydınlatma metnine de** (kodsuz kayıt dahil) yazılıp yazılmayacağı da hukukçuya sorulmalı (il için [HUKUK-11]'deki sorunun aynısı). Envanter satırı: `processing-register.md` §18c (g).

**[HUKUK-3]** Sayıların **üretilmesi** (anonimleştirmeden önceki hesaplama) FonBridge'in veritabanında yapılan bir işlemedir. Bu işlemenin hukuki sebebi için taslak önerisi: KVKK md.5/2-f (meşru menfaat) — gerekçe: kurumun ajans kanalıyla gelmesi ve kanalın ölçülmesi. Alternatif: md.5/2-c (kurumla kurulan sözleşmenin, yani kanal hizmetinin, ifası). Seçim ve gerekirse dengeleme testi hukukçunun.

## 3. Ajansa GİTMEYEN veri — açık liste

Ajans panosu **şunları göstermez**:

- Kayıt olan kişinin **adı, e-postası**, rolü, giriş zamanları.
- Kurumun **adı** ve kurumu tek başına tanıtan bilgi. Kod kurum adını ya da kimliğini ajansa göndermez: huni yalnız sayı döndürür, kurum kimlikleri sunucuda kalır. **[HUKUK-4]** yalnız "kurum adı ileride gösterilmek istenirse" sorusu olarak açıktır (S4, `OKA-KANAL-ONERISI.md` §8). O durumda bu ek **yeniden yazılır**: kurum adı, şahıs şirketi olan bir KOBİ için kişisel veridir.
- Hangi kurumun hangi davet kodunu kullandığı. Kurum hesabına yalnız ajansın kimliği bağlanır; kod bağlanmaz.
- Bir kodun **kaç kez kullanıldığı** (kod panelinde yalnız durum var). Kodların kullanım sınırı yoktur, bu yüzden "tükendi" diye bir durum da yoktur.
- **Hangi kurumun hangi ilde** olduğu. İl yalnız toplu sayının kırılımıdır; il × kurum türü çapraz tablosu yoktur. İlini bildirmeyen kurumlar ayrı bir grup olarak gösterilmez.
- Başvuru **sayısı** (bir kurumun kaç başvuru yaptığı); yalnız başvuru yapan kurum sayısı gider.
- Kesin sayılar: gösterilen her sayı 5'in katına yuvarlanmıştır.
- Karne cevapları (tek tek sorular) ve **tek bir kurumun** karne puanı.
- Konsept notlar, yüklenen belgeler, kanıtlar, yorumlar, YZ istemleri ve çıktıları.
- Kayıtlı aramaların kriterleri ve **hangi kurumun** hangi çağrıyı seçtiği.
- Faturalama ve vergi kimliği verisi (VKN/TCKN).
- Ekip üyelerinin listesi ve sayısı. **[ürün kararı]** "Kurum başına kullanıcı sayısı" panoda yok; B8 (haftalık aktif kullanıcı) çıktısı ajansa gösterilecekse bu ek önce güncellenir.

### 3.1 Küçük sayı kuralı (anonimliğin şartı)

Toplu sayı her zaman anonim değildir. Örnek: pano "belediye · konsept not üreten: **1**" derse ve ajans o dönemde tek bir belediyeye kod verdiyse, sayı o belediyeyi tanıtır. Kurum şahıs şirketi olan bir KOBİ ise bu, bir **gerçek kişiyi** tanıtmak demektir.

Kural (kodda: `src/lib/agency/funnel.ts`, eşik `SMALL_CELL_THRESHOLD = 5`):

1. **Eşik.** Bir sayı **5'ten küçükse** (0 dahil) değer gönderilmez, **"<5"** yazılır. 0 da gizlenir; böylece "<5", "hiç yok" ile "birkaç tane"yi ayırt ettirmez.
2. **Tamamlayıcı gizleme.** Pano, bütün kırılımları (toplam, her il, her kurum türü) **birlikte** maskeler; çünkü her kırılım bir istek uzaklıktadır. Üç yönde çıkarma engellenir: toplam − görünen iller, toplam − görünen türler, bir adım − onun içindeki adım (ör. "başvuru gönderen" − "kabul alan"). Bir satırda gizli kalan kısım ya hiç yoktur ya da **en az iki, sıfırdan büyük** gizli parçadan oluşur ve toplamı en az 5'tir. Sıfır örtü sayılmaz. Değilse en küçük görünen parça da gizlenir.
3. **Grup kuralı.** Kayıtlı kurum sayısı gizlenen bir grupta (bir tür ya da bir il) hiçbir adımın sayısı gösterilmez.
4. **İlsiz kurumlar.** İlini bildirmeyen kurumların grubu her zaman gizlidir; tek başına hiç gösterilmez.
5. **Tek kırılım.** Bir yanıt ya tek bir ili ya da kurum türlerini taşır; il × tür hücresi hiç üretilmez.
6. **Yuvarlama.** Gizlenmeyen her sayı en yakın 5'in katına, **tek tek** yuvarlanır. Parçaların toplamı toplamı tutmayabilir. Eşik korunur: yalnız 5 ve üstü gösterilir, gösterilen "5" 5-7 arasıdır.
7. **Sunucuda.** Gizleme ve yuvarlama sunucuda yapılır; tarayıcıya 5'ten küçük ya da kesin bir sayı hiç gitmez.
8. **Saldırgan testi kapıdır.** `src/lib/agency/funnel.attack.test.ts`, bütün görünümleri ve kod panelini birleştiren bir tamsayı saldırganı modeller. Test, üretilen tablolarda gizli bir 1-4 grubunun geri okunamadığını doğrular. CI'da `pnpm test` ile koşar (`.github/workflows/ci.yml`); kırmızıysa CI kırmızıdır.
9. İleride (kartı yok): ortalama karne puanı eklenirse yalnız en az 5 kurumun olduğu hücrede gösterilmelidir.

**[HUKUK-5]** Eşik (5) bir öneridir, dış kaynaktan gelen bir değer değildir. B2 ve B3 için tek eşik kullanılır; ikisinden daha katı olan (5) seçildi (leed-fb kararı, 29.09.2026). Yuvarlama, tek kırılım ve tek pencere de leed-fb kararıdır (29.09.2026); dış bir standarttan gelmez. Hukukçuya sorulacak: **eşik 5 + tamamlayıcı gizleme + 5'e yuvarlama + tek kırılım + tek birikimli pencere**, açık kalan zaman kanalıyla (aşağıda, K-1) birlikte KVKK'nın anonimleştirme rehberindeki ölçütlere göre **yeterli mi**? Kural uygulanmazsa §2'deki "anonim" iddiası ve [HUKUK-2]'deki "ajans alıcı değildir" varsayımı **düşer**.

**[HUKUK-5 notu — davet kodları, TASK-MUM17YBJVAHRR]** Kodla kayıt olan her kurum bir kodun bir kullanımıdır. Bu yüzden kod başına kullanım sayısı, panodaki yuvarlanmış toplamla birleşince "<5" gösterilen bir kodun 1-4 kullanımını açıyordu; tek kodlu ajansta kayıt toplamının kesin değeriydi (crw-fb, TASK-MUM0M211WDIW5). Kod panosu artık yalnız **durum** gösterir. Bir ara yeni kodlara en az 6'lık bir üst sınır konmuştu (`MIN_MAX_USES`); kullanım sınırı tamamen kalkınca bu kural da kalktı (aşağıdaki not). Üst sınırı 5'ten küçük eski kodların 1-4 aralığı verme riski de kapandı: kod sınırı artık okunmuyor, saldırgan testi bunu doğruluyor (TASK-MUM4WVYLSH9IT).

**[HUKUK-5 notu — kullanım sınırı ve "tükendi" durumu kaldırıldı, TASK-MUM2RMN3YIBGC + TASK-MUM4WVYLSH9IT, leed-fb kararları 29.09]** "Tükendi" durumu bir kodun kullanımını kesin veriyordu (kullanım = üst sınır). Hiç kurum silinmediyse (pilotun ilk aylarında olağan durum; kurumları ajans davet ettiği için bunu bilebilir) bu bilgi yuvarlanmış toplamlarla birleşince hâlâ "etkin" olan kodun kullanımını 1-4 aralığına düşürüyordu (crw-fb, TASK-MUM1OTRM75QS2 B-1; örnek: dört kod tükendi, toplam "25", türler "15" ve "15" → beşinci kod 2-3). Aynı durum silinen kurum sayısını da daraltıyordu (R-2). Önce panodan "tükendi" durumu kaldırıldı. Ama kodu elinde tutan ajans, kodu kayıt formunda deneyerek aynı bilgiyi yine öğrenebiliyordu: iptal etmediği ve süresi dolmamış bir kodun reddi "tükendi" demekti (crw-fb, TASK-MUM3TMP8HU76G Ö-1). Bu yüzden kullanım sınırı tamamen kaldırıldı (`prisma/migrations/agency-invite-no-max-uses.sql`). Bugün:

- Bir kod **yalnız son tarihi ve iptalle** yönetilir. Kullanım sınırı yoktur, "tükendi" durumu yoktur. Kod, son geçerlilik gününe kadar ya da iptal edilene kadar istenen sayıda kayıtta kullanılabilir.
- Ajans kod panelinde yalnız **etkin / iptal edildi / süresi doldu** durumunu görür. Kayıt formu da yalnız iptal edilmiş ya da süresi dolmuş kodu reddeder; bu, ajansın panelde zaten gördüğü bilgidir.
- Yeni kodun son tarihi için önerilen (varsayılan) değer **30 gündür**. Sunucu en fazla 366 gün sonrasını kabul eder (`MAX_VALIDITY_DAYS`); kod panelindeki tarih alanının üst sınırı aynı sabitten türetilir (`lastExpiryDay`, `6f07ce7b`, TASK-MUM743H8P5QFK). Kod seçilen günün sonuna kadar geçerli olduğu için bu sınır normalde bugün + 365 gündür.
- Kodu **oluşturma ve iptal etme** yetkisi ajans hesabında kullanıcı yönetme yetkisi olan kişilerdedir (kurum sahibi ve yöneticisi, `manage_users`). Kod listesini ajansın bütün üyeleri görür.
- **Bedel:** sızan bir kod, son tarihine kadar sınırsız kayıt açabilir. Önlem kısa son tarih ve iptaldir; panel bunu ajansa söyler. Kod başına olağandışı kullanım için bir platform alarmı ayrı bir kart olarak önerildi (be-fb, TASK-MUM4WVYLSH9IT §6); bugün **yoktur**.

Saldırgan testi (`src/lib/agency/funnel.attack.test.ts`) hem "silinen kurum sayısı bilinmiyor" hem "hiç kurum silinmedi" varsayımıyla ve kayıt formu yoklamasıyla koşar; hiçbirinde 1-4 aralığı açılmaz.

**[HUKUK-5 notu — birikimli sayılar ve zaman kanalı (K-1), pilot öncesi değişiklik yok]** Sayılar birikimlidir ve kayıt sayısı yalnız artar. Panoyu sık açan bir ajans, toplamın bir yuvarlama sınırını geçtiği anı yakalayabilir: "10"dan "15"e geçiş, o anda gerçek sayının 13 olduğunu söyler. İki geçiş arasında kodlarını kime, ne zaman verdiğini bilen ajans, her yeni kaydı kendi kod dağıtımıyla eşleştirebilir. Yuvarlama bu kanalı daraltır ama kapatmaz. Kapatmak için gecikmeli ya da seyrek güncellenen sayılar gerekir. Bu, pilot öncesi yapılmıyor. **Risk kabulü (R-1, 29.09):** "tükendi" durumunun ve kullanım sınırının kaldırılmasıyla kod panosundan ve kayıt formundan gelen geçiş anı bilgisi kapandı (TASK-MUM2RMN3YIBGC, TASK-MUM4WVYLSH9IT), toplamların yuvarlama sınırını geçtiği an ise hâlâ açık. Bu kalıntı pilotta bilerek kabul edilir; hukukçu eşik teyidiyle birlikte değerlendirmelidir.

## 4. Kullanıcıya gösterilecek ek metin — TR (taslak)

> Aşağıdaki metin `/[locale]/privacy/agency-channel` (öneri; mevcut `/[locale]/privacy` ile aynı slug düzeni) sayfasında yayımlanacak **tam metnin** taslağıdır. Kayıt ekranındaki kısa metin ayrıdır (`docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md` §3). `<<…>>` alanları ana aydınlatma metniyle birlikte doldurulur. Metin yalnız bugün kodda olanı anlatır (§2.1).

### Ajans Kanalı Aydınlatma Eki

**Sürüm:** `<<HUKUK: sürüm ve yürürlük tarihi>>`

**1. Bu ek neyi kapsar?**
Bu ek, bir kalkınma ajansının verdiği davet koduyla FonBridge'e kayıt olan kurumlar ve bu kurumların kullanıcıları içindir. [Gizlilik Politikası ve KVKK Aydınlatma Metni](/tr/privacy) sizin için aynen geçerlidir. Bu ek, davet koduyla kayıt olunca **ek olarak** ne olduğunu anlatır.

**2. Veri sorumlusu**
`<<HUKUK-1: tüzel kişi unvanı, MERSİS no, merkez adresi, KEP adresi, başvuru e-postası — ana metinle aynı>>`

**3. Davet koduyla kayıtta ek olarak işlenen veriler**

- Kodu veren ajans (kurum hesabınıza ajansın kimliği bağlanır),
- Kurumunuzun ajansa bağlandığı tarih (bağ yalnız kayıt sırasında kurulur; bu tarih hesabınızın açıldığı tarihtir),
- Kodla kayıt yapıldığını gösteren bir kayıt: kurumunuzun kendi kayıt geçmişine, hesabı hangi kullanıcının açtığı ve hangi ajansa bağlandığı yazılır.

Kullandığınız davet kodu hesabınıza bağlanmaz ve saklanmaz; kod yalnız kayıt sırasında kontrol edilir.

Ajansın sayılarında kırılım olarak iki kurum bilgisi kullanılır: kurum hesabınızda kayıtlı olan **kurum türü** ve, verdiyseniz, **kurumunuzun ili**. İl isteğe bağlıdır. Kayıt formunda sorulur; fon hazırlık karnesinden geldiyseniz karnede seçtiğiniz il önceden seçili gelir. Kurum sahibi ya da yöneticisi ili sonradan kurum ayarlarından değiştirebilir ya da silebilir; her değişiklik kurumunuzun kayıt geçmişine yazılır. İl ajansa yalnız toplu sayının parçası olarak gider; kurumunuzun ili ajansa gösterilmez. `<<HUKUK-11: şahıs şirketinde ilin niteliği>>`

Fon hazırlık karnesinden gelip kayıt formundaki "Karne sonucumu hesabıma ekle" kutusunu işaretlerseniz, karnedeki kurum türünüz ve cevaplarınız ile eklenme zamanı kurum hesabınıza kaydedilir ve panonuzda görünür. Kutu varsayılan olarak işaretsizdir; işaretlemezseniz hiçbir cevap kaydedilmez. Sonuç yalnız yeni hesap açarken eklenir; var olan bir hesaba girişte ya da karneyi sonradan yeniden yaptığınızda hesabınıza yazılmaz. Kayıt olmadan doldurduğunuz karne hiçbir yere kaydedilmez. `<<HUKUK-12>>`

Hesabınız için işlenen diğer veriler (ad, e-posta vb.) ana aydınlatma metninde yazılıdır.

**4. Amaç**
Kurumunuzu, sizi davet eden ajansın kanalına bağlamak ve ajansa, davet ettiği kurumların FonBridge'i nasıl kullandığını **toplu sayılarla** göstermek.

**5. Hukuki sebep**
`<<HUKUK-3: md.5/2-f meşru menfaat mi, md.5/2-c sözleşmenin ifası mı; dengeleme testi gerekiyor mu>>`

**6. Ajans neyi görür?**
Ajans **yalnız toplu kurum sayılarını** görür. Sayılar birikimlidir: ajansın kodlarıyla bugüne kadar kayıt olmuş bütün kurumları kapsar. Ajans şunları görür: kodla kaç kurumun kayıt olduğu; kaç kurumun kayıtlı arama oluşturduğu, bir çağrıyı takibe aldığı ve konsept not ürettiği; kaç kurumun karne sonucunu hesabına eklediği (cevapları ve puanı değil); kaç kurumun en az bir başvurusunu gönderildi olarak işaretlediği ve kaç kurumun en az bir başvurusunun kabul ya da red olarak işaretlendiği. Başvuru sayısını görmez. Bu sayılar bir seferde tek bir kırılımla da gösterilir: ya kurum türüne göre ya da seçilen tek bir ile göre; il ve kurum türü birlikte gösterilmez. Bir grupta 5'ten az kurum varsa ya da sayı başka sayılardan geri hesaplanabiliyorsa sayı gösterilmez, "<5" yazılır. Gösterilen her sayı 5'in katına yuvarlanır; bu yüzden parçaların toplamı toplamı tutmayabilir. Ajans kendi davet kodlarının durumunu da görür (etkin, iptal edildi, süresi doldu); bir kodun kaç kez kullanıldığını görmez. Davet kodlarının kullanım sınırı yoktur. Kullanılamayan bir kodla (süresi dolmuş ya da iptal edilmiş) deneme yapılırsa ajansın kendi kayıt alanına denemenin nedeni ve zamanı yazılır; bu kayıtta deneyen kişinin bilgisi yoktur. Ajansa yeni bir sayı gösterilmeden önce bu ek güncellenir. `<<HUKUK-5: eşik teyidi>>`

**7. Ajans neyi görmez?**
Kurumunuzun adı ajansa gösterilmez. Ajans ayrıca adınızı, e-postanızı, kurumunuzun hangi davet kodunu kullandığını, karne cevaplarınızı, tek başına kurumunuzun puanını, konsept notlarınızı, yüklediğiniz belgeleri, kayıtlı aramalarınızı ve fatura bilgilerinizi **görmez**. FonBridge bu verileri ajansa aktarmaz.

**8. Yurt dışına aktarım**
Bu ek yeni bir yurt dışı aktarım getirmez. Ajans sayıları FonBridge içindeki panosunda görür. Hesabınızla ilgili yurt dışı aktarımlar ana aydınlatma metninde yazılıdır. `<<HUKUK-6: rapor ileride e-postayla gönderilirse (B3) bu madde yeniden yazılır>>`

**9. Saklama süresi**
Ajans bağı, kurum hesabınız açık kaldığı sürece saklanır. Kurum hesabınız silinirse kurumunuz ajansın sayılarına girmez. Bağ kaldırılırsa (madde 10) bağ kaydının ne kadar tutulacağı: `<<HUKUK-7: süre>>`. Ajansın daha önce gördüğü sayılar anonim olduğu için geri çekilemez.

**10. Haklarınız ve ajans bağını kaldırma**
KVKK md.11 kapsamındaki haklarınız ana aydınlatma metninde yazılıdır. Ajans bağını bugün ürün içinden kaldıramazsınız. Kurumunuzun yöneticisi madde 11'deki kanaldan talep ederse FonBridge bağı elle kaldırır. Bağ kaldırıldıktan sonra kurumunuz ajansın sayılarına **girmez**. Ürün içinden kaldırma özelliği planlanıyor. `<<ürün kararı A3: elle kaldırma süreci ve yanıt süresi>>` `<<HUKUK-8: bağı kaldırma bir md.11 hakkı mı, sözleşmesel bir seçenek mi>>`

**11. Başvuru**
`<<HUKUK-1: başvuru kanalı — ana metinle aynı>>`

## 5. User-facing addendum text — EN (draft)

> Draft of the **full text** to be published at `/en/privacy/agency-channel` (proposal). `privacy-notice-gap-analysis.md` §6 says the EN text is the GDPR art.13 equivalent, not a translation, so legal decides which items differ between the two regimes. **[HUKUK-9]** The text describes only what the code does today (§2.1).

### Agency Channel Privacy Notice Addendum

**Version:** `<<LEGAL: version and effective date>>`

**1. What this addendum covers**
This addendum is for organisations that sign up to FonBridge with an invite code from a regional development agency, and for their users. The [Privacy Policy and Data Protection Notice](/en/privacy) still applies to you in full. This addendum tells you what happens **in addition** when you sign up with an invite code.

**2. Controller**
`<<LEGAL-1: legal name, registry number, registered address, contact for data requests — same as the main notice>>`

**3. Additional data we process when you sign up with a code**

- The agency that gave the code (we link the agency's ID to your organisation's account),
- The date your organisation was linked to the agency (the link is made only at sign-up, so this is the date your account was opened),
- A record that you signed up with a code: your organisation's own activity log records which user opened the account and which agency it was linked to.

We do not link the invite code you used to your account, and we do not keep it. We check the code only at sign-up.

The agency's numbers are broken down by two organisation details: the **organisation type** in your organisation's account and, if you gave it, **your organisation's province**. The province is optional. The sign-up form asks for it; if you came from the funding readiness scorecard, the province you chose there is selected in advance. An owner or admin of your organisation can change or remove the province later in the organisation settings; each change is written to your organisation's activity log. The province goes to the agency only as part of aggregate numbers; the agency is not shown your organisation's province. `<<LEGAL-11: status of the province for a sole trader>>`

If you come from the funding readiness scorecard and tick "Add my scorecard result to my account" on the sign-up form, your organisation type and answers from the scorecard, and the time they were added, are saved to your organisation's account and shown on your dashboard. The box is not ticked by default; if you do not tick it, no answer is saved. The result is added only when you open a new account. It is not saved when you sign in to an existing account or when you do the scorecard again later. A scorecard you fill in without signing up is not saved anywhere. `<<LEGAL-12>>`

The other data we process for your account (name, email, etc.) is listed in the main notice.

**4. Purpose**
To link your organisation to the channel of the agency that invited you, and to show the agency, **as aggregate numbers only**, how the organisations it invited use FonBridge.

**5. Legal basis**
`<<LEGAL-3: legitimate interest (GDPR art.6(1)(f)) or performance of a contract (art.6(1)(b)); balancing test needed?>>`

**6. What the agency sees**
The agency sees **aggregate numbers of organisations only**. The numbers are cumulative: they include all organisations that ever signed up with the agency's codes. The agency sees: how many organisations signed up with a code; how many created a saved search, tracked a call and wrote a concept note; how many added their scorecard result to their account (not the answers or the score); how many marked at least one application as submitted, and how many had at least one application marked as accepted or rejected. It does not see the number of applications. The numbers can also be shown with one breakdown at a time: by organisation type, or for one selected province; never by province and type together. If a group has fewer than 5 organisations, or if a number can be worked out from other numbers, the number is not shown; the dashboard shows "<5". Each number shown is rounded to a multiple of 5, so the parts may not add up to the total. The agency also sees the status of its own invite codes (active, revoked, expired); it does not see how many times a code was used. Invite codes have no use limit. If someone tries an unusable code (expired or revoked), the reason and the time are written to the agency's own records. This record contains no information about the person who tried. We update this addendum before the agency is shown any new number. `<<LEGAL-5: threshold>>`

**7. What the agency does not see**
The agency is not shown your organisation's name. The agency also does **not** see your name, your email, which invite code your organisation used, your scorecard answers, your organisation's own score, your concept notes, the documents you upload, your saved searches or your billing data. FonBridge does not give this data to the agency.

**8. Transfers outside Türkiye**
This addendum adds no new transfer outside Türkiye. The agency sees the numbers on its dashboard inside FonBridge. Transfers related to your account are listed in the main notice. `<<LEGAL-6: rewrite this item if a report is later sent by email (B3)>>`

**9. How long we keep it**
We keep the agency link while your organisation's account is open. If your organisation's account is deleted, your organisation is no longer counted in the agency's numbers. If the link is removed (item 10), we keep the link record for `<<LEGAL-7: period>>`. Numbers that the agency already saw are anonymous, so we cannot recall them.

**10. Your rights and removing the agency link**
Your rights are listed in the main notice. Today you cannot remove the agency link in the product. If an admin of your organisation asks through the contact channel in item 11, FonBridge removes the link manually. After the link is removed, your organisation is no longer counted in the agency's numbers. A way to remove the link in the product is planned. `<<product decision A3: manual removal process and response time>>` `<<LEGAL-8>>`

**11. Contact**
`<<LEGAL-1: contact channel — same as the main notice>>`

## 6. Yayın şartları (bu ek yayına girmeden önce)

1. **[HUKUK]** §7'deki bütün sorular cevaplanmış; `<<…>>` alanlarının tamamı dolu (TR ve EN).
2. Ana aydınlatma metninin veri sorumlusu bölümü (`privacy-notice-gap-analysis.md` §6 Bölüm 1) dolu. Ek, ana metinden daha eksiksiz bir kimlik veremez.
3. **Kod doğrulaması:** B2 panosu §2.1 listesinden **fazlasını** göstermiyor ve §3.1 küçük sayı kuralı (eşik, tamamlayıcı gizleme, tek kırılım, yuvarlama) kodda var — kaynak kodda doğrulandı (TASK-MULXXDG4O483Y eşleşme tablosu; ilk sürüm TASK-MULWC74HGLY9T). Gerçek pano ekranında ve B3 gelince gerçek bir rapor dosyasında yeniden doğrulanır (sentetik değil). §2.2'deki bir madde koda girerse bu ek ve envanter §18c önce güncellenir.
4. S4 cevabı (ajans kurum adını görecek mi) kesinleşmiş. Bugünkü metin "gösterilmez" diyor; cevap "evet" olursa §3 ve §4 madde 7 yeniden yazılır.
5. Ek, `src/lib/legal/consent-documents.ts` içinde **kendi sürümü** olan ayrı bir belge olarak tanımlanmış (`TASK-MULRRHM9N7XPM-cs-fb.md` §4). Metin değişirse sürüm artar. Bugün tanımlı **değil** (dosyada `agency` geçmiyor).
6. Kayıt ekranı eki gösteriyor. Bugün kodlu kayıtta yalnız kısa bir satır içi bant var (`src/app/[locale]/login/AuthCard.tsx`, `invite-code-banner`); ek bağlantısı ve ajans görür/görmez metni yok. Bu şart sağlanmadan kodlu kayıt gerçek kullanıcıya (pilot) açılmamalı.
7. Tamamlandı (TASK-MULWC74HGLY9T): §18c satırı gerçek model ve dosya adlarıyla `processing-register.md`'ye taşındı, taslak dosya silindi.
8. Tamamlandı (TASK-MUM3WSS7DOGJL): B6 maddeleri commit `897d3608` ile dosya:satır karşılaştırıldı, işaretler kaldırıldı; envanter §18c (g) karne sonucunu içeriyor. Gerçek kayıt ekranında ve panoda B6 kanıtı: `docs/agent-results/TASK-MULRR8P7HIII4-fe-fb.md` §2.
9. Madde 10'daki "talep üzerine elle kaldırma" için bir iç süreç (kim, hangi sürede) yazılmış (A3). Süreç yoksa madde 10 bu cümleyi vaat etmemeli.

## 7. Hukuk ekibine sorular

| No       | Soru                                                                                                                                                                                                                                                                       | Neden önemli                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| HUKUK-1  | Veri sorumlusunun tam kimliği ve başvuru kanalı nedir?                                                                                                                                                                                                                     | Ana metinde de eksik; ek ana metinle aynı kimliği yazmalı                                             |
| HUKUK-2  | Yalnız anonim toplu sayı alan ajans, KVKK anlamında "alıcı" mıdır? Ortak veri sorumlusu olabilir mi (kodu dağıtan, kanalı yöneten taraf olarak)?                                                                                                                           | Cevap "evet" ise ek bir **aktarım** bölümü ve md.8 dayanağı gerekir                                   |
| HUKUK-3  | Ajans bağının kurulması ve sayıların üretilmesi için hukuki sebep hangisi (md.5/2-f / md.5/2-c)? Dengeleme testi gerekir mi?                                                                                                                                               | Kayıt ekranındaki kutunun "rıza" değil "aydınlatma teyidi" olarak kalması buna bağlı                  |
| HUKUK-4  | Kurum adı bugün ajansa gösterilmiyor. İleride gösterilmek istenirse (S4), KOBİ şahıs şirketleri için ayrı bir aydınlatma ya da hukuki sebep gerekir mi?                                                                                                                    | Kurum adı, şahıs şirketinde gerçek kişiyi tanıtır                                                     |
| HUKUK-5  | Eşik 5 + tamamlayıcı gizleme + 5'e yuvarlama + tek kırılım (il YA DA tür) + tek birikimli pencere, açık kalan zaman kanalıyla (§3.1 K-1) birlikte anonimleştirme için yeterli mi?                                                                                          | Anonimlik iddiası ve HUKUK-2 varsayımı buna dayanır                                                   |
| HUKUK-6  | B3 ile rapor ajansa e-postayla gönderilirse bu ekte yazılmalı mı?                                                                                                                                                                                                          | E-posta sağlayıcısı yurt dışındadır (envanter §21, Resend); rapor anonimse etkisiz olabilir           |
| HUKUK-7  | Bağ kaldırıldıktan sonra bağ kaydının saklama süresi ne olmalı?                                                                                                                                                                                                            | Envanter §18c'de boş bırakıldı                                                                        |
| HUKUK-8  | Bağı kaldırma bir md.11 hakkı olarak mı, sözleşmesel bir seçenek olarak mı anlatılmalı? Kaldırma sırasında geçmiş sayılar için ne denmeli?                                                                                                                                 | Yanlış çerçeve, olmayan bir hak vaat edebilir                                                         |
| HUKUK-9  | EN metinde GDPR art.13 karşılığı olarak farklı yazılması gereken bir madde var mı?                                                                                                                                                                                         | Gap analizi §6 iki dil kuralı                                                                         |
| HUKUK-10 | Ek ayrı bir belge olarak mı kalmalı, ana aydınlatma metninin bir bölümü mü olmalı? Mevcut kullanıcılar (kodla sonradan bağlanan) için ayrı bir teyit ekranı gerekir mi?                                                                                                    | Kayıt ekranındaki kutu metnini ve `Consent` kaydını belirler. Bugün bağ yalnız yeni kayıtta kuruluyor |
| HUKUK-11 | Kurumun ili (`Tenant.province`) şahıs şirketi olan bir KOBİ'de kişisel veri sayılır mı? İl her kayıtta (kodsuz da) sorulduğuna göre ana aydınlatma metnine de yazılmalı mı?                                                                                                | Leed-fb kararı "kurum verisi" diyor; şahıs şirketinde il kişinin iş yerini gösterir                   |
| HUKUK-12 | Karne sonucunu hesaba ekleme kutusu (B6, varsayılan işaretsiz) rıza mıdır, yoksa aydınlatma + kişinin kendi eylemi mi? Kurumda saklanan karne cevaplarının saklama süresi ne olmalı? Kutu kodsuz kayıtta da çıktığı için bu işleme ana aydınlatma metnine de yazılmalı mı? | §18b kuralı: kayıt kutusu rıza değil aydınlatma teyidi; B6 kutusu bundan ayrı bir kutu                |
