# TASK-MULR4EOGWKAGX — ADR-0004: belediye/kamu segmenti öncelik 1 (leed-fb)

## 1. Ne yapıldı

- Patron kararı (29.09.2026) `docs/adr/ADR-0004-public-sector-segment-priority.md` olarak kayda geçti. Seçenek C seçildi: belediye/kamu öncelik 1, kalkınma ajansı kanalı, pilot İlkadım Belediyesi, kanal adayı OKA.
- `docs/BUSINESS_MODEL.md` §3 tablosunda 2 satır ve Yıl 1 hedef cümlesi güncellendi. Diff bilerek dar tutuldu: dosyanın geri kalanı prettier-uyumlu değil ve tüm dosyayı yeniden biçimlendirmek 113 satırlık gürültü üretiyordu.
- Uygulama kartları açıldı ve delege edildi (FB-KAMU-1): TASK-MULR39X1K5K6C (se-fb, radar), TASK-MULR3TQ24ZZ7N (fe-fb, karne), TASK-MULR4ATI5T158 (cs-fb, pilot + kanal paketi).

## 2. Kanıt

```
$ npx prettier --check docs/adr/ADR-0004-public-sector-segment-priority.md
All matched files use Prettier code style!
$ git show --name-only --format='%h %s' HEAD
6dfd76e5 docs(adr): ADR-0004 public-sector segment moves to priority 1; BUSINESS_MODEL §3 (TASK-MULR4EOGWKAGX)
docs/BUSINESS_MODEL.md
docs/adr/ADR-0004-public-sector-segment-priority.md
```

## 3. Değişen dosyalar

- `docs/adr/ADR-0004-public-sector-segment-priority.md` (yeni)
- `docs/BUSINESS_MODEL.md` (§3, 3 satır)

## 4. Riskler

- `BUSINESS_MODEL.md` HEAD'de zaten prettier-uyumsuz. `format:check` docs'u tarıyorsa bu dosya önceden de kırmızıydı; bu commit durumu değiştirmedi.
- "~1.390 belediye" sayısı genel bilgiye dayanıyor; cs-fb pilot paketinde resmî kaynakla doğrulanacak.

## 5. Açık sorular

- Yok (karar patronda verildi).

## 6. Sonraki adım

- cs-fb'nin "ürün boşlukları" listesinden (toplu davet, ajans panosu) yeni kartlar açılacak.
- TASK-MULQMNMPFY29P (ROADMAP güncellemesi) FB-KAMU-1'i de kapsayacak.
