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

## Kapının KENDİ tavsiye metni de eskir — ve eskimiş tavsiye, tavsiyesizden KÖTÜDÜR (2026-09-08, E11.3 3. geçiş)

Kapıyı kurmak yetmiyor. Her kırmızı satırın `fix` metni bir **iddia**dır ve raf ömrü vardır.
E11.3'te `accuracy` blokesinin tavsiyesi "önce açık karar #8'i (rule A vs rule B) kapat" diyordu;
karar **iki gün önce** patron onayıyla kapanmıştı (`4bee05bb`, 2026-09-06). İki zarar birden:

1. operatörü yapılmış bir işe yolluyordu;
2. daha kötüsü, **rule B'nin %90'ını bir çıkış yolu gibi** gösteriyordu. B kapıda kullanılmayan
   kural setidir; o %90 kabul kriteri değildir. Yani kapı, kriteri **yanlış yoldan kapatmayı**
   öneriyordu — kapının var oluş sebebinin tam tersi.

Aynı eskime üretilmiş raporda da vardı: `docs/CORDIS-SAMPLE-CALIBRATION.md` paragrafı kararın
kapandığı **gün** yazılmış (`72b2133`) ve hiç tazelenmemişti.

**Kurallar:**
- `fix` metni bir karara / karta / dokümana atıfta bulunuyorsa, o atfı **her geçişte doğrula**:
  `git log -S"<karar cümlesi>" -- docs/ROADMAP.md` kararın kapanıp kapanmadığını saniyede söyler.
- Metni **testle çivile**, sadece yazma: "tavsiye şu ifadeyi İÇERMELİ" + "şu eski ifadeyi
  İÇERMEMELİ". Yeni testin eski kodda gerçekten kırmızı olduğunu göster.
- Kapanmış bir kararı silme, **kapandı olarak kaydet** ve hâlâ doğru olan artığı ayrı yaz —
  E11.3'te artık `/settings/gates` etiketiydi (`page.tsx:35`, `minG0Score` hâlâ "Minimum AI
  Alignment Score" diyor): bu bir **karar değil, etiket hatası** ve sahibi başka bir kart.
- Birden çok bloke varsa **zincir mi bağımsız mı** olduğunu söyle. E11.3'ün 4 kırmızısı 4 sahip
  gerektiren 4 sorun sanılıyordu; hepsi tek insan aksiyonunun (roster) arkasındaydı. Özet satırı
  artık zincirin başını adıyla yazıyor.

**İlgili:** [[fabrika-board-cards-go-stale]], [[fabrika-deferred-to-another-card-is-not-fixed]]
