---
name: e10-dashboard-patterns
description: M5 KPI panosunun KANONİK metrik tanımları (docs/ROADMAP.md:63) ve panoda tekrar eden hata sınıfı — etiket ile hesabın uyuşmaması
metadata:
  type: project
  updatedAt: 2026-09-06
---

## M5 KPI panosu — kanonik metrik tanımları

**Tek doğruluk kaynağı: `docs/ROADMAP.md:63`** (ayrıca `docs/BETA_GUIDE.md:179` tabloda tekrarlar).
Kod ile bu satır çeliştiğinde **kod yanlıştır**; formülü hafızadan/sezgiden yazma.

| Kart | Tanım |
|---|---|
| Toplam Teklif | aralıktaki fırsat sayısı |
| İsabet Oranı | `FUNDED`+`ABOVE_THRESHOLD` teklif / toplam teklif |
| Ortalama Puan | `mean((excellence+impact+implementation)/3)` — her yerde "iç ön değerlendirme" etiketiyle |
| **Kişi-Gün / Teklif** | `sum(hours)/8 / teklifSayısı` — **teklif başına**, toplam DEĞİL |
| G0→G2 Süresi | `mean(G2.decidedAt − G0.decidedAt)` eşleşen fırsatlar üzerinden |
| Açık Modüller | `ModuleState.status = ON` sayısı |

> ⚠️ Bu dosyanın önceki sürümünde uydurma bir formül vardı (`14.2 - (totalOpps * 0.3)`).
> Silindi. Metrik formülünü **her zaman** `docs/ROADMAP.md`'den doğrula.

## Panoda tekrar eden hata sınıfı: etiket ↔ hesap uyuşmazlığı

2026-09-06'da bulunan gerçek hata: kart "Kişi-Gün / **Teklif**" yazıyordu, hesap toplam kişi-günü
döndürüyordu (228 saat / 8 = 28,5 gösteriliyordu; 3 teklif için doğrusu 9,5). Kullanıcıya gösterilen
KPI 3× şişmişti — CLAUDE.md kural 7 ihlali.

Hatayı gizleyen şey **yanlış değişken adıydı**: `totalOpportunities` diye bağlanmış değer aslında
`tx.proposal.count(...)` idi. **Panodaki bir sayıyı incelerken önce bağın adının gerçekten neyi
saydığını doğrula.**

İnceleme refleksi: her KPI kartı için *etiketi oku → hesabı oku → canlı sayfadaki sayıyı elde
hesapla*. Statik kontroller bu sınıfı **yakalamaz** (`pnpm typecheck` tertemizdi).

## Doğrulanmamış rapor uyarısı

Bir ajan raporundaki KPI sayıları (`docs/agent-results/E10.1-...`) canlı sayfada üretilemiyordu
(rapor %72,5 / 78,3 diyordu, gerçek 0,0 / 0,0 — çünkü seed'de hiç `FUNDED` fırsat ve puanlı
`Evaluation` yok). **Başka ajanın rapor rakamını kanıt sayma; sayfayı kendin çek.**
Doğrulama reçetesi: [[fabrika-runtime-verification-recipe]]. Görev 129 ile düştüyse: [[agent-exit-129-sighup]].

## Paralel ajan çakışması

`page.tsx` ve `Dashboard.tsx` bu iş sırasında başka bir ajan tarafından **eşzamanlı** yeniden yazıldı
(prop sözleşmesi `initialMetrics` → `metrics` değişti, arada sayfa runtime'da patladı). Dosya
mtime'ına bakmak (`stat -f "%Sm %N"`) kimin canlı düzenlediğini anlamanın en hızlı yolu; başkasının
aktif dosyasına dokunmak yerine kendi katmanına (burada `server/queries.ts`) çekil.
