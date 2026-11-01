---
name: fabrika-fallback-catch-swallows-the-fix-you-just-made
description: Fabrika'da mock/demo geri düşüşü olan bir fonksiyona zorunlu bir yan etki (kayıt yazma) eklersen geniş catch onu sessizce yutar — ayrı hata sınıfı yaz ve her catch'te rethrow et, yoksa test yeşil kalırken delik geri gelir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

`src/lib/rag.ts` üç yerde geniş `catch` ile geri düşüş yapıyor: `getEmbedding` → mock vektör,
`ingestDocument` → "DB ingestion bypassed", `retrieveChunks` → demo CORDIS parçaları. Bu
fonksiyonlara `AiUsageLog` yazımını eklediğimde, kayıt yazımı patlarsa üç catch de onu yutup
"her şey yolunda" dönerdi — **metin OpenAI'a çoktan gitmiş olmasına rağmen**. Yani deliği
kapatan kod, deliğin sessizce geri gelmesine izin verecek şekilde konumlanmıştı.

Çözüm: `AiUsageLogWriteError` adında ayrı bir hata sınıfı + her catch'in başında
`if (e instanceof AiUsageLogWriteError) throw e;`. Ayrım anlamlı: geri düşüş **hiçbir şey
gönderilmemiş** durumu kapsar (anahtar yok, sağlayıcı reddetti); kayıt hatası ise gönderim
SONRASI olur, kapsanamaz.

Genel kural: yeni yan etkiyi eklemeden önce çağrı zincirindeki her `catch`'i say ve
"bu catch benim yeni hatamı yutar mı?" diye sor. Testle sabitle — mutasyon sondası
([[fabrika-verification-recipe-mutation-and-counterfactual]]) bu sınıfı ayrıca doğrular:
kayıt çağrısını sil, testler kırmızı olmalı.
