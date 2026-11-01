# TASK-MULRQSJFB8RWJ — FB KAMU B2: Ajans panosu (fe-fb)

**Sprint:** FB-KAMU-2 · **Dal:** dev (push yok) · **Commit:** `df1d2341` · **Platform:** mac (Darwin 27.0.0), yerel docker Postgres `fabrika-postgres` (:5433), leed-fb'nin `next dev` sunucusu (:3000), Playwright + Chrome

## 1. Ne yapıldı

Ajans kiracısının (kind=AGENCY) üyeleri `/tr/ajans` (`/en/agency`) sayfasında iki şey görüyor: bölgelerindeki kurumların toplu hunisi ve davet kodu yönetimi. Diğer kullanıcılar gerçek bir **403** alıyor.

- **Toplama (sunucuda):**
  - `prisma/migrations/add-agency-funnel.sql` + `.down.sql` (idempotent), `apply-order.txt` sonuna eklendi.
  - `public.agency_funnel_counts(since)`: SECURITY DEFINER, `SET search_path = public, pg_temp`, `SET app.system_scope = 'on'` (B1'in `redeem_agency_invite` kalıbı).
  - Ajansı parametreden DEĞİL, çağıranın `app.tenant_id`'sinden alıyor. Çağıran canlı bir AGENCY değilse satır dönmüyor.
  - Kurum türü başına tek satır döndürüyor, beş tam sayı: kayıt, kayıtlı arama, pipeline (G0), konsept not. Kurum id'si, adı ya da içeriği fonksiyonun dışına çıkmıyor.
  - EXECUTE yetkisi yalnız `fabrika_app`'te, PUBLIC'te yok.
- **`src/lib/agency/funnel.ts`:**
  - Adım 1, 3, 4 ve 5 bu fonksiyondan geliyor.
  - Adım 6 ve 7 (başvuru, kabul, red) be-fb'nin B7 fonksiyonundan geliyor: `countApplicationOutcomes` (`@/lib/k5-pipeline/applicationOutcome`, `09cf9bba`). Kiracı listesi sunucuda `Tenant.agencyId = oturumdaki ajans` sorgusuyla türetiliyor; istemciden liste alınmıyor (leed-fb'nin güvenlik şartı).
  - Adım 2 (karne, B6) **"Henüz ölçülmüyor"** olarak gösteriliyor, sayı yazılmıyor.
  - Dönem kohort mantığıyla çalışıyor: son 30 ya da 90 günde kayıt olan kurumlar ve bu kurumların ulaştığı adımlar. B7 fonksiyonuna `since` verilmiyor, çünkü kohortu kayıt tarihi belirliyor.
- **Küçük grup maskesi (KVKK eki §3.1):**
  - 5'ten küçük her hücre (0 dahil) istemciye `small` olarak gidiyor ve ekranda **"<5"** görünüyor.
  - İkincil gizleme de var. Toplam eksi görünen hücrelerin farkı 1–4 çıkacaksa en küçük görünen hücre de gizleniyor. Böylece gizli hücre toplamdan geri hesaplanamıyor.
  - Kayıt sayısı 5'ten az olan bir grupta hiçbir adım gösterilmiyor.
  - Maskeleme sunucuda yapılıyor. Tarayıcıya 5'ten küçük hiçbir sayı gitmiyor.
- **Arayüz** (`src/app/[locale]/(app)/ajans/`):
  - Huni: 8 kart. Kurum türü filtresi istemcide çalışıyor; her tür zaten maskeli olarak geliyor. 30/90 gün seçimi bağlantıyla yapılıyor (`?gun=`, `aria-current`).
  - İl seçicisi **devre dışı**, yanında "İl bilgisi henüz toplanmıyor." yazıyor (leed-fb kararı).
  - Davet kodu: üretme formu (kullanım sayısı, son gün, etiket). Kod **yalnız bir kez** gösteriliyor, yanında kod ve kayıt bağlantısı kopyalama düğmeleri var.
  - Kod listesi: `••••-••••-XXXX` ipucu, kullanılan/kalan, son tarih ve durum (Etkin, Tükendi, Süresi doldu, İptal edildi). İptal onay kutusuyla yapılıyor.
  - `manage_users` yetkisi olmayan üye yalnız listeyi görüyor.
- **403:** `forbidden()` + `next.config.ts` `experimental.authInterrupts: true` + `src/app/forbidden.tsx`.
- **i18n:** `agency.*` ve `Forbidden.*` anahtarları tr ve en dillerinde eklendi.
- `SidebarNav`: `ajans` ve `agency` çalışma alanı adı sanılmasın diye hariç listesine eklendi.

**Bilinçli sapma (KVKK eki §3, HUKUK-4 açık):** Kart "kurum adı listesi dışında" diyor. Ancak `docs/legal/agency-channel-notice-addendum.md` §3 kurum adının da ajansa gitmeyeceğini yazıyor. Bu yüzden panoda **kurum adı listesi yok**, yalnız toplu sayılar var. leed-fb onayladı.

## 2. Kanıt

### Migration

```
run1 exit=0 / run2 exit=0
 agency_funnel_counts | prosecdef t | {"search_path=public, pg_temp",app.system_scope=on} | app_exec t | public_exec f
down exit=0 / down exit=0 (NOTICE … does not exist, skipping) → count 0 → up exit=0 → count 1
scripts/apply-migrations.sh --list → … add-agency-funnel.sql   (liste = disk)
```

Bu makinede `psql` yok. Dosyalar `docker exec -i fabrika-postgres psql -v ON_ERROR_STOP=1` ile uygulandı. `apply-migrations.sh`'in tam koşusu yapılamadı.

### Canlı test: `tests/agency-funnel.live.test.ts` (`fabrika_app`, NOBYPASSRLS doğrulanıyor)

`@/lib/db` bu dosyada `fabrika_app` istemcisiyle değiştirildi. `getAgencyFunnel` ve B7 fonksiyonu RLS rolünde, uygulamadaki gibi koşuyor. Fikstür: ajans A'ya bağlı 6 KOBİ (içerikli) ve 2 belediye; ajans B'ye bağlı 10 başvurulu 1 kurum; bağsız 1 kurum.

```
✓ returns integers per organisation type and nothing that names an organisation
✓ the agency is the caller: B sees only its own organisation, never A's
✓ an organisation, or no tenant at all, gets no rows
✓ the system scope does not outlive the call, and the agency still reads no content
✓ A's funnel counts A's organisations only, masked, with B7 numbers from A's cohort
✓ B's funnel: one organisation is a small group, so nothing is shown, not B's 10 nor A's 6
✓ an organisation cannot read a funnel
✓ the B7 list is derived from the agency link: A never receives B's organisation
Tests  8 passed (8)
```

`src/lib/agency/funnel.test.ts`: 12 test yeşil. İçinde 2000 rastgele durumlu bir özellik testi var: "geri hesaplanabilen fark 0 ya da en az 5".

**Mutasyonlar (testler gerçekten yakalıyor):**

| Mutasyon                                                                | Sonuç                                                                 |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| SQL: `t."agencyId" = agency` → `IS NOT NULL` (tüm ajansların kurumları) | `4 failed \| 4 passed` → dosya yeniden uygulandı, `prosrc` doğrulandı |
| funnel.ts: B7 listesi `agencyId: { not: null }`                         | `2 failed` (A→B testi dahil) → yedekten geri yüklendi (`cmp` aynı)    |
| funnel.ts: ikincil gizleme kapalı (`while (false)`)                     | `4 failed` (3 birim + 1 canlı) → geri yüklendi                        |

### Gerçek tarayıcı (localhost:3000, Playwright + Chrome, gerçek yazma ve tıklama, her kurum ayrı tarayıcı bağlamında)

Ajans kullanıcısı `b2v0219-ajans@example.org` `/tr/kayit` üzerinden kaydoldu. Kiracısı yalnız yerel DB'de SQL ile `kind='AGENCY'` yapıldı (`UPDATE 1`).

```
normal user /tr/ajans status 403        normal user /en/agency status 403
agency /tr/ajans status 200
registered card: "<5 / 5'ten az; sayı gizlendi"                      → 01-pano-once.png
CODE 3K3X-M3N9-5WZ2 (form: 10 kullanım, etiket "B2 doğrulama")        → 02-kod-uretildi.png
invalid maxUses message shown (0 → "1 ile 10.000 arasında…")
code visible after reload? false                                      (kod bir kez gösterildi)
4 kurum ?kod= ile kaydoldu → "<5", satır "4 / 10 kullanıldı · 6 kaldı" → 03a-4-kurum-maskeli.png
5. kurum → "5", "5 / 10 kullanıldı · 5 kaldı"                          → 03b-5-kurum.png
6. kurum → "6", "6 / 10 kullanıldı · 4 kaldı"                          → 04-6-kurum-artti.png
Filtre Belediye → "<5"; KOBİ → "6"                                    → 04b-filtre-kobi.png
90 gün bağlantısı → aria-current=page
Klavye: iptal düğmesine odak + Enter → onay "5WZ2 ile biten kod iptal edilsin mi? …" → "İptal edildi" → 06-kod-iptal.png
masaustu sw/vw [1366,1366] · mobil sw/vw [390,390]                    → 09/10-{masaustu,mobil}-*.png
```

Normal kiracının 403 ekranı: `05-normal-kiraci-403.png`. Kareler `docs/agent-results/TASK-MULRQSJFB8RWJ-screenshots/` altında.

İlk mobil ölçümde sayfa yatay taşıyordu (`scrollWidth 641 / 390`). Kök neden: tablonun `sr-only` başlığı `position:absolute` ve konumlu bir atası yoktu, bu yüzden `overflow-x-auto` kutusundan kaçıyordu. Kaydırma kutusuna `relative` eklendi, ölçüm `390/390` oldu.

### Kapılar

```
pnpm typecheck         → tsc --noEmit                                            EXIT 0
pnpm lint              → eslint                                                  EXIT 0
pnpm test (.env yüklü) → Test Files 180 passed | 2 skipped (182); Tests 2065 passed | 8 skipped   EXIT 0
pnpm i18n:check        → ✅ both catalogs agree, every key used in src/ resolves, no file gained hard-coded text
pnpm rls:check         → ✅ every one of them carries ENABLE + FORCE + tenant_isolation
pnpm rls:bypass-check  → ✅ no new tenant bypass. 1 allowed, 23 sanctioned, 0 still owed   (dosyalar index'te)
pnpm rls:verify        → ✅ 46 kiracıya özel tabloda … fabrika_app rolüyle GERÇEKTEN ölçüldü
```

## 3. Değişen dosyalar (`df1d2341`)

- `prisma/migrations/add-agency-funnel.sql`, `add-agency-funnel.down.sql` (yeni), `apply-order.txt` (+1 satır)
- `src/lib/agency/funnel.ts`, `funnel.test.ts` (yeni)
- `src/app/[locale]/(app)/ajans/{page,funnel-panel,invite-codes-panel,actions}.tsx|ts`, `(app)/agency/page.tsx` (yeni)
- `src/app/forbidden.tsx` (yeni), `next.config.ts` (`experimental.authInterrupts`)
- `messages/tr.json`, `messages/en.json` (`agency`, `Forbidden`)
- `src/components/SidebarNav.tsx` (hariç listesi)
- `tests/agency-funnel.live.test.ts` (yeni)
- Bu rapor ve `TASK-MULRQSJFB8RWJ-screenshots/`

schema.prisma değişmedi, `db:generate` gerekmedi.

## 4. Riskler

- **B1 hatası (düzeltilmedi, be-fb'nin dosyası):** `src/lib/agency/actions.ts` bir `'use server'` dosyası, ama `AgencyPermissionError` sınıfını dışa aktarıyor. Next yalnız async fonksiyon dışa aktarımına izin veriyor. Bu dosyayı import eden her rota derlenmiyor. İlk denememde `/tr/ajans` bu yüzden 500 verdi ve dev derleme hatası birkaç dakika boyunca `:3000`'deki diğer sayfaları da 500'e düşürdü. Pano artık bu dosyayı kullanmıyor; `codes.ts` doğrudan çağrılıyor ve kurallar aynı. Dosya bugün hiçbir rotadan import edilmiyor ama tuzak olarak duruyor. be-fb ve leed-fb'ye bildirildi.
- **Dönem farkı saldırısı:** 30 ve 90 günlük görünümler ayrı ayrı maskeleniyor. İkisinin farkı 31–90. gün kohortunu verir. İki değer de ≥5 iken bu fark 1–4 çıkabilir. Tek tek hücre kuralı bunu kapatmıyor. B3 (aylık rapor) ile birlikte hukuk incelemesine (HUKUK-5) konmalı.
- **`experimental.authInterrupts`:** Next 16'da hâlâ deneysel. Ayar, API ya da davranış değişirse `/ajans` 403 yerine hata verebilir.
- Başvuru, kabul ve red sayıları **başvuru** sayısıdır; adım 1–5 **kurum** sayısıdır. Açıklama metninde yazılı.
- Kenar çubuğunda "Ajans panosu" bağlantısı yok, çünkü oturumda `kind` bilgisi taşınmıyor. Ajans kullanıcısı adrese doğrudan gidiyor.
- Yerel DB'de test verisi kaldı: `b2v0219-*` kullanıcıları ve kiracıları. `b2v0219-ajans` kiracısı AGENCY yapıldı (yalnız yerel). Canlı test fikstürleri kendi kendini temizliyor.

## 5. Açık sorular

- Kurum adı gösterilecek mi (S4 / HUKUK-4)? Gösterilecekse KVKK eki yeniden yazılmalı.
- Reddedilen kod denemeleri (`agency.invite.rejected`, kod id'li) panoda gösterilsin mi? B1 bunu B2 için hazırladı, bu kartta yapılmadı.

## 6. Sonraki adım

- `Tenant.province` kartı (bana atandı): şema, kayıt/ayarlar, karneden önceden doldurma ve il filtresinin açılması.
- B6 bitince karne adımı `agency_funnel_counts`'a eklenmeli (yeni migration ile `CREATE OR REPLACE`).
- be-fb: `src/lib/agency/actions.ts` içindeki `'use server'` dışa aktarım hatası.

**Platform beyanı:** Doğrulama mac (Darwin 27.0.0) üzerinde yapıldı: docker Postgres, Next dev ve Playwright/Chrome. Değişen kod platforma bağlı değil: SQL, Prisma, React ve Next. Süreç, dosya yolu, kabuk ya da kısayol kullanılmıyor. Windows ve Linux'ta aynı davranış beklenir. Bu platformlarda koşu yapılamadı, çünkü makinede yalnız macOS var. CI (Linux) `scripts/apply-migrations.sh` ile migration'ı uygular, canlı suite orada da koşar.
