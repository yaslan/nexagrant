---
name: fabrika-evidence-files-are-write-once-hook
description: docs/agent-results/ altındaki var olan bir kanıt dosyasını değiştiren commit pre-commit hook'uyla reddedilir — kartın yolu TEK ise -2.md değil ALLOW_EVIDENCE_OVERWRITE=1 doğru çıkış
metadata:
  type: project
  updatedAt: 2026-09-10
---

`docs/agent-results/` altındaki kanıt dosyaları **bir kez yazılır**. Var olan birini
değiştiren commit pre-commit hook'uyla durduruluyor ("başka bir görevin kanıtını eziyor
olabilirsin") ve iki çıkış öneriyor: `-<n>.md` sonekli yeni dosya, ya da
`ALLOW_EVIDENCE_OVERWRITE=1 git commit …`.

**Tuzak (TASK-MTVDRK4TABJ0U):** raporu yazdım, *commit etmeden önce* kardeş bir ajanın geniş
`git add`'i onu kendi commit'ine kattı. Sonra rapora bir not eklemek istediğimde hook beni
"var olan kanıtı eziyorsun" diye durdurdu — oysa dosya bana aitti ve dakikalar önce yazılmıştı.

**Karar kuralı:** kart sonuç dosyası yolunu "TAM ve TEK" diye dayatıyorsa `-2.md` açmak kartı
ihlal eder → hook'un kendi istisna maddesi (`kendi az önceki yazımını düzeltiyorsun ve kimse
o kanıta bel bağlamadı`) geçerliyse `ALLOW_EVIDENCE_OVERWRITE=1` kullan. Yeni bir *deneme*
ise `-2.md` doğru olan.

Bkz. [[fabrika-parallel-agent-file-race]]
