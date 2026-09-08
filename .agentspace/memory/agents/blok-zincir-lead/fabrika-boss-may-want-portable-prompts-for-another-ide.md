---
name: fabrika-boss-may-want-portable-prompts-for-another-ide
description: Patron in_progress kartları başka bir IDE'de (Antigravity) kendisi bitirmek isteyebilir — o zaman istenen şey delegasyon değil, ofis bağlamı taşımayan kendi kendine yeten prompt paketidir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

2026-09-08. Ekip zaten koşarken patron şunu istedi: "in_progress'teki görevleri **Antigravity'de**
tamamlamak için gerekli promptlar serisi". Yani iş dağıtmamı değil, işi **taşınabilir** hale
getirmemi istedi.

Bu istekte doğru çıktı bir delegasyon DEĞİL, bir devir paketidir. Kritik fark: hedef ortamda
ofis bağlamının HİÇBİRİ yok — board, hafıza, ajan kimliği, `agentdesk_*` araçları, "bkz. şu
kartın raporu" alışkanlığı. Prompt kendi kendine yetmeli.

Paketin işe yarayan biçimi:
1. **Ortak önek bloğu** (bir kez): depo yolu + dal + paket yöneticisi, CLAUDE.md'nin ihlal
   edilemez kuralları, KANIT DİSİPLİNİ (çürütme sondası + kopyalanmış çıktı + testi
   gevşetme yasağı), güvenlik (üretim DB'sine bağlanma, sonda verisini temizle), rapor yolu.
   "Her prompt'un başına yapıştır" diye işaretle.
2. **Kart başına bir blok**: görev id + misyon + ÖLÇÜLMÜŞ kök neden (iddia değil, çıktı) +
   numaralı adımlar + tuzaklar + doğrulama + DoD.
3. **Bağımlılık zinciri görünür olsun** — hangisi hangisinden sonra, hangileri bağımsız.
   Aynı dosyaya dokunan iki kart asla paralel verilmez.
4. **Prompt YAZILMAYANLAR bölümü**: dış girdi/insan aksiyonu bekleyen kartlara prompt yazmak
   işi ilerletmez. Onun yerine "eksik olan tam olarak şu" listesi koy.

Sunum: kopyala düğmeli tek sayfa (Artifact) + dahili tarayıcıda aç. Patron blokları tek tek
alıp yapıştıracak; uzun terminal çıktısı bu iş için yanlış biçim.
