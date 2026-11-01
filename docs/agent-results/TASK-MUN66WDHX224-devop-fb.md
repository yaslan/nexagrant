# TASK-MUN66WDHX224 — FB CANLI HAZIRLIK-3: canlı çıkış kontrol listesi gerçeğe karşı (devop-fb)

Sprint FB-GAP-1 · dal `dev` · **canlıya hiçbir şey yazılmadı** (yalnız yerel dosya okuma + salt-okur `dig`).

## 1. Ne yapıldı

`docs/RELEASE_CHECKLIST.md` 09.09 sürümünden (12 düz migration, eski marka) **baştan yazıldı**: 29–30.09 kararlarına göre (fonbridge.com, Vulut, SMTP A, graphile-worker, kaldırılan servisler, LLM, Google OAuth, ücretsiz pilot, 12 ay form saklama) her madde **HAZIR / EKSİK / PATRON** + kanıtla. Bölümler: §0 kararlar · §1 özet tablo · §2 env · §3 migration + geri dönüş + web/worker sırası · §4 yedek/DR · §5 izleme · §6 push/CI · §7 notlar · §8 patronun 14 adımlık tek sıralı listesi. Eski listenin hâlâ geçerli kısımları (davet kodu penceresi K-6, silme alarmı, `alertRepeatCount`) yeni bölümlere taşındı.

Öne çıkan bulgular (yeni):
1. **DNS hâlâ yok** — `fonbridge.com` bölgesi ns1/ns2'de `REFUSED` (29.09 21:43 UTC).
2. **Uygulama sunucusu belirsiz** — 77.92.144.187 paylaşımlı cPanel/Exim; web+worker+Postgres/pgvector'ün orada koşup koşamayacağı ölçülmedi, `<APP_IP>` yok → patron adımı 1.
3. **R2 boşsa yüklemeler sessizce kaybolur** — `src/lib/storage.ts:82` "Dev Mode Fallback" sahte presigned URL döner; üretimde de. `.env.example` `R2_BUCKET=fabrika` ↔ kod varsayılanı `fonbridge-evidence`.
4. **Yedekleme yok** — repoda `pg_dump`/geri yükleme betiği ya da belgesi yok; plan + geri yükleme testi yazıldı (`fabrika_app` RLS yüzünden yedek rolü olamaz — boş yedek).
5. **SystemAlert kimseye ulaşmıyor** — yalnız `/[locale]/admin/alerts` (pull); e-posta/push yok, dış kalp atışı yok (ADR-0008 §9.3 de "henüz yok" diyor).
6. **Yerel pre-push kapısı ölü** — `core.hooksPath` = `/Users/macbook/AgentSpace/fabrika/githooks` (dizin yok) → `githooks/pre-push` (`pnpm gate`) push'ta koşmaz.
7. `dev` origin'den **223 commit** ileride; CI GitHub sırrı istemiyor.
8. 3 migration'ın down dosyası yok (`credit-ledger-grant-period.sql` — geri dönüş başlık yorumunda; `add-calendar-connections`, `add-m9-meeting-schedule`).
9. 14 ölü `.env.example` anahtarı (kodda okunmuyor; ör. `EMBEDDING_MODEL` değiştirmek hiçbir şeyi değiştirmez). `BETA_SUPPORT_EMAIL` varsayılanı `support@fabrika.dev` (eski marka).
10. `src/lib/llm.ts:85` M6 değerlendirmesi `claude-opus-5`'e gidiyor (karar sonnet-5) — patron teyidi sorusu.

## 2. Kanıt

DNS (salt-okur, 29.09.2026 21:43 UTC):
```
== SOA @ns1.iyisunucu.com.tr   ;; ->>HEADER<<- opcode: QUERY, status: REFUSED
== SOA @ns2.iyisunucu.com.tr   ;; ->>HEADER<<- opcode: QUERY, status: REFUSED
== NS @a.gtld-servers.net      fonbridge.com. 172800 IN NS ns1.iyisunucu.com.tr. / ns2.iyisunucu.com.tr.
== A/AAAA/MX/TXT @8.8.8.8      status: SERVFAIL (dördü de)
== www./mail./_dmarc. @1.1.1.1 status: SERVFAIL
== usfinbridge control @ns1    status: NOERROR
```

Env karşılaştırması:
```
SCHEMA not in example:   (boş)
EXAMPLE not referenced in src/scripts/prisma/config:
AI_PROVIDER APIFY_TOKEN CORDIS_H2020_ZIP_URL CORDIS_HE_ZIP_URL DATABASE_URL_MIGRATE DEFAULT_LOCALE EMBEDDING_DIM EMBEDDING_MODEL EMBEDDING_PROVIDER SEDIA_API_KEY SEDIA_SEARCH_URL SEDIA_TOPIC_DETAILS_URL UPSTASH_REDIS_REST_TOKEN UPSTASH_REDIS_REST_URL
```

Migration:
```
$ bash scripts/apply-migrations.sh --list | wc -l
36
DOWN YOK: add-calendar-connections/migration.sql
DOWN YOK: add-m9-meeting-schedule/migration.sql
DOWN YOK: credit-ledger-grant-period.sql
```

Git / CI:
```
$ git rev-list --count origin/dev..dev          → 223
$ git log -1 --format='%h %aI' origin/dev       → c5aa48d7 2026-09-29T07:26:22+03:00
$ git config core.hooksPath                     → /Users/macbook/AgentSpace/fabrika/githooks
$ ls /Users/macbook/AgentSpace/fabrika/githooks → No such file or directory
$ grep -c 'secrets\.' .github/workflows/*.yml   → 0 0 0 0
```

Kod alıntıları: `src/lib/observability/system-alert.ts` başlığı ("…read by platform admins at /[locale]/admin/alerts. Nothing leaves the deployment."); `src/lib/storage.ts:13` (`R2_ACCOUNT_ID` yoksa `s3 = null`), `:82` (`// Dev Mode Fallback: Simulated presigned URL`); `src/lib/auth.ts:309` `trustHost: true`, `:314` `basePath: "/api/auth"`, `:331` `AUTH_GOOGLE_ID || GOOGLE_CLIENT_ID`; `src/lib/leads/public-lead-policy.ts:19` `PUBLIC_LEAD_RETENTION_DAYS = 365`; `src/lib/beta/constants.ts:50` `?? 'support@fabrika.dev'`.

Commit: aşağıdaki §3 dosyaları tek commit'te (`git show --stat HEAD` son adımda).

## 3. Değişen dosyalar

- `docs/RELEASE_CHECKLIST.md` (yeniden yazıldı)
- `docs/agent-results/TASK-MUN66WDHX224-devop-fb.md` (bu rapor; iskelet `4bfc20a5`)

Kod, yapılandırma, git ayarı (`core.hooksPath`), DNS, sunucu **değiştirilmedi**.

## 4. Riskler

- **Sessiz veri kaybı:** R2 kararı verilmeden canlıya çıkılırsa kanıt/dosya yüklemeleri başarılı görünür ama saklanmaz (§2.2). Ayrı EKSİK kartı önerisi: üretimde sahte URL yerine hata + `SystemAlert`.
- **Kör canlı:** alarm e-postası ve dış kalp atışı yokken worker düşerse kimse fark etmez (§5.2).
- **Yedeksiz canlı:** §4 kurulmadan ilk gerçek kullanıcı verisi yedeksiz.
- **Tek kopya kod:** 223 commit yalnız bu makinede, push 1 Ekim'e kadar.
- **Yanlış rolle yedek:** `fabrika_app` ile `pg_dump` RLS yüzünden kiracı satırlarını boş alır — yedek rolü ayrı olmalı.
- **`prisma db push --accept-data-loss`** üretimde verilirse kolon/veri düşebilir; listede açıkça yasaklandı.

## 5. Açık sorular (patrona)

1. Uygulama sunucusu: paylaşımlı cPanel (77.92.144.187) mi, ayrı Vulut VPS mi? `<APP_IP>`?
2. R2 (ya da başka depolama) — pilotta dosya yükleme açık mı?
3. S-1: gönderim kutusu `info@` mi, ayrı `bildirim@` mi?
4. Alarm özeti alıcı adresi; uptime izleyici hesabı kimde?
5. RPO/RTO hedefi (öneri 24 sa / 4 sa) ve yedeğin sunucu dışı yeri.
6. `k2-monthly-cordis` pilotta gerekli mi (Python CORDIS servisi `WORKER_URL` ister)?
7. M6 değerlendirmesinin `claude-opus-5` kullanması bilinçli mi?

## 6. Sonraki adım

- Patron: `docs/RELEASE_CHECKLIST.md` §8 listesi (1–14).
- Ayrı EKSİK kartları (ajan işi, önerilir): (a) üretimde R2 yoksa yüklemeyi reddet + alarm; (b) `alerts-ops-digest` işi + sağlık ucu (worker kalp atışı); (c) yedek betiği + geri yükleme testi (sunucu belli olunca); (d) `.env.example` ölü anahtar temizliği + `BETA_SUPPORT_EMAIL` varsayılanı; (e) `core.hooksPath` düzeltmesi (lider onayıyla).
- Sunucu + DNS hazır olunca: §3.1/§3.3 sırası ve `docs/SMTP-SUNUCU.md` §7/§10.3 ölçümleri — canlıya geçiş yalnız açık onayla.

## Platform beyanı

Doğrulama **mac** (Darwin 27, zsh; `dig` 9.10.6) üzerinde yapıldı. Bu kart kod değiştirmedi, yalnız belge; komutlar (`dig`, `grep`, `git`, `bash scripts/apply-migrations.sh --list`) Linux'ta aynı çıktıyı verir — tek fark: mac'te `grep` bu makinede ugrep'e bağlı olduğu için ölçümler `/usr/bin/grep` ile koşuldu, Linux'ta düz `grep` yeterli. Üretim hedefi **Linux** (Docker `node:22-alpine`); canlı sunucu olmadığı için **Linux'ta koşulamadı**. **Windows** hedef değil; belgedeki komutlar (bash, `psql`, `pg_dump`, `dig`) Windows'ta WSL olmadan koşmaz.
