# TASK-MVCH2R3VSLAJN — FO-61 Partner Search API, round 3 (be-fb)

**Hüküm: ONAY İSTENİYOR — se-fb S1–S4 düzeltildi, tam `pnpm gate` yeşil, push edildi.**
S5/S6 yalnızca bilgi notu; kod değişmedi.

- Branch: `be-fb/fo61-partner-search-api`
- Yeni kod tipi: **`29c4bf56`** (önceki tip `23228dad`, rebase sonrası `d68d8731` üzerine tek commit). Bu rapor dosyasının commit'i bunun üstünde gelir; kod doğrulaması `29c4bf56` içindir.
- Ana taban: `origin/dev` (#163 merge `e1338238` dahil)
- Platform: **mac (darwin)** — gate, DB ve push bu makinede koştu.
- fe-fb FO-62 dalı bu tip üzerinden çalışır; tip `23228dad`'den `29c4bf56`'ya değişti (yalnızca bu round'un 5 dosyası).

## Ne yapıldı

### S1 (blocker, orta) — metered yolda M1 ModuleState
`decidePartnerSearchAccess` artık 4. parametre olarak `ModuleViewer` alıyor. Plan M1'i kapsamıyorsa (Discover/Basic) ve kota > 0 ise, M1 durumu `canAccessStatus` (tek kaynak: `src/lib/modules/state-machine.ts`) ile kontrol edilir:
- `OFF` → açık (metered varsayılan, satır yok)
- `DEV` → yalnız platform admin / staff
- `PILOT` → yalnız TENANT_OWNER / TENANT_ADMIN / PIPELINE_MANAGER (+ admin/makine)
- `ON` → açık

Erişim kararı tek yerde: `decidePartnerSearchAccess`. `http.ts` yalnız viewer'ı geçirir; kopya kural yok.

Testler (`tests/partner-search-api.test.ts`): Discover + M1=DEV MEMBER → 403; Discover + M1=PILOT MEMBER → 403; Discover + M1=PILOT OWNER → 200 (quota 10); staff DEV geçer; API key PILOT geçer; OFF açık kalır. Girdiler `decideModuleAccess` üzerinden üretilir.

### S2 — LIKE joker kaçışı
`escapeLike` (`%`, `_`, `\`) `announcementWhere` içinde `organizationName` ve `description` `contains` için kullanılır. Test: `q: '100%'` → `'100\\%'`.

### S3 — NUL baytı
`optionalText` `\u0000` içeren girdiyi zod refine ile reddeder → **400 invalid_query** (500 değil). Test: NUL içeren `q` parse'ı başarısız.

### S4 — maskeleme boşlukları (karar: `maskContact`'ta)
Bu bir iletişim metni sorunu, API yanıt yolu değil; tek kural `maskContact` (`src/modules/m1/server/partner-search/mask.ts`).
- Çıplak `" dot "` ayracı (`john dot doe`) maskelenir.
- `linkedin.com/in/…` profil URL'leri `[linkedin]` ile maskelenir; şirket sayfası (`linkedin.com/company/…`) değişmez.
- `organizationName`, `city`, `keywords` maskelenmez — bu bir kurum alanı sorusu; rapor notu olarak kalır.
- Sözleşme metni "maskelenmiş" ifadesi **en iyi çaba** olarak kalır.

Test (`tests/partner-search-mask.test.ts`): `john.doe (at) uni.example dot org`, `john [at] uni dot org`, LinkedIn URL'leri → maskeli; şirket URL'si değişmez.

## Kanıt

**Mutasyon kontrolü** (her düzeltme geri alınınca kırmızı; dosyalar bayt-bayt geri yüklendi):
- S1 kaldırıldı → 2 başarısız test
- S2 kaldırıldı → 2 başarısız test
- S3 kaldırıldı → 1 başarısız test
- S4 bare-dot kaldırıldı → 2 başarısız test

**Birim:** üç ilgili dosya 94 test geçti. Tam `pnpm test` (izole DB, port 55640): **405 dosya geçti, 10 atlandı; 5301 test geçti, 200 atlandı**, çıkış 0.

**Lint/typecheck:** `pnpm lint` 0 hata (4 önceden var olan uyarı, dokunulmamış dosyalar); `pnpm typecheck` çıkış 0.

**Tam `pnpm gate`** (izole DB, `DATABASE_URL` ayarlı): çıkış **0**. Aşamalar: db:generate, lint, typecheck, test (405 dosya geçti), i18n:check, rls:check (48 model politika), rls:bypass-check (0 yetkisiz bypass), rls:verify --require-db (48 tablo izolasyonu GERÇEKTEN ölçüldü, fabrika_app ile okuma/yazma kiracı sınırında reddedildi), db:rls-role, test:e2e (399 geçti), alerts:check (öksüz alarm yok).

**Push:** İlk push pre-push kancası (gate) sırasında başarısız oldu; kanca `DATABASE_URL` env'ini görmeyip ana checkout'un `.env`'ine düştü. `DATABASE_URL` izole DB'ye ayarlanarak aynı tip yeniden push edildi:
`+ 23228dad...29c4bf56 HEAD -> be-fb/fo61-partner-search-api (forced update)`, çıkış 0. Lease: `23228dad`. Uzak tip = `29c4bf56`.

Not: `core.bare` `false` — FO-114 koruması tetiklenmedi.

## Round-2 düzeltmesi

Round-2 raporundaki "OFF veya DEV/PILOT ret → 403" cümlesi **yanlıştı**: OFF metered planda açık kalır (satır yok = metered varsayılan); 403 yalnız DEV/PILOT için, ve şimdi metered yolda da uygulanır (S1).

## S5 / S6 (bilgi notu, kod değişikliği yok)

Brief gereği bu iki madde yalnızca rapora not düşüldü; kod değiştirilmedi.

## Riskler

- `maskContact` en iyi çaba: yeni biçimler (ör. başka sosyal ağ URL'leri, dilden bağımsız obfuskasyon) kapsanmayabilir. Sözleşmede "maskelenmiş" bu anlamda yazılı.
- `organizationName`/`city`/`keywords` maskelenmez — kurum alanında kişisel iletişim sızarsa maskeleme yapılmaz.
- Push pre-push kancası gate'i tekrar koşar (≈8 dk); aynı makinede paralel push'lar sırada bekleyebilir.

## Açık sorular

1. Sonuç dosyası yolu: brief hem `/Users/macbook/alan/FONBRIDGE/docs/agent-results/…-be-fb-3.md` hem de önceki `…-crw-fb.md` yolunu andı. Bu rapor **branch'teki worktree** altına (`docs/agent-results/TASK-MVCH2R3VSLAJN-be-fb-3.md`) yazıldı; ana checkout'a kopyalanması istenirse söylensin.
2. `organizationName`/`city`/`keywords` için maskeleme kararı lider/ürün tarafından verilecek mi?

## Sonraki adım

- se-fb yeniden incelesin (S1–S4 kapatıldı mı).
- fe-fb FO-62 dalı `29c4bf56` üzerine rebase etsin.

## Definition of Done

- [x] S1: metered yolda M1 DEV/PILOT uygulanır — test + mutasyon kanıtı
- [x] S2: LIKE joker kaçışı — test + mutasyon kanıtı
- [x] S3: NUL → 400 — test + mutasyon kanıtı
- [x] S4: maskeleme boşlukları `maskContact`'ta — test + mutasyon kanıtı
- [x] S5/S6: yalnız not
- [x] Tam `pnpm gate` yerelde çıkış 0 (izole DB, port 55640)
- [x] Rebase `origin/dev` üstünde; push `--force-with-lease`, uzak tip `29c4bf56`
- [x] Platform beyanı: mac (darwin)
