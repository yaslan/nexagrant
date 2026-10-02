# AKTAR-MURBCJ0A-1 #privacy2 — Gizlilik metni tamamlandı: alıcılar, hukuki sebep tablosu, envanter ve boşluk analizi (explor-fb)

**Hüküm:** BAŞARILI, iki sınırla. (1) Hukuki sebep tablosu envanterin 23 satırının 19 faaliyetini kapsıyor; kalan 4'ü dışarıda bırakma gerekçeleri aşağıda tek tek yazılı. (2) iyzico alıcılar listesinden çıkarıldı, çünkü canlıda hiçbir kod yolu iyzico'yu çağırmıyor. Yurt dışı aktarımın hukuki dayanağı cümlesi ve posta/KEP adresi yazılmadı; ikisi de metinde yok (kanıt §2.6).
**Tip:** feature (hukuki metin / i18n + belge)
**Platform:** mac (macOS, Node v26.5.0, Chromium/Playwright, vitest 4.1.11). Değişen kod yalnız mesaj kataloğu (JSON) ve markdown; süreç, dosya yolu, kabuk ya da kısayol kodu yok, bu yüzden Windows/Linux davranışı farklı olamaz. Windows ve Linux'ta koşulmadı: bu kartta o ortamlar yok.
**Dal / ağaç:** `explor-fb/privacy-recipients` · `/Users/macbook/alan/FONBRIDGE-wt-explorfb-privacy` · push YOK
**Commit'ler:** `a29711b0` (önceki tur) · bu tur commit'i rapor dahil, SHA'sı §3'te

## 1) Ne yapıldı

1. **Rapor yazıldı** (önceki turda yoktu).
2. **PostHog:** envanterde PostHog bölümü zaten vardı (`docs/legal/processing-register.md` §19a, 29.09 tarihli); "eklenmemiş" tespiti eksik okumaydı. Yine de iki iş yapıldı: §19b eklendi (gönderilen 4 olay, üç koşul, gövdeye giren alanlar, uç adresi, hepsi dosya:satır ile) ve §19a madde (3) "çerez metni analitiği adıyla söylemeli" kapandı.
3. **Hukuki sebep tablosu 14 → 19 faaliyet.** Envanterdeki 23 "Hukuki sebep" satırının tam eşlemesi §2.2'de. Eklenenler: muhatap/ilişki kayıtları (§10), dosya/kanıt depolama (§15), kayıtlı arama uyarı e-postaları (§18), onay iş akışı kayıtları (§12, saklama istisnası md.5/2-e ile), ziyaretçi iletişim talebi (§18d, açık rıza + IP özeti için md.5/2-f).
4. **iyzico alıcılar listesinden çıkarıldı** (TR + EN). Kanıt §2.3.
5. **Envanter §18d açık nokta (1)** güncellendi: `/privacy` artık bu faaliyeti anlatıyor; saklama süresi (12 ay) metinde yok, o açık kaldı.
6. **`privacy-notice-gap-analysis.md` §2.3** eklendi: md.10 a–d ve md.11 9 bent için "kapandı / açık" tablosu.
7. JSON dosyalarının sonuna eksik satır sonu eklendi (önceki commit'te `No newline at end of file` düşmüştü).
8. Dokunulan anahtarlar: `legal.privacy.recipientsBody`, `legal.privacy.legalBasisBody` (TR+EN). `legal.terms.*`'e dokunulmadı (cs-fb'nin). Çerez bandı anahtarı bu turda değişmedi; önceki turun metni ekran görüntüsüyle kanıtlandı.

## 2) Kanıt

### 2.1 Alıcı eşlemesi (envanter § + kod dosya:satır)

| Alıcı (metindeki sıra) | Envanter § | Kod | Not |
|---|---|---|---|
| (1) Anthropic PBC, ABD | §6, §21 | `src/lib/llm.ts:287` (`api.anthropic.com/v1/messages`) | imzalı ek yok, envanterde açık |
| (2) Google LLC, ABD | §1, §21 | `src/lib/auth.ts:367-369` (`Google({...})` giriş sağlayıcısı) | takvim akışı (`src/lib/calendar/google.ts:59`) henüz aktif değil, §11 |
| (3) Stripe, Inc., ABD | §3, §21 | `src/app/api/webhooks/stripe/route.ts:3,11`, `src/app/api/billing/checkout/route.ts:4` | |
| (4) OpenAI, L.L.C., ABD | §7, §21 | `src/lib/llm.ts:692` (`api.openai.com/v1/embeddings`), model satır 613 | `llm.ts:327` sohbet çağrısı da aynı sağlayıcıya gider |
| (5) Cloudflare, Inc. | §15, §21 | `src/lib/storage.ts:19-21` (`R2_ACCOUNT_ID` ile S3 istemcisi) | bölge hesap ayarına bağlı, metin de öyle diyor |
| (6) PostHog Inc., AB | §19a, §19b, §21 | `src/lib/analytics.ts:28,121-128` | yalnız çerez onayıyla |
| (7) Vulut, Türkiye | §21 | barındırma kararı: envanter §22 madde 15 | veritabanı, uygulama, e-posta; e-posta kodu `src/lib/email/mailer.ts:89` |

### 2.2 Hukuki sebep satırı eşlemesi (envanterde 23 satır → metinde 19 faaliyet)

| Envanter § | Faaliyet | Sebep | Metinde |
|---|---|---|---|
| §1 | Hesap oluşturma | md.5/2-c | VAR |
| §2 | Davet / ekip | md.5/2-c | VAR |
| §3 | Faturalama (Stripe) | md.5/2-c ve -ç | VAR |
| §4 | iyzico | md.5/2-ç | **DIŞARIDA** (§2.3) |
| §5 | VKN/TCKN | md.5/2-ç | VAR |
| §6 | YZ metin üretimi | md.5/2-f | VAR |
| §7 | YZ embedding / RAG | md.5/2-f | VAR |
| §8 | YZ kullanım günlüğü | md.5/2-f | VAR |
| §9 | İç ön değerlendirme | md.5/2-f | VAR |
| §10 | Muhatap / ilişki kayıtları | md.5/2-f | **EKLENDİ** |
| §11 | Takvim | md.5/1 açık rıza | **DIŞARIDA**: "Henüz aktif değil", token kolonları hiç doldurulmuyor, `connectCalendar` `CALENDAR_OAUTH_NOT_CONFIGURED` ile reddediyor. Aktif olunca eklenecek |
| §12 (5. satır) | Onay iş akışı, işleme | md.5/2-f | **EKLENDİ** |
| §12 (6. satır) | Onay kaydı, saklama istisnası | md.5/2-e | **EKLENDİ** (aynı faaliyetin parantezinde) |
| §13 | Denetim kaydı | md.5/2-f | VAR |
| §14 | Geri bildirim | md.5/2-f | VAR |
| §15 | Dosya / kanıt depolama | md.5/2-c | **EKLENDİ** |
| §16 | Veri erişimi / taşınabilirlik | md.11, GDPR art.15/20 | **DIŞARIDA**: envanterin kendisi "ayrı bir işleme değil, yasal hak" diyor; hak zaten `rightsBody`'de |
| §17 | Hesap silme / imha | md.7, md.11 | **DIŞARIDA**: aynı gerekçe, yasal hak |
| §18 | Kayıtlı arama uyarı e-postası | md.5/2-f | **EKLENDİ** |
| §18b | Aydınlatma / rıza kaydı | md.5/2-ç | VAR |
| §18c | Ajans kanalı, karne | md.5/2-f (taslak) | VAR (ajans sayıları + karne) |
| §18d | Ziyaretçi iletişim talebi | md.5/1; IP özeti md.5/2-f | **EKLENDİ** |
| §19a | Ürün analitiği | md.5/1 açık rıza | VAR |

Sayım: envanterde 23 satır. 4'ü dışarıda (§4, §11, §16, §17). §12'nin iki satırı (işleme sebebi ve saklama istisnası) metinde tek faaliyet ("Onay iş akışı kayıtları") olarak yazıldı. Geriye 23 − 4 − 1 = **18 faaliyet** kalır; metin ayrıca "Karne sonucu ve ajans kanalı sayıları" ile "Ajans kanalı davetleri"ni ayrı yazdığı için §18c iki maddeye bölünüyor ve toplam **19 madde** olur. Kontrol: metindeki listeyi `;` ile bölünce parantez içi `;` yüzünden 21 parça çıkar, bu 19 maddeye karşılık gelir (iki parça parantez içi devamdır).

Uyarı: §18c ve §18d envanterde hâlâ "taslak" ve hukukçu teyidi bekliyor (HUKUK-3 vb.). Metin bugünkü envanter durumunu yansıtır; hukuk teyidi sonrası değişebilir.

### 2.3 iyzico canlıda kullanılıyor mu? Hayır

- `createIyzicoCheckout`'u çağıran **hiçbir yer yok**: `grep -rn createIyzicoCheckout src` yalnız tanımı (`src/lib/iyzico.ts:266`), kendi hata mesajlarını (271, 275) ve yorumları (689, 716) buluyor; test dışı çağıran sıfır. `src/lib/iyzico.ts:716` yorumu da "Unreachable today — `createIyzicoCheckout` has no" diyor.
- Yalnız webhook yolu var (`src/app/api/webhooks/iyzico/route.ts`); yapılandırma yoksa istek kabul edilmiyor (`:23-27`). `.env.example:109-112` anahtarları boş, `IYZICO_BASE_URL` sandbox.
- Envanter §4 başlığı "iyzico (TRY, faz 2)".
- Sonuç: canlıda iyzico'ya veri gitmiyor, metinden çıkarıldı. Kalan tek `iyzico` geçişi `messages/tr.json:1768` (yönetici uyarısı, aydınlatma metni değil). Faz 2 açılırken alıcı listesine ve hukuki sebep tablosuna geri eklenmeli.

### 2.4 PostHog (envanter §19a / §19b)

Kod doğrulaması: 4 olay çağrısı (`readiness-check.tsx:87,114,595`, `lead-form.tsx:119`); koşullar `analytics.ts:121-122`; gövde `analytics.ts:101-115`; uç `eu.i.posthog.com`. Canlıda anahtarın dolu olup olmadığı bu kartta **doğrulanamadı** (varsayım: boş, `.env.example` öyle). Saklama süresi ve imzalı DPA envanterde "açık".

### 2.5 Gap analizi §2 karşılaştırması (`privacy-notice-gap-analysis.md` §2.3)

| md.10 unsuru | Önce | Şimdi |
|---|---|---|
| a Veri sorumlusu kimliği | YOK | **YOK, açık** (unvan/adres/MERSİS/KEP yok) |
| b Amaçlar | KISMİ | KISMİ, belirgin iyileşti (19 faaliyet adıyla) |
| c Aktarım | YOK | KISMİ (7 alıcı adıyla; hukuki dayanak cümlesi bilerek yok) |
| ç Yöntem + hukuki sebep | YOK | VAR, hukukçu teyidi bekliyor |
| d md.11 hakları | KISMİ (1 tam, 1 kısmi, 7 yok) | VAR (9/9) |

Açık kalanlar: sorumlu kimliği, saklama süreleri, yurt dışı aktarım dayanağı cümlesi, `metaDescription`'ın "saklama süreleri" vaadi.

### 2.6 Yazılmaması gerekenler yazılmamış

Çalışan sayfada (`/tr/privacy`, `/en/privacy`) Playwright ile sayfa metni tarandı:
```
tr iyzico: false KEP adresi/posta: false SCC/standart sözleşme dayanağı cümlesi: false
en iyzico: false KEP adresi/posta: false SCC/standart sözleşme dayanağı cümlesi: false
```
Yurt dışı cümlesi yalnız "hukuki güvence ve standart sözleşme hükümleri hakkında bilgi için yöneticinize başvurun" (dayanak değil, yönlendirme).

### 2.7 Ekran görüntüleri (çalışan sayfa, `next dev -p 3917`, sahte analitik anahtarıyla; sunucu işim bitince durduruldu)

Klasör: `docs/agent-results/AKTAR-MURBCJ0A-1-explor-fb-privacy-ekler/`
- `privacy-tr-cerez-bandi.png`, `privacy-en-cerez-bandi.png`: sayfa üstü + çerez bandı. Bant TR: "…\"Tümünü Kabul Et\" seçerseniz, ürün iyileştirmesi için analitik çerezleri (PostHog) de kullanırız. Üçüncü taraf takip çerezi kullanmıyoruz." EN: "If you click 'Accept All', we also use analytics cookies (PostHog) to improve the product."
- `privacy-tr-tam.png`, `privacy-en-tam.png`: tam sayfa.
Görüntüde 1–3. bölümler ve bant doğrulandı (iyzico yok, 7 alıcı var).

### 2.8 Komut çıktıları

```
$ pnpm typecheck        → $ tsc --noEmit   (hata yok, çıkış 0)
```
Not: yeni worktree'de `prisma generate` yapılmadan typecheck 475 hata veriyor (`@prisma/client` üretilmemiş; `tests/*.ts` dosyaları). `pnpm exec prisma generate` sonrası temiz. Bu, bu değişiklikten bağımsız bir ortam durumu.
```
$ pnpm lint             → ✖ 9 problems (0 errors, 9 warnings)   (uyarılar tests/*.ts içinde, bu karttan değil)
$ pnpm exec vitest run tests/i18n.test.ts tests/i18n-check-script.test.ts tests/i18n-hardcoded-detector.test.ts tests/marketing-unsourced-figures.test.ts
  Test Files  4 passed (4)
  Tests  72 passed (72)
$ pnpm exec vitest run tests/analytics-posthog.test.ts tests/localized-routes.test.ts tests/registration-consent.test.ts
  Test Files  3 passed (3)
  Tests  19 passed (19)
```

## 3) Değişen dosyalar

- `messages/tr.json`, `messages/en.json` (`legal.privacy.recipientsBody`, `legal.privacy.legalBasisBody`; dosya sonu satır sonu)
- `docs/legal/processing-register.md` (§19b yeni; §18d açık nokta 1)
- `docs/legal/privacy-notice-gap-analysis.md` (§2.3 yeni)
- `docs/agent-results/AKTAR-MURBCJ0A-1-explor-fb-privacy.md` ve `…-ekler/` (4 PNG)

Commit: `git add <bu dosyalar>` ile seçerek; SHA için `git log --oneline -1` (bu raporun yazıldığı an commit atılmamıştı, commit sonrası `git show --name-only` ile doğrulanır).

## 4) Riskler

- Metin hukukçu teyidinden geçmedi. §18c / §18d "taslak"; bunlara bağlı satırlar değişebilir.
- Canlıda PostHog anahtarının durumu bilinmiyor; boşsa metin "olabilir" dediği için doğru, doluysa DPA yok.
- `recipientsBody` PostHog için "olay adları ve puanlandırma duruşu" diyor ama kod kurum türü/puan/seviye gibi değerler de gönderiyor (§19b "bilinen sapma").
- Saklama süreleri metinde yok; `metaDescription` yine de vaat ediyor.
- Faz 2'de iyzico açılırsa metin yeniden güncellenmeli, yoksa metin eksik kalır.

## 5) Açık sorular

1. Patron: veri sorumlusu unvanı/adresi/KEP metne yazılsın mı?
2. Patron + hukukçu: yurt dışı aktarım dayanağı (açık rıza / md.9 güvenceleri) hangisi?
3. Canlıda `NEXT_PUBLIC_POSTHOG_KEY` dolu mu? (Ben prod ortamına bakmadım.)
4. §11 takvim ve §4 iyzico açıldığında metin kim tarafından güncellenecek?

## 6) Sonraki adım

Hukukçu teyidi + saklama süreleri bölümü için ayrı kart. Faz 2 (iyzico) ve takvim OAuth kartlarına "aydınlatma metnini güncelle" maddesi eklenmeli.
