---
name: fabrika-empty-tenant-audit-needs-module-and-plan-rows
description: "\"Kaydı olmayan kullanıcıyla gez\" denen uydurma-veri denetimi Fabrika'da doğrudan yapılamaz — boş kiracı her sayfada modül/plan kapısına takılır; geçici ModuleState + Subscription satırı aç, gez, birebir sil"
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Bir kartın "boş bir kiracıyla gerçek tarayıcıda gez, uydurma rakam çıkmadığını göster"
maddesini Fabrika'da naif biçimde uygulayamazsın: **tam olarak aradığın kiracı — hiç kaydı
olmayan kiracı — aynı zamanda hiç `ModuleState` satırı ve hiç `Subscription` satırı olmayan
kiracıdır**, o yüzden gezmek istediğin her sayfa veriyi değil kapıyı gösterir:

```
🔒 Bu modül şu anda kullanılamıyor
   Proposal Production Workflows modülü kiracınızda kapalı.        ← ModuleState yok
   Partner Intelligence Database modülü aboneliğinizin kapsamı dışında.  ← Subscription yok (FREE)
```

Bu ekran **dürüst** bir cevaptır, uydurma veri değildir — ama denetimin kanıtı değildir:
uydurma fallback'in çalıştığı kod yoluna hiç girmemişsindir. TASK-MTQYXISOPUJ53'ün ikinci
koşumunda ilk tur böyle "temiz" göründü; kapıları açtıktan sonra aynı kiracı ekranda
"FLEX-GRID: Decarbonised Smart Grid Flexibility Solutions" gördü.

## Reçete

1. **Kaydı olmayan gerçek bir kiracı seç** — e2e fixture'ı değil, seed'den kalan gerçek bir
   satır. 2026-09-08'de: `org-y8w2f9` / "İstanbul Teknik Üniversitesi TTO",
   `ayse@tto.edu.tr` (TENANT_OWNER). Boşluğu SQL ile doğrula, ekrana güvenme
   (`Opportunity/Evaluation/Effort/Proposal/GateDecision/Invoice` hepsi 0).
   `owner@demo.fabrika.test`'i kullanma — e2e spec'leri onu kullanıyor, paralel koşuda çakışır.
2. **Kapıları geçici aç.** Satırların hepsine tanınabilir bir id öneki ver (`csv7-…`),
   silmesi böyle güvenli olur:
   - `ModuleState` (id, tenantId, moduleId, **status**, settings, changedBy, changedAt) —
     kolonun adı `status`, `state` DEĞİL; enum `OFF|DEV|PILOT|ON`.
   - `Subscription` (tenantId, planId, status, billingInterval, provider, updatedAt) —
     `Tenant`'ta plan kolonu YOK, plan buradan okunuyor. M8 `pro` ister, M9/M10/M11 `ultra`.
3. **Gez ve dizgi tara.** Sayfanın `innerText`'ini bilinen uydurma dizgi listesine karşı
   tara (84.2 / 68.5 / 412.500 / Fraunhofer / FLEX-GRID / GIB2026 …) ve **metni de** kaydet:
   kare göze, `.txt` grep'e yarar. Fallback'in tetiklendiği url genelde bir *id*'dir —
   `demo-opp-1` gibi seed id'lerini ve olmayan bir id'yi ayrı ayrı dene.
4. **Sil ve sayımla doğrula.** Tek `with … delete … returning` ifadesiyle hepsini sil, sonra
   `count(*)` ile sıfırı göster; raporun bir "geri alma listesi" bölümü taşısın.
   `Subscription` toplamının koşum öncesindeki sayıya döndüğünü de yaz.

## İki yarımı birden ölç

Uydurma veriyi sökerken "her şeyi gizle" ucuz düzeltmesi de testleri yeşile boyar. Bu yüzden
her zaman iki oturum aç: satırın **gerçek sahibi** olan kiracı kendi kaydını görmeye devam
ediyor mu, ve boş kiracı gerçekten 404 mü alıyor. 404'ü gövdeden değil `response.status()`'tan
oku (bkz. [[fabrika-notfound-returns-http-200]]).

İlgili: [[fabrika-playwright-dogfood-recipe]] · [[fabrika-fabricated-fallback-antipattern]] ·
[[fabrika-live-postgres-for-evidence]] · [[fabrika-e2e-fixture-needs-modulestate]]
