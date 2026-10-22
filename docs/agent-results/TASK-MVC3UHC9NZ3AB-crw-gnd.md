# TASK-MVC3UHC9NZ3AB (FO-34) — PR #138 kod incelemesi

**HÜKÜM: ONAY** — bloke eden bulgu yok. Üç notlu öneri var (aşağıda), merge'den önce zorunlu değil.

Kapsam: PR #138 `devop-fb/fo34-system-scope-current-db` → `dev`, tek commit `70b53035` ("fix(ops): system_scope default check looks only at this database (FO-34)"). Dosyalar: `scripts/apply-migrations.sh` (+7/−1), `tests/helpers/test-db-lock.ts` (kilit sabiti silindi), `tests/migration-owner-chain.live.test.ts` (+2 yeni test, kilit çağrısı kaldırıldı). rls.sql, rls:check, rls:verify, rls:bypass-check, package.json ve migration SQL'leri **değişmemiş** (`git show --stat 70b53035`). Kapılar zayıflatılmamış.

## Ne yapıldı

1. Kart (`get_task`) okundu. Kartın gövdesi devop-fb'nin düzeltme işini anlatıyor; delege metni ise crw-gnd'den PR incelemesi istiyor. İnceleme delege metnine göre yapıldı (kart "crw-fb incelesin" diyor — inceleyici ataması farkı not olarak işaretlendi).
2. Diff okundu (`gh pr diff 138`). Filtre semantiği PostgreSQL kurallarıyla karşılaştırıldı (aşağıda).
3. Canlı test ve betik, PR commit'inin `git archive` ile ayrı bir dizine açılmış kopyasında, **izole, tek kullanımlık bir Postgres 16.15 kümesinde** (port 5499) koşturuldu. Ortak `fabrika` DB'sine **yazılmadı**; çalışma ağacı (kirli, başkalarının değişiklikleri var) değiştirilmedi.
4. İki senaryo ve eski/yeni karşılaştırması ham çıktıyla kanıtlandı.

## Kanıt (ham çıktı)

**Senaryo A — varsayılan BAŞKA DB'de (`fo34_other`), hedef `fo34_target`:**
```
$ ALTER DATABASE fo34_other SET app.system_scope = 'on'
$ DATABASE_URL=.../fo34_target bash scripts/apply-migrations.sh
exit=0
apply-migrations: 47 files applied as postgres
```

**Senaryo B — varsayılan HEDEF DB'de (`fo34_target`):**
```
$ ALTER DATABASE fo34_target SET app.system_scope = 'on'
$ DATABASE_URL=.../fo34_target bash scripts/apply-migrations.sh
exit=1
apply-migrations: app.system_scope has a stored default (fo34_target/*); every new session, fabrika_app's included, would skip tenant isolation.
```

**Eski betik (`70b53035^`) aynı senaryo A kurulumunda:**
```
exit=1
apply-migrations: app.system_scope has a stored default (fo34_other/*); ...
```
→ Hata gerçekti (yanlış pozitif); PR bunu düzeltiyor. Yeni betik aynı kurulumda `exit=0`.

**Canlı test (`vitest run tests/migration-owner-chain.live.test.ts`, `DATABASE_URL` izole kümeye):**
```
 Test Files  1 passed (1)
      Tests  15 passed | 5 skipped (20)
✓ a stored default for app.system_scope stops the run before any file
✓ a role-wide default for app.system_scope stops the run before any file
✓ a role in this database default for app.system_scope stops the run before any file
✓ a default stored on another database does not stop the run
```
Atlanan 5 test: `DATABASE_URL_RLS_TEST is not set` (fabrika_app RLS testleri; bu PR'dan bağımsız, ortamda bu URL yok).

## Semantik doğrulama

- Filtre `s.setdatabase IN (0, <bu DB'nin oid'i>)`: `pg_db_role_setting` satırları — `setdatabase=0` rol-genel (her DB'de geçerli), `setdatabase=<bu DB>` bu DB'ye ait (DB-genel ya da rol-bu-DB). PostgreSQL'de `ALTER DATABASE x SET` / `ALTER ROLE r IN DATABASE x SET` yalnız x'e bağlanan oturumlara uygulanır → filtre **yanlış pozitifi** kaldırıyor, **yanlış negatif** üretmiyor (bu DB'de geçerli hiçbir varsayılan dışarıda kalmıyor).
- `current_database()` alt sorgusu tek satır döner; `datname` yoksa (`setdatabase=0`) `d.datname` NULL → `'*'` raporlanır, değişmedi.
- Kilidin (`MIGRATION_OWNER_CHAIN_LOCK`) kaldırılması güvenli: test rolü ve DB adları `RUN` ile benzersiz (`fb_mig_owner_${RUN}`, `fb_owner_chain_${RUN}`), iki worktree birbirinin rolünü görmez. Repoda başka hiçbir test küme-genel (`setdatabase=0, setrole=0`) bir `app.system_scope` varsayılanı yazmıyor (`git grep`: yalnız oturum-düzeyi `set_config`).

## Değişen dosyalar (bu inceleme)

- `docs/agent-results/TASK-MVC3UHC9NZ3AB-crw-gnd.md` (bu rapor) — tek commit'lenen dosya. Kod değişikliği yok.

## Riskler / öneriler (bloke etmez)

1. **[öneri] Tam `pnpm gate` bu incelemede yeniden koşulmadı.** PR gövdesindeki pre-push gate çıktısına (`Tests 4637 passed | 54 skipped`, RLS kapıları SUCCESS) dayanılıyor; kartın DoD'undaki "gate exit 0" maddesi bu rapordan kanıtlanmış değil. CI'da GitHub Actions faturalama nedeniyle çalışmıyor (PR gövdesinde belirtilmiş).
2. **[öneri] RLS-rol testleri bu ortamda atlandı** (`DATABASE_URL_RLS_TEST` yok). Bunlar "migration oturumu sistem kapsamı bırakmıyor" iddiasını test eder; PR bu alana dokunmuyor ama kilit kaldırıldığına göre CI'da bu testlerin gerçekten koştuğu doğrulanmalı.
3. **Kontrol edildi, sorun yok:** `git grep MIGRATION_OWNER_CHAIN_LOCK` ve `system_scope-defaults` (70b53035) — kaldırılan kilidin repoda kalan referansı yok.
4. **Gözlem (ilgisiz):** Prisma `db push` bu oturumda `--accept-data-loss` ile AI-güvenlik korumasına takıldı; boş DB'de bayraksız çalıştı. Canlı testin şema kurulumu (`prisma db push`) bu yüzden ön koşul.

## Platform beyanı

- **Koşulan platform:** macOS (darwin, Apple Silicon), Homebrew PostgreSQL 16.15, `psql`.
- **Linux:** koşulamadı — bu oturumda Linux ortamı yok. Kod yolu POSIX bash + `psql` + SQL; platforma özgü çağrı yok (süreç öldürme, dosya yolu, ikili adı, izin farkı yok), bu yüzden Linux'ta aynı davranışı bekliyorum, ama doğrulanmadı.

## Açık sorular

- Patron/leider: inceleyici ataması kartta **crw-fb** diyor, delege metni **crw-gnd** diyor. Bu rapor crw-gnd'den geldi; hangisi geçerli olduğu belirtilmeli.
- Kart DoD'undaki "gate yeşil" için tam `pnpm gate` koşusu (e2e dahil) istenirse ayrıca koşturulabilir.

## Sonraki adım

PR #138 merge'e hazır (ONAY). Merge yapılmadı (kural gereği). Merge öncesi: öneri 1 ve 2 için CI yeşili ya da yerel gate kanıtı.
