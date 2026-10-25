---
sözleşme: 3
görev: TASK-MVBFDSUSE5QCY
kod: TASK-MVBFDSUSE5QCY
ajan: crw2-fb
motor: claude
tip: diğer
okur: ekip
hüküm: Bitti: Düzeltme gerekli. B-1 sızıntısı kapandı (21 girdide parola 0 kez), O-2, O-3 ve Ö-4 de kapandı, ama yeni açgözlü userinfo regex'i eskiden reddedilen `…@prod/db?application_name=a@localhost` URL'sini yerel sayıyor (regresyon, libpq prod'a gidiyor). `?h%6fst=` ve çok-host biçimi de yerel kontrolü atlatıyor. Düzeltme 2-3 satır.
platform: mac (Darwin 27; izole pgvector/pgvector:pg16 konteyneri 127.0.0.1:5479, ayrı detached worktree 8559ee17; 3000 ve 5433 kullanılmadı). Ö-4 perl tarifi Linux'ta da koşuldu (alpine:3.20 + perl konteyneri, 3 satır değişti, 0 kaldı). Linux CI koşulamadı: GitHub CI ödeme sorunu yüzünden başlamıyor. Koddan: db-target.sh POSIX sh + sed -E + tr; Linux/dash'te aynı davranır, bulunan atlatmalar da aynıdır. Windows: yalnız WSL/Git-Bash.
sürüm: 1
tarih: 2026-10-19T17:39:40.015Z
---

# FO-16 · PR #119 delta yeniden incelemesi (1f3bb04a → 8559ee17)

## Ne yapıldı
`git diff 1f3bb04a 8559ee17` (6 dosya: `scripts/db-target.sh` yeni, `scripts/db-setup.sh`, `githooks/pre-push`, `prisma.config.ts`, `tests/rls-coverage.test.ts`, `CLAUDE.md`) satır satır okundu. devop-fb'nin 2. tur raporu (`/Users/macbook/alan/docs/agent-results/TASK-MVBFDSUSE5QCY-devop-fb-2.md`) iddia iddia doğrulandı. Ayrı bir detached worktree (8559ee17) ve ayrı bir konteyner (`crw2-fo16b-pg`, 127.0.0.1:5479) kullanıldı. Ortak 5433 DB'ye ve 3000 portuna dokunulmadı. Kod değiştirilmedi, merge edilmedi. Worktree ve konteyner iş sonunda kaldırıldı.

## Hüküm: **Düzeltme gerekli**: 1 orta bulgu (R-1, regresyon içeriyor) ve 2 öneri
Önceki turun bloke eden bulgusu B-1 (parola sızıntısı) **kapandı**. O-2, O-3 ve Ö-4 de kapandı. O-1 kısmen kapandı. Yeni sorun, yerel kontrolün (`db_is_local`) fail-closed olmaması:

### R-1 (orta, düzeltilmeli): yerel kontrol üç girdide fail-open; biri bu commit'in regresyonu
- **Yer:** `scripts/db-target.sh:15` (`(.*@)?` açgözlü) ve `scripts/db-target.sh:20-28` (`db_is_local`)
- **Girdiler ve kanıt.** psql 16.15 her üçünde de `prod.example.invalid`'e bağlanmaya çalıştı:

| # | `.env` DATABASE_URL | db-target | db-setup | libpq gerçekte |
|---|---|---|---|---|
| 19 | `postgresql://u:pw@prod.example.invalid/db?application_name=a@localhost` | `localhost/` | **ACCEPTED** | `could not translate host name "prod.example.invalid"` |
| 16 | `postgresql://u:pw@localhost:5479/fabrika?h%6fst=prod.example.invalid` | `localhost:5479/fabrika` | **ACCEPTED** | `could not translate host name "prod.example.invalid"` (libpq parametre anahtarını da %-çözer) |
| 17 | `postgresql://u:pw@localhost:5499,prod.example.invalid:5432/fabrika` | `localhost:5499,prod…/fabrika` | **ACCEPTED** | localhost portu kapalı → `prod.example.invalid`'e düşüyor |

- **#19 regresyon:** eski regex `([^@]*@)?` bu girdiyi `prod.example.invalid/db` olarak okuyup reddediyordu. Yeni `(.*@)?` sorgu dizesindeki son `@`'ya kadar yutuyor. Ham karşılaştırma:
```
old: prod.example.invalid/db
new: localhost/
fix: prod.example.invalid/db      # ([^/?#]*@)? ile
```
- **#16:** O-1 düzeltmesi düz `?host=` / `&host=` / `HostAddr=` biçimlerini yakalıyor (case 13-15 REFUSED). %-kodlanmış anahtarı yakalamıyor.
- **#17:** önceki koddan kalma (`localhost:*` glob'u virgüllü host listesine uyuyor). Önceki turda ben de kaçırdım.
- **Etki:** üçü de bilerek yazılmış bir URL gerektiriyor, kaza olasılığı düşük. Ama commit "fail-closed" diyor ve #19, korumayı bu PR'dan önceki hâlinden zayıf bırakıyor. Kabul edilen bir prod URL'sinde `db:setup` ensure_rls tetikleyicisini kurar, `prisma db push` ve seed çalıştırır.
- **Önerilen düzeltme (3 satır):**
  - `db_target`: `(.*@)?` → `([^/?#]*@)?` (`@`'lı parola, case 18, hâlâ doğru: `prod.example.invalid/db`)
  - `db_is_local`'in ilk `case`'ine iki desen ekle: `*\?*%*` (sorgu dizesinde % olan URL'yi reddet) ve host kısmı için `*,*` (`case "${2:-}" in *,*) return 1;;`)
  - İsteğe bağlı ama kök neden bu: `tests/` altına db-target için tablo testi (aşağıdaki 21 girdi). Worker'ın 10 girdilik testi ad-hoc kaldığı için #19 kaçtı.

### Öneriler (kusur değil)
- **Ö-5:** `DATABASE_URL = "…"` (boşluklu) ve `export DATABASE_URL=…` biçimlerini dotenv okuyor, `db_env_value` okumuyor. db-setup "DATABASE_URL is not set" diyerek duruyor, hook `<ayrıştırılamadı>` yazıyor, gate ise dotenv'in değeriyle koşuyor. Sızıntı yok ve fail-closed, ama mesaj yanıltıcı. Sıradan bir durum değil.
- **Ö-6:** sıra testi `db:seed` adımının silinmesini (M4) hâlâ yakalamıyor. Bu, PR öncesinde de böyleydi.

## Sorulara yanıtlar
1. **B-1:** **kapandı.** 21 girdinin hepsinde `Sekr3tPw` / `S%65kr3tPw` db-setup ve pre-push çıktısında **0 kez** geçti. Bunlara önceki üç ham girdi (case 1-3), boşluklu değer (4, 5), `export` (6), tırnaklı ve tırnaksız satır sonu yorumu (7, 8, 9), URL-encoded parola (10), `postgres://` (11, 12), `@`'lı parola (18) ve çöp girdi (20) dahil. Gerçek hook'u da (`pnpm gate` stub'lı) tek tırnaklı `.env` ile koştum: `→ veritabanı: localhost:5479/fabrika`, parola 0 kez. **Pre-push ve db-setup aynı yardımcıyı kullanıyor** (`githooks/pre-push:14`, `scripts/db-setup.sh:36`). Ama yerel kontrol fail-closed değil: bkz. R-1.
2. **O-1:** `?host=`, `&host=` (sorgu dizesinde `schema=public&host=…`, case 14) ve `&HostAddr=` (büyük-küçük harf, case 15) yakalanıyor. `?h%6fst=` yakalanmıyor (R-1 #16).
3. **O-2:** **kapandı.** Boş `empty2` DB'sinde `migrate deploy`, `--config prisma.config.ts migrate deploy`, `--config=prisma.config.ts migrate deploy`, `migrate --schema … deploy`, `migrate dev --create-only` ve `migrate reset --force` komutlarının hepsi exit 1 verdi ve "is not how this repository builds a database … Nothing was applied" yazdı. Sonra tablo sayısı **0**. `migrate status` okuyor ("6 migrations found").
4. **O-3:** **kapandı.** baseline 9 geçti. M1 (db push komutu yoruma çevrildi), M2 (ensure-rls db push'tan sonra), M3 (4. adım db:rls silindi) ve M5 (CI'da tek db:setup) mutantlarının **hepsi 1 düştü**. M4 (seed silindi) 9 geçti (Ö-6).
5. **Ö-4:** **doğru.** CLAUDE.md'deki satırı birebir koştum (mac): `localhost:5433` kalan 0, `localhost:5479` 3 satır, AUTH_SECRET dolu. Linux'ta (alpine + perl) da aynı: "3 replaced, 0 left". Çift tırnak içindeki `\@` perl'e `\@` olarak geçiyor, yani dizi interpolasyonu yok.

## Kanıt (ham çıktı)
```
pnpm db:setup ×2 (boş DB, localhost:5479) → exit1=0 exit2=0
db-setup: target localhost:5479/fabrika … db-setup: done (localhost:5479/fabrika)
grep -c 'fabrika:fabrika@' run1.log run2.log → 0 / 0
pg_policies → 113 ; public tables → 77
pnpm rls:check → 0 ; pnpm rls:verify → "✅ 47 kiracıya özel tabloda … GERÇEKTEN ölçüldü" 0

case 13 ?host=          ec=1 refusing localhost:5479/fabrika
case 14 &host=          ec=1 refusing localhost:5479/fabrika
case 15 &HostAddr=      ec=1 refusing localhost:5479/fabrika
case 16 ?h%6fst=        ec=0 ACCEPTED target=localhost:5479/fabrika
case 17 multi-host      ec=0 ACCEPTED target=localhost:5479,prod.example.invalid:5432/fabrika
case 19 ?x=a@localhost  ec=0 ACCEPTED target=localhost/
(21 case'in tamamında pw_hits=0)

psql 'postgresql://…@localhost:5479/fabrika?h%6fst=prod.example.invalid' → could not translate host name "prod.example.invalid"
psql 'postgresql://…@prod.example.invalid/fabrika?application_name=a@localhost' → could not translate host name "prod.example.invalid"
psql 'postgresql://…@localhost:5499,prod.example.invalid:5432/fabrika' → localhost refused, then prod.example.invalid tried
```
Tam vitest ve gerçek push bu turda tekrar koşulmadı. Delta yalnız kabuk betiklerine, prisma.config.ts'e ve bir test dosyasına dokunuyor. İlgili test dosyası koşuldu. Worker'ın gate/push kanıtı raporunda var.

## Değişen dosyalar
Yalnız bu rapor. PR koduna dokunulmadı.

## Riskler
- R-1 merge edilirse koruma, #19 girdisi için PR öncesinden zayıf olur. Kaza ihtimali düşük, kasıtlı ya da garip bir URL ise prod'a db push/seed riski taşır.

## Açık sorular
Yok.

## Sonraki adım
devop-fb: R-1'in 3 satırı ve db-target tablo testi, sonra kısa bir delta incelemesi (yalnız `scripts/db-target.sh` ve test). Ö-1 (eski `db:migrate` belgeleri) önceki turda olduğu gibi ayrı küçük iş.
