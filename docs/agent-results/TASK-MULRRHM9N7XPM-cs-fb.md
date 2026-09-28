# TASK-MULRRHM9N7XPM — FB KAMU B12: KVKK, toplu davetle kayıtta aydınlatma (CS-FB)

Sprint FB-KAMU-2 · dal `dev` · 29.09.2026 · Durum: **taslaklar teslim edildi, hukuk onayı yok**

> **Kart tanımı hakkında not:** Task Board aracı (`list_tasks`) bu ajan pane'inde yalnız kart **başlığını** döndürüyor, `description` alanını döndürmüyor. Bu yüzden kartın tam tanımını okuyamadım. İş; delegasyon metnindeki teslim listesi, kart başlığı ve kartın kaynağı olan `docs/kamu/OKA-KANAL-ONERISI.md` §6 B12 satırına göre yapıldı. Kart tanımında bunların dışında bir madde varsa lider bana iletmeli (bkz. §5 açık sorular).

## 1. Ne yapıldı

Kod yazılmadı. `messages/*.json` dosyalarına dokunulmadı.

1. **Ajans kanalı aydınlatma eki taslağı:** `docs/legal/agency-channel-notice-addendum.md`
   - Taraflar ve roller (§1), ajansa **giden** verinin tam listesi (§2), ajansa **gitmeyen** verinin açık listesi (§3).
   - **Küçük sayı kuralı** (§3.1): 3'ten az kurum olan kırılım hücresinde "<3" yazılır. Bu kural olmazsa "toplu sayı = anonim" iddiası tutmaz. Örnek: "Çorum · belediye · 1" o belediyeyi tanıtır, şahıs şirketi olan bir KOBİ'de ise bir gerçek kişiyi.
   - Kullanıcıya gösterilecek tam ek metin, 11 madde: TR (§4) ve EN (§5).
   - Yayın şartları (§6) ve hukuk ekibine 10 soru (§7, HUKUK-1 … HUKUK-10).
2. **İşleme envanteri satırı taslağı:** `docs/legal/processing-register-draft-agency-channel.md`
   - §18c satırı envanterin tablo biçiminde yazıldı. Ayrıca B1 birleşince §18b, §20, §21 ve §22'de yapılacak değişiklikler listelendi.
   - **Satır bilerek `processing-register.md` içine yazılmadı.** Envanterin kendi kuralı şöyle: "her satır gerçek bir tabloya ve gerçek bir kod yoluna dayanır; varsayımsal faaliyet yazılmamıştır". B1 henüz birleşmedi. Satır, B1 birleşince gerçek model adlarıyla taşınacak.
   - B1'in yeni başlayan kodu okundu (`src/lib/agency/invite-code.ts`, commitlenmemiş, be-fb'nin alanı). Taslağa şu bilgi işlendi: davet kodunun kendisi saklanmaz, veritabanında yalnız SHA-256 özeti ve son 4 karakteri tutulur.
3. **Kayıt ekranı metni (TR/EN):** `messages` anahtar önerisi olarak aşağıda, §3.
4. **Ekranda yerleşim tarifi:** aşağıda, §4.

Her hukuki belirsizlik **[HUKUK]** ya da `<<HUKUK-n …>>` diye işaretlendi. Metnin hiçbir yeri hukuken onaylı değildir.

## 2. Kanıt

Kod değişmediği için e2e kanıtı yok. Metnin kod ve dokümanla tutarlı olduğunu şu ölçümlerle doğruladım:

```
# Mevcut kayıt kutusu ve anahtarları (messages/tr.json → Auth)
tr Auth keys: ['signIn','signOut','register','signInTitle','disclosureAck','disclosureRequired','disclosureVersion']
tr disclosureAck => Kişisel verilerimin işlenmesine ilişkin <privacy>Gizlilik Politikası ve KVKK Aydınlatma Metni</privacy>'ni okudum ve <terms>Kullanım Koşulları</terms>'nı kabul ediyorum.

# Önerilen anahtarlar mevcut anahtarlarla çakışıyor mu? (her iki dil)
tr Auth.agencyInvite False False legal.agencyChannel False legal keys: ['privacy','terms','dpa','cookieConsent']
en Auth.agencyInvite False False legal.agencyChannel False legal keys: ['privacy','terms','dpa','cookieConsent']
→ çakışma yok

# Önerilen TR/EN anahtar setinin tutarlılığı (JSON parse + yer tutucu/etiket eşitliği + {agency} sonrası ek kontrolü)
keys tr 14 en 14 same set: True
placeholder/tag parity checked          ← uyuşmazlık satırı yok, "{agency}'" ya da "{agency}+ek" yok

# B1/B2/B3 kodda var mı? (29.09.2026)
grep -n -i -E "agency|ajans|parentTenant|inviteCode" prisma/schema.prisma   → boş
src/lib/agency/invite-code.ts  → commitlenmemiş, yalnız kod üretimi/özetleme (B1 başlangıcı)

# Gizlilik sayfasının {brand} kusuru (gap analizi §1.3) bugün kapalı mı?
src/app/[locale]/privacy/page.tsx:50  body: t('controllerBody', { brand: PRODUCT_NAME })   → düzeltilmiş
```

Kaynaklar: `src/app/[locale]/login/AuthCard.tsx` (kayıt kutusu, satır 60-90 ve 341-400) · `src/lib/legal/consent-documents.ts` (sürüm ve token yapısı) · `prisma/schema.prisma` `enum ConsentKind` / `enum ConsentPurpose` (satır 1567-1600) · `src/lib/public-sector/catalog.ts` (`PUBLIC_SECTOR_ORG_TYPES`).

## 3. Kayıt ekranı metni — `messages` anahtar önerisi

> **Bu anahtarlar `messages/*.json`'a yazılmadı.** Uygulayan kart iki dile birden ekler (CLAUDE.md kural 8). `{agency}`, sunucunun doğruladığı koddan gelen ajans görünen adıdır (bkz. §4 madde 3).
>
> **Türkçe ek kuralı:** `{agency}` yer tutucusuna ek getirilmedi ("{agency}'nın" yok). Ajans adı "OKA" da olabilir, "Orta Karadeniz Kalkınma Ajansı" da. Sabit bir ek, bu adlardan birinde ünlü uyumunu bozar. Cümleler, eki yer tutucudan sonraki kelimeye bırakacak biçimde kuruldu ("{agency} kanalına").

### `messages/tr.json`

```json
{
  "Auth": {
    "agencyInvite": {
      "title": "{agency} davet koduyla kayıt oluyorsunuz",
      "body": "Kurumunuz bu kodla {agency} kanalına bağlanır. Ajans yalnız toplu sayıları görür, sizi ve kurumunuzun çalışmalarını görmez.",
      "seesTitle": "Ajans ne görür?",
      "sees": "Bölgedeki kurumların toplu sayıları: kaç kurum kayıt oldu, kaç karne tamamlandı, kaç çağrı seçildi, kaç başvuru yapıldı. 3'ten az kurum olan kırılımlar gösterilmez.",
      "notSeesTitle": "Ajans neyi görmez?",
      "notSees": "Adınızı, e-postanızı, kurumunuzun adını, karne cevaplarınızı, konsept notlarınızı, belgelerinizi ve fatura bilgilerinizi.",
      "more": "Ayrıntılar: <addendum>Ajans Kanalı Aydınlatma Eki</addendum>",
      "unlinkHint": "Kurum yöneticiniz bu bağı daha sonra Ayarlar → Gizlilik bölümünden kaldırabilir.",
      "invalidCode": "Bu davet kodu geçersiz ya da süresi dolmuş. Kodsuz kayıt olabilir ya da ajanstan yeni bir kod isteyebilirsiniz."
    },
    "disclosureAckAgency": "<privacy>Gizlilik Politikası ve KVKK Aydınlatma Metni</privacy>'ni ve <addendum>Ajans Kanalı Aydınlatma Eki</addendum>'ni okudum; <terms>Kullanım Koşulları</terms>'nı kabul ediyorum.",
    "disclosureRequiredAgency": "Devam edebilmek için aydınlatma metnini ve ajans kanalı ekini okuduğunuzu, kullanım koşullarını kabul ettiğinizi onaylamanız gerekir."
  },
  "legal": {
    "agencyChannel": {
      "metaTitle": "Ajans Kanalı Aydınlatma Eki | {brand}",
      "metaDescription": "Kalkınma ajansı davet koduyla kayıt olan kurumlar için ek aydınlatma: ajansa hangi toplu verinin gittiği ve hangisinin gitmediği.",
      "heading": "Ajans Kanalı Aydınlatma Eki"
    }
  }
}
```

### `messages/en.json`

```json
{
  "Auth": {
    "agencyInvite": {
      "title": "You are signing up with an invite code from {agency}",
      "body": "With this code, your organisation is linked to the {agency} channel. The agency sees aggregate numbers only. It does not see you or your organisation's work.",
      "seesTitle": "What does the agency see?",
      "sees": "Aggregate numbers for organisations in its region: how many signed up, how many completed the scorecard, how many picked a call, how many applied. Breakdowns with fewer than 3 organisations are not shown.",
      "notSeesTitle": "What does the agency not see?",
      "notSees": "Your name, your email, your organisation's name, your scorecard answers, your concept notes, your documents and your billing data.",
      "more": "Details: <addendum>Agency Channel Privacy Notice Addendum</addendum>",
      "unlinkHint": "An admin of your organisation can remove this link later in Settings → Privacy.",
      "invalidCode": "This invite code is not valid or has expired. You can sign up without a code, or ask the agency for a new code."
    },
    "disclosureAckAgency": "I have read the <privacy>Privacy Policy and Data Protection Notice</privacy> and the <addendum>Agency Channel Privacy Notice Addendum</addendum>, and I accept the <terms>Terms of Service</terms>.",
    "disclosureRequiredAgency": "To continue, please confirm that you have read the privacy notice and the agency channel addendum, and that you accept the terms of service."
  },
  "legal": {
    "agencyChannel": {
      "metaTitle": "Agency Channel Privacy Notice Addendum | {brand}",
      "metaDescription": "Additional privacy notice for organisations that sign up with an invite code from a development agency: which aggregate data goes to the agency and which does not.",
      "heading": "Agency Channel Privacy Notice Addendum"
    }
  }
}
```

Ek sayfanın gövde bölümleri (`legal.agencyChannel.s1Heading` / `s1Body` … `s11`), `docs/legal/agency-channel-notice-addendum.md` §4 (TR) ve §5 (EN) metninden **hukuk onayından sonra** üretilir. Onaysız gövde metni kataloğa girmemeli.

**Koşullu anahtarlar:**

- `notSees` içindeki "kurumunuzun adını" ifadesi **açık soru S4**'e bağlıdır. OKA kurum adını görecekse bu ifade çıkar ve ek yeniden yazılır (HUKUK-4).
- `unlinkHint` yalnız "bağı kaldırma" özelliği yapılırsa eklenir (ürün kararı + HUKUK-8). Özellik yoksa anahtar eklenmez. Olmayan bir özelliği vaat etmek, kaldırılan PostHog beyanının (envanter §19) tekrarı olur.
- `invalidCode`, geçersiz, süresi dolmuş, iptal edilmiş ve hakkı bitmiş kodlar için **tek ve aynı** mesajdır. B1 de bilinmeyen kodu "tek tip ret" ile karşılıyor (`invite-code.ts` `normalizeInviteCode` yorumu). Farklı mesajlar, hangi kodların gerçek olduğunu dışarı sızdırır.

## 4. Yerleşim tarifi (uygulayan kart için)

Yüzey: `src/app/[locale]/login/AuthCard.tsx` kayıt modu (`/[locale]/register`, `/[locale]/kayit`). Aşağıdaki maddeler bir tasarım önerisidir. Kodu B1 ya da ayrı bir FE kartı yazar.

1. **Ne zaman görünür:** Kayıt modunda ve sunucu kodu **geçerli** bulduğunda. Kod yoksa ekran bugünkü gibi kalır ve hiçbir yeni metin çıkmaz.
2. **Nerede — veri alanlarından ÖNCE:** Ajans kutusu (`agencyInvite.title`, `body`, `seesTitle`/`sees`, `notSeesTitle`/`notSees`, `more`), kayıt başlığının hemen altına ve **Ad / Kurum / E-posta alanlarından ve Google/Microsoft düğmelerinden önce** konur. Gerekçe: KVKK md.10, aydınlatmayı verinin "elde edilmesi sırasında" ister. Kişi bilgisini yazmadan önce ajansa neyin gideceğini okumalıdır.
3. **Ajans adı URL'den okunmaz:** `{agency}` değeri, sunucunun kod özetinden bulduğu ajans kaydından gelir. `?agency=OKA` gibi bir parametre ekrana basılmamalı, yoksa herkes "OKA davet ediyor" yazan sahte bir bağlantı üretebilir. Kod geçersizse kutu hiç çıkmaz, yalnız `invalidCode` gösterilir.
4. **Katmanlı ama gizlenmemiş:** "Ajans ne görür / görmez" iki kısa paragrafı **açık** durur, "daha fazla göster" gibi bir akordeonun arkasına saklanmaz. Tam metin `more` bağlantısıyla ayrı sayfadadır (`/[locale]/privacy/agency-channel`, yeni sekmede, mevcut `privacy`/`terms` bağlantıları gibi).
5. **Onay kutusu:** Kod geçerliyse mevcut kutunun etiketi `disclosureAck` yerine `disclosureAckAgency` olur. Hata metni de `disclosureRequired` yerine `disclosureRequiredAgency` olur. Kutu **tek** kalır, önceden işaretli gelmez. Kutu rıza değil aydınlatma teyidi + koşul kabulüdür (envanter §18b kuralı; HUKUK-3 cevabı "açık rıza" derse bu madde yeniden açılır).
6. **Sürüm kaydı (`src/lib/legal/consent-documents.ts`):**
   - Yeni belge: `AGENCY_CHANNEL_NOTICE` → `id: 'agency-channel-notice'`, `kind: 'DISCLOSURE_ACK'`, kendi `version` değeri, `href: /${locale}/privacy/agency-channel`.
   - Kodla kayıtta belge seti `REGISTRATION_DOCUMENTS + AGENCY_CHANNEL_NOTICE` olur. `registrationAcknowledgementToken()` ve `acknowledgementMatchesCurrent()` bu seti **kodun varlığına göre** hesaplamalı. Kodla gelen bir kayıt ek belgeyi içermeyen bir token'la hesap açamamalı.
   - `ConsentPurpose` için yeni bir değer (öneri `AGENCY_CHANNEL_LINK`, envanter §18c'ye eşlenir) şema değişikliği ister. Bu iş B1 sahibinin (be-fb) şema işidir, bu kartın işi değildir.
   - `disclosureVersion` satırı üç belgeyi de gösterir.
7. **OAuth yolu:** Mevcut kural aynen geçerlidir: kutu işaretlenmeden Google/Microsoft yönlendirmesi başlamaz. Kod bilgisi ve genişletilmiş token, yönlendirmeden önce sunucu tarafında saklanmalıdır; yoksa geri dönüşte bağ ya da ek onay kaybolur.
8. **Telefon genişliği:** Kutu 360 px'te yatay kaydırma olmadan okunur. Mevcut kutu stili (`rounded-xl border bg-ground/60 p-3`, `text-[11px]`) yeniden kullanılır, yeni renk tanımlanmaz.
9. **Hesabı olan kullanıcı kod girerse:** Bu akış tasarlanmadı. B1 yalnız "yeni Keşif kiracısı" açıyor. Mevcut kiracıyı ajansa bağlamak ayrı bir teyit ekranı ister (HUKUK-10). O ekran yapılana kadar mevcut kiracı sessizce bağlanmamalı.

**Uygulayan kart için kabul ölçütü taslağı:**

- [ ] Kodsuz kayıt ekranı değişmedi (önce/sonra kare).
- [ ] Geçerli kodla: ajans kutusu, ad/e-posta alanlarından ve OAuth düğmelerinden önce görünüyor, ajans adı sunucudan geliyor (TR + EN kare).
- [ ] Geçersiz, süresi dolmuş ve iptal edilmiş kodların üçü de aynı `invalidCode` metnini gösteriyor.
- [ ] Kodla kayıtta `Consent` tablosunda 3 satır var: `privacy-notice`, `terms-of-service`, `agency-channel-notice`, her biri doğru sürümle. Kodsuz kayıtta 2 satır.
- [ ] Ek belgeyi içermeyen eski bir token'la kodlu kayıt sunucuda reddediliyor.
- [ ] `/tr/privacy/agency-channel` ve `/en/privacy/agency-channel` görünür metninde `legal.` anahtar yolu 0 adet.
- [ ] Hepsi gerçek tarayıcıda, gerçek tıklamayla doğrulanmış.

## 5. Riskler

- **Metin, henüz olmayan kodu anlatıyor.** B2 panosu ya da B3 raporu §2 listesinden fazlasını gösterirse, ya da küçük sayı kuralı uygulanmazsa ek **yanlış beyan** olur. Bu, envanter §19'daki PostHog "fazla beyan" hatasının tersidir. Önlem: ekin §6 "yayın şartları" maddesi 3 ve yukarıdaki kabul ölçütleri. **B2 ve B3 kartlarına "<3" kuralının kabul ölçütü olarak eklenmesini öneririm** (LEED-FB).
- **S4 açık.** OKA kurum adını isterse "ajans kişisel veri alıcısı değildir" varsayımı (HUKUK-2) düşer ve ek, aktarım bölümüyle yeniden yazılır.
- **Ana aydınlatma metni hâlâ eksik.** Veri sorumlusu kimliği ana metinde de yok (gap analizi §4). Ek bu boşluğu kapatmaz. OKA pilotunun başlangıç şartı B12 olduğu için, pilot tarihini **ana metnin** hukuk girdisi de belirler.
- **Paylaşımlı ağaç:** Çalışma ağacında başka ajanların commitlenmemiş değişiklikleri var (`src/lib/auth.ts`, `src/lib/agency/`, `tests/e2e/*`). Commit yalnız bu kartın 3 dosyasıyla yapıldı.

## 6. Açık sorular

| No  | Soru                                                                                                                                  | Kime                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| A1  | HUKUK-1 … HUKUK-10 (`agency-channel-notice-addendum.md` §7)                                                                           | Hukuk                  |
| A2  | S4: OKA kurum adını görecek mi? (öneri: hayır)                                                                                        | Patron / OKA görüşmesi |
| A3  | "Bağı kaldırma" özelliği yapılacak mı? Yapılmayacaksa ek §4 madde 10 ve `unlinkHint` çıkar                                            | LEED-FB / ürün         |
| A4  | Kart tanımında bu raporun karşılamadığı bir madde var mı? Tanım bu pane'den okunamadı                                                 | LEED-FB                |
| A5  | Ek `privacy` rotasının altında mı (`/[locale]/privacy/agency-channel`) yoksa ana metnin bir bölümü olarak mı yayımlanacak? (HUKUK-10) | Hukuk + FE             |

## 7. Değişen dosyalar

- `docs/legal/agency-channel-notice-addendum.md` (yeni)
- `docs/legal/processing-register-draft-agency-channel.md` (yeni)
- `docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md` (bu rapor)

`messages/*.json`, `processing-register.md` ve kod dosyaları **değişmedi**.

## 8. Sonraki adım

1. LEED-FB: taslakları hukuka iletir. B2/B3 kartlarına "<3" kuralını ve "§2 listesinden fazlası yok" ölçütünü ekler. A3 ve A4'ü cevaplar.
2. Hukuk cevabından sonra: ek metni kesinleşir, §4/§5 gövdesi `legal.agencyChannel` altına girer, `AGENCY_CHANNEL_NOTICE` sürümü verilir.
3. B1 birleşince §18c satırı gerçek model ve dosya adlarıyla `processing-register.md`'ye taşınır, taslak dosya silinir.
4. Aynı kuyrukta sıradaki iş: TASK-MULRS7WKYEFOP (B9, veri yerleşimi). Bu delegasyonda başlanmadı.

## Platform beyanı

Çalışma **macOS**'ta (Darwin 27.0.0) yapıldı. Teslimat yalnız Markdown belgelerinden ve JSON öneri metninden oluşuyor. Platforma bağlı bir kod yolu (süreç, dosya yolu, kabuk, kısayol, DPI, izin) değişmediği için Windows ve Linux'ta davranış farkı yok. Önerilen ekran metninin görünümü (§4 madde 8, 360 px) uygulama kodu yazılmadığı için **hiçbir platformda koşulamadı**. Uygulayan kart bunu gerçek tarayıcıda doğrulamalı.
