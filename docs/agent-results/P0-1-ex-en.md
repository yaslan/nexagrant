# Lint kapısı yeşile alındı — 7 hata → 0

**Ajan:** ex-en (Araştırmacı / Explorer) · **Tarih:** 2026-09-07 · **Branch:** dev · **Commit:** `a4b09ad`
**Önceki iş:** `docs/agent-results/TASK-MTQ60SGW45T0X-geli-tirici.md` (537 → 7 hata)

## 1. Ne yapıldı

### Kök neden — istisnalar bir satır kaymıştı
Kalan 7 hatanın 4'ü için önceki turda zaten `eslint-disable-next-line` yazılmıştı ama **hiçbiri işe
yaramıyordu**: direktifin hemen ardına gerekçe yorumu ya da boş satır konmuştu, dolayısıyla direktif
kendinden sonraki *yorum satırını* kapsıyordu, hatalı `setState` çağrısını değil. ESLint bunu ayrıca
`Unused eslint-disable directive` uyarısıyla da söylüyordu ama uyarı kalabalığında görünmüyordu.

Örnek (düzeltme öncesi `src/components/ThemeToggle.tsx`):
```
23  useEffect(() => {
24    // eslint-disable-next-line react-hooks/set-state-in-effect   ← 25. satırı kapsıyor
25    // Mounted state is necessary to prevent hydration mismatch...
26    setMounted(true);                                             ← hata burada, açıkta
```

Yani bu iş "yeni istisna yazmak" değil, **var olan istisnaları hedeflerine oturtmaktı**. Kapıyı yeşile
almak için kural gevşetilmedi, dosya ignore edilmedi, `--max-warnings` oynanmadı — `eslint.config.mjs`
HEAD'deki hâliyle duruyor (stock `eslint-config-next`, hiçbir kural override'ı yok).

### Dosya dosya
| # | Yer | Kural | Yapılan |
|---|---|---|---|
| 1 | `src/app/[locale]/(app)/[workspace]/calls/page.tsx:161` | `react-hooks/set-state-in-effect` | Gerekçe yorumu ile direktifin sırası değiştirildi; direktif artık `loadCalls()` satırının hemen üstünde |
| 2 | `src/app/[locale]/(app)/[workspace]/notifications/client.tsx:58` | `react-hooks/set-state-in-effect` | `useEffect`'in ÜSTÜNDEKİ başıboş direktif, efektin İÇİNDE `syncNotifications()` satırının üstüne taşındı |
| 3 | `src/components/ThemeToggle.tsx:26` | `react-hooks/set-state-in-effect` | Yorum/direktif sırası düzeltildi |
| 4 | `src/components/UserMenu.tsx:173` | `react-hooks/set-state-in-effect` | 2 ile aynı: başıboş direktif efektin içine taşındı |
| 5 | `src/modules/m11/ui/PartBCollaborativeEditor.tsx` (eski 167) | `react-hooks/set-state-in-effect` | Bölüm değişiminde `setEditorText`/`setSaveStatus` için gerekçeli satır-içi istisna |
| 6 | `src/modules/m11/ui/PartBCollaborativeEditor.tsx` (eski 189) | `react-hooks/set-state-in-effect` | Autosave efektindeki `setSaveStatus('UNSAVED')` için gerekçeli satır-içi istisna |
| 7 | `src/modules/m11/ui/PartBCollaborativeEditor.tsx` (eski 193) | `react-hooks/immutability` | **İstisna DEĞİL, gerçek düzeltme** — aşağıya bak |

### 7. hata: istisna yerine gerçek düzeltme
`Cannot access variable before it is declared` — autosave efekti (eski satır 193) `handleSaveContent`'i
çağırıyordu, ama o fonksiyon 63 satır AŞAĞIDA (eski 256) tanımlıydı. Oradaki mevcut bastırma yanlış kural
adına yazılmıştı (`@typescript-eslint/no-use-before-define`), yani hiçbir şeyi bastırmıyordu.

Bunu bastırmak yerine **bildirim sırası düzeltildi**: `calculateWords` / `currentSectionWords` /
`currentSectionEstimatedPages` üçlüsü ve `handleSaveContent` bloğu, onları kullanan efektin ÜSTÜNE taşındı.
Saf yer değiştirme — tek satır mantık değişmedi. Ayrıca aynı dosyada ölü hâle gelmiş
`// eslint-disable-next-line react-hooks/purity` direktifi (ESLint'in `Unused directive` dediği satır) silindi.

### Teknik borç kartı
Patron kararı gereği derin refactor yapılmadı; 6 `set-state-in-effect` yüzeyinin gerçek çözümü
**TASK-MTQVFP0LV3YV7** (backlog) kartına yazıldı — `useSyncExternalStore`, `key` ile state reset,
`saveStatus`'ün türetilmesi ve UserMenu/notifications kopya mantığının ortak hook'a çıkarılması dahil.

---

## 2. Kanıt

### 2.1 Kapı yeşil — ana depo
```
$ pnpm lint
✖ 203 problems (0 errors, 203 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
$ echo $?
0
```
Başlangıç durumu (bu işten önce, aynı komut): `✖ 215 problems (7 errors, 208 warnings)` → çıkış 1.

Hata listesi programatik olarak da doğrulandı (`eslint -f json` → `severity===2` sayımı):
```
errorCount=0        # önce: 7
```

### 2.2 CI'nin gördüğü ağaçta dört kapı da yeşil
Ana depoda `pnpm typecheck` ve `pnpm build` şu an **başka bir ajanın** commit'lenmemiş atık scriptleri
yüzünden kırmızı (`scripts/_dogfood-g0-probe2.ts`, `-probe3.ts` → `TS7006 implicitly has an 'any' type`).
Bu dosyalar `git status`'te `??` (untracked), yani CI checkout'unda YOKLAR ve o ajan hâlâ üzerlerinde
çalışıyordu (iş sırasında `-probe4.ts` oluştu), bu yüzden onlara dokunulmadı.

Kapılar bunun yerine `a4b09ad` commit'inden açılan **izole bir git worktree**'de — yani CI'nin gördüğü
ağacın birebir aynısında — koşuldu:
```
$ git worktree add /Users/macbook/AgentSpace/.fabrika-gate-wt HEAD
HEAD is now at a4b09ad fix(lint): put the react-hooks suppressions on the lines they were meant for
$ ls scripts | grep dogfood
(boş — atık scriptler bu ağaçta yok)

$ pnpm lint      → exit 0    ✖ 203 problems (0 errors, 203 warnings)
$ pnpm typecheck → exit 0    (çıktı yok)
$ pnpm build     → exit 0    (Route tablosu basıldı, hata yok)
```
Testler ana depoda koşuldu (atık scriptlerden etkilenmiyor):
```
$ pnpm test → exit 0
 Test Files  55 passed | 2 skipped (57)
      Tests  519 passed | 8 skipped (527)
```

### 2.3 Kapının kırmızıya dönebildiği kanıtlandı
Aynı izole worktree'de iki kasıtlı hata eklendi:
1. `ThemeToggle.tsx`'teki gerekçeli istisna satırı SİLİNDİ (bastırdığım kuralın gerçekten ateşlendiğini
   gösterir),
2. Alakasız ikinci bir ihlal: `if (locale === 'zz') { useState(0); }` (koşullu hook).

```
$ pnpm lint
/…/src/components/ThemeToggle.tsx
  26:5   error  Error: Calling setState synchronously within an effect can trigger cascading renders
  55:26  error  React Hook "useState" is called conditionally…   react-hooks/rules-of-hooks

✖ 205 problems (2 errors, 203 warnings)
$ echo $?
1
```
Geri alındıktan sonra:
```
$ git checkout -- src/components/ThemeToggle.tsx && pnpm lint
✖ 203 problems (0 errors, 203 warnings)
$ echo $?
0
```
Yeşil → kırmızı (çıkış 1) → yeşil (çıkış 0) döngüsü tamam. Geçici worktree ve kopyalanan `node_modules`
silindi (`git worktree list` yalnız ana depoyu gösteriyor).

### 2.4 Config gevşetilmedi
```
$ git diff a4b09ad~1 a4b09ad --stat -- eslint.config.mjs tsconfig.json package.json
(boş)
```
`eslint.config.mjs` içeriği: `eslint-config-next/core-web-vitals` + `/typescript`, tek bir kural override'ı
veya ek `ignore` yok.

---

## 3. Değişen dosyalar
Commit `a4b09ad` — 5 dosya, +74 / −60:
```
src/app/[locale]/(app)/[workspace]/calls/page.tsx            |   6 +-
src/app/[locale]/(app)/[workspace]/notifications/client.tsx  |   5 +-
src/components/ThemeToggle.tsx                               |   5 +-
src/components/UserMenu.tsx                                  |   4 +-
src/modules/m11/ui/PartBCollaborativeEditor.tsx              | 114 +++++++++--------
```
Toplam 7 satır-düzeyi istisna; her birinin hemen üstünde neden kaçınılamadığını anlatan gerekçe yorumu var.
`PartBCollaborativeEditor.tsx`'teki büyük satır sayısı mantık değişikliği değil, blok taşımadır.

---

## 4. Riskler
- **İstisnalar riski gizler, kaldırmaz.** 6 `set-state-in-effect` yüzeyi hâlâ efekt içinde senkron setState
  yapıyor; React Compiler etkinleştirilirse bunlar cascading render'a yol açabilir. Borç TASK-MTQVFP0LV3YV7'de.
- **`PartBCollaborativeEditor.tsx` blok taşıması** saf yer değiştirme olsa da 114 satırlık bir diff üretti;
  gözle okunurken "yeni kod" gibi görünebilir. `git diff -M --color-moved` ile bakılması önerilir.
- **203 uyarı duruyor.** Kapı yalnız hataya bakıyor; uyarı sayısı sessizce büyürse `Unused eslint-disable
  directive` gibi gerçek sinyaller yine kaybolur — bu işin kök nedeni tam olarak buydu.
- **Ana depoda `pnpm typecheck`/`pnpm build` şu an kırmızı** — sebebi benim değişikliğim değil, başka bir
  ajanın commit'lenmemiş `scripts/_dogfood-g0-probe*.ts` dosyaları. O ajan işini bitirince silmeli.

## 5. Açık sorular
1. Uyarı sayısı için bir tavan (`--max-warnings 203` gibi, kademeli düşürülen) konsun mu? Kapı bugün
   uyarıya kör; bu, aynı "görünmez sinyal" tuzağını tekrar kurar. — **Patron kararı gerekiyor.**
2. CI yalnız `main`'e push/PR'da koşuyor (`.github/workflows/ci.yml`). `dev` branch'i kapısız; ajanlar
   dev'e commit ettiğine göre kapı `dev`'e de eklensin mi?
3. `scripts/_dogfood-*.ts` gibi atık scriptler `tsconfig.json` `exclude`'una mı alınsın, yoksa `.gitignore`
   ile mi kapatılsın? Bugün her ajanın geçici scripti diğerinin typecheck/build kapısını kırıyor.

## 6. Sonraki adım
- Bu commit dev'de (`a4b09ad`). Ek iş gerekmiyor; kapı yeşil ve kırmızıya dönebildiği kanıtlı.
- TASK-MTQVFP0LV3YV7 bir sonraki sprintte bir frontend ajanına atansın.
- Açık soru 2 (dev branch'ine CI kapısı) ucuz ve yüksek getirili — patron onayıyla tek satırlık workflow
  değişikliği.
