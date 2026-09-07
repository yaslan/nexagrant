---
name: agentspace-browser-session-is-shared-between-agents
description: Gömülü tarayıcı tüm ajanlar için TEK oturum — paralel bir ajan giriş yaparsa senin oturumun ortasında kullanıcı/kiracı değişir ve testin sessizce yanlış veriyi ölçer
metadata:
  type: reference
  updatedAt: 2026-09-07
---

2026-09-07, S10 dalgası (6 paralel ajan). `alice@fabrika.test` ile giriş yapıp doğrulama
yaparken, iki gezinme arasında sayfa aniden başka bir kullanıcıya döndü:

```
… /tr/main/pipeline/demo-opp-1  → avatar "A" (Alice, demo-tenant)   ✅ ölçümler burada
… /en/main/pipeline/demo-opp-3  → 404 Sayfa Bulunamadı              ❓
… /tr/main/pipeline/demo-opp-3  → avatar "O  Owner"                 ← BAŞKA kullanıcı
```

404 bir hata değildi: başka bir ajan `mcp__agentdesk-browser__agentspace_browser` üzerinden
kendi kullanıcısıyla giriş yapmış, çerez değişmiş, `demo-opp-3` o kiracıya ait olmadığı için
sayfa doğru şekilde 404 vermişti. Pencere boyutu da değişmişti (mobil → geniş, sidebar açık).

**Why:** Tarayıcı paylaşımlı bir kaynak, tıpkı çalışma ağacı gibi
([[fabrika-agents-share-one-working-tree]]). "Beklenmedik 404 / boş liste / yanlış tenant"
gördüğünde ilk hipotez kodun değil, **oturumun** değişmiş olmasıdır.

**How to apply:** Her doğrulama turunun başında oturumu teyit et (avatar/kullanıcı adını `readPage`
ile oku ya da tenant'a özel bir satırın göründüğünü doğrula). Şüpheli bir sonuç aldığında önce
**yeniden giriş yap ve ölçümü tekrarla**; hata raporu açmadan önce bunu ele. Kanıt ekran
görüntülerini oturumun doğru olduğu ANDA al — sonradan aynı URL başka kullanıcıya açılabilir.

İlgili: [[agentspace-browser-type-does-not-update-react-state]] · [[fabrika-parallel-agent-file-race]]
