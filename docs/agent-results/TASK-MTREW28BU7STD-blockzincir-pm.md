# TASK-MTREW28BU7STD — set-state-in-effect: kalan iki bileşen

## Sonuç: MÜKERRER — iş zaten yapılmış (TASK-MTQVFP0LV3YV7, commit cefd598)

Bu kart "Kalan iki bileşende set-state-in-effect desenini kaldır" diyordu (S11, atanmamış
kalmıştı). Aynı anda ikinci bir kart, TASK-MTQVFP0LV3YV7, "KART İDDİASI YANLIŞ —
set-state-in-effect ilk günden beri error; '0' susturulmuş 2 ihlaldi, ikisi de söküldü"
diyordu (ex-en, `review`). İkisi aynı işi anlatıyor mu diye ölçtüm: **evet, aynı iş** — ve
o iş 2026-09-08'de commit `cefd598` ile tamamlanmış.

## 1) Adım (a) — Kural bugün ne durumda?

`eslint.config.mjs` kuralı doğrudan içermiyor (grep sıfır sonuç) ama bu kapalı olduğu
anlamına gelmiyor — kural `eslint-config-next/core-web-vitals` üzerinden geliyor:

```
$ npx eslint --print-config src/app/layout.tsx | jq '.rules["react-hooks/set-state-in-effect"]'
[2]   # = "error", ilk commit'ten beri (bkz. [[fabrika-eslint-rule-can-be-on-without-being-in-config]])
```

`pnpm lint` / `npx eslint .` tam koşusu: **0 hata, 0 uyarı** bu kural için (repo genelinde
tek kalan hata `.tmp-qa-en/measure1.ts` — başka bir ajanın taşınmamış scratch dosyası,
`@typescript-eslint/no-explicit-any`, bu kartla ilgisiz).

Sıfırın "kural kapalı" değil "ihlal kalmadı" anlamına geldiğini ayırt etmek için ikinci
bir ölçüm: repo genelinde susturma taraması.

```
$ grep -rn "eslint-disable.*set-state-in-effect" . --include="*.ts" --include="*.tsx" | grep -v node_modules
(0 sonuç)
```

## 2) Adım (b) — `useEffect` içinde `setState` deseni kalmış mı?

`git log --all --grep set-state-in-effect -i` üç commit gösteriyor:

1. `a4b09ad` — susturmaları doğru satıra taşıdı (borç henüz kapanmamış, 6 istisna)
2. `ed39194` — ilgisiz (k5 kart ataması)
3. **`cefd598`** — "subscribe to the read overlay instead of copying it in an effect":
   `notifications/client.tsx` ve `UserMenu.tsx`'teki son 2 istisnayı söktü, ortak
   `useSyncExternalStore` tabanlı `src/lib/hooks/use-read-notifications.ts` hook'una taşıdı.
   Bu commit'in mesajı **bu kartı adıyla anıyor**: *"exactly the two components
   TASK-MTREW28BU7STD names"*.

`cefd598` `dev` dalında ve HEAD'in atası (`git branch --contains cefd598` → `dev`).
Önceki 4 istisna (ThemeToggle, calls/page, PartBCollaborativeEditor ×2) ise daha erken,
`TASK-MTQV1JYGMGU6V` kartıyla (done, blockzincir-pm) kapanmıştı — kendi geçmiş işim.

Kod tarafında bugün `useEffect` içinde meşrulaştırılamayan bir `setState` kopyalama deseni
taradım — susturma kalmadığı için ESLint zaten bunu error olarak yakalar; `pnpm lint`
temiz olduğuna göre repo genelinde kalan ihlal yok.

## 3) Adım (c) — Karar

İki kart **aynı işi** anlatıyor: TASK-MTREW28BU7STD'nin talep ettiği "kalan iki bileşen"
tam olarak TASK-MTQVFP0LV3YV7'nin kapattığı iki bileşen. TASK-MTQVFP0LV3YV7 zaten kanıtlı
şekilde `review`'da duruyor (kendi sonuç raporu: `docs/agent-results/TASK-MTQVFP0LV3YV7-ex-en.md`,
ekran görüntüleri, testler: `tests/notifications-read-store.test.tsx`).

→ **TASK-MTREW28BU7STD'i MÜKERRER olarak `done`'a çektim**, açıklamasına referansı ve
kanıtı yazdım. TASK-MTQVFP0LV3YV7'ye dokunmadım (başka ajanın `review` kartı, kendi kanıtı
zaten var).

## Kanıt

```
$ npx eslint --print-config src/app/layout.tsx → react-hooks/set-state-in-effect: [2] (error)
$ npx eslint .  → 1 problem, ilgisiz (.tmp-qa-en/measure1.ts, no-explicit-any)
$ grep -rn "eslint-disable.*set-state-in-effect" . (node_modules hariç) → 0 sonuç
$ git log --oneline --all -i --grep="set-state-in-effect" →
    cefd598 refactor(react-hooks): subscribe to the read overlay instead of copying it in an effect
    ed39194 fix(k5): assign pipeline cards to real tenant members, not five invented names
    a4b09ad fix(lint): put the react-hooks suppressions on the lines they were meant for
$ git branch --contains cefd598 → dev
```

## Değişen dosyalar

Yok — kod tarafında yapılacak iş kalmamıştı, doğrulama + board güncellemesi + bu rapor.

## Riskler

Yok.

## Açık sorular

Yok.

## Sonraki adım

Board'dan sıradaki uygun kartı al.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HVuFCA7821KcQJnf7KzVsc
