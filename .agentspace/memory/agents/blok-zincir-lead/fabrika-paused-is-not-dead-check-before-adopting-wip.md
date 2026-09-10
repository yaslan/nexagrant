---
name: fabrika-paused-is-not-dead-check-before-adopting-wip
description: Commit'siz işi sahiplenmeden önce pane CANLI mı ÖLÜ mü ölç — limit duraklatması ölüme benziyor ama worker geri dönüp kendi commit'ini atacak
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

Kullanım limiti tükendiğinde ofis şöyle görünüyor: worker'lar boş prompt'ta sessiz, ağaçta
yığınla commit'siz değişiklik, panoda hiçbir kart ilerlememiş. Bu tablo **terk edilmiş işe**
birebir benziyor ve insanı "sahiplen, commit'le" refleksine itiyor. Bugün altı pane'den
dördü **CANLI ama duraklamıştı**, ikisi gerçekten ölmüştü — ve fark yalnız tek yerde görünüyordu:

```
n8n-en: in-flight · 1sa 14dk · pane AYAKTA      ← canlı, dokunma
sec-en: in-flight · 34dk · pane AYAKTA          ← canlı, dokunma
de-yuyt: failed · tespit=idle · 15dk sessiz     ← ölü, yeniden dağıt
```

Canlı dördünün ağaçta 13 değişmiş + 8 yeni dosyası vardı (`Consent` modeli, migration,
RLS girdisi, üç test dosyası, yeni `src/lib/legal/` dizini, bir RED e2e testi). Bunları
commit'leseydim worker limitten dönüp kendi commit adımını koştuğunda çakışacaktım — ve
yarım bıraktığı işi ben "bitmiş" diye kayda geçirmiş olacaktım.

**Ayırt edici ölçüm:** commit'siz dosyaların VARLIĞI değil, `agentspace_delegation_status`
çıktısındaki **"pane AYAKTA"** satırı. Dosyaya bakarak canlı/ölü ayrımı yapılamaz.

**İkinci ölçüm — iş tutarlı mı:** WIP yerindeyken `pnpm typecheck` koştum, **temiz** çıktı.
Bu, duraklamış işin yarım-kırık değil tutarlı olduğunu ucuza söylüyor; kırmızı çıksaydı
"worker cümlenin ortasında kesilmiş" demek olurdu ve beklemek daha da doğru olurdu.

**Nasıl uygulanır:** Limit/çökme sonrası ağacı toparlarken sırayla: (1) `delegation_status`'ta
her pane için AYAKTA mı öl mü ayır; (2) canlı pane'lerin dosyalarına DOKUNMA — ne commit,
ne düzeltme; (3) yalnız ölü pane'lerin kartlarını yeniden dağıt; (4) sahiplenmeye değer tek
sınıf, kartı ZATEN kapanmış ve pane'i çoktan gitmiş **sahipsiz kanıt dosyaları**dır (bugün 21
adet `docs/agent-results/*.md` — saf doküman, sıfır kod riski, kaybolursa kapalı kartların
kanıtı gider). Kod dosyalarını sahiplenmek ayrı bir karardır ve ancak pane ölüyse yapılır.

İlgili: [[fabrika-red-gate-may-be-a-live-worker-wip]] (aynı yanılgının kapı yüzü) ·
[[fabrika-delegation-verdict-wrong-both-directions]] · [[fabrika-remeasure-before-handing-work-to-another-driver]]
