---
name: reuseExistingServer-symptom-masking
description: playwright.config reuseExistingServer:true, eski sunucu varsa testEnv bypass eder — semptom "env okuması fail" gibi görünebilir ama kök neden başka
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

## Rule
**reuseExistingServer:true + eski dev server** → testEnv env'leri route'a geçilmiyor. Semptom: "module-level env okuması test'te çalışmadı, lazy import'la çalıştı" **ama gerçek neden env bypass'ı**, module-level okuması değil.

**Kanıt:** TASK-MTU26XBVZ6H1O tur 2 — lazy import'ı kaldırdığımda (module-level'e taşıdığımda) test PASS duruyor. Demek module-level okuması çalışıyor; tur 1'deki "fail" semptomunu reuseExistingServer'ın eski sunucu bypass'ı yok etti.

## Why
1. playwright.config.ts'de reuseExistingServer:true varsa, Playwright çalıştığında port'ta sunucu varsa yenisini başlatmak yerine o sunucuyu kullanır
2. testEnv env'leri webServer'ın kendi başlattığı sunucuya iletilir
3. **AMA:** reuseExistingServer varsa ve sunucu zaten dinliyorsa, Playwright testEnv'i (ve route'daki env'leri) bypass eder
4. Şu anki sunucunun env'leri eski olur → env okuması "çalışmıyor" gibi görünür
5. Lazy import ile sorun "çözüldü" görüntüsü (ya da başka bir sebepten sorun ortadan kalktı) — ama lazy import aslında gereksiz overhead

## How to apply
- Test başında `lsof -nP -iTCP:3000 | grep LISTEN` ile eski server check et
- Eğer varsa kill et veya `reuseExistingServer: false` yap (performance trade-off: her test'te restart)
- Module-level env okuması "test'te çalışmaz" gibi görünerse, önce reuseExistingServer tuzağını şüphe et
- Lazy import kaldırıp ölçerek test et — eğer pass kalırsa, lazy import gereksizdi (optimization)
- Her iki kanıtı da raporla (env olmadan FAIL, env'lerle PASS) — tek yeşil kanıt yetmez

## Related
[[two-way-evidence-for-guard-tests]] — assertion fail'in (KIRMIZI) + pass'ını (YEŞİL) kanıtla; tek yeşil yetmez
[[fabrika-evidence-guard-forces-a-numbered-rerun-file]] — evidence rapor dosyaları kanıt disiplinini doğrular
