**Hüküm:** BİTTİ — Risk-1 Linux'ta ölçüldü.
- **Linux (glibc, OpenSSL 3.0):** Prisma CLI canlı Supabase'e TLS doğrulamasıyla bağlanıyor. `migrate diff` "No difference detected" ve exit 0 döndü.
- **macOS:** P1011 hâlâ var.

**Tip:** ops

**Platform:**
- Linux: Debian 12 bookworm, arm64, Docker 29.7.2 içinde. Koşuldu.
- macOS: Darwin arm64. Koşuldu, P1011 verdi.
- Linux musl (alpine): koşulmadı. CI Ubuntu (glibc) kullanıyor.
- Windows: koşulmadı. Bu makinede yok.

# TASK-MUOG51GJ3PUOG — Risk-1: Prisma CLI P1011, Linux ölçümü (devop-fb)

Ölçüm: 03.10.2026 14:36 UTC · ağaç `devop-fb/supabase-golive` @ `4be2c6b5` (`git archive`, `.env` yok) · prisma 7.10.0 · schema engine `0edf323e`.

## 1. Ne yapıldı

1. Repo, `git archive HEAD` ile `node:22-bookworm-slim` konteynerine kopyalandı. Kopyada `.env` yoktu.
2. Imajda libssl yoktu; `apt-get install openssl ca-certificates` ile kuruldu (OpenSSL 3.0.22). Engine'in hangi derlemesinin seçildiği ölçüldü: `schema-engine-linux-arm64-openssl-3.0.x`.
3. Bağımlılıklar `pnpm install --frozen-lockfile` ile kuruldu.
4. `DATABASE_URL`, `--env-file` ile verildi (`ps`'te görünmez, dosya izni 600). Değeri `SUPABASE_OWNER_URL`; yalnız `sslrootcert` konteynerdeki yola çevrildi. URL'ye `prisma.config.ts` → `toPrismaCliUrl` dönüşümü uygulandı ve parametre adları basıldı.
5. Salt-okur komut koşuldu: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. Shadow DB kullanılmadı; canlıya yazım yok.
6. **Kontroller:** Başarılı bir bağlantının gerçekten doğrulamadan geçtiğini kanıtlamak için iki negatif deneme yapıldı:
   - yanlış CA (öz-imzalı, rastgele)
   - yanlış ana makine adı (`yanlis-ad.example.com`, `/etc/hosts` ile aynı pooler IP'sine yönlendirildi)
7. Aynı komut macOS host'unda da koşuldu (karşılaştırma).
8. Konteyner silindi. Env dosyaları ve geçici anahtar silindi.

## 2. Kanıt

### 2.1 Linux — doğru CA (3 koşum)

```
cli_url host=aws-0-….pooler.supabase.com params=sslmode=require&sslaccept=strict&sslcert=/w/app/certs/supabase-prod-ca-2021.crt
exit=0
Loaded Prisma config from prisma.config.ts.
tekrar exit=0  → No difference detected.
tekrar exit=0  → No difference detected.
```

### 2.2 Linux — yanlış CA (negatif kontrol)

```
cli_url … params=sslmode=require&sslaccept=strict&sslcert=/w/app/certs/wrong-ca.crt
exit=1
Error: P1011
Error opening a TLS connection: error:0A000086:SSL routines:tls_post_process_server_certificate:certificate verify failed:../ssl/statem/statem_clnt.c:1889: (self-signed certificate in certificate chain)
```

### 2.3 Linux — yanlış ana makine adı, aynı IP (negatif kontrol)

```
cli_url host=yanlis….example.com params=sslmode=require&sslaccept=strict&sslcert=/w/app/certs/supabase-prod-ca-2021.crt
exit=1
Error: P1011
Error opening a TLS connection: … certificate verify failed … (hostname mismatch)
```

### 2.4 macOS host — aynı komut, aynı CA

```
mac exit=1
Error: P1011
Error opening a TLS connection: The certificate was not trusted.
Darwin arm64 · Schema Engine … schema-engine-darwin-arm64
```

### 2.5 Yorum

- **Linux engine doğrulamayı gerçekten yapıyor.** Hem zinciri hem ana makine adını denetliyor: §2.2 ve §2.3 reddedildi. Doğru CA ile bağlanıyor (§2.1). Exit 0, "doğrulamasız geçti" anlamına gelmiyor.
- **macOS'taki hata darwin engine'ine özgü.** Aynı CA ve aynı sunucu Linux'ta kabul ediliyor. 02.10'daki çıkarım (Apple Security.framework: EKU yok, geçerlilik süresi 825 günü aşıyor) bu ölçümle tutarlı. Kök neden yine çıkarım düzeyinde; Apple tarafında ayrıca ölçülmedi.
- **`migrate diff` "No difference detected" dedi.** Canlı şema `prisma/schema.prisma` ile aynı. §3.1 madde 1 (`db push`) bu DB'de bir değişiklik yapmayacak.

## 3. Değişen dosyalar

- `docs/agent-results/TASK-MUOG51GJ3PUOG-devop-fb-p1011-linux.md` (bu rapor)

Kod, betik ve canlı DB değişmedi.

## 4. Riskler

- **Önceki `-risk1.md` raporu:** Oradaki "Linux'ta exit 0" iddiası artık ölçülerek desteklendi. Ancak o rapordaki kanıt (bağlantı çıktısı yok) hâlâ geçersiz. Geçerli kanıt bu rapordur.
- **Commit edilmemiş RELEASE_CHECKLIST notu** (§3.1 madde 1, bu ağaçta) **olduğu gibi kullanılmamalı.** Örnek docker komutunda üç sorun var:
  - Repo `/src`'ye bağlanıyor, CA ise `/build/app/certs/…` yolunda bekleniyor; yollar tutarsız.
  - `node:22-alpine` musl kullanıyor ve burada ölçülmedi.
  - Slim/alpine imajda openssl kurulumu eksik.

  Doğru biçimi (ölçülen yol):

  ```
  docker run --rm --env-file <600 izinli dosya: DATABASE_URL=…&sslrootcert=/w/app/certs/supabase-prod-ca-2021.crt> \
    -v <git archive kopyası>:/src:ro node:22-bookworm-slim sh -c '
    apt-get update -qq && apt-get install -y -qq openssl ca-certificates &&
    cp -r /src /w/app && cd /w/app && npm i -g pnpm@11.25.0 &&
    CI=true pnpm install --frozen-lockfile &&
    pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code'
  ```

  Not düzeltmesi bir doküman değişikliği; lider onayı bekliyor.
- **Bulut dışı yol:** Bu yol Docker Hub'a ve npm'e erişim ister. İndirme yaklaşık 60 saniye sürdü.

## 5. Açık sorular

1. **`db push` (madde 1) bu DB için koşulacak mı?** Fark yok, yani koşsa da değişiklik yapmayacak. Ya "atlanır" diye işaretlenir, ya da Linux konteynerinden koşulur. Karar lider ve patronun.
2. **RELEASE_CHECKLIST notu:** §4'teki ölçülmüş komutla düzeltilsin mi?

## 6. Sonraki adım

- Lider: madde 1 kararı ve checklist notu.
- Canlıya hiçbir şey yazılmadı.

## Sır sızıntısı kontrolü

- URL ve şifre basılmadı.
- Çıktılar `postgres(ql)://` desenine göre süzüldü.
- `out/` dosyalarında `postgres(ql)://|password=` taraması 0 dosya buldu.
- Env dosyaları ve geçici anahtar silindi. Konteyner silindi (`docker ps -a` 0).
