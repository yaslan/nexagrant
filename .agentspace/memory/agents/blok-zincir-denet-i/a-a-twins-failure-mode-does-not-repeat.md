---
name: a-a-twins-failure-mode-does-not-repeat
description: "Şu dosya çifti, daha önce patlayan ikize benziyor" diye başlayan kart, o ikizin HATA BİÇİMİNİ de miras aldığını varsayar — benzerliği yol deseninden değil, her ekseni tek tek ölçerek doğrula
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

Bir denetim kartı "bu, daha önce pahalıya patlayan X ikizinin aynısı" premisiyle geldiğinde,
premis genelde **yer** hakkında doğru, **hata biçimi** hakkında yanlıştır.

TASK-MTU6KE36HAFJR: kart `src/lib/rag.ts` vs `src/lib/ai/rag.ts` çiftini, silinmiş
`src/lib/ai/llm.ts` ikizine (aynı çağrı 7 kat farklı fiyat) benzetiyordu. Ölçüm:
- **Yer premisi DOĞRU** — `src/lib/ai/` dizini gerçekten o temizliğin artığı
  (`git show --name-status <cleanup-commit>` → yalnız `llm.ts` silinmiş, `rag.ts`'e dokunulmamış).
- **Hata biçimi premisi YANLIŞ** — iki dosya da aynı `embedText` tıkacından geçiyordu; model,
  boyut, `module`/`purpose`, `credits` birebir aynıydı. Fiyat ayrışması YOKTU.
- **Gerçek ayrışma bambaşka bir eksendeydi**: DB bağlantısı (`withTenant` vs global istemci),
  hata yolunda uydurma veri, ve chunk boyutu.

**Nasıl uygulanır:** İkiz-şüphesi kartında ekseni kartın verdiği hikâyeden alma. Ölç:
(1) ortak tıkaçtan geçiyorlar mı — çağrı satırını göster, (2) DB istemcisi/oturum bağlamı aynı mı,
(3) hata yolunda ne dönüyor (fırlatıyor mu, uyduruyor mu), (4) sabitler (boyut/eşik/limit) aynı mı,
(5) her export'un gerçek çağıranı — `grep -rn "\b<sembol>("`, import satırı DEĞİL
([[fabrika-importer-count-is-not-caller-count]]).
Premisi çürüttüysen raporda **ADIYLA** çürüt: "birleştirilsin ama SENİN gerekçenle değil, şu gerekçeyle"
demek, kararı verecek kişiye "birleştirilsin"den daha çok bilgi verir.

İlgili: [[a-conformance-check-cannot-see-absence]] · [[fabrika-two-rag-files-src-lib-rag-vs-ai-rag]]
