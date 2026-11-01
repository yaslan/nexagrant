---
name: fabrika-no-bare-client-inside-a-withtenant-callback
description: withTenant callback'inin içinden çıplak prisma singleton'ına dokunmak havuz boyutunda kilitlenmedir — platform okumalarını sarmalayıcının ÜSTÜNE hoist et ve kuralı Proxy mock'la teste bağla
metadata:
  type: project
  updatedAt: 2026-09-10
---

`withTenant` bir `$transaction` açar ve süresince havuzdan **bir bağlantıyı tutar**. Callback'in içinden çıplak `prisma` singleton'ına yapılan herhangi bir çağrı, birinciyi hâlâ tutarken **ikinci bir bağlantı** ister. `createDbClient` (`src/lib/db.ts`) pg havuzuna `max` vermiyor → pg varsayılanı **10**. Havuz boyutu kadar eş zamanlı istekte bu yavaş sorgu değil, kilitlenmedir.

Tenant çağrıları çoğu dosyada platform okumalarıyla İÇ İÇE geçmiş durumda, yani bu kendiliğinden olmuyor. TASK-MTVRACMDFRGKV'de (`subscription-sync.ts`) iki okuma tam tenant çağrılarının arasındaydı: `publishedVersionIdFor()` (başka modül, singleton'a gider) ve `prisma.plan.findUnique(oldPlan)`.

Yapılan: `oldPlan` okuması yazma bloğunun üstüne alınıp yerine düz bir `modulesToTurnOff: string[]` listesi geçirildi; `publishedVersionIdFor` iki sarmalayıcının ARASINDA bırakıldı (bu yüzden handler'da bir yerine iki transaction var — bilinçli).

**Why:** "Hepsini tek transaction'a al" refleksi burada yanlış cevap. Tek transaction atomiklik kazandırır ama içine singleton'a giden bir çağrı sıkıştırırsan kazandığın atomikliği havuz kilidiyle ödersin. Doğru sıra: önce platform okumalarını dışarı hoist et, sonra kalan bitişik tenant bloğunu tek sarmalayıcıya al.

**How to apply:** Sarmalayıcıya taşırken callback gövdesini satır satır oku ve "bu çağrı `tx` üzerinden mi gidiyor?" diye sor — başka bir modüle yapılan çağrılar dahil (`publishedVersionIdFor` gibi masum görünen bir yardımcı, içeride `prisma`'ya gidiyor olabilir). Kuralı hatırlamaya bırakma, teste bağla: birim testinde `@/lib/db` mock'undaki `prisma`'yı bir `Proxy` yap, `withTenant` mock'u callback süresince `inWrapper=true` işaretlesin, Proxy `get` tuzağı o sırada dokunulan her delegate'i `leaks[]`'e yazsın; `expect(leaks).toEqual([])`. Mutasyonla doğrulandı: platform okuması içeri geri konunca test `expected [ 'plan' ] to deeply equal []` ile kırmızıya döner. Bkz. [[fabrika-a-wrapped-slice-is-not-rls-ready]].
