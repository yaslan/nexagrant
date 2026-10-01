Hüküm: Bitti: İNCELEME-122 Ö-6 kapandı. B5 belgesindeki GRANT paragrafı depodaki boru hattına göre düzeltildi ve düzeltilmiş blok gerçek Postgres'te ölçüldü. Yalnız belge değişti, kod yok.
Platform: mac (Darwin, Docker `postgres:16`, `fabrika` SUPERUSER; compose ile aynı). Linux/Windows koşulmadı: belge değişikliği, kod yolu yok; SQL platformdan bağımsız.

# TASK-MUOEJVUECL28A fe-fb-4 — B5 tasarım, GRANT paragrafı (Ö-6)

## 1. Ne yapıldı
`docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md` §4.1 "`AgencyDomainEdgeState` yazma yetkisi" paragrafı. Eski blok depodaki boru hattında üç yerden çalışmıyordu:
1. `fabrika_app` zaten yazabiliyor: `prisma/rls-app-role.sql:59` mevcut tablolara, `:62-76` sahip rollerin yeni tablolarına SELECT/INSERT/UPDATE/DELETE verir. Eski blokta yalnız `GRANT SELECT` vardı; GRANT daraltmaz. Eklendi: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE … FROM fabrika_app`.
2. `pnpm db:rls-role` yeniden koşunca (`rls-app-role.sql:59`) REVOKE geri alınıyor. Belgeye yazıldı; kalıcı çözüm iki seçenekle uygulama kartına bırakıldı (öneri: adım 3'ten bu tabloyu çıkarmak, kod).
3. `fb_edge_sync` rolünü depoda hiçbir betik açmıyor; çıplak `GRANT` rol yoksa zinciri durduruyor. Blok, depo desenine (`add-public-lead.sql:49-54`, `add-agency-funnel.sql:84-89`) uygun `IF EXISTS (pg_roles)` korumasına alındı; rol açma adımı uygulama kartına yazıldı.
Çelişkiyi kapatmak için §4.1'deki eski "fabrika_app INSERT → permission denied" cümlesi koşula bağlandı.

## 2. Kanıt (ölçüm, `postgres:16`, `rls-app-role.sql` koşmuş DB)
```
A. fb_edge_sync yok, eski blok : ERROR: role "fb_edge_sync" does not exist  (tablo yarım kaldı)
B. eski blok, rol var          : fabrika_app INSERT/UPDATE/DELETE = t|t|t ; gerçek INSERT başarılı
C. + REVOKE FROM fabrika_app   : f|f|f
D. db:rls-role yeniden         : t|t|t   (REVOKE geri alındı)
Düzeltilmiş blok:
 rol yok     -> exit 0
 rol var, 2. koşu -> exit 0 (idempotent)
 sel|ins|edge_ins = t|f|t ; fabrika_app INSERT -> ERROR: permission denied for table AgencyDomainEdgeState
 rls-role tekrar sonrası = t|t|t (belgede madde 2 olarak yazılı)
```
Dayanılan depo satırları: `prisma/rls-app-role.sql:59, 62-76`; `prisma/migrations/add-public-lead.sql:49-54`; `add-agency-funnel.sql:84-89`; `scripts/apply-migrations.sh` (ON_ERROR_STOP=1, dosya başına psql); `docs/RELEASE_CHECKLIST.md:133`; `.env.example:21`.

## 3. Değişen dosyalar
`docs/kamu/B5-BEYAZ-ETIKET-TASARIMI.md`, bu rapor. Ölçüm konteyneri `--rm` ile durduruldu.

## 4. Riskler
- Madde 2 çözülmeden `db:rls-role` tek başına koşulursa DB kısıtı düşer. Bugünkü web bağlantısı SUPERUSER olduğundan zaten zorlanmıyor (L3); risk NOSUPERUSER'a geçişte etkin olur.
- `fabrika_migrate` rolünün canlıda gerçekten sahip olup olmadığı depoda doğrulanamadı (yalnız `.env.example`).

## 5. Açık sorular
Madde 2 için seçenek (rls-app-role.sql istisnası mı, checklist zorunluluğu mu) uygulama kartında karara bağlanmalı.

## 6. Sonraki adım
Dal `fe-fb/b5-design-rev3` merge'e hazır. Push yok; worktree kaldırıldı.
