---
sözleşme: 3
görev: TASK-MUPIQY1GFTRE2
kod: TASK-MUPIQY1GFTRE2
ajan: crw-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: DEĞİŞİKLİK İSTE — DPA 1.1 adı, tr/en eşleşmesi ve Ek-1 doğru; ama işleyen unvan/adres/VKN/MERSİS ve R2 konumu boş (Y-1), dil önceliği/uygulanacak hukuk yok (Y-2), md.28(3) unsurları eksik (Y-3).
platform: mac (Darwin 27.0): git grep/merge-tree, python ile tablo kontrolü ve kodu okuyarak doğruladım. İş yalnız markdown. Sayfa dosyayı path.join ile okuyor (page.tsx:50), bu yüzden platforma bağlı bir yol yok. Windows ve Linux'ta koşmadım, çünkü bu makinede yoklar ve gerek de yok.
sürüm: 1
tarih: 2026-10-01T15:28:25.775Z
---

# FB REVIEW 3 — DPA v1.1 (TASK-MUPIQY1GFTRE2, se-fb)

**İncelenen:** dal `se-fb/p6-dpa-signable` @ `81110bb1` (+`7cb38e1f`), `docs/legal/dpa-tr.md`, `docs/legal/dpa-en.md`. Yazar raporu `/Users/macbook/alan/docs/agent-results/TASK-MUPIQY1GFTRE2-se-fb.md`. Bu rapor repo dışında, git'te değil.

## 1. DoD kontrolü

| Madde | Sonuç | Kanıt (benim koşumum) |
|---|---|---|
| Şirket adı her yerde FonBridge mi | ✅ DPA içinde öyle. Ürünün başka yerlerinde kalıntı var (Ö-2) | `git grep -i -c fabrika se-fb/p6-dpa-signable -- docs/legal/dpa-*.md` → **0**. Aynı dalda `docs/legal` toplamı 45 satır: processing-register 35, privacy-notice-gap-analysis 9, agency-channel-notice-addendum 1. `src` 88 satır, çoğu yorum ya da tanımlayıcı. `messages` ve `public` 0 |
| tr/en madde madde eşleşme | ✅ | Her iki dosyada 14 `##` başlık ve 5 tablo var. Bütün tabloların sütun sayısı tutarlı. Ek-1 iki dilde 8 satır. Satır satır okudum: 1–12. maddeler ve 6.1–6.4 aynı içerikte |
| İmza blokları / doldurulacak alanlar | ⚠️ İki taraf için Ad Soyad, Unvan, Tarih ve İmza satırları var (`dpa-tr.md:96-101`). İşleyen tarafının şirket bilgileri boş | Y-1 |
| Kalan yer tutucu (`[..]`, TODO, XXX, `{{`) | ✅ Bu kalıplardan hiçbiri yok. ⚠️ İşleyen tarafında 5 boş alan kaldı | `git grep -E '\[\.\.|TODO|XXX|TBD|\{\{'` → yalnız `.....` imza alanları ve `Belirtilecek:` (:108) |
| Ek-1 ↔ koddaki gerçek entegrasyonlar | ✅ | Aşağıda §2 |

## 2. Alt işleyenler ↔ kod

Yöntem: `package.json` bağımlılıklarını ve `src` içindeki bütün `https://` hostlarını çıkardım, sonra her birini çağrıldığı yerde kontrol ettim.

| Ek-1 satırı | Benim kontrolüm |
|---|---|
| Vulut (TR) | `nodemailer` + kendi SMTP. Register :420'deki patron kararıyla aynı ✅ |
| Cloudflare R2 | `src/lib/storage.ts:22-23` `region: 'auto'`. Konumun boş bırakılması doğru ✅ |
| Anthropic | `src/lib/llm.ts:31` varsayılan sağlayıcı, `:287` `/v1/messages` ✅ |
| OpenAI | `llm.ts:692` `/v1/embeddings`. Gövde `{model, input: text, dimensions}`. Çağıran `rag.ts:233`, yani belge parçaları gidiyor ✅. `/v1/chat/completions` (`:327`) yalnız `provider:'openai'` verilirse çalışır, `src` içinde böyle bir çağrı yok. Ek-1'de "Kullanımda" demek ihtiyatlı bir seçim, hata değil |
| Stripe | `checkout/route.ts:340-358`: `client_reference_id: tenantId` ve metadata. `customer_email` gönderilmiyor ✅ |
| iyzico | `iyzico.ts:84-85` "phase 2, no live subscription", `:306-316` buyer alanları (ad, soyad, e-posta, kimlik no, adres, IP) ✅ |
| Google | `auth.ts:2,366` Google girişi. `calendar/sync.ts:108-109` başlık ve `content.slice(0,500)` ✅ |
| PostHog | `eu.i.posthog.com`. `us.i.posthog` yalnız bir testte geçiyor ✅ |
| (listede yok) `api.mymemory.translated.net` | `src/lib/translation.ts:95`. Tek çağıran `api/cagrilar/route.ts`, gönderdiği şey kamuya açık AB çağrı başlıkları. Kişisel veri gitmiyor, bu yüzden listede olmaması doğru ✅ |

Microsoft ya da başka bir LLM sağlayıcısı (Gemini, Mistral vb.) kodda yok. 6.3 ve 6.4 için verilen satır numaralarını da kontrol ettim, hepsi doğru: `users-scheduled-deletion.ts:121-124, 146-158, 160-179, 236`, `DEFAULT_GRACE_PERIOD_DAYS=30`. Kurum düzeyinde dışa aktarma ya da imha işi yok (`src/lib/jobs/tasks/` listesi). Bu, dev'deki ADR-0010 §1 ile aynı.

## 3. Bulgular

- **Y-1: İşleyen tarafı boş, metin bu haliyle imzaya gidemez.** Boş alanlar: `dpa-tr.md:20-23` (Ticari unvan, Adres, VKN, MERSİS) ve `:108` (R2 konumu "Belirtilecek"). en dosyasında aynı satırlar. Müşteri tarafının boş olması normal. İşleyen tarafı ise FonBridge'in kendi bilgisi ve gönderilmeden önce doldurulmalı. Yazar bunu doğru işaretlemiş (§6). Kapanması patronun bilgi vermesine bağlı, yazarın hatası değil. Ama kartın sorusu "imzalanabilir mi" ve cevap bugün **hayır**.
- **Y-2: İki dilli sözleşmede dil önceliği ve uygulanacak hukuk maddesi yok.** `grep -ci` sonuçları: tr'de "öncelik", "uygulanacak hukuk", "mahkeme" 0. en'de "prevail", "governing law", "court" 0. Üstelik iki metin §3'te farklı mevzuata dayanıyor: tr `:36-40` KVKK md.5, en `:36-40` GDPR art.6. İki metin birbirini tutmazsa hangisinin geçerli olacağı belli değil. Önerim: 13. madde olarak "metinler arasında çelişkide … geçerlidir; uygulanacak hukuk … ; yetkili mahkeme …" eklenmeli. Seçimi hukukçu yapar.
- **Y-3: GDPR md.28(3) asgari unsurları metinde yok** (müşteri AB'li olabilir; en metni GDPR'a atıf yapıyor). Eksik olanlar: (b) işleyen personelinin gizlilik yükümlülüğü ("confidential", "gizlilik yükümlülüğü" 0); (d)/md.28(4) alt işleyene aynı yükümlülüklerin yüklenmesi ve sorumlunun itiraz hakkı (7. madde yalnız bildirimden söz ediyor); (e)/(f) veri sahibi talepleri ve etki değerlendirmesinde sorumluya yardım ("assist", "yardım" 0); Ek-1'deki 4 ABD alt işleyeni için aktarım dayanağı (SCC/DPF, KVKK md.9). Yazarın hukukçu listesi (§3) yalnız sonuncusunu sayıyor. Diğer üçü hukukçu listesine eklenmeli. İçeriğini hukukçu belirler, ama eksik oldukları metinden tespit edilebiliyor.
- **Ö-1:** `:61` "müşteri verisi model eğitimi için kullanılmaz". Dayanak bugün yalnız sağlayıcıların ticari şartları. Bunu kendim curl ile doğruladım: Anthropic commercial terms "may not train models on Customer Content from Services", OpenAI "As of March 1, 2023 … not used to train … unless you explicitly opt in". İmzalı bir ek yok ve OpenAI `/v1/embeddings` için saklama süresi 30 gün. Metin dayanağı göstermiyor. `docs/SECURITY_COMPLIANCE.md:140`'taki "sözleşme ekinde, saklama sıfır" ifadesi de desteklenmiyor (TASK-MUPA6S5JGGG88 ile bağlantılı).
- **Ö-2: Ürün yüzünde eski ad kalıntıları** (DPA dışında, ayrı kart açılmalı):
  - Kullanıcının indirdiği dosyanın adı `fabrika-data-export-*`: `settings/privacy/client.tsx:52`, `api/gdpr/export/route.ts:18`, `api/user/export-data/route.ts:21`, `api/user/export/route.ts:17`
  - `docs.fabrika.app` bağlantısı: `admin/layout.tsx:136`, `components/UserMenu.tsx:574`
  - `fabrika.eu`: `[locale]/page.tsx:152`
  - `support@fabrika.dev` varsayılanı: `lib/beta/constants.ts:50-51`
  - Takvim `externalId` değeri `fabrika-brief-`: `calendar/sync.ts:112`
  - `processing-register.md` rolleri hâlâ "Fabrika" diyor (:3, :7 ve 33 satır daha). DPA §1 ile çelişiyor
- **Ö-3:** Sürüm geçmişinde iki ayrı "1.0" satırı var (`:9-10`). Dürüstçe yazılmış, ama hukukçunun dikkatine sunulmalı.
- **Ö-4:** İmza tablosunda Kaşe satırı yok. Türkiye'de tüzel kişi imzasında genelde bulunur.
- **Ö-5:** Dal dev'e alınmadı. `git merge-tree --write-tree dev se-fb/p6-dpa-signable` → çakışma yok. Yazar raporu `/Users/macbook/alan/docs/agent-results/` altında ve repoya kopyalanmalı.
- **Ö-6:** Yazarın Risk 1'i doğru: `Invoice` → `Tenant` `onDelete: Cascade`. ADR-0010 §1.1 de aynı tehlikeyi yazıyor.

## 4. Yazarın kanıtlarından bağımsız tekrarladıklarım

- Eski ad ve `{{` grep'i: 0, doğru.
- Tablo sütun tutarlılığı: python ile kontrol ettim, iki dosya da tutarlı.
- `MarkdownView` render'ını yeniden koşmadım. Tablo yapısını kendi python kontrolümle doğruladım. Görünüm farkı riski düşük, çünkü yalnız tablo satırları değişti.

## 5. Sonraki adım

1. Patron işleyen tarafının şirket bilgilerini ve R2 konumunu verir (Y-1).
2. se-fb 13. maddeyi (dil önceliği, hukuk, mahkeme) ve md.28(3) eksiklerini hukukçu listesine yazar. Hukukçunun cevabıyla v1.2 çıkar (Y-2, Y-3).
3. Ayrı kart açılır: ürün yüzündeki `fabrika` kalıntıları ve register rolleri (Ö-2).

Platform: mac. Kod değiştirmedim.
