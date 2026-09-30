# İlkadım pilotu — Destek yanıt şablonları ve talep formu

> Sürüm 0.1 · 01.10.2026 · Hazırlayan: CS-FB · Kart: TASK-MUOLBW7PZ7HM4 (FB-GAP-1)
>
> **Durum: TASLAK.** Kullanıcıya gönderilmedi. Patron onayından sonra kullanılır.
> Kod tabanı: FONBRIDGE `dev` @ `6168360b`. Her iddianın kaynağı ve gerekçesi
> [`SSS-PILOT.md`](./SSS-PILOT.md) içindeki ilgili maddededir (şablonda `→ SSS X` diye gösterilir).

## Kullanım kuralları

1. **Köşeli ayraçlı alanlar** (`[Ad]`, `[tarih]`) göndermeden önce doldurulur. `[DESTEK ADRESİ]` ve
   `[İMZA]` pilot destek adresi belirlenene kadar boş kalamaz (SSS G2, patron sorusu P-9).
2. **[DOĞRULANMADI]** işaretli cümle, patron cevabı gelmeden gönderilmez; şablonda o cümleyi silin ya
   da "ekibimize sorup size döneceğim" yazın.
3. **Fiyat, tarih, SLA, hukuki taahhüt yazılmaz.** Uzatma ya da ücretli geçiş sözü verilmez.
4. **Kişisel veri:** Yanıtta başka kullanıcının adını/e-postasını yazmayın. E-posta adreslerini
   maskeleyin (`u***@ilkadim…`), ürün de böyle maskeler (QA akış 8).
5. **Bilinen sorun** şablonları (Ş-1, Ş-2, Ş-3) geçicidir. Düzeltme gelince bu dosya güncellenir;
   kullanıcıya "düzeltildi" kapanış mesajı gönderilir (Ş-10).
6. Her talep önce §3'teki forma kaydedilir, sonra yanıtlanır.

## 1. Şablon dizini

| No | Durum | Tür | Kaynak |
| -- | ----- | --- | ------ |
| Ş-1 | Davetle katıldım, "Erişim Reddedildi" görüyorum | **Bilinen sorun** (QA Y-1) | SSS A5 |
| Ş-2 | Davet bağlantısı çalışmıyor | Kısmen bilinen sorun (QA Ö-5) | SSS B4–B6, A3 |
| Ş-3 | Yanlış davet / yanlış üye; üye listesi görünmüyor | **Bilinen sorun** (QA Y-3) | SSS B7 |
| Ş-4 | Koltuk doldu | Kısmen bilinen sorun (QA Ö-1, Ö-6) | SSS B1–B2 |
| Ş-5 | Pilot süresi bitti / düzenleyemiyorum | Doğrulanmış davranış | SSS C3–C5 |
| Ş-6 | Giriş yapamıyorum | Doğrulanmış davranış | SSS A1–A3 |
| Ş-7 | Veri dışa aktarma / hesap silme | Doğrulanmış davranış | SSS D4–D5 |
| Ş-8 | Hata bildirimi (ilk yanıt + bilgi isteme) | Süreç | SSS G1 |
| Ş-9 | Özellik isteği | Süreç | SSS G1, F1 |
| Ş-10 | Kapanış: sorun çözüldü / düzeltme yayında | Süreç | — |
| Ş-11 | Profil kaydım kayboldu | **Bilinen sorun** (QA Y-4) | SSS C3 |

---

## 2. Şablonlar

### Ş-1 · "Erişim Reddedildi" (davetle yeni katılan) — BİLİNEN SORUN

**Tetik:** Davetle katılan Üye/Yazar ilk ekranda "Erişim Reddedildi — … Pipeline Yöneticisi veya daha
yüksek izne ihtiyacınız var" görüyor. → SSS A5

**TR**

> Merhaba [Ad],
>
> Yazdığınız için teşekkürler. Hesabınız çalışıyor ve ekibe katılımınız tamamlandı.
>
> Gördüğünüz ekran bizim bildiğimiz bir sorun: davetle katılan kişiler ilk olarak **Panel**
> ekranına yönlendiriliyor. Panel yalnız yönetici rollerine açık olduğu için "Erişim Reddedildi"
> yazıyor.
>
> Şimdilik şöyle devam edebilirsiniz:
> 1. Sol menüden **Çağrılar**'a tıklayın.
> 2. Oradan **Fırsatlar** ya da **Ortaklar** ekranlarına da geçebilirsiniz.
>
> Düzeltme yayına girince size ayrıca haber vereceğim.
>
> [İMZA]

**EN**

> Hello [Name],
>
> Thank you for writing. Your account works and you have joined the team.
>
> The screen you see is a known issue: people who join by invitation first land on the
> **Dashboard**, which is open only to manager roles, so it says "Access Denied".
>
> For now:
> 1. Click **Calls** in the left menu.
> 2. From there you can also open **Opportunities** or **Partners**.
>
> I will tell you when the fix is live.
>
> [SIGNATURE]

**İç not:** Kayıtta "Bilinen sorun: Y-1" etiketi. Kişi Kurum Sahibi seçilerek davet edildiyse bile
Üye yazılmıştır (QA Ö-2) — rol değişikliği gerekiyorsa Ş-3'teki yükseltme yolunu kullanın.

---

### Ş-2 · Davet bağlantısı çalışmıyor

**Tetik:** "Bağlantı açılmıyor / geçersiz / süresi doldu / başka adrese gönderildi." → SSS B4–B6, A3

Önce kullanıcıdan **ekrandaki mesajın tam metnini** isteyin (ya da ekran görüntüsü). Mesaja göre
tek paragraf seçin:

**TR**

> Merhaba [Ad],
>
> Bildiriminiz için teşekkürler. Ekranda gördüğünüz mesaja göre:
>
> - **"Davetin süresi doldu"** — Davet bağlantıları 7 gün geçerlidir. Sizi davet eden kişiden yeni bir
>   davet göndermesini isteyin. Yeni bağlantı gelince eskisi çalışmaz; en son geleni kullanın.
> - **"Bu davet zaten kullanıldı"** — Bağlantı bir kez kullanılır ve daha önce kabul edilmiş. Siz
>   kabul ettiyseniz doğrudan giriş yapabilirsiniz. Siz kabul etmediyseniz bize yazın.
> - **"Bu davet başka bir e-posta adresine gönderildi"** — Davet, giriş yaptığınız Google
>   hesabından farklı bir adrese gönderilmiş. Ekrandaki **"Çıkış yap ve hesap değiştir"** düğmesine
>   basın ve davetin geldiği adresin Google hesabıyla girin.
> - **"Davet bağlantısı geçersiz"** — Bağlantı eksik kopyalanmış olabilir. E-postadaki bağlantıya
>   doğrudan tıklayın. Az önce daveti kabul edip tarayıcıda geri tuşuna bastıysanız katılımınız
>   tamamdır; bağlantıyı yeniden açarsanız çalışma alanına girersiniz.
>
> Sorun sürerse ekranın görüntüsünü gönderin, birlikte bakalım.
>
> [İMZA]

**EN**

> Hello [Name],
>
> Thank you for letting us know. Based on the message on your screen:
>
> - **"The invitation has expired"** — Invitation links are valid for 7 days. Ask the person who
>   invited you to send a new one. The old link stops working; use the newest one.
> - **"This invitation was already used"** — A link works once and it was accepted before. If
>   you accepted it, just sign in. If you did not, write to us.
> - **"This invitation was sent to a different e-mail address"** — The invitation went to a different
>   address than your Google account. Click **"Sign out and switch account"** and sign in with the
>   Google account of the invited address.
> - **"The invitation link is not valid"** — The link may be cut, or it is an old one: if the invitation was sent again, only the newest link works. Click the link in the e-mail directly. If you
>   just accepted and pressed Back, you have joined; open the link again to go in.
>
> If it still does not work, send a screenshot and we will look at it together.
>
> [SIGNATURE]

**İç not:** Davet e-postası hiç gelmediyse: canlı SMTP kurulumu doğrulanmadı (SSS E8, P-8). Kurum
sahibinden bağlantıyı davet ekranından kopyalayıp iletmesini isteyin. Kurum e-postası Google hesabı
değilse **[DOĞRULANMADI]** — patrona yükseltin (P-1).

---

### Ş-3 · Yanlış davet / yanlış kişi katıldı / üye listesi yok — BİLİNEN SORUN

**Tetik:** "Yanlış adrese davet gittim", "yanlış kişi katıldı", "Üyeler sayfasında kimse görünmüyor",
"rolü değiştirmek istiyorum". → SSS B7

**TR**

> Merhaba [Ad],
>
> Yazdığınız için teşekkürler. Bu, bildiğimiz bir eksik: bugün üründe davet iptali, üye çıkarma ve
> üye listesi henüz yok.
>
> - **Yanlış adrese giden davet** 7 gün sonra kendiliğinden geçersiz olur. O süre boyunca bir koltuk
>   tutar.
> - **Yanlış katılan kişi** ya da **rol değişikliği** için talebinizi ekibimize ilettim. [DOĞRULANMADI:
>   ne zaman yapılacağı — patron cevabından sonra süre yazın ya da bu cümleyi silin.]
>
> Talep numaranız: [TALEP-NO]. İşlem yapılınca size yazacağım.
>
> [İMZA]

**EN**

> Hello [Name],
>
> Thank you for writing. This is a known gap: today the product cannot cancel an invitation, remove a
> member or list members.
>
> - **An invitation to a wrong address** expires by itself after 7 days. Until then it uses one seat.
> - For **a wrong member** or **a role change**, I have passed your request to our team.
>
> Your request number: [REQUEST-NO]. I will write to you when it is done.
>
> [SIGNATURE]

**Yükseltme notu (platform ekibine):** kiracı adı · istenen işlem (üye çıkar / rol değiştir / davet
sil) · hedef kişinin **maskeli** e-postası · talep eden kişinin rolü (yalnız Kurum Sahibi/Kiracı
Yöneticisi talebi işlenir; SSS B3) · QA Y-3.

---

### Ş-4 · Koltuk doldu

**Tetik:** "Planınızın koltuk sınırına ulaşıldı" hatası. → SSS B1–B2

**TR**

> Merhaba [Ad],
>
> Pilotta 6 koltuk var ve bu sayıya henüz kabul edilmemiş davetler de dahil. Hata mesajındaki "X üye,
> Y bekleyen davet" bilgisi bu yüzden 6'ya ulaşıyor.
>
> Mesajın sonundaki "koltuk ekleyin ya da planınızı yükseltin" cümlesini dikkate almayın: pilotta
> satın alma ve plan yükseltme kapalı. Faturalama sayfasındaki koltuk sayısı bekleyen davetleri
> saymadığı için farklı görünebilir; doğru sayı hata mesajındakidir.
>
> Yapabilecekleriniz:
> - Kabul edilmemiş bir davet yanlışsa, 7 gün sonra kendiliğinden düşer ve koltuk boşalır.
> - Koltuğu hemen boşaltmak gerekiyorsa bize hangi davetin iptal edilmesini istediğinizi yazın;
>   ekibimize iletirim (Ş-3).
>
> [İMZA]

**EN**

> Hello [Name],
>
> The pilot has 6 seats, and invitations that are not yet accepted count too. That is why "X members,
> Y pending invitations" reaches 6.
>
> Please ignore "add seats or upgrade your plan": buying and upgrading are closed in the pilot. The
> billing page does not count pending invitations, so its number can differ; the error message shows
> the correct count.
>
> What you can do:
> - A wrong pending invitation expires after 7 days and frees the seat.
> - If you need the seat now, tell us which invitation to cancel and I will pass it to our team.
>
> [SIGNATURE]

**İç not:** Kiracıda 6'dan fazla koltuk görürseniz (üye + bekleyen > 6) bu QA Y-2'dir (eşzamanlı
davetle sınır aşımı). Kullanıcıya bir şey söylemeyin, kayda "Y-2 şüphesi" yazıp ekibe yükseltin.

---

### Ş-5 · Pilot süresi bitti / düzenleyemiyorum

**Tetik:** Turuncu bant "Pilot süresi doldu", "kaydedemiyorum", "yeni üye ekleyemiyorum". → SSS C3–C5

**TR**

> Merhaba [Ad],
>
> Pilotun 90 günlük süresi [son gün] tarihinde doldu. Bu yüzden çalışma alanınız şu anda
> **salt-okunur**:
>
> - **Verileriniz silinmedi.** Bütün kayıtlarınızı görmeye devam edebilirsiniz.
> - Yeni kayıt, düzenleme ve yeni üye ekleme kapalı.
> - Verilerinizi kendi hesabınız için **Ayarlar → Gizlilik ve Verilerim** ekranından JSON olarak
>   indirebilirsiniz.
>
> Süreyi uzatma kararını yalnız platform yöneticisi verir. Talebinizi ilgili ekibe ilettim; size
> dönüş yapılacak.
>
> [İMZA]

**EN**

> Hello [Name],
>
> The 90-day pilot ended on [last day]. Your workspace is now **read-only**:
>
> - **Your data is not deleted.** You can still see all your records.
> - Adding, editing and inviting new members are closed.
> - You can download your own data as JSON in **Settings → Privacy & My Data**.
>
> Only the platform admin can extend the pilot. I have passed your request to the team; they will
> get back to you.
>
> [SIGNATURE]

**Yasak:** "Uzatacağız", "şu tarihe kadar açılır", fiyat. Uzatma koşulu **[DOĞRULANMADI]** (P-3).
**Yükseltme:** patron — kiracı, son gün, talep eden, talep gerekçesi.

---

### Ş-6 · Giriş yapamıyorum

**Tetik:** "Şifre soruyor mu?", "Microsoft ile giremiyorum", "Google hata veriyor". → SSS A1–A3

Önce sorun: hangi ekranda, hangi mesaj, hangi hesapla (Google adresi maskelenerek kayda yazılır).

**TR**

> Merhaba [Ad],
>
> FonBridge'e yalnız **Google hesabıyla** girilir. Giriş ekranında "Google ile Devam Et" düğmesine
> basın. Şifre ya da e-posta bağlantısıyla giriş yok; Microsoft ile giriş de kaldırıldı.
>
> Lütfen şunları kontrol edin:
> 1. Davet hangi adrese geldiyse, o adresin Google hesabıyla giriyor musunuz?
> 2. Tarayıcıda başka bir Google hesabı açık mı? Açıksa hesap seçim ekranında doğru hesabı seçin.
>
> Hâlâ giremiyorsanız ekranda gördüğünüz mesajın görüntüsünü gönderin.
>
> [İMZA]

**EN**

> Hello [Name],
>
> You can sign in to FonBridge only with a **Google account**. Click "Continue with Google". There is
> no password or e-mail link sign-in, and Microsoft sign-in was removed.
>
> Please check:
> 1. Do you use the Google account of the address the invitation was sent to?
> 2. Is another Google account open in your browser? If so, pick the right one on the account screen.
>
> If you still cannot sign in, send a screenshot of the message you see.
>
> [SIGNATURE]

**Öncelik:** Giriş yapılamıyorsa ve geçici çözüm yoksa **P0** (BETA_GUIDE §5 tanımı; hedef süre
pilot için **[DOĞRULANMADI]**, P-10). Kurum e-postası Google değilse → P-1, patrona yükselt.

---

### Ş-7 · Veri dışa aktarma / hesap silme

**Tetik:** "Verilerimi istiyorum", "hesabımı silin", KVKK talebi. → SSS D4–D5

**TR**

> Merhaba [Ad],
>
> Bu işlemleri doğrudan üründen yapabilirsiniz: **Ayarlar → Gizlilik ve Verilerim**
> (`/tr/default/ayarlar/gizlilik`).
>
> - **Dışa aktarma:** "Verilerimi İndir" düğmesi size ait kayıtları bir JSON dosyası olarak indirir.
>   Güvenlik için giriş anahtarları dosyaya konmaz.
> - **Silme:** "Hesabı Sil İsteği" düğmesiyle talep verdiğinizde hesabınız hemen erişime kapanır. **30 gün** sonra
>   verileriniz ve yüklediğiniz belgeler kalıcı olarak silinir. 30 gün içinde aynı ekrandan talebi
>   iptal edebilirsiniz.
>
> Kurumunuzun tek Kurum Sahibi sizseniz, silmeden önce bize yazın; kurum sahipsiz kalmasın.
>
> [İMZA]

**EN**

> Hello [Name],
>
> You can do this in the product: **Settings → Privacy & My Data** (`/en/default/settings/privacy`).
>
> - **Export:** "Export My Data" downloads your own records as a JSON file, without sign-in secrets.
> - **Deletion:** after you click "Request Account Deletion", your account is closed at once. After **30 days** your
>   data and uploaded files are deleted for good. You can cancel within 30 days on the same page.
>
> If you are the only Owner of your organisation, write to us before you delete, so the organisation
> is not left without an owner.
>
> [SIGNATURE]

**İç not:** Kurumun **tamamının** verisini isteme ya da kurum hesabını silme → **[DOĞRULANMADI]**
(P-5), patron + hukuk. Resmî KVKK başvurusu (yazılı dilekçe) gelirse şablonla cevap verilmez; hukuka
yükseltilir (`docs/legal/`). "Model eğitimi" sorusu gelirse → SSS D3, taahhüt verilmez.

---

### Ş-8 · Hata bildirimi — ilk yanıt ve bilgi isteme

**Tetik:** Kullanıcı bir hata bildirdi (Geri bildirim formu ya da e-posta). → SSS G1

**TR**

> Merhaba [Ad],
>
> Bildiriminiz için teşekkürler, kaydını açtım: [TALEP-NO].
>
> Sorunu bizde de tekrar oluşturabilmemiz için şunları yazar mısınız? (Zaten yazdıysanız bu kısmı
> geçin.)
> 1. Hangi sayfadaydınız? (adres çubuğundaki adres)
> 2. Ne yapmaya çalıştınız? Adım adım.
> 3. Ne bekliyordunuz, ne oldu?
> 4. Ekranda bir hata mesajı çıktı mı? Tam metni.
> 5. Bir kez mi oldu, her seferinde mi?
>
> Ekran görüntüsü eklerseniz, içinde kişisel veri varsa önce üzerini kapatın.
>
> Bir sonraki adımı size yazacağım.
>
> [İMZA]

**EN**

> Hello [Name],
>
> Thank you for the report. I have opened a record: [REQUEST-NO].
>
> So that we can reproduce it, please tell us (skip what you already wrote):
> 1. Which page were you on? (the address in the address bar)
> 2. What did you try to do? Step by step.
> 3. What did you expect, and what happened?
> 4. Did an error message show? The full text.
> 5. Did it happen once or every time?
>
> If you add a screenshot, hide any personal data first.
>
> I will write to you with the next step.
>
> [SIGNATURE]

**İç not:** Göndermeden önce §4'teki bilinen sorunlar listesine bakın; eşleşirse ilgili bilinen sorun
şablonunu kullanın. Veri kaybı, giriş yapılamaması ya da başka kurumun verisini görme şüphesi → P0,
hemen yükselt.

---

### Ş-9 · Özellik isteği

**Tetik:** "Şu olsa iyi olurdu", "Outlook takvimi", "şifreyle giriş", "fiyat ne olacak". → SSS G1, E7, F1

**TR**

> Merhaba [Ad],
>
> Öneriniz için teşekkürler. Kaydını açtım ([TALEP-NO]) ve ürün ekibine ilettim. Pilot boyunca gelen
> istekler haftalık görüşmede birlikte önceliklendiriliyor.
>
> Şu an için söz veremediğim için bir tarih yazmıyorum; karar çıkınca size haber vereceğim.
>
> [İMZA]

**EN**

> Hello [Name],
>
> Thank you for the idea. I have recorded it ([REQUEST-NO]) and passed it to the product team.
> Requests in the pilot are prioritised together in the weekly call.
>
> I cannot promise a date yet; I will tell you when there is a decision.
>
> [SIGNATURE]

**Hazır ek cümleler (duruma göre ekleyin, kaynaklı):**
- Outlook takvimi: "Takvim desteği bugün Google Takvim ve .ics dosyası ile sınırlı; .ics dosyasını
  Outlook'a elle içe aktarabilirsiniz." (SSS E7)
- Şifre / Microsoft ile giriş: "Giriş yöntemi bilinçli olarak yalnız Google'dır." (SSS A1–A2)
- Fiyat: "Pilot sonrası teklif ekibimiz tarafından ayrıca iletilecek." — tutar yazılmaz (SSS F1).
- Kapalı modül (M7, M9, M10, M11): "Bu modül pilot paketinde yok." (SSS E1)

---

### Ş-10 · Kapanış

**TR**

> Merhaba [Ad],
>
> [TALEP-NO] numaralı talebiniz için dönüyorum: [ne yapıldı — tek cümle].
>
> Kontrol etmek için: [kullanıcının deneyeceği tek adım].
>
> Sorun devam ederse bu e-postaya yanıt vermeniz yeterli; talebi yeniden açarım.
>
> [İMZA]

**EN**

> Hello [Name],
>
> About your request [REQUEST-NO]: [what was done — one sentence].
>
> To check: [one step the user can try].
>
> If the problem continues, just reply to this e-mail and I will reopen the request.
>
> [SIGNATURE]

---

### Ş-11 · "Kurumsal Profil"e yazdığım kayboldu — BİLİNEN SORUN

**Tetik:** Profil ekranında "başarıyla güncellendi" dendi, yenileyince eski metin geri geldi. → SSS C3

**TR**

> Merhaba [Ad],
>
> Bildiriminiz için teşekkürler, haklısınız. Bu bildiğimiz bir sorun: **Kurumsal Profil** ekranı
> şu anda kaydetmiyor, ama yanlışlıkla "başarıyla güncellendi" mesajı gösteriyor.
>
> Yazdığınız metni kaybetmemek için şimdilik bir belgede saklayın. Düzeltme gelince size haber
> vereceğim ve metni o zaman ekleyebilirsiniz.
>
> Kusura bakmayın.
>
> [İMZA]

**EN**

> Hello [Name],
>
> Thank you, you are right. This is a known issue: the **Company Profile** page does not save yet,
> but it shows "updated successfully" by mistake.
>
> To keep your text, please save it in a document for now. I will tell you when the fix is live.
>
> Sorry for the trouble.
>
> [SIGNATURE]

---

## 3. Destek talebi kayıt formu — alan önerisi

Amaç: her talep tekrar üretilebilir olsun, önceliği tutarlı atansın, kişisel veri gereğinden fazla
tutulmasın. Uygulama içi "Geri bildirim" formu bugün **konu, etki, başlık, ne oldu, ekran görüntüsü**
alanlarını ve sayfa adresi + tarayıcı bilgisini zaten topluyor (`docs/BETA_GUIDE.md:155-171`,
`src/app/api/feedback/route.ts`). Aşağıdaki liste **destek ekibinin iç kaydı** içindir; ürün formunu
değiştirme önerisi değildir (kod değişikliği bu kartın kapsamı dışında).

| # | Alan | Tür | Zorunlu | Kim doldurur | Not |
| - | ---- | --- | ------- | ------------ | --- |
| 1 | Talep no | otomatik | ✔ | sistem | Şablonlardaki `[TALEP-NO]` |
| 2 | Geliş kanalı | seçim: uygulama içi form / e-posta / haftalık görüşme / telefon | ✔ | destek | Telefon hattı yok (SSS G2); görüşmede sözlü gelenler de kaydedilir |
| 3 | Kiracı (kurum) | seçim | ✔ | destek | Ör. İlkadım Belediyesi |
| 4 | Talep edenin rolü | seçim: Kurum Sahibi / Kiracı Yöneticisi / Pipeline Yöneticisi / Yazar / Üye | ✔ | destek | Ş-3 işlemleri yalnız Sahip/Yönetici talebiyle |
| 5 | Talep edenin iletişimi | e-posta | ✔ | destek | Kayıtta **maskeli** gösterilir; tam adres yalnız yanıt için |
| 6 | Konu | seçim: Giriş · Davet/koltuk · Pilot süresi · Veri/gizlilik · Modül kullanımı · Hata · Özellik isteği · Diğer | ✔ | destek | Uygulama formundaki konu listesiyle eşlenir |
| 7 | Etki | seçim: Çalışamıyorum · Ciddi engel · İdare ediyorum · Fikrim var | ✔ | kullanıcı | Uygulama formuyla aynı ölçek (`BETA_GUIDE.md:161`) |
| 8 | Etkilenen kişi sayısı | sayı (1–6) | ✔ | destek | Triyaj: önem × etki × kaç kullanıcı |
| 9 | Öncelik | seçim: P0 / P1 / P2 / P3 | ✔ | destek | Tanımlar `BETA_GUIDE.md:178-183`; **hedef süreler pilot için doğrulanmadı** (P-10) |
| 10 | Sayfa adresi | URL | — | sistem/kullanıcı | Uygulama formu kendiliğinden ekler |
| 11 | Tekrar üretim adımları | metin | hata ise ✔ | destek | Ş-8'deki 5 soru |
| 12 | Beklenen / gözlenen | metin | hata ise ✔ | destek | |
| 13 | Ekrandaki hata mesajı | metin | — | kullanıcı | Tam metin; kod ya da iz kullanıcıdan istenmez |
| 14 | Ek (ekran görüntüsü) | dosya | — | kullanıcı | PNG/JPEG/WebP ≤ 2 MB; kişisel veri kapatılmış olmalı |
| 15 | Bilinen sorun eşleşmesi | seçim: yok / Y-1 / Y-2 / Y-3 / Y-4 / Ö-1…Ö-11 | ✔ | destek | §4 listesi; tekrar sayısı buradan çıkar |
| 16 | Kullanılan şablon | seçim: Ş-1…Ş-11 / serbest | ✔ | destek | Hangi yanıtın işe yaradığını ölçmek için |
| 17 | Yükseltme | seçim: yok / platform ekibi / ürün (be/fe) / patron / hukuk | ✔ | destek | + yükseltme notu (bağlam tam) |
| 18 | Durum | seçim: yeni / kullanıcıdan bilgi bekleniyor / ekipte / çözüldü / kapandı | ✔ | destek | "Bekleyen kullanıcıyı sessiz bırakma" kuralı için |
| 19 | İlk yanıt zamanı | tarih-saat | ✔ | sistem | Yanıt süresi takibi |
| 20 | Kapanış zamanı + kapanış mesajı gönderildi mi | tarih-saat + evet/hayır | kapanışta ✔ | destek | Ş-10 |
| 21 | Memnuniyet (isteğe bağlı) | 1–5 | — | kullanıcı | Kapanış e-postasında tek soru |

**Kişisel veri kuralı:** Kayda yalnız çözüm için gereken veri girilir. Konsept not metni, vatandaş
verisi (pilotta zaten yüklenmez, SSS D6) ya da başka kullanıcının bilgisi kayda kopyalanmaz. Ekran
görüntüsü talep kapanınca silinebilecek biçimde tutulur. **[DOĞRULANMADI — patrona sor]** Destek
kayıtlarının saklama süresi ve nerede tutulacağı (işleme envanterine eklenmesi gerekebilir:
`docs/legal/processing-register.md`).

---

## 4. Bilinen sorunlar — destek özeti

Kaynak: `docs/agent-results/TASK-MUOLBPFFDC92B-qae-fb.md` (QA, `dev` @ `6168360b`). Düzeltildikçe bu
tablo güncellenir.

| QA no | Kullanıcının göreceği | Geçici yanıt | Şablon |
| ----- | --------------------- | ------------ | ------ |
| Y-1 | Davetle katılınca "Erişim Reddedildi" | Sol menüden Çağrılar | Ş-1 |
| Y-2 | (kullanıcı görmez) koltuk sayısı 6'yı aşabilir | Ekibe yükselt, kullanıcıya söyleme | Ş-4 iç not |
| Y-3 | Üye listesi yok, davet iptali/üye çıkarma yok | 7 gün bekle ya da ekibe yükselt | Ş-3 |
| Y-4 | Profil "kaydedildi" diyor, kaydetmiyor | Metni ayrıca sakla | Ş-11 |
| Ö-1 | Koltuk hatası "planı yükseltin" diyor; EN'de Türkçe | Yükseltme cümlesini yok say | Ş-4 |
| Ö-2 | "Kurum Sahibi" seçilen kişi Üye oluyor | Bu rolü seçme; rol değişikliği için yükselt | Ş-1, Ş-3 |
| Ö-3 | Modül çift tıklamada sayaç yanlış | Sayfayı yenile | SSS E2 |
| Ö-4 | Karnede geri/yenile cevapları siler | Tek oturuşta doldur | SSS E4 |
| Ö-5 | Kabul sonrası geri tuşu "geçersiz" der | Katılım tamam; bağlantıyı yeniden aç | Ş-2 |
| Ö-6 | Faturalama koltukları farklı; plan adı "PUBLİC-TEAM"; "PİLOT BİTTİ" rozeti yeşil | Hata mesajındaki sayı doğrudur | Ş-4 |
| Ö-7 | (yönetici) süresi dolmuşta "Ata" yeni 90 gün başlatır | Yalnız platform yöneticisini ilgilendirir | — |
| Ö-8 | Bozuk ajans kodu hemen uyarı vermez, Google dönüşünde reddedilir | Kodu yeniden kontrol et | — |
| Ö-9 | "Geri bildirim" düğmesi başka düğmeyi örter | Sayfayı kaydır | SSS E2 |
| Ö-10 | Davet formu yetkisizlere de görünür | Yalnız Sahip/Yönetici davet eder | SSS B3 |
| Ö-11 | Konsept Notları sayfası Türkçe arayüzde İngilizce | Bilinen sorun | SSS A4 |
