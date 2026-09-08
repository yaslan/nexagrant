---
name: fabrika-e11-3-survey-was-never-sent
description: E11.3 ESR kalibrasyon anketi hiç gönderilmedi (roster placeholder); bloke artık `pnpm beta:esr-preflight` ile ölçülüyor — exit 0 dönmeden kart kapanmaz
metadata:
  type: project
  updatedAt: 2026-09-08
---

`TASK-MTQ2KL3JO4MK2` (E11.3) panoda uzun süre **"ortak anket yanıtları 2026-09-20/21 bekleniyor"**
diye bloke durdu. 2026-09-08'de doğrulandı: **anket hiçbir ortağa gönderilmedi ve mevcut hâliyle
gönderilemez.** `docs/BETA_DATA/beta-partners.csv` bilerek bir PLACEHOLDER (başlığında "STATUS:
PLACEHOLDER" yazıyor) ve 10 adresin 10'u RFC 2606 rezerve `@example.invalid` alanında;
`scripts/esr-calibration.ts --send` bunu reddediyor:

```
❌ --send refused: 10 roster address(es) are on a reserved, undeliverable domain … Replace the roster with real partners first.
```

Yani takvimde gün saymak boşa işliyordu — yolda hiçbir anket yoktu. Aynı şey `--send` kullanan diğer
beta script'leri (`scripts/beta-onboarding.ts`, `scripts/beta-pricing-survey.ts`) için de geçerli:
hepsi aynı `isPlaceholderEmail` guard'ını paylaşıyor.

**Neden önemli:** "dış yanıt bekliyoruz" tipi bir bloke, o dış tarafa gerçekten bir şey ULAŞTIYSA
anlamlıdır. Render edilmiş bir HTML gönderilmiş değildir.

**Nasıl uygula:** Bir görev "yanıt/geri bildirim bekliyor" diye bekletiliyorsa, beklemeye başlamadan
ÖNCE gönderimin gerçekleştiğini kanıtla (gönderim logu, guard'ın reddetmediği bir koşu). Fabrika beta
script'lerinde bunun tek satırlık testi: roster'da `.invalid` adres var mı. Gerçek roster repoya
GİRMEZ — `beta-partners.local.csv` (gitignore'lu) ya da repo dışı yol + `--roster=`.

**Artık makineyle sorulabiliyor (2026-09-08, commit `0c59340`):** `pnpm beta:esr-preflight` —
salt-okunur, hiçbir şey yazmaz/göndermez, bloke varken **çıkış kodu 1** döner ve her kırmızı satırın
insan aksiyonunu adıyla yazar. Bugünkü çıktısı: `roster`, `survey-sent`, `responses`, `accuracy`.
`--send` artık `survey/send-receipt.json` yazıyor (kısmi gönderimde de), `--rollback` onu SİLMİYOR —
"anket gerçekten gitti mi" sorusu böylece sonradan cevaplanabiliyor. Kartı `done` işaretlemenin tek
ölçütü: bu komutun 0 dönmesi.

**Tuzak:** `docs/BETA_DATA/esr-survey-responses.example.csv` bir harness self-test'i ve **%85
üretiyor** — kriteri kapatmış gibi görünür. Kapı onu başlığındaki `HARNESS SELF-TEST` işaretinden
(dosya adından DEĞİL) tanıyıp reddediyor.

**İlgili:** [[fabrika-esr-calibration-fixture-lost-in-s10-rebuild]],
[[fabrika-turn-a-stale-blocker-note-into-an-exit-coded-gate]],
[[fabrika-generated-report-can-tick-its-own-criterion-green]], [[fabrika-board-cards-go-stale]]
