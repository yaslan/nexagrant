# TASK-MTSJJOR63M63R — st6 spec:127 "bildirim zili kendi akışını taşımıyor" FAIL

**Ajan:** customer-support (CS-EN) · **Tip:** bug (test) + temizlik · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-08 · **Dal:** dev
**Bkz:** `docs/agent-results/TASK-MTQYXISOPUJ53-customer-support-2.md` · `tests/e2e/fixtures/shots.ts`

**Cevap: bayat test. Üründe kusur YOK — bildirim zili boş kiracıda hiçbir şey uydurmuyor.**
Test, görünmeyen bir düğmeye tıklamaya çalışıp 60 sn'de zaman aşımına uğruyordu.

---

## 1. Ne yapıldı

### 1.1 Kök neden — üç ayrı kusur, hepsi locator'da

```ts
// ÖNCE (spec:135)
const bell = page.locator('button[aria-label*="ildirim"], button[title*="ildirim"]').first();
await bell.click();   // ← 60 sn boyunca "element is not visible"
```

Boş kiracıyla gerçek tarayıcıda ölçtüm — bu seçici **üç** ayrı kontrolü yakalıyor:

| # | Eşleşen | Görünür? | Ne olduğu |
|---|---------|----------|-----------|
| 0 | `title="Bildirimler"` | **hayır** | `MobileAppHeader` içindeki zil — `flex md:hidden` |
| 1 | `title="Bildirimler"` | evet | Masaüstü header'daki gerçek zil — `hidden md:flex` |
| 2 | `aria-label="Geri bildirim formunu aç"` | evet | **Geri bildirim widget'ı** — "bildirim", "Geri bildirim"in alt dizgisi |

Uygulama kabuğu `UserMenu`'yü **iki kez** mount ediyor (`src/app/[locale]/(app)/layout.tsx:97`
masaüstü, `src/components/MobileAppHeader.tsx:50` mobil) ve mobil olan DOM'da **önce** geliyor.
Playwright'ın 1280px Desktop Chrome görünümünde `.first()` bu yüzden **gizli** mobil zile
çözülüyor → tıklama hiç gerçekleşmiyor.

Üçüncü satır ayrı bir tuzak: mobil header'ın olmadığı bir görünümde aynı seçici **geri bildirim
formunu** açar ve test yine yeşil olurdu (aşağıya bak).

### 1.2 Testin ikinci, daha sessiz kusuru

`spec:138-141`'deki iddiaların **hepsi olumsuz** ("gövde şu dizgiyi içermesin"). Olumsuz bir
iddia, **hiç açılmamış** bir panelde de geçer. Yani zil bozulsa, gizlense ya da yanlış düğme
açılsa test "geçti" diyecekti. Zaman aşımı bu kez kurtardı; her zaman kurtarmaz.

### 1.3 Düzeltme (gevşetme değil — sıkılaştırma)

```ts
const bell = page.locator('button[title="Bildirimler"]:visible');
await expect(bell, 'exactly one notification bell should be on screen').toHaveCount(1);
await bell.click();

// Olumsuz iddialar açılmamış panelde de geçer. Önce panelin AÇIK olduğunu kanıtla.
await expect(page.getByRole('heading', { name: 'Bildirimler' })).toBeVisible();
await expect(page.getByText('Henüz bildiriminiz yok.')).toBeVisible();
await expect(page.getByText('Tümü Okundu')).toBeVisible();
```

Dört uydurma dizgiye karşı olan asıl döngü **olduğu gibi duruyor**; hiçbir iddia kaldırılmadı,
`.skip` yok, `INVENTED_NOTIFICATIONS` listesi kısaltılmadı. Eklenenler:
- tam eşleşme (`title="Bildirimler"`) → geri bildirim widget'ı artık yakalanamaz,
- `:visible` + `toHaveCount(1)` → ekranda tam bir zil olduğu iddiası; iki header birden
  görünür hâle gelirse test kırmızıya döner,
- panelin gerçekten açıldığının ve **okunmamış sayacı göstermediğinin** ("Tümü Okundu")
  olumlu kanıtı.

### 1.4 Kalıntı temizliği

`scripts/_cs-st6-mkkey.ts`, `_cs-st6-probe2.ts`, `_cs-st6-probe3.ts`, `_cs-st6-probe4.ts`
ve boş `scripts/_cs-st6/` dizini **silindi** (tek seferlik DB sondaları, kalıcı değeri yok).
`scripts/seed-st6-empty-e2e.ts` ve spec kalıcı → commit'lendi.

**Dokunmadığım şey:** `tests/e2e/fixtures/shots.ts` ve spec'teki `shotsDir(...)` çağrısı —
blok-zincir-dse'nin TASK-MTSHUZUMVLTBF düzeltmesi. Spec'i sıfırdan yazmadım, mevcut hâlini
okuyup **tek bir test bloğunu** yamaladım; o düzeltme yerinde duruyor ve bu koşuda işini yaptı
(§2.4).

---

## 2. Kanıt

### 2.1 ÖNCE — kırmızı (kopyalanmış çıktı)

```
✘  1 [chromium] › st6-empty-tenant-no-fabrication.spec.ts:127:7 › the header bell carries no feed of its own (1.0m)

    Test timeout of 60000ms exceeded.
    Error: locator.click: Test timeout of 60000ms exceeded.
    Call log:
      - waiting for locator('button[aria-label*="ildirim"], button[title*="ildirim"]').first()
        - locator resolved to <button title="Bildirimler" class="relative p-2 …">…</button>
      - attempting click action
        2 × waiting for element to be visible, enabled and stable
          - element is not visible
        116 × waiting for element to be visible, enabled and stable
            - element is not visible
```

### 2.2 Kök nedenin ölçümü — gerçek tarayıcı, boş kiracı

Geçici bir sonda spec'i (`tests/e2e/_probe-bell.spec.ts`, koşudan sonra silindi) `st6-bare-ws`
kiracısıyla çalıştırdım:

```
0 visible= false | title= Bildirimler | aria= null | box= null
1 visible= true  | title= Bildirimler | aria= null | box= {"x":1048.5,"y":9.5,"width":36,"height":36}
2 visible= true  | title= null | aria= Geri bildirim formunu aç | box= {"x":1121.8,"y":656,…}
scoped to desktop header count = 1
```

Görünen zile tıklayınca panelin gövdesi — **ürün temiz**:

```
Bildirimler
Tümü Okundu

Henüz bildiriminiz yok.

Tüm bildirimleri gör
```

Kaynak da bunu doğruluyor: `src/components/UserMenu.tsx:194` — `baseNotifications` artık
`useMemo(() => [], [])`, yani sabit boş. Uydurma üç bildirim TASK-MTQYXISOPUJ53'te kaldırılmıştı.

### 2.3 SONRA — spec tam yeşil (7/7)

```
Running 7 tests using 1 worker
[seed-st6-empty-e2e] ready — bare=st6-bare-ws app=st6-app-ws opportunity=st6-app-opp applicationParts=0
  ✓  1 … point 1 › an empty CORDIS table yields an empty list, not a demo array (70ms)
  ✓  2 … point 1 › an unknown PIC is a real 404, not an invented organisation (45ms)
  ✓  3 … point 1 › no key is refused rather than served demo rows (13ms)
  ✓  4 … point 4 › a tenant with no opportunities is told so, and sees no invented rate (882ms)
  ✓  5 … point 5 › the feed is empty and none of the four invented notices is rendered (587ms)
  ✓  6 … point 5 › the header bell carries no feed of its own (717ms)
[seed-st6-empty-e2e] rolled back
  ✓  7 … points 2 and 3 › an opportunity with zero ApplicationPart rows opens empty … (821ms)

  7 passed (4.0s)
```

Zaman aşımı 60 sn'den **717 ms**'ye düştü — tıklama artık gerçekten oluyor.

### 2.4 NEGATİF KONTROL — düzeltilmiş test uyduran bir zili yakalıyor mu?

"Yeşil" ancak kırmızıya dönebiliyorsa bir şey ifade eder. `UserMenu.tsx`'e geçici olarak tek bir
uydurma bildirim enjekte ettim (`{ title: '500 AI Kredisi', desc: 'HORIZON-CL5-2026-D3' }`):

```
✘  1 … › the header bell carries no feed of its own (10.8s)
    Error: expect(locator).toBeVisible() failed
    Error: element(s) not found
      154 |     await expect(page.getByRole('heading', { name: 'Bildirimler' })).toBeVisible();
    > 155 |     await expect(page.getByText('Henüz bildiriminiz yok.')).toBeVisible();
  1 failed
```

Kırmızı. Enjeksiyon geri alındı; `git diff --stat src/components/UserMenu.tsx` **boş**
(ürün kodunda tek satır değişiklik yok). Not: kapıyı ilk tetikleyen §1.3'te eklediğim boş-durum
iddiası oldu, dizge döngüsü değil — yani eklenen iddia gerçekten iş görüyor.

### 2.5 Ekran görüntüsü — gerçek tıklama, boş kiracı

`docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/st6-bell-empty-tenant.png`

Kullanıcı `st6-bare-user`, panel **açık**: "Bildirimler / Tümü Okundu / Henüz bildiriminiz yok."
Zilde kırmızı okunmamış noktası yok. Sağ altta "Geri bildirim" düğmesi görünüyor — eski
seçicinin yanlışlıkla açabileceği kontrol tam olarak o.

### 2.6 Kanıt klasörü korundu

Varsayılan bir koşudan (ortam değişkeni **yok**) sonra:

```
$ npx playwright test tests/e2e/st6-empty-tenant-no-fabrication.spec.ts
  7 passed (4.3s)

$ git status --short docs/agent-results
?? docs/agent-results/TASK-MTSHTIYJWTQKO-blockzincir-pm.md      ← başka ajanın dosyası

$ ls test-artifacts/TASK-MTQYXISOPUJ53-screenshots/
st6-application-empty-tenant.png   st6-bell-empty-tenant.png
st6-dashboard-empty-tenant.png     st6-notifications-empty-tenant.png
```

**Tek bir ` M` satırı yok.** Kareler git-ignore'lu `test-artifacts/` altına gitti; commit'li
kanıta dokunulmadı. Çalışan mekanizma dse'nin `shotsDir()`'ü (TASK-MTSHUZUMVLTBF).

**Önemli ayrım — yayımlama bilinçli bir eylemdir.** `E2E_SHOTS_ROOT=docs/agent-results` ile
koşarsam kareler kartın klasörüne yazılır ve **o zaman ` M` satırı çıkar**; bu koşuda §2.5'teki
kareyi yayımlamak için bir kez öyle koştum, sonra `git checkout -- ` ile geri alıp
commit'lediğim baytları geri koydum. Yani ` M` yokluğu, varsayılan koşunun kanıtı ezmediğinin
ölçümüdür — ki kuralın koruduğu şey tam olarak budur.

> Şeffaflık: oturum başında `docs/agent-results/TASK-MTQYXISOPUJ53-customer-support-2.md`
> zaten ` M` idi — önceki görevimden kalan, **bu koşudan önce** var olan bir rapor
> düzenlemesiydi, e2e'nin ezmesi değil. `156510f` ile kapatıldı.

### 2.7 Kapılar

```
$ npx eslint tests/e2e/st6-empty-tenant-no-fabrication.spec.ts scripts/seed-st6-empty-e2e.ts
(çıktı yok — temiz)

$ pnpm typecheck | grep -E "^(tests/e2e/st6|scripts/seed-st6)"
(eşleşme yok — benim iki dosyamda 0 hata)
```

Depo genelinde typecheck **57 hata** ile kırmızı; hepsi `src/modules/m2/…`,
`src/modules/marketplace/…` gibi benim scope'um dışındaki dosyalarda ve **ex-en'in şu anda
açık olan görevinin** konusu (TASK-MTSJHTJZSCILI — "prisma-override.d.ts kaldırılsın —
arkasındaki 52 tip hatası"). Dokunmadım.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `tests/e2e/st6-empty-tenant-no-fabrication.spec.ts` | **düzeltildi + commit'lendi** — zil locator'ı + panelin açıldığının olumlu iddiası (tek test bloğu; `shotsDir` kullanımına dokunulmadı) |
| `scripts/seed-st6-empty-e2e.ts` | **commit'lendi** — kalıcı fixture, değiştirilmedi |
| `docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/st6-*.png` (4) | **commit'lendi** — bu koşunun kanıt kareleri |
| `docs/agent-results/TASK-MTQYXISOPUJ53-customer-support-2.md` | commit'lendi (önceki görevden bekleyen düzenleme) |
| `docs/agent-results/TASK-MTSJJOR63M63R-customer-support.md` | bu rapor |
| `scripts/_cs-st6-{mkkey,probe2,probe3,probe4}.ts` + `scripts/_cs-st6/` | **silindi** |
| `src/components/UserMenu.tsx` | **DEĞİŞMEDİ** — sadece negatif kontrol için geçici enjeksiyon, geri alındı |

---

## 4. Riskler

1. **`:visible` görünüm-bağımlıdır.** Playwright projesi 1280px Desktop Chrome. Mobil bir
   proje eklenirse aynı iddia (`toHaveCount(1)`) orada da tek zil bulur — mobil header
   görünür, masaüstü gizli olur. Yani düzeltme viewport'a göre doğru çalışır; ama iki header'ın
   bir arada göründüğü bir kırılma noktası çıkarsa test kırmızıya döner. **Bu kasıtlı.**
2. **Metin-bağımlı iddialar (tr).** `'Bildirimler'`, `'Henüz bildiriminiz yok.'`,
   `'Tümü Okundu'` — `UserMenu.tsx` bugün i18n anahtarı değil gömülü `isTr ? … : …` üçlüsü
   kullanıyor. Bu dizgeler `t('...')`'e taşınırsa spec'in de güncellenmesi gerekir.
   (Gömülü metin CLAUDE.md §8 ihlali; **benim kartımın kapsamı değil**, aşağıya not düştüm.)
4. **Paylaşılan index yarışı yine vurdu.** Commit'imi (`156510f`) ayrık bir index'le
   (`GIT_INDEX_FILE`) attım — paylaşılan `.git/index` başka ajanların elinde. Ref'i
   ilerlettikten sonra paylaşılan index bayat kaldı ve **yeni commit'lediğim 8 dosya
   `D ` (staged deletion) olarak göründü**; o anda başka bir ajan `git commit` atsaydı
   dosyalarım silinmiş olarak commit'lenirdi. `git reset -- <yalnız kendi yollarım>` ile
   onardım. Ayrık index commit'i güvenli; **ardından index'i HEAD'e hizalamak da onun
   parçası olmalı.** Hafızaya yazıldı.

3. Fixture'ın API anahtarı depoda düz metin (`fp_st6_fixture_key_do_not_use_in_production`).
   Yalnız `--rollback`'in sildiği tek kullanımlık kiracıyı doğruluyor; seed dosyasında gerekçesi
   yazılı. Yeni bir risk değil, devraldığım tasarım.

---

## 5. Açık sorular

1. **`UserMenu.tsx` i18n ihlali.** Bildirim paneli metinleri `t('...')` yerine kodda gömülü
   (`isTr ? 'Bildirimler' : 'Notifications'`). CLAUDE.md kuralı 8'e aykırı. Ayrı bir kart mı?
2. **Bildirim deposu yok.** `prisma/schema.prisma`'da bildirim modeli yok; zil kalıcı olarak
   boş. Bugün doğru davranış (uydurmuyor), ama "Tüm bildirimleri gör" bağlantısı da kalıcı
   olarak boş bir sayfaya gidiyor. Ürün kararı: özellik ne zaman gerçek olacak?
3. `st6-bell-empty-tenant.png`'de panel arkasındaki pano hâlâ iskelet (skeleton) yüklemede —
   tıklama yükleme bitmeden oluyor. Panonun boşluğu 4 numaralı testin kendi karesinde
   kanıtlı, ama gerçek kullanıcı için ilk boya süresi ayrıca bakılmaya değer olabilir.

---

## 6. Sonraki adım

- Kart `review`e alınabilir: spec 7/7 yeşil, negatif kontrolle kırmızıya dönebildiği kanıtlı,
  kalıntılar temiz, kanıt klasörü ezilmemiş.
- §5.1 (i18n) ve §5.2 (bildirim deposu) için ayrı kart açılması öneriliyor — bu kartın
  kapsamına dahil değildi, sessizce genişletmedim.
