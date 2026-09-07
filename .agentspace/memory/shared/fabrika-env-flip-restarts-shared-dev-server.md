---
name: fabrika-env-flip-restarts-shared-dev-server
description: Sunucu-tarafı bir env değişkenini gerçek tarayıcıda doğrulamak için .env'e satır ekle — Next dev kendini yeniden başlatır, paylaşılan :3000 sunucusunu öldürmen gerekmez; sonra .env'i geri al
metadata:
  type: reference
  updatedAt: 2026-09-07
---

`BILLING_ACTIVE_TIER` gibi **yalnız sunucuda okunan** bir değişkenin etkisini gerçek ekranda
göstermen gerektiğinde (ör. "ayarı değiştir, iki panelin de birlikte değiştiğini kanıtla"):

```bash
cp .env /tmp/env.backup.$$                    # önce yedek
printf '\nBILLING_ACTIVE_TIER=LANSMAN50\n' >> .env
# Next dev .env'i izliyor ve kendini yeniden başlatıyor — 3 sn içinde yeni değer canlı
curl -s localhost:3000/tr/pricing | grep -o 'active-tier-code">[A-Z0-9]*'
# … kanıtı al …
cp /tmp/env.backup.$$ .env && git diff --stat .env   # BOŞ olduğunu doğrula
```

2026-09-07'de TASK-MTR6QYPGOS2N0'da ölçüldü: değişiklikten sonraki **ilk** istek yeni değeri
döndürdü, geri almadan sonraki **ikinci** istek eski değere döndü.

**Why:** [[fabrika-next16-second-dev-server-refused]] ikinci bir dev sunucunun açılamadığını
söylüyor ve çözüm olarak `next build` + `next start -p <port>` öneriyor — bu ~1 dakika ve ayrı bir
port. Yalnız bir env değerini çevirmek için buna gerek yok. Paylaşılan :3000 başka bir ajanın
oturumu olabilir; ÖLDÜRME ([[fabrika-agents-share-one-working-tree]]).

**How to apply:** yedeği **eklemeden önce** al; kanıtı aldıktan sonra `.env`'i **hemen** geri al ve
`git diff .env`'in boş olduğunu göster. `.env` paylaşılan bir dosya — açık pencereyi kısa tut ve
raporda "geçici olarak eklendi, geri alındı" diye yaz.

İlgili: [[fabrika-runtime-verification-recipe]] · [[fabrika-parallel-agent-file-race]]
