# TASK-MULV3JXS1AW5X — FB KAMU: Tenant.province (il) — fe-fb

Sprint FB-KAMU-2 · dal `dev` · kod commit'i `49bf9138` (push yok)

## 1. Ne yapıldı

**Değer seçimi: plaka kodu değil, normalize il adı.** Değer, `src/lib/readiness/provinces.ts` içindeki `TR_PROVINCES` yazımıyla birebir aynı (`'İstanbul'`, `'Şanlıurfa'`). Gerekçe: karne paylaşım bağlantısı (`?il=Samsun`) ve kamu kataloğu (`turkeyRegions`, `coversTurkishProvince`) zaten bu adları kullanıyor. Böylece tek sözlük üç yere de yetiyor ve arada kod↔ad çevirisi gerekmiyor. Aynı 81 ad veritabanında `CHECK ("Tenant_province_check")` olarak da duruyor. `src/lib/province.test.ts`, SQL listesiyle `TR_PROVINCES`'in ayrışmasını yakalıyor.

1. **Şema + migration**
   - `Tenant.province String?` eklendi.
   - `prisma/migrations/add-tenant-province.sql` + `.down.sql`: `ADD COLUMN IF NOT EXISTS`, CHECK adıyla düşürülüp yeniden ekleniyor.
   - `prisma/migrations/add-agency-funnel-province.sql` + `.down.sql`: yeni `public.agency_funnel_counts_by_province(since)` fonksiyonu. Sözleşmesi B2 fonksiyonuyla aynı: SECURITY DEFINER, ajans = çağıranın `app.tenant_id`'si, yalnız tamsayı döner. Satır başına kurum türü **ve** il verir.
   - Eski `agency_funnel_counts`'u neden CREATE OR REPLACE ile değiştirmedim: dönüş tipine sütun ekleniyor ve PostgreSQL dönüş tipinin yerinde değişmesini reddediyor. Eski fonksiyon yerinde duruyor; uygulama artık yenisini çağırıyor.
   - İki dosya `apply-order.txt`'nin sonuna, se-fb'nin `auditevent-null-system-only.sql` satırından sonra eklendi.
2. **Kayıt** (`AuthCard.tsx`, `src/lib/auth.ts`, `src/lib/actions/auth.ts`)
   - İl seçimi isteğe bağlı. Kayıtla açılan her kiracı `country = 'TR'` (auth.ts'de sabit), bu yüzden soru her kayıtta çıkıyor. `provinceAppliesTo(country)` TR dışı bir kiracıda değeri hiç tutmuyor.
   - Credentials dalında il `authorize` → `tenant.create({ province })` yoluyla yazılıyor.
   - OAuth dalında il, onay çerezi deseniyle 15 dakikalık httpOnly bir çerezde taşınıyor (`src/lib/registration-province-cookie.ts`) ve `createUser` içinde yazılıyor. Çerez her OAuth başlangıcında yazılıyor ya da siliniyor.
   - Karneden önceden doldurma: `readinessSignupPath(locale, province)`, karnedeki "kayıt ol" CTA'sına `&il=` ekliyor. AuthCard da `?il=` değerini okuyor.
3. **Kurum ayarları** (`settings/profile/{layout,province-setting,actions}.tsx|ts`)
   - Sahip ve yönetici (`manage_users`) ili değiştirebiliyor. Her değişiklik `AuditEvent tenant.province.updated {from,to}` yazıyor.
   - Profil sayfası bir client/mock sayfa. i18n baseline'ını bozmamak için kart, sunucu verisini okuyan bir `layout.tsx` ile sayfanın altına ekleniyor.
4. **Ajans panosu** (`funnel.ts`, `ajans/page.tsx`, `funnel-panel.tsx`)
   - Devre dışı il seçicisi etkinleştirildi. Seçici bir GET formu ve "Uygula" butonuyla çalışıyor: JS olmadan da çalışıyor ve ok tuşu sayfayı yeniden yüklemiyor. Dönem bağlantıları `il`'i koruyor.
   - **Maske:** her il görünümü tek istekle alınabildiği için `<5` kuralı tür × il tablosunun tamamına uygulanıyor (`maskProvinceTable`). Şu farkların hiçbiri 1..4 çıkamıyor:
     - satır farkı: tür toplamı − görünen iller
     - sütun farkı: il toplamı − görünen türler
     - iller arası fark: genel toplam − görünen il toplamları
   - İli bildirilmemiş kurumlar her zaman gizli kütle sayılıyor. "Tüm iller" görünümü eskisiyle bayt bayt aynı (eski testler değişmedi).
5. **`docs/DATA_MODEL.md` §19** eklendi.

## 2. Kanıt

**Migration — paylaşılan dev DB** (yalnız benim iki dosyam, iki kez):

```
run1 add-tenant-province.sql exit=0      run2 add-tenant-province.sql exit=0
run1 add-agency-funnel-province.sql exit=0  run2 add-agency-funnel-province.sql exit=0
province|text|YES
agency_funnel_counts_by_province|t(secdef)|t(fabrika_app EXECUTE)
Tenant|relrowsecurity=f      policies on Tenant: 0     ← RLS dışı; ek politika gerekmez
```

**Tam zincir — izole geçici DB** (`fefb_province_tmp`: `prisma db push` ardından `scripts/apply-migrations.sh` iki kez, sonra DB silindi):

```
run1 exit=0  apply-migrations: 29 files applied
run2 exit=0  apply-migrations: 29 files applied
down1/down2 (funnel-province.down, tenant-province.down) exit=0 ×4 → sütun 0, fonksiyon 0 → reup exit=0 ×2
bash scripts/apply-migrations.sh --list → exit 0
```

**Gate'ler** (güncel HEAD üzerinde):

```
pnpm typecheck  → TYPECHECK_OK
pnpm lint       → exit 0
pnpm test       → Test Files 185 passed | 2 skipped; Tests 2098 passed | 8 skipped
pnpm rls:check  → ✅ SUCCESS (CHECK 4 + 4b)
pnpm rls:verify → ✅ 47 kiracıya özel tabloda politika yerinde … fabrika_app rolüyle GERÇEKTEN ölçüldü
pnpm i18n:check → ✅ passed (325/325 literal, baseline değişmedi)
```

**Canlı DB testi** (`tests/agency-funnel.live.test.ts`, `fabrika_app` NOBYPASSRLS): 11/11 ✓ (verbose; skip yok). Yeni 3 test şunları doğruluyor:

- by_province satırları yalnız çağıranın kurumlarından geliyor.
- Samsun görünümünde `registered 8`, `submitted 6`; tür hücreleri `<5`; Tokat'ta her adım `<5`.
- DB, `'Samsunn'` değerini `Tenant_province_check` ile reddediyor.

**Maskeleme mutasyon kanıtı** (dosya kopyadan geri yüklendi, `cmp` birebir):

- İller-arası koruma kapatıldığında → 2 test kırmızı (`a small province cannot be recovered…`, `property…`).
- Sütun koruması kapatıldığında → 2 test kırmızı (`a small type cell inside a province…`, `property…`).
- Test, bir gerçek hatayı da yakaladı (verisi olmayan il "0" görünüyordu) → düzeltildi.

**Gerçek tıklama e2e** (Playwright, headless Chromium, :3000; leed-fb yeniden başlattı):

- Fixture: ajans + ajansa bağlı 5 Samsun'lu, 5 ilsiz KOBİ. Ajans kullanıcısı davet kodunu **panodan tıklayarak** üretti.

```
[e2e] invite code created, length 12
[e2e] kayit.illi…  prefilled province = "Samsun"      ← /tr/kayit?kod=…&il=Samsun
[e2e] focused element testid = register-province       ← etiket ile odak alıyor
[e2e] kayit.illi…  registered, now at /tr/default/dashboard
[e2e] kayit.ilsiz… prefilled province = ""
[e2e] kayit.ilsiz… registered, now at /tr/default/dashboard
[e2e] settings province (illi) = Samsun
[e2e] after reload (should be Amasya) = Amasya         ← ayarlarda değiştir + kaydet + yeniden yükle
[e2e] set back to Samsun
[e2e] settings province (ilsiz) = ""
[e2e] ALL registered = 12
[e2e] URL ?gun=30&il=Samsun | Samsun registered = 6    ← klavye (Enter) ile Uygula
[e2e] 90-day link keeps province: ?gun=90&il=Samsun
[e2e] Tokat registered = <5 … | state small
[e2e] mobile horizontal overflow px = 0                 ← 390 px
```

**DB'de doğrulama:**

```
kayit.illi…|TR|Samsun|linked=t
kayit.ilsiz…|TR|NULL|linked=t
tenant.province.updated|{"to": "Amasya", "from": "Samsun"}
tenant.province.updated|{"to": "Samsun", "from": "Amasya"}
```

Test verisi sonradan silindi (`cleaned 13 tenants, 3 users`).

**Kareler:** `docs/agent-results/TASK-MULV3JXS1AW5X-screenshots/`

- `01-ajans-once-tum-iller.png` — önce: filtre "Tüm iller". Kod öncesi hâl HEAD~'de: seçici devre dışı, "İl bilgisi henüz toplanmıyor".
- `02-kayit-illi-mobil.png` — 390 px, il önceden "Samsun".
- `03-kayit-ilsiz.png`
- `04-ayarlar-il-kaydedildi.png`
- `05-ajans-sonra-samsun.png` — sonra: il filtresiyle sayı **6**; kalan adımlar `<5`.
- `06-ajans-tokat-maskeli.png`
- `07-ajans-samsun-mobil.png`

## 3. Değişen dosyalar (commit `49bf9138`)

- **Şema:** `prisma/schema.prisma`
- **Migration:**
  - `prisma/migrations/add-tenant-province{,.down}.sql`
  - `prisma/migrations/add-agency-funnel-province{,.down}.sql`
  - `prisma/migrations/apply-order.txt` (+2 satır)
- **Yeni lib:** `src/lib/province.ts`, `src/lib/province.test.ts`, `src/lib/registration-province-cookie.ts`
- **Kayıt:** `src/lib/auth.ts`, `src/lib/actions/auth.ts`, `src/app/[locale]/login/AuthCard.tsx`
- **Ayarlar:** `src/app/[locale]/(app)/[workspace]/settings/profile/{actions.ts,layout.tsx,province-setting.tsx}`
- **Pano:**
  - `src/lib/agency/funnel.ts`, `funnel.test.ts`
  - `src/app/[locale]/(app)/ajans/{page.tsx,funnel-panel.tsx}`
  - `tests/agency-funnel.live.test.ts`
- **Karne:** `src/lib/readiness/share.ts`, `share.test.ts`, `src/app/[locale]/fon-hazirlik/readiness-check.tsx` (1 satır)
- **Metin ve doküman:** `messages/{tr,en}.json` (`Auth.province*`, `tenantProvince.*`, `agency.funnel.provinceApply/provinceNote`; `provinceNotCollected` kaldırıldı), `docs/DATA_MODEL.md` §19
- **Kanıt:** 7 kare

Komşuların commit'lenmemiş dosyalarına dokunulmadı: `agency-channel-notice-addendum.md`, `processing-register*.md` ve cs-fb raporu olduğu gibi duruyor, staged silme de yerinde.

## 4. Riskler

- **B12 eki (cs-fb düzeltiyor; eke DOKUNMADIM) — il satırı artık eskidi:**
  - §2.2 tablosundaki satır (dosyada satır ~63) şöyle diyor: "**İl** kırılımı — İl toplanmıyor; panoda 'İl bilgisi henüz toplanmıyor' yazar. `Tenant`'ta il yok". Bu satırın §2.1'e (kodda olan) taşınması gerekiyor. Taşınan satır şunu söylemeli: il kayıtta isteğe bağlı soruluyor, kurum ayarlarında değiştirilebiliyor, panoda il filtresi var, `<5` kuralı iller arasında da uygulanıyor, ilsiz kurumlar yalnız "Tüm iller"de sayılıyor.
  - EN kullanıcı metninde (satır ~162) şu cümle var: "The agency's breakdowns use the **organisation type** … we do not collect new data for this". Artık isteğe bağlı il toplandığı için bu cümle yanlış. TR karşılığı da kontrol edilmeli.
  - KVKK notu: il kurum düzeyinde bir veri, kişisel veri değil. Yine de kullanıcı metni "ajans kırılımı yalnız kurum türüne dayanır" diyorsa düzeltilmeli.
  - §3.1 sürüm artışı (consent-documents) cs-fb/hukukun kararı.
- **Maske sezgisel:** tek denklemli fark saldırılarını kapatıyor (satır, sütun, iller arası; mutasyonla ve 400 rastgele tabloda özellik testiyle kanıtlı). Çok denklemli bir doğrusal programlama saldırısına karşı ise formel bir denetim değil. İleride ayrıca şu gelirse bu fonksiyon genişletilmeli: B3 raporu ya da 30↔90 gün farkı; 30↔90 gün farkı B2'de de zaten var olan bir durum.
- **İlsiz kurum kalıntısı:** ilini bildirmeyen kurum sayısı 1..4 ise en büyük il de gizleniyor. Bu doğru davranış ama ilk haftalarda il görünümlerinin çoğu `<5` gösterebilir. Panodaki not bunu açıklıyor.
- **Eski fonksiyon:** `agency_funnel_counts` artık çağrılmıyor ama yerinde duruyor. Canlı testi hâlâ onu da doğruluyor. Temizlik ayrı bir kart olmalı.
- OAuth dalı gerçek Google/Microsoft ile koşulamadı. Mantık ack çereziyle aynı ve kod okumasıyla doğrulandı; credentials dalı ise gerçek tıklamayla doğrulandı.

## 5. Açık sorular

- Ayarlarda ili değiştirme yetkisi `manage_users` (sahip/yönetici) olarak seçildi, çünkü kurum düzeyindeki başka bir izin yok. LEED-FB farklı bir rol isterse tek satırlık değişiklik yeter.
- Önceden var olan, kapsam dışı bir erişilebilirlik bulgusu: AuthCard'daki e-posta/ad/kurum/şifre `<label>`'ları input'a bağlı değil (`htmlFor` yok). Ekran okuyucu alan adını okumuyor; Playwright da `getByLabel` ile bulamadı. Yeni il alanı bağlı. Ayrı bir kart önerilir.

## 6. Sonraki adım

- cs-fb: B12 ekindeki il satırını ve EN/TR "yeni veri toplamıyoruz" cümlesini güncellemeli (§4).
- B3 (bölge raporu) aynı `maskProvinceTable` fonksiyonunu kullanmalı, ayrı bir maske yazmamalı.
- `agency_funnel_counts` temizlik kartı açılmalı.

**Platform beyanı:** Doğrulama macOS (Darwin 27, Apple Silicon) üzerinde yapıldı. Postgres, docker `fabrika-postgres` içinde çalıştı (psql bu makinede yok, `docker exec` sarmalayıcısıyla koşuldu); tarayıcı Playwright headless Chromium. Dokunulan kod yolları platforma bağlı değil: SQL, Next.js sunucu/istemci kodu, çerez ve `<select>`. Windows ve Linux'ta davranış aynı olmalı. `apply-migrations.sh` bash betiği; Windows'ta WSL ya da Git Bash gerektirir, ama bu değişiklikten önce de öyleydi. Windows ve Linux koşulamadı, çünkü bu ofiste yalnız mac makinesi var.
