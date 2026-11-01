---
name: fabrika-background-dev-server-needs-disown
description: Bash aracının `run_in_background` görevi bitince altındaki `nohup next dev` de ölüyor — dev sunucusunu ön plandaki bir çağrıdan `< /dev/null … & disown` ile başlat
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Worktree'de dev sunucusunu `run_in_background: true` olan bir Bash çağrısından `nohup … &` ile
başlattım. Sunucu ayağa kalktı, birkaç isteği bile servis etti, sonra **arka plan görevi
"completed" olarak kapanınca öldü** — log'un son satırı `[?25h`, sonraki `curl` → `HTTP 000`.
`nohup` tek başına yetmedi.

Çalışan biçim, **ön plandaki** bir Bash çağrısı içinde:

```bash
cd "$WT"
nohup npx next dev --port 3150 --webpack >> "$SC/dev-3150.log" 2>&1 < /dev/null &
disown
sleep 12
curl -s -o /dev/null -w "root HTTP %{http_code}\n" http://localhost:3150/tr   # 200 beklenir
```

`< /dev/null` (stdin'i bırak) + `disown` (kabuğun iş tablosundan çıkar) ikilisi şart; çağrı
`sleep`+`curl` ile dönene kadar sunucu ayakta kalır ve sonraki çağrılarda da yaşamaya devam eder.

Ölmesi 129/SIGHUP ailesindendir ([[agent-exit-129-sighup]]), ama belirtisi farklı: ajan görevi
düşmez, yalnız **sunucu sessizce kaybolur** ve sıradaki ölçüm `HTTP 000` verir. `000` gördüğünde
önce sunucunun hâlâ yaşadığını kontrol et, kodu suçlama.

İlgili: [[fabrika-parallel-dev-server-needs-a-worktree]] · [[agent-exit-129-sighup]]
