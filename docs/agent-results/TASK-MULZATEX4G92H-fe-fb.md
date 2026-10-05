# TASK-MULZATEX4G92H — FB KAMU B2 SIZINTI-2 (fe-fb)

Repo `/Users/macbook/alan/FONBRIDGE`, dal `dev`, kod commit'i `8f4048db` (üstü `672c973e`). Push yok. Migration ve `db:generate` gerekmedi, :3000 yeniden başlatılmadı.

## 1. Ne yapıldı

Kaynak: `docs/agent-results/TASK-MULYGTXCZNCOP-crw-fb.md` Kart 1 (B-1, Ö-1, K-1, K-2). crw-fb'nin `poc.ts`, `attack.py` ve `d1.json` inst 87 verisini okudum.

1. **Tek boyut (karar 1).** `getAgencyFunnel(…, { breakdown })` yanıtı toplamı ve yalnız **bir** kırılımı taşır:
   - `{ dimension: 'province', province }`: o il, tüm türler toplu;
   - `{ dimension: 'orgType' }`: her tür, tüm iller toplu;
   - `{ dimension: 'none' }`.

   Tür × il hücresi artık hiçbir yanıtta yok. Gizleme yine iki boyut birlikte hesaplanır (`suppressedCells`), çünkü iki görünüm aynı büyük toplamı paylaşır ve aralarında yalnız bir istek vardır. Sayfa parametresi `?kirilim=tur` ya da `?kirilim=<il>`. Eski `?il=` bağlantısı o ili açar.

2. **Kurum birimi (karar 2, Ö-1).** `countApplicationOutcomes(ids, since, { unit: 'organisation' })` modu eklendi (be-fb'nin dosyası). Varsayılan davranış değişmedi, `application-outcome.live` yeşil. Funnel her zaman bu modu çağırır. Böylece tüm adımlar kurum sayar. Adım çizgileri buna göre güncellendi:
   - her adım ⊆ `registered` (kayıt−gönderildi, kayıt−kabul, kayıt−red dahil);
   - kabul ⊆ gönderildi ve red ⊆ gönderildi ayrı çizgiler. Bir kurum ikisine birden girebilir, bu yüzden "gönderildi − kabul − red" artık bir grup değil.
3. **Kural (a).** Görünür bir toplamın örttüğü gizli kütle, değeri >0 olan **en az iki** gizli parçadan oluşmalı ve toplamı ≥5 olmalı. Sıfırlar örtü sayılmaz. Tek bir sıfırdan büyük gizli parça ≥5 olsa bile örtü sayılmaz: 22 = 13 + 9 gibi bir tabloda o parça, toplamdan görünürleri çıkarınca okunur.
4. **Saldırgan kapısı (karar 3b).** `src/lib/agency/funnel.attack.test.ts`: tam sayılı aralık yayılımı, yeni bağımlılık yok.
   - Bilinmeyenler: tüm adım × (tür|hepsi) × (il|ilsiz|hepsi) hücreleri ve her seviyede "ebeveyn − çocuk" kalanları.
   - Girdi: her görünümün yayımladığı her sayı.
   - Kısıtlar: toplam denklemleri, ≥0 ve alt küme ilişkileri.
   - Saldırgan hangi illerde kurum olduğunu da bilir; bu, sayfanın gösterdiğinden fazla bir bilgi.
   - Test: hiçbir gizli nicelik için, gerçek değeri 1..4 iken "1 ≤ alt ve üst ≤ 4" (tam değer dahil) çıkmamalı.
   - Kapsam: crw-fb'nin iki örneği ve 3 tohum × 300 rastgele küçük tablo (mulberry32).
5. **Yedek (karar 4) — HUKUK-5.** Kural temelli gizleme gate'i (3×300) geçti. Ama geniş taramada **hâlâ açık buldu** (aşağıda). Kararın dediği gibi, gösterilen tüm sayılar 5'in katına yuvarlanıyor (`roundToFive`):
   - her sayı ayrı yuvarlanır, toplamlar da;
   - eşik korunur: yalnız ≥5 gösterilir, "5" 5..7 demektir;
   - saldırgan görünür sayıyı `[max(5, v−2), v+2]` aralığı olarak alır.

   Metin: privacyNote'a "5'in katına yuvarlanır; parçaların toplamı toplamı tutmayabilir" eklendi.

6. **K-2.** `normalizeProvinces`: `TR_PROVINCES` dışındaki anahtar `NO_PROVINCE`'a birleştirilir, sessizce düşmez. `suppressedCells` ve `buildAgencyFunnel` bunu girişte uygular. Testi var.
7. **K-1.** Kod başına `usedCount` <5 ise sunucudan `null` gelir ve "<5 / {max} kullanıldı" olarak gösterilir (`shownUsedCount`, sayfa ve `listInviteCodes` aynı fonksiyonu kullanır). "{left} kaldı" da gizlenir, çünkü max − left = used. Durum için sunucu ayrı bir `exhausted` bayrağı yollar.
8. **UI.** Tek bir "Kırılım" GET formu var: seçenekler "Kırılım yok", "Kurum türüne göre", "İle göre" optgroup'u altında 81 il, ve "Uygula" düğmesi. İstemci tarafında bir "Gösterilen grup" seçicisi, yanıttaki satırlar arasında seçim yapar: toplam + il, ya da toplam + türler. Etiket, `aria-describedby`, `min-h-11` hedef boyutu ve focus-visible halkası mevcut desenle aynı. Adım 6-7 ipuçları "En az 1 … kurum" oldu.

## 2. Kanıt

**Kırmızı (eski kod, HEAD `672c973e` üzerindeki funnel ile, yeni saldırgan):**

```
× Samsun: 22 = 13 MUNICIPALITY + 9 PUBLIC … → 9 − 8 = 1
    { target: "~registered-conceptNote|PUBLIC|Samsun", truth: 1, lo: 1, hi: 1 } …
× registered|LARGE|<no province> = 3 …
    { target: "registered|LARGE|", truth: 3, lo: 3, hi: 3 } …
× seed 1: 171/300 tables leak   × seed 7: 169/300   × seed 42: 162/300
Tests  5 failed | 1 passed (6)
```

İki örnek, crw-fb'nin LP'sinin bulduğu değerlerin tıpatıp aynısı. Açık sayısı crw-fb'ninkinden (35-42/150) yüksek. Sebep: saldırgan artık kurum birimi alt kümelerini de (kayıt ⊇ gönderildi) biliyor ve eski kod bunları korumuyordu.

**Yeşil (8f4048db):**

```
src/lib/agency/funnel.attack.test.ts  Tests 6 passed (6)
src/lib/agency/ (funnel + attack + codes + invite-code)  Tests 30 passed (30)
```

**Yedek neden devreye girdi.** Aynı saldırganı, yuvarlamadan önceki (yalnız kural (a) + tek boyut) kodla daha büyük tablolarda koştum: 5 il, 1-6 tür, 20 tohum × 1000 tablo. Sonuç: tohum başına 1-2 tabloda açık. Örnekler:

```
#91 submitted|RESEARCH|*=4 ∈ [4, 4]
#747 submitted|NGO|*=3 ∈ [3, 3]
#588 ~submitted-rejected|PUBLIC|*=2 ∈ [1, 3]
```

Aynı geniş tarama yuvarlamayla: `Tests 23 passed (23)`, yani 20.000 tablonun **hiçbirinde açık yok**. Geniş koşu repoya girmedi (süresi ≈40 sn). Gate testi 3×300 ile ≈2 sn sürüyor.

**Bağımsız çapraz kontrol (scipy HiGHS LP).** crw-fb'nin `attack.py`'sini yeni yayın biçimine uyarladım: görünür sayı = yuvarlama aralığı, kurum birimi alt kümeleri, tür × il hücreleri bilinmeyen. Scratchpad'de `lp.py`:

```
instances 400 small targets checked 35200 breaches 0
```

**Canlı test (fabrika_app, `.env` kaynaklı, atlanmadı):**

```
tests/agency-funnel.live.test.ts  13 ✓ (dahil: "Ö-1: B7 in organisations counts 6 who applied where applications count 8",
  "the B7 list … the funnel always asks for organisations", il görünümünde tür yok)
tests/agency-funnel.live + application-outcome.live + agency-invite.live → Test Files 3 passed, Tests 38 passed
```

**Kapılar (`set -a; source .env`):**

| Kapı                    | Sonuç                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `pnpm typecheck`        | rc=0                                                          |
| `pnpm lint`             | rc=0                                                          |
| `pnpm test`             | rc=0 — `Tests 2181 passed \| 8 skipped (2189)`                |
| `pnpm rls:check`        | rc=0                                                          |
| `pnpm rls:verify`       | rc=0                                                          |
| `pnpm rls:bypass-check` | rc=0                                                          |
| `pnpm i18n:check`       | rc=0 — "both catalogs agree … no file gained hard-coded text" |

**http://localhost:3000 (leed-fb'nin sunucusu, HMR).** Geçici fikstür: 26 kurum (Samsun: 7 belediye + 8 KOBİ, Tokat: 5 + 6, hepsi il bildirmiş) ve 3 davet kodu (1/1, 7/25, 3/25). Demo girişi curl ile yapıldı (302).

```
/tr/ajans                → breakdown none; registered=25 (26) pipeline=25 conceptNote=small (26−22=4) submitted=20 (18) accepted=10 (8) rejected=small
/tr/ajans?kirilim=tur    → "dimension":"orgType"; MUNICIPALITY registered 10 (12), SME 15 (14) — il yok
/tr/ajans?kirilim=Samsun → "dimension":"province","province":"Samsun","view":{registered 15 …} — byOrgType/tür yok
/tr/ajans?kirilim=Tokat  → Tokat registered 10 (11)
/tr/ajans?il=Samsun      → eski bağlantı Samsun'u açıyor
/tr/ajans?kirilim=Samsunn→ kırılım yok
Davet kodları: "<5 / 25 kullanıldı" · "7 / 25 kullanıldı · 18 kaldı" · "<5 / 1 kullanıldı" + Tükendi
```

Kareler `docs/agent-results/TASK-MULZATEX4G92H-screenshots/`:

- `01-kirilim-il-samsun.png`: Kırılım = Samsun, "Gösterilen grup" seçicisi, kayıt 25.
- `02-kirilim-kurum-turu.png`: Kırılım = Kurum türüne göre (tüm iller).
- `03-davet-kodlari-k1.png`: K-1, `<5 / 25` ve `<5 / 1`.

Kare yöntemi önceki kartla aynı. Dahili tarayıcı kullanıcının kendi oturumunda olduğu için oturumu değiştirmedim. :3000'in fikstür oturumuyla SSR ettiği HTML'i aldım (CSS satır içi, script yok) ve kendi `127.0.0.1:3999` sunucumdan kareledim. Kareler bu yüzden **etkileşimsiz**: "Gösterilen grup" seçicisinin istemci tarafı değişimi ve klavye akışı tarayıcıda koşulamadı. Grup verisinin yanıtta doğru geldiği RSC yükünden doğrulandı (yukarıda). Kareler dar (mobil) genişlikte; taşma yok. Fikstür silindi (`rolled back 27 tenants`), :3999 kapatıldı.

"Önce": `TASK-MULXF0AVMD8MN-screenshots/02-ajans-samsun-fark-korumasi.png` (tür seçici + il formu ayrı).

## 3. Değişen dosyalar (`8f4048db`)

- `src/lib/agency/funnel.ts`: `FunnelBreakdown`, `buildAgencyFunnel`, `normalizeProvinces`, `roundToFive`, 1-D `suppressedCells`, kural (a), yeni `NESTED_STEPS`. `buildProvinceFunnel` kaldırıldı.
- `src/lib/agency/funnel.attack.test.ts` (yeni): saldırgan kapısı.
- `src/lib/agency/funnel.test.ts`: kurallar ham sayılarla `suppressedCells` üzerinden, gösterim ise yuvarlamayla test ediliyor. Eski "gösterilen iki sayının farkı" testleri, yuvarlamayla anlamsızlaştıkları için saldırgan testine devredildi.
- `src/lib/agency/codes.ts` ve `codes.test.ts` (yeni): `shownUsedCount`.
- `src/lib/k5-pipeline/applicationOutcome.ts`: `OutcomeUnit`, `options.unit` (be-fb'nin dosyası; eklendi, varsayılan aynı).
- `src/app/[locale]/(app)/ajans/page.tsx`, `funnel-panel.tsx`, `invite-codes-panel.tsx`, `actions.ts`.
- `messages/tr.json`, `messages/en.json`.
- `tests/agency-funnel.live.test.ts`: yeni imza, kurum birimi testi (ilk KOBİ 3 başvuru).

## 4. Riskler

- **HUKUK-5 (yuvarlama).** Gösterilen sayılar artık tam değil: 26 kurum "25" olarak görünüyor. Ek §3.1 metni ve ajansa yapılan bildirim buna göre güncellenmeli. Bu, leed-fb'nin karar 4'ünün devreye girdiği anlamına gelir.
- **HUKUK-5 (K-1 artığı).** Sayı gizli olsa da `maxUses < 5` bir kodun "Tükendi" durumu, used = max (1..4) bilgisini veriyor. Tek kullanımlık kodda bu, kurumun kayıt anı demek. Öneri: en az 5 kullanımlı kod zorunluluğu (ürün kararı) ya da durumun <5'li kodlarda gizlenmesi. Bu turda yapılmadı.
- **HUKUK-5 (zamansal fark).** Önceki kartın K-1'i açık kalıyor: dün/bugün farkı. Yuvarlama bunu küçültüyor ama kapatmıyor (5'in katı sınırını geçen tek kayıt görünür).
- **Saldırgan modeli.** Aralık yayılımı LP'den zayıftır. LP ile 400 tabloda çapraz kontrol yapıldı, ama repodaki kapı yayılım. Saldırgan gizleme algoritmasını bildiğini kullanmıyor ("bu hücre neden gizli?" çıkarımı). Standart SDC varsayımı bu, ama belirtiyorum.
- **Aşırı gizleme.** Pilotta kural (a) ve adım çizgileri birçok adımı "<5" yapacak (fikstürde kavram notu ve red gizli). Bu, güvenlik lehine bilinçli bir takas.

## 5. Açık sorular

- HUKUK-5: yuvarlamanın kullanıcıya dönük metni yeterli mi? Ek metni güncellensin mi?
- Ürün: `maxUses` alt sınırı 5 mi olsun (K-1 artığı)?

## 6. Sonraki adım

- crw-fb yeniden incelesin: saldırgan kapısı, kural (a), yuvarlama.
- leed-fb/HUKUK-5: ek metni ve `maxUses` kararı.

## Platform beyanı

Doğrulama **mac** üzerinde yapıldı (Darwin 27.0, zsh; Postgres 5433 docker, :3000 leed-fb'nin next dev sunucusu).

- Dokunulan kod yolları platformdan bağımsız: saf TS maskeleme/yuvarlama, Prisma sorguları, React bileşenleri, JSON katalog. Süreç, dosya yolu, kabuk ya da kısayol farkı yok.
- Windows ve Linux'ta koşulamadı, çünkü bu ofiste yalnız mac var. Koddan beklenen davranış aynı.
- İnteraktif tarayıcı testi (grup seçicisinin tıklama/klavye akışı) hiçbir platformda koşulamadı. Kareler SSR anlık görüntüsü; neden yukarıda.
