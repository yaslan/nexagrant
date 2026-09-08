# TASK-MTS6MRKDP168Q — unsourced figures on the public marketing surfaces

**Ajan:** customer-support (CS-EN) · **Dalga:** S12-3 · **Branch:** dev

---

## 0. Kartın iddiası — önce ölçtüm

Kart dört rakam saydı: `%40 artırıyor`, `150.000+ CORDIS kurum`, `ortalama 4.8/5.0 puan`,
`60 milyar Avro`. **İddia doğru** — dördü de koddaydı, üstelik ikisi ölçümle çelişiyordu.

```
$ grep -rn "150\.000\|150k+\|150K+\|60 milyar\|4\.8/5\|%40" src/lib/blog.ts "src/app/[locale]/page.tsx"
src/lib/blog.ts:41   150.000+ CORDIS kurum verisiyle ... kazanma şansını %40 artırıyor.
src/lib/blog.ts:53   ... 60 milyar Avro'dan fazla hibe alan 150.000'den fazla kuruluşu içerir.
src/lib/blog.ts:56   ... Mükemmeliyet bölümünden ortalama 4.8/5.0 puan almaktadır.
src/app/[locale]/page.tsx:122  '150.000+ CORDIS Kurumu' : '150k+ CORDIS Profiles'
src/app/[locale]/page.tsx:287  '150k+ CORDIS profilinden ...'
src/app/[locale]/page.tsx:353  '150.000+ Avrupalı kurumun geçmiş projeleri ...'
src/app/[locale]/page.tsx:476  150.000+ CORDIS Kurumu ile ...
src/app/[locale]/page.tsx:494  <div ...>150K+</div>   Kayıtlı CORDIS Kurumu
src/app/[locale]/page.tsx:500  <div ...>€60B+</div>   İncelenen AB Proje Bütçesi
```

### Bunlar bir kayda bağlanabilir miydi? — canlı DB ölçümü

```
$ npx tsx ./.st6-count.ts        # prisma @/lib/db, dev DB
{
  "cordisOrganization": 0,
  "cordisProject": 20,
  "cordisParticipation": 0,
  "topicStat": 3,
  "evidence": 4
}

$ # aynı script, tutarlar:
cordisProject rows: 20
SUM ecMaxContribution (EUR): 0
SUM totalCost (EUR): 0

$ # TopicStat'ın içeriği:
[ { "topicPrefix": "HORIZON-CL5-2026-09-D4",   "proposals": 230, "funded": 44, "successRate": 19.13, "source": "seed-demo-g0-evidence" },
  { "topicPrefix": "HORIZON-MISS-2026-04-CIT", "proposals": 185, "funded": 12, "successRate": 6.49,  "source": "seed-demo-g0-evidence" },
  { "topicPrefix": "HORIZON-NEB-2026-01-REGEN","proposals": 142, "funded": 15, "successRate": 10.56, "source": "seed-demo-g0-evidence" } ]
```

Sonuç — **hiçbiri bağlanamaz**, ve iki tanesi yalnızca kaynaksız değil, **ölçümle çelişiyor**:

| İddia | Ölçüm | Karar |
|---|---|---|
| "150.000+ **Kayıtlı** CORDIS Kurumu" | `CordisOrganization` = **0 satır** | çelişik → çıkarıldı |
| "€60B+ **İncelenen** AB Proje Bütçesi" | 20 projenin AB katkısı toplamı = **€0** | çelişik → çıkarıldı |
| "kazanma şansını %40 artırıyor" | `TopicStat` yalnız topic bazlı başarı oranı tutar; uplift ölçen kayıt yok | kaynaksız → çıkarıldı |
| "ortalama 4.8/5.0 puan" | hakem puanı ortalaması tutan kayıt yok | kaynaksız → çıkarıldı |

`Evidence` (4 satır) kurum belgesi tablosu ve **tenant-scoped + RLS arkasında**; herkese açık bir
sayfanın okuyacağı bir tenant'ı yoktur — yani public yüzeyde Evidence'a bağlamak yapısal olarak
mümkün değil. Bu yüzden dördü de **"yaklaşık" diye yumuşatılmadı, metinden çıkarıldı**.

---

## 1. Ne yapıldı

### 1a. Kartın saydığı dört rakam (+ aynı sınıftan 3 tanesi daha, kendi dosyalarımda)

`src/lib/blog.ts` — 6 metin değişikliği:

| # | Çıkarılan | Yerine |
|---|---|---|
| 1 | `150.000+ CORDIS kurum verisiyle ... %40 artırıyor` (excerpt) | merkezilik puanının **ne olduğunu** anlatan, rakamsız excerpt |
| 2 | `60 milyar Avro'dan fazla hibe alan 150.000'den fazla kuruluş` | "CORDIS ... projeleri, katılan kuruluşları ve hibe tutarlarını yayımlar" |
| 3 | `ortalama 4.8/5.0 puan almaktadır` | "yönetim kapasitesini somut referansla gösterebilir" |
| 4 | `Bütçenin en az %25'i ... etki puanını yükseltir` * | "bütçe payı, Impact bölümünde ... inandırıcılığını belirler" |
| 5 | `sürelerini haftalardan saatlere düşürse de` * | "sürecini hızlandırsa da" |
| 6 | `50+ teklifi eşzamanlı sıfır çakışmayla` (excerpt) * | "çok sayıda teklifi eşzamanlı ve birbirinden yalıtılmış" |

\* kart saymamıştı; **aynı dosyada, aynı ihlal sınıfı** (kaynaksız nicel iddia) olduğu için birlikte alındı.

`src/app/[locale]/page.tsx` — 7 değişiklik: hero güven rozeti (`150.000+ CORDIS Kurumu` →
`CORDIS Ortak İstihbaratı`), M8 adım metni, M1 modül kartı, ağ bölümü başlığı (TR+EN),
**iki uydurma stat tile'ının (`150K+`, `€60B+`) tamamen kaldırılması**, ve
`teklif yazımını 10 kat hızlandırın` → `teklif yazımını hızlandırın`.

`messages/tr.json` + `messages/en.json` — `billingPanels.pricing.plans.ultra.f3`
(**herkese açık fiyatlandırma sayfası**): `150.000+ CORDIS tam veri dışa aktarımı` →
`CORDIS tam veri dışa aktarımı`; EN eşleniği aynı şekilde. (i18n: iki dil de.)

### 1b. Ekran görüntüsü doğrulamasında çıkan DAHA AĞIR bir bulgu — aynı dosyada, düzeltildi

07 numaralı kareyi çekerken landing sayfasındaki M1 "CORDIS Node Analytics" panelinin
**gerçek ve adı geçen bir kuruma** uydurma rakamlar yazdığı görüldü
(`src/app/[locale]/page.tsx:519-551`):

```
Fraunhofer-Gesellschaft · PIC: 999984059 · Almanya (DE) · REC
CENTRALITY: 0.9412 · Koordinatörlük 342 Proje · Toplam Katılım 1.840 Proje · Alınan Fon €940M+
💡 Konsorsiyum Etkisi: Bu kurumun ortak olarak yer alması, projenin G3 Hakem
   Mükemmeliyet puanını ortalama +1.8 puan yükseltmektedir.
```

Son cümle, kartın çıkarmamı istediği `ortalama 4.8/5.0` ile **birebir aynı sınıf** bir hakem-puanı
vaadi; üstelik diğerleri anonim bir istatistik değil, **üçüncü bir kurum hakkında ad ve PIC ile
yapılmış olgusal iddia**. Kendi dosyam olduğu için düzelttim: panel `ÖRNEK GÖRÜNÜM` rozetiyle
işaretlendi, kurum `Örnek Araştırma Merkezi` oldu, üç tile değer yerine `—` gösteriyor ve uplift
vaadi yerine M1'in **ne hesapladığını** söyleyen (rakamsız, TR+EN) bir cümle kondu.

---

## 2. Kanıt (bu koşuda üretildi)

### 2a. Kapı — `pnpm lint && pnpm typecheck && pnpm test`

```
$ pnpm lint
✖ 9 problems (0 errors, 9 warnings)
       # 9 uyarının tamamı önceden var ve BAŞKA dosyalarda
       # (scripts/test-partners-api.ts, opportunities/[id]/application/client.tsx)

$ pnpm typecheck
$ tsc --noEmit
       # çıktı yok = temiz

$ pnpm test
 Test Files  99 passed | 2 skipped (101)
      Tests  1127 passed | 8 skipped (1135)
```

### 2b. Regresyon kapanı gerçekten yakalıyor mu? (RED → GREEN)

Yeni `tests/marketing-unsourced-figures.test.ts` yeşil geçtiği için değil, **kırmızıya
düşürülebildiği için** güvenilir. Literal'lerden birini geri koyup ölçtüm:

```
$ # '150.000+ CORDIS Kurumu' landing'e geri kondu
$ npx vitest run tests/marketing-unsourced-figures.test.ts
     × does not print 150.000+
     × does not print 150k+
      Tests  2 failed | 24 passed (26)

$ # geri alındı
$ npx vitest run tests/marketing-unsourced-figures.test.ts
      Tests  26 passed (26)      # panel bulguları eklendikten sonra: 34 passed
```

### 2c. Gerçek tarayıcı — sentetik değil, görünen metin okundu

`tests/e2e/st6-marketing-figures.spec.ts`, altı herkese açık sayfayı Chromium'da açıp
`body.innerText()` üzerinden 16 literal'i arıyor (script tag'lerindeki i18n payload'u değil,
**kullanıcının gerçekten okuduğu metin**):

```
$ npx playwright test tests/e2e/st6-marketing-figures.spec.ts --reporter=list
OK  /tr                                              clean of all 16 figures -> 01-landing-tr.png
OK  /en                                              clean of all 16 figures -> 02-landing-en.png
OK  /tr/blog                                         clean of all 16 figures -> 03-blog-list-tr.png
OK  /tr/blog/horizon-europe-basarili-konsorsiyum-rehberi clean of all 16 figures -> 04-blog-post-tr.png
OK  /tr/fiyatlandirma                                clean of all 16 figures -> 05-pricing-tr.png
OK  /en/pricing                                      clean of all 16 figures -> 06-pricing-en.png
OK  network column: the two invented stat tiles are gone
OK  M1 panel: labelled a sample, names no institution, states no figure
     panel text -> "CORDIS Node Analytics\nÖRNEK GÖRÜNÜM\nÖrnek Araştırma Merkezi\n\nPIC · Ülke · Kurum tipi\n\nKoordinatörlük\n—\nToplam Katılım\n—\nAlınan Fon\n—\nM1, her kurum için koordinatörlük geçmişini, AB katkısını ve ağ merkezilik puanını CORDIS kayıtlarından hesaplar. Değerler çalışma alanınızda gerçek veriyle dolar."
OK  blog body: the CORDIS-scale and reviewer-score claims are gone -> 08-blog-post-body-metrics.png
  1 passed (13.3s)
```

Aranan 16 literal: `150.000+` `150k+` `150K+` `150,000+` `€60B+` `60 milyar` `4.8/5.0` `10 kat`
`50+ teklif` `Fraunhofer` `999984059` `0.9412` `342 Proje` `1.840 Proje` `€940M+` `+1.8 puan`.

### 2d. Herkese açık fiyatlandırma sayfası — servis edilen HTML

```
$ curl -s http://localhost:3000/tr/fiyatlandirma | grep -o "CORDIS[^<\"]\{0,45\}aktarımı"
CORDIS tam veri dışa aktarımı
$ curl -s http://localhost:3000/en/pricing | grep -o "Full CORDIS[^<\"]\{0,45\}"
Full CORDIS data exports (JSON/CSV)
```

### 2e. Ekran görüntüleri (bu koşuda çekildi)

`docs/agent-results/TASK-MTS6MRKDP168Q-screenshots/`
`01-landing-tr.png` · `02-landing-en.png` · `03-blog-list-tr.png` · `04-blog-post-tr.png` ·
`05-pricing-tr.png` · `06-pricing-en.png` · `07-landing-network-section.png` (stat tile'lar
gitmiş, panel `ÖRNEK GÖRÜNÜM`) · `08-blog-post-body-metrics.png` (metrik listesi rakamsız).

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/blog.ts` | 6 metin düzeltmesi + ölçümü kayda geçiren dosya başlığı |
| `src/app/[locale]/page.tsx` | 7 metin/blok düzeltmesi + M1 örnek panelinin 4 düzeltmesi |
| `messages/tr.json` | `billingPanels.pricing.plans.ultra.f3` (tek satır) |
| `messages/en.json` | `billingPanels.pricing.plans.ultra.f3` (tek satır) |
| `tests/marketing-unsourced-figures.test.ts` | **yeni** — 34 kaynak-kapanı |
| `tests/e2e/st6-marketing-figures.spec.ts` | **yeni** — gerçek tarayıcı doğrulaması |

`src/app/[locale]/admin/blog/client.tsx`'e **dokunulmadı** (gerek olmadı: `BlogPost` arayüzü
değişmedi, yalnız içerik metni değişti).

**Stage disiplini:** `git add -A` / `git add .` kullanılmadı. `messages/*.json` dosyalarını bu
sırada **başka bir ajan da düzenliyordu** (`PartBEditor`, `savedSearches`, `NotFound` anahtarları
— benim değil). Yalnız kendi hunk'ımı indexe aldım:

```
$ git diff --cached -- messages/tr.json messages/en.json | grep -E "^[+-]" | grep -vE "^(\+\+\+|---)"
-          "f3": "Full 150,000+ CORDIS data exports (JSON/CSV)",
+          "f3": "Full CORDIS data exports (JSON/CSV)",
-          "f3": "150.000+ CORDIS tam veri dışa aktarımı (JSON/CSV)",
+          "f3": "CORDIS tam veri dışa aktarımı (JSON/CSV)",
```

---

## 4. Kapsam dışı — DÜZELTMEDİM, bildiriyorum (dosya:satır)

1. **`src/app/[locale]/(app)/[workspace]/partners/page.tsx:194-195`** — uygulama içi M1 sayfası
   hâlâ *"...türetilen **150.000+** Avrupalı ve Türk kurumun..."* / *"...of **150k+**
   organizations..."* diyor. Ölçüm: `CordisOrganization` = **0**. Public değil ama aynı ihlal;
   tek satırlık takip işi.

2. **`messages/tr.json:1243` + `messages/en.json:1243`** — `billingPanels.admin.plans.ultra.f3`
   = `"150.000+ CORDIS dışa aktarımı"` / `"150,000+ CORDIS exports"`. Admin fatura ekranında
   görünüyor (kapsam dışı), **ama** next-intl tüm mesaj paketini istemciye gönderdiği için bu
   string **herkese açık landing sayfasının HTML'ine de düşüyor** — ölçtüm:
   ```
   $ curl -s http://localhost:3000/tr | grep -o ".\{60\}150\.000+.\{60\}"
   ...,"f3":"150.000+ CORDIS dışa aktarımı","f4":"GİB e-fatura ve kurumsal SLA"}}},"settings":...
   ```
   Kullanıcıya *görünmüyor* (bu yüzden e2e kapanım görünen metne bakıyor), fakat public olarak
   servis ediliyor. Public `pricing` eşleniğini düzelttim, admin eşleniği sizde.

3. **`src/app/[locale]/page.tsx:140-240`** — hero'daki sahte Kanban mock'u **tamamen sabit
   Türkçe** (CLAUDE.md kural 8 ihlali): İngilizce landing'de bile `Hakem Puanı`,
   `Part B Taslağı Onaylandı` çıkıyor. Ölçüm:
   ```
   $ curl -s http://localhost:3000/en | grep -o "Hakem Puanı\|Part B Taslağı Onaylandı\|LIVE SYSTEM" | sort | uniq -c
      2 Hakem Puanı
      2 LIVE SYSTEM
      2 Part B Taslağı Onaylandı
   ```
   Ayrıca simüle edilmiş bir ekrana `LIVE SYSTEM` rozeti takılmış. Rakam iddiası olmadığı için
   remit'imin dışında bıraktım. (Kendi dokunduğum M1 panelinin metinlerini TR+EN yaptım.)

4. **Blog yazısı gövdesinde markdown render edilmiyor** — `/tr/blog/<slug>` sayfasında `##` ve
   `**...**` ham metin olarak görünüyor (bkz. `08-blog-post-body-metrics.png`). Render eden yer
   `src/app/[locale]/(marketing)/blog/[slug]/page.tsx`; benim değişikliğimden önce de böyleydi
   (yalnız içerik string'ini değiştirdim). Herkese açık bir sayfada görünür kusur.

5. **`messages/*.json` — `Örn: Fraunhofer WP3 liderliğini kabul etti...`** (toplantı notu
   placeholder'ı). `Örn:` ile açıkça örnek olarak işaretli ve **hiçbir rakam içermiyor**;
   kural 7 ihlali saymadım, bilgi olsun diye yazıyorum.

---

## 5. Riskler

- Landing'deki iki stat tile silindiği için ağ bölümü sağ sütunu bir tık seyreldi; 07 numaralı
  karede düzenin bozulmadığı görülüyor, e2e de bölüm metninin (`eigenvector`) durduğunu doğruluyor.
- M1 paneli artık değer yerine `—` gösteriyor. Pazarlama açısından "boş" görünebilir; **kasıtlı**:
  rakam ancak onu ölçen sorgu ile birlikte geri gelmeli (kural 7). Gerçek bir sayaç istenirse
  `CordisOrganization.count()` bağlanabilir — ama bugün **0** döner, yani önce K2 import'u lazım.
- Bu dalgada ortak ağaçta paralel ajanlar çalışıyor; `pnpm test` dosya sayısı koşu içinde
  97→99'a çıktı. Kendi iki test dosyam izole ve yeşil.

## 6. Açık sorular

- `150.000+` rakamı bir yerden geliyorsa (CORDIS'in kendi yayınladığı toplam), bu **harici bir
  olgu** ve kaynak gösterilerek geri konabilir. Ürün ölçümü olarak sunulamaz — eski metin
  "**Kayıtlı** CORDIS Kurumu" / "**Verified** EU Organizations" diyordu, yani bizim kaydımız
  gibi sunuluyordu. Kaynaklı dış-olgu olarak mı geri istenir, karar sizin.
- Yukarıdaki (1) ve (2) numaralı kalıntılar için ayrı bir kart açılsın mı?

## 7. Sonraki adım

- Kapsam dışı (1) ve (2) için tek bir küçük takip görevi.
- K2 CORDIS import'u çalıştırıldığında (`CordisOrganization` > 0), landing'e **ölçülen** bir
  sayaç geri konabilir — literal olarak değil, sorguyla.
