# NG-33 — G1 kapı kuralının kalan koşulları (coe-gnd)

**Hüküm: KISMİ.** G1 "onaylı bütçe payı" koşulu uygulandı ve gerçek veritabanında kanıtlandı, ama kural varsayılan olarak **kapalı** geliyor. NDA koşulu için veri kaynağı yok (kanıt yok). Bütçe payı toplam eşiği şartnamede tanımlı değil. "Ortak çekilince yeniden açma" için yalnız "kapı yeniden koşunca refusal yazılması" test edildi; ortak çekilme yazma yolu kodda yok.

**Platform beyanı:** Linux (WSL Ubuntu 24.04) koşuldu. mac: koşulamadı (bu makinede mac yok). Windows: koşulamadı (kapı kodu yolu platforma bağlı değil, ama bu makinede Windows git worktree'si WSL git için bozuk olduğundan ayrı koşum yapılmadı). Hostinger canlı ortam: koşulamadı (canlı ekran görüntüsü alınmadı).

## Ne yapıldı
- `src/lib/gates/g1-consortium.ts`: `g1SeatsWithoutAgreedShare` (saf fonksiyon) ve `readG1BudgetShares` (tenant filtreli okuma). Yalnız zorunlu ve bir kuruluşun ismi yazılı koltuklar sayılır; `agreedAt` null olan teklif, onaylı sayılmaz.
- `src/lib/gates/evaluate.ts`: G1 dalında LOI bloğundan sonra, `requireAgreedBudgetShareForCriticalSeats` açıksa her eksik koltuk için `G1_NO_AGREED_BUDGET_SHARE` refusal; `criticalRolesWithoutAgreedBudgetShare` girdi kaydına yazılır.
- `src/lib/gates/reasons.ts`, `src/lib/hooks/use-gate-reason-text.ts`, `messages/en.json`, `messages/tr.json`: yeni refusal kodu ve metinleri (iki dil).
- `src/lib/scoring/defaults.ts`: `requireAgreedBudgetShareForCriticalSeats: false` (varsayılan kapalı; owner kararı yok).
- Testler: `tests/g1-budget-share.test.ts` (yeni, 9 test), `tests/gates.test.ts` (budget-share senaryoları), `tests/g1-gate.live.test.ts` (gerçek DB, 3 yeni test), `tests/helpers/gate-rules.ts` (`setAgreedBudgetShareRule`).

## Kanıt (ham çıktı)

Gerçek DB (izole container `ng33-pg`, `127.0.0.1:53213/ng33gate`, `pnpm db:setup` tamamlandı, çıkış 0):

```
 ✓ tests/g1-gate.live.test.ts (11 tests) 654ms
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

Fail→pass (mutasyon): `evaluate.ts` içinde budget-share koşulu `if (false && ...)` ile devre dışı bırakıldığında:

```
 × a seated member with no share: refused with G1_NO_AGREED_BUDGET_SHARE, filed, stage stays
 × a proposed share does not agree the seat; once agreed the gate passes and the stage moves to G1
 ✓ reopening: after a pass, the seat is emptied and the next run files a fresh refusal
Tests  2 failed | 9 passed (11)
```
Dosya geri alındı (`grep -c "if (false"` → 0). Not: "reopening" testi budget kuralını ayırt etmez; ortak çekilince koltuk "dolu değil" olduğu için refusal'ı `G1_SEAT_NOT_FILLED` üretir. Bu yüzden mutasyonda geçmesi beklenen.

Birim + kapı testleri (son durum):
```
 Test Files  4 passed (4)
      Tests  101 passed (101)
```
(gates.test.ts, g1-budget-share.test.ts, g1-gate.live.test.ts, prompt-snapshots.test.ts)

- `pnpm typecheck`: çıkış 0.
- `eslint` (değişen dosyalar): çıkış 0.
- Commit pre-commit kancası: "Kapı temiz (staged kapsamı)".

Tam `pnpm test` (worktree yeniden kurulduktan ve DB `fabrika_gate`'e taşındıktan sonra):

```
 Test Files  633 passed | 4 skipped (637)
      Tests  9107 passed | 76 skipped (9183)
```

Önceki ortam hataları (worktree git ls-files, DATABASE_URL, localhost) bu kurulumda yoktu. Pre-push gate'in ilk koşusu `jobs-enqueue-force.live` dosyasında düştü: bu test yalnız `fabrika_test`, `fabrika_test_ng<n>` ya da `fabrika_gate` adlı veritabanlarına yazmaya izin veriyor; ilk DB adım `ng33gate` idi. DB adı `fabrika_gate` olarak değiştirildi (kendi container'ımda), yeniden kurulum yapıldı, dosya geçti.

Lint, typecheck, i18n:check, rls:check, rls:bypass-check, alerts:check: hepsi çıkış 0.

## Değişen dosyalar
- `messages/en.json`, `messages/tr.json`
- `src/lib/gates/evaluate.ts`, `src/lib/gates/g1-consortium.ts`, `src/lib/gates/reasons.ts`
- `src/lib/hooks/use-gate-reason-text.ts`, `src/lib/scoring/defaults.ts`
- `tests/g1-budget-share.test.ts` (yeni), `tests/gates.test.ts`, `tests/g1-gate.live.test.ts`, `tests/helpers/gate-rules.ts`

`src/lib/rbac.ts` ve `src/modules/m18/` dokunulmadı.

## Riskler
- **NDA koşulu uygulanmadı.** Prisma şemasında, `prisma/`, `src/` ve `tests/` içinde NDA verisi yok. Uydurma tablo açılmadı. Kapı, NDA için "kanıt yok" durumunda kalır.
- **Bütçe payı toplam eşiği uygulanmadı.** Şartnamede (§12 G1) bağlayıcı bir sınır yok; şema da "sınır belirtmiyor" diyor. Eşik olmadan yalnız "onaylı bütçe payı var mı" koşulu kondu.
- **Kural kapalı başlıyor.** Owner kararı olmadan açılmaz; LOI kuralının emsali bu.
- **"Ortak çekilince" tetikleyicisi yok.** Kodda withdraw/release yazma yolu yok; yalnız gate yeniden koşunca refusal yazılıyor.
- **Konsorsiyum ekranı yeni koşulu göstermiyor.** `loadG1ConsortiumInputs` bu koşulu getirmiyor.
- **Canlı ekran görüntüsü yok.** Hostinger/UI doğrulaması yapılmadı.

## Açık sorular
1. NDA verisi nerede tutulacak (hangi tablo/alan)? Veri kaynağı gelmeden koşul uygulanamaz.
2. Bütçe payı toplam eşiği nedir? Şartnamede bulunmadı.
3. Owner: budget-share kuralı ne zaman açılacak?
4. Ortak çekilme işlemi hangi aksiyonla yapılacak; o aksiyonda gate otomatik yeniden mi koşacak?

## Sonraki adım
Yukarıdaki dört sorunun yanıtı gelince: NDA için veri modeli kararı, eşik kararı, withdraw aksiyonu için tetikleyici ve ekran gösterimi. Ardından kural owner onayıyla açılabilir.
