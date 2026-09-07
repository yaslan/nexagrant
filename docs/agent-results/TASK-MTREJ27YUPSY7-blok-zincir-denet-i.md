# TASK-MTREJ27YUPSY7 — Lint borcu: ölçüm + BAŞLATILMADI (kartın kendi ön koşulu tutmuyor)

**Ajan:** blok-zincir-denet-i (QA / Test Mühendisi)
**Tarih:** 2026-09-07
**Branch:** dev
**Durum:** ⛔ **Süpürme yapılmadı** — kart "başlamadan `git status` ile ağacın temiz olduğunu doğrula,
değilse **bekle**" diyor; ağaç temiz değil. Aşağıda taze ölçüm ve devralacak kişiye harita var.

---

## 1. Ne yapıldı

1. Kartın sayısını **yeniden ölçtüm** (kart "82 uyarı" diyordu).
2. Kartın ön koşulunu (`git status` temiz) kontrol ettim → **tutmuyor**, süpürmeye başlamadım.
3. Kendi kartımın (TASK-MTQ63RR8Z0G8E) dosyasındaki **1 uyarıyı** kapattım.
4. Bu kartın geçmiş bir teslimatının ürettiği **P0 bir regresyonu** bulup düzelttim (§3).

## 2. Kanıt

### 2.1 Taze ölçüm

```
$ pnpm lint
✖ 80 problems (0 errors, 80 warnings)

$ pnpm lint | rule dağılımı
  79 @typescript-eslint/no-unused-vars
   1 react-hooks/exhaustive-deps
```

Kart "82" diyordu; bugün **80** (1'i benim kapattığım, 1'i başka bir ajanın işinden).
`@next/next/no-img-element` sayısı **0** — kart bu konuda haklı, o iş inmiş (ama bkz. §3).

Dosya başına dağılım (39 dosya, ilk 14):

```
8  src/app/[locale]/(app)/[workspace]/settings/api-keys/client.tsx
8  src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx
7  src/app/[locale]/login/AuthCard.tsx
7  src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/client.tsx
5  tests/e2e/rls.spec.ts
3  tests/modules/m11.test.ts
3  src/components/BillingActions.tsx
3  src/app/[locale]/admin/cordis/client.tsx
2  tests/modules/module-gate-coverage.test.ts
2  src/modules/m5/server/queries.ts
2  src/modules/m11/ui/PartBCollaborativeEditor.tsx
2  src/lib/storage.ts
2  src/components/UserMenu.tsx
2  src/app/[locale]/admin/tenants/page.tsx
```

### 2.2 Ön koşul tutmuyor — süpürme neden başlamadı

`git status --short` şu an **30 değiştirilmiş + 20'den fazla izlenmeyen** dosya gösteriyor; bunlar
başka ajanların uçuştaki işi. Yukarıdaki lint listesindeki dosyaların en az 6'sı **şu anda başka bir
ajan tarafından değiştirilmiş durumda**:

```
M src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx   (8 uyarı)
M src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/page.tsx
M src/components/UserMenu.tsx                                                    (2 uyarı)
M src/modules/m11/ui/PartBCollaborativeEditor.tsx                                (2 uyarı)
M src/lib/document-exporter.ts                                                   (1 uyarı)
M src/modules/m5/server/queries.ts                                               (2 uyarı)
```

Bu dosyalara ~30 dosyalık bir süpürmeyle girmek, ekip hafızasındaki iki kayıtlı tuzağın ikisini de
tetikler (`fabrika-parallel-agent-file-race`, `fabrika-agents-share-one-working-tree`): yazdığım
içerik `git add`'e kadar hayatta kalmaz ve başkasının yarım işini yutarım. Kartın kendi talimatı da
bu yüzden "bekle" diyor.

### 2.3 Kapattığım tek uyarı (kendi kartımın dosyası)

`src/app/[locale]/(app)/[workspace]/pipeline/board.tsx:395` — `'title' is defined but never used`.
`GATES[].title` alanı hiçbir yerde render edilmiyordu (kolon başlığı `key` + `subtitle` çiziyor);
`_` ön eki takmak yerine **ölü alanı sildim** (tip, 5 veri satırı ve destructure).

```
$ npx eslint "src/app/[locale]/(app)/[workspace]/pipeline/"
(0 problem)
```

---

## 3. Bu kartın geçmiş teslimatının ürettiği P0 regresyon — düzeltildi

**Bulgu:** `ca73ced` ("refactor: migrate 16 `<img>` elements to next/image with width/height/fill
props") 16 `no-img-element` uyarısını temizledi, ama `next.config.ts`'e `images.remotePatterns`
eklemedi. Blog görselleri uzak (`images.unsplash.com`) ve `next/image` listelenmemiş host'ta **hata
fırlatır** → herkese açık açılış sayfası ve blog **500** vermeye başladı.

**Tekrar-üretim / gözlenen (düzeltme öncesi):**

```
$ for u in /tr /en /tr/blog /tr/fiyatlandirma; do curl -s -o /dev/null -w "%{http_code}  $u\n" localhost:3000$u; done
500  /tr
500  /en
500  /tr/blog
200  /tr/fiyatlandirma
```

Dev sunucu logu:
`⨯ Error: Invalid src prop (https://images.unsplash.com/photo-1522071820081-…) on 'next/image',
hostname "images.unsplash.com" is not configured under images in your next.config.js`

**İkincil etki:** Playwright'ın `webServer.url` hazırlık probu 400'ün altında statü göremediği için
`pnpm test:e2e` **hiç başlayamıyordu** (`Error: Process from config.webServer was not able to start`)
— yani depodaki tüm e2e kapısı kapalıydı.

**Düzeltme:** `next.config.ts` → `images.remotePatterns: [{ protocol: 'https', hostname:
'images.unsplash.com' }]`. Joker değil, host host: admin blog formuna yapıştırılan rastgele bir URL
image optimizer'dan geçmesin.

**Doğrulama (aynı komut, düzeltme sonrası):**

```
307  /
200  /tr
200  /en
200  /tr/blog
```

**Ders (ekip hafızasına yazıldı):** bir lint uyarısını "temizlemek" ürünü kırabilir; `no-img-element`
düzeltmesi yapılandırma değişikliği olmadan tamamlanmış sayılmaz ve DoD'da gerçek sayfa açılışı
görülmeliydi — "0 uyarı" tek başına kanıt değil.

---

## 4. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `next.config.ts` | `images.remotePatterns` (§3 P0 regresyonu) |
| `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx` | ölü `GATES[].title` silindi → 1 uyarı kapandı |

`scripts/test-partners-api.ts`: hâlâ **git'e girmemiş** (`?? scripts/test-partners-api.ts`),
sahibi belirsiz — kartın dediği gibi dokunmadım.

## 5. Riskler

- Kalan 80 uyarının 79'u `no-unused-vars`. Bunları "sil" ile kapatmak **davranış değiştirebilir**
  (bir değişkeni silmek yan etkili bir çağrıyı da silebilir); süpürmeyi yapan kişi dosya başına
  `pnpm typecheck` + ilgili testi koşmalı.
- Tek `react-hooks/exhaustive-deps` uyarısı bağımlılık ekleyerek çözülmeli; bağımlılık eklemek
  render döngüsü açabileceği için o dosyanın e2e'siyle doğrulanmalı.

## 6. Açık sorular

- Süpürme ne zaman yapılsın? Ağacın temizlendiğini gören lider tek bir ajana kilitli pencere vermeli;
  paralel çalışırken 39 dosyaya dokunmak güvenli değil.

## 7. Sonraki adım

Ağaç temizlendiğinde: yukarıdaki dosya listesini yüksekten alçağa süpür, her dosyadan sonra
`pnpm typecheck`, sonunda `pnpm lint` = 0 + `pnpm test` yeşil. Bu iş **bu raporla birlikte hâlâ açık**.

## Yayına uygun mu?

Lint borcu için **karar verilemez** — iş başlatılmadı. §3'teki P0 regresyon düzeltildi ve
doğrulandı; o olmadan hem herkese açık sayfa hem e2e kapısı kırıktı.
