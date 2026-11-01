---
sözleşme: 3
görev: TASK-MVC9FW2U15VM6
kod: TASK-MVC9FW2U15VM6
ajan: crw2-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: ONAY. PR #115 (head ac61467f) doğru. Bloke eden bulgu yok. İki mutasyonu rls:verify ve canlı test yakaladı, FO-45 akışı 90/90 geçti, dev ile çakışma yok. 3 öneri var.
platform: mac (darwin). Değişiklik yalnız Postgres SQL ve Node betiği içeriyor, platforma bağlı yol yok. Windows/Linux'ta koşulmadı, çünkü bu makinede yok. Koddan bakınca davranış aynı. CI koşulamadı: GitHub Actions işleri 1-2 sn'de 0 adımla düşüyor (runner başlamıyor). Aynı durum merge edilmiş PR #83'te de var, yani koddan kaynaklanmıyor.
sürüm: 1
tarih: 2026-10-18T18:32:27.842Z
---

# FO-52 PR #115 inceleme: public-intake kapsamı ExpertPreRegistration'a kilitlendi (crw2-fb)

## Ne yapıldı
- Kart (get_task), se-fb raporu `-3.md` ve PR #115 diff'i okundu (5 dosya). Ayrı worktree `--detach ac61467f` ile açıldı. İş bitince worktree silindi.
- `prisma/rls.sql` `system_scope_open` satır satır incelendi:
  - **Sahip dalına dokunulmamış.** `pg_has_role(current_user, relowner, 'USAGE')` aynen duruyor. Yeni koşul yalnız `OR (system_scope_sealed() AND …)` dalına eklenmiş.
  - **`to_regclass('public."…"')` kullanılmış ve şema nitelikli.** Bu yüzden `search_path`'ten bağımsız. Fonksiyon `SET search_path = pg_catalog` ile kalmış. `public.system_scope_sealed()` da nitelikli. `(tbl IN (NULL, …)) IS TRUE` ifadesi tablo yoksa false döndürüyor, hata vermiyor.
  - **Öteki 5 amaç değişmemiş.** `<> 'public-intake'` ise koşul öncekiyle aynı. `enter_system_scope` ve amaç listesi diff'te yok.
- Çağrı noktaları tarandı. `public-intake` yalnız `register.ts` (register, rollback) ve `verify.ts` içinde kullanılıyor. İkisi de yalnız `tx.expertPreRegistration` ve `pg_advisory_xact_lock` çağırıyor. `withSystemScopeOn` başka tabloya yazmıyor, AuditEvent de yazmıyor. Dolayısıyla daraltma bugünkü akışı kırmıyor. #92 (FO-50) `verify.ts` ExpertFounderCounter'a yazıyor ve o tablo listede.
- `rls:verify` ölçüm kodu (`probePurposeTables`) okundu:
  - Tek snapshot kullanıyor (`pg_export_snapshot`).
  - Kapsam dışı sayıyla public-intake sayısını karşılaştırıyor.
  - AuditEvent INSERT için negatif kontrol, ExpertPreRegistration INSERT için pozitif kontrol yapıyor.
  - Öteki 5 amacın tüm satırları gördüğünü doğruluyor. cross-tenant-job ile AuditEvent INSERT pozitif kontrolü var.
  - Ölçüm doğru.

## Kanıt (ham çıktı)
**1. rls:verify, yerel paylaşılan `fabrika` DB, ölçüm rolü `fabrika_app` (rolbypassrls=false):**
```
✓ public-intake: 51 system_scope tablosunda kapsam dışıyla aynı satır sayısı (yalnız ExpertPreRegistration, ExpertFounderCounter açık)
✓ public-intake: AuditEvent INSERT reddedildi
✓ public-intake: ExpertPreRegistration INSERT kabul edildi (pozitif kontrol, geri alındı)
✓ tenant-discovery|subject-scoped|platform-admin|platform-aggregate|cross-tenant-job: 30 tablo kapsamla açıldı, her system_scope tablosunda tüm satırlar
✓ cross-tenant-job: AuditEvent INSERT kabul edildi (pozitif kontrol, geri alındı)
EXIT=0
```
**2. Mutasyon A.** Paylaşılan DB'ye dokunulmadı. `pg_dump fabrika` ile kopya DB `fabrika_crw2_fo52` açıldı. Bu kopyada `system_scope_open`, origin/dev gövdesine döndürüldü, yani FO-52 koşulu kaldırıldı:
```
• public-intake: 28 tablo kapsam dışından fazlasını gösteriyor (…): ApiKey=1>0, AuditEvent=1413>0, Membership=30>0, Evidence=12880>0, …
• public-intake: AuditEvent INSERT KABUL EDİLDİ
EXIT=1
tests/system-scope.live.test.ts: × Membership/ApiKey 0 kalır (expected [2,1] to equal [0,0]); × write refused (promise resolved) — Tests 2 failed | 18 passed
```
**3. Mutasyon B.** Daraltma amaçtan bağımsız uygulandı, liste yanlıştı:
```
• public-intake: ExpertPreRegistration INSERT reddedildi — form yazamaz: rls
• tenant-discovery / subject-scoped / platform-admin / platform-aggregate / cross-tenant-job: daraldı, tüm satırları görmüyor …
• cross-tenant-job: AuditEvent INSERT reddedildi — RLS
EXIT=1
```
**4. FO-45 akışı.** Kopya DB'ye `pnpm db:rls` ile PR hali uygulandı. Koşulan testler: `tests/system-scope.live.test.ts`, `tests/expert-prereg*.live.test.ts` (app-role, reissue, ana) ve `src/lib/expert-prereg`. Sonuç: **Test Files 9 passed, Tests 90 passed (90)**, atlanan yok. Ardından kopya DB silindi (`dropdb`).

**5. Çakışma kontrolü:**
```
git merge-tree --write-tree --name-only origin/dev(2a0aac00) ac61467f → 27997f30, çakışma yok (exit 0); gh: MERGEABLE
(dev+#115) × #92 fo50 → DATA_MODEL.md, apply-order.txt (bunlar #92 ile dev arasında zaten var) + scripts/check-rls-live.ts (#115 kaynaklı, yeni)
```

## Bulgular (önem sırasıyla; hiçbiri bloke etmiyor)
1. **Ö-1 (öneri, birleştirme riski): `scripts/check-rls-live.ts` dosyasının ~951. satırında #92 ile çakışma var.** #115, probe çağrı bloğunun içine `probePurposeTables(...)` ekliyor. #92 ise aynı bloğu `for (const spec of SYSTEM_SCOPE_TABLES)` döngüsüne çeviriyor. İkinci merge eden çakışmayı "FO-50 tarafını al" diye çözerse FO-52 ölçümü rls:verify'dan **sessizce düşer**. Canlı test yine yakalar, ama gate'teki canlı ölçüm kaybolur. Öneri: çözümde döngüden sonra `probePurposeTables` çağrısı kalsın. Merge sonrası rls:verify çıktısında `public-intake:` satırları görünmeli.
2. **Ö-2 (öneri, test gücü): okuma sızıntısı kontrolü veriye bağlı.** `opened()` yalnız `inside > outside` olan tabloları yakalıyor. Boş bir tabloda sızıntı ölçülemez. Öteki amaçların kolunda da `opened(inside).length > 0` şartı yok. CI seed demo kiracıyı eklediği için bugün dolu tablolar var ve AuditEvent yazma kontrolü veriden bağımsız. Yani bugün yanlış yeşil yok. Öneri: en az bir kapsam dışı tabloda `truth > outside` şartı konsun, yoksa "ölçüm boş" diye failure yazılsın.
3. **Ö-3 (bilgi): ExpertFounderCounter listeye tablo var olmadan eklendi.** Tablo #92 (FO-50) ile geliyor ve `to_regclass` sayesinde bugün güvenli. `rls.sql` yorumundaki "the founder-number counter the same verification writes" ifadesi #92 merge olana kadar doğru değil, çünkü dev'deki `verify.ts` `aggregate _max` kullanıyor. Yalnız yorum doğruluğu, davranış etkilenmiyor.
- Kabul edilmiş sınır (bulgu değil): amaç GUC'si USERSET ve mühüre bağlı değil. ADR-0009 §5 ve rls.sql yorumu bunu açıkça yazıyor. Kart da "derinlemesine savunma" kapsamında.

## Değişen dosyalar
- Yalnız bu rapor. Kod değiştirilmedi, merge yapılmadı. Paylaşılan `fabrika` DB'ye yazılmadı (yalnız rls:verify koştu, o da her şeyi geri alıyor). Mutasyon ve testler geçici kopya DB'de koştu, kopya sonra silindi.

## Riskler
- Ö-1: #92 ile merge sırası.
- CI GitHub Actions'ta koşulamadı (runner başlamıyor, 0 adım). Gate kanıtı yerel ölçüme ve se-fb'nin pre-push çıktısına dayanıyor.

## Sonraki adım
- Lider: #115 dev'e merge edilebilir. #92 sonra merge edilecekse Ö-1 notunu be-fb'ye iletin.
