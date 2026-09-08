# TASK-MTSWKDRJX456I — GDPR md.30 işleme envanteri

## 1. Ne yapıldı

`docs/legal/processing-register.md` üretildi: KVKK md.16 / GDPR md.30 kapsamında **18 kişisel veri işleme faaliyeti**, her biri kartın istediği 10 zorunlu alanla (faaliyet adı, sorumlu/işleyen rolü, veri kategorileri, ilgili kişi kategorileri, amaç, hukuki sebep, alıcı ve yurt dışı aktarım, saklama süresi, teknik-idari tedbir, kaynak dosya yolu).

Yöntem: hayal edilmedi — `prisma/schema.prisma`'daki 74 modelin tamamı tarandı, kişisel veri taşıyanlar gerçek kod yoluna (`src/lib/...`, `src/actions/...`, `src/lib/inngest/jobs/...`) bağlandı. Bir güvence kodda doğrulanamıyorsa "**YOK — açık**" olarak işaretlendi, uydurulmadı.

Belgede ayrıca:
- **§19** — DPA'nın (`docs/legal/dpa-en.md` / `docs/SECURITY_COMPLIANCE.md` satır 102) alt işleyen olarak saydığı **PostHog ve Sentry'nin kodda hiç bağlı olmadığı** tespit edildi (`src/lib/analytics.ts` tamamen stub; `@sentry/*` paketi/`Sentry.init` repoda yok) — bunlar envanterden çıkarıldı, gerekçesiyle.
- **§20 ters kontrol** — şemadaki her model tek tek "kişisel veri mi / değil mi" diye işaretlendi; `ApiKey`, `SeatCandidate`, CORDIS/K1/K2 tabloları gerekçeyle hariç tutuldu.
- **§21 yurt dışı aktarım özeti** — Anthropic, OpenAI, Google, Microsoft, Stripe, Resend, Cloudflare için hiçbir imzalı SCC/ek sözleşmenin repoda bulunmadığı adıyla yazıldı.
- **§22** — 8 maddelik açık boşluk listesi (VKN/TCKN saklama süresi tanımsız, `Document`/`Chunk` silme akışı yok, `AuditEvent.actorId` kimliksizleştirilmiyor, `CalendarConnection` token'ları plaintext, vb.).

## 2. Kanıt

**Kod/doküman incelemesi (gerçek grep/read çıktıları — bu conversation içinde):**
- `prisma/schema.prisma`: 74 model listelendi (`grep -n "^model "`), kişisel veri taşıyanlar tek tek okundu (User, Account, Session, Invoice, TenantBillingIdentity, Relationship, Interaction, CalendarConnection, Evaluation/Reviewer/Criterion/Score, ApprovalRequest/DualApprovalStep, AuditEvent, Feedback, AiUsageLog, Document/Chunk).
- `src/lib/llm.ts`: Anthropic varsayılan sağlayıcı (satır 30, 181), OpenAI yalnız embedding'de zorunlu (satır 507-535) — kanıt: `grep -n "anthropic\|OpenAI" src/lib/llm.ts` çıktısı.
- `docs/EFATURA_SETUP.md` satır 3-4: "e-Fatura entegrasyonu CANLI DEĞİL... bugüne kadar hiçbir belge GİB'e gönderilmedi" — VKN/TCKN'nin bugün üçüncü tarafa gitmediğinin kanıtı.
- `src/lib/analytics.ts` tam dosya okundu: PostHog stub, ağ çağrısı yok.
- `grep -rln "Sentry\|@sentry"` → boş sonuç, `find sentry.*.config.ts` → "no matches found".
- `src/lib/auth.ts` satır 2-4: Google, MicrosoftEntraID, Credentials sağlayıcıları doğrulandı.
- `src/app/api/billing/checkout/route.ts` tam okundu: Stripe'a kod yolundan e-posta/kart gitmediği, yalnız `tenantId`/metadata gittiği doğrulandı.

**Gate (kart dışı — mevcut branch durumu):**
```
$ pnpm typecheck
src/lib/blog.ts(80,9): error TS2304: Cannot find name 'PRODUCT_NAME'.
src/lib/blog.ts(81,3): error TS2304: Cannot find name 'PRODUCT_NAME'.
src/lib/blog.ts(103,6): error TS2304: Cannot find name 'PRODUCT_NAME'.
src/lib/blog.ts(104,3): error TS2304: Cannot find name 'PRODUCT_NAME'.
src/lib/blog.ts(122,73): error TS2304: Cannot find name 'PRODUCT_NAME'.
src/lib/fx/tcmb.ts(131,14): error TS2339: Property 'TCMB_BASE_URL' does not exist on type '{...}'.
[ELIFECYCLE] Command failed with exit code 2.

$ pnpm lint
✖ 3 problems (0 errors, 3 warnings)   ← 3 uyarı da bu karta ait değil (.tmp-be-en/ probe dosyaları, docs/agent-results/ altındaki .mts probe'ları)

$ pnpm test
Test Files  122 passed | 2 skipped (124)
     Tests  1453 passed | 8 skipped (1461)
```

`pnpm typecheck` hatası bu görevin PARÇASI DEĞİL: bu görev yalnızca `docs/legal/processing-register.md` dosyası oluşturdu (`git status --short docs/legal/` → yalnız `?? docs/legal/processing-register.md`), `src/lib/blog.ts` ve `src/lib/fx/tcmb.ts`'e hiç dokunulmadı. `git log --oneline -- src/lib/blog.ts src/lib/fx/tcmb.ts` bu dosyaların en son commit'lerinin (`3bbff6d9`, `77579d02`) bu görevden bağımsız olduğunu gösteriyor — muhtemelen dev branch'inde paralel çalışan başka bir kart bu hataları bıraktı. ADIYLA BİLDİRİYORUM, DÜZELTMEDİM (kapsam dışı kusur — CLAUDE.md/sprint kuralı).

## 3. Değişen dosyalar

- `docs/legal/processing-register.md` (yeni) — envanterin kendisi.
- `docs/agent-results/TASK-MTSWKDRJX456I-blockzincir-pm.md` (yeni) — bu rapor.

`src/` ve `prisma/` altında hiçbir dosyaya dokunulmadı (kart kuralı).

## 4. Riskler

- **Yurt dışı aktarım için imzalı sözleşme yok** (§21): Anthropic, OpenAI, Google, Microsoft, Stripe, Resend, Cloudflare — hiçbiri için repoda bir SCC eki/imzalı DPA bulunamadı. Bu, denetimde en büyük tekil hukuki risk.
- **VKN/TCKN saklama süresi tanımsız** (§5) — Türk vergi mevzuatına göre mali müşavir onayı gerekir, kod/doküman bunu belirtmiyor.
- **`AuditEvent.actorId` kimliksizleştirilmiyor** — `docs/legal/dpa-en.md` §6'nın "denetim kayıtları kimliksizleştirilmiş tutulur" iddiasıyla çelişiyor; bu bir doküman/kod tutarsızlığı.
- **PostHog/Sentry doküman-kod tutarsızlığı**: DPA ve SECURITY_COMPLIANCE.md bunları alt işleyen olarak sayıyor ama kodda yok. Sentry için bu bir eksiklik değil — hafızada bulunan patron kararı (2026-09-07, `fabrika-no-sentry-systemalert-decision`) Sentry'yi tam da KVKK/GDPR veri-dışarı-çıkmasın gerekçesiyle kaldırmış. Yani `docs/SECURITY_COMPLIANCE.md` satır 102 ve `dpa-en.md`/`dpa-tr.md` §7 bu kararla ÇELİŞİYOR ve güncellenmemiş — bu üç belgenin senkronize edilmesi ayrı bir doküman kartı olmalı.
- **İki ayrı RAG dosyası** (`src/lib/rag.ts` ve `src/lib/ai/rag.ts`) aynı işlevi görüyor gibi duruyor — CLAUDE.md kural 5'in anlattığı eski `src/lib/ai/llm.ts` ikizi hikâyesine benziyor. Bu kartın kapsamı dışında (kod değişikliği yasak), adıyla bildiriyorum.

## 5. Açık sorular

- `Effort`, `Opportunity`, `Proposal`, `Evidence`, `Claim` gibi tabloların serbest metin alanları (`notes`, `content`, `description`) kişisel veri içerip içermediği statik şema taramasıyla belirlenemez — içerik denetimi gerekir (§20 tablosunda işaretlendi).
- `docs/SECURITY_COMPLIANCE.md` satır 101'deki "muhataba açık silme talebi formu" iddiasının karşılığı kod tabanında bulunamadı — ya form var ama bulunamadı ya da doküman güncel değil.
- e-Fatura/GİB entegrasyonu canlıya alındığında VKN/TCKN'nin alıcısı değişecek (§5) — o gün bu envanterin güncellenmesi gerekir.

## 6. Sonraki adım

1. Hukuk/DPO, §21'deki 7 alıcı için SCC/DPA eklerini imzalamalı veya alternatif güvence (BCR, yeterlilik kararı) belgelemeli.
2. `AuditEvent` ve `Document`/`Chunk` için bir anonimleştirme/silme politikası kararlaştırılmalı (bugün yok).
3. `docs/SECURITY_COMPLIANCE.md` satır 102'deki alt işleyen listesi kod durumuyla (PostHog/Sentry yok) uyumlu hale getirilmeli.
4. Bu envanter, gelecekte yeni bir tablo/entegrasyon eklendiğinde (CLAUDE.md kuralı: "her yeni tablo... `docs/DATA_MODEL.md` güncellemesi aynı PR'da") — eğer tablo kişisel veri taşıyorsa aynı PR'da `docs/legal/processing-register.md`'ye de madde eklenmesi bir kural olarak CLAUDE.md'ye önerilebilir (PM kararı, bu kartın kapsamı dışı).

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
