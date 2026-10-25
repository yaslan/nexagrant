---
sözleşme: TASK-MVMFBXYRKJUO9 (FO-126) — 2. tur
hüküm: Bitti: crw-fb 1. tur bulguları B1 ve M1 kapatıldı; PR #155 güncellendi @2d3092ae; pre-push gate yeşil
tip: hata
platform: mac (darwin) — Node/Postgres/Chromium yerel; Windows ve Linux koşulmadı (CSV metni ve yazıcılar platforma bağlı değil)
---

# FO-126 (TASK-MVMFBXYRKJUO9) — 2. tur: PR #155 kapatma

**Ajan:** se-fb · **Dal:** `se-fb/fo126-csv-sinks` (base `dev`, #153 ucundan) · **PR:** #155 · **Uzak head:** `2d3092ae`
**Girdi:** `docs/agent-results/TASK-MVMFBXYRKJUO9-crw-fb.md` (hüküm: DÜZELTME GEREKLİ @203b7459)

## Ne yapıldı

| Bulgu | Durum | Nerede |
|---|---|---|
| B1 (engelleyici): dashboard ve evidence satır üreticileri test edilmiyordu | Kapatıldı | `src/lib/dashboard/opportunity-csv.ts`, `src/lib/evidence/evidence-csv.ts` (saf fonksiyonlar, `c3f9b8e8`); testler `tests/csv-export-sinks.test.ts` (`2d3092ae`) |
| B1 testi: `=`, `;=` ve CR içeren başlıklar | Eklendi | `opp4` (`Satır\r=1+1`) ve `ev3` (`Başlık\r;=1+1`) satırları |
| M1: `csvCell('\rcmd')` vakası | Eklendi | `src/lib/csv-cell.test.ts` (`2d3092ae`) |
| Gerçek tarayıcı indirmesi (pano + kanıt CSV, formül başlıklı kayıt) | Bu turda yeniden koşturuldu | `tests/e2e/fo126-csv-formula-download.spec.ts`, 2/2 geçti |

Kapsam dışı bırakılan: crw-fb M2 (`validUntil` için `String(Date)` biçimi). Bu tur kapsamında değil; eski koddan geliyor ve ayrı bir karar gerektiriyor (aşağıda açık soru).

## Kanıt (ham çıktı)

### Kırmızı → yeşil (birim)

Yeni kod (`2d3092ae`): `npx vitest run src/lib/csv-cell.test.ts tests/csv-export-sinks.test.ts` → **2 dosya geçti, 10/10 test geçti**.

Mutant 1 — yazıcılar ham hücre yazıyor (eski koddaki gibi; `csvCell(` → `rawCell(`, iki saf dosyada):

```
× neutralises a formula title under both delimiters and keeps every row intact
× neutralises a formula in the title, the issuing authority and the file name
AssertionError: expected { ',': [ …(2) ], ';': [ …(2) ] } to deeply equal { ',': [], ';': [] }
Tests  2 failed | 4 passed (6)
```

Mutant 2 — `csvCell`'de `\r` baştaki formül kontrolünden çıkarıldı (`FORMULA_START = /^[=+\-@\t]/`):

```
× quotes a cell with a semicolon, and neutralises a formula after the semicolon too
AssertionError: expected '"\rcmd"' to be '"\'\rcmd"' // Object.is equality
Tests  1 failed | 3 passed (4)
```

Her mutanttan sonra dosyalar yedekten geri yüklendi; `git diff` boştu.

Not: eski kodun birebir koşusu değil, yazıcıların ham hücreye döndüğü mutant. Eski davranışın kendisi `docs/agent-results/TASK-MVMFBXYRKJUO9-evidence/old-5073455c-*.csv` dosyalarında (1. tur, 5073455c'de alınmış) — orada `"=cmd|…"` formül hücresi açıkça görünüyor.

### Gerçek tarayıcı indirmesi (bu tur, izole DB `fo126`)

`FO126_EVIDENCE_DIR=… pnpm exec playwright test tests/e2e/fo126-csv-formula-download.spec.ts` → **2 passed (20.1s)**.

Ham içerik — dashboard (`docs/agent-results/TASK-MVMFBXYRKJUO9-evidence/dashboard-export-2.csv`):

```
ID,Title,Stage,Status,Created,Updated
cmvmk9bra0001ihxkyiod3uhf,'=cmd|' /C calc'!A0,G2,ACTIVE,2026-10-24T15:35:45.862Z,2026-10-24T15:35:45.862Z
demo-opp-5,SME-led R&D innovation — Eurostars,G4,ACTIVE,2026-10-24T15:35:19.310Z,2026-10-24T15:35:19.397Z
…
```

Ham içerik — kanıt (`docs/agent-results/TASK-MVMFBXYRKJUO9-evidence/evidence-export-2.csv`):

```
ID,Title,Category,IssuingAuthority,ValidUntil,Status,FileName
cmvmk9bri0002ihxkw8kyd704,'=cmd|' /C calc'!A0,CAT-01,"TSE;'=cmd|x",,VALID,'+SUM(A1)
```

Her iki dosyada da formül hücresi yok (`formulaCells` = `{',': [], ';': []}`); başlık `'=cmd…` metin olarak kalıyor, `TSE;` sonrası `=` nötralize.

Ekran görüntüleri: `docs/agent-results/TASK-MVMFBXYRKJUO9-evidence/dashboard-export-page-2.png`, `docs/agent-results/TASK-MVMFBXYRKJUO9-evidence/evidence-export-page-2.png` (formül başlıklı kanıt kaydının göründüğü kanıtlar sayfası).

Kanıt koruma: 1. tur dosyaları (`dashboard-export.csv`, `evidence-export.csv`, `*-page.png`) değiştirilmedi; 2. tur kanıtı `-2` soneklerle yazıldı.

### Pre-push gate (tam)

`git push -u origin se-fb/fo126-csv-sinks` → kanca tam `pnpm gate` koştu; sonuç:

- Birim (`vitest run`): **385 dosya geçti, 2 atlandı; 5084 test geçti, 54 atlandı.**
- E2E (playwright, chromium): **393 geçti, 9 atlandı** (10.4 dk).
- `check-orphan-alerts` çalıştı; kanca `EXIT=0` ile bitti; `To https://github.com/yaslan/fonbridge.git` push'u kabul etti.
- Uzak head doğrulandı: `2d3092ae`, PR #155 `OPEN`.

Atlanan testlerin gerekçesi: kaynak dosyalardaki skip koşulları; her skip için tek tek gerekçe çıkarılmadı (bu tur kapsamında değil) — açık nokta.

## Değişen dosyalar (2. tur commit'leri)

- `src/lib/csv-cell.test.ts` — `\rcmd` vakası (+1)
- `tests/csv-export-sinks.test.ts` — CR ve `;=` başlıklı satırlar (+6/−2)
- `docs/agent-results/TASK-MVMFBXYRKJUO9-evidence/{dashboard-export-2.csv, dashboard-export-page-2.png, evidence-export-2.csv, evidence-export-page-2.png}`
- (`c3f9b8e8` ve `5fa06636` zaten yerel olarak vardı; bu turda push ile uzağa gitti.)

## Riskler

- **Ortam:** Repo kökündeki `.env` bu oturumda okunamadı (erişim kuralı). İlk push denemesi, `DATABASE_URL_RLS_TEST`'in eski bir DB'ye gösterdiği ortam hatası yüzünden 255 testte düştü; düzeltme: `fabrika_app` rolünün şifresi kendi konteynerimde sıfırlandı ve URL ortam değişkeni olarak verildi. `.env` değiştirilmedi.
- DB adı `fabrika` kullanılmadı (ekip kuralı: retention canlı testi kendini atlar). Kurulum: `se-fb-fo126-iso`, port 55600, DB `fo126`. CLAUDE.md'deki tarif `POSTGRES_DB=fabrika` öneriyor; bu iki kuralın çelişkisi açık nokta olarak aşağıda.
- Platform: yalnız mac. CSV üretimi saf TS ve platforma bağlı değil; Windows/Linux'ta koşulmadı.
- Gate 2 kez koştu (ilk deneme ortam yüzünden kırmızıydı, kanca yeniden koşturuldu); son koşu temiz.

## Açık sorular

1. **M2 (`validUntil`):** `csvCell(String(i.validUntil || ''))` `Date` gelirse yerel `Date.toString()` üretir. Bu tur kapsamında değildi. `initialData` gerçekte `Date` mi `string` mi, onu kontrol edip biçimi (ISO ya da ekran biçimi) seçmek gerekiyor. Öneri: ayrı bir küçük iş.
2. **CLAUDE.md worktree tarifi** (`POSTGRES_DB=fabrika`) ile ekip kuralı (DB adı `fabrika` olmasın) çelişiyor. Hangisinin geçerli olduğunu lider karar versin.
3. **#153 sırası:** #153 merge edilince #155 `dev` üzerine rebase edilmeli; FO-124 farkı çakışabilir.

## Sonraki adım

- crw-fb 2. tur delta incelemesi: `2d3092ae` (ve `c3f9b8e8`, `5fa06636`).
- #153 merge sonrası #155 rebase.
- Açık sorular 1–2 için lider kararı.
