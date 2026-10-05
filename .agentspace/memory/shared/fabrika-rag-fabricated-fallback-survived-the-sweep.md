---
name: fabrika-rag-fabricated-fallback-survived-the-sweep
description: KAPANDI (45580ed) — src/lib/rag.ts'teki 3 sahte CORDIS projesi ve mockEmbedding kaldırıldı; kalıcı ders, demo-fallback süpürgesi "hangi SAYFALAR" diye yazıldığı için src/lib kütüphanelerini yıllarca görmedi (artık görüyor)
metadata:
  type: project
  updatedAt: 2026-09-09
---

**DURUM: KAPANDI** — 2026-09-09, TASK-MTUH5L8MJ6S8E, commit `45580ed`.
(Bu not daha önce "henüz düzeltilmedi" diyordu; artık geçerli değil.)

## Neydi

`src/lib/rag.ts` `retrieveChunks`, DB/sağlayıcı hatasını **ve boş sonucu** üç sabit kodlanmış sahte
CORDIS projesiyle yanıtlıyordu (`ZERO-EMISSION-EV / €4.500.000 / 0.94`, `HYDROGEN-CATALYST /
€3.200.000 / 0.88`, `RECYCLED-COMPOSITE / €5.800.000 / 0.81`). `formatRagPrompt` eline geçeni
`[Source 1 | Score: 94.0%]` diye etiketlediği için bunlar `buildRagPrompt` üzerinden **LLM prompt'una**
giriyordu: bir DB kesintisi, var olmayan projelere dayanan bir concept-note üretiyordu. Admin RAG test
aracı da aynı satırları "korpus çalışıyor" kanıtı diye gösteriyordu. CLAUDE.md kural 7 — sayfada değil,
**prompt'un içinde**.

İkinci uydurma aynı dosyadaydı: `getEmbedding`, `OPENAI_API_KEY` yoksa metnin ilk 1536 karakter
kodundan bir vektör üretiyor ve `ingestDocument` bunu **gerçek `Chunk` tablosuna** yazıyordu.

## Şimdi ne var

Hata fırlar, boş korpus `[]` döner (`formatRagPrompt` `[]` durumunda çıplak soruyu geçirir, yani
kanıtsız yazılan taslak kanıtsız yazılır), her gömme hatası yukarı çıkar. Üretim kodu hiçbir yerde
vektör veya kayıt uydurmuyor. Sahte vektör `tests/helpers/fake-embedding.ts`'e taşındı.

## KALICI DERS (asıl değerli kısım)

`tests/fabricated-fallbacks.test.ts` tam olarak bu deseni avlamak için yazılmıştı ve **yine de
kaçırdı** — çünkü "hangi **sayfalarda** demo veri var" sorusuna göre yazılmıştı: M1/M8/M10 sayfa
dosyalarını tek tek adlandırıyordu, `src/lib/` altına hiç bakmıyordu.

> Sayfa uydurursa bir kullanıcı bir ekranda yanlış sayı görür.
> **Kütüphane uydurursa her çağıran alır** — burada doğrudan bir LLM prompt'una kanıt diye girdi.
> Blast radius daha büyük, ama süpürge oraya bakmıyordu.

Süpürge artık `src/lib` ağacını yürüyor (+ "gerçekten dosya okuyor mu" kontrolü, boş tarayıp yeşil
geçmesin diye). **Hâlâ kapsanmayan** benzer üç yer: `marketplace/page.tsx:34`, `tto/page.tsx:31`,
`turkiyeye-acik-cagrilar/page.tsx:44` ("Fallback demo … if DB is unseeded/offline").

## Kaldırırken işe yarayan yöntem

Kaldırma riski "düşük" diye kod okumaktan tahmin edilmişti; **gerçek ölçüm farklı çıktı**: süit
anahtarsız koştuğu için üç test dosyası mock fallback'e bel bağlıyormuş
([[fabrika-vitest-runs-keyless-and-hides-console]]). Yeşil süit kanıt değildir — kusuru geri koyup
mutasyon testi yaptım: sahte kayıtları geri koymak 7 testi, `mockEmbedding`'i geri koymak 9 testi
kırıyor.

İlgili: [[fabrika-two-rag-files-src-lib-rag-vs-ai-rag]] ·
[[fabrika-vitest-runs-keyless-and-hides-console]] ·
[[fabrika-verification-recipe-mutation-and-counterfactual]]
