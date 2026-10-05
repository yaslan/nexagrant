---
name: fabrika-green-gate-does-not-prove-a-clean-clone
description: Yerelde yeşil kapı (typecheck/lint/test) temiz klonu KANITLAMAZ — untracked dosyalar suiti ayakta tutabilir; durum kontrolünde git status'a da bak
metadata:
  type: project
  updatedAt: 2026-09-09
---

2026-09-08 durum taramasında Fabrika `dev` dalında typecheck exit 0, lint 0 uyarı,
1299 test PASS ölçüldü — ama HEAD temiz bir klonda o testleri koşturamaz: commit'lenmiş
üç test dosyası (`src/lib/billing/subscription-sync.test.ts:19` ve iki kardeşi)
**untracked** olan `tests/helpers/partial-row.ts`'i import ediyordu. Aynı şekilde
`pnpm efatura:preflight` bir kartın DoD kanıtıydı ama `package.json` satırı commit
edilmemişti.

**Neden:** worker pane'leri iş bitince commit atmadan ölüyor (API limiti / uygulama
yeniden başlaması). Çalışma ağacında kalan dosyalar yerel koşuyu yeşil tutuyor, bu
yüzden ne worker ne lider farkı görüyor.

**2026-09-09 — İKİNCİ KEZ, ve yeni bir varyantla: RAPOR HEAD hakkında yanılabilir.**
`ADR-0002-geli-tirici-2.md` (f) maddesi "yuvarlama üç kopyadan tek fonksiyona indirildi"
diyordu; iddia DOĞRUydu ama üç kopyadan **ikisinin kaldırılması HEAD'de yoktu** —
`efatura.ts` ve `invoice-list.ts` hâlâ kendi `Math.round((x*rate)/100)`'ünü taşıyordu
(70 satır yeni testle birlikte çalışma ağacında bekliyordu, sonradan `1547db2` ile indi).

Buradaki sinsi nokta: **`pnpm test` yeşildi, çünkü çalışma ağacını koşuyor.** Yani yeşil
suit, HEAD'in yeşil olduğunu KANITLAMAZ — raporu doğrulamak için testi koşmak yetmez.
Bir delegasyonu "BİTTİ" kabul etmeden önce iddiayı **HEAD'e karşı** ölç:
`git show HEAD:<dosya> | grep <kaldırıldığı iddia edilen kalıp>` — çıktı varsa iş
teslim edilmemiştir, yalnız yazılmıştır.

Aynı turda ikinci bir örnek: başka bir ajanın benim dosyamda yaptığı iyi bir refactor
(+ testi) untracked duruyordu. Paylaşılan ağaçta bu iş **süpürülür** — `07ef319` bir
kartın commit'inin dört ajanın notlarını süpürdüğünü zaten itiraf ediyor. Lider olarak
doğrulanmış + yeşil + tamamlanmış bir işi commit'lemek, onu kaybetmekten iyidir.

**Nasıl uygula:** durum kontrolünde kapı çıktısı YETMEZ — `git status --porcelain`
çıktısındaki untracked kaynak/test dosyalarını da tara ve "commit'li bir dosya bunu
import ediyor mu" diye sor. Kesin kanıt probu: `git archive HEAD | tar -x -C <tmp>`
ile HEAD'i çıkar ve orada koş. İlgili: [[fabrika-check-artifact-timestamps-against-dispatch]],
[[fabrika-cross-verification-needs-a-falsifying-probe]]
