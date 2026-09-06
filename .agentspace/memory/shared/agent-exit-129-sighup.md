---
name: agent-exit-129-sighup
description: Ajan görevi "exit 129" ile düşerse bu SIGHUP'tır (dosya/encoding hatası değil) — kök neden genelde ön planda çalıştırılan pnpm dev
metadata:
  type: reference
  updatedAt: 2026-09-06
---

Bir alt-görev **exit 129** ile düştüğünde bunu "dosya yazılamadı / encoding bozuk" diye teşhis etme.
`129 = 128 + 1` → süreç **SIGHUP** ile öldürülmüştür. Kabukta kanıtlanabilir:

```bash
bash -c 'sh -c "kill -HUP \$\$"; echo "exit=$?"'   # -> exit=129
kill -l 1                                          # -> HUP
```

Genel olarak `128+N` = N numaralı sinyal: 130 = SIGINT (Ctrl-C), 137 = SIGKILL, 143 = SIGTERM.
Bunların hiçbiri kodun/dosyanın hatası değildir; **süreç dışarıdan sonlandırılmıştır.**

## Fabrika'da en olası tetikleyici

`pnpm dev` ön planda **hiç çıkmaz**, üstelik aynı dizinde ikinci dev sunucusuna izin verilmez
(bkz. [[fabrika-runtime-verification-recipe]]). Doğrulama adımında ön planda `pnpm dev` çalıştıran
bir ajan, pane kapanınca/zaman aşımına uğrayınca tüm süreç ağacıyla SIGHUP alır → 129.
Yani iş genelde **yazılmıştır**, düşen şey doğrulama adımıdır.

## Tekrar denerken yapılacak

1. Önce dosyanın **zaten var olup olmadığına** bak — "yazılmadı" teşhisi çoğu kez yanlış çıkıyor.
2. `pnpm dev` başlatma; **zaten ayakta olan 3000'i kullan** (`curl -s -o /dev/null -w "%{http_code}"
   http://localhost:3000/api/auth/csrf`), asla öldürme (paralel ajanların işini bozarsın).
3. Doğrulamayı curl + NextAuth çerezi ile yap; sunucu logu `.next/dev/logs/next-development.log`.
