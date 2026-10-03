**Hüküm:** BİTTİ (R-1 geçti)
**Tip:** ops
**Platform:** hepsi (canlı DB) — koşum macOS (darwin arm64) istemcisinden yapıldı; ayrıntı §Platform

# TASK-MUOG51GJ3PUOG — R-1 canlı Supabase koşumu (devop-fb)

Ölçüm: 02.10.2026 11:52 UTC · ağaç `devop-fb/supabase-golive` @ `c4e39bea` · betik sha256 `6c2981fb…7dd2` · istemci psql 16.15 (Homebrew) → sunucu PostgreSQL 17.11, Supabase eu-west-1 pooler (`:5432`, session modu) · rol `fabrika_migrate` (sahip; süper değil, BYPASSRLS değil).
Bağlantı: `/Users/macbook/alan/FONBRIDGE/.env.supabase.local` içindeki `SUPABASE_OWNER_URL`, `set -a; source …` ile yüklendi. Üç URL de `sslmode=verify-full` ve var olan, mutlak yollu bir `sslrootcert` taşıyor (değer basılmadan kontrol edildi).

## 1. Ne yapıldı

1. RELEASE_CHECKLIST §3.1 madde 0a uygulandı: `psql "$OWNER_URL" -X -v ON_ERROR_STOP=1 -f scripts/golive/r1-topicmatch-check.sql`. Betiği koşmadan önce okudum. Yalnız okuyor: `BEGIN READ ONLY` … `ROLLBACK`, içinde yalnız `SET LOCAL app.system_scope='on'` ve SELECT'ler var.
2. Migration durumu salt-okur ölçüldü. Bu repo Prisma migrate kullanmıyor: şema `db push` ile kuruluyor, ek SQL dosyaları da `scripts/apply-migrations.sh` ile idempotent biçimde koşuyor. Bu yüzden ne `_prisma_migrations` tablosu ne de başka bir izleme tablosu var. Onun yerine son 9 migration dosyasının bıraktığı nesneleri tek tek sorguladım (§2.2).
3. `prisma migrate diff --exit-code` ve `prisma migrate status` denendi. İkisi de **P1011** verdi (§2.3, Risk-1).

## 2. Kanıt

### 2.1 R-1 betiği çıktısı (tam, değiştirilmedi)

```
rol=fabrika_migrate db=postgres pg=17.11 read_only=on system_scope=on
tablo_var=t anahtar_var=t opportunity_kolonu_var=t rls_kor=f
--- 1. anahtar: indnullsnotdistinct (beklenen t)
 indnullsnotdistinct
---------------------
 t

--- 2. mükerrer K1 (opportunityId IS NULL) çiftleri (beklenen 0 satır)
 tenantId | topicId | count
----------+---------+-------

mukerrer_cift=0 fazla_satir=0
 kontrol  | sonuc
----------+-------
 R1_SONUC | TEMIZ

ROLLBACK
exit=0
```

**Beklenen ve gerçek sonuç:**

| Kontrol | Beklenen | Gerçek | |
|---|---|---|---|
| İşlem salt-okur | `read_only=on` | `on` | ✔ |
| RLS kapsamı açık, sayım güvenilir | `system_scope=on`, `rls_kor=f` | `on`, `f` | ✔ |
| K1 anahtarı NULLS NOT DISTINCT | `t` | `t` | ✔ |
| Mükerrer K1 çifti | 0 | 0 | ✔ |
| `R1_SONUC` | `TEMIZ` (ya da DB_PUSH_ONCESI/NULLS_DISTINCT) | **`TEMIZ`** | ✔ devam |

**Yorum:** Canlı DB'de şema zaten kurulu. `topicmatch-per-opportunity` migration'ı da uygulanmış, çünkü anahtar NULLS NOT DISTINCT. Bu yüzden §3.1 1. adımdan sonraki "bir kez daha koş" tekrarına bu DB için gerek yok. Uyarı: `TopicMatch` şu an **0 satır** (tablo: Tenant 1, User 1). "Mükerrer 0" sonucu anlamlı, ama veri olmadığı için doğal olarak böyle. Anahtar NULLS NOT DISTINCT olduğu için bundan sonra mükerrer K1 satırı da oluşamaz. R-1 riski bu DB'de kapanmıştır.

### 2.2 Migration durumu (salt-okur, `BEGIN READ ONLY` + `ROLLBACK`)

```
 current_user    | current_database | pg    | ro | su | bypassrls
 fabrika_migrate | postgres         | 17.11 | on | f  | f
 prisma_migrations_tablosu  → (boş: tablo yok — beklenen, db push + apply-migrations.sh düzeni)
 public_tablo_sayisi        → 75
 rls_acik | force_rls       → 53 | 47
 politika_sayisi | system_scope_politika → 112 | 50
 roller: fabrika_app, fabrika_jobs, fabrika_migrate
```

Son eklenen migration dosyaları (git ekleme sırasıyla, en yenisi en üstte) ve her birinin bıraktığı nesne:

```
              dosya               |                    isaret                    | var
----------------------------------+----------------------------------------------+-----
 topicmatch-per-opportunity       | TopicMatch.opportunityId + NND key           | t
 m4-stale-digest-user-claim       | User.staleDigestOn                           | t
 m4-stale-digest-user-claim       | Membership_userId_idx                        | t
 evidence-unique-object-key       | Evidence_tenantId_r2ObjectKey_key            | t
 add-api-key-rate-window          | ApiKey.rateWindowStartedAt                   | t
 m4-stale-reminder-idempotency    | Relationship.staleRemindedContactAt          | t
 k1-embedding-hash                | Topic.embeddingHash                          | t
 relationship-stale-reminded-at   | Relationship.staleRemindedAt                 | t
 add-public-lead                  | PublicLead tablosu                           | t
 revoke-api-role-function-execute | anon public fonksiyon EXECUTE sayısı=0 bekl. | f   ← aşağıda: yanlış alarm
```

`revoke-api-role-function-execute` satırındaki `f` bir eksik migration değil. Benim yazdığım işaret sorgusu fazla genişti. Ayrıntısı:

```
 fonksiyon         | sahip    | acl
 rls_auto_enable() | postgres | {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
 donus=event_trigger  secdef=t
 fabrika_migrate_sahip_anon_exec → 0
```

anon'un çalıştırabildiği tek public fonksiyon, Supabase'in kendi `rls_auto_enable()` olay tetikleyicisi. Sahibi `postgres`. Migration bilerek yalnız kendi rolünün sahip olduğu fonksiyonlara dokunuyor. Bu fonksiyon `event_trigger` döndürdüğü için PostgREST üzerinden RPC olarak çağrılamaz. `fabrika_migrate`'in sahip olduğu fonksiyonlardan anon ya da authenticated'ın çalıştırabildiği sayısı **0**. Yani migration'ın etkisi canlıda yerinde.

**Sonuç:** Son 9 migration'ın hepsinin izi canlıda var. **Eksik migration görülmedi.** Sınır: 78 dosyanın tamamı tek tek doğrulanmadı, yalnız en yeni dokuzu. Şema farkının tam ölçümü Prisma CLI'ya bağlı ve §2.3'teki sorun yüzünden alınamadı.

### 2.3 Prisma CLI: P1011 (macOS istemcisinde)

```
== migrate diff (salt-okur)            → diff_exit=1, stderr: Error: P1011 / Error opening a TLS connection: The certificate was not trusted.
== migrate status
Loaded Prisma config from prisma.config.ts.
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-0-eu-west-1.pooler.supabase.com:5432"
Error: P1011: Error opening a TLS connection: The certificate was not trusted.
```

Aynı URL ve aynı CA ile psql (OpenSSL) doğrulayarak bağlanıyor. Sunucunun sunduğu zincir (`openssl s_client -starttls postgres`, OpenSSL 3.6.5):

```
 0 s:CN=*.pooler.supabase.com            i:CN=Supabase Intermediate 2021 CA   NotBefore: Mar 12 2025; NotAfter: Mar 11 2030
 1 s:CN=Supabase Intermediate 2021 CA    i:CN=Supabase Root 2021 CA           NotBefore: Oct 24 2023; NotAfter: Oct 21 2033
 2 s:CN=Supabase Root 2021 CA            (öz-imzalı)                           NotBefore: Apr 28 2021; NotAfter: Apr 26 2031
openssl verify -CAfile certs/supabase-prod-ca-2021.crt -untrusted <ara> -verify_hostname aws-0-eu-west-1.pooler.supabase.com leaf.pem → OK
Yaprak uzantıları: yalnız SubjectAltName (*.pooler.supabase.com, *.pooler.supabase.co), SKI, AKI — ExtendedKeyUsage YOK, ~1825 gün geçerlilik
```

Zincir de CA da doğru (OpenSSL "OK" diyor). Prisma 7.10 schema engine'i darwin'de sertifikayı macOS Security.framework (native-tls) ile doğruluyor. Apple, Temmuz 2019'dan sonra verilmiş TLS sunucu sertifikalarında `serverAuth` EKU ve en fazla 825 gün geçerlilik şartı arıyor. Supabase yaprağında EKU yok ve geçerlilik yaklaşık 1825 gün. **Bu, olası kök neden (çıkarım).** Uzantılar ve tarihler ölçüldü. Linux'ta engine'in OpenSSL ile kabul edip etmediği **koşulamadı**.

## 3. Değişen dosyalar

- `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb-r1live.md` (bu rapor). Kod ve betik değişmedi.

## 4. Riskler

- **Risk-1 (go-live'ı etkiler):** RELEASE_CHECKLIST §3.1 1. adımı (`prisma db push`) ve ön kontrol (`migrate diff --from-config-datasource`) macOS'tan koşulursa **P1011 ile durur**. Doğrulamasız bağlantıya **geri dönülmemeli**, örneğin `sslaccept=accept_invalid_certs` ya da `--from-url`. Seçenekler:
  - (a) Bu adımları Linux'tan koşmak (CI ya da konteyner). Önce orada P1011 çıkmadığını ölçmek gerekir.
  - (b) Bu DB için zaten gerekli olmayabilir: şema kurulu ve son migration'ların hepsi uygulanmış. Kalan iş `migrate diff` ile tam fark ölçümü.
  - Y-1 testleri özel bir test CA'sıyla yapılmıştı, gerçek Supabase yaprağıyla ölçülmemişti. Bu görevde ilk kez gerçek yaprakla karşılaşıldı.
- Risk-2: `TopicMatch` boş olduğu için R-1 "TEMIZ" sonucu veri üzerinde sınanmadı. Anahtar NND olduğu için ileride mükerrer oluşamaz, bu yüzden risk düşük.
- Risk-3: Migration doğrulaması örneklemeye dayanıyor (en yeni 9 dosya, 78 dosyanın tamamı değil).

## 5. Açık sorular (lider ve patron)

1. §3.1 1. adım bu canlı DB için gerçekten gerekli mi? Şema zaten kurulu, kim ve ne zaman kurdu? Gerekliyse hangi platformdan koşulacak (Risk-1)?
2. P1011 için ayrı bir kart açılsın mı? Kapsam: Linux'ta `migrate diff` ölçümü, darwin için çözüm (ör. CLI'yı konteynerde koşmak) ve RELEASE_CHECKLIST §2.1/§3.1'e not.

## 6. Sonraki adım

- Lider: Risk-1 kararı. Önerim: `migrate diff --exit-code`'u Linux konteynerinden salt-okur koşmak. 0 dönerse 1. adım bu DB için atlanır.
- Canlıya hiçbir şey yazılmadı. Yazma gerektiren bir eksik bulunmadığı için patron onayı da istenmedi.

## Canlıya yazım yapılmadı beyanı

Tüm sorgular `BEGIN READ ONLY` işlemi içinde koştu ve `ROLLBACK` ile bitti. Tek oturum ayarı `SET LOCAL app.system_scope='on'`, yalnız o işlem için geçerli. Hiç DDL, DML, `db push`, `migrate deploy` ya da `apply-migrations.sh` koşulmadı. Prisma CLI'nın iki komutu salt-okur komutlardı ve zaten bağlanamadan durdu.

## Sır sızıntısı kontrolü

URL ve şifre hiçbir çıktıya basılmadı. psql çıktısı ayrıca `postgres(ql)://…` deseninden süzüldü. Ara çıktı dosyaları (scratchpad) `postgres(ql)://|password=` için tarandı ve sonuç boş çıktı. Raporda yalnız herkese açık pooler ana makine adı ve rol adları var.

## Platform

- Koşum: **macOS (darwin arm64)** istemcisi → canlı Supabase. R-1 betiği ve psql platformdan bağımsız: istemci yalnız libpq kullanıyor, Linux ve Windows'ta aynı sonucu verir. Sunucu tarafı ölçüldüğü için sonuç "hepsi (canlı DB)".
- Prisma CLI P1011 **platforma bağlı**. darwin schema-engine'i Security.framework kullanıyor (P1011 gözlendi). Linux'ta OpenSSL kullanıyor: **koşulamadı**, çünkü bu makinede Linux engine'i yok ve görev kapsamı dışında. Windows'ta SChannel kullanıyor: **koşulamadı**, EKU'suz yaprağı reddetmesi olası (çıkarım).

## 7. Yeniden koşum — 03.10.2026 14:25 UTC (TASK-MUOG51GJ3PUOG#r1-check)

Aynı betik (sha256 `6c2981fb…7dd2`, `origin/dev` ile aynı) aynı canlı DB'ye karşı yeniden koşuldu: `fabrika_migrate`, PG 17.11, `default_transaction_read_only=on` + `BEGIN READ ONLY … ROLLBACK`.

```
rol=fabrika_migrate db=postgres pg=17.11 read_only=on system_scope=on
tablo_var=t anahtar_var=t opportunity_kolonu_var=t rls_kor=f
indnullsnotdistinct = t · mukerrer_cift=0 fazla_satir=0
R1_SONUC | TEMIZ
ROLLBACK · exit=0 · bağlam: topicmatch=0 tenant=1 user=1
```

Hüküm: **GO** (§3.1 0a). Tam kanıt `TASK-MUOG51GJ3PUOG-devop-fb-r1-check.md` dosyasında. Canlıya yazım yapılmadı.
