---
name: fabrika-server-email-locale-pattern
description: Fabrika'da e-posta gövdesi next-intl t() kullanamaz (React ağacından geçmiyor) — depodaki emsal COPY = {tr:{...}, en:{...}} tablosu + locale parametresi; alerts-daily.ts bunu izlemiyor, hâlâ sabit İngilizce
metadata:
  type: project
  updatedAt: 2026-09-08
---

CLAUDE.md §8 "kullanıcıya görünen sabit metin yok, t('...')" kuralı sunucu tarafında render
edilen e-postalar için doğrudan uygulanamaz — bunlar React ağacından geçmediği için `next-intl`
`t()` orada çalışmaz. Depo bu durumu zaten bir kez çözmüş: `src/lib/beta/invite-email.ts` bir
`COPY = { tr: {...}, en: {...} }` tablosu tutuyor ve `params.locale: 'tr' | 'en'` alıyor — dosyanın
kendi yorumu bunu açıkça gerekçelendiriyor ("bu stringler asla next-intl'den geçmeyecek, o yüzden
messages/*.json'da değil burada").

`Tenant.locale` ve `User.locale` (`prisma/schema.prisma:25,66`, ikisi de `@default("tr")`) zaten
var — bir e-posta job'unun hangi dilde yazacağını bilmek için ekstra veri gerekmiyor.

**Bilinen ihlal:** `src/lib/inngest/jobs/alerts-daily.ts:149-157` (saved-search uyarı e-postası)
bu deseni izlemiyor — konu satırı ve HTML gövdesi tamamen sabit İngilizce, `locale` hiç okunmuyor.
TASK-MTRNQN0NNVBYM kapsamında (matchCount düzeltmesi) bulundu ama kapsam dışı olduğu için
düzeltilmedi, adıyla bildirildi.

**Nasıl uygulanır:** Bundan sonra bir e-posta/mail job'u yazarken ya da i18n denetimi yaparken
(`/i18n-check` veya elle) — sunucu tarafı e-posta metni görürsen önce `messages/*.json` değil
`invite-email.ts` desenini ara; yoksa bunu bir bulgu olarak say, `t()` eklemeye ÇALIŞMA (çalışmaz).

İlgili: [[fabrika-identity-fallback-doctrine]]
