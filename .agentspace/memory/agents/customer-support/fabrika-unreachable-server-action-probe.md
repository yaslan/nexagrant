---
name: fabrika-unreachable-server-action-probe
description: Fabrika'da bir Next server action'ın gerçekten çağrılabilir olup olmadığını ölç — istemci import etmiş olması yetmez, .next manifest + gerçek POST ile yokla
metadata:
  type: reference
  updatedAt: 2026-09-07
---

Fabrika'da bir server action'a "bu kusur canlı mı" demeden ÖNCE eylemin gerçekten
çağrılabilir olduğunu ÖLÇ. İstemci bileşeninin onu `import` etmiş olması yetmez:
Next, hiçbir yerden ÇAĞRILMAYAN action'a kayıt açmaz, POST'u `404 Server action not
found` döner. TASK-MTR60M5ESB5PZ'de `submitDualApprovalAction`/`departmentApproveAction`
tam olarak böyleydi — `documents/client.tsx` ikisini import ediyordu, hiçbir düğme
çağırmıyordu, ekrandaki 4 aşamalı panel dekoratifti.

Ölçüm (dev sunucusu ayaktayken):

1. Sayfayı bir kez yükle ki derlensin (modül kapısı varsa ilgili `ModuleState` satırı
   `ON` olmalı, yoksa sayfa yerine kapı render olur ve action hiç derlenmez).
2. Action id'lerini SSR chunk'ından çıkar — `server-reference-manifest.json` eksik olabilir:
   `grep -o '{"[0-9a-f]\{42\}":{"name":"[a-zA-Z]*"}...' .next/dev/server/chunks/ssr/*.js`
3. Gerçek POST at: `curl -X POST <sayfa-url> -H "Next-Action: <id>" -H "Content-Type: text/plain;charset=UTF-8" -H "Origin: http://localhost:3000" --data '["arg"]'`

Okuma: `404 Server action not found` = kayıtsız/ölü kod · `500` gövdesinde
`TenantScopeError` = kayıtlı ve kimliksiz çağrıyı doğru reddediyor.

Bu ayrım raporun triyajını değiştirir: "canlı sahtecilik" ile "kurulu tuzak" aynı şey
değil. İkisini de düzelt, ama farkı SÖYLE. Bkz. [[fabrika-parallel-agent-file-race]].
