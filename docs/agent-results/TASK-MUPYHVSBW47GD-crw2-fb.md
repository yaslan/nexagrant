---
görev: TASK-MUPYHVSBW47GD
ajan: crw2-fb
tip: güvenlik incelemesi (bağımsız)
hüküm: ONAY — bloke eden bulgu yok. Ö-1..Ö-4 öneri.
platform: mac (Darwin 27, Homebrew PostgreSQL 16.15 + pgvector 0.8.1, yalıtılmış scratch küme 127.0.0.1:55471, detached worktree ff9c283e). Canlı Supabase yalnız `BEGIN READ ONLY … ROLLBACK` ile okundu, yazma yok. Linux CI aynı adımları koşar; Windows koşulmadı (apply-migrations.sh bash, değişiklik SQL + vitest, platforma bağlı kod yolu yok).
tarih: 2026-10-01
---

# Hüküm: ONAY (Ö-1..Ö-4 öneri, bloke eden yok)

İncelenen: devop-fb `a617188a` (merge `ff177df7`) ve be-fb'nin testi `91e93717` (merge `1d2c54f3`). Kod değiştirmedim.

## 1. Ne yapıldı / kontrol sonuçları

| # | Kontrol | Sonuç |
|---|---|---|
| 1 | 5 dosyada `set_config('app.system_scope','on',true)` işlem-yerel mi? Çağıranın değeri her çıkışta dönüyor mu? | **Evet.** 4 son fonksiyonun her `RETURN`'ü ve son `END`'i öncesinde `coalesce(scope_was,'')` geri yükleniyor. Canlıda gövdede 2 geri yükleme var, `is_local=true`. |
| 1b | EXCEPTION bloğu gereksiz mi? Çağıranın savepoint'i ya da PL/pgSQL EXCEPTION bloğu varsa ne olur? | **Gereksiz, doğru.** Hata fonksiyon kapsamı açtıktan *sonra* fırlatıldı (`probe inside: scope=on`). P1 SAVEPOINT → `ROLLBACK TO` sonrası `off` döndü. P2 DO + EXCEPTION'da handler içinde ve blok sonrasında değer `[]`, yani unset korundu. Alt-işlem geri alması GUC'yi de geri alıyor. |
| 1c | Autocommit + oturum değeri | P3: oturumda `xyz` iken redeem/funnel/note çağrıldı, sonraki ifadede değer yine `xyz`. |
| 2 | SECURITY DEFINER + `SET search_path` | Korunmuş. Yerelde ve canlıda `prosecdef=t`, `proconfig={"search_path=public, pg_temp"}`. `app.*` proconfig'de yok. |
| 2b | EXECUTE kimde (R-S2) | **Canlı:** sahip `fabrika_migrate`. `proacl={fabrika_migrate=X, fabrika_app=X}`. `anon`, `authenticated`, `authenticator` ve `service_role` için `has_function_privilege` = **f** (4 fonksiyonun hepsi). Supabase'in `postgres`/`supabase_admin` için tanımlı varsayılan ACL'i bu fonksiyonlara uygulanmadı, çünkü sahip onlar değil (bkz. Ö-2). |
| 3 | ADR-0009 ile tutarlılık; fabrika_app doğrudan SET yapabiliyor mu | Mühürlü politika değişmedi. P5: fabrika_app düz `SET LOCAL app.system_scope='on'` → Membership **0** satır. P6: `has_parameter_privilege` = f, `CREATE FUNCTION … SET app.system_scope` → `permission denied to set parameter "app.system_scope"`. P4: mühürlü kapsamda (11 satır) definer çağrıları bayrağı değiştirmedi. ADR metni eski (Ö-3). |
| 4 | apply-migrations.sh / migration-owner-grant.sql yetki gevşetiyor mu | **Gevşetmiyor.** Ön kontrolden yalnız `SET ON PARAMETER` şartı kalktı, yerine başlıkta clause arayan grep geldi. Oturum düzeyi `SET app.system_scope='on'` dosya başına psql süreciyle aynı kaldı. Kalıcı varsayılan kontrolü pre+post duruyor. `migration-owner-grant.sql` bir **GRANT** dosyasıydı; silinmesi yetki daraltır. Rollback dosyası yalnız REVOKE. Kalan iki referans "kaldırıldı" notu (RELEASE_CHECKLIST §154, rollback başlığı). Canlıda `stored_scope_defaults = 0`. |
| 5 | Testler | Temiz PG16 zinciri: db push → rls-role → apply ×2 (**41 files applied**, exit 0 ×2) → db:rls (28→112 politika) → seed → **rls:verify exit 0**. `migration-owner-chain` + agency-invite + agency-funnel + system-scope: **4 dosya, 60/60 geçti**. Mutasyon sonuçları aşağıda. |

## 2. Kanıt

Ekler `docs/agent-results/TASK-MUPYHVSBW47GD-crw2-fb-ekler/` altında: `temiz-pg16-zincir.txt`, `probe.sql`, `probe-setup.sql`, `probe-cikti.txt`, `known.sql`, `mutantlar.txt`, `canli-salt-okuma-acl.txt` (bağlantı dizesi basılmadı).

```
P1 after ROLLBACK TO | off          (hata içeride: "probe inside: scope=on")
P2 caught: probe inside: scope=on | scope in handler=[]   ;  P2 after inner block scope=[]
P3 after redeem | xyz ; P3 after funnel | xyz ; P3 after note | xyz
P4 sealed_on_rows 11 → off → definer çağrıları → flag_after off, off_rows_after 0
P5 plain_set_rows 0 ; P6 app_can_set_param f, ERROR: permission denied to set parameter "app.system_scope"
```

Canlı, salt-okuma (`current_user=fabrika_migrate, su=f, transaction_read_only=on`). Kaynak md5'leri yerelde dev'den kurulan fonksiyonlarla **birebir aynı**:
```
agency_funnel_counts 360f302a… | _by_province 36291825… | note_agency_invite_rejection 9fefa222… | redeem_agency_invite 31dccd5a…
```

Mutantlar (yalnız owner-chain testi koşuldu):

| Mutant | Sonuç |
|---|---|
| M2 redeem `'on', false` | KILLED |
| M3 province son geri yükleme silindi | KILLED |
| M4 redeem erken-RETURN geri yüklemesi silindi | KILLED |
| **M1** note **bilinen kod** dalında RETURN öncesi geri yükleme silindi | **SURVIVED** (12/12) |
| **M5** note `'on', false` (oturum düzeyi) | **SURVIVED** (12/12) |

M1'in etkisini elle ölçtüm. Gerçek kodda bilinen-kod çağrısından sonra değer `off` dönüyor. Mutantta `on` sızıyor; mühür alınmış ve sonra `off` yazılmış bir işlemde bu sızıntı Membership'in **11** satırını açıyor.

## 3. Bulgular

**Bloke eden (Y-): yok.** Kod bugün doğru. Canlıdaki tanımlar repo ile aynı.

- **Ö-1 (test boşluğu, orta).** `note_agency_invite_rejection`'ın iki yolu teste görünmüyor: bilinen kodun AuditEvent dalı (`agency-invite-no-max-uses.sql:144`) ve normal çıkışın COMMIT ile ölçülmesi. Testler note'u yalnız bilinmeyen kodla çağırıyor. Bu çağrı ya hata yoluna düşüyor (ROLLBACK TO) ya da `BEGIN…ROLLBACK` içinde kalıyor. M1 ve M5 o yüzden yaşıyor. Gelecekte bu satırı düşüren bir düzenleme fark edilmez.
  - Etki sınırlı. Sızan `on` fabrika_app'e mühürsüz hiçbir şey açmıyor (P5). Satır açması için mühür alınıp sonra bayrağın `off` yapılması gerekiyor, uygulamada böyle bir yol yok.
  - Düzeltme (be-fb testi): fixture'a iptal edilmiş/tükenmiş bir kod ekleyin, `note(<o kodun hash'i>)` çağırın, `scope()` değerinin `prev` olduğunu doğrulayın. Bir de note'un başarılı çağrısını COMMIT ile biten bir işlemde koşup sonrasında oturum değerine bakın.
- **Ö-2 (R-S2 sertleştirme, düşük).** Dosyalar yalnız `REVOKE ALL … FROM PUBLIC` yapıyor. Supabase'de `postgres` için tanımlı varsayılan ACL `anon=X, authenticated=X` veriyor (canlıda ölçüldü). Zincir bir gün `fabrika_migrate` yerine `postgres` ile ilk kez koşulursa, 4 definer fonksiyonu Data API RPC'si üzerinden anonim çağrılabilir olur. Bu durumda `note_*` SystemAlert/AuditEvent spam'ine, `redeem_*` hash bilinen kodun yakılmasına açık kalır.
  - Bugün canlıda risk yok (f).
  - Öneri: varsa `anon` ve `authenticated` için korumalı `REVOKE EXECUTE` ekleyin, ya da `rls:verify`/apply postflight'a "definer fonksiyonlarında fabrika_app ve sahip dışında EXECUTE yok" kontrolü koyun.
  - Bu değişiklikten önce de vardı; bu diff getirmedi.
- **Ö-3 (belge kayması).** `docs/adr/ADR-0009-signed-system-scope.md:15` hâlâ "dört SECURITY DEFINER fonksiyon fonksiyon düzeyinde `SET app.system_scope = 'on'` taşıyor" diyor. `rls.sql` ve RELEASE_CHECKLIST güncellenmiş, ADR güncellenmemiş. Tek satırlık bir "değişti: TASK-MUOG51GJ3PUOG, gövde içi set_config" notu yeter.
- **Ö-4 (betik, düşük).** Ön kontroldeki grep (`apply-migrations.sh`) yalnız `SET app.system_scope =|TO` biçimini yakalıyor. Tırnaklı `SET "app.system_scope" = 'on'` ya da aynı satırda `;` içeren bir yorum gözden kaçar. Sonuç güvenlik açığı olmaz: dosya yetkisiz sahipte `permission denied` ile durur. Ama zincir eski "yarım kalma" haline döner. Owner-chain testi bu durumu yakalıyor, dolayısıyla öncelik düşük.

## 4. Değişen dosyalar
Yalnız bu rapor ve ekleri. Kod, test ya da migration değişmedi. Yerel scratch küme durduruldu, worktree kaldırıldı.

## 5. Riskler
- Supavisor transaction modu ayrıca ölçülmedi. Fonksiyonlar `is_local=true` kullandığı ve P3 autocommit'te sızıntı olmadığı için havuz modundan bağımsız olmaları beklenir. Bu bir varsayım.
- PG17'yi koşmadım. devop-fb PG17'de yeşil raporladı.

## 6. Açık sorular
- Ö-1 testi kimde: be-fb mi, qae-fb mi?
- Ö-2 sertleştirme go-live koşuluna mı eklensin, yoksa kart mı açılsın?

## 7. Sonraki adım
Merge/canlı açısından engel yok. Ö-1'i ayrı küçük bir test kartı olarak açmanızı öneririm, Ö-2 ve Ö-3 Data API go-live öncesine alınmalı.
