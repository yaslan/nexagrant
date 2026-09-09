---
name: fabrika-git-stash-is-unsafe-in-shared-tree
description: Fabrika'da lint/test baseline'ı ölçmek için git stash KULLANMA — paralel ajanların commit edilmemiş işini de alır VE eşzamanlı düzenleme yüzünden YANLIŞ cevap verir; baseline'ı hata-dosya eşlemesiyle ölç
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

2026-09-07'de "bu lint hataları benden mi geliyor?" sorusunu yanıtlamak için
`git stash --include-untracked` + `pnpm lint` + `git stash pop` yaptım. Çalışma ağacı
**paylaşımlı**: o anda başka ajanların commit edilmemiş dosyaları da vardı. Bu sefer
kurtuldum (diğerleri tam o aralıkta commit'lemişti), ama stash penceresi boyunca onların
işi ağaçtan **kalkmıştı** — pop başarısız olsa ya da başka bir ajan aynı anda yazsa
kaybolabilirdi. Aynı ailenin diğer kazası: `git add -A docs/agent-results` ile başka
ajanların ekran görüntülerini yanlışlıkla stage'lemek.

**Why:** Fabrika'da birden fazla ajan aynı çalışma ağacında eşzamanlı çalışıyor
([[fabrika-parallel-agent-file-race]]). Ağacın tamamını hareket ettiren her komut
(`stash`, `checkout .`, `reset --hard`, `clean`, geniş `add -A`) benim işim olmayan
dosyaları da kapsar.

**How to apply:**

1. Baseline'ı **ağacı hareket ettirmeden** ölç: hataları dosyaya eşle, benim dokunduğum
   dosya listesiyle karşılaştır.
   ```bash
   pnpm lint 2>&1 | awk '/^\/Users/{f=$0} /error /{print f" :: "$0}' | sort -u
   npx eslint <yalnız benim dosyalarım>     # exit 0 mu?
   pnpm typecheck 2>&1 | grep -E "error TS"  # hangi dizinde?
   ```
2. `git add` her zaman **açık yol listesiyle**; sonra `git diff --cached --name-only` ile
   yalnız benimkiler mi diye bak. Fazlalık varsa `git reset -q` + yeniden stage'le.
3. Başkasının izlenmeyen dosyası kapıyı kırıyorsa (ör. `scripts/_dogfood-*.ts` içindeki
   `TS7006`), **silme**: geçici bir dizine taşı, kapıyı koş, **hemen geri koy** ve geri
   konduğunu sayarak doğrula.

İlgili: [[fabrika-parallel-agent-file-race]] · [[fabrika-worker-panes-die-uncommitted]]

## 2026-09-09 — tekrar ettim, ve bu sefer cevap YANLIŞ çıktı

TASK-MTT1WUUS7MN7R'de "bu 6 typecheck hatası benden mi?" diye yine
`git stash push <yollarım>` + `tsc` + `git stash pop` yaptım. Sonuç **0 hata** dedi —
yani "hatalar senin dosyalarından geliyor" gibi okunuyordu. **Yanlıştı.** Hatalar
başka bir ajanın o sırada yazmakta olduğu `tests/esr-calibration.test.ts`
(`ESR_SURVEY_DEADLINE` tanımsız) dosyasındandı; ajan iki koşu arasında dosyayı
değiştirdiği için sayı 6 → 1 → 0 diye oynadı.

**Yeni ve daha keskin sebep:** paylaşımlı ağaçta stash'li A/B ölçümü yalnızca
*riskli* değil, **geçersiz**dir. A ve B koşuları arasında ağaç benim dışımdaki
sebeplerle değişir, yani farkı bana atfetmek metodolojik olarak hatalıdır —
kontrol grubu yok. Kayıp riski olmasa bile sonuç çöp.

**Doğrusu (bu sefer işe yarayan):** ağacı hiç hareket ettirme, hatayı **dosya adına**
bak ve benim dokunduğum listeyle karşılaştır:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS"   # hangi dosya?
npx eslint <yalnız benim dosyalarım>                        # exit 0 mu?
```
`tests/esr-calibration.test.ts` benim dosyam değil → benim değil. Tek koşu, tek
okuma, stash yok.
