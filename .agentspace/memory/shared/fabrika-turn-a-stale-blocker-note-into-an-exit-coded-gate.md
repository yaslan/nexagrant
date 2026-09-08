---
name: fabrika-turn-a-stale-blocker-note-into-an-exit-coded-gate
description: Rapor cümlesiyle yazılan bloke eskir ve kart yanlış sebeple açık kalır — blokeyi çıkış kodlu, salt-okunur bir kapıya çevir
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Bir görevin neden bloke olduğunu **yalnızca** sonuç raporuna yazmak yetmiyor: rapor eskiyor, kimse
okumuyor ve kart aylarca yanlış sebeple (`"yanıt bekliyoruz"`) açık kalıyor. E11.3'te teşhis
doğruydu ama bir sonraki geçişte aynı teşhisi baştan üretmek gerekti.

**Neden:** Bir bloke, ancak **yanlışlanabilirse** yönetilebilir. İnsanın okuyup inanması gereken bir
cümle yanlışlanamaz; `exit 1` dönen bir komut yanlışlanabilir.

**Nasıl uygula:** Blokeyi tek komutluk bir kapıya çevir:
- **salt-okunur** — hiçbir şey yazmasın/göndermesin; yazan modlarla (`--apply/--send/--rollback`)
  birleşmeyi REDDETSİN, yoksa "bunu koşmak hiçbir şeyi değiştirmez" garantisi yalan olur;
- **çıkış kodlu** — bloke varken 1, kapanabiliyorsa 0. Kartı `done` işaretlemenin tek ölçütü bu olsun;
- **her kırmızı satır insan aksiyonunu adıyla yazsın** (birim testi bunu çivileyebilir: her blokenin
  `fix` alanı boş olamaz);
- **belirsizlik ✅ değildir** — DB kapalıysa/makbuz bozuksa "cannot verify" (⚠️) de, geçti deme;
- **geri alınamaz dış adım iz bıraksın** (kime, ne zaman, hangi mesaj id'si). İzi rollback SİLMESİN:
  kiracı satırı geri alınır, gönderilmiş mail geri alınmaz. Adresi maskeli yaz (PII).

Kalıbın örneği: `scripts/esr-calibration.ts --preflight` → `pnpm beta:esr-preflight`
(`src/lib/beta/esr-readiness.ts` saf fonksiyon + ince CLI; `scripts/efatura-preflight.ts` ile aynı
şekil). Aynı şey "onay bekliyor", "dış servis cevabı bekliyor", "roster bekliyor" tipi her bloke için
geçerli.

**Ek tuzak:** Kapının ölçtüğü sayı bir **self-test girdisinden** geliyorsa yeşil yanıltıcıdır —
girdiyi dosya adından değil içeriğindeki işaretten tanı ve yine de blokede kal.

**İlgili:** [[fabrika-e11-3-survey-was-never-sent]], [[fabrika-board-cards-go-stale]],
[[fabrika-generated-report-can-tick-its-own-criterion-green]],
[[fabrika-prove-the-fix-against-the-real-database]]
