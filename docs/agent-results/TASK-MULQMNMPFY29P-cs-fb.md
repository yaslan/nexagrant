# TASK-MULQMNMPFY29P — FB ROADMAP.md güncellemesi (cs-fb)

Sprint FB-GAP-1 · kart leed-fb'den devredildi · dal `dev` · platform: doküman (macOS'ta hazırlandı)

## 1. Ne yapıldı

`docs/ROADMAP.md` 29.09 koduna ve board'a göre güncellendi. 07–10.09 notları silinmedi, geçmiş
kayıt olarak kaldı. Değişen her maddenin altına **"güncel 29.09"** satırı eklendi (26 satır).

- **Kutular:** E5 G0 puanlama `[ ]→[x]`, E10 `/dashboard` `[ ]→[x]`. E0 "redis/mailpit + migrate check" eksikleri kapandı diye not düşüldü (kutu zaten `[x]`).
- **Kapananlar kanıtla işlendi:** lint 0 / typecheck 0 (29.09'da ölçüldü), G0 kanonik skor üretimde, dashboard sabit rakamları silindi, thresholdRate kartı, Stripe idempotency (StripeEventLog), M9 P0'ları (success kontrolü, uydurma Fraunhofer verisi yerine 404), not kaybı, M9 i18n.
- **Açık maddelere kart kodu:** PostHog → MULQMKP4YOM04 · TopicMatch + 60 gün → MULQL2NYKRGJX · PDF ekranı → MULQL8QB679LQ · prompt'lar + `MeetingBrief.opportunityId` → MULQLQIE3ES6G · token'lar → MULQLL2T8ZJX4 · K4 → MULQLF067H75P · kabul ölçümü → MULQMFVLJYZ5V · anahtarlar → MULQM3LFB4KRA · RLS → MULQM9UCIRY1A · dev ortamı → MULXYTBJAK2U3, MULV9UJBSYJCD · E2E → MULXYMNTUELIK, MUM033NPP7UFI · K3 DoS → MUM187B5EN9LZ.
- **Kart kodu olmayan açık madde:** E5 T-6 plan şablonu + görev listesi. ROADMAP'te "kart yok" diye yazıldı.
- **Yeni bölümler:** "FB-KAMU — kamu segmenti" (ADR-0004, İlkadım/OKA, CERV/LIFE kapalı, FB-KAMU-1 4/4, FB-KAMU-2 B1–B12 + il alanı), "FB-GAP-1 — 29.09'da kapananlar", "Pilot kapıları" (a–e tablosu), "Patrona öneri — 27.09'da kapatılan 6 kart".
- **Açık kararlar:** #9, #10, #13, #15 KAPANDI diye işaretlendi. #12, #14, #16, #19 AÇIK diye işaretlendi ve kart kodu eklendi. Yeni: #21 kalıcı giriş yöntemi, #22 HUKUK-5, #23 CERV/LIFE (karar kaydı).
- **Faz D:** "pazar yeri (Stripe Connect)" satırı `aa6a0fef` ile zaten düzeltilmişti. Buna dokunulmadı, kaldırmanın commit'leri eklendi.

## 2. Kanıt

Ölçümler (29.09, `/Users/macbook/alan/FONBRIDGE`, dev HEAD `e044fa33`):

```
$ pnpm -s lint >/dev/null 2>&1; echo "lint exit=$?"
lint exit=0          # çıktı boş: 0 hata, 0 uyarı
$ pnpm -s typecheck
$ tsc --noEmit
typecheck exit=0
```

Not: çalışma ağacında başka ajanlara ait 4 commit'siz dosya vardı (`messages/tr.json`, `ajans/*`,
TASK-MUM17YBJVAHRR'nin sürmekte olan işi). Ölçüm bu hâlde yapıldı.

Koddan doğrulananlar:

- G0: `src/lib/gates/evaluate.ts:4` → `import { computeG0ForOpportunity, … } from '../scoring/g0-compute'`. Aynı dosya `pipeline/actions.ts` ve `pipeline/[id]/page.tsx` içinden de çağrılıyor. `g0-compute.ts` `e816fa9f` ile girdi.
- Dashboard: `src/app` içinde `84.2|68.5|14.2|fundedOpps ||` → 0 eşleşme. Silen commit `ed391943`: `-%{thresholdRate === '0' ? '84.2' : thresholdRate}`.
- thresholdRate kartı: `src/modules/m5/ui/Dashboard.tsx:209 title: t('thresholdRate')` · `b6dd6024`.
- StripeEventLog: `prisma/schema.prisma:1200 model StripeEventLog` · `0a136fbf` · job kaydı `e40b5c72`.
- M9: `briefs/client.tsx:324 if (!res.success)` · `eda71f84` (404) · `fa0d5fd6` (not kaybı) · `client.tsx`'te 51 `t()`/`useTranslations` kullanımı.
- Hâlâ açık: `src/lib/analytics.ts:1 // Stub for PostHog`. `jobs/` altında TopicMatch ya da 60 gün job'u yok. `find src -iname "*prompt*"` boş. `admin/documents/upload`'u çağıran UI yok. `MeetingBrief` modelinde `opportunityId` yok. Şemada `model Task` yok. `alerts-daily.ts`'te `dedupeKey` yok.
- Board: `list_tasks sprint=FB-GAP-1` → 43 kart. `FB-KAMU-1` → 4 kart, 4'ü `done`. `FB-KAMU-2` → 26 kart (19 done, 1 in_progress, 2 todo, 4 backlog). Kapanan her kartın commit'i `git log --grep=<TASK-ID>` ile eşlendi (hash'ler ROADMAP'te).
- 27.09 kartları: leed-fb hafızası `fon-bridge-git-history-in-trash.md` 6 kartın kimliğini veriyor. Board'da başlıkları "[KAPATILDI 27.09 — fon_bridge repo yok, patron onayı]" öneki taşıyor. Her birinin commit'i ve raporu kontrol edildi: MTVPPDW8NXKLD `4bf01546`, MTVRC1UGA3B6Y `19475379`, MTU27WLNS25BZ `ce141010`, MTVU6SDYSFIXU `a97b863e`, MU8H5ZXPG6KAQ `9b63edbc`. MTVU4JH5YT6UD'nin kendi ID'siyle commit'i yok, işi TASK-MTVSBEO7VX6Y4 `0a136fbf`'de.
- Biçim: `npx -y prettier@3 --check docs/ROADMAP.md` → "All matched files use Prettier code style!" (repoda prettier bağımlılığı ve `format` script'i yok, `pnpm prettier` "Command not found" verdi. Önceki `style(...)` commit'leri gibi `npx prettier@3` kullanıldı.)

## 3. Değişen dosyalar

- `docs/ROADMAP.md`
- `docs/agent-results/TASK-MULQMNMPFY29P-cs-fb.md` (bu dosya)

## 4. Riskler

- **Doğrulanmadı:** lint 561→0 düşüşünün commit zinciri. Bugünkü 0 ölçüldü. TASK-MTQUXONVMWTOD panoda `done`, ama `--grep` ile commit'i bulunamadı.
- **Doğrulanmadı:** TASK-MTPZHMSPMDA66 (M6.3) bugünkü statüsü.
- Prettier eski maddelerin girinti/satır kırılımını da yeniden biçimlendirdi (diff'te 34 silme). İçerik değişmedi, yalnız biçim değişti.
- Pilot kapısı (c) ve (d) için board'da kart **yok**. Bu iki madde yalnız ROADMAP'te duruyor.

## 5. Açık sorular (patrona)

1. 27.09 kartları için öneri (ROADMAP "Patrona öneri" tablosu): **yeniden aç** → MTVU4JH5YT6UD (review, RLS kararına bağlı), MTVRC1UGA3B6Y (review + `alerts-daily` `dedupeKey` kartı), MTU27WLNS25BZ (backlog, e-Fatura ile), ayrıca TASK-MTRJSOWFH6B45 e-Fatura (pilot kapısı e). **Açma, kanıtla başlığı düzelt** → MTVU6SDYSFIXU, MTVPPDW8NXKLD, MU8H5ZXPG6KAQ. ESR TASK-MTQ2KL3JO4MK2 → pilot sonrasına.
2. Kalıcı giriş yöntemi (Açık karar #21) ve HUKUK-5 (#22) için kart açılsın mı?
3. E5 T-6 plan şablonu + görev listesi için kart açılsın mı? Kamu önceliğinde hâlâ gerekli mi?

## 6. Sonraki adım

- leed-fb: yukarıdaki önerileri patrona iletsin. Onay gelirse board'da kartları yeniden açsın ve başlıklarını düzeltsin (bu kart board'da statü değiştirmedi).
- Pilot kapıları (a) TASK-MUM17YBJVAHRR ve (b) TASK-MULWCFBTHDYZI kapandığında ROADMAP'teki tablo güncellensin.

**Platform beyanı:** yalnız doküman işi. macOS'ta (Darwin 27) hazırlandı. Kod yolu değişmedi, bu yüzden Windows/Linux için davranış farkı yok. Lint/typecheck ölçümleri macOS'ta koşuldu.
