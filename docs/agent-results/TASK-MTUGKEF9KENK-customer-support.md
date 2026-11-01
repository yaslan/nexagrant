# TASK-MTUGKEF9KENK — Admin konsolu kanıtsız RLS iddiaları (CLAUDE.md kural 7 ihlali)

## 1. Ne yapıldı

`src/app/[locale]/admin/layout.tsx` içindeki üç kanıtsız, koda gömülü RLS uygulanırlık
iddiası kaldırıldı:

- Satır ~103 (eski): masaüstü header'da `<Lock/> RLS Protected` rozeti — **silindi**.
- Satır ~145 (eski): sol menü "Hızlı Sistem Metriği" kutusunda `RLS Güvenlik: 30 / 30 Tablo`
  satırı — **silindi**.
- Satır ~167 (eski): footer'da `<ShieldCheck/> RLS Policy %100 Enforced` rozeti — **silindi**.

Önce iddiayı bizzat doğruladım: uygulamanın ana `DATABASE_URL`'i (`src/lib/db.ts:6`)
`fabrika` rolüyle bağlanıyor; bu rol `SUPERUSER` + `BYPASSRLS`
(`prisma/rls-app-role.sql:1-9` yorumu, `docs/SECURITY_COMPLIANCE.md:51-52` ve `:83-84`)
— yani RLS politikaları bu bağlantıda **hiç değerlendirilmiyor**. Politikaların gerçekten
zorlandığı tek yer, ayrı `fabrika_app` (NOBYPASSRLS) rolüyle çalışan
`DATABASE_URL_RLS_TEST` + `tests/rls.spec.ts`; bu da ana bağlantının davranışını
kanıtlamıyor. Bu bilgi zaten paylaşımlı hafızada mevcuttu (bkz.
`fabrika-local-app-role-bypasses-rls`, `fabrika-tenant-isolation-real-defense-is-app-level-where`) —
kod incelemesiyle doğrulanmış hâliyle teyit ettim, yeni bir bulgu değil.

Kaldırma yolunu seçtim (görevde verilen iki seçenekten biri: "kaldırmak ya da doğruyu
söyleyen bir ifadeyle değiştirmek"), çünkü doğru bir sayı göstermek için gereken canlı
"ölçülmüş" bir Evidence/TopicStat kaynağı bugün yok ve onu inşa etmek (örn.
`scripts/check-rls.ts` çıktısını admin sayfasına canlı bağlamak) kapsam sınırının dışına
taşan ayrı bir iş olurdu. Sahte bir rakamın yerine sessiz bir rakam koymak yerine iddiayı
tamamen kaldırdım.

Kaldırılan JSX hiçbir yerde `t()` kullanmıyordu (üç metin de düz string'ti), bu yüzden
mesaj kataloglarına (`messages/tr.json` / `messages/en.json`) yeni anahtar eklemedim —
yeni kullanıcıya görünen metin eklenmedi, yalnızca var olan yanıltıcı metin silindi.
`pnpm i18n:check` bunu doğruladı (aşağıda).

Kullanılmayan `Lock` ve `ShieldCheck` (`lucide-react`) import'ları da temizlendi (artık
hiçbir yerde kullanılmıyorlardı).

`docs/ROADMAP.md` "Açık kararlar" bölümüne madde 16 olarak gerçek durumu ve kapsam dışı
bırakılan büyük işi (ana `DATABASE_URL`'i `fabrika_app`'e çevirmek) yazdım.

### Kapsam dışı bırakılan, DOKUNULMAYAN başka kanıtsız iddialar (görev talimatı gereği: düzeltme, bildir)

Aynı dosyada RLS'le ilgisi olmayan ama aynı sınıftan (koda gömülü, Evidence'a bağlı
olmayan sabit "durum" rakamı) iki iddia daha var — görev kapsamı yalnız RLS iddialarıydı,
bunlara dokunmadım:

- `src/app/[locale]/admin/layout.tsx:93` (yeni satır no) — `Sistem Durumu: Aktif (%100 Operational)`
  header'daki "System Health Badge" içinde, koda gömülü sabit metin.
- `src/app/[locale]/admin/layout.tsx:131` (yeni satır no) — sol menüdeki "Sistem Sağlığı"
  kutusunda `100% OK`, koda gömülü sabit metin.

İkisi de hiçbir gerçek sağlık kontrolüne/Evidence kaydına bağlı değil, kullanıcı yanıltıcı
"her şey %100 çalışıyor" izlenimi alıyor. Ayrı bir karar/kart gerektirir.

## 2. Kanıt

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — temiz)

$ pnpm lint
$ eslint
(dosyamda 0 hata/uyarı; repo genelinde ilgisiz 2 pre-existing uyarı var, dokunmadım)

$ pnpm i18n:check
$ tsx scripts/i18n-check.ts
=== i18n Translation Audit Report ===
Summary:
  Static keys used in code: 1072
  Dynamic key patterns:     31
  Keys in messages/tr.json: 1425
  Keys in messages/en.json: 1425
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.

$ grep -rln "RLS Protected\|RLS Policy %100\|RLS Güvenlik" src/ tests/
(sonuç yok — kaldırılan metinlere başka hiçbir yerden referans yok, örn. test yok)

$ git diff --stat -- 'src/app/[locale]/admin/layout.tsx' docs/ROADMAP.md
 docs/ROADMAP.md                   |  1 +
 src/app/[locale]/admin/layout.tsx | 18 +-----------------
 2 files changed, 2 insertions(+), 17 deletions(-)
```

Doğrulama kaynakları (elle okundu):
- `src/lib/db.ts:6,58-62` — ana `DATABASE_URL` fallback'i `fabrika` rolü; `createDbClient`
  yorum bloğu: "the default `fabrika` role is SUPERUSER and therefore exempt from them [RLS policies]".
- `prisma/rls-app-role.sql:1-9` — "the local `fabrika` role is SUPERUSER + BYPASSRLS... Any
  'RLS works' claim made through that role is meaningless."
- `docs/SECURITY_COMPLIANCE.md:51-52,83-84` — aynı uyarı Türkçe; ana bağlantının
  `fabrika_app`'e çevrilmesinin "ayrı bir iş" olduğu açıkça yazıyor.

## 3. Değişen dosyalar

- `src/app/[locale]/admin/layout.tsx` — 3 kanıtsız RLS iddiası (rozet ×2, metrik satırı ×1)
  kaldırıldı; kullanılmayan `Lock`/`ShieldCheck` import'ları temizlendi.
- `docs/ROADMAP.md` — "Açık kararlar" bölümüne madde 16 eklendi (gerçek durum + kapsam
  dışı bırakılan büyük iş).
- `docs/agent-results/TASK-MTUGKEF9KENK-customer-support.md` — bu rapor.

Commit ATILMADI (görev talimatı gereği) — değişiklikler çalışma ağacında bırakıldı.

## 4. Riskler

- UI'da rozetlerin kaldırılması admin konsolunu görsel olarak biraz daha "boş" bırakıyor
  (header sağ üstte artık yalnız kullanıcı menüsü, footer'da yalnız versiyon metni). Bu
  bilinçli bir tercih: doğru bir "ölçülmüş" göstergenin yerini almadan sahte bir rozeti
  tutmak, CLAUDE.md kural 7'yi ihlal etmeye devam ederdi.
- Aynı dosyada kalan iki ilgisiz kanıtsız iddia (§1'de listelendi) hâlâ kullanıcıyı
  yanıltıyor; bunlar için ayrı bir karar/kart gerekiyor.
- `src/app/[locale]/admin/layout.tsx` içinde başka kanıtsız/kanıta-bağlanmamış metin
  olup olmadığını satır satır taramadım (dosyanın tamamını okudum, RLS + iki ek bulgu
  dışında böyle bir örüntü görmedim), ama derinlemesine bir "kanıt disiplini" taraması
  bu kartın kapsamı dışındaydı.

## 5. Açık sorular

- İki kalan kanıtsız "sistem sağlığı %100" iddiası için ayrı kart açılmalı mı, yoksa
  bu kartın devamı olarak mı ele alınmalı? (Görev talimatı yalnız bildirmemi istedi,
  düzeltmemi değil.)
- Ana `DATABASE_URL`'in `fabrika_app`'e çevrilmesi (RLS'i üretimde gerçekten zorlamak)
  ne zaman ele alınacak — `docs/ROADMAP.md` madde 16'da açık bırakıldı, sahiplenen yok.

## 6. Sonraki adım

- Patron/PM, madde 16'daki açık kararı (DATABASE_URL rol geçişi) önceliklendirsin.
- İsteyen biri, §1'de bildirilen iki kalan kanıtsız "sistem sağlığı" iddiası için ayrı
  bir kart açsın.

## Platform beyanı

Doğrulama **mac (Darwin 25.6.0)** üzerinde yapıldı — `pnpm typecheck`, `pnpm lint`,
`pnpm i18n:check` bu platformda koşuldu ve temiz geçti. Bu değişiklik yalnız JSX/metin
kaldırma ve bir markdown satırı ekleme; platforma bağlı hiçbir kod yolana (süreç,
dosya yolu, kabuk, ekran/DPI, izin) dokunmadı, bu yüzden Windows/Linux'ta davranış
farkı beklenmiyor. Görev talimatı gereği `pnpm dev` / `pnpm test:e2e` / `pnpm gate`
ve DB'ye dokunan hiçbir komut koşulmadı (bu turda blok-zincir-dev'e ayrılmıştı);
görsel/tarayıcı doğrulaması bu yüzden yapılamadı — yalnız statik analiz (typecheck,
lint, i18n gate) ile doğrulandı.
