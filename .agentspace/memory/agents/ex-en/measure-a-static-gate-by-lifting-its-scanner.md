---
name: measure-a-static-gate-by-lifting-its-scanner
description: Bir statik kapıyı genişletmeden önce tarayıcısını scratchpad'e kaldırıp tsx ile koş — bulgu sayısını repoya dokunmadan ölçersin ve naif genişletmenin yanlış pozitiflerini önce görürsün
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

`schema-contract.test.ts` gibi metin-tabanlı bir kapıyı genişletirken "önce ölç"ün
ucuz yolu: **tarayıcı fonksiyonlarını scratchpad'e kopyala, testleri bırak.**

```bash
sed -n '1,<son yardımcı fonksiyonun satırı>p' <test.ts> \
  | sed "3d" \                                   # `import ... from 'vitest'` satırı
  | sed "s#^const REPO = .*#const REPO = '<mutlak repo yolu>';#" > $SP/base.ts
cat >> $SP/base.ts <<'JS'
const models = parseSchema();
const problems = scan(models);
console.log('TOTAL', problems.length);
JS
npx tsx $SP/base.ts
```

`REPO` çoğu kapıda `resolve(__dirname, '../../..')` ile kurulur; scratchpad'e taşıyınca
mutlak yola çevirmezsen sessizce boş tarama yapar ve "0 bulgu" diye okursun.

**Neden değerli:** aynı `base.ts`'ten birkaç varyant türetip *karşılaştırırsın* —
repoyu hiç değiştirmeden, başka ajanların ağacını riske atmadan.

Bu koşuda karar bunun üstünden çıktı: `data`'yı naifçe `FIELD_BEARING`'e eklemek
**1 bulgu** verdi ve o bulgu YANLIŞ POZİTİFTİ (`planVersion.update.data.features.create`
— `create` iç içe yazma operatörü, kolon değil). Gramer-farkında yürüyücü **0** verdi.
Naif sürümle gitseydim çalışan bir sorguyu "düzeltmiş" olacaktım.
**Genel kural: bir kapıyı genişletirken önce YANLIŞ POZİTİF sayısını ölç; sıfır
bulgu ile sıfır yanlış pozitif aynı şey değildir.**

Aynı dosyadan çıkan iki ölçüm daha, kapsam kararını verdirdi: kapatılabilir ama
kartın dışında kalan delikleri **rakamla raporla, dokunma** — bir sonraki kart
kararı hazır bulur ([[fabrika-schema-contract-guard-misses-relation-names]] madde 4-6).

Kapı YEŞİL kalınca "hiç tarama yapmadı" ihtimalini kapatmak için sayaç koy
(`writeBodiesWalked > 100`) — [[prove-a-gate-catches-the-bug-without-a-worktree]]
fikstür kanıtının tamamlayıcısı: fikstür yeni yolun ÇALIŞTIĞINI, sayaç ise gerçek
repoda YÜRÜDÜĞÜNÜ gösterir.

İlgili: [[fabrika-untracked-scratch-scripts-break-gates]] ·
[[fabrika-agents-share-one-working-tree]]
