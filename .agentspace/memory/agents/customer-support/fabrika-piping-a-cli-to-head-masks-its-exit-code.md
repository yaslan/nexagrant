---
name: fabrika-piping-a-cli-to-head-masks-its-exit-code
description: "$? sonrası bir CLI'ın çıkış kodunu ölçerken çıktısını head/tail'e borulamak $?'yi borunun SON komutuna (head) maskeler — ayrı dosyaya yönlendir ya da PIPESTATUS kullan"
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

TASK-MTRJSOWFH6B45'te (2026-09-10, e-Fatura go-live doğrulaması) `pnpm efatura:preflight`
komutunun temiz env'de gerçekten kırmızı (exit 1) döndüğünü kanıtlamak istedim:

```bash
env -i PATH="$PATH" HOME="$HOME" npx tsx scripts/efatura-preflight.ts 2>&1 | head -80
echo "EXIT: $?"
```

Bu `EXIT: 0` bastı — yanlış, çünkü `$?` zsh/bash'te bir borunun (`|`) SON komutunun
çıkış kodudur, `head`'inki, `npx tsx`'inki değil. Komut aslında kırmızı olsa bile
ölçüm yeşil görünüyordu — tam da bu görevin kendisinin uyardığı "yalan yeşil kapı"
hatasının ölçüm tarafında bir versiyonu.

**Düzeltme:** ya çıktıyı bir dosyaya yönlendirip `$?`'yi borulamadan oku:
```bash
cmd > /tmp/out.txt 2>&1; echo "REAL EXIT: $?"
```
ya da `bash`'te `PIPESTATUS[0]` / zsh'te `pipestatus[1]` kullan.

**Genel kural:** bir CLI'ın çıkış kodunu KANIT olarak raporlayacaksan ve çıktısını
`head`/`tail`/`grep` gibi bir şeye boruluyorsan, `$?` o borunun son halkasınadır —
asıl komutunki değil. Kanıt toplarken bu ikisini asla aynı satırda karıştırma.

İlgili: [[fabrika-preflight-gate-must-mirror-what-the-code-blocks]] (aynı görevde,
kapının içeriğiyle ilgili kardeş bir "ölçtüğünü sandığın şey değil" hatası).
