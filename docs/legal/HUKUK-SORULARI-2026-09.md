# FonBridge — Hukukçuya Soru Paketi (Eylül 2026)

> **Sürüm 1.9** · 29.09.2026 · Hazırlayan: CS-FB · Kart: TASK-MUMH7OISNJ5OV (FB-KAMU-2, pilot kapısı d); 1.1 eki: TASK-MUMJA8VJJ8YP0 (PostHog ve Sentry); 1.2 eki: TASK-MUMLFVDX85O4M (29.09 ürün sahibi kararları: dış hizmet listesi daraldı, Microsoft girişi kaldırıldı); 1.3 eki: TASK-MUMNAUBUDL5E7 (Outlook takvimi ve kurumsal SSO kaldırıldı); 1.4 eki: TASK-MUMO301VCLCWR (Resend kodda kaldırıldı); 1.5 eki: TASK-MUMSRVP2LK8GM (İNCELEME-25 düzeltmeleri: Sentry envanterden çıktı, güncelleme ölçütü, satır numaraları); 1.6 eki: TASK-MUN23L19681HC (İNCELEME-26 Y-1: davet e-postası alıcısı; Inngest koddan çıktı); 1.7 eki: TASK-MUN2FJ4R24QPT (İNCELEME-28 B-1..B-6: barındırma sağlayıcısı, SMTP'nin iki modeli, davet saklama süresi); 1.8 eki: TASK-MUN2J9LLXNREG (davet satırları 30 gün sonra siliniyor; davet kabul sayfası yazıldı); 1.9 eki: TASK-MUN2PNAR729H8 (e-posta kararı: kendi SMTP sunucumuz)
>
> **Kime:** FonBridge'in KVKK / veri koruma danışmanı.
> **Ne istiyoruz:** Bu belgedeki sorulara yazılı görüş. Her sorunun altında "cevaba göre ne değişir" bölümü var. Cevabınız, hangi metnin ve hangi ürün davranışının değişeceğini doğrudan belirler.
>
> **Bu belge hukuki bir metin değildir.** Ürün ekibinin bugünkü durumu anlattığı bir soru listesidir. Hiçbir cümlesi hukuken onaylı değildir.
>
> **Bugünkü durumun kaynağı kodun kendisidir**, planlar ya da eski belgeler değildir. Her teknik iddia 29.09.2026'da `dev` dalının `84d11af4` commit'inde kaynak kodda kontrol edildi (sürüm 1.0 `858c139a`'da kontrol edilmişti; sürüm 1.1'de bütün kanıt satırları bu commit'e göre yeniden kontrol edildi). **Sürüm 1.2:** kanıt satırlarındaki dosyalar `89eab729`'a kadar tarandı; yalnız `oauth-registration.ts` satır numaraları kaydı, onlar düzeltildi. 1.2'de eklenen §2.0 giriş satırı ve §5 madde 3 kod değil **karardır**: 29.09.2026 akşamı ürün sahibi dört dış hizmeti üründen çıkardı. Kod değişikliği o gün sürüyordu (kart kodları ilgili satırlarda). **Sürüm 1.3 (değişiklik notu):** (a) Takvim bağlantısında Outlook (Microsoft) seçeneği kaldırıldı; takvim yalnız Google Takvim ve `.ics` dosyasıyla çalışır (§2.0, §5 madde 3). (b) Kurumsal tek oturum açma (SSO / SAML) ayarı üründen kaldırıldı; bu ayar hiçbir zaman girişte kullanılmamıştı (§2.0, §2.3 kanıtı). (c) Microsoft girişinin kaldırılması artık kodda (`acc35b07`); §2.0 ve §5 madde 3 kanıt satırları buna göre düzeltildi. Kanıt satırları `9a9aa6ef`'e göre; SSO kaldırması `0fdbcb8d`. Soruların hiçbiri değişmedi. **Sürüm 1.4 (değişiklik notu):** Resend kodda kaldırıldı (`fe9fd31c`); e-posta kendi SMTP sunucumuzdan gider. SMTP sağlayıcısı kurumsal e-posta hesabıdır, ürün sahibi belirleyecek (§5 madde 3). Envanter §17, §18, §21 e-posta satırları buna göre güncellendi. Soruların hiçbiri değişmedi. **Sürüm 1.5 (değişiklik notu):** (a) Sentry kodu `89eab729`'dan beri üründe yoktur; envanter §19a ve §21 artık Sentry'yi "anahtar girilirse açılır" bir alt işleyen olarak değil, kaldırılmış hizmet olarak anlatıyor (§5 madde 3). (b) Envanter ve bu paket için güncelleme ölçütü yazıldı: bir değişiklik, kodu `dev` dalına düştüğü commit ile işlenir; kartın panodaki durumu ölçüt değildir (§8 madde 6). (c) Envanter §1'deki eski "e-posta/parola girişi" cümlesi çıkarıldı: parola ile giriş yoktur. (d) Kanıt satırlarının numaraları `e4fb8d71`'e göre yeniden alındı (`oauth-registration.ts`, `sso.ts`). Soruların hiçbiri değişmedi. **Sürüm 1.6 (değişiklik notu):** (a) Ekip daveti artık davetliye e-posta gönderiyor (`fe9fd31c`). E-postada davetlinin adresi, kurum adı ve giriş bağlantısı var; e-posta SMTP sağlayıcısından geçer. Envanter §2 bu işlemde "alıcı yok" diyordu. Artık alıcı olarak SMTP sağlayıcısını yazıyor, §21'deki SMTP satırı da §2'yi sayıyor. Bu, 1.4'te işlenmesi gereken bir satırdı (§8 madde 6). (b) Davet e-postasına sınır kondu (`1c6b3e70`): aynı davete 10 dakikada bir, kurum başına günde en çok 50 e-posta. Sayım, denetim kaydına yazılan gönderim satırlarıyla yapılır; bu satırlarda davetlinin adresi yoktur; gönderim satırında davet edenin kimliği ve davetin kimliği, başarısız gönderim satırında yalnız davetin kimliği vardır (1.7'de düzeltildi). Envanter §2 bunu da yazıyor. (c) Inngest kodu `5ed2261a` ile `dev` dalından çıktı; zamanlanmış işler artık kendi veritabanımızdaki iş kuyruğunda çalışıyor (§5 madde 3). Envanterdeki iş dosyası yolları yeni yere göre düzeltildi. (d) Kodda davetin **kabul sayfası yok**: e-postadaki bağlantı açılmıyor (envanter §22 madde 14). Bu bir ürün hatasıdır, ayrıca bildirildi. Kanıt satırları `3bc74a7b`'ye göre. Soruların hiçbiri değişmedi. **Sürüm 1.7 (değişiklik notu):** (a) 1.6 (b) düzeltildi: başarısız gönderim satırında davet edenin kimliği yoktur, yalnız davetin kimliği vardır. (b) **Barındırma sağlayıcısı** envanterde alıcı olarak hiç yazılmamıştı. Uygulama, zamanlanmış işleri koşturan süreç ve veritabanı üçüncü taraf bir barındırma firmasında çalışacak; firma ve ülke ürün sahibinin kararını bekliyor. Envanter artık "yalnız iç veritabanı" demiyor, bu sağlayıcıyı açık bir alıcı olarak yazıyor. (c) E-posta iki farklı biçimde anlatılıyordu ("kendi SMTP sunucumuz" ve "kurumsal e-posta hesabı"). Artık tek ifade var: kurumsal e-posta hesabının SMTP sunucusu. Hangi model olacağı ürün sahibinin kararını bekliyor; iki seçenek ve etkileri §5 madde 3'teki ek görüş sorusunda. **Bu soru değişti.** (d) Ekip davetinde kullanılmayan davetlerin e-posta adresi süresiz kalıyor, çünkü silen bir temizlik işi yok (§5 madde 6). (e) Haftalık geri bildirim özeti e-postası (geri bildirim başlığı ve kurum adı, iç alıcıya) envantere eklendi. (f) Davet bağlantısının e-postada güvenli taşınma koşulu (şifreli bağlantı) envanterin tedbir satırına yazıldı. Kanıt satırları `a40b6bf4`'e göre. **Sürüm 1.8 (değişiklik notu):** (a) Ekip davetinde davetlinin e-posta adresi artık süresiz kalmıyor (`4a100e41`). Kabul edilen davet, kabulden 30 gün sonra silinir. Kabul edilmeyen davet, bağlantının süresi bittikten 30 gün sonra silinir. Bağlantı 7 gün geçerlidir; bu yüzden kullanılmayan bir davet en çok 37 gün kalır. Silme her gece çalışan bir işle yapılır. İş, her kurumun denetim kaydına yalnız kaç davetin silindiğini yazar; adres yazılmaz. 30 gün, üründeki öteki 30 günlük sürelerle aynıdır (hesap silme bekleme süresi gibi). Bu süre hukukça onaylı değildir; §5 madde 6'daki soruya eklendi. **Bu soru değişti.** (b) 1.6 (d) kapandı: davetin kabul sayfası yazıldı (`0ae3175b`). Bağlantı açılınca token adres çubuğundan çıkarılır, tarayıcıda en çok 30 dakika kalan bir çereze alınır. Davet yalnız davet edilen adresin hesabıyla kabul edilir. Hesabı olmayan davetli Google ile girince kendi kurumu açılmaz, davet eden kuruma üye olur. Yeni alıcı yoktur: Google girişi zaten §5 madde 3'teki listededir. Envanter §2 ve §22 madde 14, 16 güncellendi. **Sürüm 1.9 (değişiklik notu):** E-posta kararı verildi (ürün sahibi, 29.09.2026): e-postalar **kendi SMTP sunucumuzdan** gider, gönderici adres `info@usfinbridge.com`. Ayrı bir üçüncü taraf e-posta işleyeni yoktur. Sunucu, uygulamayla aynı barındırma firmasında çalışır; bu yüzden e-posta, barındırma firmasının kapsamındadır. Barındırma firması ve ülkesi hâlâ belli değil. Sunucunun kurulumu ve alan adı ayarları (SPF, DKIM, DMARC) sürüyor (TASK-MUN2PKA5AG2IV). 1.7'deki iki seçenekli e-posta sorusu tek soruya indi (§5 madde 3). **Bu soru değişti.** Envanter §2, §14, §17, §18, §21 ve §22 madde 17; `docs/kamu/VERI-YERLESIMI.md` e-posta satırı ve madde 3; `docs/SECURITY_COMPLIANCE.md` alt işleyici listesi güncellendi. Kod değişmedi: kod, sunucu türünü ayırt etmez, ayarları ortamdan okur (`mailer.ts:6-11`). Kanıt satırları `1d19c2dc`'e göre.

Kod yolları her bölümün sonunda "Kanıt" satırında verilir. Bu satırlar ürün ekibi içindir; okumanız gerekmez.

---

## 1. Önce bunu okuyun: kısa özet

**Pilot için en acil soru HUKUK-5'tir.** İlkadım Belediyesi pilotu, HUKUK-5 cevaplanmadan başlamamalı (ROADMAP "Pilot kapıları" satır d). Öteki sorular için öncelik önerimiz aşağıdaki tabloda. Son karar ürün sahibinindir.

| No       | Soru (tek cümle)                                                                                       | Öncelik önerisi                                           | Bölüm |
| -------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ----- |
| HUKUK-5  | Ajansa gösterilen toplu sayıları gizleme kurallarımız "anonim veri" demek için yeterli mi?             | **Pilottan önce şart** (pilot kapısı d)                   | §3.1  |
| HUKUK-11 | Kurumun ili, şahıs şirketi olan bir KOBİ'de kişisel veri midir? Ana aydınlatma metnine yazılmalı mı?   | Pilottan önce                                             | §3.2  |
| HUKUK-12 | "Karne sonucumu hesabıma ekle" kutusu rıza mıdır? Ana metne mi yazılır, envanterde ayrı satır mı olur? | Pilottan önce                                             | §3.3  |
| HUKUK-1  | Veri sorumlusunun tam kimliği ve başvuru kanalı                                                        | Pilottan önce (bütün metinler buna bağlı)                 | §4.1  |
| HUKUK-2  | Toplu sayı gören ajans "alıcı" mı, ortak veri sorumlusu mu?                                            | Pilottan önce (HUKUK-5 ile birlikte)                      | §4.2  |
| HUKUK-3  | Ajans bağının ve sayıların hukuki sebebi                                                               | Pilottan önce                                             | §4.3  |
| HUKUK-6  | Aylık bölge raporu indirilebilir dosya olarak ajansa veriliyor; ekte nasıl yazılmalı?                  | Pilottan önce (rapor artık kodda, §2.1)                   | §4.4  |
| HUKUK-10 | Ajans eki ayrı belge mi, ana metnin bölümü mü? Kayıt ekranındaki kısa metin yeterli mi?                | Pilottan önce (kısa metin bugün kayıt ekranında, §2.2)    | §4.5  |
| HUKUK-4  | Kurum adı ileride ajansa gösterilirse ne gerekir?                                                      | Sonra (bugün gösterilmiyor) — ama §2.3'e bakın            | §4.6  |
| HUKUK-7  | Ajans bağı kaldırılınca bağ kaydı ne kadar saklanır?                                                   | Pilot sırasında                                           | §4.7  |
| HUKUK-8  | Ajans bağını kaldırma bir KVKK md.11 hakkı mı, sözleşmesel seçenek mi?                                 | Pilot sırasında                                           | §4.7  |
| HUKUK-9  | İngilizce metin GDPR art.13 için nerede farklı yazılmalı?                                              | Sonra (pilot Türkçe)                                      | §4.8  |
| —        | Ana aydınlatma metninin boş alanları (veri sorumlusu, alıcılar, yurt dışı aktarım, saklama süreleri …) | Pilottan önce (ayrı iş: TASK-MTSWIFJKGTYC)                | §5    |
| —        | Kamu ve ticari sorular (ajansa gelir payı, satın alma usulü, 22/d)                                     | Ücretli satıştan önce; KVKK dışı, başka uzman gerekebilir | §6    |

Cevaplarınızı §7'deki cevap tablosuna yazabilirsiniz.

---

## 2. Ürün ve bugünkü durum (bilmeniz gerekenler)

### 2.0 Birkaç cümlede FonBridge ve ajans kanalı

- **FonBridge**, kurumların (belediye, KOBİ, üniversite, STK …) AB ve ulusal hibe çağrılarını bulmasına ve başvuru hazırlamasına yardım eden bir web uygulamasıdır. Her kurumun ayrı bir hesabı ("kiracı") vardır.
- **Kalkınma ajansı** (ör. Orta Karadeniz Kalkınma Ajansı, OKA) FonBridge'de ayrı bir hesap türüdür. Ajans **davet kodu** üretir ve bölgesindeki kurumlara dağıtır.
- Kurum kayıt olurken bu kodu kullanırsa kurumun hesabı ajansa **bağlanır**. Ajans, kendi kodlarıyla gelen kurumlar hakkında **yalnız toplu sayılar** görür: kaç kurum kayıt oldu, kaç kurum bir çağrıyı takibe aldı, kaç kurumun başvurusu kabul edildi gibi.
- **Fon hazırlık karnesi**, sitede kayıt olmadan doldurulabilen 15 soruluk bir öz değerlendirmedir. Kurum türü, cevaplar ve isteğe bağlı olarak il seçilir.
- **Giriş yalnız Google hesabıyla yapılır.** Microsoft ile giriş seçeneği ürün sahibinin 29.09.2026 kararıyla **kaldırıldı**; açılması planlanmıyor. Şifreyle giriş yoktur (ADR-0006, 29.09.2026).
  - _Kanıt:_ karar kaydı TASK-MUMLFLB2OPLY3. **Sürüm 1.3:** Microsoft sağlayıcısı `acc35b07` ile koddan çıktı (kart `done`). `9a9aa6ef`'te `src/lib/auth.ts` yalnız `Google` ve yerel demo için `Credentials` sağlayıcısını içeriyor (`auth.ts:2-3`, `:300`); giriş ekranında yalnız Google düğmesi var (`AuthCard.tsx:159`).
- **Takvim bağlantısı yalnız Google Takvim ve `.ics` dosyasıyla çalışır.** Outlook (Microsoft) takvim seçeneği ürün sahibinin 29.09.2026 kararıyla **kaldırıldı**. Takvim bağlantısı bugün hiç veri yazmıyor (Google anahtarı tanımlı değil).
  - _Kanıt:_ `15313bc6` (`src/lib/calendar/outlook.ts` silindi, sağlayıcı listesinden çıktı), `4dc067ef` (ekran metni). Kart TASK-MUMMIHYY2F4KB `done`. `src` altında Outlook yalnız "kaldırıldı" yorumlarında ve testte geçiyor.
- **Kurumsal tek oturum açma (SSO / SAML) yok.** Ürünün yönetim ekranında bir SSO ayar formu vardı, ama kaydedilen ayar girişte hiç kullanılmıyordu. Ürün sahibi 29.09.2026'da bu ayarı tamamen kaldırdı. Giriş yalnız Google.
  - _Kanıt:_ `9a9aa6ef`'te ayar `Tenant.settings.sso` JSON alanına yazılıyor (`src/lib/sso.ts:80`, `prisma.tenant.update`; `:49-59` fonksiyonun başı ve alan adı kontrolü); okuyan `resolveSsoProviderForDomain` (`sso.ts:133`) yalnız testlerde çağrılıyor (`git grep resolveSsoProviderForDomain` → `sso.ts`, `sso.test.ts`, `tests/billing-iyzico-sso.test.ts`). `0fdbcb8d` ile form, action, `sso.ts` ve testleri silindi; `src` altında `sso`/`saml` 0 geçiş. Kart TASK-MUML0QZAZ5M80 `done`.

### 2.1 Belgelerde "henüz yok" yazan ama artık kodda olanlar

Önceki taslaklarda (özellikle `docs/legal/agency-channel-notice-addendum.md`) aşağıdaki iki özellik "henüz kodda yok" diye yazılıydı. **Bugün ikisi de kodda.** Sorular buna göre yazıldı. Ek taslağının güncellenmesi ayrı bir iştir (§8).

1. **Aylık bölge raporu (B3) kodda.** Her ayın 1'inde sabah, her ajans için bir önceki ayın sayıları bir kez "fotoğraflanır" ve saklanır. Ajans bu raporu panosundan **yazdırılabilir sayfa (PDF olarak kaydedilebilir) ve CSV dosyası** olarak indirir. E-postayla **gönderilmez**. Raporda panoda olmayan bir sayı yoktur; aynı gizleme kurallarından geçer. Rapor ajansın kendi kayıt alanında süresiz durur (silme kuralı yok).
   - _Kanıt:_ `src/lib/agency/report.ts` (dosya başı yorumu), `src/lib/inngest/jobs/agency-monthly-report.ts:26` (`cron: '0 6 1 * *'`, "No e-mail: the agency downloads it"), `src/app/api/agency/reports/[id]/route.ts` (indirme). Commit `d091cf72`.
2. **Kayıt ekranında onay kutusu ve ajans eki kısa metni kodda.** Davet koduyla kayıt olan kişi, Google düğmesinden önce ajans ekinin **kısa bir özetini** görür ve tek bir kutuyla şunu onaylar: aydınlatma metnini ve ajans ekini okudum, kullanım koşullarını kabul ediyorum. Bu onay, belge sürümüyle birlikte bir onay kaydına yazılır (`agency-channel-addendum`, sürüm `2026-09-29.1`). **Ekin tam metni yayında değildir.** Kutudaki "Ajans Kanalı Aydınlatma Eki" bağlantısı aynı sayfadaki kısa özete gider.
   - _Kanıt:_ `src/lib/legal/consent-documents.ts:95` (`AGENCY_CHANNEL_ADDENDUM`, tür `DISCLOSURE_ACK`), `messages/tr.json` → `Auth.agencyInvite`, `Auth.disclosureAckAgency`; `src/app/[locale]/login/AuthCard.tsx:376` (`agency-channel-notice`). Commit `9fbc81f8`.

### 2.2 Kayıt ekranındaki kısa metin, ajansın gördüğünün bir kısmını söylüyor

Davet koduyla kayıtta gösterilen kısa metin ("Ajans ne görür?") bugün şunu söyler: _"Kodlarıyla kayıt olan kurumların toplu sayıları: kaç kurum kayıt oldu, kaç kurum bir çağrıyı takibe aldı, kaç kurum başvurusunu gönderildi olarak işaretledi. 5'ten az olan sayılar gösterilmez."_

Ajansın gerçekte gördüğü bundan geniştir. Metinde şunlar **yok**:

- karne sonucunu hesabına ekleyen kurum sayısı, kayıtlı arama oluşturan ve konsept not üreten kurum sayısı, başvurusu kabul ya da red alan kurum sayısı;
- sayıların **kurum türüne** ya da **tek bir ile** göre kırılımı;
- sayıların 5'in katına yuvarlanması;
- aylık raporun **indirilebilir dosya** olarak ajansta kalması.

"Ajans neyi görmez?" kısmı ise doğrudur (ad, e-posta, kurum adı, karne cevapları, konsept notlar, belgeler, fatura bilgileri gitmez). Bu fark HUKUK-10 sorusunun konusudur (§4.5).

_Kanıt:_ `messages/tr.json` → `Auth.agencyInvite.sees` ve `notSees`; ajansın gördüğü adımlar `src/lib/agency/funnel.ts:75` (`FUNNEL_STEPS`: kayıt, karne, kayıtlı arama, takip, konsept not, gönderilen, kabul, red).

### 2.3 Kayıtta açılan kurum hesabının adı ve türü

Google ile kayıt olunduğunda kurum hesabı şöyle açılır:

- **Kurumun adı, kişinin adından türetilir:** Google hesabındaki ad "Ayşe Yılmaz" ise kurum hesabının adı **"Ayşe Yılmaz Organization"** olur. Ürün içinde bu adı değiştirecek bir ekran bugün **yok**.
- **Kurum türü her zaman "KOBİ"dir.** Belediye de kayıt olsa hesap KOBİ türünde açılır. Karnede seçilen kurum türü hesabın türünü değiştirmez. Türü değiştirecek bir ekran da bugün **yok**.

Hukuki önemi şudur:

- Kurum adı bugün ajansa **gösterilmez** (HUKUK-4). Ama kurum hesabının adı, varsayılan olarak **bir gerçek kişinin adıdır**. "Kurum verisi" ile "kişi verisi" ayrımı (HUKUK-11) yalnız şahıs şirketleri için değil, bu varsayılan ad yüzünden **her kurum hesabı için** gündemdedir.
- Ajansa giden "kurum türü" kırılımı bugün fiilen tek bir grup (KOBİ) gösterir. Bu anonimliği azaltmaz (bütün kurumlar aynı grupta durur), ama ekteki "kurum türü" anlatımı gerçekle örtüşmüyor. Bu bir ürün hatası olarak ayrıca bildirildi (§8); sizden bir cevap beklemiyor. HUKUK-5 değerlendirmesinde tür kırılımı düzeltilince yeniden devreye gireceğini bilmeniz yeterlidir.

_Kanıt:_ `src/lib/oauth-registration.ts:225` (`name: \`${input.userName || 'My'} Organization\``) ve `:228` (`orgType: 'SME'`). Ürün içinde `Tenant` kaydını güncelleyen yerler yalnız il (`settings/profile/actions.ts:40`), ajans türü (`agency/actions.ts:59`) ve ortak marka (`agency/cobrand-store.ts:113`) alanıdır; ad ve tür için yoktur (`git grep "tenant.update" -- src`). (Sürüm 1.3: SSO alanı `0fdbcb8d` ile kaldırıldı, TASK-MUML0QZAZ5M80.)

### 2.4 Ana aydınlatma metni bu akışlardan hiç söz etmiyor

Sitedeki ana "Gizlilik Politikası ve KVKK Aydınlatma Metni" (`/tr/privacy`) bugün **ajans kanalından, kurumun ilinden ve karne sonucundan hiç söz etmez**. Oysa il sorusu ve karne kutusu, davet kodu **olmadan** kayıt olan herkese de gösterilir. Kodsuz kayıt olan kişi ajans ekini görmez. Bu yüzden HUKUK-11 ve HUKUK-12'nin "ana metne yazılmalı mı" kısmı önemlidir.

_Kanıt:_ `messages/tr.json` → `legal` altında "ajans", "kalkınma", "karne", "hazırlık" sözcükleri hiç geçmiyor (sayım: 0). İl alanı her kayıtta: `AuthCard.tsx:423` (`isRegistering && …`), `:445`.

---

## 3. Ana sorular

### 3.1 HUKUK-5 — Ajans panosundaki gizleme kuralları "anonim" demek için yeterli mi?

**Bağlam.** Ajans, kendi davet kodlarıyla kayıt olan kurumlar hakkında toplu sayılar görür. Biz bu sayıları **anonim veri** olarak kabul ediyoruz. Bu yüzden ajansı kişisel veri **alıcısı** saymıyoruz (HUKUK-2) ve ajansa aktarım için ayrı bir hukuki sebep aramıyoruz. Ama küçük bir sayı bir kurumu tanıtabilir. Örnek: pano "belediye · konsept not üreten: 1" derse ve ajans kodunu tek bir belediyeye verdiyse, bu sayı o belediyeyi gösterir. Kurum bir şahıs şirketiyse bu, bir **gerçek kişiyi** göstermek demektir. Aşağıdaki kurallar bunu önlemek için var. Kuralları ürün ekibi kendi seçti (ürün lideri kararı, 29.09.2026). Hiçbiri bir dış standarttan ya da Kurul kararından alınmadı.

**Bugünkü uygulama (kodda doğrulandı).**

1. **Eşik 5.** 5'ten küçük her sayı (0 dahil) gösterilmez, yerine "<5" yazılır. 0 da gizlenir, böylece "<5" "hiç yok" ile "birkaç tane"yi ayırt ettirmez.
2. **Tamamlayıcı gizleme.** Bir sayı, başka görünen sayılardan çıkarma yapılarak bulunabiliyorsa o da gizlenir. Üç yön korunur: toplam eksi görünen iller, toplam eksi görünen kurum türleri, bir adım eksi onun alt adımı (ör. "başvuru gönderen" eksi "kabul alan").
3. **Küçük grup hiçbir şey göstermez.** Kayıtlı kurum sayısı gizlenen bir grupta (bir il ya da bir tür) hiçbir adımın sayısı gösterilmez.
4. **İlini vermeyen kurumlar** ayrı bir grup olarak hiç gösterilmez.
5. **Tek kırılım.** Ajans bir seferde ya tek bir ilin sayısını ya da kurum türlerine göre dağılımı görür. "Samsun'daki belediyeler" gibi il × tür çapraz tablosu hiç üretilmez.
6. **5'e yuvarlama.** Gösterilen her sayı en yakın 5'in katına yuvarlanır ("5", gerçekte 5, 6 ya da 7 demektir). Bu yüzden parçaların toplamı toplamı tutmayabilir.
7. **Tek, birikimli dönem.** Sayılar, ajansın kodlarıyla bugüne kadar kayıt olmuş bütün kurumları kapsar. "Son 30 gün / son 90 gün" gibi dönem seçimi **yoktur**. Çünkü iki dönemin farkı, arada kayıt olan tek bir kurumu gösterebiliyordu.
8. **Davet kodu başına kullanım sayısı gösterilmez.** Kodların kullanım sınırı da kaldırıldı. Bir kodun "tükendi" diye görünmesi, kaç kez kullanıldığını ele veriyordu.
9. **Hesaplama sunucuda yapılır.** Tarayıcıya 5'ten küçük ya da kesin (yuvarlanmamış) bir sayı hiç gitmez.
10. **Otomatik "saldırgan" testi.** Her kod değişikliğinde bir test, bütün görünümleri birleştirip gizli bir 1-4 grubunu geri hesaplamaya çalışır. Hesaplayabilirse test kırmızı olur ve değişiklik kabul edilmez. 29.09.2026'da test geçti (4 test dosyası, 64 test).
11. **Aylık rapor (yeni, §2.1).** Rapor, panonun aynı kurallardan geçmiş sayılarının aylık bir kopyasıdır. Bütün sayıları 5'ten gizlenmiş bir il, rapora hiç yazılmaz. Böylece hangi illerde birkaç kurum olduğu da anlaşılmaz.

**Açık kalan risk: zaman kanalı (bilerek kabul edildi, 29.09.2026).** Sayılar birikimlidir ve yalnız artar. Panoya sık bakan bir ajans, toplamın bir yuvarlama sınırını geçtiği anı yakalayabilir. Örneğin sayının "10"dan "15"e döndüğü an, gerçek sayının 13'e ulaştığını söyler. Kodu kime ve ne zaman verdiğini bilen bir ajans, bu anı kendi kod dağıtımıyla eşleştirip bir kaydı tahmin edebilir. Yuvarlama bu kanalı daraltır ama kapatmaz. Kapatmak için sayıların gecikmeyle ya da seyrek (ör. yalnız ay sonunda) güncellenmesi gerekir. Bu pilottan önce **yapılmıyor**.

**Aylık rapor bu kanalı etkiler.** Her ayın raporu indirilebilir bir dosya olarak ajansta kalır. Böylece ajansın elinde ay ay birikmiş, yuvarlanmış bir sayı dizisi olur. Bu, panoya sık bakmadan da ay ay artışı izlemeye yarar. Ama raporun sayıları yine yuvarlanmış ve gizlenmiştir. Dosya bir kez indirildikten sonra FonBridge'in denetiminden çıkar (ajans içinde ya da dışında paylaşılabilir).

**Soru.**

> **5a.** Yukarıdaki kuralların tamamı (eşik 5, tamamlayıcı gizleme, küçük grup kuralı, tek kırılım, 5'e yuvarlama, tek birikimli dönem), açık kalan zaman kanalıyla birlikte, ajansa giden sayıları KVKK md.3/1-b ve md.28/1-ç anlamında **anonim** saymak için yeterli mi? Kişisel Verileri Silme, Yok Etme veya Anonim Hale Getirme Rehberi'ndeki ölçütlere göre değerlendirmenizi rica ederiz.
>
> **5b.** Zaman kanalı pilotta **kabul edilebilir bir kalıntı risk** mi, yoksa pilottan önce kapatılmalı mı (gecikmeli ya da yalnız aylık güncellenen sayılar)?
>
> **5c.** Eşik 5 yeterli mi, daha yüksek mi olmalı (ör. 10)? Şahıs şirketi KOBİ'ler için ayrı bir eşik gerekir mi?
>
> **5d.** Aylık raporun **indirilebilir dosya** olması (ajansta süresiz kalması, paylaşılabilmesi) anonimlik değerlendirmenizi değiştirir mi?

**Cevaba göre ne değişir.**

| Cevap                                               | Ne değişir                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Yeterli** (5a evet, 5b kabul edilebilir)          | Pilot kapısı (d) kapanır. Ekteki "anonim" ifadesi ve HUKUK-2 varsayımı ("ajans alıcı değil") kalır. Envanter §18c'ye görüşünüzün tarihi ve dayanağı yazılır. Kod değişmez.                                                                                                                                               |
| **Yeterli ama zaman kanalı kapatılmalı** (5b hayır) | Pilottan önce kod işi: pano sayıları gecikmeli ya da yalnız ay sonunda güncellenir (ör. panoda yalnız son kapanmış ayın raporu gösterilir). Ürün ekibi bunu ayrı kart olarak açar. Pilot bu iş bitince başlar.                                                                                                           |
| **Eşik yükselmeli** (5c)                            | Tek sabit değişir (`SMALL_CELL_THRESHOLD`); yuvarlama da yeni eşiğin katına döner. Pano ve rapor aynı anda değişir. Küçük pilotta çoğu sayı "<10" görünür, bu da ajansın panodan alacağı faydayı azaltır; ürün sahibine bildirilir. Ek ve kayıt ekranı metnindeki "5" sayıları güncellenir, ek sürümü artar.             |
| **Yetersiz, veri kişisel sayılır** (5a hayır)       | HUKUK-2 varsayımı düşer: ajans kişisel veri **alıcısı** olur. Ajansa aktarım için KVKK md.8 dayanağı, ekte "aktarım" bölümü ve belki ajansla bir veri paylaşım sözleşmesi gerekir. Bu değişiklikler bitene kadar ajans panosu ve raporu pilotta **kapalı** tutulur (kod ile kapatılabilir). Pilotun ajans ayağı gecikir. |
| **Dosya olarak rapor sorunlu** (5d)                 | Rapor indirme kapatılır ya da rapor yalnız ekranda gösterilir. Saklama süresi konur (bugün süresiz). Ekte raporun dosya olarak verildiği açıkça yazılır.                                                                                                                                                                 |

_Kanıt:_ `src/lib/agency/funnel.ts:61` (`SMALL_CELL_THRESHOLD = 5`), `:168` (`roundToFive`), `:185` (`NO_PROVINCE`, hiç gösterilmez), `:269-356` (`suppressedCells`: tamamlayıcı gizleme, küçük grup kuralı), `:359` (`buildAgencyFunnel`: tek kırılım), `:453` (dönem yok: `agency_funnel_counts_by_province(NULL)`); `src/lib/agency/funnel.attack.test.ts` (saldırgan testi, CI'da `pnpm test`: `.github/workflows/ci.yml:116`); `src/lib/agency/report.ts:15-19` (bütün sayıları gizli il rapora yazılmaz); kod kullanım sınırı kaldırıldı: `prisma/migrations/agency-invite-no-max-uses.sql`. Test çıktısı: `docs/agent-results/TASK-MUMH7OISNJ5OV-cs-fb.md` §2. Ayrıntılı tarihçe: `agency-channel-notice-addendum.md` §3.1 ve "HUKUK-5 notu" paragrafları.

---

### 3.2 HUKUK-11 — Kurumun ili kişisel veri midir? Ana aydınlatma metnine yazılmalı mı?

**Bağlam.** Ajans, sayıları tek bir ile göre de görebilir (§3.1 madde 5). Bunun için kurumun ilini tutuyoruz. Ürün ekibi ili **kurum verisi, kişi verisi değil** diye sınıflandırdı (ürün lideri kararı, 29.09.2026; veritabanı açıklaması da böyle yazıyor). Ama:

- Kurum bir **şahıs şirketi** olan KOBİ ise il, o kişinin iş yerinin ilidir.
- Kurum hesabının adı varsayılan olarak **kişinin adıdır** (§2.3). Bu yüzden FonBridge'in veritabanında "Ayşe Yılmaz Organization — Samsun" gibi bir kayıt oluşur.

**Bugünkü uygulama (kodda doğrulandı).**

1. İl **isteğe bağlıdır**. Kayıt formunda "Kurumun ili (isteğe bağlı)" diye sorulur, "Seçilmedi" bırakılabilir. Değer yalnız 81 il adından biri olabilir (veritabanı bunu zorlar).
2. İl **her kayıtta** sorulur. Davet kodu olmayan kayıtta da sorulur. Kodsuz kayıt olan kurum hiçbir ajansın sayısına girmez, ama ili yine de saklanır.
3. İl sorusunun altındaki açıklama, **kodsuz kayıtta da** şunu der: _"Kalkınma ajansı raporlarında yalnızca il bazında sayı olarak kullanılır; sonradan kurum ayarlarından değiştirebilirsiniz."_
4. Fon hazırlık karnesinde il seçildiyse, kayıt formunda o il **önceden seçili** gelir. Kişi değiştirebilir ya da boşaltabilir.
5. Google ile kayıtta seçilen il, Google'a gidip dönerken 15 dakikalık, yalnız sunucunun okuyabildiği bir çerezde taşınır. Hesap açılırken okunur ve hemen silinir.
6. Kurum sahibi ya da yöneticisi ili sonradan **değiştirebilir ya da silebilir**. Her değişiklik kurumun kendi kayıt geçmişine yazılır: kim, eski il, yeni il.
7. İl ajansa **yalnız toplu sayının kırılımı** olarak, §3.1'deki bütün kurallarla gider. Hangi kurumun hangi ilde olduğu ajansa gitmez.
8. **Ana aydınlatma metni ilden hiç söz etmez** (§2.4). Yalnız ajans ekinin taslağı ilden söz eder, onu da yalnız davet koduyla gelen kişi görür (§2.1'deki kısa metinde il geçmez).

**Soru.**

> **11a.** Kurumun ili, kurum bir şahıs şirketi olduğunda kişisel veri midir? Kurum hesabının adının varsayılan olarak kişinin adı olması (§2.3) cevabınızı değiştirir mi?
>
> **11b.** İl her kayıtta (kodsuz da) sorulduğuna göre, ilin toplanması **ana aydınlatma metnine** yazılmalı mı? Yoksa kayıt formundaki açıklama satırı yeterli mi?
>
> **11c.** Kodsuz kayıtta il açıklaması "kalkınma ajansı raporlarında kullanılır" diyor, ama kodsuz kurum hiçbir ajans raporuna girmiyor. Bu açıklama kodsuz kayıtta yanıltıcı mı? Kodsuz kayıtta ili sormaya devam etmeli miyiz?
>
> **11d.** İl kişisel veri sayılırsa hukuki sebebi ve saklama süresi ne olmalı? (Bugün: kurum hesabı açık kaldığı sürece; kullanıcı silerse boşalır.)

**Cevaba göre ne değişir.**

| Cevap                                                           | Ne değişir                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kurum verisi, ana metne yazmak gerekmez**                     | Envanter satırı ve ek olduğu gibi kalır. Veritabanı açıklaması doğru kalır. Yalnız 11c için kayıt formu açıklaması kodsuz kayıtta düzeltilir (küçük metin işi).                                                                                                                                                              |
| **Şahıs şirketinde kişisel veri; ana metne yazılmalı**          | Ana aydınlatma metnine il (veri kategorisi, amaç, hukuki sebep, saklama) eklenir; bu, ana metin işinin (TASK-MTSWIFJKGTYC) bir parçası olur. Ek taslağındaki "kurum verisi" ifadesi ve veritabanı açıklaması değişir. Envanterde il için ayrı bir satır açılır. Ana metin sürümü artar; kayıttaki onay yeni sürüme bağlanır. |
| **Kodsuz kayıtta il sorulmamalı**                               | Kayıt formu il sorusunu yalnız davet koduyla kayıtta gösterir. Karneden gelen il önceden seçilmez. Küçük bir ön yüz işi; ajans sayıları etkilenmez.                                                                                                                                                                          |
| **Kurum hesabının varsayılan adı sorun** (11a'nın ikinci kısmı) | Kayıtta kurum adı kişinin adından türetilmez (ör. kayıtta kurum adı sorulur ya da nötr bir ad verilir) ve ürüne ad değiştirme ekranı eklenir. Bu, ayrıca bildirilen ürün hatasıyla (§8) birlikte ele alınır.                                                                                                                 |

_Kanıt:_ `src/lib/province.ts` (yalnız Türkiye, 81 il, geçersiz değer yok sayılır); `prisma/migrations/add-tenant-province.sql:35` (CHECK kısıtı), `:54` ("Organisation data, not personal data"); `src/app/[locale]/login/AuthCard.tsx:423-445` (il alanı her kayıtta); `messages/tr.json` → `Auth.provinceHint`; `src/lib/readiness/share.ts:15` (`il` parametresi); `src/lib/registration-province-cookie.ts` (15 dk, httpOnly); `src/lib/auth.ts:126-135` (tek kullanım, `15f70b0d`); `src/app/[locale]/(app)/[workspace]/settings/profile/actions.ts:26` (yalnız sahip/yönetici), `:45` (`tenant.province.updated`); envanter `processing-register.md` §18c ve madde 12.

---

### 3.3 HUKUK-12 — Karne sonucunu hesaba ekleme: rıza mı, ana metin mi, ayrı envanter satırı mı?

**Bağlam.** Fon hazırlık karnesini dolduran kişi kayıt olursa, karne sonucunu yeni kurum hesabına ekleyebilir. Sonuç kurumun panosunda "Hazırlık durumu" kartında görünür. Ajans yalnız "karne sonucunu hesabına ekleyen kurum sayısı"nı görür. Cevaplar ve puan ajansa gitmez.

Karne cevapları kurumun kendi hazırlık değerlendirmesidir (ör. "AB projesi deneyiminiz var mı?"). Kişi adı ya da e-posta taşımaz. Ama şahıs şirketinde bu cevaplar bir kişinin işine dair beyanlardır.

**Bugünkü uygulama (kodda doğrulandı).**

1. **Kayıt olmadan doldurulan karne hiçbir yere kaydedilmez.** Sonuç yalnız tarayıcının adres satırındaki bağlantıda durur.
   - **İstisna — ürün analitiği (PostHog), bugün kapalı.** PostHog anahtarı girilirse **ve** ziyaretçi çerez bandında "Tümünü Kabul Et" derse, karne sayfası üç olay gönderir: teste başlama (kurum türü), testi tamamlama (kurum türü, puan, seviye) ve kayda tıklama (kurum türü, seviye). **Cevaplar, il, ad, e-posta, kurum adı ve sayfa adresi gönderilmez.** Olay, tarayıcıda rastgele üretilen ve saklanan anonim bir kimlikle gider; kişi profili ve IP'den konum çıkarma kapalıdır. Varsayılan sunucu PostHog'un AB bölgesidir. "Gerekli Çerezler" seçilirse ya da bant yanıtlanmazsa hiçbir şey gönderilmez. Bugün anahtar girilmediği için hiçbir olay gitmiyor. Envanterde §19a.
2. Karneden kayda giden bağlantı sonucu taşır (`karne=<kurum türü>.<15 cevap>`). Kayıt formunda **"Karne sonucumu hesabıma ekle"** kutusu görünür. Kutu **varsayılan olarak işaretsizdir**. İşaretlenmezse hiçbir şey kaydedilmez.
3. Kutunun altında kısa bir açıklama var. Davet koduyla kayıtta: _"İşaretlerseniz yanıtlarınız kurum hesabınıza kaydedilir ve panonuzda görünür; davet eden kalkınma ajansı bunu yalnızca toplu sayı olarak görür. İşaretlemezseniz hiçbir yanıt kaydedilmez."_ Kodsuz kayıtta ajans cümlesi çıkarılır.
4. Kutu, **kodlu ya da kodsuz her kayıtta** çıkar. Kodsuz kayıt olan kişi ajans ekini görmez.
5. Sonuç **yalnız yeni açılan kurum hesabına**, kayıtla aynı anda yazılır. Var olan bir hesaba girişte ya da karne sonradan yeniden yapılınca hesaptaki sonuç değişmez.
6. **Saklanan:** kurum türü, 15 cevap ve eklenme zamanı (kurum hesabının ayar alanında). Puan saklanmaz, her açılışta cevaplardan yeniden hesaplanır.
7. Google ile kayıtta sonuç, yalnız kutu işaretliyse, 15 dakikalık ve yalnız sunucunun okuyabildiği bir çerezde taşınır. Okunur okunmaz silinir.
8. **Saklama:** kurum hesabı açık kaldıkça durur. Ürün içinden **silme yoktur**.
9. Sunucu, cevapların karnede gerçekten verildiğini doğrulamaz. Bağlantı elle değiştirilirse ve biçimi doğruysa kabul edilir. Sonuç kurumun kendi beyanıdır.
10. **Açık risk:** Sonuç kayıt sayfasının adresinde (`karne=…`) taşındığı için, barındırma sağlayıcısının erişim kayıtlarına da yazılabilir.
11. Kutunun **kaydı tutulmaz.** Aydınlatma metni için bir onay kaydı (belge ve sürüm) yazılır, ama "karne kutusu işaretlendi" diye ayrı bir onay kaydı yazılmaz. Kutunun işaretlendiğinin tek izi, hesapta karne sonucunun durmasıdır.
12. **Ana aydınlatma metni karneden hiç söz etmez** (§2.4).

**Bizim bugünkü varsayımımız.** Kayıt formundaki aydınlatma kutusu **rıza değil**, "okudum" teyididir. Hesap açma sözleşmeye dayanır (envanter §1 ve §18b kuralı). Karne kutusu bundan **ayrı** bir kutudur. Biz onu da rıza olarak kurmadık: kullanıcının kendi eylemi (kendi verisini kendi hesabına eklemesi) olarak düşündük. Bu yüzden onay kaydı da yazılmıyor. Bu varsayımı teyit etmenizi istiyoruz.

**Soru.**

> **12a.** "Karne sonucumu hesabıma ekle" kutusu hukuken **açık rıza** mıdır (KVKK md.5/1)? Yoksa aydınlatmaya dayanan, kullanıcının kendi hesabına kendi beyanını eklemesi midir (ör. md.5/2-c sözleşmenin ifası ya da md.5/2-f meşru menfaat)?
>
> **12b.** Bu işleme **ana aydınlatma metnine** mi yazılmalı (kutu kodsuz kayıtta da çıkıyor), yoksa **envanterde ayrı bir satır** (bugün ajans kanalı satırı §18c'nin bir maddesi) ve kutunun altındaki açıklama yeterli mi? İkisi birden mi gerekir?
>
> **12c.** Karne cevaplarının saklama süresi ne olmalı? Kurumun bu sonucu ürün içinden silebilmesi gerekir mi?
>
> **12d.** Karne sonucunun kayıt sayfası adresinde taşınması (erişim kayıtlarına düşebilmesi) bir önlem gerektirir mi?
>
> **12e.** Madde 1'deki analitik olayı (kurum türü, puan, seviye; anonim kimlikle, çerez onayına bağlı) kişisel veri sayılır mı? Çerez bandındaki onay bu işleme için yeterli bir dayanak mı?

**Cevaba göre ne değişir.**

| Cevap                                                     | Ne değişir                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rıza değil, kullanıcının kendi eylemi** (12a)           | Kutu ve metni olduğu gibi kalır. Envantere hukuki sebep ve görüşünüzün tarihi yazılır. Onay kaydı gerekmez.                                                                                                                                                                                                                                                              |
| **Açık rızadır** (12a)                                    | Kutu metni rıza metni olarak yeniden yazılır (neye, hangi amaçla, nasıl geri alınır). Kutu için belge sürümüyle ayrı bir **onay kaydı** yazılır (yeni bir onay belgesi tanımı). Rızayı **geri alma** yolu gerekir: ürün içinden karne sonucunu silme (bugün yok). Rıza geri alınınca kurum ajansın "karne" adımından çıkar. Bu, pilottan önce yapılacak bir ürün işidir. |
| **Ana metne yazılmalı** (12b)                             | Ana aydınlatma metnine karne sonucu (kategori, amaç, hukuki sebep, saklama) eklenir; ana metin işine (TASK-MTSWIFJKGTYC) girer, sürüm artar.                                                                                                                                                                                                                             |
| **Envanterde ayrı satır yeterli** (12b)                   | Karne, §18c'nin bir maddesi olmaktan çıkar, kendi satırını alır (kodsuz kayıt da kapsanır). Ek taslağındaki "ana metin sorusu" notu kapanır.                                                                                                                                                                                                                             |
| **Saklama süresi ve silme gerekli** (12c)                 | Envantere süre yazılır. Ürüne "karne sonucunu kaldır" düğmesi eklenir (kurum panosundaki kartta). Süre dolunca silme için zamanlanmış bir iş gerekebilir.                                                                                                                                                                                                                |
| **Adreste taşıma sorunlu** (12d)                          | Sonuç adres yerine form içinde taşınır ya da barındırma erişim kayıtlarında sorgu dizesi maskelenir.                                                                                                                                                                                                                                                                     |
| **Analitik olayı kişisel veri ya da onay yetersiz** (12e) | PostHog anahtarı girilmez ya da karne olaylarından puan ve seviye çıkarılır. Çerez metni ve envanter §19a görüşünüze göre yeniden yazılır.                                                                                                                                                                                                                               |

_Kanıt:_ `src/lib/readiness/share.ts:100` (`karne` parametresi); `src/app/[locale]/login/AuthCard.tsx:129` (`useState(false)`, varsayılan işaretsiz), `:473-500`; `messages/tr.json` → `Auth.readinessImportHint`, `Auth.readinessImportHintNoCode`; `src/lib/readiness/account.ts` (saklanan alanlar, puan saklanmaz, `readinessSettings` yalnız yeni kiracıda); `src/lib/registration-readiness-cookie.ts:15-33` (15 dk, httpOnly); `src/lib/legal/consent-documents.ts:116-123` (onay belgeleri: aydınlatma, koşullar, ajans eki — karne kutusu yok); silme kodu yok (`TENANT_READINESS_KEY` yalnız yazılıyor ve okunuyor); envanter `processing-register.md` §18c (g). Analitik (madde 1 istisnası): `src/app/[locale]/fon-hazirlik/readiness-check.tsx:86`, `:113-117`, `:594-597` (üç `analytics.track` çağrısı; `province` gönderilmez); `src/lib/analytics.ts:28` (AB varsayılanı), `:88-98` (localStorage'da rastgele kimlik), `:101-115` (gönderilen gövde, `$process_person_profile:false`, `$geoip_disable:true`), `:119-122` (anahtar + onay kapısı); `src/lib/cookie-consent.ts:14-25` (yalnız "Tümünü Kabul Et"); envanter `processing-register.md` §19a.

---

## 4. Ajans kanalıyla ilgili öteki açık sorular

Bu sorular ajans eki taslağında (`agency-channel-notice-addendum.md` §7) zaten var. Burada bugünkü koda göre güncellendi.

### 4.1 HUKUK-1 — Veri sorumlusunun kimliği ve başvuru kanalı

**Bugün.** Ölçülen aday unvan `FonBridge Ltd. Şti.` (`docs/EFATURA_SETUP.md:38`). MERSİS numarası, merkez adresi, KEP adresi ve kanonik başvuru e-postası repoda yok. Dört ayrı alan adı kullanılıyor (`privacy-notice-gap-analysis.md` §4.2).

> **Soru.** Aydınlatma metinlerine yazılacak tam unvan, MERSİS, adres, KEP ve başvuru e-postası nedir? VERBİS kaydı gerekiyor mu?

**Cevaba göre ne değişir.** Ana metin, ajans eki (TR + EN) ve başvuru kanalı aynı kimlikle doldurulur. Bu cevap gelmeden hiçbir metin yayına giremez.

### 4.2 HUKUK-2 — Ajans "alıcı" mı, ortak veri sorumlusu mu?

**Bugün.** Ajansı, yalnız anonim toplu sayı gördüğü için kişisel veri **alıcısı saymıyoruz**. Bu varsayım tamamen HUKUK-5'e bağlıdır. Öte yandan ajans kodları kendisi üretir ve dağıtır, kodları iptal eder, son tarihlerini belirler. Kullanılamayan bir kod denendiğinde ajansın kendi kayıt alanına denemenin nedeni ve zamanı yazılır (deneyen kişinin bilgisi yok; bugün hiçbir ekranda gösterilmez). Ajans aylık raporu indirir.

> **Soru.** Ajans (a) alıcı mıdır, (b) ortak veri sorumlusu olabilir mi (kanalı yöneten, kodu dağıtan taraf olarak), (c) ikisi de değil mi?

**Cevaba göre ne değişir.** (c) ise bugünkü metin kalır. (a) ise ekte aktarım bölümü ve md.8 dayanağı gerekir. (b) ise ajansla ortak sorumluluk düzenlemesi (sözleşme) gerekir ve pilot başlamadan OKA ile konuşulur.

### 4.3 HUKUK-3 — Ajans bağının ve sayıların hukuki sebebi

**Bugün.** Kurum hesabına ajansın kimliği yazılır (bir kez, kayıtta). Kurumun kayıt geçmişine "kodla kayıt" olayı yazılır. Sayılar FonBridge'in veritabanında hesaplanır, sonra gizlenip ajansa gösterilir. Taslak önerimiz KVKK md.5/2-f (meşru menfaat). Alternatif md.5/2-c (sözleşmenin ifası). Kayıt ekranındaki kutu **rıza değil**, aydınlatma teyidi olarak kuruldu.

> **Soru.** Hangi hukuki sebep? Meşru menfaat seçilirse dengeleme testi belgesi gerekir mi?

**Cevaba göre ne değişir.** Ek madde 5 ve envanter §18c doldurulur. Rıza gerektiğini söylerseniz kayıt kutusu rıza metnine çevrilir, rızayı geri alma yolu (ajans bağını kaldırma, bugün ürün içinde yok) pilottan önce yapılmalıdır.

### 4.4 HUKUK-6 — Aylık bölge raporu ekte nasıl anlatılmalı?

**Bugün (değişti, §2.1).** Rapor artık kodda. E-postayla **gönderilmiyor**. Ajans panodan PDF ya da CSV olarak **indiriyor**. Rapor ajansın kayıt alanında süresiz saklanıyor. Eski soru "rapor e-postayla giderse" idi; bugünkü durumda yurt dışı e-posta sağlayıcısı devreye girmiyor.

> **Soru.** Ajansa dosya olarak verilen aylık rapor ekte ayrıca anlatılmalı mı? Raporların saklama süresi ne olmalı? (5d ile birlikte düşünülebilir.)

**Cevaba göre ne değişir.** Ek madde 6 ve 8'e rapor cümlesi eklenir, ek sürümü artar. Saklama süresi gerekiyorsa eski raporları silen zamanlanmış bir iş yapılır.

### 4.5 HUKUK-10 — Ajans eki ayrı belge mi? Kısa metin yeterli mi?

**Bugün (değişti, §2.1-§2.2).** Ek ayrı bir belge olarak tanımlandı ve kayıtta onayı sürümüyle kaydediliyor. Ama **tam metin yayında değil**, kişi yalnız kısa özeti görüyor. Kısa özet, ajansın gördüğünün yalnız bir kısmını sayıyor (§2.2). Var olan bir hesap davet koduyla ajansa **bağlanamıyor**; bağ yalnız yeni kayıtta kuruluyor.

> **Soru.** (a) Ek ayrı belge olarak mı kalmalı, ana metnin bir bölümü mü olmalı? (b) Tam metin yayınlanmadan, kayıt ekranındaki kısa özet aydınlatma yükümlülüğünü karşılar mı? (c) Kısa özet ajansın gördüğü **her** sayı türünü, kırılımı ve raporu saymak zorunda mı?

**Cevaba göre ne değişir.** (b) hayır ise pilot kodlu kayıttan önce tam ek sayfası (`/tr/privacy/agency-channel`) yayına alınır ve kutudaki bağlantı ona döner (onay sürümü artar). (c) evet ise kısa özet genişletilir. Özet her değiştiğinde onay sürümü artar.

### 4.6 HUKUK-4 — Kurum adı ileride ajansa gösterilirse

**Bugün.** Kurum adı ajansa **gösterilmiyor**. Ama kurum hesabının adı varsayılan olarak kişinin adından türüyor (§2.3).

> **Soru.** Ajans ileride kurum adını görmek isterse (OKA görüşmesindeki S4 sorusu) ne gerekir? Kurum adının bugünkü varsayılan hâli (kişi adı + "Organization") bu değerlendirmeyi değiştirir mi?

**Cevaba göre ne değişir.** Bugün kod değişmez. Kurum adı gösterilecekse ek yeniden yazılır ve ayrı bir hukuki sebep / aydınlatma kurulur.

### 4.7 HUKUK-7 ve HUKUK-8 — Ajans bağını kaldırma

**Bugün.** Ajans bağını ürün içinden kaldırma **yok**. Ek taslağı "kurum yöneticisi başvurursa FonBridge bağı elle kaldırır" diyor, ama bunun için yazılı bir iç süreç de yok. Bağ kaldırılırsa kurum artık sayılmaz. Ajansın daha önce indirdiği raporlar ise onun elinde kalır.

> **Soru.** **HUKUK-7:** Bağ kaldırıldıktan sonra bağ kaydı ne kadar saklanmalı? **HUKUK-8:** Bağı kaldırma bir md.11 hakkı olarak mı, sözleşmesel bir seçenek olarak mı anlatılmalı? Geçmiş sayılar ve indirilmiş raporlar için ne denmeli?

**Cevaba göre ne değişir.** Ek madde 9-10 doldurulur. md.11 hakkı ise kaldırma talebine 30 gün içinde cevap veren bir iç süreç yazılır; ürün içi kaldırma özelliği önceliklenir.

### 4.8 HUKUK-9 — İngilizce metin

**Bugün.** Ek taslağının İngilizce sürümü (GDPR art.13 karşılığı) var. Pilot yalnız Türkçe.

> **Soru.** İngilizce metinde GDPR nedeniyle farklı yazılması gereken bir madde var mı (ör. hukuki sebep, AB temsilcisi, şikâyet mercii)?

**Cevaba göre ne değişir.** Yalnız İngilizce metin. Pilotu engellemez.

---

## 5. Ana aydınlatma metni için açık alanlar (özet)

Ana aydınlatma metnini hukuk ekibinin yazması bekleniyor (TASK-MTSWIFJKGTYC). Boş alanların tam listesi ve her birinde sizden ne istendiği `docs/legal/privacy-notice-gap-analysis.md` §6'da. Burada yalnız başlıkları tekrar ediyoruz. Yukarıdaki üç ana soru (il, karne, ajans) bu metne de dokunuyor (§2.4).

1. **Veri sorumlusu:** unvan, MERSİS, VKN, adres, KEP, başvuru e-postası, temsilci; AB temsilcisi ve DPO gerekli mi (GDPR art.27/37).
2. **Kapsam:** envanterdeki 18 faaliyetin hangileri tek tek, hangileri kategori altında anlatılacak; TCKN/VKN için ayrı paragraf; YZ işlemesi için ayrı paragraf; üçüncü kişi (CRM muhatapları) için ayrı aydınlatma; çift onay kaydı beyan cümlesi.
3. **Alıcılar ve yurt dışı aktarım:** alıcılar adıyla mı kategoriyle mi; aktarım mekanizması (açık rıza mı, md.9 güvenceleri mi — repoda hiçbir alıcı için imzalı standart sözleşme yok); açık rıza seçilirse rızanın alınacağı ekran; her alıcı için amaç.

   **Sürüm 1.2 — liste daraldı (ürün sahibi kararı, 29.09.2026).** Ürün sahibi dört dış hizmeti üründen çıkardı. Aşağıdaki "çıkanlar" alıcı listesine **girmemeli**. O hizmetlerin anahtarları girilmeyecek. Sürüm 1.5 itibarıyla Microsoft, Sentry ve Resend kodu `dev` dalından çıktı. **Sürüm 1.6:** Inngest kodu da çıktı (`5ed2261a`); dört hizmetin hiçbiri kodda yok.

   _Kalanlar (alıcı listesine girmeli):_
   - **Google (giriş):** kullanıcı Google hesabıyla girer (OAuth). Tek giriş yolu budur.
   - **Anthropic (yapay zekâ metin üretimi):** kullanıcının YZ özelliklerine yazdığı ve seçtiği metinler.
   - **OpenAI (metin vektörü / "embedding"):** arama ve eşleştirme için belge metni sayısal vektöre çevrilir. Ürün sahibi 29.09'da bu hizmette **OpenAI'da kalma** kararı verdi.
   - **Cloudflare R2 (dosya depolama):** yüklenen dosyalar ve geri bildirim ekran görüntüleri. Pilotta isteğe bağlı.
   - **PostHog (ürün analitiği), bugün kapalı:** anahtar girilirse, yalnız çerez onayı veren ziyaretçinin anonim olayları gider (§3.3 madde 1). Varsayılan AB bölgesi; ABD bölgesi seçilirse yurt dışı aktarım olur. DPA imzalı değil.

   _Çıkanlar (alıcı olmayacak):_
   - **Microsoft (giriş):** Microsoft ile giriş kaldırıldı (§2.0). Kodda kaldırıldı (`acc35b07`, TASK-MUMLFLB2OPLY3).
   - **Microsoft (Outlook takvimi):** sürüm 1.3 — takvim bağlantısında Outlook seçeneği kaldırıldı; takvim yalnız Google (§2.0). Kodda kaldırıldı (`15313bc6`, TASK-MUMMIHYY2F4KB). Böylece Microsoft hiçbir amaçla alıcı değildir.
   - **Sentry (hata iletimi):** hata kayıtları yalnız kendi veritabanımızdaki sistem uyarıları tablosunda tutulacak, dışarı gönderilmeyecek. Sürüm 1.1'deki Sentry açıklaması geçersizdir. Gönderen kod `89eab729` ile silindi (TASK-MUMLEUIQWSI59). **Sürüm 1.5:** kodda Sentry'ye giden hiçbir yol yoktur; envanter §19a ve §21 buna göre güncellendi.
   - **Resend (e-posta iletimi):** **Sürüm 1.9:** e-postalar kendi SMTP sunucumuzdan gider, gönderici `info@usfinbridge.com` (ürün sahibi kararı 29.09.2026). Ayrı bir e-posta firması yoktur; sunucu barındırma firmasında çalışır. Sunucunun kurulumu sürüyor (TASK-MUN2PKA5AG2IV). _(1.4–1.8'de sağlayıcı ve model açıktı; aşağıdaki cümleler o döneme aittir.)_ **Sürüm 1.4:** kodda kaldırıldı (`fe9fd31c`, TASK-MUMLF57HOYFSB). Hangi sağlayıcı olacağını ürün sahibi belirleyecek. Sağlayıcı belli olunca alıcı olarak yazılması gerekip gerekmediği aşağıdaki ek görüş sorusunun kapsamındadır. **Sürüm 1.6:** bu sağlayıcıdan geçen e-postalar arasında ekip daveti de var (envanter §2): davetlinin adresi, kurum adı ve giriş bağlantısı. Davetlinin henüz hesabı yoktur.
   - **Inngest (zamanlanmış işler):** zamanlanmış işler kendi iş kuyruğumuza taşınacak. Uygulama TASK-MUMLFDTNQ53VJ'de sürüyor (önce teknik karar kaydı ve deneme). Sürüm 1.5'te Inngest kodu `dev` dalında hâlâ duruyordu. **Sürüm 1.6:** `5ed2261a` ile koddan çıktı (TASK-MUMT3PGX5OK8P, ADR-0008); işler kendi Postgres veritabanımızda çalışan iş kuyruğunda (graphile-worker) koşuyor.

   _Sizden istediğimiz ek görüş (sürüm 1.7'de yeniden yazıldı):_
   - **Barındırma:** uygulama, iş kuyruğu ve veritabanı bir barındırma firmasının sunucusunda çalışacak. Firma ve ülke **henüz belli değil**. Bütün kişisel veriler bu firmanın diskinde durur. Barındırma firmasını veri işleyen (ve yurt dışındaysa yurt dışı aktarım alıcısı) olarak yazmamız gerekir mi?
   - **E-posta (sürüm 1.9'da yeniden yazıldı; karar verildi):** E-postalar kendi kurduğumuz SMTP sunucusundan gider, gönderici `info@usfinbridge.com`. Bu sunucu yukarıdaki barındırma firmasında çalışır; ayrı bir e-posta firması yoktur. E-postada davetlinin adresi ve giriş bağlantısı vardır. Alıcının posta kutusu firması (ör. Gmail) e-postayı görür; bunu alıcının kendisi seçer. Sorumuz: Bu durumda e-posta için ayrı bir veri işleyen yazmamız gerekmediğini, barındırma firmasının sözleşmesinin yeterli olduğunu doğrular mısınız? Aydınlatma metninde e-posta için hangi cümle gerekir? _(1.7–1.8'deki iki seçenekli soru geçersizdir.)_

   - _Kanıt:_ karar: patron anahtar kartı TASK-MULQM3LFB4KRA (29.09'da yalnız Anthropic + OpenAI + Google izin ekranı adıyla daraltıldı). PostHog: `src/lib/analytics.ts:28`, `:119-122`. Sentry gönderici dosyası `src/lib/observability/sentry.ts` ve `SENTRY_DSN` `89eab729`'da silindi. `89eab729`'da Resend (`src/lib/email/resend-mailer.ts`), Inngest (`src/lib/inngest/`) ve Microsoft (`src/lib/auth.ts:317`) kodu hâlâ duruyor; kaldırma yukarıdaki kartlarda sürüyor. **Sürüm 1.3:** Microsoft girişi `acc35b07`, Outlook takvimi `15313bc6` ile koddan çıktı; envanter §1, §11, §21 Microsoft satırları buna göre güncellendi. Envanterdeki alıcı satırları (`processing-register.md` §1, §17, §18, §19a, §21) kod değişince güncellenecek (§8 madde 6). **Sürüm 1.4:** Resend `fe9fd31c` ile koddan çıktı (`src/lib/email/mailer.ts`, nodemailer); envanter §17, §18, §21 Resend satırları güncellendi. **Sürüm 1.5:** `e4fb8d71`'de `git grep -il sentry -- src .env.example package.json` boş (yalnız eski migration dosyalarında kolon adı olarak geçer); envanter §19a ve §21 Sentry satırları güncellendi. **Sürüm 1.6:** `3bc74a7b`'de `git grep -il inngest -- src package.json .env.example` boş. **Sürüm 1.7 (`a40b6bf4`):** başarısız gönderim satırı `route.ts:276` (`actorId` yok), gönderim satırı `:136`; SMTP modeli `mailer.ts:5-7`, TLS `mailer.ts:89`, `.env.example:107-111`; barındırma adayları `docs/ARCHITECTURE.md:7,88`, `docs/SECURITY_COMPLIANCE.md:103`; haftalık özet `src/lib/feedback/digest.ts:11-19,100-101`; envanter §2, §14, §21, §22 md.15-17 güncellendi. 1.6'daki satır numaraları (`:254`, `:128-132`, `invitation-mail-policy.ts:30,39`) `fc763927` ile kaydı; güncelleri `:261`, `:133-137`, `:32,41`. Davet e-postası: `src/app/api/invitations/route.ts:254` (gönderim), `:128-132` (gönderim satırı, hedef = davet id'si), `src/lib/email/invitation-mail-policy.ts:30,39` (10 dakika, günde 50); envanter §2 ve §21 güncellendi. **Sürüm 1.9:** SMTP ayarları yalnız ortamdan (`SMTP_*`, `src/lib/email/mailer.ts:6-11`, `:63-71`); gönderici `SMTP_FROM` ya da `NEXT_PUBLIC_SMTP_FROM_ADDRESS` ile verilir. Koddaki varsayılan `noreply@usfinbridge.com`'dur (`src/lib/env.ts:98`); karar `info@usfinbridge.com` olduğu için kurulumda bu değer verilmelidir (TASK-MUN2PKA5AG2IV).

4. **Toplama yöntemi ve hukuki sebep:** her amaç için sebep (envanterde beş ayrı sebep kullanılıyor); meşru menfaat için dengeleme testi (sekiz faaliyet md.5/2-f'ye dayanıyor); çerez aydınlatması ayrı belge mi.
5. **Haklar:** md.11 bentlerinin tam listesi; otomatik analiz (md.11/g) için ürüne özel açıklama (YZ ön değerlendirme puanı); başvuru usulü; hesabı olmayan kişi için kanal; Kurul'a şikâyet cümlesi.
6. **Saklama:** her kategori için süre (beş kalem açık: VKN/TCKN, belgeler, denetim kayıtları, geri bildirim, onay kaydı; **1.7:** altıncı kalem — kullanılmayan ekip davetinde davetlinin e-posta adresi süresiz kalıyor, silen iş yok; **1.8:** altıncı kalem kodda çözüldü — davet satırı kabulden ya da bağlantının süresinin bitmesinden 30 gün sonra siliniyor (`4a100e41`, envanter §2). Sizden istediğimiz: 30 gün uygun mu, daha kısa mı olmalı?); saklama ve imha politikası ayrı belge mi.
7. **Sürüm:** sürüm ve yürürlük tarihi; değişiklik bildirim usulü.

---

## 6. KVKK dışı açık sorular (başka uzman gerekebilir)

Bu sorular veri koruma konusu değil. Aynı danışmana ya da kamu ihale / idare hukuku uzmanına gidebilir. Pilotu engellemez, çünkü pilot ücretsizdir (ADR-0007). Ücretli kamu satışından önce cevaplanmalı.

| No         | Soru                                                                                                                              | Kaynak                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| OKA S1     | Bir kalkınma ajansının özel bir şirketten gelir payı alması hukuken mümkün mü?                                                    | `docs/kamu/OKA-KANAL-ONERISI.md` §8    |
| OKA S2     | OKA hangi satın alma usulüne tabi? Yıllık lisans nasıl alınır?                                                                    | `docs/kamu/OKA-KANAL-ONERISI.md` §8    |
| İlkadım S1 | 22/d doğrudan temin sınırı KDV hariç mi uygulanır? Aynı yıl içindeki 22/d alımlarının toplamı için idareye özgü bir tavan var mı? | `docs/kamu/ILKADIM-PILOT.md` (Sorular) |

---

## 7. Cevap tablosu

Cevaplarınızı buraya ya da ayrı bir yazıyla verebilirsiniz. Her cevapta dayandığınız mevzuat, rehber ya da Kurul kararı bizim için önemli: envantere o dayanakla yazacağız.

| No       | Cevap (kısa) | Dayanak | Tarih | Ürün ekibinin yapacağı iş (biz doldururuz) |
| -------- | ------------ | ------- | ----- | ------------------------------------------ |
| HUKUK-5  |              |         |       |                                            |
| HUKUK-11 |              |         |       |                                            |
| HUKUK-12 |              |         |       |                                            |
| HUKUK-1  |              |         |       |                                            |
| HUKUK-2  |              |         |       |                                            |
| HUKUK-3  |              |         |       |                                            |
| HUKUK-6  |              |         |       |                                            |
| HUKUK-10 |              |         |       |                                            |
| HUKUK-4  |              |         |       |                                            |
| HUKUK-7  |              |         |       |                                            |
| HUKUK-8  |              |         |       |                                            |
| HUKUK-9  |              |         |       |                                            |

---

## 8. Ürün ekibi için notlar (hukukçunun okuması gerekmez)

Bu paketi hazırlarken kodda, belgelerin söylediğinden farklı olan şunlar bulundu. Hukuk cevabını beklemeden düzeltilebilirler:

1. **Ek taslağı bayat.** `agency-channel-notice-addendum.md` §0, §2.2 ve §6 madde 5-6, B3 raporunun ve kayıt ekranındaki ek onayının "kodda olmadığını" söylüyor. İkisi de kodda (`d091cf72`, `9fbc81f8`). Envanter §18c de B3 raporunu (ajansın kayıt alanında saklanan aylık kopya) içermeli.
2. **Kurum türü her kayıtta "KOBİ".** `src/lib/oauth-registration.ts:228` Google ile açılan her kurumu `SME` yapıyor. Karnedeki tür kullanılmıyor, türü değiştiren bir ekran yok. Ajans panosunun "kurum türü" kırılımı üretimde anlamsız (her kurum KOBİ), belediye pilotunda belediye KOBİ görünür.
3. **Kurum adı kişinin adı.** `src/lib/oauth-registration.ts:225` kurum adını `<Google adı> Organization` yapıyor (İngilizce, Türkçe arayüzde de). Ad değiştirme ekranı yok.
4. **İl açıklaması kodsuz kayıtta yanlış yönlendiriyor.** `Auth.provinceHint` her kayıtta "kalkınma ajansı raporlarında kullanılır" diyor.
5. **Kayıt ekranı kısa metni eksik.** `Auth.agencyInvite.sees` ajansın gördüğü sekiz adımdan yalnız üçünü sayıyor; kırılım, yuvarlama ve rapordan söz etmiyor (§2.2).

6. **Envanter 29.09 kararlarının gerisindeydi; 1.5'te kapandı.** **Ölçüt:** envanter (`processing-register.md`) ve bu paket bir değişikliği, kodun `dev` dalına düştüğü commit ile işler; kartın panodaki durumu (`review`, `done`) ölçüt değildir. Bu ölçüte göre: Microsoft girişi (`acc35b07`, §1, §21), Outlook takvimi (`15313bc6`, §11, §21) ve SSO (`0fdbcb8d`, §1) 1.3'te; Resend (`fe9fd31c`, §17, §18, §21) 1.4'te; Sentry (`89eab729`, §19a, §21) 1.5'te işlendi. **1.6:** davet e-postası (`fe9fd31c`, sınırı `1c6b3e70`; §2, §21) 1.4'te işlenmeliydi, gözden kaçmıştı (İNCELEME-26 Y-1); 1.6'da işlendi. Inngest (`5ed2261a`; envanterdeki iş dosyası yolları) 1.6'da işlendi. **1.7:** İNCELEME-28 düzeltmeleri kod değişikliği değildir; eksik yazılmış olgular (`email_failed` satırı, barındırma sağlayıcısı, haftalık özet `feedback-weekly-digest`, davet saklama süresi) `a40b6bf4`'teki koda göre işlendi. Kod değişmeden "kaldırıldı" yazmak envanteri yanlış yapar; kod düştükten sonra "sürüyor" yazmak da.

Bu maddeler için ayrı kartlar açılmalı. Bu belgenin kapsamı yalnız soru paketidir.
