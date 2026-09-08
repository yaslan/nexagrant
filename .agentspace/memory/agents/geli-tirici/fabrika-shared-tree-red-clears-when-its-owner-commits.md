---
name: fabrika-shared-tree-red-clears-when-its-owner-commits
description: Paylaşılan ağaçta kırmızıyı `git status`'taki SAHİPLİK + import grafiğiyle atfet, sonra sahibi commit ettikten sonra tekrar koş — kırmızının kendiliğinden kapanması atfın kanıtıdır
metadata:
  type: feedback
updatedAt: 2026-09-08
---

Bir turda `pnpm test` üç kez farklı sonuç verdi: yeşil → `cordis-delta` 3 kırmızı
→ `gdpr-data-subject.live` 4 kırmızı → **yine tamamen yeşil**. Hiçbiri benim
değişikliğimden değildi.

**Why:** `git stash push -- <dosyam>` yöntemi paylaşılan ağaçta riskli
([[fabrika-git-stash-is-unsafe-in-shared-tree]]). Ona başvurmadan da kanıt
üretilebiliyor, üstelik daha ucuz.

**How to apply:**
1. `git status --short` → kırmızı testin dosyası ya da bağımlı olduğu kaynak
   **başkasının** ` M` / `??` listesindeyse ilk şüpheli odur.
2. Import zincirini `grep`le göster: `tests/cordis-delta.test.ts` →
   `cordis-delta.ts:298` → `ingestDocument` → `src/lib/rag.ts` ( M, benim değil).
3. **Kendi test yüzeyini birlikte koştur** (dokunduğun tüm dosyalar tek komutta)
   ve yeşil olduğunu rapora yapıştır — "benim değil"in pozitif tarafı budur.
4. Sahibi commit ettikten sonra süiti **tekrar koş**. Kırmızı kendiliğinden
   kapandıysa bunu rapora yaz: atfın doğru olduğunun en ucuz kanıtı.
5. Teşhis edemediğin mekanizma için iddia etme. Bir hipotezim ölçümle çürüdü
   (`ownerUserId` NOT NULL sandım, `is_nullable: YES` çıktı) — raporda "sebebi
   teşhis etmedim, dosya o kartın" yazdım.
