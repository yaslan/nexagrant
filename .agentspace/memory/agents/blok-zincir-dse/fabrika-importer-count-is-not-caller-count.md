---
name: fabrika-importer-count-is-not-caller-count
description: Fabrika'da eski bir denetim raporunun "çağıran sayısı" rakamı modülü import edenleri saymış olabilir — göç kartına başlamadan önce sembolü `await X(` ile ayrı say, yoksa kapsamı fazla tahmin edersin
metadata:
  type: project
updatedAt: 2026-09-08
---

TASK-MTSXGXBCJ007W'de kart "9 çağıran taşınacak" diyordu; gerçek 7 idi.
Kaynak hata TASK-MTSWVADF7RQ1B §5 A3'te: `grep -rn "from '@/lib/llm'"` ile
`src/lib/rag.ts` ve `src/lib/ai/rag.ts` "generateWithAI çağıranı" sayılmıştı,
oysa ikisi de aynı modülden **`embedText`** import ediyordu — farklı sembol,
göç kapsamına hiç girmeyen farklı bir yol (üstelik yeni kapanmış, dokunulması
yasak olan bir yol).

**Neden:** bir dosyada birden çok export olan tıkaç modüllerinde (`src/lib/llm.ts`
hem `generateWithAI` hem `embedText` barındırıyor) import sayısı ile çağrı sayısı
ayrışır; göç kartının kapsamını import sayısı belirlerse fazla iş + yasak dosyaya
dokunma riski doğar.

**Nasıl uygulanır:** göç/birleştirme kartında kapsamı `grep -rn "await <sembol>("`
ile say, `import` satırlarıyla değil; sayı kartın premisinden farklıysa raporda
ADIYLA düzelt. [[fabrika-evidence-file-may-answer-a-different-task]]
[[fabrika-deferred-to-another-card-is-not-fixed]]
