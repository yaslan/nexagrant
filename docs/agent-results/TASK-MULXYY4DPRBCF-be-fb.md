# TASK-MULXYY4DPRBCF — M9 `.ics` kesme sonrası satır DB'de kalıyor (be-fb)

**Hüküm:** Test hatası, ürün hatası değil. RLS de değil. Spec düzeltildi (`965c2c2f`), testler gevşetilmedi, bekleme sıkılaştırıldı.

## 1. Ne yapıldı

### Kök neden

`tests/e2e/m9-calendar-connect.spec.ts:171-173` kesme tıklamasından sonra şunu bekliyordu:

```ts
providerCard(page, ".ics File Import").getByRole("button", { name: "Bağla" });
```

Playwright rol adını varsayılan olarak **büyük/küçük harf duyarsız alt-dize** olarak eşler (`playwright-core@1.62.1/types/types.d.ts:3149-3150`: "By default, matching is case-insensitive and searches for a substring"). "Bağla", az önce tıklanan **"Bağlantısını Kes"** düğmesinin önekidir. Bu yüzden bekleme hiç beklemedi, hemen geçti. Sonra:

1. `findUnique` sunucu eylemi daha çalışmadan koştu. Satır hâlâ oradaydı, test düştü.
2. Test düşünce `afterAll` koştu: `clearConnections()` + `rollback()` satırı ve kullanıcıyı sildi.
3. Uçuştaki `disconnectCalendar` eylemi satırı bulamadı ve `CALENDAR_CONNECTION_NOT_FOUND` fırlattı.

Bu sıra CI günlüğünde zaman damgalarıyla görünüyor (aşağıda). Yarış testin kendi içinde. Ürün akışı (`src/modules/m9/server/calendar-actions.ts:28-65`) doğru: `withTenant` içinde okuyor, `deleteMany({ where: { id, tenantId, userId } })` ile siliyor.

### RLS sorusu

Kart, `fabrika_app` altında silmenin sessizce 0 satır etkileyip etkilemediğini sordu. Etkilemiyor:

- Sayfa (`page.tsx`) ve eylem aynı `withTenant(tenantId, …)` kalıbını kullanıyor. Sayfa satırı "Bağlı" olarak gösterdi, yani RLS satırı görüyordu.
- 0 satır silinseydi eylem `NOT_FOUND` değil `'Calendar connection delete matched no row'` fırlatırdı (`:57-63`). CI'daki hata `NOT_FOUND`, yani satır okunurken zaten yoktu, `afterAll` silmişti.
- Canlı test `tests/m9-calendar-tenant-scope.live.test.ts` ("still deletes the row when the caller does own it") `assertAppOwnerRole` ile uygulama rolü altında koşuyor ve yeşil.

### Düzeltme (yalnız spec)

- Kesme sonrası bekleme: `{ name: 'Bağla', exact: true }`. Artık yalnız sayfa yeniden yüklenip bağlantısız hâle dönünce geçiyor.
- Ek koşul: `icsCard.getByText('Bağlı', { exact: true })` → `toHaveCount(0)`.
- Diğer üç `name: 'Bağla'` seçicisine de (`:81`, `:91`, `:118`) `exact: true` eklendi. Bugün yanlış eşleşmiyorlar, çünkü o anda kartlarda "Bağlantısını Kes" düğmesi yok. Ama aynı tuzağa açıklar.
- DB iddiası (`expect(survivor).toBeNull()`) aynen duruyor. Gevşetme yok.

## 2. Kanıt

CI 36499253610 (`gh run view … --log-failed`), test 109'un zaman çizelgesi:

```
23:54:27.009  ✓ 108 … .ics connects for real …
23:54:32.884  [seed-f10-e2e] rolled back                      ← afterAll, test gövdesi zaten düşmüş
23:54:33.258  [WebServer] ⨯ Error [CalendarActionError]: CALENDAR_CONNECTION_NOT_FOUND
              at src/modules/m9/server/calendar-actions.ts:37:13
23:54:33.347  ✘ 109 … .ics disconnects for real and the row leaves the database (5.7s)
Error: expect(received).toBeNull()
Received: {… "id": "cmulwmhs900bv332gwa82yhid", "isConnected": true, "createdAt": 2026-09-28T23:54:27.081Z …}
```

`rolled back`, sunucu hatasından **önce**. Sunucu eylemi satırı test bittikten sonra aradı.

Önce/sonra eşleşme (Playwright'ın alt-dize kuralının birebir aynısı, `node -e`):

```
önce (varsayılan, alt-dize): Bağlantısını Kes -> true
sonra (exact:true):         Bağlantısını Kes -> false
```

Ürün tarafı, canlı DB (uygulama rolü):

```
$ npx vitest run tests/m9-calendar-tenant-scope.live.test.ts tests/m9-calendar-connect.test.ts
 Test Files  2 passed (2)
      Tests  18 passed (18)
```

Kapılar:

```
typecheck exit=0          (tsc --noEmit)
lint exit=0               (npm run lint, tüm repo)
npm test: Test Files 1 failed | 184 passed | 2 skipped — Tests 3 failed | 2098 passed | 8 skipped
```

Düşen 3 testin hepsi `src/lib/agency/funnel.test.ts` içinde. Bu dosya fe-fb'nin paralel, **commitlenmemiş** çalışması (`git diff --stat`: +80 satır, benim commit'imde yok). Kartın kuralı gereği dokunmadım. Benim değişikliğimle ilişkisi yok.

**E2E koşulmadı:** AgentSpace kill-guard (R8) "playwright" geçen komutları reddediyor, `:3000` de leed-fb'nin. Yeşil kanıtı bir sonraki CI koşusu verecek. Beklenen: test 109, `Bağla` (exact) görünene kadar bekler ve satır silinmiş olarak geçer.

## 3. Değişen dosyalar

- `tests/e2e/m9-calendar-connect.spec.ts`: commit `965c2c2f` (yalnız bu dosya, `git commit -- <yol>`)
- `docs/agent-results/TASK-MULXYY4DPRBCF-be-fb.md`: bu rapor

## 4. Riskler

- `providerCard` hâlâ `div.rounded-2xl` + `hasText` ile seçiliyor. Sayfaya aynı sınıfla bir kapsayıcı eklenirse kart seçicisi birden fazla öğe yakalar. Bu işin kapsamı dışında.
- Aynı alt-dize tuzağı başka spec'lerde de olabilir (örn. "Kaydet" / "Kaydetme…"). Tarama yapılmadı.

## 5. Açık sorular

- Yok.

## 6. Sonraki adım

- Bir sonraki CI koşusunda test 109'un yeşil olduğunu doğrula (push liderde).
- İsteğe bağlı: `tests/e2e` genelinde `getByRole(…, { name: '<kısa>' })` için önek çakışma taraması.

## Platform beyanı

Doğrulama **mac** (Darwin 27, yerel Postgres :5433) üzerinde yapıldı: typecheck, lint, vitest (canlı DB dahil). Kök neden Linux CI (ubuntu runner) günlüğünden çıkarıldı. Değişiklik yalnız test seçicisi, platforma bağlı kod yolu yok (süreç, dosya yolu, kabuk kullanılmıyor). Windows'ta davranış aynıdır. Windows'ta koşulmadı, çünkü bu makinede Windows ortamı yok. E2E hiçbir platformda yerelde koşulmadı (kill-guard R8).
