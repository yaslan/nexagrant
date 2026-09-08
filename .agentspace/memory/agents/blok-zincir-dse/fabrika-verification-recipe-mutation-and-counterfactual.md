---
name: fabrika-verification-recipe-mutation-and-counterfactual
description: Fabrika'da bir kapanmış kartı bağımsız doğrularken yeşil test kanıt DEĞİLDİR — kusuru kendin geri koy (mutasyon) ve bağımlılık için paketi node_modules'tan çıkar (karşı-olgusal build); ikisi de ucuz ve ikisi de kartı gerçekten sınar
metadata:
  type: feedback
  updatedAt: 2026-09-08
---

Bir kartın "kapatılabilir" hükmünü **yeşil bir teste dayandırma**. Test yeşil olabilir çünkü
(a) hiçbir şeyi ölçmüyordur, (b) ölçtüğü şey zaten kırılamaz. 2026-09-08'de beş kartı
doğrularken en yüksek bilgi getiren iki hamle şunlardı — ikisi de dakikalar sürüyor:

**1. MUTASYON — kusuru sen geri koy, testin kırmızı verdiğini gör.** Ayrı worktree'de
kaynak dosyayı yedekle (`cp x.ts _d7/x.ts.orig`), tek satırlık kusuru uygula, spec'i koştur,
`cp` ile geri al, `git status` ile temizliği doğrula. Ölçülen dört mutasyon ve düşürdükleri test:

| mutasyon | dosya | düşen test |
|---|---|---|
| `displayName` sabit uydurma ada çevrildi | `m10/server/actions.ts` `requireApprovalActor` | audit-identity #1 |
| `requireTenantAction()` yerine sabit tenantId | `m10/server/actions.ts` `signDocument` | audit-identity #3 |
| `tx.dualApprovalStep.create` silindi | `m10/server/actions.ts` `departmentApproveAction` | dual-approval-persistence #1 **ve** #2 |
| `SAME_ACTOR_BOTH_DEPARTMENTS` satırı silindi | `lib/dual-approval.ts` | **hiçbiri — testler yeşil kaldı** |

Dördüncüsü başarısızlık değil, **en değerli sonuç**: uygulama seviyesindeki kural yokken bile
UNIQUE index (`followupDocId, actorUserId`) yazmayı reddediyor ve `uniqueViolationRefusal(e)`
bunu ekrandaki metne çeviriyor. "Kural indeksdedir, kodda değildir" iddiası ancak böyle ölçülür.
Yani bir mutasyonun testi kırmaması her zaman kötü haber değildir — önce "başka bir katman mı
yakaladı" diye bak.

**2. KARŞI-OLGUSAL — beyan edilmemiş bağımlılık iddiasını `mv` ile sına.** Temiz
`pnpm install --frozen-lockfile` sonrası build'in geçmesi "paket beyan edilmiş"i gösterir ama
"gerçekten gerekli"yi göstermez. `mv node_modules/<paket> /tmp/gizli && pnpm build` → build
patlamalı; geri koy → geçmeli. Ölçüldü: `resend` çıkarılınca `BUILD_EXIT=1` ve 3 ayrı
`Module not found: Can't resolve 'resend'` (`src/actions/user/request-deletion.ts`,
`src/lib/inngest/jobs/alerts-daily.ts`). Bu, `pnpm install` yeniden koşmaktan çok daha hızlı.

**Yan kural — kendi fikstürünü paylaşılan kiracıya yazma.** Doğrulama fikstürlerini
`demo-tenant`'a değil, fırsatı olmayan kiracılara (`org-1xnfma`, `org-y8w2f9`) yaz, `finally`
bloğunda sil ve silmeyi SAYIMLA doğrula. Yoksa bir sonraki ajanın "demo-tenant'ta kalıntı var"
kartını sen üretirsin.

İlgili: [[fabrika-phantom-dep-hides-in-shared-node-modules]] ·
[[fabrika-stale-board-status-check-git-first]] ·
[[fabrika-g0-evidence-placeholder-laundering]]
