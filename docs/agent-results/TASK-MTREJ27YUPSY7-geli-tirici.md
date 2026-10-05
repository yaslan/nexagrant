# TASK-MTREJ27YUPSY7 — Lint borcu (3. deneme)

**Ajan:** BE-EN (`geli-tirici`) · **Not:** kart META'sı bu işi **EX-EN**'e veriyor; iş
bana canlı mesajla verildiği için yürütüldü. **Commit:** kaynak düzeltmeleri `4edaecc`
içinde (aşağıda "Riskler"e bakın), i18n anahtarları `466a20e`.

## 0. Ölçüm — kartın hangi iddiası doğru, hangisi değil

Karta başlamadan kendi komutumla ölçtüm:

```
$ pnpm lint
✖ 80 problems (0 errors, 80 warnings)

kural dağılımı:
  79  @typescript-eslint/no-unused-vars
   1  react-hooks/exhaustive-deps
```

- Kartın **başlığı doğru**: `no-img-element` gerçekten **0**; `next/image` migrasyonu
  gerekmiyor. Kartın **gövdesindeki** "Kalan 107 / 16 `no-img-element`" tablosu **eski
  ve yanlış**, ona göre çalışılmadı.
- Başlıktaki "82" ile ölçtüğüm "80" farkı, ölçüm anından beri inen commit'lerden.
- **Önemli:** hepsi `warning`, **0 error**. `pnpm lint` **exit 0** dönüyor — yani bu bir
  kırık kapı değil, hijyen borcu. Raporda bunu abartmıyorum.

Dosya sahipliği ölçümü (5 ajan paralel):
```
YASAK bölgelerdeki bulgu sayısı: 0   ← çakışma yok, iş güvenle yapılabilir
Başka ajanın commit'lenmemiş işi olan dosyalar: 4 (12 bulgu)
```

## 1. Ne yapıldı — 80 → 17

Bulguları körlemesine `_` ön ekiyle susturmadım. Her birini okuyup üçe ayırdım:
**ölü kod (sil)**, **kasıtlı yutma (`catch` bağlamasını kaldır)**, **gerçek hatanın
belirtisi (düzelt)**. Üçüncü grup bu işin asıl değeri:

| Bulgu | Neyi saklıyordu | Yapılan |
|---|---|---|
| `t` unused, `calls/page.tsx` | Sayfa çeviriciyi yüklüyor, sonra **sabit İngilizce** basıyordu ("Fund Calls"). CLAUDE.md §8 ihlali. `t`'yi silmek ihlali kalıcılaştırırdı. | `callsIndex` anahtarları eklendi (tr+en), sayfa `t()` kullanıyor |
| `isGeneratingChecklist` unused, `tto/client.tsx` | Setter iki yerde çağrılıyor ama **değer hiç okunmuyordu** → AI çağrısı sırasında buton boşta görünüyor, tekrar tekrar tıklanabiliyordu. Her tık **kredi düşürür** (CLAUDE.md §5). | Buton `disabled` + "Üretiliyor..." |
| `hasSubscription` unused, `BillingActions.tsx` | Aboneliği olmayana da "Manage Subscription" gösteriliyordu | Prop artık butonu koşula bağlıyor |
| `pageNumber` unused, `api/cagrilar/route.ts` | Route `?page=` kabul ediyor ama `SediaAdapter.searchSedia` **sayfa argümanı almıyor**; kendi içinde 1..maxPages geziyor ve hep `pageNumber: 1` döndürüyor. Değişkeni parse etmek sayfalama varmış izlenimi veriyordu. | Ölü local silindi, **yerine durumu anlatan yorum** kondu (bilgi kaybolmasın) |
| `tenantId` + `userId` props, `api-keys/client.tsx` | Sunucudan client component'e kiracı kimliği geçiliyor, hiç okunmuyordu — client'ın kiracı taşıması bir footgun | Prop'lar arayüzden, destructure'dan **ve çağıran sayfadan** kaldırıldı; `tenantId` `settings/modules` için de aynı |
| `adminNavItems` unused, `admin/layout.tsx` | Nav dizisi `<AdminSidebarNav />` tarafından zaten render ediliyor; bu ikinci bir kopyaydı | 50 satırlık ölü kopya + artık kullanılmayan 6 ikon import'u silindi |

Kalanlar: ölü import'lar (lucide ikonları, `prisma`, `getAllManifests`, `mapProjectRow`…),
kullanılmayan `catch (e)` bağlamaları (**8 adet** — hepsi yorumlu/fallback'li kasıtlı
yutmalar, ES2022 `catch {` deseniyle), ve test fixture'larının okunmayan binding'leri.

## 2. Kanıt (kopyalanmış gerçek çıktı)

```
$ pnpm lint          (ÖNCE)     ✖ 80 problems (0 errors, 80 warnings)
$ pnpm lint          (SONRA)    ✖ 17 problems (0 errors, 17 warnings)

$ npx tsc --noEmit               → 0 hata (yalnız scripts/_probe-*.ts, ÖNCEDEN vardı, benim değil)

$ npx vitest run
 Test Files  1 failed | 93 passed | 2 skipped (96)
      Tests  4 failed | 1038 passed | 8 skipped (1050)

$ npx playwright test tests/e2e/rls.spec.ts tests/e2e/m6-evaluator.spec.ts --reporter=line
  9 passed (6.5s)
```

**4 kırık test BENİM DEĞİL:** hepsi `tests/m11-partb-editor-buffer.test.tsx` içinde ve
`useTranslations` için `NextIntlClientProvider` context'i bulunamamasından. O test
dosyası benim dokunduğum hiçbir dosyayı import etmiyor (`import` satırları: react,
vitest, testing-library, `@/modules/m11/types`, `@/modules/m11/ui/PartBCollaborativeEditor`).
Değişikliklerimden ÖNCE de aynı 4 test aynı hatayla kırıktı.

**Public calls sayfası gerçek tarayıcıda doğrulandı** (i18n anahtarı eksikse sayfa
runtime'da patlar, typecheck bunu yakalamaz):
```
$ npx playwright test  (geçici spec)
  2 passed (2.3s)
   /tr/calls  h1 == "Fon Çağrıları"  + alt başlık görünür
   /en/calls  h1 == "Fund Calls"
```
Ekran görüntüsü: `docs/agent-results/TASK-MTREJ27YUPSY7-screenshots/calls-tr.png`
(geçici spec çalıştırma sonrası silindi).

**Hydration uyarısı benim değil:** `/tr/calls`'ta dev-mode hydration uyarısı var; aynı
uyarı hiç dokunmadığım `/tr/privacy`'de de çıkıyor (ölçüldü: 1 adet). Repo geneli,
önceden var.

## 3. Değişen dosyalar
31 dosya. Kabaca: `src/app/[locale]/**` (admin layout/cordis/settings/tenants/blog/login,
calls, portal, api-keys, modules, tto, relationships, documents), `src/app/api/cagrilar/route.ts`,
`src/components/{BillingActions,CookieConsent}.tsx`,
`src/lib/{document-exporter,storage,translation,modules/state-machine,k2-cordis/partnerProfileJob}.ts`,
`src/modules/m5/server/queries.ts`, `tests/{e2e/rls.spec.ts,modules/m11.test.ts,modules/module-gate-coverage.test.ts,cordis-import.test.ts}`,
`messages/{tr,en}.json` (`callsIndex`).

## 4. Riskler
- **Commit atfı:** kaynak düzeltmelerim, ben stage'lerken başka bir ajanın `git add -A`
  içeren commit'ine (`4edaecc fix(m9): …`) süpürüldü. Kod depoda ve doğru; ama commit
  mesajı bu işi anlatmıyor. Paylaşılan ağaçta 5 ajan çalışırken geçmişi yeniden yazmak
  yıkıcı olacağından **düzeltmeye kalkışmadım**, burada beyan ediyorum.
- `api-keys/client.tsx` ve `settings/modules/client.tsx` prop imzaları daraldı; bu
  bileşenleri başka bir çağıran varsa (grep ile yok) kırılır.
- `rls.spec.ts`'te binding kaldırırken **bir hata yaptım ve düzelttim**: `wsA`/`wsB`
  dosyada iki kez geçiyor; ilk (KULLANILAN) tanımı sıyırmıştım. Fark edildi, geri
  alındı, doğru olanlar sıyrıldı; 9 e2e yeşil, diff'te tam olarak 5 satır var.

## 5. Açık sorular / devredilenler

**Kalan 17 bulgu — kasıtlı bırakıldı, sebebiyle:**

| Adet | Dosya | Neden dokunulmadı |
|---|---|---|
| 8 | `opportunities/[id]/application/client.tsx` | başka ajanın commit'lenmemiş işi |
| 2 | `src/components/UserMenu.tsx` | başka ajanın commit'lenmemiş işi |
| 1 | `scripts/test-partners-api.ts` | başka ajanın commit'lenmemiş işi |
| 1 | `src/lib/k2-cordis/importer.ts` | başka ajanın commit'lenmemiş işi |
| 2 | `documents/client.tsx` — `submitDualApprovalAction`, `departmentApproveAction` | `src/modules/m10/**` **yasak bölge** ve `m10/server/actions.ts` şu an başka ajanda; bu iki import 4-göz onay akışının UI'a bağlanmasını bekliyor. Import'u silmek, o ajanın eklemek üzere olduğu çağrı yerini silmek olabilirdi. |
| 2 | `m11/ui/PartBCollaborativeEditor.tsx` | M11 aktif; ayrıca `exhaustive-deps` düzeltmesi (`useCallback`) davranış değiştirir, sahibinin işi |
| 1 | `briefs/client.tsx` | M9 ajanı brief/takvim üzerinde aktif |

**Bu iş sırasında bulunan, bu kartın kapsamı DIŞINDA kalan gerçek hatalar** (ayrı task
açılmalı, kanıtı elimde):
1. `settings/api-keys/page.tsx:51` → `if (!apiKeys || apiKeys.length === 0) apiKeys = demoApiKeys();`
   — **boş API anahtarı listesi uydurma anahtarlarla dolduruluyor.** CLAUDE.md §7 ihlali,
   M6'da az önce düzelttiğim uydurma deseninin aynısı.
2. `src/lib/storage.ts:75` → S3 hatasında **sahte bir mock upload URL'i** dönüyor;
   yükleme çalışmış gibi görünüyor.
3. `/tr/calls` ekran görüntüsünde görünen ikisi: ülke başlığı ham kod basıyor
   (**"48080589"**, `country === 'TR' ? … : country`), ve bütçesi bilinmeyen çağrı
   **"0 EUR"** gösteriyor — yine "yok" yerine "0".
4. `src/app/[locale]/(app)/[workspace]/tto/client.tsx` tamamen sabit Türkçe metin
   (`useTranslations` yok) — i18n borcu, tek başına bir kart.

## 6. Sonraki adım
- Kalan 12 bulgu, sahibi ajanlar işlerini commit'ledikten sonra tek bir küçük geçişte
  temizlenebilir.
- Yukarıdaki 4 madde için ayrı task; özellikle (1) ve (2) kullanıcıya yalan söyleyen
  davranışlar.
