# TASK-MTV50DQCQDB7B — EK (addendum)

> Ana rapor: `docs/agent-results/TASK-MTV50DQCQDB7B-blok-zincir-denet-i.md`.
> Bu dosya, ana rapor commit'lendikten (`8bd1a5f`) sonra aynı tur içinde ölçülen tek bir
> olguyu ekler. Ana raporun hükümleri (§0) **değişmedi**.

## Ek bulgu — aynı zamanlama deseni üçüncü kez tekrarladı

Ana rapor §2.4'te "ağaçta commit'siz duruyor" dediğim i18n işi, raporu commit'lediğim
dakikalarda **`6513085`** olarak indi:

```
$ git log --oneline -3
8bd1a5f docs(s12-audit): measure when each closing card's gate actually ran   ← ana rapor
6513085 i18n(pipeline): move the board header into the catalogues, and let the e2e read it there
8c46616 docs(s12-audit): closure-accuracy table for every SPRINT-S12 board card
```

`6513085` içeriği: `messages/en.json`, `messages/tr.json`,
`src/app/[locale]/(app)/[workspace]/pipeline/board.tsx`, `tests/e2e/module-gate.spec.ts`.

Denetim açısından iki sonucu var; ikisi de ana raporun §2.4 bulgusunu **güçlendiriyor**:

**1. Desen tekil bir kaza değil.** Benim kapı koşum (09:26:14–09:30:08) `6513085`'in
**içeriğini** ölçtü, ama o commit 09:36'da indi. Yani bu kapı da hiçbir commit'e ait değil:
`3e14b40`'ı (HEAD olduğu hâlde, spec ağaçta değişmişti) ölçemedi, `6513085`'i (henüz commit
olmadığı için) adıyla ölçemedi. Ölçtüğü şey ikisinin arasındaki geçici ağaç. Üç commit
arka arkaya, hiçbiri kendi hash'i altında bir kapı koşusuyla ölçülmemiş durumda —
bu, paylaşılan ağaçta çalışmanın **yapısal** sonucu, bir ihmal değil.

**2. Ana rapor §9.2 riski kapandı, ama beklediğim yoldan değil.** `3e14b40`'ın commit'lediği
çift (spec = düz Türkçe dizge + board = gömülü Türkçe başlık) artık ağaçta **yok**;
`6513085` onu geçersiz kıldı. O commit'in ağacı hiçbir zaman ölçülmedi ve **artık
ölçülemez**. Pratik etkisi yok — ölçülmüş olan onun ardılıdır ve yeşildi (ana rapor §4.2,
test 89–91) — ama "her commit ölçüldü" diye yanlış bir kayıt kalmasın diye yazıyorum.

## Etkilenmeyenler

- **`docs/ROADMAP.md` madde 17 kapanışı geçerli** (ana rapor §7): oradaki şart `3e14b40`'ın
  **inmesiydi**, ayrıca ölçülmesi değil — ve indi.
- **Üç kartın hükümleri değişmedi** (ana rapor §0): KAPANIR / KAPANIR / KAPANIR + fatura
  e2e kırmızısı için AYRI KART.
- **§5'teki kapı kırmızısı bu ekle ilgisiz** — kökeni `reuseExistingServer`, i18n işi değil.

## Paylaşılan ağaç notu

Ana raporu commit'lerken indeks'te komşu ajanın dosyaları duruyordu
(`messages/*.json`, `board.tsx`, `module-gate.spec.ts`, `TASK-MTV4YSO4SEMGG-screenshots/*`).
`git commit -- <yollar>` ile **yalnız kendi 4 dosyamı** commit'ledim; komşunun işi
`8bd1a5f`'e **girmedi** ve kendisi onları `6513085` olarak commit'ledi. Doğrulama:
```
$ git show --name-only --format="" 8bd1a5f | grep -c "messages/\|board.tsx\|module-gate\|MTV4YSO4SEMGG"
0
```

## Platform beyanı

**mac** (darwin 25.6.0, Apple Silicon). Bu ek yalnız `git log`/`git show` okumasına dayanır;
platforma bağlı kod yolu içermez, dosya düz metindir. Windows/Linux: koşulmadı — gerek yok,
ölçüm git geçmişinin kendisidir ve platformdan bağımsızdır.
