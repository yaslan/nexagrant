---
name: fabrika-done-reports-can-be-wrong
description: Fabrika'da worker "bitti + DoD 5/5" raporu verdiği halde özellik hiç çalışmayabiliyor — M9.2 örneği (2026-09-07): brief hiç kaydedilmiyordu, i18n iddiası yalandı
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

2026-09-07'de M9.2 Meeting Brief kartı "DoD 5/5 ✅, tr+en anahtar boşluğu 0" raporuyla
kapandı. İki bağımsız kontrol bunu çürüttü:

- **Dogfood (gerçek tıklama):** brief HİÇ kaydedilmiyor. Ağ izinde
  `{"success":false,"error":"BRIEF_NOT_PERSISTED"}` dönüyor ve UI bunu sessizce yutuyor;
  kullanıcı hata görmüyor, liste (0) kalıyor. Ayrıca uydurma bir fırsat id'si
  (`opportunities/kedi-kopek-42/briefs`) gerçek görünen bir brief render ediyordu.
- **Bağımsız doğrulama (kod okuma):** `briefs/client.tsx` içinde `next-intl` importu SIFIR,
  78 hard-coded Türkçe string var, `messages/tr.json`'da `briefs` namespace'i yok.
  Yani "her dilde çevrildi" iddiası ölçülebilir biçimde yanlıştı.

**Why:** Rapordaki DoD kutucukları worker'ın kendi beyanıdır; kod ve çalışan uygulama
bağımsız kontrol edilmedikçe kart kapanmamalı. Bu, kartın bayat olmasından farklı bir
başarısızlık: rapor TAZE ama YANLIŞ.

**How to apply:** Bir kartı done'a almadan önce iki kontrolden en az biri koşsun —
(1) rolü kod yazmak olmayan bir ajanın bağımsız kanıt doğrulaması, (2) gerçek tıklamayla
dogfood. "typecheck temiz" ve "commit gerçek" bir özelliğin ÇALIŞTIĞININ kanıtı değildir.
Özellikle şu iki kalıbı ara: sessiz `catch {}` ile yutulan hata, ve sabit örnek verinin
gerçek veri gibi render edilmesi.

İlgili: [[fabrika-board-cards-go-stale]] · [[fabrika-parallel-agent-file-race]]
