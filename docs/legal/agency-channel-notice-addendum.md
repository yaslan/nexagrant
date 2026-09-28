# Ajans Kanalı Aydınlatma Eki — TASLAK (TR + EN)

> Sürüm **0.1-taslak** · 29.09.2026 · Hazırlayan: CS-FB · Kart: TASK-MULRRHM9N7XPM (FB-KAMU-2, B12)
>
> **Durum: TASLAK. Hukuk onayı YOK. Yayında DEĞİL.** Bu belge bir hukuki metin değildir; hukuk ekibinin önüne konacak bir çalışma taslağıdır. Hukuk incelemesi gereken her yer **[HUKUK]** diye işaretlidir. İşaretsiz bir cümle de hukuken onaylı sayılmaz.
>
> Dayanak: `docs/kamu/OKA-KANAL-ONERISI.md` §2, §4, §6 (B1, B2, B3, B6, B12) · `docs/legal/processing-register.md` §1, §2, §18b · `docs/legal/privacy-notice-gap-analysis.md` §4, §6 · `src/lib/legal/consent-documents.ts`.
>
> Envanter satırı taslağı ayrı dosyadadır: `docs/legal/processing-register-draft-agency-channel.md`.

## 0. Bu belge nedir, ne değildir

**Nedir:** Bir kurum, bir kalkınma ajansının verdiği **toplu davet koduyla** kayıt olduğunda, ana aydınlatma metnine (`/[locale]/privacy`) **ek olarak** gösterilecek metnin taslağı. Metin iki soruyu açıkça cevaplar:

1. Davet koduyla kayıt olunca **hangi ek veri** işlenir?
2. Ajansa **hangi veri gider**, hangisi **gitmez**?

**Ne değildir:**

- Ana aydınlatma metninin yerine geçmez. Ana metnin hukuki içeriği hâlâ hukuk girdisi bekliyor (TASK-MTSWIFJKGTYC, `privacy-notice-gap-analysis.md` §6). Bu ek, ana metnin veri sorumlusu kimliği gibi boşluklarını **kapatmaz**; aynı boşlukları kendi içinde de taşır.
- Bugünkü kodu anlatmaz. B1 (davet kodu), B2 (ajans panosu), B3 (bölge raporu) ve B6 (karne-hesap bağı) **henüz kodda yok** (29.09.2026: `prisma/schema.prisma` içinde `agency`, `parentTenant`, `inviteCode` araması boş). Metin, bu kartların **tasarlanan** davranışını anlatır. Kod bu metinden farklı davranırsa **metin yanlış olur**. Bu yüzden §6'daki "yayın şartları" bir kod doğrulaması ister.

## 1. Taraflar ve roller (taslak)

| Taraf                                                                 | Bu akıştaki rolü                                                                                                                   | Not                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FonBridge işletmecisi** (ölçülen aday unvan: `FonBridge Ltd. Şti.`) | Kayıt olan kişinin hesap verisi ve **kurumun ajansa bağlanma kaydı** için veri sorumlusu                                           | **[HUKUK-1]** Unvan, MERSİS, adres, KEP henüz teyitli değil (`privacy-notice-gap-analysis.md` §4.1). Ekte ana metinle **aynı** kimlik yazılmalı.                                                                                                                                                  |
| **Kalkınma ajansı** (ör. OKA)                                         | Davet kodunu dağıtır. Yalnız **anonim, toplulaştırılmış sayılar** alır (§2). Kurumların hesaplarına, içeriğine ve kişilere erişmez | **[HUKUK-2]** Ajans, yalnız anonim veri aldığı için kişisel veri **alıcısı** sayılmaz varsayımıyla yazıldı (KVKK md.3/1-b anonimleştirme; md.28/1-ç istatistik). Bu varsayım §3'teki küçük sayı kuralına bağlıdır. Ajansın **ortak veri sorumlusu** sayılıp sayılmayacağı da hukukçuya sorulmalı. |
| **Kurum** (kiracı: belediye, KOBİ, …)                                 | Bugün olduğu gibi, kendi yüklediği proje verisi için veri sorumlusu; FonBridge bu veride veri işleyendir (`dpa-tr.md` §1)          | Bu ek kurumun kendi içeriğiyle ilgili rolleri **değiştirmez**.                                                                                                                                                                                                                                    |

## 2. Ajansa GİDEN veri — tam liste

Kaynak: `OKA-KANAL-ONERISI.md` §4 (huni) ve B2/B3 kabul ölçütleri. Tamamı **kurum düzeyinde sayı**dır; kişi düzeyinde veri yoktur.

| Veri                                                          | Düzey                              | Nerede görünür                 | Sıklık        |
| ------------------------------------------------------------- | ---------------------------------- | ------------------------------ | ------------- |
| Davet koduyla açılan kurum sayısı                             | Sayı                               | Ajans panosu (B2) + rapor (B3) | Canlı + aylık |
| Karnesini tamamlayan kurum sayısı                             | Sayı                               | Pano + rapor                   | Canlı + aylık |
| Ortalama karne puanı                                          | Ortalama (tek kurumun puanı değil) | Pano + rapor                   | Canlı + aylık |
| En az 1 kayıtlı araması olan kurum sayısı                     | Sayı                               | Pano + rapor                   | Canlı + aylık |
| En az 1 çağrıyı pipeline'a alan kurum sayısı                  | Sayı                               | Pano + rapor                   | Canlı + aylık |
| En az 1 konsept not üreten kurum sayısı                       | Sayı                               | Pano + rapor                   | Canlı + aylık |
| Başvuru gönderdiğini beyan eden kurum sayısı                  | Sayı                               | Pano + rapor                   | Canlı + aylık |
| Kabul / red beyan eden kurum sayısı                           | Sayı                               | Pano + rapor                   | Canlı + aylık |
| Kırılımlar: **il**, **kurum türü**, **program** (Erasmus+, …) | Yukarıdaki sayıların dağılımı      | Pano + rapor                   | Canlı + aylık |
| Davet kodunun kullanım sayısı ve kalan hakkı                  | Kodun kendisine ait sayı           | Pano (kod yönetimi)            | Canlı         |

**[HUKUK-3]** Sayıların **üretilmesi** (anonimleştirmeden önceki hesaplama) FonBridge'in veritabanında yapılan bir işlemedir. Bu işlemenin hukuki sebebi için taslak önerisi: KVKK md.5/2-f (meşru menfaat) — gerekçe: kurumun ajans kanalıyla gelmesi ve kanalın ölçülmesi. Alternatif: md.5/2-c (kurumla kurulan sözleşmenin, yani kanal hizmetinin, ifası). Seçim ve gerekirse dengeleme testi hukukçunun.

## 3. Ajansa GİTMEYEN veri — açık liste

Ajans panosu ve bölge raporu **şunları göstermez**:

- Kayıt olan kişinin **adı, e-postası**, rolü, giriş zamanları.
- Kurumun **adı** ve kurumu tek başına tanıtan bilgi. **[HUKUK-4 / ürün kararı]** Bu madde açık soru S4'e bağlı (`OKA-KANAL-ONERISI.md` §8: "OKA kişisel veriye erişmek istiyor mu? Öneri: hayır"). Kurum adı ajansa gösterilecekse bu ek **yeniden yazılır**: kurum adı, şahıs şirketi olan bir KOBİ için kişisel veridir.
- Karne cevapları (tek tek sorular) ve **tek bir kurumun** karne puanı.
- Konsept notlar, yüklenen belgeler, kanıtlar, yorumlar, YZ istemleri ve çıktıları.
- Kayıtlı aramaların kriterleri ve **hangi kurumun** hangi çağrıyı seçtiği.
- Faturalama ve vergi kimliği verisi (VKN/TCKN).
- Ekip üyelerinin listesi ve sayısı. **[ürün kararı]** "Kurum başına kullanıcı sayısı" raporda olmamalı; B8 (haftalık aktif kullanıcı) çıktısı ajans raporuna girecekse bu ek güncellenir.

### 3.1 Küçük sayı kuralı (anonimliğin şartı)

Toplu sayı her zaman anonim değildir. Örnek: rapor "Çorum · belediye · karne tamamlandı: **1**" derse ve ajans o hafta Çorum'da tek bir belediyeye kod verdiyse, sayı o belediyeyi tanıtır. Kurum şahıs şirketi olan bir KOBİ ise bu, bir **gerçek kişiyi** tanıtmak demektir.

Taslak kural (B3 ve B2 kartlarına kabul ölçütü olarak önerilir):

- Bir kırılım hücresinde sayı **5'ten küçükse** değer yazılmaz, **"<5"** yazılır.
- "<5" hücresi, satır ve sütun toplamlarından geri hesaplanamamalıdır (ikinci hücre de gizlenir ya da toplam yuvarlanır).
- Ortalama karne puanı, **en az 5 kurumun** olduğu hücrede gösterilir.

**[HUKUK-5]** Eşik (5) bir öneridir, dış kaynaktan gelen bir değer değildir. B2 ve B3 kartlarıyla tek eşik kullanılır; ikisinden daha katı olan (5) seçildi (leed-fb kararı, 29.09.2026). KVKK'nın anonimleştirme rehberindeki ölçütlerle hukukçu teyit etmelidir. Kural uygulanmazsa §2'deki "anonim" iddiası ve [HUKUK-2]'deki "ajans alıcı değildir" varsayımı **düşer**.

## 4. Kullanıcıya gösterilecek ek metin — TR (taslak)

> Aşağıdaki metin `/[locale]/privacy/agency-channel` (öneri; mevcut `/[locale]/privacy` ile aynı slug düzeni) sayfasında yayımlanacak **tam metnin** taslağıdır. Kayıt ekranındaki kısa metin ayrıdır (sonuç raporu §3). `<<…>>` alanları ana aydınlatma metniyle birlikte doldurulur.

### Ajans Kanalı Aydınlatma Eki

**Sürüm:** `<<HUKUK: sürüm ve yürürlük tarihi>>`

**1. Bu ek neyi kapsar?**
Bu ek, bir kalkınma ajansının verdiği davet koduyla FonBridge'e kayıt olan kurumlar ve bu kurumların kullanıcıları içindir. [Gizlilik Politikası ve KVKK Aydınlatma Metni](/tr/privacy) sizin için aynen geçerlidir. Bu ek, davet koduyla kayıt olunca **ek olarak** ne olduğunu anlatır.

**2. Veri sorumlusu**
`<<HUKUK-1: tüzel kişi unvanı, MERSİS no, merkez adresi, KEP adresi, başvuru e-postası — ana metinle aynı>>`

**3. Davet koduyla kayıtta ek olarak işlenen veriler**

- Kullandığınız davet kodu,
- Kodu veren ajans,
- Kurumunuzun ajansa bağlandığı tarih,
- Kurum türünüz ve iliniz (ajans raporunda kırılım olarak kullanılır).

Hesabınız için işlenen diğer veriler (ad, e-posta vb.) ana aydınlatma metninde yazılıdır.

**4. Amaç**
Kurumunuzu, sizi davet eden ajansın kanalına bağlamak ve ajansa, bölgesindeki kurumların FonBridge'i nasıl kullandığını **toplu sayılarla** raporlamak.

**5. Hukuki sebep**
`<<HUKUK-3: md.5/2-f meşru menfaat mi, md.5/2-c sözleşmenin ifası mı; dengeleme testi gerekiyor mu>>`

**6. Ajans neyi görür?**
Ajans **yalnız toplu sayıları** görür: kodla kaç kurumun kayıt olduğu, kaç kurumun karnesini tamamladığı, kaç kurumun çağrı seçtiği, kaç kurumun başvuru yaptığını beyan ettiği ve sonuçlar. Bu sayılar il, kurum türü ve program kırılımıyla verilir. Bir kırılımda 5'ten az kurum varsa sayı gösterilmez, "<5" yazılır. `<<HUKUK-5: eşik teyidi>>`

**7. Ajans neyi görmez?**
Ajans; adınızı, e-postanızı, `<<HUKUK-4 / S4: kurumunuzun adını>>`, karne cevaplarınızı, tek başına kurumunuzun puanını, konsept notlarınızı, yüklediğiniz belgeleri, kayıtlı aramalarınızı ve fatura bilgilerinizi **görmez**. FonBridge bu verileri ajansa aktarmaz.

**8. Yurt dışına aktarım**
Bu ek yeni bir yurt dışı aktarım getirmez. Ajansa giden rapor anonim sayılardan oluşur. Hesabınızla ilgili yurt dışı aktarımlar ana aydınlatma metninde yazılıdır. `<<HUKUK-6: raporun ajansa ulaştırılma kanalı (panodan indirme / e-posta) teyidi>>`

**9. Saklama süresi**
Ajans bağı kaydı, kurum hesabınız açık kaldığı sürece saklanır. Bağı kaldırırsanız (madde 10) kayıt `<<HUKUK-7: süre>>` sonra silinir. Ajansa daha önce gönderilmiş aylık raporlar anonim sayılardan oluştuğu için geri çekilmez.

**10. Haklarınız ve ajans bağını kaldırma**
KVKK md.11 kapsamındaki haklarınız ana aydınlatma metninde yazılıdır. Ek olarak, kurumunuzun yöneticisi ajans bağını `<<ürün kararı: Ayarlar → Gizlilik>>` bölümünden kaldırabilir. Bağ kaldırıldıktan sonra kurumunuz ajansın sayılarına **girmez**. `<<HUKUK-8: bağı kaldırma hakkı bir md.11 hakkı mı, sözleşmesel bir seçenek mi>>`

**11. Başvuru**
`<<HUKUK-1: başvuru kanalı — ana metinle aynı>>`

## 5. User-facing addendum text — EN (draft)

> Draft of the **full text** to be published at `/en/privacy/agency-channel` (proposal). `privacy-notice-gap-analysis.md` §6 says the EN text is the GDPR art.13 equivalent, not a translation, so legal decides which items differ between the two regimes. **[HUKUK-9]**

### Agency Channel Privacy Notice Addendum

**Version:** `<<LEGAL: version and effective date>>`

**1. What this addendum covers**
This addendum is for organisations that sign up to FonBridge with an invite code from a regional development agency, and for their users. The [Privacy Policy and Data Protection Notice](/en/privacy) still applies to you in full. This addendum tells you what happens **in addition** when you sign up with an invite code.

**2. Controller**
`<<LEGAL-1: legal name, registry number, registered address, contact for data requests — same as the main notice>>`

**3. Additional data we process when you sign up with a code**

- The invite code you used,
- The agency that gave the code,
- The date your organisation was linked to the agency,
- Your organisation type and province (used as breakdowns in the agency report).

The other data we process for your account (name, email, etc.) is listed in the main notice.

**4. Purpose**
To link your organisation to the channel of the agency that invited you, and to report to the agency, **as aggregate numbers only**, how organisations in its region use FonBridge.

**5. Legal basis**
`<<LEGAL-3: legitimate interest (GDPR art.6(1)(f)) or performance of a contract (art.6(1)(b)); balancing test needed?>>`

**6. What the agency sees**
The agency sees **aggregate numbers only**: how many organisations signed up with the code, how many completed the readiness scorecard, how many picked a call, how many said they applied, and the results. The numbers are broken down by province, organisation type and programme. If a breakdown has fewer than 5 organisations, the number is not shown; the report shows "<5". `<<LEGAL-5: threshold>>`

**7. What the agency does not see**
The agency does **not** see your name, your email, `<<LEGAL-4 / S4: your organisation's name>>`, your scorecard answers, your organisation's own score, your concept notes, the documents you upload, your saved searches or your billing data. FonBridge does not give this data to the agency.

**8. Transfers outside Türkiye**
This addendum adds no new transfer outside Türkiye. The report the agency gets contains only anonymous numbers. Transfers related to your account are listed in the main notice. `<<LEGAL-6>>`

**9. How long we keep it**
We keep the agency link while your organisation's account is open. If you remove the link (item 10), we delete the record after `<<LEGAL-7: period>>`. Monthly reports that the agency already received contain only anonymous numbers, so we cannot recall them.

**10. Your rights and removing the agency link**
Your rights are listed in the main notice. In addition, an admin of your organisation can remove the agency link in `<<product decision: Settings → Privacy>>`. After you remove it, your organisation is no longer counted in the agency's numbers. `<<LEGAL-8>>`

**11. Contact**
`<<LEGAL-1: contact channel — same as the main notice>>`

## 6. Yayın şartları (bu ek yayına girmeden önce)

1. **[HUKUK]** §7'deki bütün sorular cevaplanmış; `<<…>>` alanlarının tamamı dolu (TR ve EN).
2. Ana aydınlatma metninin veri sorumlusu bölümü (`privacy-notice-gap-analysis.md` §6 Bölüm 1) dolu. Ek, ana metinden daha eksiksiz bir kimlik veremez.
3. **Kod doğrulaması:** B2 panosu ve B3 raporu, §2'deki listeden **fazlasını** göstermiyor; §3.1 küçük sayı kuralı kodda var. Bu doğrulama gerçek pano ekranı ve gerçek bir rapor dosyası üzerinde yapılır (sentetik değil).
4. S4 cevabı (ajans kurum adını görecek mi) kesinleşmiş ve §3, §4 madde 7 buna göre yazılmış.
5. Ek, `src/lib/legal/consent-documents.ts` içinde **kendi sürümü** olan ayrı bir belge olarak tanımlanmış (sonuç raporu §4). Metin değişirse sürüm artar.
6. `docs/legal/processing-register-draft-agency-channel.md` taslağı, B1 birleştikten sonra `processing-register.md`'ye gerçek model ve dosya adlarıyla taşınmış.

## 7. Hukuk ekibine sorular

| No       | Soru                                                                                                                                                                    | Neden önemli                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| HUKUK-1  | Veri sorumlusunun tam kimliği ve başvuru kanalı nedir?                                                                                                                  | Ana metinde de eksik; ek ana metinle aynı kimliği yazmalı                                   |
| HUKUK-2  | Yalnız anonim toplu sayı alan ajans, KVKK anlamında "alıcı" mıdır? Ortak veri sorumlusu olabilir mi (kodu dağıtan, kanalı yöneten taraf olarak)?                        | Cevap "evet" ise ek bir **aktarım** bölümü ve md.8 dayanağı gerekir                         |
| HUKUK-3  | Ajans bağının kurulması ve sayıların üretilmesi için hukuki sebep hangisi (md.5/2-f / md.5/2-c)? Dengeleme testi gerekir mi?                                            | Kayıt ekranındaki kutunun "rıza" değil "aydınlatma teyidi" olarak kalması buna bağlı        |
| HUKUK-4  | Ajansa kurum adı gösterilirse (S4), KOBİ şahıs şirketleri için ayrı bir aydınlatma ya da hukuki sebep gerekir mi?                                                       | Kurum adı, şahıs şirketinde gerçek kişiyi tanıtır                                           |
| HUKUK-5  | "<5" eşiği ve geri hesaplamayı engelleme kuralı, anonimleştirme için yeterli mi?                                                                                        | Anonimlik iddiası ve HUKUK-2 varsayımı buna dayanır                                         |
| HUKUK-6  | Raporun ajansa ulaştırılma kanalı (pano indirme / e-posta) bu ekte yazılmalı mı?                                                                                        | E-posta sağlayıcısı yurt dışındadır (envanter §21, Resend); rapor anonimse etkisiz olabilir |
| HUKUK-7  | Bağ kaldırıldıktan sonra bağ kaydının saklama süresi ne olmalı?                                                                                                         | Envanter satırında boş bırakıldı                                                            |
| HUKUK-8  | Bağı kaldırma bir md.11 hakkı olarak mı, sözleşmesel bir seçenek olarak mı anlatılmalı? Kaldırma sırasında geçmiş raporlar için ne denmeli?                             | Yanlış çerçeve, olmayan bir hak vaat edebilir                                               |
| HUKUK-9  | EN metinde GDPR art.13 karşılığı olarak farklı yazılması gereken bir madde var mı?                                                                                      | Gap analizi §6 iki dil kuralı                                                               |
| HUKUK-10 | Ek ayrı bir belge olarak mı kalmalı, ana aydınlatma metninin bir bölümü mü olmalı? Mevcut kullanıcılar (kodla sonradan bağlanan) için ayrı bir teyit ekranı gerekir mi? | Kayıt ekranındaki kutu metnini ve `Consent` kaydını belirler                                |
