---
card: FO-375
agent: be-fb
round: 5
branch: be-fb/mysql-faz1
platform: mac (darwin). Windows/Linux çalıştırılmadı.
verdict: KISMİ — kurulum iki kez geçti; 555 String kararı tamamlanmadı (69 PENDING kaldı); gate sonucu aşağıda.
---

# FO-375 — MySQL Faz 1: String kararları, kurulum doğrulaması (be-fb, tur 5)

**Hüküm: KISMİ.** Kurulum (`apply.sh --reset`) boş MariaDB'ye iki kez hatasız kuruldu. Ancak 555 `String` alanının tamamı karara bağlanmadı: 486 DECIDED, 69 PENDING. Kalan 69'u indeksli alanlar; tipi kanıtlanamadığı için lidere açık soru olarak bırakıldı (`Text` ile değil).

Bu turda bulunan ve düzeltilen hata: `InterregCriterionMark.rubricId` önceki turda `LongText` yazılmıştı. Bu sütun composite FK `(analysisId, tenantId, rubricId) → InterregAnalysis` parçası; MariaDB `ERROR 1071 (42000): Specified key was too long` ile reddetti. Hata bendendi: önceki FK taramam bu sütunu işaretlemişti ama kararı düzeltmemiştim. Karar `VarChar(64)` yapıldı (`InterregAnalysis.rubricId` ile aynı).

## Ne yapıldı

- Commit `9d5d772f`: `InterregCriterionMark.rubricId` → `VarChar(64)`; üretilmiş `schema.prisma`, `view-schema.prisma`, `init.sql` yenilendi.
- LONGTEXT-in-key taraması (yeni, mekanik): 91 tablonun her `CREATE TABLE` gövdesinde INDEX/KEY/PRIMARY/UNIQUE satırı ve o tabloya ait `ALTER ... FOREIGN KEY` satırları, LONGTEXT sütunlarla kesiştirildi. Sonuç: **yok** (temiz).
- Karar dağılımı: DECIDED 486, PENDING 69 (`generate.mjs --check` stats ile eşleşiyor).

## Kanıt (ham çıktı)

### Kurulum (container `fo375-mariadb`, scratch DB `fabrika_faz1`)

```
== run 1  exit=0
== run 2  exit=0
ok: --reset on fabrika_faz1 (container fo375-mariadb)
```

Log: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/5b9990c4-98c4-47a8-be3f-f50dc9685470/scratchpad/apply-run1.log`, `.../apply-run2.log`.

### information_schema (yalnız BASE TABLE; görünümler ayrıca sayıldı)

```
tablo sayısı (BASE TABLE)          91
görünüm (VIEW)                     59
longtext(4294967295)              377
varchar(128)                      159
varchar(191)                       69   ← PENDING alan sayısıyla eşleşir (69)
varchar(64)                        24
varchar(254)                        4
varchar(40)                         5
varchar(200)                        1
varchar(500)                        1
collation utf8mb4_bin             629
collation utf8mb4_unicode_ci       41   ← ciColumns = 41 ile eşleşir
oturum sql_mode  ANSI_QUOTES,ONLY_FULL_GROUP_BY,STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION
oturum time_zone +00:00
```

Not: `information_schema.COLUMNS` görünüm sütunlarını da döndürür; ilk sorgu bu yüzden şişik sayı verdi (longtext 617). Yukarıdaki sayılar tablo join'i ile yalnız temel tablolar için. Önceki turdaki 57 `_ci` ölçümü de görünümleri içeriyordu; açık soru 2 (sayı uyuşmazlığı) bu ölçümle **kapanmadı**, kapı sayısı hâlâ 41.

### Testler

```
npx vitest run tests/mysql-schema.test.mjs   →  Tests 23 passed (23)
perl -e 'alarm 900;exec @ARGV' ...            (süre duvarı 900 sn içinde)
```

### Mutant (kapı kırmızı mı?)

`prisma/mysql/schema.prisma` içinde `Tenant.slug` `@db.VarChar(999)` yapıldı:

```
stale or hand-edited: prisma/mysql/schema.prisma, prisma/mysql/init.sql. Run: node scripts/mysql-schema/generate.mjs
exit=1
```

Dosya yedekten geri yüklendi; `--check` yeniden `exit=0`.

## Değişen dosyalar (bu tur)

- `prisma/mysql/string-decisions.json` (rubricId kararı; diğer satırlar aynı biçimde)
- `prisma/mysql/schema.prisma`, `prisma/mysql/view-schema.prisma`, `prisma/mysql/init.sql` (yeniden üretildi)

`prisma/schema.prisma` ve `src/` değişmedi.

## Yapılmayanlar / bekleyenler

| Kalem | Durum |
|---|---|
| 555 String kararı | **486 DECIDED / 69 PENDING.** 69 indeksli alan kanıtlanamadı; lidere açık soru |
| 16 fazla kolon ve kök neden | **Ölçülmedi.** Önceki raporda bu sayı yok; kaynağı doğrulanamadı, bu yüzden raporlanmıyor |
| `v_Plan` satır ölçümü | **Yapılmadı.** Plan tablosu bu scratch DB'de boş; veri eklenmedi |
| strict-kapalı taşma ölçümü | **Yapılmadı** |
| Faz 2 çağrı noktası listesi | **Yapılmadı** |
| 91 model sınıflandırma tablosu, migrate diff, `down` scriptleri | **Yapılmadı** (bu turda önceliklendirilmedi) |
| Gate `pnpm gate` (ayrı, tam koşu) | **Yapılmadı.** Aşağıdaki push sırasında koşan gate yeterli değil; tam `pnpm gate` ayrıca koşulmalı |
| Push (ara nokta) | **Yapıldı.** `bash scripts/gate-isolated.sh git push origin be-fb/mysql-faz1` → `7e04b248..9d5d772f`, çıkış kodu 0, izole DB silindi |
| Draft PR #263 | **Açık, draft.** Head `9d5d772f480e4ffa91a9b5872fe54a782fb58584`; merge yok, dev'e dokunulmadı |

Push wrapper'ının çıktısı: `[gate-isolated] ok: git finished on an isolated database`. Wrapper'ın içindeki pre-push gate'in tam çıktısı (lint/typecheck/test/e2e) bu raporda ham olarak yok; GATE_EXIT olarak yalnız wrapper çıkış kodu (0) kaydedildi.

## Riskler

1. Bu turda hata yakalandı çünkü kurulum gerçekten koştu; önceki turlarda FK taraması tek başına yetmemişti. Kapı artık LONGTEXT-in-key kontrolünü mekanik çalıştırmıyor; yalnızca bu tur elle koşuldu. Kapıya eklenmesi önerilir.
2. 69 PENDING alan `VARCHAR(191)` kalıyor; tip kararı verilmeden Faz 2 bu alanlara yazan kodu ayrıca test etmeli.
3. information_schema sayım farkı (41 vs 57) çözülmedi.

## Açık sorular (lidere)

1. 69 indeksli PENDING alanın (oturum token'ları, dış sağlayıcı ID'leri, indeksli enum benzeri alanlar) tipine karar: `VarChar(N)` için sınır kanıtı gerekiyor. Liste `prisma/mysql/string-decisions.json` içinde `status: PENDING`. Önerim: her alanı sınır kanıtıyla birlikte ayrı bir turda çözmek.
2. `_ci` kolon sayısı: kapı 41 mi, yoksa 57 mi? Önerim: kapıya sayı sabitlemesi (ikisi de ölçülebilir).
3. `Tenant`, `Cordis*`, `PartnerSearch*` sistem mi platform mu? Ürün kararı.

## Sonraki adım

1. Push ve gate sonucunu al, bu dosyaya GATE_EXIT ve PR head yaz.
2. 69 PENDING alanı kanıtla çöz veya lidere sor.
3. v_Plan satır ölçümü ve strict-kapalı taşma ölçümü (ayrı kurulum).

Rapor yolu notu: istenen yol `/Users/macbook/alan/docs/agent-results/FO-375-be-fb-5.md` ana checkout'ta (kirli, başka dalın çalışma alanı). Ana checkout'a dokunulmadı; rapor bu worktree'de `docs/agent-results/FO-375-be-fb-5.md` olarak yazıldı.

DONE:st1 değil. Sebep: 69 PENDING alan ve gate/push sonucu tamamlanmadı.
