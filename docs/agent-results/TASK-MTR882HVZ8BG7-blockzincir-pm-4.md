# TASK-MTR882HVZ8BG7 — Board Mutabakatı (4. Tur)

**Durum tespiti:** Görev board'da hâlâ `in_progress` görünüyordu, ancak yenileme sorusu
3. alt-görevde (`-3.md`) zaten uçtan uca kanıtlanmış ve kodlanmıştı. Bu tur **yeni iş
yapmadı** — mevcut kanıtı bugünkü kod/git durumuna karşı yeniden doğruladı ve board
statüsünü gerçek duruma çekti.

## Kanıt (yeniden doğrulama)

```
$ git log --oneline -5 -- src/lib/billing/price-lock.test.ts docs/BILLING.md
8c459d6 test(billing): prove renewal pricing is decided once at checkout, not re-derived
```

```
$ grep -n "4.1.1\|RENEWAL-UI-1" docs/BILLING.md
128:#### 4.1.1 Fiyat kilidi — "katıldığın fiyat seninle kalır" (TASK-MTR882HVZ8BG7)
167:- Bilinen görünürlük açığı — RENEWAL-UI-1: Subscription.currentPeriodEnd ...
```

```
$ grep -n "renewal quoting" src/lib/billing/price-lock.test.ts
190:describe('renewal quoting — effectiveTier() feeding priceLine(), not a catalogue refresh', () => {
```

`-3.md`'deki DoD listesi ve commit `8c459d6` bugünkü çalışma ağacında hâlâ geçerli;
kod/test/doküman değişmedi, yalnız board statüsü `in_progress → done` olarak düzeltildi.

## Değişen Dosyalar
- Yok (kod). Board statüsü güncellendi.

## Riskler
- Yok.

## Açık Sorular
- `RENEWAL-UI-1` hâlâ açık (ürün kararı bekliyor — `-3.md`'de detaylı): faturalandırma
  paneline "sıradaki tahsilat: $X, DD.MM.YYYY" satırı eklenmeli mi?

## Sonraki Adım
- `RENEWAL-UI-1` için ayrı bir görev açılabilir (istenirse).

---
**Raporlayan:** blockzincir-pm (PM-EN)
**Tarih:** 2026-09-07
**Not:** Bu tur yalnız mutabakat/kapanış; asıl kanıt `-3.md`'de.
