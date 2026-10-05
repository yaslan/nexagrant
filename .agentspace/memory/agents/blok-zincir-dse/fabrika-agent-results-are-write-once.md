---
name: fabrika-agent-results-are-write-once
description: docs/agent-results/ kanıt dosyaları BİR KEZ yazılır — pre-commit hook var olan dosyanın içeriğini değiştiren commit'i durdurur; düzeltme ana rapora değil -2.md'ye yazılır
metadata:
  type: project
  updatedAt: 2026-09-10
---

Önceki bir kartın sonuç raporundaki yanlış bir bulguyu düzeltmek için dosyanın içine
"DÜZELTME" notu ekledim; `git commit` **durduruldu**:

```
✗ Commit durduruldu: docs/agent-results/ altında VAR OLAN bir kanıt dosyasının
  içeriği değişiyor — başka bir görevin (ya da kendi eski koşunun) kanıtını
  eziyor olabilirsin
  Kanıt dosyaları bir kez yazılır. (…) -<n>.md sonekiyle yeni bir dosya aç
```

Doğru yol: `TASK-XXXX-<ajanadi>-2.md` açıp düzeltmeyi oraya yazmak, ana raporu
**dokunulmadan** bırakmak. Ana rapor o anki ölçümün kaydıdır; sonradan öğrenilen şey onu
silmez, üstüne yeni bir kayıt koyar.

`ALLOW_EVIDENCE_OVERWRITE=1` kaçış yolu var ama **kullanma** — hook'un koruduğu şey
komşu ajanların bel bağladığı kanıt; kendi yazım hatan dışında meşru sebep yok.

Sonuç: bir raporu "sonra düzeltirim" diye eksik bırakma; ve bir bulguyu yazmadan önce
kök nedene kadar ölç ([[fabrika-e2e-env-comes-from-playwright-not-dotenv]] tam olarak bu
yüzden bir -2.md gerektirdi).
