# TASK-MULSEGTKZ7O7D — Pazar yerini kaldırma (fe-fb)

Sprint FB-GAP-1 · Karar: ADR-0005 (`docs/adr/ADR-0005-remove-marketplace.md`) · Dal: `dev` (push yok)

## 1. Ne yapıldı

Pazar yeri kod, çeviri, test, betik, şema ve belgelerden kaldırıldı. Abonelik, plan, eklenti ve faturalama kodu değişmedi. M8 Consortium Matching de değişmedi. Her faz ayrı commit'lendi:

| Faz | Commit                 | İçerik                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `796e6053`             | `src/modules/marketplace/`, `[workspace]/marketplace/`, `[workspace]/pazar-yeri/` silindi. SidebarNav girdisi, `routes.ts` anahtarı, `route-catalog.ts` girdi+alias, `next.config.ts` TR rewrite'ı ve `db-rows.ts` satır tipleri kaldırıldı. **API anahtarı eylemleri** (`generateApiKey`, `revokeApiKey`) değişmeden `settings/api-keys/actions.ts` dosyasına taşındı (api-keys sayfası bunları pazar yeri modülünden import ediyordu).                                |
| C   | `ae1615eb`             | Kartta sayılan 6 test dosyası silindi, `localized-routes.test.ts` içindeki pazar-yeri satırı çıkarıldı. API anahtarı için tenant kapsamı testleri (5 test) `tests/modules/api-keys.test.ts` dosyasına taşındı.                                                                                                                                                                                                                                                          |
| B   | `ec7799b4`             | `messages/{tr,en}.json` içinde `m8` ad alanının tamamı (107 satır/dil) ve `Navigation.marketplace` silindi. Kullanım kontrolü: `m8` çeviri ad alanını yalnız silinen pazar yeri sayfası kullanıyordu (`grep useTranslations/getTranslations`). M8 Consortium Matching kendi ad alanlarını kullanır. `tenant-bypass-baseline.json`: orders.ts girdisi silindi (19→18). i18n betik yorumları ve dedektör örneği güncellendi. `i18n-baseline.json` pazar yeri içermiyordu. |
| D   | `b685214d`             | `MarketplaceListing` ve `MarketplaceOrder` modelleri `schema.prisma`'dan çıkarıldı. Tenant'ta ters ilişki yoktu. `rls.sql` tenant_isolation dizisinden de silindi. Yeni migration'lar: `drop-marketplace.sql` ve `.down.sql`. Eski `add-marketplace-order*.sql` dosyaları olduğu gibi duruyor.                                                                                                                                                                          |
| E   | `aa6a0fef`, `34bc23d4` | README, PROJECT (satır 7, 22, 138), BUSINESS_MODEL, ROADMAP, DATA_MODEL, BILLING §6, RELEASE-NOTES-S12 (tarihsel kayıt; yalnız "kaldırıldı" notu eklendi) ve processing-register güncellendi.                                                                                                                                                                                                                                                                           |

Faz D'ye başlamadan önce `git status prisma/` temizdi. be-fb'nin B1 şema commit'i (`7402c2d7`) zaten girmişti.

## 2. Kanıt

**Veri kontrolü (drop'tan ÖNCE, yerel `fabrika-postgres` localhost:5433):** süper kullanıcı + BYPASSRLS rolüyle sayıldı. Bu rol RLS'e takılmadığı için sayım gerçek.

```
fabrika|t|t            (rolname|rolsuper|rolbypassrls)
 MarketplaceListing |     0
 MarketplaceOrder   |     0
```

Tablolarda veri yoktu. Paylaşılan ya da üretim ortamında HİÇBİR ŞEY uygulanmadı.

**Idempotency + down (yerel DB).** Sıra: drop → drop → down → down → down → drop → drop. Hepsi `exit=0`. Son üç adımın sonucu:

```
## down
tables: MarketplaceListing,MarketplaceOrder
policies: MarketplaceListing.system_scope,MarketplaceListing.tenant_isolation,MarketplaceOrder.system_scope,MarketplaceOrder.tenant_isolation
grants: MarketplaceListing:fabrika_app,MarketplaceOrder:fabrika_app
## drop
tables: (none)   policies: (none)   grants: (none)
## drop again
NOTICE:  table "MarketplaceOrder" does not exist, skipping
NOTICE:  table "MarketplaceListing" does not exist, skipping
exit=0   tables: (none)
```

İkinci down'da `relation ... already exists, skipping` uyarıları geldi ve `exit=0` döndü.

**Kapılar (güncel HEAD `2d94335c`):**

```
typecheck=0  lint=0  i18n=0  bypass=0  rls:verify=0
rls:bypass-check: ✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed ..., 23 on the sanctioned cross-tenant path, 0 still owed.
i18n:check: Literals found: 325 in 37 file(s) / Baseline allows: 325 in 37 file(s) — ✅ i18n check passed
rls:check: CHECK 4b — ✅ SUCCESS (exit 0)
rls:verify: ✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
pnpm db:generate: tamam
```

**Test (`pnpm test`, ortam `node --env-file=.env` ile yüklendi):**

```
Test Files  2 failed | 171 passed | 2 skipped (175)
Tests       3 failed | 1995 passed | 8 skipped (2006)
```

Başarısız 3 test `src/lib/calendar/__tests__/{encryption,sync}.test.ts` dosyalarında. Bu testler takvim şifreleme anahtarının tanımsız olduğunu varsayıyor. `.env` yüklenince anahtar tanımlı hale geliyor ve testler bozuluyor. `.env` yüklenmeden aynı dosyalar `5 passed / 55 passed` veriyor. Bu dosyalara bu görevde dokunulmadı (`git diff cc7dc05e HEAD -- src/lib/calendar` boş). Yeni `tests/modules/api-keys.test.ts` testleri geçiyor (5/5).

**Tarayıcı (gerçek :3000, demo "Platform Yöneticisi" girişi):** kareler `docs/agent-results/TASK-MULSEGTKZ7O7D-evidence/` altında.

- `01-sidebar-no-marketplace.png`: kenar çubuğunda Panel, Çağrılar, Fırsatlar, Ortaklar, İlişkiler, Kanıtlar, TTO, Onay Merkezi, Partner REST API ve Ayarlar var. Pazar yeri yok.
- `02-tr-pazar-yeri-404.png`: `/tr/default/pazar-yeri` → "404 Sayfa Bulunamadı". Karşılaştırma için aynı slug'la `/tr/default/panel` açıldı (h1 "Panel"). `/tr/main/pazar-yeri`, `/tr/default/marketplace` ve `/en/default/marketplace` de 404 döndü.
- `03-m8-consortium-matching.png`: `/tr/main/opportunities/demo-opp-1/matching` açılıyor ("Konsorsiyum Rol Matrisi", 2 koltuk, "Aday Bul" butonları var). "Aday Bul"a bir kez tıklandı ama ekranda görünür bir değişiklik olmadı. `main button` seçicisinin gerçekten o butona denk geldiği doğrulanmadı. Bu nedenle aday hesaplama akışının çalıştığı bu görevde KANITLANMADI; kanıtlanan yalnız sayfanın açıldığı. M8 koduna dokunulmadı (`git diff cc7dc05e HEAD -- src/modules/m8` boş).

**Son grep** (`grep -rniE "marketplace|pazar ?yeri"`; node_modules, .next, agent-results, .agentspace ve .git hariç). Kalanlar:

- ADR: `docs/adr/ADR-0005-remove-marketplace.md`
- Kaldırma notları: BUSINESS_MODEL.md:78, 80, 122 · BILLING.md:313 · ROADMAP.md:116 · DATA_MODEL.md:203 · README.md:3 · PROJECT.md:7, 22 · RELEASE-NOTES-S12.md:131–134, 307–310 (tarihsel madde ve kaldırma notu) · `settings/api-keys/actions.ts:9-10` (taşıma yorumu) · `tests/modules/api-keys.test.ts:25` (taşıma yorumu)
- Migration'lar: `add-marketplace-order{,.down}.sql` (tarihsel) ve `drop-marketplace{,.down}.sql` (yeni)
- Yanlış pozitifler (ürün değil): `docs/BETA_DATA/esr-calibration-samples.csv:43` ve `docs/BETA_DATA/generated/.../beta-*.{txt,html}` içinde bir Horizon örnek proje başlığı geçiyor: "Grid flexibility marketplace pilot". Kalibrasyon verisi olduğu için dokunulmadı.
- Git'te İZLENMEYEN yerel dosyalar (dokunulmadı): `FON_BRIDGE.md` (untracked; satır 97, 107, 136, 1888–1889 pazar yeri ve M11 komisyon içeriyor) · `AB Project SaaS/` (.gitignore:97; BUSINESS_MODEL ve PROJECT'in eski kopyaları) · `test-artifacts/` (.gitignore:66; eski render kareleri).

## 3. Değişen dosyalar

- Silinen: `src/modules/marketplace/server/{actions,listings,orders}.ts`, `src/app/[locale]/(app)/[workspace]/{marketplace/{page,client}.tsx,pazar-yeri/page.tsx}`, 6 test dosyası
- Yeni: `src/app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts`, `tests/modules/api-keys.test.ts`, `prisma/migrations/drop-marketplace{,.down}.sql`, `docs/agent-results/TASK-MULSEGTKZ7O7D-evidence/*.png`
- Değişen: `settings/api-keys/client.tsx`, `SidebarNav.tsx`, `routes.ts`, `route-catalog.ts`, `db-rows.ts`, `next.config.ts`, `messages/{tr,en}.json`, `scripts/{i18n-check,i18n-hardcoded}.ts`, `scripts/tenant-bypass-baseline.json`, `tests/{localized-routes,i18n-hardcoded-detector}.test.ts`, `prisma/{schema.prisma,rls.sql}`, README, PROJECT, `docs/{BUSINESS_MODEL,ROADMAP,DATA_MODEL,BILLING,RELEASE-NOTES-S12}.md`, `docs/legal/processing-register.md`

## 4. Riskler

- **Yerel dışındaki DB'ler:** `drop-marketplace.sql` yalnız yerel DB'ye uygulandı. Başka bir ortama uygulamadan önce oradaki satırlar sayılmalı (dosya başlığında komut var). Down tabloları boş olarak kurar, satırları geri getirmez.
- **Eski Prisma istemcisi:** :3000 sunucusu (pid 3321, 00:57'de başlamış) `db:generate`'ten önce açılmıştı ve yeniden başlatılmadı. Sayfalar pazar yeri tablolarını artık sorgulamadığı için bu sorun çıkarmıyor (tarayıcı testi bunu gösterdi). Yine de temiz bir durum için yeniden başlatılmalı; bkz. §6.
- **BUSINESS_MODEL rakamları:** Veri/API satırı eski birleşik satırın 4/10'u olarak ölçeklendi (Yıl 2 €24 K, Yıl 3 €120 K). Toplamlar €1,07 M ve €3,32 M oldu. Yüzde hedefleri 94 üzerinden oranlanarak %69 / %13 / %14 / %4 yapıldı. Bu mekanik bir yeniden dağıtım, iş kararı değil. MRR ve başabaş yeniden hesaplanmadı (belgede not olarak yazıyor).
- **API anahtarı yolu değişti:** eylemler `@/modules/marketplace/server/actions` yerine `settings/api-keys/actions.ts` altında. Başka import eden yoktu (grep ile doğrulandı).

## 5. Açık sorular

- leed-fb: BUSINESS_MODEL'deki yeniden ölçekleme (%69/13/14/4 ve Veri/API satırı) kabul mü, yoksa patron başka bir dağıtım mı istiyor?
- `FON_BRIDGE.md` git'te izlenmiyor ve pazar yeri/M11 komisyon ifadeleri içeriyor. Takip edilecekse ayrıca düzeltilmeli.
- `.env:58` (`SENTRY_DSN` satırı) zsh'de `source` edilince `parse error near '\n'` veriyor ve sonraki satırlar (ör. `DATABASE_URL_RLS_TEST`) yüklenmiyor. `node --env-file=.env` ile sorun yok. `.env`'e dokunulmadı.

## 6. Sonraki adım

- **leed-fb:** `db:generate` çalıştı. Eski istemciyi bırakmamak için :3000 dev sunucusunu yeniden başlat. Bu görevde sunucu başlatılmadı; kardeş oturumlar isimsiz listelendiği için leed-fb'ye mesaj gönderilemedi.
- Staging veya üretime drop uygulanacaksa önce satır sayımı yapılmalı ve patron onayı alınmalı.
- M8 "Aday Bul" akışı sonraki bir smoke testte doğru butona tıklanarak doğrulanmalı.

## Platform beyanı

Doğrulama **macOS** (Darwin 27, Apple Silicon) üzerinde yapıldı: Next dev :3000, Docker `pgvector/pg16`, AgentSpace iç tarayıcısı. Değişiklikler platformdan bağımsız: TS/JSON/SQL/Markdown dosyaları siliniyor ya da düzenleniyor. Süreç öldürme, dosya yolu, kabuk veya ikili dosyaya bağlı bir kod yolu eklenmedi. Migration'lar düz PostgreSQL SQL'i; Linux CI'da da aynı çalışır. Windows ve Linux'ta ayrıca koşulmadı, çünkü değişen kodun platforma bağlı bir dalı yok.
