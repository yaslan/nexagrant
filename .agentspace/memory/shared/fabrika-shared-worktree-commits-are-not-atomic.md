---
name: fabrika-shared-worktree-commits-are-not-atomic
description: Aynı worktree'de aynı anda commit atan iki ajanın stage'i karışır — bir ajanın commit'i diğerinin dosyalarını yutar; commit mesajı yanıltıcı kalır
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08'de `dev` dalında dört ajan aynı worktree'de çalışıyordu. `aa4341f` adlı commit
mesajı yalnız bir hafıza dosyasından bahsediyor ama **ex-en'in FonBridge kartına ait 25
dosyanın tamamını içeriyor** (`src/lib/brand.ts`, kataloglar, testler, 16 bileşen).
Kimse bir şey kaybetmedi — ama commit geçmişi artık yalan söylüyor: dosyaların hangi işe
ait olduğu mesajdan okunamıyor.

**Neden:** paylaşılan worktree'de `git add <yol>` + `git commit` **atomik değildir.**
İki ajan aynı saniyelerde stage'lerse, biri diğerinin staged dosyalarını da commit eder.

**Nasıl uygula (lider olarak):**
- Paralel delege ederken **worker'ların dosya kapsamları ayrık olsun** (zaten yapıyorum) —
  ama bu commit karışmasını ENGELLEMİYOR, yalnız içerik çakışmasını engelliyor.
- **Ben (lider) worker'lar koşarken commit ATMAYAYIM.** Hafıza/doküman commit'lerimi
  ya delegasyon öncesine ya bitişine bırak. Bu turdaki karışıklığın sebebi tam olarak buydu.
- Bir commit'in kapsamı şüpheliyse `git show --stat <sha>` ile DOĞRULA; mesaja güvenme.
- **`reset`/`rebase` ile geçmişi düzeltmeye kalkma** — paylaşılan dalda başka ajanların
  işini yok eder. Gerekçeyi sonuç raporuna yaz, geçmişi olduğu gibi bırak.

Bkz. [[fabrika-verify-the-tree-not-just-the-report]]

## Ölçülen olay 2 (2026-09-10): karışan commit, KAPANMIŞ bir kartı temelsiz bıraktı

`14c04f3` commit'inin mesajı iyzico alıcı kimliği düzeltmesini (TASK-MTSY7HZRYWWEL) anlatıyordu;
`git show 14c04f3` ise yalnız alarm konsolu dosyalarını (`admin/alerts/*`, `messages/*.json`,
TASK-MTVFKK8UZS5BF) içeriyordu. iyzico düzeltmesi **hiçbir commit'te değildi** — 26 saattir
`src/lib/iyzico.ts` + `.test.ts` olarak çalışma ağacında `M` duruyordu.

Yani ilk olaydan bir adım kötüsü: bu sefer bir kart bunun üstüne **`done` işaretlenmişti**.
Herhangi bir `git checkout --` / `git clean` / dal değişimi işi de testini de birlikte
sessizce silecekti ve hiçbir test bunu yakalamayacaktı (test dosyası aynı commit'siz diff'in
içindeydi). Bulan şey kod denetimi değil, kartı kapatmadan önce yapılan bağımsız doğrulamaydı.

**Ekle (lider olarak):**
- Bir kartı `done` yapmadan önce `git log --oneline -- <kartın dosyaları>` ile işin GERÇEKTEN
  bir commit'te olduğunu gör. Commit mesajında kart kodunu aramak yeterli DEĞİL: mesaj doğru
  kartı söyleyip yanlış dosyaları taşıyabiliyor.
- `git status --short`'ta uzun süredir duran `M` dosyalar masum değildir — biri kapanmış bir
  kartın gövdesi olabilir. Dağıtımdan önce bak.
- Kurtarma commit'i worker'lar koşarken atılabilir, ama YALNIZ index boşken (`git diff --cached
  --name-only` boş) ve `--pathspec-from-file` ile; kaybolma riski beklemekten daha büyükse
  bekleme.
