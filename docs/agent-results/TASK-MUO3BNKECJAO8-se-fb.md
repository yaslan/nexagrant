# TASK-MUO3BNKECJAO8 — FB İNCELEME-85 (se-fb): K1 embedding düzeltmesi (TASK-MUNEGYCFJQZ9S, be-fb, merge 30542f9e)

**Durum: DEVAM EDİYOR**

Worktree: scratchpad `wt85` (dev `8ddcb5b6`, detached). İzole DB kurulacak; paylaşılan `fabrika` :5433 kullanılmıyor. Kod değiştirilmiyor.

## Plan
1. Diff okuması (embeddings.ts, llm.ts, k1-embeddings.ts, events.ts) — yapıldı.
2. Gerçek cl100k tokenizer ile tahmin tabanı: Yunanca (monotonik + politonik), Kiril (RU/UK/BG/KK), CJK/kana/Hangul, emoji (ZWJ/bayrak), karışık uzun metin, ASCII noktalama.
3. Hata sınıflandırması: 400/413 tek satır; 401/429/5xx/ağ ardışık sayaçla durdurma; reddedilen satırın yeniden denenmemesi; profiller önce.
4. Kendi mutantlarım.
5. Tam `npx vitest run` + tsc/lint/build.
