---
name: fabrika-evidence-guard-forces-a-numbered-rerun-file
description: docs/agent-results altındaki var olan bir kanıt dosyasına EK yapmak pre-commit kapısına takılır — ikinci koşu -2.md açar, ilki byte-identical kalır
metadata:
  type: project
  updatedAt: 2026-09-08
---

`docs/agent-results/<GÖREV-ID>-<ajan>.md` **bir kez yazılır**. Var olan bir kanıt
dosyasının içeriğini değiştiren commit, githook tarafından durdurulur:

```
✗ Commit durduruldu: docs/agent-results/ altında VAR OLAN bir kanıt dosyasının
  içeriği değişiyor … -<n>.md sonekiyle yeni bir dosya aç
```

Bu, "raporun sonuna bir yeniden-doğrulama bölümü ekleyeyim" refleksini de yakalar —
kendi raporun olsa bile.

**Why:** kanıt geriye dönük düzenlenebilirse hiçbir kanıt güvenilmez; 27 dosyanın
sessizce ezildiği olay yüzünden kapı kondu (TASK-MTSJKTGDUC3L5).

**How to apply:** bir kart sana İKİNCİ kez düştüğünde ekleme yapma —
`<GÖREV-ID>-<ajan>-2.md` aç, başına "ilk koşu şu dosyada / bu koşuda ne yapıldı"
yaz, ilk dosyayı `git restore` ile **byte-identical** bırak (`git diff --stat` boş
çıkmalı). `ALLOW_EVIDENCE_OVERWRITE=1` yalnız kimsenin okumadığı kendi yazım
hatan için; ikinci koşu için değil. İlgili: [[fabrika-baseline-snapshot-goes-stale]]
