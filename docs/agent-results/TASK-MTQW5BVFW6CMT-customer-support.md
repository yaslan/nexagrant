# TASK-MTQW5BVFW6CMT + TASK-MTQUS5JH4DXJM — Uydurma veri fallback'lerini sök

**Sprint:** S10 (dogfood P0/P1 düzeltme dalgası) · **Ajan:** customer-support (CS-EN) · **Branch:** `dev` · **Tarih:** 2026-09-07

---

## 1. Ne yapıldı

İki sunucu sayfası, var olmayan ya da **başka kiracıya ait** bir fırsat id'siyle açıldığında 404 vermek yerine
sabit demo verisi ("Fraunhofer Institute", "HORIZON-CL5-2026-D3-01", €412.500'lük bütçe) gösteriyordu.
Kullanıcı gözünde bu, görmeye yetkisi olmayan bir fırsatın gerçek verisiyle birebir aynı görünüyor —
kiracı izolasyonunun kendisi doğru çalışsa bile, ekran yalan söylüyor.

**`src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/page.tsx`**
- Eski satır 53-87'deki `if (!state.opp) { state.opp = {...Fraunhofer...}; state.briefs = [...] }` bloğu kaldırıldı;
  yerine `notFound()` (next/navigation).
- Sorguyu yutan `try/catch` kaldırıldı. Eski kod DB hatasını `console.warn` ile yutup demo veriye düşüyordu;
  artık okunamayan bir veritabanı hata sınırına (`global-error.tsx`) gidiyor. Ayrıca `notFound()` özel bir
  exception fırlattığı için `try/catch` içinde kalsaydı sessizce yutulurdu — kaldırmak bu tuzağı da kapatıyor.
- `state` nesnesi yerine iki düz `const` (`opp`, `briefs`); kardeş sayfaların (`matching`, `evaluations`) deseniyle aynı.

**`src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/page.tsx`**
- Aynı desen: satır 29-63'teki "Fallback demo data if DB is unseeded/offline" bloğu (sahte konsorsiyum bütçesi,
  4 iş paketi, `magicToken: 'partner-access-token-123'` dahil) kaldırıldı; yerine `notFound()`.
- Yutan `try/catch` kaldırıldı. Kullanılmayan `workspace` ve `userId` değişkenleri de temizlendi (lint).
- Tenant kapsamı (`findFirst` + `tenantId`) aynen korundu.

Her iki dosyada da davranışın **neden** böyle olduğu koda yorum olarak yazıldı, ki bir sonraki "DB boşsa doldur"
refleksi aynı yere geri dönmesin.

### Kapsam dışı bırakılanlar (görev kuralı gereği)
`briefs/client.tsx` blok-zincir-dse'ye ait — dokunulmadı. `src/app/[locale]/page.tsx` (pazarlama) ve seed verisi
meşru — dokunulmadı. Grep taramasında bulunan **5 ayrı fallback noktası** benim dosyalarım değil; kart açıldı
(aşağıda, "Riskler" ve "Sonraki adım").

---

## 2. Kanıt

Ortam: `pnpm dev` (:3000), oturum `owner@demo.fabrika.test` → `tenantId=demo-tenant`, workspace `main`.
Test id'leri (DB'den doğrulandı):

| id | sahibi | beklenen |
|---|---|---|
| `demo-opp-1` ("District renovation pilot — İzmir") | `demo-tenant` (oturumun kiracısı) | açılmalı |
| `uydurma-id-123` | yok | 404 |
| `esr-cal-S12` ("Shallow geothermal for district heating") | `esr-calibration` (**başka kiracı**) | 404 |

### 2a. Gerçek tıklama — tarayıcıdan okunan sayfa metni

**Kendi kiracısının geçerli fırsatı → açılıyor, GERÇEK başlıkla:**
```
$ navigate http://localhost:3000/tr/main/opportunities/demo-opp-1/briefs
MODÜL 9 — MEETİNG BRİEFS
Görüşme Brifingi & Not Alma Motoru
Çağrı Fırsatı: District renovation pilot — İzmir      <-- DB'deki gerçek başlık
GÖRÜŞME KAYITLARI (0)
Henüz kayıtlı bir görüşme bulunmuyor.                  <-- boş durum, uydurma brief DEĞİL
```
Eskiden bu ekran "HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems" başlığını ve 1 adet sahte
Fraunhofer brifingini gösteriyordu. `meetingBrief` tablosunda **0 satır** var (SQL ile doğrulandı) — ekran artık
o sıfırı dürüstçe gösteriyor.
→ `TASK-MTQW5BVFW6CMT-screenshots/01-briefs-valid-demo-opp-1-200.png`

**Uydurma id → 404:**
```
$ navigate http://localhost:3000/tr/main/opportunities/uydurma-id-123/briefs
404
Sayfa Bulunamadı
Aradığınız sayfa veya geçerli bağlantı mevcut değil ya da kaldırılmış olabilir.
```
→ `TASK-MTQW5BVFW6CMT-screenshots/02-briefs-bogus-id-404.png`

**Çapraz kiracı id (`esr-cal-S12`, sahibi `esr-calibration`) → 404:**
```
$ navigate http://localhost:3000/tr/main/opportunities/esr-cal-S12/briefs
404
Sayfa Bulunamadı
```
→ `TASK-MTQW5BVFW6CMT-screenshots/03-briefs-cross-tenant-esr-cal-S12-404.png`

Aynı üçlü `application` sayfası için de yapıldı:
→ `04-application-valid-demo-opp-1-200.png` (başlık yine gerçek: "District renovation pilot — İzmir"),
  `05-application-bogus-id-404.png`, `06-application-cross-tenant-esr-cal-S12-404.png`

### 2b. Sunucu yanıtı — oturum çerezli curl

```
$ curl -s -b cookies.txt http://localhost:3000/api/auth/session
{"user":{"name":"Demo Owner","email":"owner@demo.fabrika.test",...},"tenantId":"demo-tenant","role":"TENANT_OWNER"}

demo-opp-1/briefs        HTTP 200
demo-opp-1/application   HTTP 200
uydurma-id-123/briefs    HTTP 200   <-- gövde 404 sayfası, durum kodu yanlış (aşağıya bak)
uydurma-id-123/applicatn HTTP 200
esr-cal-S12/briefs       HTTP 200
esr-cal-S12/application  HTTP 200
```

404 gövdesinin gerçekten 404 sayfası olduğunun ve uydurma verinin kalmadığının doğrulaması:
```
$ grep -c 'Sayfa Bulunamadı'                    nf.txt  ->  1
$ grep -c 'Fraunhofer\|HORIZON-CL5-2026-D3-01'  nf.txt  ->  0
```

### 2c. Kaynak taraması — atanan iki dosyada fallback kalmadı

```
$ grep -n "Fraunhofer\|HORIZON-CL5-2026-D3-01" .../briefs/page.tsx .../application/page.tsx
application/page.tsx:19:  // to render a hard-coded "Fraunhofer Institute" budget and work-package plan,
briefs/page.tsx:26:      // or cross-tenant id with a hard-coded "Fraunhofer Institute" brief, which
```
Kalan iki eşleşme yalnızca **açıklama yorumu**; çalışan kod içinde uydurma veri yok.

### 2d. Kapılar

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok, exit 0)

$ pnpm lint
✖ 201 problems (0 errors, 201 warnings)
```
0 hata — lint kapısı kırmızıya çevrilmedi (201 uyarı önceden de vardı, hepsi başka dosyalarda).

---

## 3. Değişen dosyalar

| dosya | değişiklik |
|---|---|
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/page.tsx` | demo fallback + yutan try/catch kaldırıldı → `notFound()` (100 satır → 62) |
| `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/page.tsx` | demo fallback + yutan try/catch kaldırıldı → `notFound()` (79 satır → 45) |
| `docs/agent-results/TASK-MTQW5BVFW6CMT-screenshots/*.png` | 6 kanıt ekran görüntüsü (yeni) |
| `docs/agent-results/TASK-MTQW5BVFW6CMT-customer-support.md` | bu rapor (yeni) |

Geçici script yazılmadı; sorgular `node -e` ile tek seferlik çalıştırıldı, repoda dosya bırakmadı.

---

## 4. Riskler

1. **`notFound()` HTTP 200 dönüyor (app geneli, P2).** Kullanıcı doğru 404 ekranını görüyor ama sunucu 200
   diyor. Bu **benim değişikliğimin getirdiği bir şey değil** — `notFound()` çağıran eski sayfalar da aynı:
   ```
   uydurma-id-123/matching     HTTP 200   (eski kod)
   uydurma-id-123/evaluations  HTTP 200   (eski kod)
   /tr/main/zzzz               HTTP 404   (eşleşmeyen rota — doğru)
   ```
   Muhtemel sebep: `src/app/not-found.tsx` `[locale]` segmentinin dışında. Arama motorları ve uptime izleme
   için önemli. Kart açıldı: **TASK-MTQYY136Q3CGG**.
2. **Application sayfası hâlâ uydurma rakam gösteriyor — ama istemci tarafında.** Sunucu fallback'i gitti,
   yine de `application/client.tsx` `useState` başlangıç değeri olarak €412.500 bütçe, 60 kişi-ay ve 4 iş paketi
   gömülü tutuyor; `m11` modülü de "3 aktif eşzamanlı yazar / Prof. Klaus Müller (Fraunhofer)" uyduruyor.
   Kanıt: `applicationPart` tablosunda **0 satır** varken ekran dolu görünüyor
   (`04-application-valid-demo-opp-1-200.png`). Bu dosyalar bana verilmedi, dokunmadım.
3. **`/api/v1/partners` uydurma İSTATİSTİK servis ediyor.** Tablo boşsa `projectCount: 1420`,
   `totalEuContributionEur: 840500000`, `networkCentralityScore: 0.98` döndürüyor. CLAUDE.md §7'nin
   (kanıt disiplini) doğrudan ihlali ve 1. maddeden daha ağır, çünkü rakamlar API'den çıkıyor.
   2 + 3 ve iki nokta daha için kart açıldı: **TASK-MTQYXISOPUJ53** (P1, 5 nokta).
4. **Kök `not-found.tsx` i18n'siz.** "Sayfa Bulunamadı" / "Ana Sayfaya Dön" sabit Türkçe — İngilizce
   arayüzde de Türkçe çıkıyor (CLAUDE.md §8). TASK-MTQYY136Q3CGG'ye dahil edildi.
5. **Paralel dalga çakışması.** Doğrulama sırasında `pipeline/[id]/client.tsx` bir an derlenmedi
   (`Export evaluateOpportunityGate doesn't exist`) — başka bir ajanın yarım yazımıydı, kendi kendine düzeldi.
   Benim dosyalarımla ilgisi yok; son `typecheck` + `lint` temiz.

---

## 5. Açık sorular

1. **Workspace kapsamı eklenmeli mi?** Kardeş `matching/page.tsx` fırsatı `{ id, tenantId, workspace: { slug } }`
   ile arıyor; benim iki sayfam `{ id, tenantId }` ile. Bu, uygulamada zaten bilinen ve **kasıtlı** bir durum:
   `requireTenantPage` yalnız locale alır, kiracıyı oturumdan çözer, yoldaki `[workspace]` segmenti hiç
   okunmaz (takım hafızası: `fabrika-workspace-url-segment-is-decorative`). Güvenlik açısından belirleyici
   olan `tenantId` ve o yerinde. Yani yeni bir açık değil — yalnızca iki sayfanın kardeşleriyle tutarsız
   olduğu bir üslup farkı. Kapsam dışı gördüğüm için değiştirmedim; tutarlılık istenirse tek satırlık ek.
2. `MeetingBrief` tablosunda `opportunityId` kolonu **yok**, bu yüzden brifingler yalnız kiracıyla filtrelenebiliyor:
   aynı kiracının A fırsatının sayfasında B fırsatının brifingleri de listeleniyor. Şema değişikliği gerektirdiği
   için bu görevde çözülemez — ayrı bir karar.
3. Fallback verisindeki `magicToken: 'partner-access-token-123'` ortak portalına gerçekten gidiyor muydu?
   Kod artık kaldırıldı, ama aynı sabit token başka yerde de üretiliyorsa güvenlik incelemesi gerekir.

---

## 6. Sonraki adım

- **TASK-MTQYXISOPUJ53** (P1) — kalan 5 uydurma-veri noktası: `api/v1/partners` (+`[pic]`),
  `application/client.tsx`, `m11/types.ts` + `PartBCollaborativeEditor.tsx`, `dashboard/client.tsx`,
  `notifications/page.tsx`. Atanmayı bekliyor.
- **TASK-MTQYY136Q3CGG** (P2) — `notFound()` → HTTP 404 + 404 ekranının i18n'i.
- Regresyon koruması olarak, "uydurma id → 404" ve "çapraz kiracı id → 404" için bir e2e testi
  (`tests/e2e/rls.spec.ts` yanına) eklenmesi öneriliyor; bu görevin kapsamında test dosyası yoktu.
