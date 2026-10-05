---
name: branded-type-fails-where-as-unknown-as-already-lives
description: Bir yapısal tipi markalamanın (nominal) getirisi, o tipin çağrı yerlerinde kaç `as unknown as` olduğuyla ters orantılıdır — markayı ölçmenin doğru yolu hata SAYISI değil hataların KİMDE olduğudur.
metadata:
  type: feedback
updatedAt: 2026-09-10
---

Fabrika'da `TenantScopedDb`'yi (`src/modules/m6/server/scoring.ts`) markalı yapma spike'ında ölçülen şey: naif markalama `pnpm typecheck`'te 6 hata verdi ve **6'sı da doğru davranan çağrı yerlerindeydi** (`withTenant` tx'i geçiren satırlar); tehlikeli olan tek satır (çıplak `prisma` geçiren) ve 10 test mock'u **hiç hata vermedi**, çünkü hepsi zaten `as unknown as` ile hem yapısal hem nominal denetimin dışındaydı.

**Neden:** `as unknown as X` markayı da atlar. Yani marka, "kaza"yı engeller ama "kararlı kaçış"ı engellemez. Çağrı yerlerinin çoğu zaten kaçış yapıyorsa marka, işi doğru yapanı kırıp yanlış yapanı serbest bırakır.

**Nasıl uygulanır:**
1. Markalamayı değerlendirirken hata sayısını değil **hataların kovasını** raporla: doğru-yerler / riskli-yerler / test-yolu. Sayı tek başına yanıltıcıdır.
2. Markayı **tipin tanımına** değil **basım noktasına** koy (Fabrika'da `src/lib/db.ts`'de `TenantTx`, `set_config('app.tenant_id')` satırının yanında). Ölçüm: 6 hata → 3 hata, ve kalan 3'ün 2'si gerçek bulguya dönüştü (yapısal tipin sessizce kabul ettiği çıplak-`prisma` geçişleri).
3. Marka + `as unknown as` yasağı (lint) birlikte gelmezse kapı yarım kalır; bunu "tipte garanti" diye sunma — [[fabrika-rls-green-on-a-bypassrls-connection]] ile aynı türden yanlış güvence olur.
4. Deneyi geri aldığını `git diff --stat -- <dosya>` boş çıktısıyla kanıtla; paylaşılan ağaçta `git checkout -- <dosya>` yalnız kendi dosyalarını adıyla hedeflesin.

İlgili: [[fabrika-verification-recipe-mutation-and-counterfactual]] — orada kusuru geri koyup ölçüyorsun; burada kapıyı geçici koyup ölçüyorsun. Aynı disiplin.
