# TASK-MUM97PKOEUQBA — FB İNCELEME-13 takip (fe-fb): Ö-4 + K-6

## 1. Ne yapıldı

- **Ö-4 (B4 PNG temizleyici)** — `sanitizeLogoPng` artık:
  - `IHDR`'yi yalnız ilk chunk olarak kabul ediyor. Sonraki her `IHDR` → `badPng`. 2×1 + 5000×5000 çift IHDR artık saklanmıyor, 1024 px denetimi atlatılamıyor.
  - `IDAT`'ların tek ve kesintisiz bir dizi olmasını istiyor (PNG spesifikasyonu). Aradaki chunk atılacak bir chunk olsa bile (`tEXt`) ya da saklanan bir chunk olsa bile (`gAMA`) → `badPng`. Birden çok ardışık `IDAT` kabul ediliyor.
  - Dosya başı yorumundaki kurallar listesi buna göre güncellendi.
- **K-6** — `storage.ts` `devObjectPath` üretim kilidi `process.env.NODE_ENV` yerine `env.NODE_ENV` (`src/lib/env.ts`) okuyor. `env` bu dosyada zaten import ediliyordu.
- K-7 (isteğe bağlı, transaction dışı oku-birleştir-yaz) **yapılmadı**: kart kapsamı Ö-4 + K-6; aynı desen `sso.ts`'te de var, tek yerde düzeltmek tutarsızlık yaratır. Ayrı kart önerisi aşağıda.

Commit: `69e239ae` (dev).

## 2. Kanıt

### Birim testler (2 yeni test)
```
$ npx vitest run src/lib/agency/cobrand.test.ts
 Test Files  1 passed (1)
      Tests  13 passed (13)
$ npx vitest run "src/app/[locale]/(app)/ajans" src/lib/agency
 Test Files  8 passed (8)
      Tests  92 passed (92)
$ npx tsc --noEmit -p .        → çıktı yok (temiz)
$ npx eslint cobrand.ts cobrand.test.ts storage.ts → çıktı yok (temiz)
```
Yeni testler: `refuses a second IHDR, so a later one cannot slip past the size check` (5000×5000 ikinci IHDR ve aynı boyutlu ikinci IHDR) · `accepts IDAT split into a run, refuses IDATs broken up by another chunk` (ardışık dizi kabul; `tEXt` ve `gAMA` ile bölünen red).

### Mutasyon (commit sonrası, yedek kopyadan geri alındı — `git checkout` kullanılmadı)
```
== M1: second-IHDR check removed
     × refuses a second IHDR, so a later one cannot slip past the size check
      Tests  1 failed | 12 passed (13)
== M2: IDAT run check removed
     × accepts IDAT split into a run, refuses IDATs broken up by another chunk
      Tests  1 failed | 12 passed (13)
== restored
      Tests  13 passed (13)
```

### K-6 canlı (tsx, R2 yok)
```
NODE_ENV=development put=true readBack=x
NODE_ENV=production put=false readBack=null
```
Sonda (`k6probe/…`) silindi.

### Gerçek tarayıcı (Playwright + Chrome, `http://localhost:3000` next dev, gerçek dosya seçimi + Kaydet tıklaması)
Hesap: önceki B4 koşusunun ajans sahibi `b4-mum6fb9d-ajans@example.org` (TENANT_OWNER, AGENCY). Dosyalar scratchpad'de üretildi; çift-IHDR dosyası inceleme raporundaki repro ile aynı (93 bayt).
```
reject double-ihdr.png: PNG dosyası bozuk ya da içinde fazladan veri var.
reject split-idat.png:  PNG dosyası bozuk ya da içinde fazladan veri var.
accept idat-run-ok.png: Kaydedildi. Bağlı kurumlar bir sonraki sayfa açılışında görür. | errors shown: 0
preview naturalWidth 120x40                                   ← iki IDAT'lık logo tarayıcıda çiziliyor
```
Kareler (`docs/agent-results/TASK-MUM97PKOEUQBA-screenshots/`):
- `01-cift-ihdr-reddedildi.png` — çift IHDR reddi, "Logo yüklenmedi" (hiçbir şey saklanmadı)
- `02-bolunmus-idat-reddedildi.png` — bölünmüş IDAT reddi
- `03-idat-dizisi-kabul.png` — ardışık IDAT'lı geçerli logo kabul, önizlemede çiziliyor

"Önce" karesi alınmadı: önceki davranışın kanıtı crw-fb raporundaki `second IHDR 5000x5000 after first  OK stored=93` satırı (TASK-MUM74TE5F3K44-crw-fb.md §B4). Arayüz değişmedi; yalnız sunucu tarafı kabul kuralı değişti.

## 3. Değişen dosyalar
- `src/lib/agency/cobrand.ts` — IHDR tekliği + IDAT dizisi denetimi, yorum
- `src/lib/agency/cobrand.test.ts` — 2 yeni test
- `src/lib/storage.ts` — `env.NODE_ENV`
- `docs/agent-results/TASK-MUM97PKOEUQBA-fe-fb.md` + `…-screenshots/` (bu rapor)

`src/lib/auth.ts`, `src/lib/actions/auth.ts`, `src/lib/oauth-registration.ts` ağaçta değişik görünüyor: be-fb'nin paralel işi, dokunulmadı ve commit'e girmedi (`git commit -- <yollar>`).

## 4. Riskler
- K-6 incelemede anlatılan senaryoyu (`NODE_ENV=test next start`, R2 yok) **kapatmıyor**: `env.NODE_ENV` de aynı ortam değişkeninden gelir. Değişiklik CLAUDE.md kuralına uyum içindir; yanlış başlatılmış üretim sunucusu hâlâ logoyu instance diskine yazar. Kesin kapatma için ayrı bir sinyal gerekir (ör. yerel yedeği yalnız açık bir `DEV_OBJECT_STORE=true` ile açmak) — bu davranış değişikliği olduğu için karar liderin.
- Daha önce gevşek kurala göre saklanmış bir çift-IHDR logo varsa (yalnız test verisi bekleniyor) okunurken yeniden denetlenmez; sunum yolu baytları olduğu gibi verir.

## 5. Açık sorular
- K-6 için yukarıdaki açık bayrak istenir mi?
- K-7 (`saveAgencyCoBrand` + `sso.ts` eşzamanlı yazma) için ayrı kart açılsın mı? Öneri: `jsonb_set` ile tek anahtar güncelleme, iki dosyada birlikte.

## 6. Sonraki adım
- crw-fb: Ö-4 yeniden onayı (aynı repro scripti `second IHDR` satırında artık `REJECT badPng` vermeli).

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Node, Chrome via Playwright, next dev :3000, Docker `fabrika-postgres`). Dokunulan kod platformdan bağımsız: saf TS bayt işleme (`Buffer`, `node:zlib` crc32) ve ortam değişkeni okuma. `devObjectPath`'in dosya yolu (`${cwd}/.dev-objects/<key>`) değişmedi. Windows ve Linux'ta **koşulamadı** (bu makinede yalnız macOS var); koddan bakınca davranış farkı beklenmez, CI (Linux) aynı vitest testlerini koşar.
