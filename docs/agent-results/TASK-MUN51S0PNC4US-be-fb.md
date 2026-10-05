# TASK-MUN51S0PNC4US — be-fb — İNCELEME-42: TASK-MUN2793A57Z9I kilit testleri (commit 21658447)

**Karar: ONAY.** Dört mutantı (N1, N2, N3, N6) kendim koştum. Dördü de kırmızı oldu, geri alınca yeşile döndü. Commit yalnız test ve rapor içeriyor, ürün kodu değişmemiş.

**TASK-MUN2793A57Z9I (davet kabul sayfası) için ayrı karar: KAPANABİLİR.** İNCELEME-34'ün tek açık isteği bu testlerdi. Kod zaten ONAY almıştı. Açık kalan `keepToken` sorusu (aşağıda Ö-1) bu kartın kapsamı dışında, ayrı kart ile ele alınmalı.

## 1. Ne yapıldı
- `git show --stat 21658447` ile kapsamı kontrol ettim: 4 test dosyası + cs-fb raporu, `src/` ve `next.config.ts` yok.
- İzole ortam kurdum: `git worktree` (HEAD `638662f1`, scratchpad'de) ve izole DB `befb_in42` (`fabrika`'nın `pg_dump` kopyası, `fabrika-postgres` @5433, `SMTP_HOST=` boş). Paylaşılan ağaçtaki başka ajanların commit edilmemiş değişikliklerine ve `fabrika` DB'sine dokunmadım.
- İstenen 4 mutantı ve testlerin gücünü ölçmek için 5 ek mutantı koştum.
- N6 testinin ne ölçtüğünü inceledim. Test yalnız config nesnesini okuyor. Bu yüzden Next'in kendi route derleyicisiyle (`load-custom-routes` + `build-custom-route`, routes-manifest'e giden adım) kuralın gerçek yollara eşleştiğini ayrıca ölçtüm.
- Testlerin kendisini okudum. Her biri iddia ettiği satırı doğru yerden tutuyor (§2.4).

## 2. Kanıt

### 2.1 Taban (worktree, izole DB)
```
npx vitest run tests/accept-invite-headers.test.ts tests/invitation-accept.live.test.ts \
  tests/invitation-mail-limit.live.test.ts tests/social-action-disclosure.test.ts
 Test Files  4 passed (4)
      Tests  37 passed (37)
```
Atlanan test yok. Canlı testlerin izole DB'ye gittiğinin kanıtı (`pg_stat_database.xact_commit`, iki canlı dosyanın koşusundan önce ve sonra):
```
önce:  befb_in42=1884  fabrika=11006
      Tests  34 passed (34)
sonra: befb_in42=2202  fabrika=11006
```

### 2.2 Mutantlar (perl ile uygula → hedef dosya → geri al → hedef dosya)
```
== N2 (mutated) :: < await clearInvitationAcceptCookie();
   × a plain Google start clears a parked tenant invitation before handing over to Google
      Tests  1 failed | 1 passed (2)
== N2 (restored)      Tests  2 passed (2)
== N2b-after-signIn (mutated) :: clearInvitationAcceptCookie() signIn'den SONRAYA taşındı
   × a plain Google start clears a parked tenant invitation before handing over to Google
      Tests  1 failed | 1 passed (2)
== N2b-after-signIn (restored)      Tests  2 passed (2)
== N3 (mutated) :: where: { id: invitationId, tenantId, acceptedAt: null, expires: { gt: now } }   (tokenHash çıktı)
     × the core refuses a link rotated after the caller looked: lost, row still pending, no membership
      Tests  1 failed | 17 passed (18)
== N3 (restored)      Tests  18 passed (18)
== N1 (mutated) :: update: keepToken ? { role, expires } : { tokenHash, role, expires }   (acceptedAt: null çıktı)
     × re-inviting an address whose earlier invitation was accepted reopens it with a fresh link
      Tests  1 failed | 15 passed (16)
== N1 (restored)      Tests  16 passed (16)
== N6 (mutated) :: < { key: 'Referrer-Policy', value: 'no-referrer' },
   × next.config: the accept-invite pages never send a Referer and are never cached
      Tests  1 failed (1)
== N6 (restored)      Tests  1 passed (1)
== N6b-cache (mutated) :: < { key: 'Cache-Control', value: 'no-store' },          → 1 failed (1) / restored 1 passed
== N6c-value (mutated) :: value: 'strict-origin-when-cross-origin'               → 1 failed (1) / restored 1 passed
== N6d-block (mutated) :: accept-invite bloğunun tamamı silindi                  → 1 failed (1) / restored 1 passed
== N6e-has (mutated) :: kurala has: [{ type: 'query', key: 'nope' }] eklendi     → Tests 1 passed (1)  ← HAYATTA
```
Özet: istenen 4/4 öldü. Ek mutantlardan 4/5 öldü. N6e hayatta kaldı (bkz. Risk 1). Her geri almadan sonra worktree'de `git status --short` boş çıktı.

N2b önemli bir sonuç: test, çerezin sadece "bir noktada" silinip silinmediğine bakmıyor. Google'a devir anında çerezin artık olmamasını istiyor. Sıra bozulursa da kırmızı oluyor.

### 2.3 N6: derlenmiş kural gerçek yollara eşleşiyor mu?
`tests/accept-invite-headers.test.ts` gerçek export edilen `config(phase)` fonksiyonunu çağırıyor, yani `withNextIntl` sarmalı da dahil. Ama yalnız `headers()` çıktısındaki nesneyi okuyor, derlenmiş başlıkları okumuyor. Eksiği Next'in kendi derleyicisiyle tamamladım. Bu ölçüm geçici bir test dosyasıyla yapıldı ve dosya silindi:
```
/tr/accept-invite          => Referrer-Policy=no-referrer, Cache-Control=no-store
/en/accept-invite          => Referrer-Policy=no-referrer, Cache-Control=no-store
/tr/accept-invite/continue => Referrer-Policy=no-referrer, Cache-Control=no-store
/en/accept-invite/continue => Referrer-Policy=no-referrer, Cache-Control=no-store
/de/accept-invite          => (yok)
/tr/giris                  => (yok)
```
Kural, token taşıyan ilk sayfayı ve `/continue`'yu iki dilde de kapsıyor. Başka sayfalara taşmıyor.

### 2.4 Testlerin ölçtüğü şey
- **N2** (`social-action-disclosure.test.ts`): `@/lib/auth` mock'lu `signIn`, çerez kavanozunu devir anında okuyor. Onaylı ve onaysız iki başlangıç da denendi. Çağrı `/giris` ve `/kayit`'taki gerçek `loginWithSocialAction`.
- **N3** (`invitation-accept.live.test.ts`): Satırın hash'i gerçekten döndürülüyor, ardından `acceptInvitationIn` `fabrika_app` (NOBYPASSRLS) ile eski hash'le çağrılıyor. Test `lost` sonucuna, üyelik olmamasına, `acceptedAt` NULL kalmasına ve denetim satırı 0 olmasına bakıyor. Yani yalnız dönüş değerini değil, yan etkinin yokluğunu da ölçüyor.
- **N1** (`invitation-mail-limit.live.test.ts`): Gerçek POST handler çağrılıyor. Denetim satırları 11 dk geriye alınarak bekleme süresi aşılıyor. Böylece `keepToken=false` kolu çalışıyor. Test `acceptedAt` NULL olmasına, yeni token'ın geçerli olmasına ve eski token'ın geçersiz olmasına bakıyor.
- **N6**: yalnız config düzeyinde (§2.3, Risk 1).

### 2.5 Kapılar (worktree, HEAD 638662f1)
```
npx tsc --noEmit -p .   → error TS sayısı 0, exit 0
npx eslint <4 test dosyası> → exit 0
```
Tam süiti koşmadım. Commit yalnız test ekliyor ve hedef dosyalar ile tsc temiz. cs-fb'nin tam süit sonucu (2681/0, izole DB) kendi raporunda.

### 2.6 Ürün kodu değişmedi
```
git show --stat 21658447 --format=   → yalnız tests/* (4) + docs/agent-results/TASK-MUN2793A57Z9I-cs-fb-2.md
git diff 21658447 HEAD -- <4 ürün dosyası + 4 test dosyası> | wc -l   → 0
```
İnceleme sırasında dev iki kez ilerledi (`e777ae04`, `5927c64d`: llm/m7/m10). Bu commitler incelenen 8 dosyaya dokunmuyor.

### 2.7 Temizlik
`DROP DATABASE befb_in42 WITH (FORCE)` → `DROP DATABASE`. `git worktree remove` yapıldı. Sunucu ya da başka bir süreç başlatmadım.

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUN51S0PNC4US-be-fb.md` (bu rapor). Kod ve testlerde değişiklik yok.

## 4. Riskler
1. **N6e hayatta (düşük).** Kurala `has`/`missing` koşulu eklenirse test yeşil kalır ama başlık artık gönderilmez. Test `source` üzerinden `find` edip yalnız `headers` alanına bakıyor. İsteğe bağlı sıkılaştırma: `expect(rule).not.toHaveProperty('has')` ve `not.toHaveProperty('missing')`. Bu ONAY'ı engellemez, çünkü B-4 zaten isteğe bağlı bir derinlemesine savunma bulgusuydu.
2. **Next'in üretimde `Cache-Control`'ü ezme ihtimali ölçülmedi.** `next start` ile curl ölçümünü ben yapmadım. fe-fb §2.4 üretimde `Referrer-Policy`'yi curl ile görmüştü. Dinamik sayfada Next zaten `no-store` veriyor, bu yüzden pratik etkisi yok.
3. N1 testi `keepToken` kolunu (10 dk içinde yeniden davet + kabul edilmiş satır) kapsamıyor. Bu bir test eksiği değil, kodda açık duran bir karar (Ö-1).

## 5. Açık sorular
- **Ö-1** (fe-fb Açık soru 1 / crw-fb İNCELEME-37 Ö-3): `keepToken` kolu kabul edilmiş satırı "bağlantı hâlâ geçerli" diye bildiriyor. be-fb görüşüm: kodla kapatılsın. `keepToken` yalnız `acceptedAt IS NULL` satırda uygulansın, kabul edilmiş satırda yeni token + `acceptedAt: null` kolu çalışsın. Bunun yanında bir canlı test eklensin. Bugün üye çıkarma yolu olmadığı için aciliyeti düşük. Ayrı kart önerisi; bu kartı bloke etmez.

## 6. Sonraki adım
- TASK-MUN2793A57Z9I → `done` olabilir (lider/pano).
- Ö-1 için ayrı kart açılsın (sahibi cs-fb veya be-fb). Risk 1'deki sıkılaştırma o karta eklenebilir.

**Platform beyanı:** Doğrulama mac üzerinde yapıldı (Darwin 27, zsh, Docker `fabrika-postgres` @5433, vitest 4.1.11, Next'in `load-custom-routes`/`build-custom-route` modülleri). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. İncelenen kod yolları platformdan bağımsız: çerez API'si, Prisma/Postgres sorgusu ve Next başlık yapılandırması. Dosya yolu, süreç, kabuk ya da ikili bağımlılığı yok. Diğer platformlarda aynı davranış beklenir.
