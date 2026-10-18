# ADR-0001 — What `ModuleState` means, and where it is enforced

- **Durum:** Kabul edildi
- **Tarih:** 2026-09-07
- **Bağlam kartı:** TASK-MTQW8188AWOAT (aynı iş: TASK-MTQVUWC04VOKF) · Sprint S10
- **Karar veren:** PM-EN · **Danışılan:** dogfood bulguları (`docs/agent-results/TASK-MTQV9DOEBLYES-blockzincir-pm.md`)

## Bağlam

`ModuleState` tablosu her kiracı × modül için `off | dev | pilot | on` tutuyor ve
`/admin/modules` ekranından yazılıyor. 2026-09-07 dogfood turunda M9 (Meeting Briefs)
10 beta ortağı kiracısında `PILOT → DEV`'e çekildi: DB doğru yazıldı, `AuditEvent`
üretildi — **ama üründe hiçbir şey değişmedi.**

İki ayrı kusur vardı:

1. **Kapı bağlı değildi.** `checkModuleAccess`/`assertModuleAccess`
   (`src/lib/modules/access.ts`) tanımlıydı fakat kod tabanının hiçbir yerinden
   çağrılmıyordu. Kapalı bir modülün sayfası ve server action'ı herkese açıktı; M6
   Evaluator Lens'in 3 kredilik YZ düğmesi de öyle.
2. **`DEV` kimseyi dışarıda bırakmıyordu.** Mevcut dal `role === 'TENANT_OWNER'`
   kontrolü yapıyordu. Her kiracının bir sahibi vardır — beta ortağının kendi sahibi de
   `TENANT_OWNER`. Yani kapı bağlanmış olsaydı bile `DEV` hiçbir şeyi gizlemezdi.

## Karar

### 1. Durumların anlamı (tek pure fonksiyon)

`canAccessStatus(status, viewer)` — `src/lib/modules/state-machine.ts`:

| Durum | Kime açık | Gerekçe |
|---|---|---|
| `OFF` | **hiç kimse** (platform admin dahil) | "Bu kiracıda bu modül yok." Bir platform yöneticisinin bakması gerekiyorsa doğru hamle durumu `DEV`'e almaktır — bu denetlenir (`AuditEvent`), sessiz bir arka kapı denetlenmez. |
| `DEV` | **yalnız Fabrika ekibi** (`session.isPlatformAdmin`) | "Geliştirme aşamasında." Kiracının kendi sahibi bir iç kullanıcı DEĞİLDİR; eski `TENANT_OWNER` testi tam olarak bunu yanlış yapıyordu. |
| `PILOT` | kiracının yöneticileri (`TENANT_OWNER`, `TENANT_ADMIN`, `PIPELINE_MANAGER`) + Fabrika ekibi + kiracının API anahtarları (makine kitlesi, `isMachine`; TASK-MVDPYNG1JI0S1) | Pilot, kiracının içinde dar bir kitleyle denenen özelliktir; kararı kiracının pipeline'ını yöneten kişi verir. |
| `ON` | kiracının bütün üyeleri | Normal üretim durumu. |

Bu tablo **tek yerde** yaşar. `access.ts` durumu DB'den okur, kararı bu fonksiyona
sorar; UI kuralı kopyalamaz (CLAUDE.md §3).

### 2. Nerede uygulanır

Kapı **iki** katmanda çalışır, çünkü tek başına hiçbiri yetmez:

- **Sayfa (server component):** `moduleGate(moduleId, locale)` → `src/lib/modules/guard.tsx`.
  Her modül sayfasının başında iki satır: `const locked = await moduleGate('M9', locale); if (locked) return locked;`
  Kapı mantığı sayfaya kopyalanmaz; sayfa yalnız hangi modüle ait olduğunu söyler.
- **Server action:** `assertModuleAccess(moduleId)` action'ın **ilk** satırı.
  Bu sıralama pazarlık konusu değil: `generateText()` (`src/lib/llm.ts`) ulaşıldığı
  anda `AiUsageLog` yazar ve `CreditLedger`'dan düşer. Sonradan yapılan bir kontrol
  krediyi geri getirmez. Ayrıca bir server action herkese açık bir POST uç noktasıdır —
  düğmeyi UI'da gizlemek kapı değildir.

Rol izinleri (`evaluator:write`) ve plan kapsamı (`PlanEntitlement`) ayrı kapılardır ve
bunun üstüne binerler. Bu ADR yalnız "modül bu kişiye açık mı" sorusunu cevaplar.

### 3. Reddedilen kullanıcıya ne gösterilir

`notFound()` **değil**: kullanıcıya fırsatının var olmadığını söylemek yanlıştır ve
kafa karıştırır. Beyaz ekran ya da ham hata da değil. Modül adını ve nedenini söyleyen
bir ekran gösterilir (`ModuleGate` i18n ad alanı, tr + en). Sunucu cümle üretmez —
`ModuleDenyReason` sabit bir koddur, metni istemci tarafı çevirir (CLAUDE.md §8).

## Sonuçlar

- **Olumlu:** patronun "M9'u beta ortaklarına kapat" kararı artık fiilen uygulanıyor;
  kapalı modül kredi harcayamıyor; kural tek fonksiyonda ve birim testli.
- **Bedel:** her yeni modül sayfası kapıyı kendisi çağırmak zorunda. Unutulursa sayfa
  açık kalır. Bunu yapısal olarak kapatmak (manifest `routes[]`'tan türeyen bir
  middleware) doğru bir sonraki adımdır — bu ADR'nin kapsamı dışında, kart açılmalı.
- **Bedel:** `OFF` platform yöneticisini de dışarıda bırakıyor; destek amacıyla bakmak
  gerektiğinde önce durumu `DEV`'e almak gerekir. Bilinçli tercih.

## Etkilenen dosyalar

`src/lib/modules/state-machine.ts` · `src/lib/modules/access.ts` ·
`src/lib/modules/guard.tsx` · `src/lib/modules/hooks.tsx` ·
`src/modules/m6/server/actions.ts` · `src/modules/m9/server/actions.ts` ·
M6/M9 sayfaları · `messages/{tr,en}.json` · `tests/modules/state-machine.test.ts`
