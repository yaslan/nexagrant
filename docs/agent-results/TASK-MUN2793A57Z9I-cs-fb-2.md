# TASK-MUN2793A57Z9I — cs-fb (2) — DÜZELTME: davet kabul sayfası kilit testleri (İNCELEME-34 B-1..B-4)

Kaynak: `docs/agent-results/TASK-MUN3O475HC3T8-fe-fb.md` (İNCELEME-34, fe-fb). Karar "DÜZELTME GEREKLİ, yalnız test" idi. Dört koruma satırını hiçbir test tutmuyordu. Mutantlar N1, N2, N3 ve N6 hayatta kalıyordu.

## 1. Ne yapıldı

**Kod davranışı değişmedi.** Yalnız test eklendi. B-4 isteğe bağlıydı, o da yapıldı.

| Bulgu | Tutulan satır | Test |
|---|---|---|
| B-1 (N2) | `src/lib/actions/auth.ts` `loginWithSocialAction` → `await clearInvitationAcceptCookie();` | `tests/social-action-disclosure.test.ts` → "a plain Google start clears a parked tenant invitation before handing over to Google". Test, davet çerezini park eder. `signIn` mock'lanır ve Google'a devir anında çerez kavanozuna bakılır. İki durum denenir: onay kutusu işaretsiz ve işaretli. |
| B-2 (N3) | `src/lib/invitations/accept.ts` `acceptInvitationIn` → `updateMany where { …, tokenHash, … }` | `tests/invitation-accept.live.test.ts` → "the core refuses a link rotated after the caller looked". Satırda yeni hash durur, çekirdek ise eski bağlantının hash'i ile çağrılır. Beklenen: `lost`, üyelik yok, `acceptedAt` NULL kalır, `INVITATION_ACCEPTED` denetim satırı 0. `fabrika_app` (NOBYPASSRLS) ile koşar. |
| B-3 (N1) | `src/app/api/invitations/route.ts` upsert `update: { tokenHash, role, expires, acceptedAt: null }` | `tests/invitation-mail-limit.live.test.ts` → "re-inviting an address whose earlier invitation was accepted reopens it with a fresh link". Test gerçek POST handler'ı çağırır. Önce davet atılır, satır kabul edilmiş yapılır, bekleme süresi geçirilir, sonra yeniden davet edilir. Beklenen: `emailSent: true`, `acceptedAt` NULL, yeni token geçerli, eski token geçersiz. |
| B-4 (N6) | `next.config.ts` `/:locale(tr|en)/accept-invite/:path*` başlık bloğu | yeni `tests/accept-invite-headers.test.ts`. Test gerçek `next.config` `headers()` çıktısında bu `source`'u ve `Referrer-Policy: no-referrer` + `Cache-Control: no-store` başlıklarını arar. |

## 2. Kanıt

Tüm koşular izole DB'de yapıldı: `csfb_b14`, `fabrika`'nın `pg_dump` kopyası, `fabrika-postgres` @5433. `SMTP_HOST=` boştu. `DATABASE_URL_RLS_TEST` yine `fabrika_app` rolüyle bu kopyaya bağlandı.

### 2.1 Hedefli (4 dosya)
```
 Test Files  4 passed (4)
      Tests  37 passed (37)
```
Atlanan test yok. Live dosyalar DB'ye bağlandı ve skip etmedi.

### 2.2 Mutantlar (satır sil → kırmızı, geri al → yeşil)
Her mutant yedek dosyadan geri kondu. Sonunda `git status` bu dört kaynak dosyada değişiklik göstermiyor.
```
== N2 (mutated) ==   auth.ts: `await clearInvitationAcceptCookie();` silindi
   × a plain Google start clears a parked tenant invitation before handing over to Google
      Tests  1 failed | 1 passed (2)
== N2 (restored) ==
      Tests  2 passed (2)
== N3 (mutated) ==   accept.ts: claim where'den `tokenHash` çıkarıldı
     × the core refuses a link rotated after the caller looked: lost, row still pending, no membership
      Tests  1 failed | 17 passed (18)
== N3 (restored) ==
      Tests  18 passed (18)
== N1 (mutated) ==   route.ts: upsert update'ten `acceptedAt: null` çıkarıldı
     × re-inviting an address whose earlier invitation was accepted reopens it with a fresh link
      Tests  1 failed | 15 passed (16)
== N1 (restored) ==
      Tests  16 passed (16)
== N6 (mutated) ==   next.config.ts: `Referrer-Policy: no-referrer` satırı silindi
   × next.config: the accept-invite pages never send a Referer and are never cached
      Tests  1 failed (1)
== N6 (restored) ==
      Tests  1 passed (1)
```

### 2.3 Kapılar
- `pnpm typecheck`: exit 0, `error TS` sayısı 0.
- `pnpm lint`: exit 0.
- Tam süit, izole DB `csfb_b14`: `Test Files 229 passed | 2 skipped (231)`, `Tests 2681 passed | 8 skipped (2689)`, exit 0. İnceleme koşusu 2677 idi; +4, eklenen testlerdir.
- Temizlik: `DROP DATABASE csfb_b14 WITH (FORCE)` çalıştı. Paylaşılan `fabrika` DB'sine ve `:3000`'e dokunulmadı. Sunucu ya da süreç başlatılmadı.

## 3. Değişen dosyalar
- `tests/social-action-disclosure.test.ts`: `@/lib/auth` mock'u (`signIn`) ve B-1 testi eklendi. Mevcut test `signIn`'e ulaşmadığı için bu mock'tan etkilenmiyor.
- `tests/invitation-accept.live.test.ts`: B-2 testi eklendi.
- `tests/invitation-mail-limit.live.test.ts`: B-3 testi eklendi.
- `tests/accept-invite-headers.test.ts` (yeni): B-4 testi.

## 4. Riskler
1. B-4 testi `next.config`'i yapılandırma düzeyinde tutar. Next'in `source` desenini gerçek yola uygulamasını ölçmez; bunu fe-fb §2.4 üretim modunda curl ile ölçmüştü. `source` metni değişirse test kırmızı olur. Bu kasıtlıdır: desen değişikliği gözden geçirilmelidir.
2. B-3 testi `keepToken` kolunu (bekleme süresi içindeki yeniden davet) KAPSAMAZ. O kol kabul edilmiş satırda `acceptedAt`'ı sıfırlamıyor. Bu durum fe-fb Açık soru 1'de ve crw-fb İNCELEME-37 Ö-3'te duruyor. Kod kararı bu kartın kapsamı dışında; davranış değiştirilmedi.
3. Çalışma ağacında başka ajanların commit edilmemiş değişiklikleri var (`src/modules/m11/*`, `src/lib/env.ts`, `README.md`, `.env.example`). tsc ve lint bunlarla birlikte temiz. Commit yalnız yukarıdaki 4 test dosyası ve bu rapor.

## 5. Açık sorular
- fe-fb Açık soru 1 (B-3 `keepToken` + kabul edilmiş satır: kodla mı kapatılsın, belgelensin mi?) hâlâ açık. Karar be-fb ve cs-fb'nin; önerim ayrı bir kart açılması.

## 6. Sonraki adım
- Yeniden inceleme (fe-fb): N1, N2, N3 ve N6 artık ölüyor. Kod değişikliği yok, kart ONAY'a hazır.

**Platform beyanı:** mac üzerinde doğrulandı (Darwin 27, zsh, Docker `fabrika-postgres` @5433, Node + pnpm 11, vitest 4.1). Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. Eklenenler platformdan bağımsız vitest testleri: çerez kavanozu mock'u, Prisma/Postgres ve `next.config` `headers()` çağrısı. Dosya yolu, süreç ya da kabuk bağımlılığı yok. Ürün kodu değişmedi.
