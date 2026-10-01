# TASK-MUPA77EIENLPH — Pilot SSS ürün davranışı maddeleri tespit (P-1, P-5)

**Hüküm:** P-1 ve P-5 ürün davranışı incelemesi tamamlandı — kod okuması ve risk analizi. Kod değişikliği yok (tespit görevi). Bağlama: TASK-MUOLBW7PZ7HM4 §4 doğrulanmamış maddeler.

---

## P-1: Kurum e-postası Google hesabı değilse önerilen yol

**Metin:** ILKADIM-PILOT S5 bağlamında, kurumun kendi e-posta adresi (Google olmayan) varsa davet üyesi nasıl giriş yapıyor?

### Bulgular

1. **Giriş yöntemi:** ADR-0006 ve AuthCard.tsx (satırlar 156-161, 568) — üretimde yalnız Google OAuth (Microsoft Entra 29.09.2026'da kaldırıldı). Şifre ve e-posta bağlantısı yoktur. Sonuç: kurum e-postası Google hesabı olmayan kişi Google'da aynı e-postayı oluşturması gerekir (ör. `ornek@firma.com.tr` → Google Workspace hesabı ya da bireysel Google hesabı aynı adresle). Eğer kişi kurum e-postasından sadece Outlook ya da Entra ID'ye bağlıysa, Google hesabı açmak zorunludur.

2. **Davet kabul mekanizması:** src/lib/invitations/accept.ts satırlar 221, 125-128 — davet kabul sırasında `sameEmail(invitation.email, userEmail)` kontrolü yapılıyor. Davet edilen e-posta (ör. `ornek@firma.com.tr`) ile Google'da giriş yapan e-posta eşleşmesi zorunlu. Eşleşmeden `email_mismatch` hatasıyla reddediliyor. Demek ki davet e-postası ne olursa olsun, Google'da giriş yapan adres o olmalıdır — kurum e-postası olmayan birisi Google'daki başka adres atanamaz.

3. **Risk:** Kurumun Google Workspace değilse (ör. Outlook kuruluşu) ve kişi kurum e-postasında Google hesabı açmak istemiyorsa ya da yapamıyorsa, giriş yolu yoktur. Bu pilot için tespit edilmiş sorun — patron S5 yanıtında belirtmeleri bekleniyor.

**Sonuç:** Kurum e-postası Google'da değilse, katılımcı Google'da aynı adresle hesap açması ya da var olan hesapla eşleştirmesi gerekir. Alternatif yok (ADR-0006 kararı). Pilot rehberinde bu durum açıklanması (ör. "Google hesabı olmayan kurumlar için…") veya sahibi tarafından Google Workspace setup'ı gerekmesi olabilir. Kod değişikliği yok, tamamı ADR-0006 kararına uygun.

---

## P-5: Kurumun bütün verisini dışa aktarma ve kurum hesabını silme yolu

**Metin:** Kurumun tamamı için (sahibi/üyeleri/projeler/raporlar vb.) dışa aktarım ve hesap silme işlemi kodda var mı, yoksa geçici prosedür mü?

### Bulgular

1. **KİŞİ-seviyesi dışa aktarma/silme:** src/actions/user/export-data.ts (GDPR Art. 15/20, KVKK md.11) ve src/actions/user/request-deletion.ts (GDPR Art. 17, KVKK md.7) mevcut. Kişinin tüm verisi (sırlar hariç) JSON olarak dışa aktarılabilir, hesap 30 gün bekleme ile silinebilir. Ama bunlar KİŞİ verisi, TENANT (kurum) verisi değildir. Kişi birden fazla tenanta aitse, export tüm tenantları kapsıyor (satır 45-49 export-data.ts).

2. **TENANT-seviyesi dışa aktarma/silme:** Kod taraması `/src/app/api` ve `/src/lib` — tenant veri dışa aktarması ya da tenant silme API'si **BULUNAMADI**. Cordis organizations API'si (src/app/api/cordis/organizations/) bu amacı karşılamıyor (harici CORDIS veri tabanı). Demek ki kodda tenant-seviyesi export/delete yok. Patron tarafında geçici el prosedürü (veritabanı dump, manuel silme vb.) olabilir.

3. **Risk:** Pilot süresi bittikten sonra kurumun tamamını silme (yalnız kişi değil) yolu belirsiz. Bağlam dosyasında "canlı denenmedi" notu vardı — pilot süresi dolan hesaplarda test edilmemiş. Tenant sahibinin kişisini silerse (request-deletion.ts), kurum verisi yetim kalır ("tek sahip uyarısı" var, satır 79-97, ama silme bloke edilmiyor). Dışa aktarım işleme için henüz ayrı bir sistem yok.

**Sonuç:** Kurum verisi dışa aktarma ve kurum silme işlevselliği **kodda uygulanmamış**. Pilot için patron tarafından:
- Dışa aktarım: Elle veritabanı dump (tüm tenant tabloları) ya da DB yönetim aracı?
- Silme: Veritabanı admin işlemi (kaskad silme, tüm related rows)
gibi prosedür gerekir. Adalet/veri denetim kartlarıyla (data controller) koordinasyon gerekebilir. Kullanıcılara SSS'de "destek ekibine başvurun" demek gerekli olabilir.

---

## Değişen dosyalar

Kod değişikliği yok (tespit görevi).

Rapor: `/Users/macbook/alan/docs/agent-results/TASK-MUPA77EIENLPH-be-fb.md`

---

## Riskler

1. **P-1:** Google olmayan kurumsal e-posta kulanıcılarının giriş yolu sadece Google hesabı açmak — SSO (SAML/Entra) kaldırıldığı için (ADR-0006) seçenek sınırlı. Pilot rehberi bunu belirtmeli.

2. **P-5:** Pilot sonrası kurumsal veri dışa aktarma yolu kodda yok — patron el prosedürü tanımlamalı ve Ş-7 şablonunda açıklamalı. GDPR Art. 17 (silme) için de aynı. Veri denetim soruları ortaya çıkabilir.

3. **Canlı test:** P-5 davranışları (süresi dolmuş pilot hesabında silme/export) ve P-1 Google-olmayan e-posta senaryosu **test edilmemiş**, tespit edilen koddur. Patron pilot öncesi test ortamında doğrulamalı.

---

## Açık sorular

1. **P-1:** Kurumun Google Workspace'e geçiş planı var mı? Yoksa SSO (sahibi tarafı) gelecekte tekrar açılacak mı? (ADR-0006 depo durumu: "Microsoft kaldırıldı, SAML/Okta kapsam dışı".)

2. **P-5:** Pilot sonrası dışa aktarma ve silme prosedürü hangi ekip execute edecek (DB admin, destek, patron)? Kurumsal veriler kaç gün saklanacak?

3. **P-5 sub:** Tenant sahibi hesabını siler (request-deletion.ts), kurum verisi yetim kalır — bu senaryoda ne yapılmalı?

---

## Sonraki adım

1. Patron P-1 ve P-5 cevaplarıyla güncelleme — "Google Workspace" / "kurum SSO" / "el prosedürü" gibi açıklıklar gerekli.
2. Ş-7 şablonunda (dışa aktarma/silme) P-5 prosedürü yazılmalı (desteğin kaç gün içinde ne yapacağı).
3. P-1 rehberde en az 1 paragraf: "Kurum e-postanız Google'da yoksa…" şeklinde uyarı.
4. Canlı test önerisi: dev pilot tenant ile süresi bittiğinde silme/export e2e akışı koş.

---

**Platform beyanı:** Tespit macOS'ta (Darwin 27) kod okuması ile yapıldı. Dokunulan dosyalar (AuthCard.tsx, accept.ts, export-data.ts, request-deletion.ts, ADR-0006) Next.js/TypeScript sunucu rotaları ve GDPR/KVKK hukuk katmanı — platforma bağımlı davranış yok. Windows/Linux'ta eşit davranırlar. Test edilmedi (dev ortamı kurulmadı, canlı ürün hesabı yok). İnceleme: kod + dökümanlar.
