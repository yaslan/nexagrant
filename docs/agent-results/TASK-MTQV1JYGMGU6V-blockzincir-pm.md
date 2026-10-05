# TASK-MTQV1JYGMGU6V — the lint exceptions are gone, the patterns are fixed

**Ajan:** blockzincir-pm · **Tip:** teknik borç · **Sprint:** S11 · **Tarih:** 2026-09-07
**Bağımlılık:** TASK-MTQUXONVMWTOD (istisnaların yazılması) — rapor dosyası depoda bulunamadı, kapsam doğrudan koddan ölçüldü.

## 1. Ne yapıldı

Üç bileşende, 2026-09-07'de bilinçli borç olarak yazılan `eslint-disable` satırları kaldırıldı ve
altlarındaki desenler gerçekten düzeltildi. Hiçbir kural gevşetilmedi, hiçbir istisna başka bir
dosyaya taşınmadı.

### Ölçülen başlangıç durumu

Görev metnindeki satır numaraları dosyalar sonradan değiştiği için kaymıştı. Kapsam, istisnalar
tek tek çıkarılıp `eslint` tekrar koşularak yeniden ölçüldü — gerçek ihlal **5 hata**, geri kalan
5 satır ise kuralın hiç tetiklenmediği **ölü istisna**:

| Dosya | Kural | Gerçek ihlal mi? |
|---|---|---|
| `calls/page.tsx` | `react-hooks/set-state-in-effect` | evet (1) |
| `ThemeToggle.tsx` | `react-hooks/set-state-in-effect` | evet (1) |
| `PartBCollaborativeEditor.tsx` | `react-hooks/set-state-in-effect` ×3 | evet (2), ölü (1) |
| `PartBCollaborativeEditor.tsx` | `react-hooks/purity` ×5 | evet (1), ölü (4) |

Görev metnindeki "satır 193: bildirimden önce erişim (hoisting)" maddesi **bugün mevcut değil** —
`handleSaveContent` zaten kendisini kullanan effect'ten önce bildiriliyor ve o satırda istisna yok.
Uydurma bir düzeltme yazmak yerine bunu böyle raporluyorum.

### Yapılan düzeltmeler

**1. `src/components/ThemeToggle.tsx` — mount bayrağı**

`useState(false)` + `useEffect(() => setMounted(true), [])` deseni, her mount'ta bir render commit
edip hemen ikincisini tetikliyordu (kuralın şikâyeti tam olarak bu). Yerine yeni
`useIsHydrated()` hook'u geldi: `useSyncExternalStore` ile sunucuda `false`, hidrasyondan sonra
`true` — aynı hidrasyon koruması, ikinci render yok.

**2. `src/app/[locale]/(app)/[workspace]/calls/page.tsx` — `loading` bayrağı**

`loading` artık **saklanmıyor, türetiliyor**: filtrelerin tarif ettiği sorgu (`query`, `useMemo`)
ile ekrandaki satırların geldiği sorgu (`loadedQuery`) farklıysa liste bayattır. Effect gövdesinde
tek bir `setState` kalmadı; hepsi `await`'ten sonra. Yan kazanç: istek iptali eklendi — filtreler
ilerledikten sonra dönen yanıt artık daha yeni listeyi **ezmiyor** (mevcut ve gerçek bir yarış
durumuydu). `useCallback`'in eksik `locale` bağımlılığı uyarısı da bu arada kapandı.

**3. `src/modules/m11/ui/PartBCollaborativeEditor.tsx` — düzenleme tamponu, kayıt rozeti, kilit**

- `editorText` state'i, **ait olduğu bölümle etiketlenmiş** bir taslağa dönüştü
  (`editorDraft: { sectionKey, text }`) ve metin render sırasında türetiliyor. Bölüm değişince
  etiket bayatlıyor, yeni bölümün içeriği kendiliğinden görünüyor — içeriği kopyalayan effect
  tamamen silindi.
- `saveStatus` state'i **kaldırıldı**; SAVING/UNSAVED/SAVED artık `isSaving` ve
  "tampon ≠ kayıtlı içerik" karşılaştırmasından türetiliyor. Başarısız kayıt bölüm satırını
  değiştirmediği için rozet kendiliğinden UNSAVED'e düşüyor; hata dalında `setState` gerekmiyor.
- Kilit süresi (`60 sn`) render sırasında `Date.now()` okuyarak hesaplanıyordu: hem kirli render,
  hem de **süresi dolan kilit ekranda takılı kalıyordu** (hiçbir şey yeniden render tetiklemiyor).
  Yeni `useNow(5000)` hook'u saati bir dış depo gibi abone ediyor; rozet zamanında düşüyor.
- Ölü `react-hooks/purity` istisnaları silindi (biri JSDoc bloğunun **ortasına** düşmüştü ve
  yorumu okunmaz hâle getiriyordu).

### Yeni paylaşılan hook'lar

`src/lib/hooks/use-is-hydrated.ts` ve `src/lib/hooks/use-now.ts` — mevcut
`use-optional-session.ts` üslubunda: `'use client'`, tek hook, **neden** böyle yazıldığını anlatan
JSDoc. Aynı desen `notifications/client.tsx` ve `UserMenu.tsx`'te de duruyor (bu görevin kapsamı
dışında) — artık kopyalanacak doğru çözüm hazır.

## 2. Kanıt

### Kapı çıktıları

```
$ pnpm lint
✖ 167 problems (0 errors, 167 warnings)          # görev öncesi: 172 problem
```

```
$ grep -rn "eslint-disable" \
    "src/app/[locale]/(app)/[workspace]/calls/page.tsx" \
    src/components/ThemeToggle.tsx \
    src/modules/m11/ui/PartBCollaborativeEditor.tsx
(none — 0 results)
```

```
$ pnpm typecheck
(çıktı yok — temiz)

$ pnpm test
 Test Files  67 passed | 2 skipped (69)
      Tests  717 passed | 12 skipped (729)

$ pnpm rls:check
✅ SUCCESS: All 39 tenant-scoped models have RLS policies registered.
```

`pnpm rls:verify` **KIRMIZI** — ve bu benim değişikliğimden gelmiyor; ayrıntı §4'te.

### Gerçek tarayıcı (Playwright, `tests/e2e/render-purity-refactor.spec.ts`)

```
$ npx playwright test tests/e2e/render-purity-refactor.spec.ts

  ✓  1 › the theme toggle still switches the theme, with no mount effect behind it (1.3s)
  ✓  2 › the calls list loads, and changing a filter puts it back into loading (13.4s)

  2 passed (15.3s)
```

Gerçek tıklamalar: tema düğmesine basılıyor, `documentElement` sınıfının **değiştiği** ve geri
basınca **eski hâline döndüğü** doğrulanıyor; çağrılar listesinde giriş yapılıyor, ilk boyamada
"Canlı veriler yükleniyor..." görünüyor, kayboluyor, "Ufuk Avrupa (Horizon Europe)" filtresine
tıklanınca **tekrar** görünüyor ve tekrar kayboluyor. Konsol boyunca izleniyor: hidrasyon hatası
yok (`0 console errors`).

Ekran görüntüleri — `docs/agent-results/TASK-MTQV1JYGMGU6V-screenshots/`:
`01-public-page-light.png` · `02-public-page-after-toggle.png` · `03-calls-loading.png` ·
`04-calls-loaded.png` · `05-calls-refiltering.png` · `06-calls-filtered.png`

> Test yazarken bir yanlış-pozitif ayıklandı: Playwright'ın varsayılan `caret: 'hide'` seçeneği
> odaklı input'a satır içi `style` yazıyor ve React bunu **hidrasyon uyuşmazlığı** olarak
> raporluyor. Ürün hatası değil, koşum takımının kendi gürültüsü; ekran görüntüleri artık
> `caret: 'initial'` ile alınıyor. Ekran görüntüsüz koşumda konsol zaten sıfır hata veriyordu.

### Bileşen testleri (jsdom + gerçek olaylar)

```
$ npx vitest run tests/m11-partb-editor-buffer.test.tsx tests/client-clock-hooks.test.tsx
 Test Files  2 passed (2)
      Tests  8 passed (8)
```

`tests/m11-partb-editor-buffer.test.tsx` **dişli**: refactor öncesi bileşene karşı koşturuldu,
4 testten 1'i düştü —

```
× keeps the unsaved buffer when the user comes back to that section
  Tests  1 failed | 3 passed (4)
```

Yani 3 test davranışın **korunduğunu**, 1 test ise davranışın **düzeldiğini** kanıtlıyor: eskiden
bir bölümden çıkıp geri dönmek kaydedilmemiş metni sessizce siliyordu (effect üzerine yazıyordu),
artık tampon yerinde duruyor.

## 3. Değişen dosyalar

**Yeni**
- `src/lib/hooks/use-is-hydrated.ts`
- `src/lib/hooks/use-now.ts`
- `tests/client-clock-hooks.test.tsx` (4 test)
- `tests/m11-partb-editor-buffer.test.tsx` (4 test)
- `tests/e2e/render-purity-refactor.spec.ts` (2 test)
- `docs/agent-results/TASK-MTQV1JYGMGU6V-screenshots/` (6 png)

**Değişen**
- `src/app/[locale]/(app)/[workspace]/calls/page.tsx` (+52 −36)
- `src/components/ThemeToggle.tsx` (+9 −3)
- `src/modules/m11/ui/PartBCollaborativeEditor.tsx` (+49 −37)

## 4. Riskler

1. **`pnpm rls:verify` kırmızı — benim değişikliğim değil.** Paralel bir ajanın takvim
   (`CalendarConnection` / `MeetingBrief`) çalışması sırasında **paylaşılan dev veritabanı
   sıfırlanmış**: `public` şemasında yalnız 3 tablo kaldı (`CalendarConnection`, `MeetingBrief`,
   `_prisma_migrations`), `prisma/migrations` 2 migration'a düştü, `rls:verify` "37 tablo
   migration bekliyor" + "`MeetingBrief` RLS kapalı" diyor. Bu görevde tek satır DB kodu
   yazılmadı, tablo eklenmedi. **Takım için acil:** dev DB'nin geri yüklenmesi gerekiyor.
2. **Çalışan dev sunucusu ile CLI farklı veritabanına bakıyor.** `:3000` hâlâ gerçek kullanıcı ve
   çağrı verisi sunuyor (giriş çalışıyor), CLI'ın `DATABASE_URL`'i ise boş DB'yi gösteriyor —
   yani sunucu sıfırlama öncesi URL'i tutuyor. **Dev sunucusu yeniden başlatılırsa uygulama
   büyük ihtimalle boş DB'ye düşecek.** Bilerek yeniden başlatmadım.
3. **Part B editörü gerçek tarayıcıda doğrulanamadı.** Editör
   `/{locale}/{ws}/opportunities/{id}/application` altında ve o sayfa `Opportunity` +
   `ApplicationPart` satırı istiyor; sıfırlanan DB'de kullanıcının çalışma alanı bile yok
   ("Henüz bir çalışma alanınız yok"). Yerine gerçek React çalışma zamanında, gerçek
   `click`/`change` olaylarıyla bileşen testi yazıldı (yukarıda) — **tam tarayıcı değil**, bunu
   olduğu gibi bildiriyorum. DB geri geldiğinde bir e2e "mutlu yol" eklenmeli.
4. **Davranış değişikliği (kasıtlı):** bölüm değiştirip geri dönünce kaydedilmemiş metin artık
   korunuyor. Tampon hâlâ **tek bölümlük**: A'yı düzenleyip B'ye geçip B'yi de düzenlerseniz
   A'nın kaydedilmemiş metni gider (eskiden de giderdi). 2,5 sn'lik otomatik kayıt pratikte
   araya giriyor.
5. **Katkı karışması:** bu görevin `ThemeToggle.tsx`, `calls/page.tsx` ve iki yeni hook dosyası,
   ben commit edemeden **başka bir ajanın `git add -A` commit'ine** girdi
   (`c8f6f9f feat(m6)`, `b6ed409 fix(m6)`). İçerik sağlam ve `dev` üzerinde; yalnız commit
   mesajları yanlış işi anlatıyor.
6. **Dosya yarışı, ikinci olay:** commit'e hazırlanırken başka bir ajan
   `git stash push -u -m "other-agents-wip"` attı; Part B değişikliğim, üç test dosyam ve altı
   ekran görüntüm **diskten silinip** `stash@{0}` içine girdi. `git stash pop` YAPMADIM
   (başkalarının WIP'i de orada). Yalnız kendi yollarımı çıkardım —
   `git checkout 'stash@{0}' -- <izlenen>` ve `git checkout 'stash@{0}^3' -- <izlenmeyen>` —
   stash sahibi için yerinde duruyor. Kurtarılan dosyalar commit'ten önce yeniden koşuldu
   (8 test yeşil, eslint 0 hata).
7. `PartBCollaborativeEditor.tsx:262` `react-hooks/exhaustive-deps` uyarısı **bilerek** duruyor
   (istisna satırı değil, uyarı). `handleSaveContent` memoize edilmediği için bağımlılığa
   eklenmesi otomatik kayıt zamanlayıcısını her render'da yeniden kurar — sonsuz kayıt döngüsü.

## 5. Açık sorular

- Aynı `setState`-in-effect deseni `src/app/[locale]/(app)/[workspace]/notifications/client.tsx`
  ve `src/components/UserMenu.tsx`'te de duruyor. Bu görevin ölçülen kapsamı dışındaydı;
  `useIsHydrated` ile ikisi de birer satırda kapanır — ayrı bir borç görevi açılsın mı?
- `demoComments()` / `demoRevisions()` hâlâ `Date.now()`'a göre "bir saat önce" damgası üretiyor.
  Lint'i tetiklemiyor (modül seviyesinde), ama SSR ile istemci farklı damga üretiyor: yorum
  saatlerinde teorik bir hidrasyon uyuşmazlığı. Fixture verisi olduğu için dokunmadım.
- `src/lib/routes.ts` ve takvim rotası hâlâ başka bir ajanın elinde; `route-catalog` testi bu
  raporun yazıldığı anda yeşil, ama o iş bitmeden kırmızıya dönebilir.

## 6. Sonraki adım

1. **Dev veritabanının geri yüklenmesi** (takım — bu görevi aşıyor). Sonrasında `pnpm rls:verify`
   ve Part B için bir e2e "mutlu yol".
2. `notifications/client.tsx` + `UserMenu.tsx` için ayrı borç görevi (yukarıdaki soru).
3. Bu görev `done`.
