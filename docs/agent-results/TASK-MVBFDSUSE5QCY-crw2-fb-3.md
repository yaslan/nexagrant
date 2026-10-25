---
sözleşme: 3
görev: TASK-MVBFDSUSE5QCY
kod: TASK-MVBFDSUSE5QCY
ajan: crw2-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: Düzeltme gerekli. R-1 kapandı: üç girdi de artık reddediliyor ve boş DB'de db:setup iki kez exit 0 verdi. Ama yeni `([^/?#]*@)?` regex'i, parolasında ham `#` ya da `?` olan URL'de parolayı her push'ta pre-push satırına basıyor. libpq bu URL'lerle bağlanabiliyor, yani bu B-1'in dar bir dönüşü (Y-1). Önerilen regex bendendi. Düzeltme 2 satır.
platform: mac (Darwin 27; ayrı detached worktree 6040bf37, kendi konteynerim crw2-fo16c-pg pgvector/pgvector:pg16, 127.0.0.1:5481; 5433 ortak DB'ye, 5479 devop konteynerine ve 3000 portuna dokunulmadı). db-target.sh 20 girdilik tablo Linux'ta da koşuldu: alpine:3.20 (busybox sh+sed) ve node:20-bookworm-slim (dash + GNU sed), çıktı md5'i mac ile aynı (9699eab7…). Önerilen düzeltme de mac ve alpine'de aynı çıktıyı verdi (9e3f4403…). Linux CI koşulamadı: GitHub CI ödeme sorunu yüzünden başlamıyor. Windows: yalnız WSL/Git-Bash (POSIX sh betiği).
sürüm: 1
tarih: 2026-10-19T21:49:12.952Z
---

# FO-16 · PR #119 delta incelemesi 3 (8559ee17 → 6040bf37)

## Ne yapıldı
`git diff 8559ee17 6040bf37` satır satır okundu: `scripts/db-target.sh` +8/−2 ve yeni `tests/db-target.test.ts` (46 satır). Ayrı bir detached worktree (6040bf37) ve kendi konteynerim kullanıldı (`crw2-fo16c-pg`, 127.0.0.1:5481). 20 girdilik bir tablo hem yeni hem eski `db-target.sh` ile koşuldu. Ayrıca mac, alpine (busybox) ve debian (dash + GNU sed) üzerinde karşılaştırıldı. Boş DB'de `pnpm db:setup` iki kez koşuldu. Kod değiştirilmedi, approve verilmedi, merge edilmedi. Worktree ve konteyner iş sonunda kaldırıldı.

## Hüküm: **Düzeltme gerekli**: 1 orta bulgu (Y-1). R-1 kapandı.

### R-1: **kapandı**
| # | girdi | önce (8559ee17) | şimdi |
|---|---|---|---|
| 6 | `…@prod.example.invalid/db?application_name=a@localhost` | ACCEPTED `localhost/` | **refused** `prod.example.invalid/db` |
| 7 | `…@prod.example.invalid?application_name=a@localhost` (yolsuz) | — | **refused** `prod.example.invalid/` |
| 8 | `…@localhost:5479/fabrika?h%6fst=prod…` | ACCEPTED | **refused** |
| 10 | `…@localhost:5499,prod.example.invalid:5432/fabrika` | ACCEPTED | **refused** |

Diğer kontroller de doğru çıktı:
- `@`'lı parola (#3) ve sorgudan önce `%` geçen parola (#4) hâlâ yerel kabul ediliyor.
- `[::1]` yerel kabul ediliyor.
- `HOST=` büyük harfle, `LOCALHOST`, `localhost.prod…`, `postgresql:///fabrika` ve çöp girdi reddediliyor (fail-closed).
- `localhost,localhost` çok-host listesi de reddediliyor. Bu fazla katı ama zararsız.

`tests/db-target.test.ts` 13 girdiyi ve gerçek `sh` fonksiyonlarını koşuyor (kopya yok). Bu, önceki turdaki "tablo testi" önerisini karşılıyor.

### Y-1 (orta, düzeltilmeli): ham `#` / `?` / `/` içeren parola hedef metnine sızıyor (B-1'in dar dönüşü)
- **Yer:** `scripts/db-target.sh:15`, `([^/?#]*@)?`. Bu deseni önceki raporumda **ben önerdim**. Kök neden benim önerim.
- **Senaryo:** `.env` içinde `DATABASE_URL="postgresql://fabrika:Sekr3t#1@localhost:5481/fabrika"`. Userinfo grubu `#`'da kesiliyor, host grubu `@`'ya kadar `fabrika:Sekr3t#1`'i alıyor.
- **Ham çıktı:**
```
pre-push (gate stub'lı):  → veritabanı: fabrika:Sekr3t#1/@localhost:5481/fabrika
db-setup:                 db-setup: refusing fabrika:Sekr3t#1/@localhost:5481/fabrika: only a local …
?'li parola:              db-setup: refusing fabrika:Sekr3t/: …
eski 8559ee17 (#17-19):   LOCAL  localhost:5479/fabrika   (sızıntı yok)
```
- **Etki:**
  - Bu URL'ler kullanılabilir: libpq userinfo'yu ilk `@` ya da `/`'a kadar okur ve `#`/`?`'de durmaz. `ALTER USER … PASSWORD 'Sekr3t#1'` sonrası `psql 'postgresql://fabrika:Sekr3t#1@localhost:5481/fabrika' -c 'select 1'` komutu `1` döndürdü.
  - pre-push'ta reddetme yolu yok. Parola her push'ta konsola basılıyor, oradan da ajan loglarına ve raporlara geçiyor.
  - db-setup bu URL'yi reddediyor (fail-closed, güvenli), ama ret mesajında yine parolayı basıyor.
  - `/` içeren parola (#18) libpq'da da çalışmıyor, ama o da sızıyor.
- **Önerilen düzeltme (2 satır):** `db_target` içinde yazdırmadan önce çıktıyı katı biçime karşı doğrulamak. Biçime uymayan her şey `<ayrıştırılamadı>` olur:
```sh
  # Print only a well-formed host[:port]/db; anything else may carry userinfo.
  printf '%s' "$_t" | grep -Eq '^([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(:[0-9]+)?(,([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(:[0-9]+)?)*/[A-Za-z0-9_.$-]*$' || _t=
```
  Prototip 20 girdide şu sonucu verdi: sızıntı 0, yerel kabul edilenler aynı (#1-5), reddedilenler aynı. #13, #16-19 artık `<ayrıştırılamadı>` basıyor. mac ve alpine çıktısı aynı (md5 9e3f4403…). `tests/db-target.test.ts`'in "refuses" tablosuna `Sekr3t#1`, `Sekr3t?1` ve `Sekr3t/1` girdileri eklenmeli; testteki `not.toContain('pw')` kontrolü bunları yakalar.

## Kanıt (ham çıktı)
```
vitest run tests/db-target.test.ts tests/rls-coverage.test.ts → Test Files 2 passed, Tests 49 passed

boş DB (public tablo 0) → pnpm db:setup ×2 → exit1=0 exit2=0
db-setup: target localhost:5481/fabrika
db-setup: [0/7] db:generate … [7/7] db:seed
db-setup: done (localhost:5481/fabrika)          (her iki koşuda)
grep -c 'fabrika:fabrika@' run1.log run2.log → 0 / 0
pg_policies=113 ; public tables=77              (önceki turla aynı)
pnpm rls:check → exit 0
pnpm rls:verify → ✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
prisma migrate deploy → "is not how this repository builds a database … Nothing was applied."
git diff --stat 8559ee17 6040bf37 -- prisma/ → (boş; migration/şema değişmedi)

20 girdi tablosu md5: mac sh = alpine busybox = debian dash+GNU sed = 9699eab7…
```
Tam vitest ve gerçek push bu turda tekrar koşulmadı. Delta yalnız bir kabuk betiğine ve yeni bir test dosyasına dokunuyor; ikisi de koşuldu.

## Değişen dosyalar
Yalnız bu rapor. PR koduna dokunulmadı.

## Riskler
- Y-1 merge edilirse, parolasında ham `#` ya da `?` olan geliştiricinin parolası her push'ta loga düşer. Böyle bir parola nadir ama geçerli ve çalışan bir libpq URL'si.

## Açık sorular
Yok.

## Sonraki adım
devop-fb: Y-1 için 2 satır ve 3 test girdisi, sonra çok kısa bir delta incelemesi (yalnız `scripts/db-target.sh` ve test). R-1 ve geri kalan her şey hazır.
