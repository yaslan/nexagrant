# TASK-MTQYXISOPUJ53 — Uydurma veri fallback'leri: kalan noktalar (client + API + dashboard)

**Ajan:** customer-support (CS-EN) · **Tip:** bug/P0 · **Tarih:** 2026-09-07 · **Dal:** dev

---

## 0. Kart doğruluğu — önce ölçtüm

Kart "kalan 5 nokta" diyor. Kendi taramamla **benim şeridimde 8 nokta** buldum; kartın
saydığı iki nokta ise **artık yok** (bayat):

| Kart iddiası | Ölçüm |
|---|---|
| `/api/v1/calls` gömülü demo satırı | **BAYAT** — TASK-MTRKVJKE14KVR'de temizlenmiş; `src/app/api/v1/calls/route.ts` gerçek `Topic → Call → Programme` sorgusu yapıyor, hata 500 dönüyor |
| `dashboard/client.tsx` (~122) ülke dağılımı | **BAYAT** — böyle bir dosya yok; `dashboard/page.tsx:72` sorgu patlarsa uydurma değil `<Notice>` döndürüyor |
| "5 nokta" | **YANLIŞ SAYIM** — şeridimde 7 nokta buldum, 8.'sini ekran görüntüsünden yakaladım (aşağıda) |

**Benim şeridimde OLMAYAN, dokunmadım** (başka kartın): `pipeline/[id]/consortium/page.tsx:29`
`DEMO_OPPORTUNITIES` (2. kart) · `settings/billing/BillingClient.tsx:77` `DEMO_INVOICES` (4. kart).

---

## 1. Ne yapıldı

Sekiz uydurma-veri noktası söküldü. İlke (patron kararı): **gerçek kayıt yoksa sahte üretme** —
boş durum ya da hata göster; sessizce yutulan hatada `SystemAlert` üret (CLAUDE.md kural 6).

| # | Nokta | Neydi | Ne oldu |
|---|---|---|---|
| 1 | `src/app/api/v1/opportunities/route.ts:66` | Sorgu patlarsa **ya da tenant'ın hiç fırsatı yoksa** iki demo fırsat (€4.2m "G1 Consortium Gate") — 200 OK. Üstelik demo satırların alanları (`currentGate`, `targetBudgetEur`…) `model Opportunity`'de yok, yani yayınlanan sözleşme DB'nin sağlığına göre şekil değiştiriyordu | Demo dizisi kaldırıldı, union tip tek gerçek şekle indi; boş = `data: []`, patlayan sorgu = **500 `OPPORTUNITIES_QUERY_FAILED`** |
| 2 | `.../partners/page.tsx:8,287` | `DEMO_CORDIS_PARTNERS` — 6 uydurma Türk kurumu (METU "84 proje / €24.5m", ARÇELİK "€260m"); iki sorgu da boş dönünce `dataSource='demo_cordis_dataset'` ile servis ediliyordu | Sabit ve 3. fallback silindi; iki `catch` artık `recordAlert` yazıyor + sayfada uyarı bandı; var olan boş durum ekranı devrede |
| 3 | `.../partners/page.tsx` (2. fallback) | `CordisOrganization` satırları `totalProjects: 1, coordinatorProjects: 0, totalEcContribution: BigInt(0)` diye normalize ediliyordu — bilinmeyen bir katılım sayısını "1" yazmak da uydurmadır | Üçü de `null`; tabloda `—`. `p.coordinatorProjects \|\| 0` kalıbı kaldırıldı |
| 4 | `.../opportunities/[id]/documents/page.tsx:31` | `try/catch` sorguyu yutuyor, `!opp` ise sabit NDA + LOI + **"Komisyon ESR Puanı: 13.5 / 15.0 · FonBridge Teknoloji A.Ş."** TÜBİTAK ödül paketi — **herhangi bir** (başka kiracıya ait dahil) fırsat id'si için | Fallback ve `try/catch` birlikte silindi (`notFound()` throw eder, catch onu yutar), `notFound()` |
| 5 | `.../notifications/page.tsx:12-88` | Dört bildirim kodda üretiliyordu ("%92 eşleşme", "SME Beyannamesi 15 gün içinde doluyor", "500 AI Kredisi yüklendi"). Şemada **hiç** notification modeli yok — bu bir fallback değil, tamamı uydurma | `initialNotifications={[]}` + client'a boş durum eklendi |
| 6 | `src/components/UserMenu.tsx:156` | **Aynı ailenin 8. üyesi, ekran görüntüsünden yakalandı:** bildirim sayfasını temizledikten sonra çektiğim karede üst bardaki zil hâlâ kırmızı nokta ile atıyordu — app shell'de üç uydurma bildirim daha vardı, yani **ürünün her sayfasında** | Liste boşaltıldı (memo korundu — render döngüsü sebebiydi), açılır menüye boş durum |
| 7 | `.../reports/person-days/page.tsx:6` | `MOCK_REPORTS` — Alice 12.5s, Bob 8s, Charlie 16s; sayfa **hiç sorgu yapmıyordu**, her kiracı aynı 40.5 saat / 5.1 AG'yi görüyordu, link `../pipeline/mock_id` | Gerçek `Effort` sorgusu (`withTenant`, `deletedAt: null`), saf `groupEffortByOpportunity`/`toPersonDays` fonksiyonları, boş durum, hata bandı + `recordAlert`, gerçek fırsat linki |
| 8 | `.../opportunities/[id]/application/client.tsx:62,71,79` | Sunucu sayfası temizlenmişti ama **istemci mount'ta yeniden uyduruyordu**: `|| [...]` ile €412.500'lük Fraunhofer/Demo SME bütçesi + 4 WP'lik Gantt; WP formu "WP3 / Fraunhofer Institute / D3.1 Thermal Pilot" dolu açılıyordu (bir Enter uzaklıkta kiracının başvurusuna yazılırdı) | Başlangıç dizileri `[]`, form alanları boş, iki tabloya boş durum; `travel` varsayılanı `'2500' → '0'` |
| 9 | `src/modules/m10/server/actions.ts:69` | **Ailenin en ağırı:** LLM çağrısı patlarsa `kind` başına sabit hukuki belge üretiliyor, `FollowupDoc`'a **yazılıyor** ve **1 AI kredisi düşülüyordu** — imzalanıp konsorsiyuma gidecek bir belgede uydurma ESR puanı (13.5/15.0, 4.5 excellence) ve uydurma şirket adı | `catch` uydurmuyor: `recordAlert` + throw. Boş completion da aynı muamele. Belge yazılmıyor, kredi düşülmüyor. Başarılı yol aynen çalışıyor (testle sabitlendi) |

---

## 2. Kanıt

### 2.1 Öncesi/sonrası — API (gerçek test koşusu)

Yeni testi **düzeltmeden önceki** route'a (HEAD sürümü) karşı koşturdum:

```
$ npx vitest run tests/api/tmp-before-v1-opportunities.test.ts
AssertionError: expected [ { id: 'opp-demo-1', …(7) }, …(1) ] to deeply equal []
AssertionError: expected 200 to be 500 // Object.is equality
 Tests  2 failed | 3 passed (5)
```

Düzeltmeden sonra, aynı testler:

```
$ npx vitest run tests/api/v1-opportunities.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### 2.2 Öncesi/sonrası — kaynak koruyucular (HEAD sürümlerine karşı ölçüm)

Her koruma testi, **yorumları ayıklayıp** (düzeltilen dosyalar sildikleri metni yorumda
alıntılıyor) kodda arıyor. HEAD sürümleri:

```
BEFORE partners_page.tsx:       5/5 uydurma dizgi KODDA mevcut -> koruma FAIL
BEFORE documents_page.tsx:      4/4 uydurma dizgi KODDA mevcut -> koruma FAIL
BEFORE notifications_page.tsx:  3/3 uydurma dizgi KODDA mevcut -> koruma FAIL
BEFORE person-days_page.tsx:    3/3 uydurma dizgi KODDA mevcut -> koruma FAIL
BEFORE application_client.tsx:  3/3 uydurma dizgi KODDA mevcut -> koruma FAIL
BEFORE m10_server_actions.ts:   3/3 uydurma dizgi KODDA mevcut -> koruma FAIL
```

Sonrası:

```
$ npx vitest run tests/fabricated-fallbacks.test.ts
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

M10 tarafı **grep değil davranış** testi: `generateText` throw ettiğinde `followupDoc.create`
ve `creditLedger.create` **hiç çağrılmıyor**, `recordAlert` `m10_document_generation_failed`
ile çağrılıyor; başarılı yolda ikisi de sırayla çağrılıyor (dikkatsiz düzeltmenin kıracağı yarı).

### 2.3 Gerçek tarayıcı (Playwright, gerçek tıklama)

```
$ npx playwright test tests/e2e/fabricated-fallbacks.spec.ts
  ✓ person-days report › a workspace with logged effort shows its own figure, not the mock array
  ✓ person-days report › a workspace with no effort says so instead of borrowing someone else's
  ✓ notifications › none of the four invented notifications is rendered
  ✓ notifications › the header bell does not carry its own invented feed either
  4 passed (5.5s)
```

Ekran görüntüleri: `docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/`
- `person-days-real-effort.png` — f10-full-ws: **"F10 — renovation pilot · 40 saat · 5.0 AG"**
  (fixture'daki tek gerçek `Effort` satırı). Mock dizisi hiçbir zaman bu rakamı üretemezdi.
- `person-days-empty.png` — f10-empty-ws: "Henüz efor kaydı yok."
- `notifications-empty.png`, `notification-bell-empty.png` — sayfa **ve** zil boş; zilin
  kırmızı atan noktası gitti.

Not: iki halin birden test edilmesi kasıtlı — "her şeyi gizle" ucuz düzeltmesi gerçek veriyi
de gizler; efor **olan** çalışma alanı kendi rakamını göstermeye devam ediyor.

### 2.4 Fallback'i ayakta tutan yeşil test

`tests/api/v1-partners.test.ts:195` `opportunity.findMany` mock'u `[]` dönerken
`data.length > 0` bekliyordu — **yalnızca demo dizisi sayesinde** geçiyordu. Gevşetmedim;
gerçeğe göre düzelttim (`data` boş, `meta.total === 0`), aynı dosyadaki `/api/v1/calls`
kardeşinde daha önce yapılmış düzeltmeyle aynı biçimde.

### 2.5 Kapılar

```
$ npx tsc --noEmit          → benim dosyalarımda 0 hata
$ npx eslint <9 dosya>      → 0 error (8 warning: hepsi önceden var olan kullanılmayan import)
$ npx vitest run            → Tests 4 failed | 1038 passed | 8 skipped (1050)
```

**Kırmızı satır benim değil:** dört FAIL'in tamamı `tests/m11-partb-editor-buffer.test.tsx` —
`PartBCollaborativeEditor.tsx:114` `useTranslations('UserIdentity')` için next-intl context'i
yok. O dosya blockzincir-pm'in uçuştaki işi; ben dokunmadım.
`npx tsc` ayrıca `scripts/_probe-cordis*.ts` ve `scripts/_probe-k2-stub.ts` için 6 hata veriyor —
bunlar 22:38–22:42 arası başka bir ajanın oluşturduğu **untracked** taslak dosyalar, benim değil.

---

## 3. Değişen dosyalar

**Kod**
- `src/app/api/v1/opportunities/route.ts`
- `src/app/[locale]/(app)/[workspace]/partners/page.tsx`
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/page.tsx`
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/application/client.tsx`
- `src/app/[locale]/(app)/[workspace]/notifications/page.tsx`, `.../notifications/client.tsx`
- `src/app/[locale]/(app)/[workspace]/reports/person-days/page.tsx`
- `src/components/UserMenu.tsx`
- `src/modules/m10/server/actions.ts`

**Test**
- `tests/api/v1-opportunities.test.ts` (yeni), `tests/fabricated-fallbacks.test.ts` (yeni)
- `tests/e2e/fabricated-fallbacks.spec.ts` (yeni)
- `tests/api/v1-partners.test.ts` (fallback'e dayanan yeşil test düzeltildi)

**Kanıt**: `docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/*.png`

---

## 4. Riskler

- **`/api/v1/opportunities` artık 500 dönebiliyor.** Daha önce DB düşse bile 200 OK + demo
  satır dönüyordu; bu yüzden sağlıklı görünen bir entegrasyon şimdi gerçek hatayı görecek.
  İstenen davranış bu, ama bir tüketici varsa uyarılmalı.
- **M10 belge üretimi artık LLM patlayınca throw ediyor.** Kullanıcı belge yerine hata
  görecek — ama kredisi düşmeyecek ve uydurma bir hukuki metin imzalamayacak.
- `.../partners/page.tsx` ve `person-days` sayfaları hâlâ `isTr ? … : …` ternary'leriyle
  yazılmış (CLAUDE.md kural 8 `t('...')` istiyor). Bu kartın kapsamı değil; person-days'te
  zaten dokunduğum satırları en azından iki dile çevirdim.

---

## 5. Açık sorular / başkasının kartındaki bulgular (dokunmadım, bildiriyorum)

1. `src/modules/m11/types.ts:130,222,234` — `DEFAULT_PART_B_SECTIONS` sabiti "Dr. Mehmet Yılmaz /
   Prof. Klaus Müller / Fraunhofer Institute" imzalı hazır Part B metni taşıyor ve
   `src/app/api/documents/export/route.ts` ile `PartBCollaborativeEditor.tsx` tarafından
   kullanılıyor. **Aynı ailedendir** ama iki tüketicisi de blockzincir-pm'in uçuştaki
   dosyaları olduğu için dokunmadım.
2. `src/modules/m10/server/actions.ts:~110` — `const mockUrl =
   \`https://storage.fabrika.app/docs/…\``; `FollowupDoc.contentUrl`'e hiçbir yere çıkmayan
   bir URL yazılıyor. Bu bir fallback değil, eksik obje-depolama özelliği; ayrı kart konusu.
3. `FollowupDoc` tablosunda `contentText` **kolonu yok** ama `DocItem.contentText` ile önizleme
   yapılıyor. Demo fallback bu alanı sağlıyordu; artık gerçek satırlarda önizleme boş kalacak.
   Ayrı iş.
4. `.../partners/page.tsx:~330` başlıkta "150.000+ Avrupalı ve Türk kurum" yazıyor — kaynağı
   olmayan bir istatistik (kural 7). Pazarlama metni olduğu için bu kartta değiştirmedim.
5. `tests/m11-partb-editor-buffer.test.tsx` 4 FAIL — `PartBCollaborativeEditor.tsx:114`.
   Benim değil.

---

## 6. Sonraki adım

- Yukarıdaki 1 ve 3 numaralı bulgular için kart açılması (m11 dosyaları serbest kaldığında).
- `partners` ve `person-days` sayfalarının `t('...')`'e geçirilmesi (i18n kartı).

---

## 7. Definition of Done

- [x] Her nokta dosya:satır ile listelendi; kartın "5" sayımı ölçümle düzeltildi (8 nokta + 2 bayat iddia)
- [x] Gerçek kayıt yoksa uydurma yok: boş durum / 404 / 500
- [x] Sessizce yutulan hatalarda `SystemAlert` (`recordAlert`) — partners (2 nokta), person-days, m10
- [x] Her düzeltilen nokta için birim test (17 + 6 test)
- [x] Öncesi/sonrası ölçüm satırı (§2.1, §2.2)
- [x] Gerçek tıklamalı e2e + ekran görüntüsü (4 test, 4 png)
- [x] Fallback'i ayakta tutan yeşil test gevşetilmeden gerçeğe göre düzeltildi
- [x] `tsc` ve `eslint` benim dosyalarımda temiz; kırmızı satırlar başka ajanların dosyalarında ve öyle raporlandı
