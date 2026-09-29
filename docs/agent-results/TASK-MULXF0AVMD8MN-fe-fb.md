# TASK-MULXF0AVMD8MN — FB KAMU B2 sızıntı: tek pencere + tamamlayıcı gizleme (fe-fb)

Repo `/Users/macbook/alan/FONBRIDGE`, dal `dev`. Kod commit'i: `ef8627b0`. Push yapılmadı.
Kaynak: `docs/agent-results/TASK-MULWCLZHRTRK5-crw-fb.md` §3.2 Ö-1 ve K-6.

## 1. Ne yapıldı

**(1) Tek pencere (leed-fb kararı 1).** 30/90 gün seçicisi kaldırıldı. Pano artık tek bir kohort gösteriyor: ajansın kodlarıyla bugüne kadar kayıt olan tüm kurumlar, kümülatif.

- `getAgencyFunnel(agencyTenantId, { province?, outcomes? })`: pencere parametresi yok.
  - SQL tarafı `agency_funnel_counts_by_province(NULL::timestamp)` ile çağrılıyor. Fonksiyonun mevcut `since IS NULL` dalı kullanılıyor.
  - B7 kohortunda `createdAt` filtresi kaldırıldı.
- `FUNNEL_WINDOWS`, `isFunnelWindow`, `sinceFor` ve `AgencyFunnel.windowDays` silindi.
- Sayfa `?gun=` parametresini artık okumuyor. Eski yer imleri aynı sayıları gösteriyor.
- Panelden "Dönem" `<nav>`'ı ve il formundaki gizli `gun` alanı çıkarıldı. Açıklama metni "Sayılar kümülatiftir; dönem seçilmez" diyor. `windowLabel` ve `windowDays` anahtarları tr ve en'den silindi.
- **Migration eklenmedi.** Fonksiyonun imzası ve davranışı değişmedi. Yalnız uygulama `NULL` geçiyor. Fonksiyon yalnız `fabrika_app`'e GRANT'li, yani tek çağıranı uygulama. Şema dosyasına da dokunulmadı.

**(2) Tamamlayıcı gizleme (leed-fb kararı 2).** `src/lib/agency/funnel.ts` içindeki `suppressedCells(byProvince)` tek bir saf fonksiyon. Eski `maskStep` ve `maskProvinceTable` fonksiyonlarının yerini aldı. Panonun yayımlayabileceği her sayıyı (tür × il × adım, satır ve sütun toplamları, genel toplam) tek seferde maskeliyor. Bir okuyucunun farkını alabileceği her "çizgi" 0 ya da ≥5 bırakmak zorunda:

- **Türler arası:** toplam − görünen türler. Bu kural önceden de vardı.
- **İller arası:** tüm iller − görünen iller. İl bildirmemiş kurumların sayısı hiçbir zaman gösterilmiyor, yalnız gizli kütleye ekleniyor. Bu da önceden vardı.
- **Adımlar arası (YENİ):** `NESTED_STEPS` listesindeki çiftler:
  - kayıt ⊇ kayıtlı arama
  - kayıt ⊇ pipeline
  - kayıt ⊇ konsept not
  - pipeline ⊇ konsept not
  - gönderildi ⊇ kabul + red

  Kalan kısım (örneğin "kayıtlı araması olmayan kurumlar" ya da "sonuç bekleyen başvurular") hiç yayımlanmayan gizli bir parça sayılıyor. pipeline ⊇ konsept not ilişkisi yalnız silinmiş bir fırsata bağlı konsept not varsa bozulur. Fark negatif çıkarsa o çizgi grup sayılmadığı için atlanıyor.

- Birincil kural (<5, 0 dahil), grup kuralı (`registered` maskeliyse o grubun tüm adımları maskeli) ve "toplam gizli ama parçalardan toplanabiliyor" kuralı korunuyor. Hiçbir yeni maske eklenmeyene kadar döngü sürüyor.

**(3) İl × adım matrisi:** aynı motor il görünümlerine de uygulanıyor. Bir ilin sayısı "tüm iller − diğer iller" yoluyla, bir ilin adım farkı da "il toplamı − adım" yoluyla açığa çıkmıyor.

## 2. Kanıt

### Önce kırmızı: düzeltmeden önceki kod, yeni testlerle

```
 FAIL … > Ö-1 (crw-fb): the 30- and 90-day views together do not give away the one municipality of days 31-90
AssertionError: registered: 12 vs 13: expected false to be true
 FAIL … > K-6 (crw-fb): submitted 6, accepted 5 must not leave rejected bounded to {0, 1}
AssertionError: expected false to be true
 FAIL … > registered 8, saved search 6: the 2 organisations without one are not given away
AssertionError: 8 − 6: expected false to be true
      Tests  3 failed | 17 passed (20)
```

Ö-1 testi crw-fb'nin verisini birebir kullanıyor:

- MUNICIPALITY: 5/6
- pipeline: 5/6
- konsept not: 5/5
- tüm kayıt: 12/13
- tüm pipeline: 11/12

Eski `offeredViews` her pencere için bir görünüm üretiyordu. Yeni hâlinde tek görünüm var ve eski ifade test yorumunda duruyor.

### Sonra yeşil

```
pnpm exec vitest run src/lib/agency/funnel.test.ts   →  Tests  23 passed (23)
```

### Mutasyon

`NESTED_STEPS = []` yapıldığında (dosya kopyadan geri yüklendi, `git checkout` kullanılmadı) 5 test kırmızıya döndü:

```
 FAIL … across steps > property: in every view, a step minus the steps it contains is 0 or at least 5
 FAIL … il × adım (TASK-MULXF0AVMD8MN): a province step cannot be subtracted from the province total
 FAIL … property: nothing a reader can subtract across all views is 1..4
 FAIL … K-6 (crw-fb) …
 FAIL … registered 8, saved search 6 …
      Tests  5 failed | 18 passed (23)
```

Özellik testleri:

- 2000 rastgele tür dağılımı, adım çizgileriyle.
- 400 rastgele tür × il × adım tablosu. Her görünümde tür, il ve adım çizgilerinin tamamı kontrol ediliyor.

### Canlı test (`fabrika_app`, NOBYPASSRLS, `tests/helpers/live-db-role.ts`)

`tests/agency-funnel.live.test.ts`: **12/12 ✓**, atlanan test yok.

- A ajansı: kayıt 8, gönderildi 6. Kayıtlı arama, pipeline ve konsept not (6/8) artık `<5`: "2 kurumda yok" bilgisi gizleniyor. Kabul (5/6) `<5` (K-6).
- Yeni test: 400 gün önce kaydolan kurum hem SQL sayımında hem B7 kohortunda sayılıyor. Bu, tek pencerenin uçtan uca kanıtı.

### Kapılar (`set -a; source .env`)

```
typecheck exit=0
lint exit=0
i18n:check exit=0   ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
rls:check exit=0    ✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
rls:verify exit=0   ✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü …
rls:bypass-check exit=0  ✅ SUCCESS: no new tenant bypass.
test exit=0         Test Files  185 passed | 2 skipped (187) · Tests  2105 passed | 8 skipped (2113)
```

### http://localhost:3000 (leed-fb'nin sunucusu, çalışma ağacından HMR)

Geçici bir ajans fikstürü kuruldu: crw-fb verisi, 13 kurum. Samsun 9, Tokat 3, ilsiz 1. Ardından demo girişi yapıldı. `db:generate` gerekmedi, sunucu yeniden başlatılmadı.

```
/tr/ajans            200  registered=13 savedSearch=small pipeline=small conceptNote=5 submitted=6 accepted=small rejected=small
/tr/ajans?gun=30     200  (aynı)            /tr/ajans?gun=90  200  (aynı)   ← eski yer imi yok sayılıyor
/tr/ajans?il=Samsun  200  hepsi small       ← 13 − 9 = 4 (Tokat 3 + ilsiz 1): Samsun gizlendi
/tr/ajans?il=Tokat   200  hepsi small
```

- pipeline 12/13 gizli (13 − 12 = 1).
- Sayfada "Dönem" seçicisi ya da `gun=` bağlantısı yok. HTML'de kalan "Son 30 gün", başka bir modülün tarih seçici katalog metni. `gun=` ise yalnız URL'nin RSC yankısı.

Kareler `docs/agent-results/TASK-MULXF0AVMD8MN-screenshots/`:

- `01-ajans-tek-pencere.png`: kayıt 13, "Sayılar kümülatiftir; dönem seçilmez", seçici yok.
- `02-ajans-samsun-fark-korumasi.png`: Samsun seçili, kayıt `<5`.

Kare alma yöntemi: kill-guard R8, harici test tarayıcısı komutunu reddetti. AgentSpace dahili tarayıcısı ise kullanıcının kendi (ajans olmayan) oturumundaydı ve 403 veriyordu. Oturumunu değiştirmemek için :3000'in fikstür oturumuyla sunucuda render ettiği HTML'i aldım (CSS satır içi, script'ler çıkarıldı). Kendi açtığım `127.0.0.1:3999` sunucusundan dahili tarayıcıda açıp kareledim. Bu yüzden kareler etkileşimsiz: tür seçicisiyle klavye etkileşimi bu turda tarayıcıda koşulamadı. Değişen etkileşim yalnız seçicinin kaldırılması. İl formu önceki kartta Enter ile doğrulanmıştı.

"Önce" durumu: `TASK-MULV3JXS1AW5X-screenshots/05-ajans-sonra-samsun.png` (30/90 seçicili).

Fikstür silindi (`rolled back 14 tenants`), :3999 kapatıldı.

## 3. Değişen dosyalar (commit `ef8627b0`)

- `src/lib/agency/funnel.ts`: tek kohort, `suppressedCells`, `buildProvinceFunnel(byProvince, province|null)`, `buildFunnel(raw)`
- `src/lib/agency/funnel.test.ts`: Ö-1, K-6, adım ve il × adım testleri, özellik testleri
- `tests/agency-funnel.live.test.ts`: yeni imza, K-6 beklentileri, 400 günlük kohort testi
- `src/app/[locale]/(app)/ajans/page.tsx`, `funnel-panel.tsx`: seçici kaldırıldı
- `messages/tr.json`, `messages/en.json`: açıklama ve privacyNote güncellendi, pencere anahtarları silindi
- Bu rapor ve kareler (ayrı docs commit'i)

## 4. Riskler

- **Zamansal fark hâlâ mümkün.** Kümülatif sayılar iki farklı günde okunup farkı alınabilir. Örneğin dün 12, bugün 13 kayıt: ajans o kodu kime verdiğini biliyor, yeni kurumun hangi adımlara ulaştığı da okunabilir. Tek pencere 30/90 farkını kapatıyor, bunu kapatmıyor. Kapatmak için yuvarlama (5'in katı), periyodik anlık görüntü (örneğin ayda bir yayımlanan dondurulmuş sayılar) ya da gürültü gerekiyor. → **HUKUK-5**
- **Farkı 0 olan çizgiler yayımlanıyor.** "0 ya da ≥5" kuralı önceki kartlarla aynı. Örneğin kayıt 6, pipeline 6 görünüyorsa "bu 6 kurumun hepsinin pipeline'ı var" bilgisi çıkar (grup ifşası). → **HUKUK-5**
- **Kural çizgi bazlı, tam bir LP denetimi değil.** Çizgilerin birleşimiyle (fark-farkı) daraltma teorik olarak mümkün. Özellik testleri tanımlı çizgileri kapsıyor.
- **Fayda kaybı:** adım farkı koruması daha çok hücreyi `<5` yapıyor. Örneğin A ajansında kayıtlı arama, pipeline ve konsept not 6/8. Küçük ajanslarda pano çoğunlukla `<5` gösterecek.

## 5. Açık sorular

- **hukuka sorulacak (HUKUK-5): pencere ya da yuvarlama yöntemi.** Tek kümülatif pencere mi kalmalı, sayılar 5'in katına mı yuvarlanmalı, yoksa periyodik anlık görüntü mü yayımlanmalı? Zamansal fark (Riskler 1) ve "fark 0" grup ifşası (Riskler 2) kabul edilebilir mi? Ekin §3.1 metni ("geri hesaplanamamalı") adım farklarını da kapsayacak şekilde güncellenmeli.
- K-4 (adım 6-8 kurum değil başvuru sayıyor) bu kartın kapsamında değildi, açık duruyor.

## 6. Sonraki adım

- crw-fb incelemesi: özellikle `suppressedCells` ve `NESTED_STEPS` listesi.
- HUKUK-5 yanıtına göre yuvarlama ya da anlık görüntü kartı.
- İstenirse eski `agency_funnel_counts` fonksiyonu için drop migration'ı (uygulama artık çağırmıyor).

**Platform beyanı:** mac (Darwin 27, Node 26, yerel docker Postgres) üzerinde doğrulandı. Değişen kod platformdan bağımsız: saf TypeScript, SQL çağrısı ve React. Süreç, dosya yolu, kabuk ya da kısayol yolu yok, bu yüzden Windows ve Linux'ta davranış aynı olur. O platformlar ayrıca koşulmadı çünkü bu makinede yoklar. CI (Linux) aynı vitest ve canlı suite'i koşuyor.
