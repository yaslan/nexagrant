# Ajans Kanalı Aydınlatma Eki — TASLAK (TR + EN)

> Sürüm **0.2-taslak** · 29.09.2026 · Hazırlayan: CS-FB · Kart: TASK-MULRRHM9N7XPM (FB-KAMU-2, B12) · Kodla hizalama: TASK-MULWC74HGLY9T
>
> **Durum: TASLAK. Hukuk onayı YOK. Yayında DEĞİL.** Bu belge bir hukuki metin değildir; hukuk ekibinin önüne konacak bir çalışma taslağıdır. Hukuk incelemesi gereken her yer **[HUKUK]** diye işaretlidir. İşaretsiz bir cümle de hukuken onaylı sayılmaz.
>
> Dayanak: `docs/kamu/OKA-KANAL-ONERISI.md` §2, §4, §6 (B1, B2, B3, B6, B12) · `docs/legal/processing-register.md` §1, §2, §13, §18b, §18c · `docs/legal/privacy-notice-gap-analysis.md` §4, §6 · `src/lib/legal/consent-documents.ts`.
>
> Kod dayanağı: `prisma/schema.prisma` (`Tenant.agencyId`, `AgencyInviteCode`) · `src/lib/auth.ts` (kodla kayıt) · `src/lib/agency/codes.ts` · `src/lib/agency/funnel.ts` · `prisma/migrations/add-agency-invite-code.sql`, `add-agency-funnel.sql`, `fix-agency-invite-rejection-audit.sql`.
>
> İşleme envanteri satırı: `docs/legal/processing-register.md` §18c.

## 0. Bu belge nedir, ne değildir

**Nedir:** Bir kurum, bir kalkınma ajansının verdiği **toplu davet koduyla** kayıt olduğunda, ana aydınlatma metnine (`/[locale]/privacy`) **ek olarak** gösterilecek metnin taslağı. Metin iki soruyu açıkça cevaplar:

1. Davet koduyla kayıt olunca **hangi ek veri** işlenir?
2. Ajansa **hangi veri gider**, hangisi **gitmez**?

**Ne değildir:**

- Ana aydınlatma metninin yerine geçmez. Ana metnin hukuki içeriği hâlâ hukuk girdisi bekliyor (TASK-MTSWIFJKGTYC, `privacy-notice-gap-analysis.md` §6). Bu ek, ana metnin veri sorumlusu kimliği gibi boşluklarını **kapatmaz**; aynı boşlukları kendi içinde de taşır.
- Planı anlatmaz, **bugünkü kodu** anlatır (29.09.2026, `dev`). B1 (davet kodu, kodla kayıt) ve B2 (ajans panosu) kodda. B3 (aylık bölge raporu) ve B6 (karne ile hesap bağı) henüz kodda **yok**. Bunlara bağlı maddeler "**B3 ile gelecek**" ya da "**B6 ile gelecek**" diye ayrı işaretlidir. Bu maddeler bugün işlenen ya da ajansa giden veri **değildir** ve kullanıcı metnine (§4, §5) girmez. Kod bu metinden farklı davranırsa **metin yanlış olur**. Kodla eşleşme tablosu: `docs/agent-results/TASK-MULWC74HGLY9T-cs-fb.md` §2.

## 1. Taraflar ve roller (taslak)

| Taraf                                                                 | Bu akıştaki rolü                                                                                                                   | Not                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FonBridge işletmecisi** (ölçülen aday unvan: `FonBridge Ltd. Şti.`) | Kayıt olan kişinin hesap verisi ve **kurumun ajansa bağlanma kaydı** için veri sorumlusu                                           | **[HUKUK-1]** Unvan, MERSİS, adres, KEP henüz teyitli değil (`privacy-notice-gap-analysis.md` §4.1). Ekte ana metinle **aynı** kimlik yazılmalı.                                                                                                                                                  |
| **Kalkınma ajansı** (ör. OKA)                                         | Davet kodunu dağıtır. Yalnız **anonim, toplulaştırılmış sayılar** alır (§2). Kurumların hesaplarına, içeriğine ve kişilere erişmez | **[HUKUK-2]** Ajans, yalnız anonim veri aldığı için kişisel veri **alıcısı** sayılmaz varsayımıyla yazıldı (KVKK md.3/1-b anonimleştirme; md.28/1-ç istatistik). Bu varsayım §3'teki küçük sayı kuralına bağlıdır. Ajansın **ortak veri sorumlusu** sayılıp sayılmayacağı da hukukçuya sorulmalı. |
| **Kurum** (kiracı: belediye, KOBİ, …)                                 | Bugün olduğu gibi, kendi yüklediği proje verisi için veri sorumlusu; FonBridge bu veride veri işleyendir (`dpa-tr.md` §1)          | Bu ek kurumun kendi içeriğiyle ilgili rolleri **değiştirmez**.                                                                                                                                                                                                                                    |

## 2. Ajansa GİDEN veri — tam liste

Kaynak: kod (`src/lib/agency/funnel.ts`, `src/app/[locale]/(app)/ajans/page.tsx`). Tamamı **toplu sayıdır**; kişi düzeyinde veri ve kurum kimliği yoktur. Sayılar ajans panosunda (B2), ajansın seçtiği dönem için (son 30 ya da 90 gün) gösterilir. Dönem, kurumun kayıt tarihine göre seçilir.

### 2.1 Bugün giden (kodda var)

| Veri                                                                                                     | Düzey                         | Nerede görünür                                                      |
| -------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Davet koduyla açılan kurum sayısı                                                                        | Kurum sayısı                  | Ajans panosu                                                        |
| En az 1 kayıtlı araması olan kurum sayısı                                                                | Kurum sayısı                  | Ajans panosu                                                        |
| En az 1 çağrıyı takibe (pipeline) alan kurum sayısı                                                      | Kurum sayısı                  | Ajans panosu                                                        |
| En az 1 konsept not üreten kurum sayısı                                                                  | Kurum sayısı                  | Ajans panosu                                                        |
| Bu kurumların gönderdiği başvuru sayısı                                                                  | **Başvuru** sayısı            | Ajans panosu                                                        |
| Bu başvurulardan kurumun kabul ya da red olarak işaretlediği başvuru sayısı                              | **Başvuru** sayısı            | Ajans panosu                                                        |
| Kırılım: **yalnız kurum türü** (belediye, kamu, KOBİ, …)                                                 | Yukarıdaki sayıların dağılımı | Ajans panosu                                                        |
| Ajansın kendi davet kodları: etiket, son 4 karakter, üst sınır, kullanım sayısı, son tarih, iptal durumu | Kodun kendisine ait sayı      | Pano (kod yönetimi)                                                 |
| Davet kodunuzla yapılan reddedilmiş denemelerin sayısı ve nedeni (kişi bilgisi yok)                      | Deneme kaydı, kişi yok        | Ajansın kendi kayıt alanı (denetim kaydı). Bugün panoda gösterilmez |

Son satır hakkında: bilinen ama kullanılamayan bir kod (süresi dolmuş, hakkı bitmiş, iptal edilmiş) denendiğinde, ajansın kendi kiracısına bir denetim kaydı yazılır: neden, kodun kayıt kimliği ve zaman. Deneyen kişi, kod ve kodun özeti yazılmaz. Hiç var olmayan bir kod ajansa yazılmaz; yalnız platform yöneticisinin gördüğü bir sayaç artar.

"Karnesini tamamlayan kurum sayısı" adımı panoda yer alır ama sayı **gönderilmez**; "Henüz ölçülmüyor" yazar (B6 yok).

### 2.2 Bugün GİTMEYEN, ileride gelebilecek (B3 / B6 ile gelecek)

Aşağıdakiler bugün kodda **yoktur**. Kullanıcı metnine (§4, §5) yazılmaz. Kod gelince bu ek ve envanter §18c **önce** güncellenir, sonra özellik canlıya çıkar.

| Veri                                     | Bugünkü durum                                                                   | Bağlı kart               |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------ |
| Karnesini tamamlayan kurum sayısı        | Panoda "Henüz ölçülmüyor"                                                       | B6 ile gelecek           |
| Ortalama karne puanı                     | Hiç yok                                                                         | B6 ile gelecek           |
| **İl** kırılımı                          | İl toplanmıyor; panoda "İl bilgisi henüz toplanmıyor" yazar. `Tenant`'ta il yok | TASK-MULV3JXS1AW5X, B3   |
| **Program** kırılımı (Erasmus+, …)       | Hiç yok                                                                         | B3 ile gelecek           |
| Aylık bölge raporu (dosya ya da e-posta) | Hiç yok; ajans sayıları yalnız panoda görür                                     | B3 ile gelecek (HUKUK-6) |

**[HUKUK-3]** Sayıların **üretilmesi** (anonimleştirmeden önceki hesaplama) FonBridge'in veritabanında yapılan bir işlemedir. Bu işlemenin hukuki sebebi için taslak önerisi: KVKK md.5/2-f (meşru menfaat) — gerekçe: kurumun ajans kanalıyla gelmesi ve kanalın ölçülmesi. Alternatif: md.5/2-c (kurumla kurulan sözleşmenin, yani kanal hizmetinin, ifası). Seçim ve gerekirse dengeleme testi hukukçunun.

## 3. Ajansa GİTMEYEN veri — açık liste

Ajans panosu **şunları göstermez**:

- Kayıt olan kişinin **adı, e-postası**, rolü, giriş zamanları.
- Kurumun **adı** ve kurumu tek başına tanıtan bilgi. Kod kurum adını ya da kimliğini ajansa göndermez: huni yalnız sayı döndürür, kurum kimlikleri sunucuda kalır. **[HUKUK-4]** yalnız "kurum adı ileride gösterilmek istenirse" sorusu olarak açıktır (S4, `OKA-KANAL-ONERISI.md` §8). O durumda bu ek **yeniden yazılır**: kurum adı, şahıs şirketi olan bir KOBİ için kişisel veridir.
- Hangi kurumun hangi davet kodunu kullandığı. Kurum hesabına yalnız ajansın kimliği bağlanır; kod bağlanmaz.
- Karne cevapları (tek tek sorular) ve **tek bir kurumun** karne puanı.
- Konsept notlar, yüklenen belgeler, kanıtlar, yorumlar, YZ istemleri ve çıktıları.
- Kayıtlı aramaların kriterleri ve **hangi kurumun** hangi çağrıyı seçtiği.
- Faturalama ve vergi kimliği verisi (VKN/TCKN).
- Ekip üyelerinin listesi ve sayısı. **[ürün kararı]** "Kurum başına kullanıcı sayısı" panoda yok; B8 (haftalık aktif kullanıcı) çıktısı ajansa gösterilecekse bu ek önce güncellenir.

### 3.1 Küçük sayı kuralı (anonimliğin şartı)

Toplu sayı her zaman anonim değildir. Örnek: pano "belediye · konsept not üreten: **1**" derse ve ajans o dönemde tek bir belediyeye kod verdiyse, sayı o belediyeyi tanıtır. Kurum şahıs şirketi olan bir KOBİ ise bu, bir **gerçek kişiyi** tanıtmak demektir.

Kural (kodda: `src/lib/agency/funnel.ts`, eşik `SMALL_CELL_THRESHOLD = 5`):

- Bir hücrede sayı **5'ten küçükse** (0 dahil) değer gönderilmez, **"<5"** yazılır.
- "<5" hücresi, toplamdan geri hesaplanamaz: gizlenen hücrelerin toplamı 1-4 ise en küçük görünen hücre de gizlenir.
- Kayıtlı kurum sayısı 5'ten az olan bir kurum türünde hiçbir adımın sayısı gösterilmez.
- Gizleme sunucuda yapılır; tarayıcıya 5'ten küçük bir sayı hiç gitmez.
- B6 ile gelecek: ortalama karne puanı eklenirse yalnız en az 5 kurumun olduğu hücrede gösterilmelidir.

**[HUKUK-5]** Eşik (5) bir öneridir, dış kaynaktan gelen bir değer değildir. B2 ve B3 için tek eşik kullanılır; ikisinden daha katı olan (5) seçildi (leed-fb kararı, 29.09.2026). KVKK'nın anonimleştirme rehberindeki ölçütlerle hukukçu teyit etmelidir. Kural uygulanmazsa §2'deki "anonim" iddiası ve [HUKUK-2]'deki "ajans alıcı değildir" varsayımı **düşer**.

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

Kullandığınız davet kodu hesabınıza bağlanmaz ve saklanmaz; kod yalnız kayıt sırasında kontrol edilir. Ajans raporunda kırılım olarak, kurum hesabınızda zaten kayıtlı olan **kurum türü** kullanılır; bunun için yeni bir veri toplanmaz. Hesabınız için işlenen diğer veriler (ad, e-posta vb.) ana aydınlatma metninde yazılıdır.

**4. Amaç**
Kurumunuzu, sizi davet eden ajansın kanalına bağlamak ve ajansa, davet ettiği kurumların FonBridge'i nasıl kullandığını **toplu sayılarla** göstermek.

**5. Hukuki sebep**
`<<HUKUK-3: md.5/2-f meşru menfaat mi, md.5/2-c sözleşmenin ifası mı; dengeleme testi gerekiyor mu>>`

**6. Ajans neyi görür?**
Ajans **yalnız toplu sayıları** görür: seçtiği dönemde (son 30 ya da 90 gün) kodla kaç kurumun kayıt olduğu; kaç kurumun kayıtlı arama oluşturduğu, bir çağrıyı takibe aldığı ve konsept not ürettiği; bu kurumların kaç başvuru gönderdiği ve bu başvurulardan kaçının sonucunun kurum tarafından kabul ya da red olarak işaretlendiği. Bu sayılar kurum türüne göre de gösterilir. Bir grupta 5'ten az değer varsa ya da sayı başka sayılardan geri hesaplanabiliyorsa sayı gösterilmez, "<5" yazılır. Ajans ayrıca kendi davet kodlarının kaç kez kullanıldığını görür. Kullanılamayan bir kodla (süresi dolmuş, hakkı bitmiş ya da iptal edilmiş) deneme yapılırsa ajansın kendi kayıt alanına denemenin nedeni ve zamanı yazılır; bu kayıtta deneyen kişinin bilgisi yoktur. Ajansa yeni bir sayı gösterilmeden önce bu ek güncellenir. `<<HUKUK-5: eşik teyidi>>`

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

We do not link the invite code you used to your account, and we do not keep it. We check the code only at sign-up. The agency's breakdowns use the **organisation type** that is already in your organisation's account; we do not collect new data for this. The other data we process for your account (name, email, etc.) is listed in the main notice.

**4. Purpose**
To link your organisation to the channel of the agency that invited you, and to show the agency, **as aggregate numbers only**, how the organisations it invited use FonBridge.

**5. Legal basis**
`<<LEGAL-3: legitimate interest (GDPR art.6(1)(f)) or performance of a contract (art.6(1)(b)); balancing test needed?>>`

**6. What the agency sees**
The agency sees **aggregate numbers only**, for the period it selects (the last 30 or 90 days): how many organisations signed up with the code; how many created a saved search, tracked a call and wrote a concept note; how many applications these organisations submitted, and how many of these applications the organisation marked as accepted or rejected. The numbers are also broken down by organisation type. If a group has fewer than 5, or if a number can be worked out from other numbers, the number is not shown; the dashboard shows "<5". The agency also sees how many times its own invite codes were used. If someone tries an unusable code (expired, used up or revoked), the reason and the time are written to the agency's own records. This record contains no information about the person who tried. We update this addendum before the agency is shown any new number. `<<LEGAL-5: threshold>>`

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
3. **Kod doğrulaması:** B2 panosu §2.1 listesinden **fazlasını** göstermiyor ve §3.1 küçük sayı kuralı kodda var — kaynak kodda doğrulandı (TASK-MULWC74HGLY9T eşleşme tablosu). Gerçek pano ekranında ve B3 gelince gerçek bir rapor dosyasında yeniden doğrulanır (sentetik değil). §2.2'deki bir madde koda girerse bu ek ve envanter §18c önce güncellenir.
4. S4 cevabı (ajans kurum adını görecek mi) kesinleşmiş. Bugünkü metin "gösterilmez" diyor; cevap "evet" olursa §3 ve §4 madde 7 yeniden yazılır.
5. Ek, `src/lib/legal/consent-documents.ts` içinde **kendi sürümü** olan ayrı bir belge olarak tanımlanmış (`TASK-MULRRHM9N7XPM-cs-fb.md` §4). Metin değişirse sürüm artar. Bugün tanımlı **değil** (dosyada `agency` geçmiyor).
6. Kayıt ekranı eki gösteriyor. Bugün kodlu kayıtta yalnız kısa bir satır içi bant var (`src/app/[locale]/login/AuthCard.tsx`, `invite-code-banner`); ek bağlantısı ve ajans görür/görmez metni yok. Bu şart sağlanmadan kodlu kayıt gerçek kullanıcıya (pilot) açılmamalı.
7. Tamamlandı (TASK-MULWC74HGLY9T): §18c satırı gerçek model ve dosya adlarıyla `processing-register.md`'ye taşındı, taslak dosya silindi.
8. Madde 10'daki "talep üzerine elle kaldırma" için bir iç süreç (kim, hangi sürede) yazılmış (A3). Süreç yoksa madde 10 bu cümleyi vaat etmemeli.

## 7. Hukuk ekibine sorular

| No       | Soru                                                                                                                                                                    | Neden önemli                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| HUKUK-1  | Veri sorumlusunun tam kimliği ve başvuru kanalı nedir?                                                                                                                  | Ana metinde de eksik; ek ana metinle aynı kimliği yazmalı                                             |
| HUKUK-2  | Yalnız anonim toplu sayı alan ajans, KVKK anlamında "alıcı" mıdır? Ortak veri sorumlusu olabilir mi (kodu dağıtan, kanalı yöneten taraf olarak)?                        | Cevap "evet" ise ek bir **aktarım** bölümü ve md.8 dayanağı gerekir                                   |
| HUKUK-3  | Ajans bağının kurulması ve sayıların üretilmesi için hukuki sebep hangisi (md.5/2-f / md.5/2-c)? Dengeleme testi gerekir mi?                                            | Kayıt ekranındaki kutunun "rıza" değil "aydınlatma teyidi" olarak kalması buna bağlı                  |
| HUKUK-4  | Kurum adı bugün ajansa gösterilmiyor. İleride gösterilmek istenirse (S4), KOBİ şahıs şirketleri için ayrı bir aydınlatma ya da hukuki sebep gerekir mi?                 | Kurum adı, şahıs şirketinde gerçek kişiyi tanıtır                                                     |
| HUKUK-5  | "<5" eşiği ve geri hesaplamayı engelleme kuralı, anonimleştirme için yeterli mi?                                                                                        | Anonimlik iddiası ve HUKUK-2 varsayımı buna dayanır                                                   |
| HUKUK-6  | B3 ile rapor ajansa e-postayla gönderilirse bu ekte yazılmalı mı?                                                                                                       | E-posta sağlayıcısı yurt dışındadır (envanter §21, Resend); rapor anonimse etkisiz olabilir           |
| HUKUK-7  | Bağ kaldırıldıktan sonra bağ kaydının saklama süresi ne olmalı?                                                                                                         | Envanter §18c'de boş bırakıldı                                                                        |
| HUKUK-8  | Bağı kaldırma bir md.11 hakkı olarak mı, sözleşmesel bir seçenek olarak mı anlatılmalı? Kaldırma sırasında geçmiş sayılar için ne denmeli?                              | Yanlış çerçeve, olmayan bir hak vaat edebilir                                                         |
| HUKUK-9  | EN metinde GDPR art.13 karşılığı olarak farklı yazılması gereken bir madde var mı?                                                                                      | Gap analizi §6 iki dil kuralı                                                                         |
| HUKUK-10 | Ek ayrı bir belge olarak mı kalmalı, ana aydınlatma metninin bir bölümü mü olmalı? Mevcut kullanıcılar (kodla sonradan bağlanan) için ayrı bir teyit ekranı gerekir mi? | Kayıt ekranındaki kutu metnini ve `Consent` kaydını belirler. Bugün bağ yalnız yeni kayıtta kuruluyor |
