# TASK-MTQVFP0LV3YV7 — `react-hooks/set-state-in-effect` — ex-en

**Sonuç:** Kartın iddiası **YANLIŞ**. Kural kapalı değildi; deponun ilk gününden beri **açık ve
`error` seviyesinde**. "0 uyarı" ölçümsüzlük de değildi, temizlik de: iki bileşende
`eslint-disable-next-line` ile **susturulmuş** iki ihlal vardı. Susturmalar kaldırıldı, desen
gerçekten söküldü, kural artık hiçbir istisna olmadan yeşil.

TASK-MTREW28BU7STD'nin "kalan iki bileşen" iddiası ise **ölçümle birebir uyuşuyor**.

---

## 1. Ne yapıldı

### 1.1 Önce iddia doğrulandı (ve çürütüldü)

Kartın dayanağı `eslint.config.mjs`'te "react-hooks" geçmemesi. Bu doğru — ama kuralın kapalı
olduğu **sonucu** yanlış: kural dosyada değil, `eslint-config-next/core-web-vitals` içinden
`eslint-plugin-react-hooks@7.1.1`'in `recommended` seti üzerinden geliyor.

Grep'i tekrarlamak yerine **çözümlenmiş yapılandırma** okundu (`--print-config`): kural `[2]`
(= `error`). Ayrıca kuralın gerçekten **ateşlediği** kanıtlandı: bilerek ihlal eden bir sonda
dosyası yazıldı, ESLint onu yakaladı, dosya silindi (§2.2).

Yani ölçüm aleti çalışıyordu; "0" gerçek bir ölçümdü. 0 çıkmasının sebebi ihlallerin
susturulmuş olmasıydı:

```
src/app/[locale]/(app)/[workspace]/notifications/client.tsx:60
src/components/UserMenu.tsx:194
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
```

Bu iki dosya, TASK-MTREW28BU7STD'nin "kalan iki bileşen"i. **Kart doğru.**

### 1.2 Desen kaldırıldı (kural gevşetilmeden)

İki bileşen de aynı deseni taşıyordu: okundu/okunmadı örtüsü `localStorage`'ta; liste
`useState` ile ikinci bir kopya olarak tutuluyor, bir efekt mount'ta `setState` ile dolduruyor,
abonelik elle kuruluyordu.

Depoda bu sınıf için **zaten bir emsal** vardı — `src/lib/hooks/use-is-hydrated.ts`, aynı kural
için `useSyncExternalStore` ile yazılmış. Aynı yol izlendi (icat değil, reuse):

**Yeni:** `src/lib/hooks/use-read-notifications.ts`
- `useReadNotificationIds(storageKey)` — `useSyncExternalStore` ile `localStorage`'a abonelik.
  `getServerSnapshot` boş örtü döner, böylece sunucu çıktısı ile hidrasyon **birebir** aynı.
- Anlık görüntü **referans olarak kararlı** olmak zorunda (yoksa React sonsuz render eder), bu
  yüzden ham dizeler tek bir string olarak dönüyor, parse `useMemo` içinde.
- `applyReadState()` — liste render sırasında **türetiliyor**, state'e kopyalanmıyor.
- `markNotificationsRead()` — iki bileşende birebir tekrarlanan yazma yolu tek yere alındı.
- `notificationStorageKey()` — `fonbridge_read_notifs_${...}` şablonu üç yerde tekrar ediyordu.

**Sonuç:** her iki bileşende de `useState` + `useEffect` + `useCallback` üçlüsü tamamen kalktı;
`notifications` artık saf bir türetme. `src/` altında `set-state-in-effect` susturması **kalmadı**.

### 1.3 Kapsam dışıydı ama kapıyı kırıyordu: 4 kırık test

`pnpm test` HEAD'de (benim değişikliğim olmadan) zaten **4 test kırıktı** — kural (d) "yeşil
olmadan bitti deme" dediği için düzeltildi. Ayrıntı ve suçlu commit §4.2'de.

---

## 2. Kanıt

Hepsi bu görev sırasında, bu oturumda üretildi.

### 2.1 Kartın dayanağı doğru, sonucu yanlış

```
$ grep -n "react-hooks" eslint.config.mjs
(no output — no match)

$ npx eslint --print-config "src/components/UserMenu.tsx" | jq '.rules["react-hooks/set-state-in-effect"]'
[2]
```

`2` = `error`. Çözümlenen 16 `react-hooks` kuralının tamamı:

```
react-hooks/rules-of-hooks [2]          react-hooks/immutability [2]
react-hooks/exhaustive-deps [1]         react-hooks/globals [2]
react-hooks/static-components [2]       react-hooks/refs [2]
react-hooks/use-memo [2]                react-hooks/set-state-in-effect [2]   ← kart "kapalı" diyordu
react-hooks/preserve-manual-memoization [2]  react-hooks/error-boundaries [2]
react-hooks/incompatible-library [1]    react-hooks/purity [2]
react-hooks/set-state-in-render [2]     react-hooks/unsupported-syntax [1]
react-hooks/config [2]                  react-hooks/gating [2]
```

Ne zamandan beri açık — dün değil, **ilk commit'ten** beri:

```
$ git log -S"eslint-plugin-react-hooks@7" --oneline -- pnpm-lock.yaml
0858e2d Initial commit from Create Next App

$ git log --oneline -- eslint.config.mjs
5ee55d8 config(lint): add argsIgnorePattern and caughtErrorsIgnorePattern for underscore-prefixed unused vars
0858e2d Initial commit from Create Next App
```

`eslint.config.mjs` hiç `react-hooks` içermedi ve içermesine gerek yoktu.

### 2.2 Ölçüm aleti gerçekten bakıyor mu — sonda testi

Bilerek ihlal eden geçici bir dosya yazıldı, ESLint'e verildi, sonra silindi:

```
$ npx eslint src/__lint-probe.tsx

/Users/macbook/AgentSpace/fabrika/src/__lint-probe.tsx
  7:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders
  ...
>  7 |     setDoubled(value * 2);
     |     ^^^^^^^^^^ Avoid calling setState() directly within an effect
   8 |   }, [value]);  react-hooks/set-state-in-effect

✖ 1 problem (1 error, 0 warnings)
--- exit: 1 ---
probe removed
```

Kural ateşliyor. Dolayısıyla depodaki 0, "bakılmadı" değil, "susturuldu" demekti.

### 2.3 Susturmalar — önce / sonra

```
ÖNCE
$ grep -rn "eslint-disable.*set-state-in-effect" src/
src/app/[locale]/(app)/[workspace]/notifications/client.tsx:60: // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
src/components/UserMenu.tsx:194:                                 // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above

SONRA
$ grep -rn "eslint-disable.*set-state-in-effect" src/
NONE
```

Tam olarak iki bileşen → TASK-MTREW28BU7STD'nin sayısı doğru.

### 2.4 Kapı — izole ölçüm

Ana çalışma ağacında başka ajanların commit'lenmemiş işi var (§4.3), bu yüzden kapı **HEAD'den
açılan izole bir git worktree**'de, **yalnız bu görevin değişiklikleriyle** koşuldu.

Temiz taban (worktree, HEAD `d908847`, hiç değişiklik yok):

```
eslint .   → ✖ 16 problems (0 errors, 16 warnings) · set-state-in-effect: 0
tsc --noEmit → 0 hata
vitest run → Test Files 1 failed | 93 passed | 2 skipped (96)
             Tests 4 failed | 1034 passed | 12 skipped (1050)
```

Bu görevin değişiklikleri uygulandıktan sonra, aynı worktree:

```
$ npx eslint . ; echo "LINT EXIT CODE: $?"
LINT EXIT CODE: 0
✖ 15 problems (0 errors, 15 warnings)     ← 16'dan 15'e; set-state-in-effect hits: 0

$ npx tsc --noEmit ; echo "TYPECHECK EXIT CODE: $?"
TYPECHECK EXIT CODE: 0

$ npx vitest run ; echo "TEST EXIT CODE: $?"
TEST EXIT CODE: 0
 Test Files  95 passed | 2 skipped (97)
      Tests  1044 passed | 12 skipped (1056)
```

**Üç kapı da yeşil (exit 0).** Uyarı 16 → 15 (kaldırılan `catch (e)` bir `no-unused-vars`
uyarısı da götürdü); kırık 4 test düzeldi; 1 yeni test dosyası (+6 test) eklendi.

### 2.5 Yeni regresyon testi

`tests/notifications-read-store.test.tsx` — gerçek render, gerçek tıklama, gerçek
`localStorage`:

```
$ npx vitest run tests/notifications-read-store.test.tsx --reporter=verbose
 ✓ renders every notification unread on the server, where the store does not exist 7ms
 ✓ applies the stored overlay to the rendered list 20ms
 ✓ marks a single notification read when the user clicks it 12ms
 ✓ marks every notification read from the header button 7ms
 ✓ picks up a write from another tab 6ms
 ✓ survives a corrupt stored value instead of blanking the feed 4ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

**Dürüstlük notu:** bu testler eski (efekt tabanlı) sürüme karşı da koşuldu ve **6/6 geçti**:

```
$ cd <worktree> && git stash push -u -- src && npx vitest run tests/notifications-read-store.test.tsx
=== OLD (effect-based) implementation, HEAD src ===
1        ← eslint-disable satırı hâlâ yerinde
 ✓ ... (6/6)
      Tests  6 passed (6)
```

Yani bunlar deseni **ayırt eden** testler değil, refactor'ın kullanıcıya görünen davranışı
**değiştirmediğini** kanıtlayan testler. Deseni geri gelmekten alıkoyan şey testler değil,
susturması kalkmış olan **kuralın kendisi**. Test dosyasının başındaki yorumda da böyle yazıyor.

### 2.6 Gerçek tarayıcı

Canlı oturumda `http://localhost:3000/en/demo-sme/notifications`, refactor edilmiş kodla:

- `docs/agent-results/TASK-MTQVFP0LV3YV7-screenshots/01-notifications-page-after-refactor.png`
  — sayfa açılıyor, "All Notifications Read" rozeti (`unreadCount === 0` türetmesi çalışıyor),
  hidrasyon/derleme hata katmanı yok.
- `docs/agent-results/TASK-MTQVFP0LV3YV7-screenshots/02-usermenu-bell-dropdown-after-refactor.png`
  — zil tıklandı, ikinci refactor yüzeyi (UserMenu) açılıyor: "All Read" + boş durum.

**Kapsam sınırı (açıkça):** bildirim akışı bugün **kasıtlı olarak boş** — `page.tsx`
`initialNotifications={[]}` gönderiyor (TASK-MTQYXISOPUJ53, uydurma bildirimler söküldü). Bu
yüzden "okundu işaretle" yolu tarayıcıda **tıklanarak** doğrulanamaz: gösterilecek bildirim yok.
O yolun kanıtı §2.5'teki gerçek-tıklama testleri. Tarayıcı kanıtı, iki yüzeyin de refactor
sonrası **çöküp çökmediğini** ve boş-durum türetmesini kapsıyor.

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/hooks/use-read-notifications.ts` | **YENİ** — `useSyncExternalStore` tabanlı okundu-örtüsü store'u + yazma yolu + anahtar üreteci |
| `src/app/[locale]/(app)/[workspace]/notifications/client.tsx` | `useState`/`useEffect`/`useCallback` ve susturma kaldırıldı; liste türetme oldu; yazma yolları hook'a taşındı |
| `src/components/UserMenu.tsx` | aynısı; ayrıca `syncNotifications`'a atıf yapan bayat yorum düzeltildi |
| `tests/notifications-read-store.test.tsx` | **YENİ** — 6 davranış testi (SSR anlık görüntüsü, örtü, iki yazma yolu, sekmeler arası, bozuk değer) |
| `tests/m11-partb-editor-buffer.test.tsx` | kapsam dışı onarım — render `NextIntlClientProvider` ile sarıldı (§4.2) |

`messages/*.json` **değişmedi**: bu iş kullanıcıya görünen yeni metin eklemiyor (CLAUDE.md
kural 8 açısından nötr). Kural 7 (sabit rakam) bu işin kapsamına girmiyor.

---

## 4. Yol üstünde görülen, DÜZELTİLMEYEN bulgular (bildirim)

### 4.1 Sabit gömülü UI metni — CLAUDE.md kural 8 ihlali

Her iki dosya da `t('...')` yerine `isTr ? 'Türkçe' : 'English'` üçlü operatörü kullanıyor:

- `src/app/[locale]/(app)/[workspace]/notifications/client.tsx` — satır **74, 89, 96, 102, 116, 178** (6 üçlü, daha fazla dize)
- `src/components/UserMenu.tsx` — **27** üçlü; ilkleri satır **237, 239, 255, 266, 270, 275**

Dokunmadım: kapsam dışı, ve `notifications/client.tsx` şu anda TASK-MTQYXISOPUJ53'ün
(in_progress) elinde. Kendi kartını hak ediyor.

### 4.2 HEAD'de kırık 4 test — `3b5ad2a` bunu bırakmış

```
$ git show 3b5ad2a -- src/modules/m11/ui/PartBCollaborativeEditor.tsx | grep "^+.*useTranslations"
+import { useTranslations } from 'next-intl';
+  const tIdentity = useTranslations('UserIdentity');
+  const tEditor = useTranslations('PartBEditor');
```

`3b5ad2a fix(m11): print the recorded signatory, never a hard-coded person` (TASK-MTRHZIWHU2SKA,
**done** işaretli) bileşene `useTranslations` ekledi ama var olan
`tests/m11-partb-editor-buffer.test.tsx:50`'deki render'ı sağlayıcıyla sarmadı →
`Failed to call useTranslations because the context from NextIntlClientProvider was not found`
→ 4 test kırık. Temiz worktree'de de kırık, yani benim işimden değil.

**Bunu düzelttim** (kural (d) yeşil kapı istiyor), ama bildiriyorum: "done" işaretli bir kart
depoyu kırık test ile bırakmış. Düzeltme testte, üretim kodunda değil.

### 4.3 Ana çalışma ağacında başka ajanların commit'lenmemiş işi kapıyı kırıyor

Bunlar **benim değişikliklerim değil** — izole worktree kanıtı §2.4:

- `src/components/UserMenu.tsx` — 6 çağrı noktasında `activeWorkspace: string | null`,
  `getWorkspaceRoute(workspace?: string)`'a veriliyor → `TS2345` ×6 (satır 294, 364, 373, 387,
  396, 410). `demo-sme` fallback'ini söken paralel iş; `null` daraltması eksik kalmış.
- `src/lib/inngest/jobs/alerts-daily.ts:9` — `Module '"@prisma/client"' has no exported member 'Prisma'` (`TS2305`).
- İzsiz dosyalar: `scripts/test-partners-api.ts` (bir `no-unused-vars` uyarısı üretiyor),
  `scripts/_tmp/`.

**Güncelleme (aynı oturum, commit'ten hemen önce):** sahibi bu ikisini düzeltmiş; ana ağaçta
son ölçüm `typecheck exit 0`, `lint exit 0`, `vitest exit 0` (96 dosya). Yani artık kapıyı
kırmıyorlar — kayda tarihsel olarak bırakıldı. `UserMenu.tsx` hâlâ o işin commit'lenmemiş
değişikliklerini (workspace switcher, `UserMenuWorkspace` tipi, `demo-sme` fallback'inin
kaldırılması) taşıyor; benim refactor'um onun **üstüne** uygulandı ve dosya tek parça
commit'lendiğinden bu commit o işi de içeriyor. Kasten değil, paylaşılan dosya olduğu için;
sahibinin haberi olsun.

---

## 5. Riskler

- **Anlık görüntü kararlılığı.** `useSyncExternalStore`'da `getSnapshot` her çağrıda referansı
  değişen bir değer dönerse React sonsuz render eder. Bu yüzden hook **string** dönüyor, parse
  `useMemo` içinde. Bu dosyaya dokunacak biri bunu bozmamalı — sebebi kodda yorumlu.
- **Boş akış.** Bildirim deposu yok (`prisma/schema.prisma`'da model yok), akış boş. Depo
  eklendiğinde bu hook'un gerçek veriyle davranışı yeniden görülmeli; testler sahte listeyle
  koşuyor.
- **Paralel iş çakışması.** `UserMenu.tsx` üzerinde eşzamanlı başka bir iş var (§4.3). Benim
  düzenlemem onun üstüne temiz uygulandı, ama commit sırası önemli.
- **Test ortamı.** Bu depoda jsdom'da `localStorage` **yok** (`typeof localStorage === 'undefined'`);
  yeni test kendi Storage'ını kuruyor. Aynı şeye ihtiyaç duyacak sonraki testler için not.

---

## 6. Açık sorular

1. `notifications/client.tsx` ve `UserMenu.tsx` i18n borcu (§4.1) kime/hangi karta gidiyor?
2. §4.3'teki commit'lenmemiş typecheck hataları kimin? Kapı kırmızı kalmasın.
3. TASK-MTREW28BU7STD (backlog) artık **bu işle kapandı** — kapatılsın mı, yoksa doğrulama
   ayrı mı yürüsün?
4. Kural zaten `error` olduğuna göre `eslint.config.mjs`'e **açık** bir satır eklenmeli mi?
   Gerek yok, ama bir sonraki denetçinin aynı grep tuzağına düşmesini engellerdi.

---

## 7. Sonraki adım

- Bu değişiklikler `dev`'e commit edilir (aşağıda), TASK-MTQVFP0LV3YV7 → `review`.
- TASK-MTREW28BU7STD ölçümle doğrulandı ve kapsandı → kapatılabilir.
- §4.1 için i18n kartı, §4.3 için sahiplerine bildirim.
