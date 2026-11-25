---
hüküm: Yarış gerçek Postgres + gerçek clamd'de üretildi (düzeltmesiz: iki `object_removed`, iki çalıştırma da `objectDeleted: true`); kontrol + silme + yazım tek kilitli transaction'a alındı, aynı test 1 `object_removed` ve 1 alarm veriyor; mutant kırmızı; 5/5 ardışık yeşil; typecheck ve eslint temiz. Commit `a94a5758` (dal `task/ng-278`), push ve PR yok.
tip: hata
platform: Windows 11 + WSL2 Ubuntu-24.04 (Linux) + Docker. mac'te koşulamadı (bu makinede mac yok). Kod yolu platforma bağlı değil (Node + Postgres; dosya yolu, süreç ya da kabuk ikilisi yok), bu yüzden Windows/mac'te de aynı davranışın beklenmesi koddan çıkar, ama koşulmadı.
---

# NG-278 — `object_removed` çift yazımı: yarış gerçek, düzeltildi

## Ne yapıldı
1. **Ölçüm (kırmızı, düzeltme yokken).** `finishInfectedRemoval` içinde "kayıtlı sonuç var mı" kontrolü (`auditEvent.findFirst`), nesne silme ve sonuç yazımı arasında kilit yoktu. Yeni test `NG-278: two runs that both finish the removal of one INFECTED file …` (`tests/evidence-scan.live.test.ts`, NG-263 bloğunun sonunda) şöyle kurar: Çalıştırma A gerçek clamd'de FOUND alır, INFECTED yazar, kontrolünü geçer ve nesne silmede bekletilir. Çalıştırma B ancak o noktada başlar: satır INFECTED, A'nın sonucu henüz yok. Yarış B'de de üretildi. Sonuç: iki `object_removed`.
2. **Düzeltme (`src/lib/evidence-scan.ts`, `finishInfectedRemoval`).** Kontrol, nesne silme ve `object_removed` yazımı tek transaction'da. Transaction, Evidence satırını `SELECT "id" FROM "Evidence" … FOR UPDATE` ile kilitler (projedeki `m18/server/deals-repo.ts` deseni). İkinci çalıştırma kilidi bekler, A'nın sonucunu görür ve `skipped: already_final` döner. Transaction, R2 silme çağrısı kilit altında olduğu için 30 sn zaman aşımıyla açılır (`OBJECT_REMOVAL_TX_TIMEOUT_MS`). `TenantRunner` tipi ve varsayılan runner, `withTenant`'a opsiyon geçecek şekilde genişletildi (test enjeksiyonları değişmedi).
3. **Şema, RLS, rbac, llm, billing, gate betikleri: dokunulmadı.** Yalnız `src/lib/evidence-scan.ts` ve `tests/evidence-scan.live.test.ts`.

## Kanıt (ham çıktı)

Ortam: `pgvector/pgvector:pg16` (`127.0.0.1:5540`, DB `ng278`) ve `clamav/clamav-debian:stable` (`127.0.0.1:3320`, `CLAMD_CONF_AlertExceedsMax=yes`). İkisi de bu iş için açıldı; `fabrika` DB'si ve 5433 kullanılmadı. clamd `PONG` döndü.

**Düzeltmesiz (kırmızı):**
```
[NG-278 race] A={"status":"INFECTED","signature":"Eicar-Test-Signature","objectDeleted":true} B={"status":"INFECTED","signature":"Eicar-Test-Signature","objectDeleted":true} deleteCalls=2
AssertionError: exactly one object_removed AuditEvent: expected [ { …(7) }, { …(7) } ] to have a length of 1 but got 2
 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
```

**Mutant (düzeltmedeki `FOR UPDATE` satırı kaldırıldı, geri alındı, dosya yedekle birebir eşleşti):**
```
[NG-278 race] A={"status":"INFECTED",...,"objectDeleted":true} B={"status":"INFECTED",...,"objectDeleted":true} deleteCalls=2
AssertionError: exactly one object_removed AuditEvent: expected [ { …(7) }, { …(7) } ] to have a length of 1 but got 2
 Tests  1 failed | 25 skipped (26)
```

**Düzeltmeyle (yeşil):**
```
[NG-278 race] A={"status":"INFECTED","signature":"Eicar-Test-Signature","objectDeleted":true} B={"skipped":"already_final"} deleteCalls=1
 Test Files  1 passed (1)
      Tests  25 passed | 1 skipped (26)
```

**Ardışık koşular (düzeltmeyle, tüm `tests/evidence-scan.live.test.ts`):** 5 koşunun hepsi `Tests 25 passed | 1 skipped (26)`, çıkış 0. Atlanan test, `NG239_CLAMD_STOPPED=1` ister (bilerek kapalı).

**Düzeltmesiz baseline:** `Tests 24 passed | 1 skipped (25)`. Yani eklenen test dışında suite değişmedi.

**Yakın evidence canlı suite'leri (izole koşu):** `evidence-dev-store`, `evidence-expiring`, `evidence-scan`: `Test Files 3 passed (3)`, `Tests 40 passed | 1 skipped (41)`.

**Tip ve lint:** `pnpm typecheck` → `tsc --noEmit`, çıkış 0. `pnpm exec eslint src/lib/evidence-scan.ts tests/evidence-scan.live.test.ts` → çıkış 0. Commit'teki pre-commit kancası da eslint + tsc'yi geçti (`Kapı temiz (staged kapsamı)`).

**Tam suite denemesi (bilgi için, kanıt olarak değil):** Yanlış bir filtre yüzünden `vitest run` tüm suite'i izole DB'de koştu: `Test Files 33 failed | 577 passed | 4 skipped`. Kırmızıların çoğu `Hook timed out in 60000ms` (paralel yük altında `afterAll`) ya da dosya-düzeyi yükleme hatası; biri `refusing to write on database "ng278"` (DB adı koruma kuralı). Evidence ile ilgili iki kırmızı (`evidence-dev-store`, `evidence-expiring`) izole koşuda geçti. Diğer dosyalar bu iş kapsamında değil ve bu koşuda incelenmedi; "tüm suite yeşil" diye bir iddia yok.

## Değişen dosyalar
- `src/lib/evidence-scan.ts`: `finishInfectedRemoval` tek kilitli transaction; `TenantRunner` opsiyon alır; `OBJECT_REMOVAL_TX_TIMEOUT_MS`.
- `tests/evidence-scan.live.test.ts`: yeni `NG-278` yarış testi (NG-263 bloğunun sonunda).
- `docs/agent-results/NG-278-de-gnd.md`: bu dosya.

Commit: `a94a5758` (`fix(evidence): one object_removed per infected file under concurrent runs (NG-278)`), temel `origin/dev` `48760af07`. NG-263 (`bea12edef`) origin/dev'de doğrulandı.

## Riskler
- **Kilit süresi.** Kilit, R2 silme çağrısı bitene kadar tutulur. 30 sn sınırı bunu sınırlar, ama tutulan her kilit bir bağlantı havuzu bağlantısı da tutar. Sık olmayan bir olay olduğu için kabul edilebilir bulundu; yük testi yapılmadı.
- **Silme başarılı, sonuç yazımı başarısız.** Transaction geri alınır, R2 silme geri alınamaz. Yeniden denemede olay yok, nesne de yok; silme `objectDeleted: false` dönebilir ve alarm "could NOT be deleted" diyebilir. Bu bir tutarsızlık, ama düzeltmeden önce de aynı sıradaydı; bu iş bunu değiştirmedi ve ayrıca ölçülmedi.
- **Platform.** Yalnız Linux (WSL2) ve Docker'da koşuldu. mac koşulamadı.

## Açık sorular
- **Git kimliği.** Bu WSL deposunda `user.name`/`user.email` tanımlı değil. Commit'i `DE-NG (de-gnd) <de-gnd@agentspace.invalid>` kimliğiyle attım (yalnız bu komutun ortam değişkenleriyle; config'e yazılmadı). Hangi kimlikle commit atılacağına lider karar verebilir.
- **Sonuç dosyası yolu.** Kart ve lider "`~/alan/FONBRIDGE-dev/docs/agent-results/NG-278-de-gnd.md`" dedi; bu yol `dev-wsl` dalındaki ana checkout. Dosya oraya da kopyalandı (commit edilmedi, o dal bana ait değil). Aynı dosya `task/ng-278` dalında da commit'li.

## Sonraki adım
- Lider: `task/ng-278` dalını (`a94a5758` + bu rapor commit'i) incelemeye al. Push ve PR bu karttan yapılmayacak (kart: commit var, push ve PR yok).
- Çalışan konteynerler (`ng278-pg`, `ng278-clamd`) bu raporun ardından kapatılacak; worktree silinmeyecek.
