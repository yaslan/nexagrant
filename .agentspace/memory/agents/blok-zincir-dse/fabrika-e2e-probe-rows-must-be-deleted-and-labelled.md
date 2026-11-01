---
name: fabrika-e2e-probe-rows-must-be-deleted-and-labelled
description: Fabrika'da canlı DB'ye karşı e2e kanıt üretirken sağlayıcıyı taklit ettiysen ürettiğin satırların rakamları ÖLÇÜM DEĞİLDİR — raporda bunu yaz ve satırları sonra sil, yoksa bir sonraki okuyan onları gerçek kullanım sanır
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

TASK-MTSWVADF7RQ1B'de `OPENAI_API_KEY` yoktu; uçtan uca kanıtı **gerçek Postgres + gerçek rota
handler'ı + gerçek PDF**, yalnız OpenAI HTTPS çağrısı taklit edilerek ürettim (`globalThis.fetch`
sarmalayıp `api.openai.com/v1/embeddings` URL'ini yakalamak yeterli; `tsx --tsconfig tsconfig.json`
ile `@/` alias'ı çalışıyor). Bu iyi bir kanıt — ama ürettiği `AiUsageLog` satırındaki
`inputTokens: 251` **taklitten** gelir.

İki zorunlu adım: (1) raporda "bu rakam taklit, ölçülmüş kullanım değil" cümlesini AÇIKÇA yaz;
(2) sondanın ürettiği satırları sonunda SİL (belge başlığına görev kodunu koy ki hedefli
silinebilsin) ve satır sayısının başlangıç değerine döndüğünü göster. Aksi hâlde satır tabloda
kalır ve bir sonraki koşuda ölçülmüş veri diye geri okunur —
[[fabrika-g0-evidence-placeholder-laundering]] ile tam olarak aynı tuzak, bu kez DB satırı biçiminde.

Ayrıca: rota handler'ını tsx'ten doğrudan çağırmak `auth()`'u kırar ("headers was called outside
a request scope"). Bu bir sonda arızası değil, GERÇEK bir kırılganlığı ortaya çıkardı — oturum
okuma bir yükleme isteğini 500'e düşürebiliyordu. Sondanın kırdığı şeyi "sonda sınırlaması" diye
geçiştirme, önce üretimde de kırılıp kırılmadığını sor.
