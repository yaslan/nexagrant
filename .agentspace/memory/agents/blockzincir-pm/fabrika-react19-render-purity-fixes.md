---
name: fabrika-react19-render-purity-fixes
description: React 19'un set-state-in-effect ve purity lint hatalarını istisna yazmadan çözen üç desen — Fabrika'da kanıtlanmış
metadata:
  type: reference
updatedAt: 2026-09-07
---

Fabrika'da `react-hooks/set-state-in-effect` ve `react-hooks/purity` hatalarını
`eslint-disable` yazmadan kapatan üç desen (TASK-MTQV1JYGMGU6V'de üç bileşende uygulandı,
gerçek tarayıcıda doğrulandı):

1. **Mount/hidrasyon bayrağı** — `useState(false)` + `useEffect(setMounted(true))` yerine
   `useIsHydrated()` (`src/lib/hooks/use-is-hydrated.ts`): `useSyncExternalStore(subscribe,
   () => true, () => false)`. Sunucuda ve hidrasyon geçişinde `false`, sonra `true`.
   İkinci render commit'i yok.

2. **`loading` bayrağı** — saklamak yerine türet: filtrelerin tarif ettiği sorgu anahtarı
   (`useMemo`) ile ekrandaki verinin geldiği anahtar (`loadedQuery` state'i) farklıysa yükleniyor.
   Effect gövdesinde `setState` kalmaz; hepsi `await`'ten sonra olur. Bedava gelen kazanç:
   `let cancelled` ile bayat yanıtı düşürme.

3. **Bölüm/prop değişince state'i sıfırlama** — effect ile kopyalamak yerine tamponu ait olduğu
   anahtarla etiketle: `useState<{key, text} | null>` ve render'da
   `draft?.key === activeKey ? draft.text : source.content`. Anahtar değişince tampon bayatlar,
   kaynak içerik kendiliğinden görünür. Yan sonuç: geri dönünce kaydedilmemiş metin KORUNUR
   (eski effect siliyordu) — bu bir davranış değişikliğidir, teste yaz.

4. **Render'da `Date.now()`** (purity) — saati dış depo gibi abone et:
   `useNow(intervalMs)` (`src/lib/hooks/use-now.ts`), `getSnapshot` interval'a yuvarlanır
   (aksi hâlde React sonsuz render eder), `getServerSnapshot` `null` döner. Süresi dolan
   kilit/sayaç artık gerçekten güncelleniyor.

Ayrıca: bir "istisna" satırının gerçekten bir ihlali bastırdığını VARSAYMA — Fabrika'da 10
istisnadan 5'i ölüydü (`Unused eslint-disable directive`). Kapsamı ölçmenin yolu istisnaları
çıkarıp `npx eslint <dosyalar>` koşmaktır. Bkz. [[fabrika-lint-gate-green-narrow-exceptions]].
