---
hüküm: DEĞİŞİKLİK GEREKLİ (kapı kırmızı, push YOK)
kod: TASK-MVMQ4RKCCMWFA (FO-133 düzeltme turu 2)
dal: se-fb/fo126-csv-sinks
---

# FO-133 düzeltme turu 2 — se-fb

**Platform beyanı:** koşulan platform mac (Darwin 27, zsh). Değişen kod platforma bağlı değil (yerel gün tarihi `toRangeParam`, TZ'ye bağlı tarih testi). Windows ve Linux'ta koşulmadı (koşulamadı: bu makinede yok).

## Ne yapıldı

1. **Bloke bulgu (`day()` yerel gün):** `tests/e2e/fo126-csv-formula-download.spec.ts` `day()` artık ürünün `toRangeParam` fonksiyonunu import ediyor (`src/modules/m5/server/range.ts`); kopyalanmadı. FO-136 (`tests/e2e/dashboard-kpi-links.spec.ts:42`) ile aynı desen.
2. **Doğrulama (TZ):**
   - Eski kod (`day()` = `toISOString`), `TZ=Pacific/Kiritimati`: **KIRMIZI** — `tests/e2e/fo126-csv-formula-download.spec.ts:67` (dashboard CSV): `Expected substring: "'=cmd|' /C calc'!A0"`, `Received string: "ID,Title,Stage,Status,Created,Updated"` (yalnız başlık). `1 failed | 1 passed`.
   - Eski kod, `TZ=Pacific/Pago_Pago`: `2 passed`.
   - Yeni kod, `TZ=Pacific/Kiritimati`: `2 passed`.
   - Yeni kod, `TZ=Pacific/Pago_Pago`: `2 passed`.
3. **Pre-push tam gate (`pnpm gate`, `--no-verify` yok):** izole DB (`fo126test`, konteyner `fo126se-pg`, port 55300; ad `fabrika` değil), izole mailpit (`fo126se-mail`, 1126/8126), dev sunucu `E2E_PORT=3127`. Süre duvarı `perl alarm 1200`. Sonuç: **çıkış 1**.
   - vitest: `385 passed | 2 skipped (387)`, `Tests 5087 passed | 54 skipped (5141)`. Skip sayısı yeni eklenmedi (FO-133 commit'i ile aynı; 54 skip gerekçesi bu turda incelenmedi).
   - lint: `0 errors, 4 warnings`.
   - e2e: `387 passed, 9 skipped, 6 failed` (15.5 dk).

## Kanıt: e2e başarısızlıkları (ham özet)

| Spec | Hata | Not |
|---|---|---|
| `dashboard-kpi-links.spec.ts:123` (tr, en) | `getByRole('link', {name:'Toplam Teklif — ayrıntıya git'})` `toHaveAttribute` beklenen `/tr/main/firsatlar` | Tekrar koşuda tr+en+139 kırmızı; dal temizken (fo126 değişikliği stash'li) aynı spec-set `12 passed`: KPI geçti. Tutarsız; yük ~28'de. Kök neden doğrulanmadı. |
| `dashboard-kpi-links.spec.ts:139` (tr, Enter) | 1.0 dk zaman aşımı | aynı |
| `expert-prereg.spec.ts:193` | `element(s) not found`, `NullConstraintViolation` | Tekrar koşuda da kırmızı. Bu turda ayrıca incelenmedi. |
| `team-members-ui.spec.ts:130` (mailpit) | `Expected: 1, Received: 0` (10 sn predicate) | **Temiz dalda da kırmızı** (`fo126-base.log`). Mailpit'te 6 mesaj var; test gönderimi bulamıyor. Ortam/bu tur dışı. |

Sunucu günlüğünde ayrıca çok sayıda `[WebServer] ⨯ Error: aborted` / `The destination stream closed early` (yük kaynaklı bağlantı kesmeleri) var.

## Public-shell 404 notu (önceki raporun açık sorusu)

Önceki raporda adlandırılmayan test: **`tests/e2e/public-shell.spec.ts:117`** — `the 404 page has the header and footer too` (60 sn zaman aşımı, `1 failed | 392 passed`). Tek başına koşulduğunda geçti (önceki rapor). Bu turda yeniden üretilmedi; bu dosya bu turun e2e çıktısında düşmedi.

## Değişen dosyalar

- `tests/e2e/fo126-csv-formula-download.spec.ts` (import + `day()`).

## Riskler

- **Kapı kırmızı.** Ortak push yapılmadı (pre-push kancası aynı gate'i koşacağı için reddedilir). PR #155 güncellenmedi.
- KPI-links tutarsızlığı ve expert-prereg `NullConstraintViolation`'ın kök nedeni bu turda doğrulanmadı.
- team-members mail testi temiz dalda da kırmızı; mailpit/SMTP ortam ayarı şüpheli (SMTP_PORT 1126 eşlemesi).
- Blog seed (`src/lib/blog-seed.ts`) `readTime` hatası: stale Prisma client'ta görüldü (`db:generate` sonrası düzeldi). Gate `db:generate`'i önce koşar; ama `db:seed` kapıdan önce elle koşulursa bu tuzağa düşülür.
- Prisma `db push` tek başına veri kaybı onayı istedi (`--accept-data-loss`); izole boş DB'de düz `prisma db push` kullanıldı, onay ortam değişkeni verilmedi.

## Açık sorular

1. Kapı kırmızı; PR #155 güncellemesi için (a) team-members mail ve KPI-links tutarsızlığının bu makinede yük/ortam kaynaklı olduğunu kabul edip tekrar koşu mu, yoksa (b) bu iki spec'in bu dalda bilinen kırmızı olduğunu onaylayıp PR'ı bu şartla mı güncelleyelim?

## Sonraki adım

- Yerel commit (push yok): yalnız `tests/e2e/fo126-csv-formula-download.spec.ts` + bu rapor.
- KPI-links ve expert-prereg için yük kontrollü (düşük yük) tek-tek koşu.
