# TASK-MTQ6CJE26N2UL — Fabrika durum değerlendirmesi ve S8–S9 iş dağıtımı

**Ajan:** LEED-EN (`blok-zincir-lead`, takım lideri/orchestrator) · **Sprint:** S8 · **Tarih:** 2026-09-06

---

## 1. Ne yapıldı

Fabrika deposunun durumu **iddiaya değil komut çıktısına dayanarak** ölçüldü; kalan iş yedi göreve
bölünüp board'a açıldı; ROADMAP'in açık kararı #8 patron kararıyla kapatıldı; delegasyon denendi ve
bir araç davranışı yüzünden geri alındı (aşağıda).

### 1.1 Yeşil olanlar
`pnpm build` ve `pnpm typecheck` temiz. Birim testlerin 317/321'i geçiyor. Kapsam gerçekten geniş:
11 modül iskeleti, ~80 sayfa, K1/K2 adaptörleri, Stripe + iyzico webhook'ları, Inngest işleri,
marketing + KVKK sayfaları, M6 skorlama motoru (345 satır, birim testli).

### 1.2 MVP kabul kriterlerini fiilen çürüten dört bulgu

| # | Bulgu | Ölçüm | Görev |
|---|---|---|---|
| 1 | Kiracı izolasyonu uygulama katmanında zorlanmıyor | 46 `demo-tenant`/`demo-user-id` geri düşüşü, 20+ dosya; `withTenant` yalnız 4 dosyada; modül sunucu kodunun 12'sinde çıplak `prisma.` | TASK-MTQ5Y8EPT7FDA |
| 2 | Modül sistemi kodda yok | 11 manifestin hepsi tek satır; `routes`/`nav`/`permissions`/`tables` hiçbirinde yok; `requireModule` 1, `useModuleEnabled` 2 kullanım | TASK-MTQ5YNJNF17OZ |
| 3 | UI'da uydurma değerlendirme verisi | `opportunities/[id]/evaluations/page.tsx` DB düşerse elle yazılmış puan render ediyor (CLAUDE.md kural 7 ihlali) | TASK-MTQ5ZF5ZRU5SM |
| 4 | Lint kapısı kırmızı | 554 hata / 238 uyarı; 495'i `@typescript-eslint/no-explicit-any` (CLAUDE.md "Yapma" maddesi) | TASK-MTQ60SGW45T0X |

Ek olarak: `dev`'de 60+ commit'siz dosya (TASK-MTQ61HQDX035M), iki ayrı sayfa ağacı
`src/app/(marketing)` vs `src/app/[locale]` (TASK-MTQ602Y8V5QOK), G0 skoru için üç çelişkili
implementasyon (TASK-MTQ63RR8Z0G8E), bu makinede `docker`/`postgres` yok → seed ve RLS uçtan uca
doğrulanamıyor.

### 1.3 Karar: ROADMAP açık karar #8 (G0 eşiği)
Patron kararı (2026-09-06): eşik **bileşik skora** uygulanır — `DEFAULT_G0_RULES`, yani 7 faktörlü
0–100 bileşik skor ≥ 70 + PROJECT.md:75 sert kuralları (taban oran ≥ %8, ülke uygun).
`SPEC_LITERAL_G0_RULES` yalnız kalibrasyon karşılaştırması için saklanır. `docs/ROADMAP.md`'ye işlendi.

### 1.4 Delegasyon misfire'ı ve geri alınması
`agentspace_delegate`'e tek ajanlık bir iş, altı maddelik "Yapılacaklar" listesiyle gönderildi. Araç
**her maddeyi ayrı bir alt-göreve** çevirip altı ayrı worker pane'i açtı; altısı da aynı git ağacını
commit etmek üzereydi. Pane'ler `agentspace_pane action=close` ile tek tek kapatıldı ve hasar olmadığı
git ile doğrulandı. Kalıcı hafızaya yazıldı.

---

## 2. Kanıt (kopyalanmış komut çıktıları)

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — temiz)

$ pnpm build
... ƒ /api/webhooks/stripe · ƒ /pricing · ƒ /privacy · ƒ /terms
ƒ Proxy (Middleware)          → build başarılı

$ pnpm test
 Test Files  3 failed | 41 passed (44)
      Tests  4 failed | 317 passed (321)
   (4 kırmızı = bilinen taban çizgisi: 3 SEDIA ağ testi + 1 RLS testi)

$ pnpm lint
✖ 792 problems (554 errors, 238 warnings)

$ pnpm lint | grep "  error" | awk '{print $NF}' | sort | uniq -c | sort -rn
 495 @typescript-eslint/no-explicit-any
  23 react/no-unescaped-entities
   7 @typescript-eslint/ban-ts-comment
   5 @typescript-eslint/no-require-imports
   2 react-hooks/rules-of-hooks
   1 react/jsx-no-comment-textnodes

$ grep -rn "demo-tenant" src | wc -l
      46

$ for f in src/modules/*/manifest.ts; do ... done
src/modules/m1..m11/manifest.ts → routes nav permissions tables   (11/11 eksik)

$ grep -rn "requireModule" src | wc -l
       1
$ grep -rn "useModuleEnabled" src | wc -l
       2

$ git log --oneline -1   # misfire sonrası hasar kontrolü
0edeb5f fix(billing): resolve implicit any type in getAllPlans map callback
$ git diff --cached --stat
(boş — hiçbir worker commit etmedi)
```

---

## 3. Değişen dosyalar

- `docs/ROADMAP.md` — açık karar #8 kapatıldı, karar metni ve board referansı eklendi
- `.agentspace/memory/shared/agentspace-delegate-splits-numbered-lists.md` (yeni)
- `.agentspace/memory/agents/blok-zincir-lead/agentspace-cross-team-delegation-grant.md` (yeni)
- `docs/agent-results/TASK-MTQ6CJE26N2UL-blok-zincir-lead.md` (bu dosya)

Board'a açılan görevler: TASK-MTQ61HQDX035M, TASK-MTQ5Y8EPT7FDA, TASK-MTQ5YNJNF17OZ,
TASK-MTQ602Y8V5QOK, TASK-MTQ5ZF5ZRU5SM, TASK-MTQ60SGW45T0X, TASK-MTQ63RR8Z0G8E.

---

## 4. Riskler

- **Dosya yarışı:** yedi görevin scope'ları bilerek ayrıştırıldı ve her karta "hangi dosyalara
  DOKUNMA" satırı yazıldı; yine de Dalga-2 (lint) tüm repoya dokunduğu için Dalga-1 merge edilmeden
  başlatılmamalı.
- **Commit'siz 60+ dosya** en kırılgan varlık; temizlik görevi bitene kadar her paralel iş bu riski taşır.
- **Postgres yok:** seed/RLS gerektiren doğrulamalar bu makinede tamamlanamaz; ilgili DoD maddeleri
  "engel" olarak raporlanmalı, "çalışıyor" diye kapatılmamalı.
- **Board hijyeni:** aynı epikler için `fabrika`, `muhendislik`, `agentdesk` projelerinde yinelenen
  kartlar var; S3'te beş görev hâlâ `in_progress` görünüyor ama kodda karşılıkları tamamlanmış olabilir.

---

## 5. Açık sorular

1. **Çapraz-takım izni:** Fabrika uzmanları (`cora-0c1f10`, `defne-0c1f10`, `sora-0c1f10`,
   `derin-0c1f10`) `cekirdek` takımında değil; delegasyon 502 ile reddediliyor. Patron
   Ayarlar → Takım İzinleri'nden izin verecek; hangi takım adı olduğu teyit bekliyor
   (muhtemelen `muhendislik`).
2. Yinelenen board kartları birleştirilsin mi, yoksa proje bazında ayrı mı kalsın?
3. `src/types/prisma-override.d.ts` (`@prisma/client`'ı gölgeliyor) hâlâ gerekli mi — lint görevinde
   karara bağlanacak.

---

## 6. Sonraki adım

İzin gelir gelmez Dalga-1 delege edilecek: önce TASK-MTQ61HQDX035M (ağaç temizliği, tek ajan),
bitince paralel olarak TASK-MTQ5Y8EPT7FDA (Cora), TASK-MTQ5YNJNF17OZ (Defne),
TASK-MTQ602Y8V5QOK (Sora). Dalga-2: TASK-MTQ5ZF5ZRU5SM, TASK-MTQ63RR8Z0G8E, TASK-MTQ60SGW45T0X.
Delegasyon metinleri numaralı liste İÇERMEYECEK (alt-göreve bölünmesin diye).
