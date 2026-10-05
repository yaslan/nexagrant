---
name: fabrika-sonnet5-opus5-reject-temperature
description: Fabrika'da LLM varsayılan modelini Sonnet 5 / Opus 5'e çekmek tek başına üretimi kırar — `src/lib/llm.ts` her Anthropic çağrısında `temperature` gönderiyor ve bu aile sampling parametrelerini 400 ile reddediyor
metadata:
  type: project
updatedAt: 2026-09-08
---

`src/lib/llm.ts` Anthropic isteğinin gövdesine `temperature` (varsayılan 0.7)
koyuyor. Claude Sonnet 5 / Opus 5 / Fable 5 ailesinde `temperature`, `top_p` ve
`top_k` **kaldırıldı**: gönderilirse istek 400 döner. Aynı ailede `budget_tokens`
de 400 verir ve assistant prefill reddedilir.

**Neden önemli:** kodda duran iki varsayılan (`claude-3-5-sonnet-20240620`,
`claude-sonnet-4-20250514`) eskimiş; "sadece model string'ini güncelle" diye
görünen değişiklik, adaptör aynı kalırsa her YZ çağrısını kırar. Typecheck ve
lint bunu yakalamaz — hata çalışma anında sağlayıcıdan gelir.

**Nasıl uygulanır:** model güncellemesini adaptör temizliğiyle AYNI değişiklikte
yap; `temperature`/`top_p`/`top_k` gönderimini kaldır (bugün hiçbir çağıran bu
opsiyonu geçmiyor, kayıpsız). Yeni model kimlikleri tarih ekisiz yazılır:
`claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`.
