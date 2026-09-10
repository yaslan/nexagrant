---
name: fabrika-an-audit-goes-stale-while-you-write-the-card
description: Paralel ofiste denetim raporu saatler içinde bayatlıyor — karta "devralınan iddiaları ÖNCE kendi ölçümünle doğrula" adımını koy; S12'de 4 iddiadan 2'si yanlış çıktı
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

`TASK-MTVBN6YXERLHO` kartını aynı gün yazılmış iki denetim raporundan kurdum. Karta ilk adım
olarak *"devralınan HER sayıyı kendi grep'inle teyit ya da tashih et"* yazdım. PM raporu §0'ı
tam da buna ayırdı ve **dört iddiadan ikisini çürüttü**:

| Kartıma yazdığım iddia | Gerçek |
|---|---|
| `getEmbedding` `mockEmbedding`'e düşüyor | **Yanlış** — fallback `45580ed` (TASK-MTUH5L8MJ6S8E) ile ZATEN kaldırılmıştı |
| `src/lib/ai/rag.ts` kalıntı olabilir | **Yanlış** — `ls src/lib/ai` → dizin YOK |
| Prompt'lar 7 dosyada 14 gömülü | Kısmi tashih — 14 doğru, **8 dosya** |
| Sahte vektör `Chunk`'a bayraksız yazılıyor | Doğru ve hâlâ geçerli |

Kartın gerçek değeri de o hayatta kalan tek iddiadan çıktı: PM dev DB'sinde 10/10 chunk'ın
sentetik olduğunu ölçtü ve "vektör normu ayırt edicidir" sanısının yanlış olduğunu gösterdi.

**Neden önemli:** Denetim raporu bir FOTOĞRAFTIR, ağacın bugünkü hâli değil. 7 worker aynı
`dev` dalını düzenlerken rapor günlerde değil **saatlerde** bayatlıyor: kardeş bir kart
aradaki boşlukta kusuru zaten kapatmış olabiliyor. Bu, [[fabrika-give-workers-a-case-not-a-verdict]]
ile aynı sınıf ama farklı mekanizma — orada vakayı ben uydurmuştum, burada vaka doğruydu
ama TARİHİ geçmişti. [[fabrika-a-green-gate-may-predate-the-commit-it-closes]] kapı koşusu
için ne diyorsa, bu da kart premisi için onu diyor.

**Nasıl uygulanır:** Bir denetim/envanter raporundan kart yazarken premisi asla düz aktarma.
Her karta 1. adım olarak şunu koy: *"İLK İŞİN devralınan satır numaralarını/sayıları KENDİ
ölçümünle doğrulamak — devralınan kök neden bir hipotezdir."* Ucuz, worker'ı yavaşlatmıyor,
ve yanlış premisle koşan bir kartın maliyetinin yanında hiç kalıyor. Kartı yazmadan önce
raporun atıf verdiği commit'leri `git log --oneline` ile bugünkü HEAD'e karşı bir kez
tarayıp bakmak da aynı işi yarım dakikada yapar.

**Yan not (dağıtımdan önce):** `todo` sütunu "başlanmadı" DEMEK DEĞİL. Bu turda `todo`'daki
10 karttan 5'inin raporu diskte, commit'i `dev`'de hazırdı — worker kartın statüsünü
güncellememişti. Dağıtmadan önce `agentspace_delegation_status` + `ls -t docs/agent-results`
+ `git log` üçlüsüne bak, yoksa biten işi yeniden dağıtırsın
(bkz. [[fabrika-review-pile-is-the-real-backlog]], [[fabrika-board-cards-go-stale]]).
