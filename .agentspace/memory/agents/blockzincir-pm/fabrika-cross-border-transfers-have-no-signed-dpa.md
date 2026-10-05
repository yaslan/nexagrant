---
name: fabrika-cross-border-transfers-have-no-signed-dpa
description: Fabrika 7 yurt dışı alıcıya (Anthropic, OpenAI, Google, Microsoft, Stripe, Resend, Cloudflare) kişisel veri gönderiyor ama hiçbiri için imzalı SCC/DPA eki repoda yok — GDPR md.30 envanterinin en büyük tekil boşluğu
metadata:
  type: project
  updatedAt: 2026-09-08
---

**Ölçüldü (2026-09-08, TASK-MTSWKDRJX456I):** `docs/legal/processing-register.md`
üretilirken repo taraması yapıldı. Kişisel veri şu 7 alıcıya gidiyor:

- **Anthropic** — LLM tamamlama istemi (`src/lib/llm.ts` satır 181, varsayılan sağlayıcı)
- **OpenAI** — embedding için belge metni, HER ZAMAN (`src/lib/llm.ts` satır 507-535,
  tamamlama Anthropic'e gitse bile embedding hep OpenAI'a gider — sağlayıcı parametresi yok)
- **Google LLC / Microsoft Corporation** — OAuth giriş (`src/lib/auth.ts` satır 2-4)
- **Stripe, Inc.** — ödeme (kart/e-posta Fabrika kodundan geçmiyor, Stripe'ın barındırılan
  sayfasına doğrudan giriliyor — yine de bir "alıcı")
- **Resend** — bildirim/uyarı e-postaları (`src/actions/user/request-deletion.ts`,
  `src/lib/inngest/jobs/alerts-daily.ts`)
- **Cloudflare (R2)** — dosya/ekran görüntüsü depolama (`src/lib/storage.ts`)

`docs/legal/dpa-en.md`/`dpa-tr.md` §7 yalnızca kategori bazında "alt işleyen kullanılıyor"
diyor, isim/sözleşme yok. `docs/SECURITY_COMPLIANCE.md` satır 102-103 "AB bölgesi
(Frankfurt) varsayılan" iddia ediyor ama bu **repoda doğrulanamaz** — kod düzeyinde
hiçbir bölge zorlaması yok (R2 `region: 'auto'`, DATABASE_URL bölgesiz), bu tamamen
altyapı/hesap ayarı.

**Neden önemli:** Bir sonraki hukuk/DPO görevinde "hangi sağlayıcıya SCC lazım" sorusu
gelirse cevap zaten burada — yeniden taramaya gerek yok, ama SCC'lerin GERÇEKTEN
imzalanıp imzalanmadığı (repo dışı, hukuki bir olgu) her seferinde ayrıca doğrulanmalı,
bu hafıza yalnızca "kimlere gidiyor" listesidir, "sözleşme var mı" değil.

Tam envanter ve her alıcının hangi işleme faaliyetine (§ numarası) bağlı olduğu:
`docs/legal/processing-register.md` §21.

İlgili: [[fabrika-no-sentry-systemalert-decision]] (Sentry bilinçli olarak bu listeye
hiç girmedi — veri-dışarı-çıkmasın kararıyla kaldırıldı, bu da alıcı listesini
kısaltan tek örnek).
