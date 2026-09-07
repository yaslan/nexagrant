---
name: fabrika-identity-fallback-doctrine
description: Fabrika'da bir kimlik (ad/kuruluş/imza) eksikse ne yazılır — deponun yerleşik üç kademeli kuralı ve onu uygulayan mevcut yardımcılar
metadata:
  type: project
  updatedAt: 2026-09-08
---

Bu depoda "uydurma kimlik" tekrar eden bir kusur sınıfı ve **çözümü zaten standartlaşmış**.
Yeni bir yerde eksik kimlikle karşılaşınca sıfırdan tasarlama, şunu uygula:

**Kural (üç kademe, `src/lib/user-display.ts` içinde kodlanmış):**
gerçek ad → e-posta yerel kısmı → çevrilmiş "isimsiz" etiketi. **Asla** başka birinin adı,
asla akademik unvan, asla stok portre.

**Kayıt yoksa:** sessiz uydurma değil, **açık boş-durum** (i18n anahtarı, iki dile de).
Byline/imza gibi alanlar **opsiyonel tip** yapılır ve render koşullu olur — varsayılan bir
"editör" adı üretmek en kötü seçenek, çünkü yayına imza atmış olur.

**Mevcut altyapı (yeniden yazma, çağır):**
- `src/lib/user-display.ts` → `displayUserName(name, email, unnamedLabel)`
- `src/lib/workspaces.ts` → `listSessionWorkspaces(session)` (gerçek Workspace satırları,
  `withTenant` içinden, `Membership.workspaceIds` kapsamıyla; hata/kayıt yoksa boş liste)
- i18n: `UserIdentity.unnamedUser`, `UserIdentity.noRole`, `UserIdentity.noWorkspace`
- Regresyon kapıları: `tests/fabricated-fallbacks.test.ts` (rakamlar),
  `tests/fabricated-identity-strings.test.ts` (kimlik dizeleri),
  `tests/e2e/identity-honesty.spec.ts` + `tests/e2e/identity-strings.spec.ts`

**Gizli tuzak — profil haritası oturum adını EZER:** `src/lib/auth.ts`'in jwt callback'i
`token.name = demo.name` ile DB'deki `User.name` üzerine yazıyordu; yani ad'ı sadece
tanımlandığı yerden silmek yetmez, **her token yenilemesinde uygulanan override**'ı da ara.
Aynı desen `prisma.user.update({ data: { ..., name: computedName } })` gibi "yükseltme"
yollarında da çıkıyor: bayrağı yaz, adı yazma.
