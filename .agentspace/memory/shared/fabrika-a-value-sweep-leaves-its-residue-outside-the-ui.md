---
name: fabrika-a-value-sweep-leaves-its-residue-outside-the-ui
description: Bir değeri (marka, alan adı, oran) depodan süpürürken son kalıntılar arayüzde değil — fallback varsayılanlarında, e-posta zarf başlıklarında, belge metadata'sında ve yorumlarda saklanıyor
metadata:
  type: project
  updatedAt: 2026-09-10
---

## Ölçüm
Ürün adı `Fabrika` → `FonBridge` süpürmesi: **116 isabet**. İlk tur arayüz odaklı gitti ve
kataloglar (32) ile sayfa `<title>`'ları temizlendi. Kalan **20**'nin dağılımı şuydu:

| Nerede | Örnek | Kullanıcı görür mü |
|---|---|---|
| **Fallback varsayılanı** | `subscription-sync.ts:672` → `first?.length ? first : 'Fabrika abonelik dönemi'` | **EVET — faturaya basılıyor** |
| **E-posta zarf başlığı** | `request-deletion.ts:199` → `from: 'Fabrika <noreply@fabrika.app>'` | **EVET — giden postada** |
| **Belge metadata** | `calendar.ts:60` → `PRODID:-//Fabrika SaaS//EN` | EVET — indirilen .ics |
| Yorum düzyazısı (17 yer) | `"Fabrika staff"`, `"Fabrika has no contract yet"` | hayır |

En tehlikeli ikisi **fallback dalı** ve **zarf başlığı**: ikisi de kullanıcıya ulaşıyor ama
ekranı gezerek ya da katalog taraya**rak** bulunamıyor — biri yalnız "veri yoksa" koşulunda
görünür, diğeri HTML'de hiç yok.

## Nasıl aranır (arayüz taramasından SONRA, ayrıca)
```
grep -rn ": *'<değer>'\|? *'<değer>'\|: *\"<değer>\"" src/     # fallback / varsayılan dalları
grep -rn "from:\|replyTo:\|sender" src/                        # e-posta zarfı
grep -rn "PRODID\|Author\|Creator\|Producer\|title:" src/      # belge/dosya metadata
```
Ve kanıtı **çıktıda** ara, kaynakta değil: fatura gerçekten üretilsin, e-posta akışı gerçekten
tetiklenip zarfın `From`'u okunsun, .ics gerçekten indirilsin.

## Muhafız
`tests/retired-brand-name.test.ts` bu süpürmeyi tarayan test. İki şeyi hatırla:
- Marka dönünce muhafız **gevşetilmez, TERS ÇEVRİLİR** (`RETIRED` sabiti değişir) — o zaman
  öncül değişince de işini yapmaya devam eder.
- `HISTORICAL_RECORD` izin listesi muhafızın kör noktasıdır: testi yeşile getirmek için oraya
  dosya eklemek, testin ölçtüğü yüzeyi küçültür. Her ekleme tek cümleyle savunulmalı.

İlgili: [[fabrika-fabrication-audit-must-cover-api-export-routes]] · [[fabrika-a-conformance-check-cannot-see-absence]]
