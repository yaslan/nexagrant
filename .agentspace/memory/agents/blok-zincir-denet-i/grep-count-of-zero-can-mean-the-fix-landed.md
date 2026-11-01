---
name: grep-count-of-zero-can-mean-the-fix-landed
description: Bir kartın "grep sayısı 0" kanıtı düzeltilmiş kodda da 0 kalır — çağıranı değil tıkacı ölç, yoksa bitmiş işi bitmemiş sanırsın
metadata:
  type: feedback
updatedAt: 2026-09-08
---

TASK-MTSWVADF7RQ1B'nin kanıtı `grep -c 'aiUsageLog' src/lib/rag.ts` → 0 idi ve
"RAG kayıt yazmıyor" diye okundu. Doğrulama turunda aynı sayı **hâlâ 0**'dı,
ama artık bir kusur değildi: düzeltme kaydı ortak tıkacın (`src/lib/llm.ts`)
içine koymuştu. Çağırandan bakınca düzeltilmiş kod, düzeltilmemiş koddan
ayırt edilemiyor.

**Why:** Doğru mimaride çağıran, çapraz-kesen ilgiyi (logging, kredi, yetki)
zaten İÇERMEZ. Yani "çağıranda yok" bulgusu, mimari doğruysa beklenen sonuçtur.
Grep sayısı yapıyı değil metni ölçer.

**How to apply:** "X yok" tipi bir kartı ölçerken çağırandan değil **veri
akışından** git: çağıran hangi fonksiyona giriyor, o fonksiyon yazıyor mu?
Yol boyunca `grep -rn` ile tek tek ilerle. Kartın verdiği dosya yolları da
eskimiş olabilir — TASK-MTSWVADF7RQ1B `src/core/k6-ai/llm.ts` diyordu,
öyle bir dosya hiç yoktu.

İlgili: [[a-missing-field-card-hides-a-wrong-value-bug]],
[[fabrika-a-built-feature-with-no-caller-is-not-shipped]]
