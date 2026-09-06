# TASK-MTQ3DZS6W6DFC — E11.4 Fiyat Doğrulama

Ajan: Sora (`sora-0c1f10`) · Sprint: S8–S9 (E11 Beta) · Tarih: 2026-09-06

> **Önce en önemlisi:** 7. hafta fiyat atölyesi **2026-10-22**, yani bugünden **altı hafta sonra**.
> Gerçek ortak yanıtı **yok** ve bugün olamaz. Bu görevde teslim edilen şey, o gün çalışacak
> **enstrüman + analiz hattı + politika**dır; sayısal sonuç değil. Rapordaki rakamlar fikstür
> verisinden gelir ve raporun kendisi bunu tepesinde büyük harfle söyler.

---

## 1. Ne yapıldı

### a) Anket enstrümanı (tek tanım, üç çıktı)

`src/lib/beta/pricing-survey.ts` — 25 soruluk anket, TR ve EN, yedi bölüm. İki standart araç:

- **Van Westendorp** (4 soru): katılımcıya **hiçbir fiyat gösterilmeden** kabul edilebilir fiyat bandı.
  Sıralama bilerek böyle: fiyat algısı sorulmadan önce hiçbir çapa gösterilmiyor (test bunu koruyor).
- **Gabor-Granger** (5 basamak: €149 · €199 · €249 · €299 · €349): her fiyat bağımsız sorulur.

Ayrıca plan uyumu, eklenti talebi, kredi yeterliliği, faturalama döngüsü/para birimi/e-fatura,
başarı primi tutumu (ROADMAP "Açık kararlar" #6) ve geçiş için istenen indirim.

Aynı tanımdan üretilenler:
1. `survey-tr.md` / `survey-en.md` — atölye kopyası ve gözden geçirme dokümanı.
2. `google-form-tr.gs` / `google-form-en.gs` — **Google Apps Script**; script.google.com'a yapıştır → `createForm()`
   → form iki dilde kurulur. Her soru başlığı `[csvKolonu]` ön ekiyle gelir, böylece yanıt sayfası
   CSV'ye birebir oturur.
3. `responses-template.csv` — 10 ortak için ön doldurulmuş yanıt CSV'si.
4. Ortak başına TR/EN davet e-postası (`mail/<slug>.html|.txt`).

> Neden Typeform/Google Form yerine "Apps Script"? Form iki dilde **iki kez** var olmak ve analizin
> okuduğu CSV ile **aynı kalmak** zorunda. Tek tanımdan yeniden üretmek, bir düzenlemenin ikisini
> birden bozmasını engelleyen tek yol. Formun elle kurulması hâlinde kolon eşlemesi ilk düzenlemede kayar.

### b) Analiz hattı

`src/lib/beta/pricing-analysis.ts` — saf fonksiyonlar (dosya sistemi/DB/saat yok):
Van Westendorp eğrileri + PMC/OPP/IPP/PME kesişimleri, Gabor-Granger gelir endeksi,
segment kırılımı, eklenti/plan/faturalama sayımları.

İki veri-kalitesi kuralı, çünkü sessizce küçülen bir payda yanlış fiyat kararından beterdir:
- Dört fiyatı sıralı vermeyen yanıt **reddedilir ve gerekçesiyle raporlanır** (sessizce düşmez).
- Merdivende tutarsız yanıt (düşük fiyata hayır, yükseğe evet) **işaretlenir**.

### c) Rapor

`docs/E11-PRICING-FEEDBACK.md` — **üretilen** doküman (`src/lib/beta/pricing-report.ts`), elle
düzenlenmez. Kaynak CSV'nin başındaki `# STATUS: FIXTURE|REAL` satırı raporun uyarı bandını belirler:
fikstür veriyle üretilmiş bir rapor kendini gerçekmiş gibi sunamaz. Gerçek yanıtlar geldiğinde
`# STATUS: REAL` + tek komut → uyarı kendiliğinden kalkar.

### d) v1.0 → v1.1 geçiş kuralı — **ankete bağlı değil, bugün geçerli**

`src/lib/beta/pricing-transition.ts`. Kademe **harcamaya değil katılıma** bağlı:

| Kademe | Koşul | İndirim | Süre | Fiyat kilidi | Kredi |
|---|---|---:|---:|---:|---:|
| `founding` | 5/8 sync **ve** ≥1 teklif G2'de | %40 | 12 ay | 24 ay | 500 |
| `contributor` | 3/8 sync | %25 | 12 ay | 12 ay | 250 |
| `alumni` | diğer tüm beta ortakları | %15 | 6 ay | — | — |

Kuralın tamamı (8 madde): indirim liste fiyatına uygulanır (yıllık %20 yeniden uygulanmaz) ·
kilit bitince artış 12 ayda en çok %20 + 60 gün yazılı bildirim · pilot modüller GA'dan sonra 60 gün
daha `pilot`, sonra `off` (veri silinmez) · beta kredileri devretmez, yerine hoş geldin kredisi ·
yükseltmede indirim taşınır · 90 gün `free`'de kalma kademeyi düşürür · devredilemez ·
v1.1 ile gelen M6/M9 kilitli ortaklara kilitli fiyattan açılır.

GA tarihi **2026-11-16** (beta kapanışı 2026-10-29 + iki hafta): ortak ilk faturadan önce yazılı
koşulu ve kapanış raporunu görür.

Politikanın **kod** olmasının sebebi: aynı sayılar teklif mektubunda, Stripe kuponunda ve kilidi
uygulayacak yetkilendirme kontrolünde aynı olmak zorunda. Rapordaki örnek teklif tablosu
`resolveBetaTransition()` çağrılarak üretilir — doküman implementasyonla çelişemez.

---

## 2. Kanıt

### CLI — üretim ve analiz (gerçek çıktı)

```
$ pnpm beta:pricing
[beta-pricing] roster       10 partners from docs/BETA_DATA/beta-partners.csv
[beta-pricing] survey       questionnaire + Google Apps Script written for tr, en (25 questions)
[beta-pricing] template     docs/BETA_DATA/generated/pricing-survey/responses-template.csv
[beta-pricing] mail         beta-anadolu-teknoloji: rendered-only (tr)
... (10 ortak)
[beta-pricing] done         rendered — pass --send with real addresses and form URLs to deliver

$ pnpm beta:pricing --analyze --responses=docs/BETA_DATA/pricing-survey-responses.fixture.csv
[beta-pricing] parse        9 valid response(s), 1 rejected, status FIXTURE
[beta-pricing] rejected     row 7 (R-beta-izmir-belediye): Van Westendorp prices are not ordered
                            (tooCheap ≤ cheap ≤ expensive ≤ tooExpensive): €49, €249, €199, €399
[beta-pricing] report       docs/E11-PRICING-FEEDBACK.md
[beta-pricing] warning      dataset is not declared REAL — the report carries a banner saying so
```

Fikstür 10 satır: 9 geçerli (≥8 eşiğinin üstünde), 1'i **bilerek** bozuk → reddetme yolu çalışıyor;
1 yanıt **bilerek** merdivende tutarsız → işaretleme yolu çalışıyor.

### Gönderim kapıları — ikisi de gerçekten reddediyor

```
$ pnpm beta:pricing --send
[beta-pricing] FAILED: --send refuses: 10 roster address(es) are on a reserved, undeliverable
               domain (partner01@example.invalid). Point --roster at the real list first.

$ pnpm beta:pricing --send --roster=<gerçek adresli liste>
[beta-pricing] FAILED: --send refuses: --form-tr is still the placeholder. Publish the form first.
```

### Testler — 56 yeni birim testi, hepsi yeşil

```
$ npx vitest run tests/beta/pricing-*.test.ts
 Test Files  4 passed (4)
      Tests  56 passed (56)
```

Van Westendorp matematiği elle doğrulanabilir örnekle sabitlendi (üç özdeş yanıt → IPP 250,
OPP 250, PMC 200, PME 300). Euro→cent sınırı ayrı testle çivilendi (sessiz 100× hata sınıfı).
`CATALOGUE_LIST_CENTS` ile `prisma/seed.ts` fiyatlarının ayrışmasını bir test engelliyor.

### Depo kapıları

```
$ pnpm typecheck     → temiz (çıktı yok)
$ pnpm lint          → yeni dosyaların hiçbirinde bulgu yok (depo genelindeki 573 hata taban çizgisi,
                       hiçbiri bu görevde eklenen dosyalarda değil)
$ pnpm test          → 290 passed, 4 failed
```

4 kırmızı **bu görevden değil**, bilinen taban çizgisi: 3 SEDIA ağ testi
(`k1-daily-calls`, `sedia-adapter`) + 1 RLS testi (`rls.spec.ts`). Bkz. shared hafıza
`fabrika-known-failing-tests`.

### Üretilen dosyalar (gerçek dizin listesi)

`docs/BETA_DATA/generated/pricing-survey/`: `survey-{tr,en}.md`, `google-form-{tr,en}.gs`,
`responses-template.csv`, `survey-summary.json`, `mail/<slug>.{html,txt}` × 10.

---

## 3. Değişen dosyalar

**Yeni**
- `src/lib/beta/pricing-survey.ts` — anket tanımı + Markdown ve Google Apps Script üreteçleri
- `src/lib/beta/pricing-survey-email.ts` — TR/EN davet e-postası
- `src/lib/beta/pricing-analysis.ts` — Van Westendorp, Gabor-Granger, kırılımlar, CSV doğrulama
- `src/lib/beta/pricing-report.ts` — `E11-PRICING-FEEDBACK.md` üreteci
- `src/lib/beta/pricing-transition.ts` — v1.0→v1.1 geçiş politikası (kademeler, kilit, tarih aritmetiği)
- `scripts/beta-pricing-survey.ts` — CLI (render / analyze / send)
- `tests/beta/pricing-{survey,analysis,transition,report}.test.ts` — 56 test
- `docs/BETA_DATA/pricing-survey-responses.fixture.csv` — fikstür veri seti (`# STATUS: FIXTURE`)
- `docs/E11-PRICING-FEEDBACK.md` — üretilen rapor
- `docs/BETA_DATA/generated/pricing-survey/**` — üretilen anket/e-posta/şablon çıktıları
  (**commit edilmez**: `docs/BETA_DATA/generated/` `.gitignore`'da — E11.1'in kararı, çıktılar ortak
  adı/adresi taşıyabiliyor. `pnpm beta:pricing` ile tek komutta yeniden üretilir.)

**Değişen**
- `package.json` — `beta:pricing` script'i
- `docs/BILLING.md` — §8 "Beta → ücretli geçiş (E11 kohortu)"
- `docs/BETA_GUIDE.md` — §9, 7. ve 8. hafta maddeleri rapora bağlandı
- `scripts/README.md` — script tablosu (boştu, dolduruldu)

---

## 4. Riskler

1. **Rapordaki sayılar fikstür.** Ana risk, birinin bu raporu gerçek sanıp fiyat kararı almasıdır.
   Karşı önlem: raporun tepesindeki büyük harfli uyarı bandı + CSV'deki `# STATUS` beyanı + bunu
   koruyan iki test. Yine de bu bir **süreç** riski, kod riski değil.
2. **9 yanıt küçük örneklem.** Gerçek veri geldiğinde de 8–10 yanıt olacak; Van Westendorp bu boyutta
   yön verir, karar vermez. Rapor bunu §2'de açıkça yazıyor.
3. **İndirim yüzdeleri henüz doğrulanmadı.** %40/%25/%15 gerekçeli bir öneridir, ankete bağlı değildir;
   asıl doğrulama 7. haftada gelir. Yeniden ayarlama tek sabit (`TRANSITION_TIERS`), testler koruma bandı.
4. **Fiyat kilidi Stripe'ta ifade edilemez.** Kupon indirimi taşır, kilidi taşımaz;
   `Subscription.priceLockEndsOn` alanı gerekiyor — ayrı görev, açıldı sayılmaz.
5. **Google Form elle kurulacak.** Apps Script yapıştırmak insan adımı; yayımlanan URL'ler
   `--form-tr/--form-en` ile geri verilmeli, yoksa `--send` reddediyor (bu bir özellik).

---

## 5. Açık sorular

1. **GA tarihi 2026-11-16 onaylanıyor mu?** Beta kapanışı + 2 hafta varsayımıyla seçildi.
2. **%40 founding indirimi ticari olarak kabul mü?** Fikstürde istenen indirimin medyanı %30,
   75. yüzdeliği %35 — %40 ikisini de karşılıyor, ama bu **fikstür**. Gerçek veriyle yeniden bakılmalı.
3. **Başarı primi** (ROADMAP #6) hukuki görüş bekliyor; anket yalnız yön verecek, kararı kapatmayacak.
4. **Gerçek ortak listesi nerede?** `beta-partners.csv` hâlâ `.invalid` placeholder. Anket gönderimi
   gerçek listeye erişmeden yapılamaz (E11.1 ile aynı engel).

---

## 6. Sonraki adım

| Ne zaman | Ne | Kim |
|---|---|---|
| Hafta 6 (2026-10-15) | Apps Script'i çalıştır, iki formu yayımla, URL'leri kaydet | Ürün |
| Hafta 6 | Gerçek ortak listesiyle `pnpm beta:pricing --send --form-tr=… --form-en=…` | Ürün |
| Hafta 7 (2026-10-22) | Atölye; yanıt sayfasını `pricing-survey-responses.csv`'ye aktar, `# STATUS: REAL` | Ürün |
| Hafta 7 | `pnpm beta:pricing --analyze --responses=…` → rapor gerçek veriyle yeniden üretilir | Ürün |
| Hafta 7 | Sonuçlara göre `TRANSITION_TIERS` yüzdeleri gözden geçirilir | Ürün + Lider |
| Hafta 8 (2026-10-29) | Kapanışta ortaklara yazılı geçiş teklifi | Ürün |
| GA öncesi | `Subscription.priceLockEndsOn` alanı + Stripe kupon senkronu (ayrı görev) | Backend |

**Bu görev kapsamında yapılmayanlar (bilerek):** anket gönderilmedi (placeholder adresler + form
yayımlanmadı), gerçek yanıt toplanmadı (atölye 6 hafta sonra), Stripe kuponu oluşturulmadı
(Stripe entegrasyonu bu pane'de bağlı değil — Ayarlar → Entegrasyonlar → Stripe).
