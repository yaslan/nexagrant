---
name: fabrika-a-permanently-red-assertion-carries-no-information
description: Doğru çıktıda da kızan bir iddia mutasyon ölçümünde sahte "yakaladı" verir — eski assertion setinin ayırt etme gücünü ölçerken o iddiayı dışla, yoksa gevşetme ile güçlendirmeyi ayıramazsın
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

Bir assertion'ı değiştirirken "gevşettim mi?" sorusunun ölçümü şudur: ürünü kasten boz,
ESKİ set ile YENİ seti aynı bozuk çıktı üzerinde karşılaştır. Tuzak: eski sette
**zaten kalıcı kırmızı** bir iddia varsa, bozuk çıktıda da kızar ve set "yakaladı"
görünür — oysa o iddia DOĞRU çıktıda da kızıyordu, yani hiçbir şeyi ayırt etmiyor.

TASK-MTVT0VLF4AP19: `not.toContain('FonBridge')` marka geri gelince her belgede
kızıyordu. Mutasyon D (kuruluş alanı = `"<kiracı> / Horizon Europe Consortium"`) için
eski set ham hâliyle "caught" dedi — ama ateşlenen tek iddia o kalıcı kırmızıydı.
Ayırt etme gücünü ölçmek için o iddianın anlamlı olduğu tek dünyada ölçtüm: mutasyonun
ürettiği gerçek DOCX'te `FonBridge`→`Fabrika` ikamesi (yani `9af3f63` öncesi marka):

```
PASS  toContain(tenantName)          PASS  not.toContain('FonBridge')
PASS  toContain(opportunityTitle)    PASS  not.toContain(otherSectionText)
...
OLD SET (pre-rename) VERDICT: ALL PASS — the defect slips through
```

Yeni set aynı belgede kızardı (`Expected: "Kuruluş: Kiracı A"` / `Received: "Kuruluş:
Kiracı A / Horizon Europe Consortium"`). Gevşetme değil, güçlendirme — **ölçülmüş** hâli.

**Why:** Her koşulda aynı sonucu veren bir ölçüm bilgi taşımaz. Kalıcı kırmızı bir
assertion, mutasyon testinin sinyalini boğar ve "eski test de yakalıyordu, değişikliğin
gereksiz" gibi yanlış bir sonuca götürür.

**How to apply:** Mutasyon karşılaştırmasından ÖNCE eski seti **doğru** çıktı üzerinde
koştur. Doğru çıktıda kızan iddiaları işaretle ve karşılaştırmadan dışla; raporda bunu
dürüstlük payı olarak açıkça yaz. Ateşlenen iddiayı adıyla bildirme kuralının
([[fabrika-mutation-red-may-fire-on-another-assertion]]) tamamlayıcısıdır: o "hangisi
ateşlendi" der, bu "ateşlenen zaten hep ateşleniyor muydu" der.
