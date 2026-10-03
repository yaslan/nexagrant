**Hüküm:** GO (R-1 / RELEASE_CHECKLIST §3.1 madde 0a geçti: `R1_SONUC | TEMIZ`)
**Tip:** ops
**Platform:** mac (darwin arm64 istemci, psql 16.15) → canlı Supabase (PostgreSQL 17.11). Betik yalnız libpq/psql kullanıyor, Linux ve Windows istemcisinden de aynı sonucu verir (sonuç sunucu tarafında üretiliyor). Linux/Windows'tan koşulmadı, gerek yok.

# TASK-MUOG51GJ3PUOG#r1-check — R-1 canlı DB kontrolü (devop-fb)

Ölçüm: 03.10.2026 14:25 UTC · ağaç `devop-fb/supabase-golive` @ `db7262f5` · betik sha256 `6c2981fb…7dd2` (`origin/dev`'deki ile aynı; hazırlık commit'i `65c7637c` dev'de).

## 1. Ne yapıldı

1. **(a) Canlı DB var mı?** Var.
   - Bağlantı dosyası: `FONBRIDGE/.env.supabase.local` (izin 600). İçinde 3 değişken var: `SUPABASE_OWNER_URL`, `SUPABASE_APP_URL`, `SUPABASE_JOBS_URL`. Değerler basılmadı.
   - Ana makine maskeli olarak `aws-0-….pooler.supabase.com:5432` (Supabase eu-west-1 pooler, session modu). DB `postgres`, rol `fabrika_migrate` (sahip; süper kullanıcı değil, BYPASSRLS yok). `sslmode=verify-full`, CA dosyası mevcut.
   - AgentSpace Supabase entegrasyonuna soruldu. Entegrasyon bağlı, ama kapsamı `dev`, beyan edilen izni `projects:read` ve son denemesi (17.09) başarısız. Bu kontrol için entegrasyon kullanılmadı, gerek de yoktu: bağlantı yukarıdaki yerel env dosyasından yapıldı.
2. **(c) Betik salt-okur mu?** Evet (kanıt §2.1).
3. **Koşum** iki ayrı salt-okur kilitle yapıldı:
   - `PGOPTIONS='-c default_transaction_read_only=on'` (oturum düzeyi)
   - betiğin kendi `BEGIN READ ONLY … ROLLBACK` bloğu
4. Bağlam için ayrıca satır sayıları salt-okur işlem içinde ölçüldü.
5. **(d)** Sonuç 0a ölçütüne göre değerlendirildi: **GO**.

## 2. Kanıt

### 2.1 Salt-okur doğrulaması (`/usr/bin/grep`, ugrep değil)

```
== yazma/DDL arama (yorum satırları hariç): insert|update|delete|truncate|create|alter|drop|grant|revoke|copy|vacuum|reindex|cluster|comment|merge|call|do|lock
(boş)  exit=1
== işlem sınırları ve SET:
35:BEGIN READ ONLY;
36:SET LOCAL app.system_scope = 'on';
102:         END AS sonuc;      ← CASE … END, işlem sonu değil
108:ROLLBACK;
pozitif kontrol: aynı desen 'INSERT INTO x;' satırında 1 eşleşme verdi; betikte 14 SELECT satırı var
```

Betikte tek ayar `SET LOCAL app.system_scope='on'`. Bu ayar yalnız o işlem için geçerli; FORCE RLS altında satırları görebilmek için gerekli.

### 2.2 R-1 betiği çıktısı (tam; URL süzgecinden geçirildi, süzgeç 0 eşleşme buldu)

```
2026-10-03 14:25:47 UTC
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

### 2.3 Bağlam (salt-okur)

```
ro=on topicmatch=0 tenant=1 user=1
ROLLBACK
```

## 3. §3.1 madde 0a ölçütüne göre hüküm

| Ölçüt | Beklenen | Gerçek | |
|---|---|---|---|
| İşlem salt-okur | `read_only=on` | `on` | ✔ |
| RLS sayımı güvenilir | `rls_kor=f`, `system_scope=on` | `f`, `on` | ✔ |
| K1 anahtarı NULLS NOT DISTINCT | `t` | `t` | ✔ |
| Mükerrer K1 çifti | 0 | 0 | ✔ |
| `R1_SONUC` | `TEMIZ`, `DB_PUSH_ONCESI` ya da `NULLS_DISTINCT` → devam; `DUR_MUKERRER` / `RLS_KOR` → dur | **`TEMIZ`** | ✔ |

**GO.** Sonuç 02.10.2026 koşumuyla (`-r1live.md`) aynı. `topicmatch-per-opportunity` migration'ı canlıda uygulanmış durumda, çünkü anahtar NND. Bu yüzden ileride mükerrer K1 satırı oluşamaz.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb-r1-check.md` (bu rapor)
- `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb-r1live.md` (§7 olarak bugünkü yeniden koşum eklendi)

Kod, betik ve canlı DB değişmedi.

## 5. Riskler

- **R-2:** `TopicMatch` 0 satır. "TEMIZ" sonucu gerçek veri üzerinde sınanmış değil. Anahtar NND olduğu için risk düşük.
- **Risk-1 (0a'yı etkilemez, 1. adımı etkiler):** Prisma CLI macOS'ta canlı Supabase'e P1011 veriyor. `-risk1.md` raporundaki "Linux konteynerinde çözüldü, exit 0" iddiası incelemede **reddedildi**, çünkü çıktıda bağlantı kanıtı yoktu. Bu iddia hâlâ doğrulanmamış durumda.
- Bu ağaçta `docs/RELEASE_CHECKLIST.md` için **commit edilmemiş** bir değişiklik var: §3.1 madde 1'e "Linux konteynerinden koşun" notu ve bir docker komutu eklenmiş. Not, doğrulanmamış iddiaya dayanıyor. Bu görevin kapsamı "kod değiştirme" olduğu için o dosyaya dokunulmadı ve commit'e girmedi. Lider karar vermeli: atılsın mı, yoksa Linux ölçümü yapıldıktan sonra mı girsin?

## 6. Açık sorular

1. 1. adım (`db push`) bu canlı DB için gerekli mi, gerekliyse hangi platformdan koşulacak? Risk-1 açık.
2. Yukarıda anılan, commit edilmemiş RELEASE_CHECKLIST notu ne olacak?

## 7. Sonraki adım

- 0a kutusu işaretlenebilir (GO). §3.1'de sıradaki adım 1 (`db push`). Bu adım Risk-1 kararına bağlı (lider/patron).
- Canlıya hiçbir şey yazılmadı. Migration, seed ya da düzeltme yapılmadı.

## Sır sızıntısı kontrolü

URL ve şifre hiçbir çıktıya basılmadı. Ana makine maskeli verildi. psql çıktısı `postgres(ql)://|password=` deseniyle tarandı, 0 eşleşme çıktı. Ara dosya yalnız oturumun scratchpad dizininde duruyor.
