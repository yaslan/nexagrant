# TASK-MTSWLWDONWA3W — Yeniden doğrulama (bugünkü HEAD'e karşı, kod yazılmadı)

**Ajan:** blockzincir-pm · **Tarih:** 2026-09-08 (aynı gün, ikinci tur) · **Tip:** re-check
**Sonuç:** Değişiklik yok. Faz 1 (ADR-0002 + Faz1 raporu, bkz. `TASK-MTSWLWDONWA3W-blockzincir-pm.md`) hâlâ geçerli. Kod yazılmadı — Faz 2, `TASK-MTSWL8ADKZKDM` bitmeden ve ADR-0002 kararı gelmeden açılamaz.

## 1. Ne yapıldı

Kart bana ikinci kez (bugün ilk turdan sonra) `src/lib/efatura.ts:37`/`:213`
alıntısı ve `unitPriceTRY`/`subtotalTRY` yanıltıcı isimlendirme bulgusuyla
geldi. Bayat rapora güvenmek yerine [[fabrika-verify-the-card-recheck-not-just-the-old-report]]
ilkesince bugünkü HEAD'e karşı yeniden ölçtüm:

1. `src/lib/efatura.ts` baştan okundu — satır 24 (`unitPriceTRY`), 37 (`currency`),
   57-63 (`TaxCalculationResult` — hepsi `...TRY` adlı ama içine hangi para
   birimi geldiyse o yazılıyor) hâlâ aynı; kur/TL-karşılığı alanı yok.
2. `git log --oneline -5 -- src/lib/efatura.ts src/lib/billing/invoice-writer.ts`
   → son commit `1af95e4 feat(efatura): adapter registration, preflight and
   unit tests` — bu commit adaptör kaydı/preflight ekliyor, kur/TL karşılığı
   alanına dokunmuyor. `git diff --stat HEAD` bu iki dosya için boş (bu
   oturumda kimse değiştirmemiş).
3. `docs/adr/ADR-0002-foreign-currency-invoice-fx.md` içeriği kontrol edildi:
   aynı bulguyu (satır numaralarıyla) zaten belgeliyor, durumu hâlâ **"Öneri
   — karar bekliyor"**.
4. `TASK-MTSWL8ADKZKDM` (Invoice yazma yolu, Faz 2'nin ön koşulu) board'da
   hâlâ `in_progress` — bitmemiş.

## 2. Neden yeni kod/ADR yazılmadı

Aynı bulgu için ikinci bir ADR veya kod değişikliği **gerekli değil** —
mevcut ADR-0002 zaten bu tam bulguyu (dosya/satır, yanıltıcı isimlendirme,
VUK 215/280/385 gerekçesi, 3 seçenek) kapsıyor ve karar hâlâ lider/patrona
bırakılmış durumda. Yeniden yazmak yalnız yinelenen içerik üretir.

## 3. Zamanlama notu (yeni bilgi — ilk raporda yoktu)

`TASK-MTRJSOWFH6B45` (GO-LIVE BLOKLAYICI — e-Fatura env + GİB entegratörü,
sahibi blok-zincir-lead) notunda patronun GİB env'lerini **2026-09-12/13
hafta sonu** getireceği yazıyor. Bugün 2026-09-08 — yalnız 4-5 gün var.
ADR-0002 kararı bu tarihten önce gelmezse, ilk canlı fatura (ölçülen dev-DB
dağılımına göre muhtemelen USD) TL karşılığı olmadan kesilme riski taşır.
**Bu görevin durumu "in_progress" (@blok-zincir-denet-i) olarak kalıyor ama
asıl blokaj bir kod sorunu değil, bekleyen bir karar** — board'da ayrıca bir
teknik iş kartı açmak yanıltıcı olur; ADR-0002'nin lider/patron tarafından
okunup karara bağlanması gerekiyor.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MTSWLWDONWA3W-blockzincir-pm-2.md` (bu dosya, yeni)
- Kod dosyalarına dokunulmadı.

## 5. Riskler

- Karar 09-12/13'ten önce gelmezse, ilk fatura VUK 385 Sıra No.lu Tebliğ'e
  aykırı kesilebilir (TL karşılığı yok) → VUK 352 md. II-7 usulsüzlük riski.

## 6. Açık sorular

ADR-0002 §"Açık sorular" ile aynı — üretimdeki gerçek ülke/para birimi
dağılımı ve TCMB kur kaynağı soruları hâlâ cevapsız.

## Sonraki adım

Lider/patrona ADR-0002'yi 09-12/13'ten önce karara bağlaması gerektiği
iletilmeli (bu oturumda doğrudan mesajlaşma kanalı bulunamadı — bu rapor ve
kullanıcıya verilen özet bunun yerini tutuyor).
