# TASK-MTS6MRKDP168Q — herkese açık blog yazılarında kaynaksız istatistikler

**Ajan:** blog-yazar (MA-EN) · **Dalga:** S12-7 · **Branch:** dev

---

## 0. Kartın iddiası — bağımsız doğrulama

Kart `review`de: customer-support agent (2 commit — `3bbff6d`, `f5edd55`) blog.ts'teki
7 kaynaksız rakamı (`150.000+`, `%40`, `60 milyar Avro`, `4.8/5.0`, vb.) ve landing/pricing
sayfalarındaki eşleniklerini zaten çıkarmıştı. Kendi taze okumamda önce onların bulgularını
DB'ye karşı yeniden ölçmedim (önceki oturum zaten `CordisOrganization=0`, `TopicStat=3` demo
satırı ölçmüştü, kod da bunu commit mesajında taşıyor) — bunun yerine **kod hâlâ temiz mi** ve
**kaçan bir şey var mı** diye taradım.

Ayrıca aynı raporun "Açık sorular" bölümünde bıraktığı iki kalıntı maddesi vardı
(`partners/page.tsx` içindeki uygulama-içi 150.000+ iddiası, `billingPanels.admin.plans.ultra.f3`).
Bunların ikisi de bugün erken saatte `37202a5` ("fix(m11): close remaining lint warnings, drop
unverified CORDIS institution count") ile ayrı bir ajan tarafından kapatılmış — doğruladım:

```
$ python3 -c "import json; ..."
tr billingPanels.admin.plans.ultra.f3 → "CORDIS tam veri dışa aktarımı (JSON/CSV)"  # rakamsız
en billingPanels.admin.plans.ultra.f3 → "Full CORDIS data exports (JSON/CSV)"       # rakamsız

$ grep -n "150.000\|150k\|150K" "src/app/[locale]/(app)/[workspace]/partners/page.tsx"
# 0 eşleşme — "150.000+ Avrupalı ve Türk kurum" cümlesi kaldırılmış
```

Yani devraldığım kartın kendi listesi + önceki raporun bıraktığı kalıntılar **kod tarafında
tamamen kapalı**. Kendi katkım aşağıdaki yeni bulgu oldu.

---

## 1. Yeni bulgu — rakamsız ama aynı sınıf iddia (önceki taramaların kaçırdığı)

Önceki iki tur (`3bbff6d`, `f5edd55`) hem rakam hem "haftalardan/aylardan" kelime-kalıbını
taradı, ama regex'ler blog.ts + page.tsx'e odaklıydı. Gerçek tarayıcıda `/tr/blog` sayfasını
açıp `readPage` ile **kullanıcının gerçekten okuduğu metni** taradığımda, blog sayfalarının
her birinde görünen paylaşımlı footer'da (`src/components/PublicFooter.tsx:24`) şunu buldum:

```
TR: "... CORDIS ağ analitiği ve hakem simülasyonu ile kazanma oranınızı katlayın."
EN: "... Accelerate your win rates with CORDIS graph analytics and AI evaluator simulation."
```

Bu, blog.ts'ten çıkarılan `"kazanma şansını %40 artırıyor"` ile **birebir aynı sınıf** bir
iddia (ürünün kazanma oranını artırdığı vaadi) — sadece rakamsız yazılmış olduğu için önceki
`/\d/` ve `%\s?\d+` regex'lerinin hiçbiri yakalamadı. Hiçbir kayıt (`Evidence`/`TopicStat`)
bir kullanıcının kazanma oranını "katladığını" ölçmüyor — kaynaksız.

`PublicFooter.tsx` 8 herkese açık sayfada render ediliyor (landing, blog listesi, blog detayı,
pricing, login, register, calls/turkey, turkiyeye-acik-cagrilar) — yani bu tek satır blog
okuyucusunun her zaman gördüğü, blog'a özel olmayan ama blog sayfalarında da görünen bir iddia.

### Düzeltme

`src/components/PublicFooter.tsx` — TR+EN, rakam/oran iddiası olmayan, ürünün ne yaptığını
anlatan metne çevrildi:

| Dil | Önce | Sonra |
|---|---|---|
| TR | `... hakem simülasyonu ile kazanma oranınızı katlayın.` | `... hakem simülasyonu ile teklifinizi güçlendirin.` |
| EN | `Accelerate your win rates with CORDIS graph analytics ...` | `Strengthen your proposal with CORDIS graph analytics ...` |

Üslup, aynı ihlal sınıfını daha önce düzelten `f5edd55`'in landing CTA'sında kullandığı
kalıpla tutarlı (`"teklifinizi güçlendirin"` / `"Strengthen your ..."`).

### Kapsam dışı bırakılan, bildirilen bulgular

- **Blog gövdesi tamamen sabit Türkçe** — `src/lib/blog.ts`'teki 4 yazının `title`/`excerpt`/
  `content` alanlarında `isTr` dallanması yok; `/en/blog` bile Türkçe metin gösteriyor
  (ekran görüntüsüyle doğrulandı: `readPage` çıktısı, EN sayfa gövdesi Türkçe). Bu CLAUDE.md
  kural 8 ihlali ama **kaynaksız istatistik değil**, önceki raporun zaten bildirdiği hero-mock
  i18n sorunuyla aynı sınıf ayrı bir kart konusu — dokunmadım.
- **`Örn: Fraunhofer WP3 liderliğini kabul etti...`** (messages placeholder) — önceki raporda
  da not edilmişti, `Örn:` ile açıkça örnek işaretli ve rakam içermiyor, ihlal saymadım.

---

## 2. Kanıt

### 2a. Gerçek tarayıcı — iki yazı + footer

```
$ agentspace_browser navigate http://localhost:3000/tr/blog          → readPage: 4 yazı, rakamsız
$ agentspace_browser navigate .../blog/horizon-europe-basarili-...   → screenshot: 09-horizon-post-tr-refresh.png
$ agentspace_browser navigate .../blog/tubitak-esik-ustu-ab-...      → screenshot: 10-tubitak-post-tr.png
$ agentspace_browser navigate http://localhost:3000/en/blog          → readPage: footer artık "Strengthen your proposal..."
```

`readPage` çıktısı (TR, düzeltme sonrası, hot-reload ile canlı):
```
Horizon Europe, Digital Europe ve Eurostars fonlama süreçlerinde fikirden teslimata uçtan uca
akıllı yönetim platformu. CORDIS ağ analitiği ve hakem simülasyonu ile teklifinizi güçlendirin.
```

### 2b. Regresyon kapanı — RED → GREEN

`tests/marketing-unsourced-figures.test.ts`'e yeni `describe` bloğu eklendi
(`public footer — the win-rate promise carries no record, digits or not`):

```
$ sed -i "s/teklifinizi güçlendirin/kazanma oranınızı katlayın/" src/components/PublicFooter.tsx
$ npx vitest run tests/marketing-unsourced-figures.test.ts
   × no multiply/accelerate win-rate claim survives, in either locale
   Tests  1 failed | 35 passed (36)

$ # geri alındı
$ npx vitest run tests/marketing-unsourced-figures.test.ts
   Tests  36 passed (36)
```

### 2c. Kapı

```
$ pnpm lint
✖ 0 problems

$ pnpm typecheck
scripts/_tmp-csv7/HEAD-consortium-page.tsx(5,90): error TS2307: Cannot find module './manager'
# bu dosya benim değil — untracked, başka bir paralel ajanın scratch dizini
# (git status: "?? scripts/_tmp-csv7/", src/ ve tests/ dışında, dokunmadım)
$ npx tsc --noEmit 2>&1 | grep -v "_tmp-csv7" | grep -c "error TS"
0   # kendi değişikliklerim typecheck'i kırmıyor

$ pnpm test
 Test Files  101 passed | 2 skipped (103)
      Tests  1186 passed | 8 skipped (1194)
```

### 2d. Ekran görüntüleri

`docs/agent-results/TASK-MTS6MRKDP168Q-screenshots/`
`09-horizon-post-tr-refresh.png` (Horizon Europe yazısı, rakamsız gövde) ·
`10-tubitak-post-tr.png` (TÜBİTAK yazısı, "15 Puan" gerçek/dış AB puanlama skalası — ürün
iddiası değil, harici olgu).

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/components/PublicFooter.tsx` | TR+EN: "kazanma oranınızı katlayın" / "Accelerate your win rates" kaldırıldı, rakamsız/oransız betimleyici metinle değiştirildi |
| `tests/marketing-unsourced-figures.test.ts` | yeni `describe` — footer'daki katlama/accelerate iddiasını pinliyor |
| `docs/agent-results/TASK-MTS6MRKDP168Q-screenshots/09-*.png`, `10-*.png` | yeni kanıt kareleri |

`src/lib/blog.ts`, `src/app/[locale]/page.tsx`, `messages/*.json`'a **dokunulmadı** — önceki
iki commit ve `37202a5` tarafından zaten temizlenmişlerdi, kendi taramam onları teyit etti.

**Stage disiplini:** yalnız yukarıdaki kendi dosyalarım `git add` edildi; ortak `messages/*.json`
bu turda hiç dokunulmadı.

---

## 4. Riskler

- Footer metni sitenin **her** herkese açık sayfasında göründüğü için değişiklik blog dışı
  yüzeyleri de etkiliyor (landing, pricing, login, register). Metin daha az iddialı ama marka
  tonu ve CTA yapısı korundu; başka bir sayfa için ayrı bir görsel/metin regresyonu beklemiyorum.
- `scripts/_tmp-csv7/` altındaki tip hatası benimle eşzamanlı çalışan başka bir ajanın geçici
  dosyası; onun işi bitince (silinir/commitlenir) `pnpm typecheck` kendiliğinden temizlenecek.

## 5. Açık sorular

- Blog gövdesinin tamamen sabit Türkçe olması (rule 8) ayrı bir kart mı olsun? Kaynaksız
  istatistik değil ama herkese açık ve önceki raporun bildirdiği hero-mock i18n sorunuyla
  aynı kökten.

## 6. Sonraki adım

- Yukarıdaki i18n bulgusu için ayrı kart açılması önerilir (bu görevin kapsamı dışı).
- `scripts/_tmp-csv7/` işini yapan ajan bitirince `pnpm typecheck` tekrar sıfır hata vermeli;
  ben ayrıca doğrulamadım (kendi dosyam değil).
