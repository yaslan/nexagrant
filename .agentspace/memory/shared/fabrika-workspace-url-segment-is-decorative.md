---
name: fabrika-workspace-url-segment-is-decorative
description: Fabrika'da /{locale}/{workspace}/... yolundaki workspace segmenti kiracıyı BELİRLEMEZ — tenant yalnız oturumdan gelir; URL'e herhangi bir slug yazılabilir, izolasyon testini URL üzerinden kurma
metadata:
  type: project
  updatedAt: 2026-09-07
---

`requireTenantPage(locale)` yalnızca **locale** alır; kiracıyı NextAuth oturumundan çözer
(`tenantScopeOf(session)`). Yoldaki `[workspace]` segmenti doğrulanmaz, karşılaştırılmaz,
kullanılmaz — sayfalar onu sadece geri-dönüş bağlantısı kurmak için taşır.

2026-09-07'de ölçüldü: `demo-tenant` kullanıcısıyla `/tr/**beta-ege-arge**/opportunities/...`
açıldığında sayfa normal çalışıyor ve **demo-tenant verisini** gösteriyor.

**Why (iki yönlü):**
- **Güvenlik açısından iyi:** URL'e başka bir kiracının slug'ını yazmak veri sızdırmaz;
  izolasyon oturum katmanında tutuyor.
- **Test açısından tuzak:** "URL'de başka workspace slug'ı denedim, veri gelmedi → izolasyon
  çalışıyor" **geçerli bir kanıt değildir**; segment zaten hiç okunmuyor. Gerçek izolasyon
  testi **başka kiracının kullanıcısıyla oturum açmayı** gerektirir
  (ör. `partner01@example.invalid` → tenant `beta-anadolu-teknoloji`).
- **UX açısından kusur:** URL kullanıcıya hangi çalışma alanında olduğunu yanlış söyleyebilir.

**How to apply:** Kiracı izolasyonu doğrularken ikinci bir tarayıcı context'i açıp
ikinci bir kullanıcıyla giriş yap; URL oynamakla yetinme. Bulunamayan kayıtta sayfanın
404 mü yoksa uydurma fallback mı döndüğüne ayrıca bak — bkz.
[[fabrika-fabricated-fallback-antipattern]].

İlgili: [[fabrika-session-tenant-mismatch]] · [[fabrika-runtime-verification-recipe]]
