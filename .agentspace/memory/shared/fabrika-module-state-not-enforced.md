---
name: fabrika-module-state-not-enforced
description: ESKİ BULGU, 2026-09-07'de ÇÖZÜLDÜ — ModuleState kapısı artık M9 ve M6'da uygulanıyor; güncel kural [[fabrika-module-gate-is-opt-in]] dosyasında
metadata:
  type: project
  updatedAt: 2026-09-07
---

> **ARTIK GEÇERLİ DEĞİL.** Bu dosya "ModuleState hiçbir yerde uygulanmıyor" diyordu; kusur
> 2026-09-07'de `TASK-MTQW8188AWOAT` ile kapatıldı. **Güncel davranış için
> [[fabrika-module-gate-is-opt-in]] oku.** Bu kayıt yalnızca kusurun ne olduğunu ve nasıl
> yakalandığını hatırlatmak için duruyor.

## Neydi (2026-09-07 öncesi)

`checkModuleAccess`/`assertModuleAccess` tanımlıydı ama **hiçbir yerden çağrılmıyordu**; bir
modülü `/admin/modules`'ten `OFF`/`DEV` yapmak DB'ye doğru yazılıyor, `AuditEvent` üretiliyor ama
kullanıcı sayfayı yine de tam görüyordu. Ayrıca `DEV` dalı `role === 'TENANT_OWNER'` bakıyordu —
her kiracının bir sahibi olduğu için `DEV` kimseyi dışarıda bırakmıyordu.

## Ne oldu

- Kapı bağlandı: `moduleGate()` (sayfa) + `assertModuleAccess()` (server action), M9 ve M6'da.
- `DEV` artık yalnız `session.isPlatformAdmin`. Karar: `docs/adr/ADR-0001-module-state-access-gate.md`.
- Kanıt: `docs/agent-results/TASK-MTQW8188AWOAT-blockzincir-pm.md` (§2.1 ekran görüntüleri,
  §2.2 kapalı modül 0 kredi harcıyor — server-action replay).

## Kalıcı ders

"DB'ye doğru yazdım" ≠ "ürün öyle davranıyor". Bir durum/config değişikliğinin **etkisini**
iddia etmeden önce o durumu okuyan bir çağrı var mı diye koda bak. Bugün de aynı tuzak açık:
kapı sayfa başına opt-in — [[fabrika-module-gate-is-opt-in]].

İlgili: [[fabrika-done-reports-can-be-wrong]], [[fabrika-workspace-url-segment-is-decorative]]
