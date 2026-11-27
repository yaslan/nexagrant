# İlkadım pilotu — Sık Sorulan Sorular (SSS)

> Sürüm 0.1 · 01.10.2026 · Hazırlayan: CS-FB · Kart: TASK-MUOLBW7PZ7HM4 (FB-GAP-1)
>
> **Durum: TASLAK.** Pilot kullanıcılarına gönderilmedi. Patron onayından önce paylaşılmaz.
> Kod tabanı: FONBRIDGE `dev` @ `6168360b`.
>
> **Okuma kuralı (destek ekibi için):** Her cevabın altında `Kaynak:` satırı var. Kaynağı olmayan bir
> şey yazılmadı. **[DOĞRULANMADI — patrona sor]** yazan cevap kullanıcıya bu hâliyle gönderilmez;
> önce patrondan cevap alınır. **[BİLİNEN SORUN]** yazan madde bugün üründe gerçekten yaşanan bir
> hatadır; geçici çözümü yazılıdır (QA raporu: `docs/agent-results/TASK-MUOLBPFFDC92B-qae-fb.md`).
>
> İngilizce karşılık her sorunun altında **EN** satırındadır.

**Bu belgede fiyat yok.** Pilot ücretsizdir. Pilot sonrası fiyat soruları için §F'ye bakın.

---

## A. Hesap ve giriş

### A1. Nasıl giriş yaparım?

**Google hesabınızla.** Giriş ekranında tek düğme var: "Google ile Devam Et". Şifre ile ya da
e-posta bağlantısıyla giriş yoktur.

- Kaynak: `docs/adr/ADR-0006-oauth-only-sign-in.md:10` ve `:25` (yalnız Google),
  `src/app/[locale]/login/AuthCard.tsx:156-161`, `:568`.

**EN:** Sign in with your Google account. The sign-in page has one button: "Continue with Google".
There is no password sign-in and no e-mail link.

### A2. Microsoft / Outlook hesabımla ya da kurum SSO'su ile girebilir miyim?

**Hayır.** Microsoft ile giriş 29.09.2026'da kaldırıldı. Kurumsal SSO/SAML da kaldırıldı. Tek giriş
yolu Google'dır.

- Kaynak: `docs/adr/ADR-0006-oauth-only-sign-in.md:23-32`, `docs/ROADMAP.md:43-50`.

**EN:** No. Microsoft sign-in was removed on 29 Sep 2026. Company SSO/SAML was removed too. Google is
the only way to sign in.

### A3. Kurum e-postam Google değil (ör. `@ilkadim.bel.tr`). Ne yapmalıyım?

Davet hangi e-posta adresine gönderildiyse, o adresle açılmış bir **Google hesabıyla** girmeniz
gerekir. Başka bir Google hesabıyla açarsanız ekran "Davet başka bir adrese gönderildi" der ve
katılmanıza izin vermez.

- Kaynak: QA raporu akış 8 (yanlış e-posta: "başka bir adrese gönderildi", kabul düğmesi yok,
  "Çıkış yap ve hesap değiştir" var); `docs/kamu/VERI-YERLESIMI.md` ("Google ile giriş tek giriş
  yoludur, kapatılamaz").
- Kurum adresiyle Google hesabı açarken Google, o adrese bir **doğrulama e-postası** (kod ya da
  bağlantı) gönderir. Onaylayın, sonra davetteki adresle giriş yapın. Hesap açılamıyorsa destekle
  konuşun. **[DOĞRULANMADI]** Google'ın ekran adımları canlı denenmedi.
- **[DOĞRULANMADI — patrona sor]** Belediyeye hangi yol önerilir? Pilot planında açık soru: "Pilotta kullanılacak kullanıcı hesapları kurum
  e-postasıyla mı açılacak?" (`docs/kamu/ILKADIM-PILOT.md:171`, S5).

**EN:** You must sign in with a Google account that uses the e-mail address the invitation was sent
to. With a different Google account the page says the invitation was sent to another address, and
you cannot join. When you create a Google account with your work address, Google sends a verification e-mail to that address. Confirm it, then sign in with the invited address. If you cannot create the account, contact support. *Google's screens were not tested live.*

### A4. Arayüz İngilizce olabilir mi?

Evet. Arayüz Türkçe ve İngilizcedir. Türkçe sayfalar `/tr/...`, İngilizce sayfalar `/en/...`
adresindedir.

- Kaynak: `src/lib/routes.ts:110-127` (her ekranın `tr` ve `en` yolu var).
- **[BİLİNEN SORUN]** Bazı ekranlar Türkçe arayüzde İngilizce görünüyor (Konsept Notları sayfası).
  Bazı hata mesajları da İngilizce arayüzde Türkçe çıkıyor (ör. koltuk sınırı). QA Ö-1, Ö-11.

**EN:** Yes. The interface is in Turkish and English (`/tr/...` and `/en/...`). Known issue: some
pages and error messages still show the other language (QA Ö-1, Ö-11).

### A5. Giriş yaptım ama "Erişim Reddedildi" yazıyor. Hesabım mı bozuk?

**[BİLİNEN SORUN — QA Y-1]** Hayır, hesabınız çalışıyor. Davetle katılan **Üye** ve **Yazar**
rolündeki kişiler ilk olarak **Panel** ekranına yönlendiriliyor. Panel yalnız Pipeline Yöneticisi ve
üstü rollere açık. Bu yüzden ekran "Erişim Reddedildi" diyor.

**Geçici çözüm:** Sol menüden **Çağrılar**, **Fırsatlar** ya da **Ortaklar**'a tıklayın. Sol menü bu
ekranda da görünür.

- Kaynak: `src/app/[locale]/accept-invite/continue/actions.ts:33-34` (kabul sonrası hedef
  `/default/dashboard`), `src/app/[locale]/(app)/[workspace]/dashboard/page.tsx:65` (Panel
  `evaluate_gates` ister), `src/lib/rbac.ts` (MEMBER ve WRITER'da `evaluate_gates` yok),
  `src/app/[locale]/(app)/layout.tsx:121` (sol menü her uygulama sayfasında),
  `src/components/SidebarNav.tsx` (menü öğeleri).
- Kalıcı düzeltme: ürün kararı bekliyor (QA raporu §6 soru 1).

**EN:** Known issue (QA Y-1). Your account works. Members and Writers land on the Dashboard, which
needs Pipeline Manager or higher, so it says "Access Denied". Workaround: use the left menu (Calls,
Opportunities, Partners).

---

## B. Davet ve koltuk

### B1. Ekibime kaç kişi katılabilir?

**6 koltuk.** Bu sayıya kurum sahibi dahildir.

- Kaynak: `docs/adr/ADR-0007-ilkadim-free-pilot.md:16`, `src/lib/billing/pilot.ts:44-45`.

**EN:** 6 seats, including the workspace owner.

### B2. Bekleyen davetler koltuk sayılır mı?

**Evet.** Koltuk sınırı = üyeler + henüz kabul edilmemiş davetler. 6 koltuk dolunca yeni davet
reddedilir ve ekranda "Planınızın koltuk sınırına ulaşıldı (6 koltuk: X üye, Y bekleyen davet)"
yazar.

- Kaynak: `src/app/api/invitations/route.ts:174-184`; QA raporu akış 3.
- **[BİLİNEN SORUN — QA Ö-1]** Mesajın sonunda "koltuk ekleyin ya da planınızı yükseltin" yazıyor.
  Pilotta satın alma ve plan yükseltme kapalıdır; bu cümleyi dikkate almayın.
- **[BİLİNEN SORUN — QA Ö-6]** Faturalama sayfası bekleyen davetleri saymıyor (ör. "3 / 6"
  gösterir). Doğru sayı davet ekranındaki hata mesajındadır.

**EN:** Yes. The limit counts members plus invitations not yet accepted. Ignore the "add seats or
upgrade" text: buying is closed in the pilot (known issue Ö-1). The billing page does not count
pending invitations (known issue Ö-6).

### B3. Kim davet gönderebilir?

Yalnız **Kurum Sahibi** ve **Kiracı Yöneticisi**. Diğer roller gönderirse sunucu reddeder: "Bu işlem
için yetkiniz yok."

- Kaynak: `src/app/api/invitations/route.ts:43-57`.
- **[BİLİNEN SORUN — QA Ö-10]** Davet formu yetkisi olmayan kişiye de açık görünür. Ret ancak
  gönderince gelir.

**EN:** Only the Owner and the Tenant Admin. Other roles get "not authorised" from the server. Known
issue Ö-10: the form still shows for them.

### B4. Davet bağlantısı ne kadar geçerli?

**7 gün.** Süresi dolan bağlantı "Davetin süresi doldu" der. Davet eden kişiden yeni davet isteyin.

- Kaynak: `src/app/api/invitations/route.ts:75`, `messages/tr.json:428-429`; QA akış 9.

**EN:** 7 days. An expired link says "The invitation has expired". Ask the inviter for a new one.

### B5. Bağlantı "zaten kullanıldı" ya da "geçersiz" diyor.

- "Bu davet zaten kullanıldı": bağlantı daha önce kabul edildi. Bir kez kullanılır (QA akış 7).
- "Davet bağlantısı geçersiz": bağlantı eksik kopyalandı ya da bozuldu (QA akış 10).
- Az önce kabul ettiyseniz ve tarayıcıda **geri** tuşuna bastıysanız da "geçersiz" görebilirsiniz.
  **[BİLİNEN SORUN — QA Ö-5]** Bu durumda katılımınız tamamdır; aynı bağlantıyı yeniden açarsanız
  panele yönlendirilirsiniz.

**EN:** "Already used": the link was accepted before; it works once. "Invalid": the link is broken or
cut. After you accept, the Back button can show "invalid" (known issue Ö-5); you have joined, open
the link again to go in.

### B6. Aynı kişiyi yeniden davet edersem ne olur?

Yeni koltuk tutmaz. Yeni bir bağlantı üretilir; **eski bağlantı çalışmaz**. Kişiye en son gelen
bağlantıyı kullanmasını söyleyin.

- Kaynak: QA akış 12; `src/app/api/invitations/route.ts:148` (yeni token ile güncelleme).

**EN:** It does not use a new seat. A new link is made and the old link stops working.

### B7. Yanlış adrese davet gönderdim / yanlış kişi katıldı. Nasıl geri alırım?

Bunu **Ekip Üyeleri** sayfasından kendiniz yapabilirsiniz. Sayfayı yalnız **Kurum Sahibi** ve
**Kurum Yöneticisi** görür ve kullanır.

**Sayfaya gitmek için:** sağ üstte adınıza tıklayın → **Abonelik & Krediler** → koltuk kutusundaki
**Ekip üyelerini yönet →** bağlantısı. Doğrudan adres: `/tr/<çalışma-alanınız>/ayarlar/uyeler`.
(Sol menüdeki "Ayarlar" bu sayfaya götürmez.)

- **Yanlış adrese giden davet:** "Bekleyen Davetler" listesinde o adresin yanındaki **İptal** →
  **Evet, iptal et**. Davet bağlantısı hemen çalışmaz olur ve koltuk boşalır. İptal etmezseniz davet
  7 gün sonra kendiliğinden geçersiz olur; o süre boyunca 1 koltuk tutar.
- **Yanlış katılan kişi:** "Aktif Ekip Üyeleri" listesinde o kişinin yanındaki **Çıkar** → **Evet,
  çıkar**. Kişi kurumunuza erişimini kaybeder ve koltuk boşalır. Kişi o sayfayı açık tutuyorsa bir
  sonraki işleminde erişimi kesilir.

Kurallar:

- Kendinizi çıkaramazsınız ("Kendinizi ekipten çıkaramazsınız.").
- Kurum Sahibi'ni yalnız başka bir Kurum Sahibi çıkarabilir. Kurum Yöneticisi bir sahibi çıkaramaz.
- Kurumun son sahibi çıkarılamaz ("Kurumun son sahibi çıkarılamaz.").
- Pilot süresi bittiyse çıkarma ve iptal yapılamaz (liste görünür). Bu durumda
  **info@nexagrant.com** adresine yazın.

**Yanlış kişi kurumunuzdaki bilgileri görmüş olabilir.** Kişiyi çıkardıktan sonra da
**info@nexagrant.com** adresine yazın: kurum adınızı, ne zaman fark ettiğinizi ve kişinin ne kadar
süre erişimi olduğunu ekleyin. Bunu acil sayarız (ilk yanıt hedefi: iş saatleri içinde 2 saat, bkz.
G3). Bu bir hedeftir, taahhüt değildir. Ekranı açamıyorsanız da aynı adrese yazın; talep Kurum Sahibi
ya da Kurum Yöneticisi'nden gelmelidir ve kimliğinizi doğrularız.

- Rol değiştirme ekranda yoktur; rol değişikliği için info@nexagrant.com adresine yazın.
- Kaynak: QA Y-3 ekranı (kart TASK-MUPUHBAE811KP, inceleme ONAY:
  `docs/agent-results/TASK-MUPUHBAE811KP-crw2-fb.md`); `src/app/api/team/members/[id]/route.ts`
  (kendini çıkarma, sahip ve son sahip kuralları), `src/lib/team/access.ts` (yalnız Sahip/Yönetici),
  `settings/members/team-list.tsx` (buton ve onay metinleri); patron kararı K-4 (01.10.2026).

**EN:** You can do this yourself on the **Team Members** page. Only the **Owner** and the **Tenant
Admin** can see and use it. To open it: click your name at the top right → **Subscription &
Credits** → **Manage team members →** in the seats box. Direct address:
`/en/<your-workspace>/settings/members`. ("Settings" in the left menu does not go to this page.)

- **Invitation to a wrong address:** in "Pending Invitations", click **Cancel** next to the address,
  then **Yes, cancel**. The link stops working at once and the seat becomes free. If you do not
  cancel it, it expires by itself after 7 days; until then it uses 1 seat.
- **A wrong person joined:** in "Active Members", click **Remove** next to the person, then **Yes,
  remove**. The person loses access to your organisation and the seat becomes free. If the person
  has the app open, access stops at their next action.

Rules: you cannot remove yourself. Only another Owner can remove an Owner; a Tenant Admin cannot.
The last Owner cannot be removed. When the pilot has ended, you can see the list but you cannot
remove or cancel; write to info@nexagrant.com.

**The wrong person may have seen your organisation's data.** After you remove the person, also write
to info@nexagrant.com: add your organisation name, when you noticed, and how long the person had
access. We treat it as urgent (first-response target: 2 hours within business hours, see G3). This
is a target, not a guarantee. If you cannot open the page, write to the same address; the request
must come from the Owner or a Tenant Admin, and we verify who you are. To change a role, write to
info@nexagrant.com; the page cannot change roles.

### B8. Davet ederken hangi rolü seçmeliyim?

Pilot planındaki öneri: Kurum Sahibi 1 kişi (AB birimi), diğer 5 kişi Üye. Kurum sahibi davetle
atanamaz; kaydı açan kişi kurum sahibidir.

- Kaynak: `docs/kamu/ILKADIM-PILOT.md:35-42`, `:55`; `src/app/api/invitations/route.ts:68-70`
  (TENANT_OWNER davet edilemez, MEMBER'a düşer).
- **[BİLİNEN SORUN — QA Ö-2]** Rol listesinde "Kurum Sahibi" seçeneği görünüyor ama sunucu bu kişiyi
  sessizce **Üye** yapar. Bu seçeneği kullanmayın.
- Not: Panel (KPI) ekranını yalnız Pipeline Yöneticisi ve üstü görür (`BETA_GUIDE.md` Ek A;
  `dashboard/page.tsx:65`).

**EN:** Suggested: one Owner (EU unit), five Members. The Owner cannot be invited. Known issue Ö-2:
"Owner" appears in the role list but the server saves "Member"; do not pick it.

---

## C. Pilot süresi ve süre bitince

### C1. Pilot ne kadar sürer, ücreti var mı?

**90 gün, ücretsiz.** Pilot süresince ödeme alınmaz ve fatura kesilmez. Sayfanın üstündeki bant
"Belediye Ekip planı {tarih} tarihine kadar (bu gün dahil) açık" der.

- Kaynak: `docs/adr/ADR-0007-ilkadim-free-pilot.md:16-18`, `src/lib/billing/pilot.ts:47-48`,
  `messages/tr.json:2574-2575`.

**EN:** 90 days, free. No payment, no invoice. The banner shows the last day.

### C2. 90 gün nasıl sayılır?

Başlangıç günü 1. gün sayılır. Pilot, 90. günün sonunda (İstanbul saatiyle gece 00:00) biter. Saat
önemli değildir, tarih önemlidir.

- Kaynak: `src/lib/billing/pilot.ts:79-90` (`pilotEndsAt`).

**EN:** The start day is day 1. The pilot ends at midnight (Istanbul time) after day 90.

### C3. Süre bitince ne olur? Verilerim silinir mi?

**Silinmez.** Çalışma alanı **salt-okunur** olur:

- Kayıtlarınızı görmeye devam edersiniz.
- Yeni kayıt ve düzenleme kapanır; sunucu reddeder.
- Sayfanın üstünde turuncu bant çıkar: "Pilot süresi doldu … yeni kayıt ve düzenleme kapalı."
- Yeni üye eklenemez; bekleyen davet de kabul edilemez.
- Kaynak: `docs/adr/ADR-0007-ilkadim-free-pilot.md:20-26`, `src/lib/billing/pilot.ts:136-143`,
  `messages/tr.json:2576-2577`; QA akış 14.
- **[BİLİNEN SORUN — QA Y-4]** "Kurumsal Profil" ekranı süre dolmuşken de "başarıyla güncellendi"
  der. Aslında hiçbir zaman kaydetmez (süre dolmadan da). Bu ekrana yazdığınız metne güvenmeyin.

**EN:** Nothing is deleted. The workspace becomes read-only: you can read, you cannot add or edit.
An amber banner shows. Known issue Y-4: the Company Profile page says "saved" but never saves.

### C4. Süre uzatılabilir mi?

Süreyi yalnız **platform yöneticisi** uzatır; her uzatma 90 gündür. Otomatik uzatma yoktur ve kendi
başınıza uzatamazsınız. Her talep ayrı ayrı değerlendirilir; uzatma sözü verilmez. Talebinizi süre
bitmeden **info@nexagrant.com** adresine yazmanızı öneririz. Süre dolsa bile
verileriniz silinmez; çalışma alanı salt-okunur olur (bkz. C3).

- Kaynak: `docs/adr/ADR-0007-ilkadim-free-pilot.md:25-26`, `messages/tr.json:1726-1727`; patron kararı
  01.10.2026 (K-6): uzatma vaka bazlıdır, yayımlanmış kriter yoktur. Destek şablonu: Ş-5.

**EN:** Only the platform admin can extend the pilot, 90 days at a time. There is no automatic extension
and you cannot extend it yourself. We review each request; we cannot promise an extension. We
recommend writing to info@nexagrant.com before your pilot period ends. If the pilot ends, your
data is not deleted; the workspace becomes read-only (see C3).

### C5. Pilot sırasında ücretli plana geçebilir miyim?

**Hayır.** Pilot sürerken de süre bittikten sonra da satın alma ve plan yükseltme kapalıdır. Ücretli
satış pilot sonrasına kaldı.

- Kaynak: `docs/adr/ADR-0007-ilkadim-free-pilot.md:19`, `:24`; ADR-0007 Sonuçlar (checkout 403
  `PILOT_CHECKOUT_CLOSED`); `docs/kamu/ILKADIM-PILOT.md:57` ("Planı Değiştir" yalnız bilgi
  sayfasına gider).

**EN:** No. Buying and upgrading are closed during and after the pilot. Paid sales come after the
pilot.

---

## D. Veri ve gizlilik

### D1. Verilerim nerede tutuluyor?

Veritabanı ve uygulama sunucusu **Türkiye'de** (Vulut). Yurt dışına giden üç akış var: YZ metin
üretimi (Anthropic, ABD), arama için metin vektörü (OpenAI, ABD) ve Google ile giriş (Google, ABD).
Yüklenen dosyaların deposunun (Cloudflare R2) bölgesi **doğrulanmadı**.

- Kaynak: `docs/kamu/VERI-YERLESIMI.md` "Kısa cevap" 1–3 ve "Yurt dışına giden akışlar".
- Tam cevap için kullanıcıya bu tek sayfalık belge verilir (`docs/kamu/VERI-YERLESIMI.md`,
  TASLAK — paylaşmadan önce patron onayı).

**EN:** The database and app server are in Türkiye (Vulut). Three flows go abroad: AI text (Anthropic,
US), search vectors (OpenAI, US) and Google sign-in (Google, US). The region of the file store
(Cloudflare R2) is not verified.

### D2. YZ'ye veri gitmesini istemiyorum.

YZ kullanan modüller (pilotta M2 konsept not ve M6 değerlendirme) kapalıysa YZ'ye metin gitmez.
Modülleri yalnız Kurum Sahibi açıp kapatır: **Ayarlar → Modüller**.

- Kaynak: `docs/kamu/VERI-YERLESIMI.md` "YZ'siz çalışma"; `docs/kamu/ILKADIM-PILOT.md:50-59`
  (`manage_modules` yalnız TENANT_OWNER).
- Google ile giriş kapatılamaz; tek giriş yoludur.

**EN:** If the AI modules (M2, M6) are off, no text goes to the AI. Only the Owner can turn modules
on or off: Settings → Modules.

### D3. Verilerim YZ modelini eğitmek için kullanılır mı?

Veri işleme sözleşmesi taslağı "müşteri verisi model eğitimi için kullanılmaz" der.

- Kaynak: `docs/legal/dpa-tr.md:44`.
- **[DOĞRULANMADI — patrona sor]** Bu cümle bizim sözleşme taslağımızdadır. Sağlayıcılarla imzalı
  bir ek sözleşme (SCC/DPA) repoda yok (`docs/kamu/VERI-YERLESIMI.md`, envanter §21). Hukuki
  taahhüt gibi sunulmaz.

**EN:** Our draft data processing agreement says customer data is not used to train models. There is
no signed agreement with the providers in the repo: *not verified — ask the owner* before you say it
as a promise.

### D4. Verilerimi nasıl dışa aktarırım?

**Ayarlar → Gizlilik ve Verilerim** ekranında (`/tr/default/ayarlar/gizlilik`) "Verilerimi İndir"
düğmesi var. Size ait kayıtlar bir **JSON** dosyası olarak iner. Güvenlik için giriş anahtarları
(OAuth, oturum jetonları) dosyaya konmaz.

- Kaynak: `messages/tr.json:677`, `:688`, `:694` (ekran ve düğme adları), `src/app/[locale]/(app)/[workspace]/settings/privacy/client.tsx:39-52`,
  `src/app/api/user/export/route.ts`, `src/actions/user/export-data.ts:8-15`,
  `messages/tr.json:745`, `src/lib/routes.ts:126-127`.
- Not: Bu dışa aktarım **kişiseldir** (sizin satırlarınız). Kurumun bütün verisi için ekrandan
  bir düğme yoktur; pilot süresince destek ekibi bunu **elle** yürütür (yazılı talep ile). Ayrıntı:
  `docs/adr/ADR-0010-tenant-export-and-deletion.md` (taslak). Süre ya da sonuç sözü verilmez.
- Not: Bu ekran pilot süresi dolunca da çalışmalı: dışa aktarım yolu pilot kapısını çağırmıyor
  (kod okuması). Süresi dolmuş pilotta canlı denenmedi.

**EN:** Settings → Privacy & My Data (`/en/default/settings/privacy`) → "Export My Data". You get your own records as a
JSON file, without sign-in secrets. Whole-organisation export: there is no button; during the pilot the support team does it by hand on a written request (see `docs/adr/ADR-0010-tenant-export-and-deletion.md`, draft). No time or result is promised.

### D5. Hesabımı nasıl sildiririm?

Aynı ekrandan **"Hesabı Sil İsteği"** düğmesiyle silme talebi verin. Hesabınız hemen erişime kapanır. **30 gün** sonra verileriniz
ve yüklediğiniz belgeler kalıcı olarak silinir. Bu 30 gün içinde talebi iptal edebilirsiniz.

- Kaynak: `src/actions/user/request-deletion.ts:10-20`, `src/app/api/user/request-deletion/route.ts`,
  `messages/tr.json:745`.
- Kurumun **tek** Kurum Sahibi iseniz sistem bunu size bildirir (kurum sahipsiz kalır).
  Kaynak: `src/actions/user/request-deletion.ts:80-100` (`soleOwnerOf`). Önce başka bir sahip
  belirlenmesi için destekle konuşun.
- Kurum (kiracı) hesabının tamamen silinmesi: ekrandan yapılamaz; pilot süresince destek ekibi
  **elle** yürütür, yazılı talep ister. Ayrıntı: `docs/adr/ADR-0010-tenant-export-and-deletion.md`
  (taslak). Süre ya da sonuç sözü verilmez.

**EN:** Request deletion on the same page. Your account is closed at once and deleted after 30 days.
You can cancel within 30 days. If you are the only Owner, the system warns you. Deleting the whole
organisation: not possible from the screen; during the pilot the support team does it by hand on a written request (see `docs/adr/ADR-0010-tenant-export-and-deletion.md`, draft). No time or result is promised.

### D6. Sisteme vatandaş verisi yükleyebilir miyiz?

**Hayır, pilotta vatandaş verisi yüklenmez.** Belediye personelinin adı, e-postası ve yazdığı metin
kişisel veridir ve işlenir; vatandaş verisi pilot kuralı gereği sisteme girmez.

- Kaynak: `docs/kamu/ILKADIM-PILOT.md:156` (R2 önlemi: "pilotta vatandaş verisi **yüklenmez**").

**EN:** No. In the pilot, citizen data is not uploaded. Staff names, e-mails and texts are personal
data and are processed.

### D7. Veri işleme sözleşmesi (DPA) nerede?

Taslak: `docs/legal/dpa-tr.md` (İngilizce: `dpa-en.md`). Pilot planına göre pilot öncesi imzalanır.

- Kaynak: `docs/kamu/ILKADIM-PILOT.md:156`, `docs/BETA_GUIDE.md:223-224`.
- **[DOĞRULANMADI — patrona sor]** İmzalı sürüm, iletişim adresi ve üründeki adresi
  (`/tr/compliance/dpa`) pilot için güncel mi?

**EN:** Draft at `docs/legal/dpa-tr.md` / `dpa-en.md`; signed before the pilot. Signed version: *ask
the owner.*

---

## E. Modüller

### E1. Pilotta hangi modüller açık?

Belediye Ekip paketinin bütün modülleri: **M1** Ortak İstihbaratı, **M2** Konsept Not, **M3** Kanıt
Paketi, **M4** Focal Point (fikir toplama), **M5** Başvuru İş Akışı, **M6** Evaluator Lens
(değerlendirme), **M8** Konsorsiyum Eşleştirme.

M7, M9, M10 ve M11 pilotta kapalıdır; kartlarında "Pilotta kapalı · kurum paketinde açılır" yazar.

- Kaynak: `docs/adr/ADR-0007-ilkadim-free-pilot.md:17`, `:27`; `docs/kamu/ILKADIM-PILOT.md:46-57`;
  `messages/tr.json:673`.

**EN:** All Belediye Ekip modules: M1, M2, M3, M4, M5, M6, M8. M7, M9, M10, M11 are closed in the
pilot.

### E2. Modül sayfasında hiçbir modül aktif değil. Hata mı?

**Hata değil.** Pilot ataması modülleri kendiliğinden açmaz. **Kurum Sahibi** Ayarlar → Modüller
ekranından modülleri tek tek **Etkinleştir**. Önce **M1** açılır; M4 ve M8, M1'e bağlıdır. Bu adım
hafta 1 oturumunda birlikte yapılır.

- Kaynak: `docs/kamu/ILKADIM-PILOT.md:50-59`.
- **[BİLİNEN SORUN — QA Ö-3]** "Etkinleştir"e çift tıklarsanız sayaç yanlış artar (ör. "2 / 11").
  Sayfayı yenileyin; doğru sayı gelir. **QA Ö-9:** geniş ekranda sağ alttaki "Geri bildirim" düğmesi
  bir "Etkinleştir" düğmesini örtebilir; sayfayı biraz kaydırın.

**EN:** Not a bug. The pilot does not turn modules on. The Owner turns each on in Settings → Modules,
M1 first. Known issues: double-click miscounts (reload fixes it, Ö-3); the Feedback button can cover
a button (scroll, Ö-9).

### E3. Ayarlar'a tıklayınca "Erişim Reddedildi" çıkıyor.

Sol menüdeki **Ayarlar** bağlantısı Modüller sayfasını açar. Bu sayfayı yalnız Kurum Sahibi
kullanır. Diğer roller "Erişim Reddedildi" görür. Gizlilik ekranınız için doğrudan
`/tr/default/ayarlar/gizlilik` adresini açın.

- Kaynak: `docs/kamu/ILKADIM-PILOT.md:53-55`, `src/components/SidebarNav.tsx` (`settings` →
  `settingsModules`), `src/lib/routes.ts:126-127`.

**EN:** The Settings link opens the Modules page, which only the Owner can use. For your privacy page,
open `/en/default/settings/privacy`.

### E4. Fon Hazırlık Karnesi ve belediye çağrı radarı nedir, giriş gerekir mi?

Pilotun öncelikli iki yüzeyidir:

- **Fon Hazırlık Karnesi** (`/tr/fon-hazirlik`, EN `/en/funding-readiness`): kurumun AB fonuna ne
  kadar hazır olduğunu 0–100 arası puanlar.
- **Belediye çağrı radarı** (`/tr/belediye-cagrilari`, EN `/en/municipal-calls`): belediyelere açık ve
  yakında açılacak çağrıları listeler. Türkiye'nin katılamadığı programı rozetle işaretler.

İkisi de modül ya da plan kapısına bağlı değildir. Sayfa kodunda oturum kontrolü yoktur, yani giriş
yapmadan açılır.

- Kaynak: `docs/adr/ADR-0007-ilkadim-free-pilot.md:17`; `src/app/[locale]/fon-hazirlik/`,
  `src/app/[locale]/belediye-cagrilari/` (`auth()` / `requireTenant` çağrısı yok); QA akış 16–17.
- **[BİLİNEN SORUN — QA Ö-4]** Karnenin ortasında tarayıcı **geri** tuşuna basmak ya da sayfayı
  yenilemek bütün cevapları siler. Karneyi tek oturuşta, geri tuşu kullanmadan doldurun.

**EN:** The Readiness Scorecard and the municipal calls radar. Both open without sign-in. Known issue
Ö-4: Back or reload in the scorecard clears all answers.

### E5. Başvuruyu sistem AB portalına gönderir mi?

**Hayır.** Resmî başvuruyu her zaman belediye ekibi, portalda kendi eliyle yapar. NexaGrant aracı ve
yöntemi sağlar; başvuruyu belediye ekibi yazar.

- Kaynak: `docs/kamu/ILKADIM-PILOT.md:75`, `docs/BETA_GUIDE.md:77`.

**EN:** No. Your team always submits the official application on the portal.

### E6. YZ'nin ürettiği puan ya da metin resmî midir?

**Hayır.** YZ çıktısı her zaman "taslak"tır ve düzenlenebilir. Değerlendirme skorları "iç ön
değerlendirme"dir, resmî puan değildir.

- Kaynak: `docs/MODULES.md:5`, `docs/BETA_GUIDE.md:78`.

**EN:** No. AI output is always a draft. Scores are an internal pre-assessment, not an official score.

### E7. Takvimime toplantı ekleyebilir miyim? Outlook çalışır mı?

Takvim desteği yalnız **Google Takvim** ve **.ics** dosyasıdır. Outlook takvim bağlantısı kaldırıldı.
.ics dosyasını Outlook dahil çoğu takvime elle içe aktarabilirsiniz.

- Kaynak: `docs/ROADMAP.md:43-45`, `:333`.
- Not: Toplantı özeti modülü (M9) pilotta **kapalıdır** (E1). Haftalık görüşmenin takvim daveti (.ics)
  e-postanızla gelir (bkz. G4).

**EN:** Only Google Calendar and `.ics` files. Outlook calendar sync was removed. You can import an
`.ics` file into Outlook by hand.

### E8. E-postalar kimden gelir?

Bildirim ve davet e-postaları kendi sunucumuzdan, `info@nexagrant.com` adresinden gelir.

- Kaynak: `src/lib/env.ts:96-99`, `docs/kamu/VERI-YERLESIMI.md` (e-posta satırı).
- **[DOĞRULANMADI — patrona sor]** Canlı SMTP kurulumu ve DNS (SPF/DKIM/DMARC) henüz yapılmadı
  (`docs/kamu/VERI-YERLESIMI.md`). Kurulum bitmeden davet bağlantısı e-postayla gitmeyebilir; bu
  durumda kurum sahibi bağlantıyı ekrandan kopyalayıp iletir (QA akış 2: "Bağlantı ekranda
  gösterildi (SMTP yok)"). Gelmeyen e-posta için önce spam klasörüne bakın.

**EN:** From `info@nexagrant.com`, our own mail server. Live SMTP set-up is not done yet: *ask the
owner*. Until then the Owner can copy the invitation link from the screen.

---

## F. Pilot sonrası

### F1. Pilottan sonra ücret ne olacak?

Destek ekibi fiyat vermez. Pilot sonrası teklif patron tarafından, pilotun 10. haftasında verilir.
Ücretli geçiş tarihi e-Fatura açılmadan verilmez.

- Kaynak: `docs/kamu/ILKADIM-PILOT.md:155` (R1: teklif 10. haftada), `:158` (R4),
  `docs/adr/ADR-0007-ilkadim-free-pilot.md:40`.
- Soruyu patrona iletin (şablon Ş-9 kapanışı).

**EN:** Support does not quote prices. The owner gives the post-pilot offer in week 10. No paid
start date before e-invoicing is live.

---

## G. Destek

### G1. Sorun ya da öneri nasıl bildiririm?

**Uygulamanın içinden:** her çalışma alanı sayfasının sağ alt köşesinde **"Geri bildirim"** düğmesi
var. Konu, etki, başlık ve "ne oldu" alanlarını doldurun. İsterseniz ekran görüntüsü ekleyin (PNG,
JPEG ya da WebP, en fazla 2 MB). Sayfa adresi ve tarayıcı bilgisi kendiliğinden eklenir.
**Ekran görüntüsünde kişisel veri varsa önce üzerini kapatın.**

- Kaynak: `src/components/FeedbackWidget.tsx`, `messages/tr.json:768-770`,
  `src/app/api/feedback/route.ts:18-19`, `docs/BETA_GUIDE.md:151-174`.
- Not: Geri bildirim ucu pilot kapısını çağırmıyor, yani süre dolunca da çalışmalı (kod okuması,
  `src/app/api/feedback/route.ts:31-39`). Canlı denenmedi.

**EN:** Use the "Feedback" button at the bottom right of every workspace page. Add a screenshot if
you want (PNG/JPEG/WebP, max 2 MB). Hide personal data in screenshots first.

### G2. Destek e-posta adresi ve telefon var mı?

Pilot destek adresi **info@nexagrant.com**. Hata, hesap ve ürün geri bildirimi için bu adrese yazın.
Koddaki varsayılan (`src/lib/beta/constants.ts:49-50`) bu adrestir (TASK-MUPIR7Y1P7AH4). Kutunun posta
aldığı 01.10.2026'da patronun deneme e-postasıyla doğrulandı. Telefon hattı yok.

**EN:** The pilot support address is **info@nexagrant.com**. Write to it for bugs, account questions and
product feedback. There is no phone line.

### G3. Ne kadar sürede cevap alırım?

Sorunu bildirirken önceliği P0–P3 olarak belirtin. Hedeflerimiz **iş saatleri içinde** (Pazartesi–Cuma,
İstanbul saati, Türkiye ve Belçika resmî tatilleri hariç) geçerlidir ve **taahhüt değildir**:

| Öncelik | Ne zaman | İlk yanıt hedefi |
| ------- | -------- | ---------------- |
| P0 | Veri kaybı, giriş yapılamıyor, başka kurumun verisini gördüğünüzü düşünüyorsanız | 2 saat |
| P1 | Ana akış bloke | 1 iş günü |
| P2 | Rahatsız edici ama geçici çözümü var | 2 iş günü |
| P3 | Öneri | Haftalık görüşmede ele alınır |

Yoğun dönemlerde ya da arıza sırasında gecikme olabilir. P0 şüphesinde beklemeyin; doğrudan
**info@nexagrant.com** adresine yazın. Pilot planında SLA yoktur.

- Kaynak: `docs/BETA_GUIDE.md` § 5 (pilot ve beta için tek tablo); patron kararı 01.10.2026 (K-5).
  Takibi proje yöneticisi (PM) yapar.

**EN:** Mark the priority P0–P3 when you report a problem. Our targets apply **within business hours**
(Monday–Friday, Istanbul time, Turkish and Belgian public holidays excluded) and are **not guarantees**: P0 (data loss,
cannot sign in, or you believe you can see another organisation's data): first answer in 2 hours; P1
(main flow blocked): 1 business day; P2 (annoying, has a workaround): 2 business days; P3 (suggestion):
discussed in the weekly meeting. There may be delays in busy periods or during an incident. If you
suspect P0, do not wait; write to info@nexagrant.com directly. The pilot plan has no SLA.

### G4. Haftalık görüşme var mı?

Evet. Pilot ve beta ortakları birlikte, her **Pazartesi 15:00'te** (İstanbul saati, UTC+03:00, yıl boyu
aynı) **30 dakikalık** bir görüşme yaparız. Görüşme Google Meet üzerinden yapılır. Toplantı bağlantısı
ve takvim daveti (.ics) e-postanızla gelir. Takvim bağlantısı çalışmazsa info@nexagrant.com adresine
yazın.

- Kaynak: patron kararı 01.10.2026 (K-1, K-2, K-3); `docs/BETA_GUIDE.md` § 4.

**EN:** Yes. Pilot and beta partners meet together every **Monday at 15:00** (Istanbul time, UTC+03:00,
the same all year) for **30 minutes** on Google Meet. The meeting link and a calendar invitation
(.ics) arrive by e-mail. If the calendar link does not work, write to info@nexagrant.com.

---

## Ek — Doğrulanmamış maddeler (patrona soru listesi)

| No | Soru | SSS |
| -- | ---- | --- |
| P-1 | Kurum e-postası Google hesabı değilse belediyeye önerilen yol? (ILKADIM-PILOT S5) | A3 |
| P-2 | ~~Yanlış üye / yanlış davet~~ → **karar verildi** (K-4, 01.10.2026); QA Y-3 ekranı devrede: Kurum Sahibi/Kurum Yöneticisi Ekip Üyeleri sayfasından çıkarır/iptal eder. İç runbook yalnız ekran kullanılamazsa yedektir. Veri görülmüş olabilir şüphesinde KVKK değerlendirmesi ve hukuk bildirimi patronda (R-2) | B7 |
| P-3 | ~~Süre uzatma koşulu~~ → **karar verildi** (K-6, 01.10.2026): vaka bazlı, yayımlanmış kriter yok, otomatik uzatma yok | C4 |
| P-4 | "Model eğitimi için kullanılmaz" kullanıcıya taahhüt olarak söylenebilir mi? | D3 |
| P-5 | Kurumun bütün verisini dışa aktarma ve kurum hesabını silme yolu | D4, D5 |
| P-6 | İmzalı DPA ve üründeki DPA adresi pilot için güncel mi? | D7 |
| P-7 | ~~Pilot haftalık görüşme günü/saati~~ → **karar verildi: Pazartesi 15:00 Europe/Istanbul** (01.10.2026). Pilot ve beta birlikte, 30 dk, Google Meet (K-1..K-3). Açık kalan: ilk görüşmenin tarihi ve toplantı bağlantısı davetle gider | E7, G4 |
| P-8 | Canlı SMTP kurulumu ne zaman biter? | E8 |
| P-9 | ~~Pilot destek e-posta adresi~~ → **karar verildi: info@nexagrant.com** (01.10.2026, posta alımı doğrulandı) | G2 |
| P-10 | ~~Pilot yanıt süresi hedefleri~~ → **karar verildi** (K-5, 01.10.2026): P0 2 saat / P1 1 iş günü / P2 2 iş günü, iş saatleri içinde, takip PM | G3 |
