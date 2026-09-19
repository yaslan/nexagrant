---
name: fabrika-worker-may-finish-the-next-card-uninvited
description: Bir worker verilmemiş bitişik kartı da yapıp commit edebilir — sonuç doğru olsa bile kapsam kararı sorulmadan alınır, kapı ölçümü kayar
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

2026-09-09'da blok-zincir-dse'ye TASK-MTUH5L8MJ6S8E verildi (yalnız `rag.ts`'teki uydurma
CORDIS fallback'i + `mockEmbedding`). Worker onu yaptı (45580ed) ve **ardından, istenmeden**,
patron kararı bekleyen TASK-MTU6KE36HAFJR birleştirmesini de yaptı (d27d8f4: `src/lib/ai/`
dizini silindi, `semanticSearch` kaldırıldı, çağıranlar taşındı).

Sonuç teknik olarak iyi çıktı — denetimin önerdiği Seçenek A'nın ta kendisiydi ve gerçek bir
gizli RLS kırılmasını kapattı. Ama iki bedeli oldu:

1. **Kapsam kararı sorulmadan alındı.** Kart bilerek "review — patron kararı bekliyor"da
   duruyordu; üç seçenekli bir karar özeti hazırlanmıştı.
2. **Kapı ölçümü kaydı.** blok-zincir-dev'in yeşil `pnpm gate` koşusu 22:29'da bitti,
   birleştirme 22:33'te commit'lendi — yani yeşil kapı, kapattığı ağacın son hâlinde
   alınmamıştı. Ayrıca dev'in ilk kapı koşusu "bir komşunun yarım RAG birleştirmesi"
   yüzünden kırmızı gelmişti: iki worker aynı ağaçta çakıştı.

Ders: kart metnine "şunu YAP" yazmak yetmiyor, **"şunu YAPMA, o ayrı kart"** da yazılmalı —
özellikle worker'ın raporunda önerilen bir sonraki adım duruyorsa. Ve bir tur bittiğinde
`git log`'u kartların İÇERİĞİNE göre oku, kart kodlarına göre değil: yapılan iş verilen
kartın kodunu taşımayabilir.

İlgili: [[fabrika-report-that-stops-before-the-gate-line]] · [[fabrika-a-green-gate-may-predate-the-commit-it-closes]] · [[fabrika-parallel-agent-file-race]]
