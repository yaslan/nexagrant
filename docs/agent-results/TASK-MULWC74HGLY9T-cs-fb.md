# TASK-MULWC74HGLY9T — FB KAMU B12 düzeltme: ek ve envanter bugünkü kodla hizalandı (CS-FB)

Sprint FB-KAMU-2 · dal `dev` · 29.09.2026 · Kaynak: `docs/agent-results/TASK-MULVAF078OPDL-crw-fb.md` §1 (B-1, Ö-1, Ö-2, K-1, K-2) · Durum: **5 madde kapandı; metin hâlâ taslak, hukuk onayı yok**

## 1. Ne yapıldı

Kod ve `messages/*.json` dosyalarına dokunulmadı. Değişen her şey Markdown.

| Madde | Ne yapıldı                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-1   | `TASK-MULRRHM9N7XPM-cs-fb.md` içindeki beş "3" yeri 5 oldu (§1, TR `sees`, EN `sees`, §5, §8). §3'ün başına "eşik 5 (`ec9406c4`)" düzeltme notu eklendi (:55). Aynı notta iki ek düzeltme var: `sees` metninden "kaç karne tamamlandı" çıkarıldı, çünkü pano bu adımı "Henüz ölçülmüyor" diye gösteriyor. `unlinkHint` için de "bugün eklenmemeli" notu düşüldü. `grep "3'ten\|<3\|fewer than 3"` sonucu boş.                                                                                                                                                  |
| Ö-1   | Ek (`docs/legal/agency-channel-notice-addendum.md`, sürüm 0.2-taslak) bugünkü kodu anlatıyor. §2 ikiye bölündü: §2.1 "bugün giden" ve §2.2 "B3 / B6 ile gelecek". İl, program ve ortalama puan ile karne sayısı ve aylık rapor §2.2'ye taşındı. Kullanıcı metnine (§4, §5) girmiyorlar. "İliniz" ve "kullandığınız davet kodu" işlenen veri listesinden çıktı. Yerine kodun gerçekten yazdıkları geldi: ajans kimliği, bağlanma tarihi (`createdAt`) ve `agency.invite.redeemed` kaydı. Madde 10: "bugün ürün içinden kaldırılamaz; talep üzerine elle; özellik planlanıyor" + `<<ürün kararı A3>>` + HUKUK-8. |
| Ö-2   | §18c satırı gerçek model ve dosya adlarıyla `docs/legal/processing-register.md`'ye taşındı (:302-316). §20 ters kontrolüne `AgencyInviteCode` satırı eklendi. `AuditEvent`, `Tenant` ve `SystemAlert` satırlarına §18c notu düşüldü. §18b kapsam notuna ek belge paragrafı, §22'ye 9-12. maddeler eklendi. Taslak dosya kendi kuralı gereği silindi (`processing-register-draft-agency-channel.md`: "taşınır ve bu dosya silinir"). Ekteki "henüz kodda yok" ifadesi (:21) kaldırıldı.                                                                                              |
| K-1   | Ek §2.1'e şu satır eklendi: "Davet kodunuzla yapılan reddedilmiş denemelerin sayısı ve nedeni (kişi bilgisi yok)" (:49). Yeri de yazıldı: ajansın kendi denetim kaydı, bugün panoda gösterilmiyor. Kullanıcı metnine (§4 md.6 / §5 item 6) de eklendi.                                                                                                                                                                                                                                                                                                         |
| K-2   | Yer tutucu kaldırıldı. TR md.7 (:128) şu düz cümleyle başlıyor: "Kurumunuzun adı ajansa gösterilmez." EN item 7 (:174) de öyle. HUKUK-4 artık yalnız "ileride gösterilmek istenirse" sorusu (§3 :74, §7).                                                                                                                                                                                                                                                                                                                                                                     |

**Kartta olmayan ama aynı kuraldan çıkan bir düzeltme:** Ek §2, adım 6-7'yi "başvuru gönderdiğini beyan eden **kurum** sayısı" diye yazıyordu. Kod ise **başvuru** sayıyor (`Proposal` satırı, `applicationOutcome.ts:66-85`). Pano metni de bunu söylüyor: "başvuru ve sonuç sayıları başvuru sayısıdır". Ek buna göre düzeltildi. Kabul ve red, kurumun kendi işaretlediği sonuçtur (`applicationOutcome.ts:57`), metin de öyle diyor.

## 2. Kanıt — kod–metin eşleşme tablosu

Satır numaraları bu commit'teki dosyalara göredir. "Ek" = `docs/legal/agency-channel-notice-addendum.md`, "Env." = `docs/legal/processing-register.md`.

| #   | Metindeki iddia                                                                            | Metin yeri                         | Kod kanıtı                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Küçük sayı eşiği 5                                                                         | Ek :86-88, :125; rapor :70, :99    | `src/lib/agency/funnel.ts:29` `SMALL_CELL_THRESHOLD = 5`; `messages/tr.json:2084-2086` (pano metni "5'ten az")                                       |
| 2   | 0 dahil maskelenir; ikincil gizleme 1-4 toplamı açığa çıkmasın diye                        | Ek :88-89                          | `funnel.ts:102-120` (`perType[t] < 5`, `while (hiddenSum() > 0 && hiddenSum() < 5)`)                                                               |
| 3   | Kayıtlı kurumu 5'ten az olan türde hiçbir adım gösterilmez                                  | Ek :90                             | `funnel.ts:141-150`                                                                                                                                  |
| 4   | Gizleme sunucuda; tarayıcıya <5 sayı gitmez                                                | Ek :91                             | `funnel.ts:19-22`, `buildFunnel` sunucuda çağrılıyor (`ajans/page.tsx:39`)                                                                           |
| 5   | Kırılım yalnız kurum türü                                                                  | Ek :47, :125                       | `funnel.ts:34-44` (`ORG_TYPES`), `:73` `byOrgType`; `add-agency-funnel.sql:64,76` `GROUP BY t."orgType"`                                             |
| 6   | İl toplanmıyor, il kırılımı yok                                                            | Ek :63; Env. §18c (e)              | `prisma/schema.prisma:18-58` `Tenant`'ta il alanı yok (yalnız `country`); kayıt `country: "TR"` (`src/lib/auth.ts:296`); `messages/tr.json:2079` "İl bilgisi henüz toplanmıyor." |
| 7   | Program kırılımı yok                                                                       | Ek :64                             | `funnel.ts` ve `add-agency-funnel.sql`'de program alanı yok (`RETURNS TABLE` :40-46: `org_type` + 4 sayı)                                           |
| 8   | Karne adımı sayı göndermez ("Henüz ölçülmüyor"); ortalama puan yok                         | Ek :52, :61-62                     | `funnel.ts:59` `UNMEASURED = {'readiness'}`; `FunnelCell` yalnız sayı/small/unmeasured (`:61-64`), ortalama tipi yok; `messages/tr.json:2083`         |
| 9   | Adımlar: kayıt, kayıtlı arama, takip, konsept not = kurum sayısı                           | Ek :41-44                          | `add-agency-funnel.sql:64-76` (`count(*)` + `FILTER (WHERE EXISTS … SavedSearch / Opportunity / ConceptNote)`)                                       |
| 10  | Başvuru ve sonuç = başvuru sayısı, kurumun işaretlediği sonuç                              | Ek :45-46, :125                    | `src/lib/k5-pipeline/applicationOutcome.ts:66-85` (`proposal.count`, `FUNDED`/`REJECTED`), `:57` (kurum beyanı → durum)                              |
| 11  | Dönem son 30 ya da 90 gün, kurumun kayıt tarihine göre                                     | Ek :37, :125                       | `funnel.ts:31`, `:207` `createdAt: { gte: since }`; `add-agency-funnel.sql:75`; `ajans/page.tsx:36` (varsayılan 30)                                   |
| 12  | Kurum hesabına yalnız ajans kimliği bağlanır; kod bağlanmaz ve saklanmaz                   | Ek :75, :112, :116; Env. §18c (a)  | `auth.ts:286-289` (kod yalnız `redeemInviteCode`'a gider), `:300` yalnız `agencyId`; `schema.prisma:67` "The code itself is never stored"          |
| 13  | Bağlanma tarihi = hesabın açıldığı tarih; bağ yalnız kayıtta kurulur                        | Ek :113                            | `schema.prisma:47-49` "written once at registration"; ayrı `linkedAt` alanı yok (`:18-58`)                                                           |
| 14  | Kurum kiracısına "hangi kullanıcı hesabı açtı + hangi ajans" kaydı yazılır                 | Ek :114; Env. §18c (b)             | `auth.ts:339-347` (`actorId: newUser.id`, `type: "agency.invite.redeemed"`, `data: { agencyId }`)                                                   |
| 15  | Kurum türü yeni toplanan veri değil, hesaptaki kayıtlı tür                                  | Ek :116                            | `schema.prisma:23` `Tenant.orgType` (B1 öncesi alan); `auth.ts:297` kayıtta yazılır                                                                  |
| 16  | Kurum adı / kimliği ajansa gitmez                                                          | Ek :74, :128, :174                 | `funnel.ts:61-74` dönüş tipi yalnız sayı; `:205-208` "Ids stay on the server"; `add-agency-funnel.sql` yalnız `org_type` + sayı döndürür            |
| 17  | Ajans kendi kodlarının kullanım sayısını görür                                             | Ek :48, :125                       | `src/lib/agency/codes.ts:132-150` (`listInviteCodesIn`, hash seçilmez); `ajans/page.tsx:40-50` (`usedCount`, `maxUses`)                             |
| 18  | Reddedilen deneme: ajansın kaydına neden + kod kimliği + zaman; kişi, kod, özet yok        | Ek :49-50, :125; Env. §18c (c)     | `prisma/migrations/fix-agency-invite-rejection-audit.sql:61-65` (`tenantId = agency`, `{reason, codeId}`, `actorId` yok); `codes.ts:172-181`        |
| 19  | Ret kayıtları bugün panoda gösterilmez                                                     | Ek :49                             | `grep -rn "agency.invite.rejected" src` → yalnız yorum; okuyan kod yok. Denetim ekranı yalnız platform yöneticisi (`src/app/[locale]/admin/audit`)    |
| 20  | Bilinmeyen kod ajansa yazılmaz, yalnız platform sayacı                                     | Ek :50; Env. §20                   | `fix-agency-invite-rejection-audit.sql:68-93` (`SystemAlert`, `tenantId` yok)                                                                        |
| 21  | Hesap silinirse kurum sayılara girmez                                                      | Ek :134, :180                      | `add-agency-funnel.sql:74` `t."deletedAt" IS NULL`; `funnel.ts:207` `deletedAt: null`                                                               |
| 22  | Bağ kaldırılınca kurum sayılara girmez                                                     | Ek :137, :183                      | Sayılar yalnız `t."agencyId" = agency` satırlarından (`add-agency-funnel.sql:73`, `funnel.ts:207`)                                                   |
| 23  | Bağı kaldırma ürün özelliği yok                                                            | Ek :137; Env. §18c saklama         | `grep -rn "agencyId: null\|agencyId = NULL" src prisma/migrations` → boş; şemada `unlinkedAt` yok                                                    |
| 24  | Ajans silinirse bağ NULL olur; kodlar ajansla silinir                                      | Env. §18c saklama                  | `add-agency-invite-code.sql:52` `ON DELETE SET NULL`, `:100` `ON DELETE CASCADE`                                                                     |
| 25  | Bağ ajansa kurum verisini okuma hakkı vermez                                               | Env. §18c tedbir                   | `schema.prisma:49-50` "no RLS policy consults agencyId"                                                                                              |
| 26  | `AgencyInviteCode` ajans kullanıcısının `userId`'sini taşır                                | Env. §18c (c), §20 :352            | `schema.prisma:78-80` `revokedBy`, `createdBy`; `codes.ts:96`, `:123`                                                                                |
| 27  | Rapor e-postası / dosyası yok (B3)                                                         | Ek :65, :131                       | `grep -rln "agency" src/lib/inngest src/lib/email*` → B3 üreticisi yok; ajans yüzeyi yalnız `src/app/[locale]/(app)/ajans/`                          |
| 28  | Kayıt ekranında ek yok, `Consent`'e ek belge yazılmıyor                                    | Ek §6 md.5-6; Env. §22 md.9        | `src/app/[locale]/login/AuthCard.tsx:271-285` (yalnız `invite-code-banner`); `grep -c -i agency src/lib/legal/consent-documents.ts` → `0`             |

Doğrulama komutları (bu oturumda koşuldu):

```
$ grep -n -E "3'ten|<3|fewer than 3" docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md docs/legal/*.md ; echo rc=$?
rc=1                                  ← hiç "3" eşiği kalmadı

$ grep -c -i agency src/lib/legal/consent-documents.ts
0

$ npx -y prettier@3 --check docs/legal/agency-channel-notice-addendum.md docs/legal/processing-register.md \
    docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md docs/agent-results/TASK-MULWC74HGLY9T-cs-fb.md
All matched files use Prettier code style!
```

**Prettier notu:** Kartın `pnpm prettier` komutu bu repoda çalışmıyor ("Command prettier not found"; prettier bağımlılık değil). crw-fb de aynısını yaşadı. Bu yüzden `npx prettier@3` kullanıldı. `docs/legal` klasörünün tamamı taranınca 3 dosya uyarı veriyor: `dpa-en.md`, `dpa-tr.md`, `privacy-notice-gap-analysis.md`. Üçü de bu kartta değişmedi ve bu karttan önce de uyarı veriyordu (crw-fb raporu :141). `processing-register.md` de önceden uyarı veriyordu. Onu içerik değişikliğinden **ayrı** bir commit'te yalnız biçim olarak düzelttim (`0b79d575`). Böylece §18c diff'i okunur kaldı.

## 3. Değişen dosyalar

- `docs/legal/agency-channel-notice-addendum.md` (0.1 → 0.2-taslak)
- `docs/legal/processing-register.md` (`0b79d575` yalnız biçim; sonraki commit §18c + §18b notu + §20 + §22)
- `docs/legal/processing-register-draft-agency-channel.md` (**silindi**, içeriği §18c'ye taşındı)
- `docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md` (B-1)
- `docs/agent-results/TASK-MULWC74HGLY9T-cs-fb.md` (bu rapor)

Kod, `messages/*.json`, şema ve migration dosyalarına dokunulmadı. Push yok.

## 4. Riskler

- **Madde 10 bir süreç vaat ediyor.** "Talep üzerine elle kaldırılır" cümlesini kart önerdi ve ekte yazıyor. Ama bunun için bir iç süreç (kim, hangi sürede) yok. Ek §6 md.8 bunu yayın şartı yaptı. Süreç yazılmazsa cümle çıkmalı, yoksa bu da bir fazla beyan olur.
- **Kodlu kayıt bugün açık, ek gösterilmiyor.** crw-fb'nin kapsam dışı notu doğru (eşleşme #28). B1 `dev`'de kurumu ajansa bağlıyor ama kullanıcı eki görmüyor. Ek §6 md.6: pilot bu şart sağlanmadan açılmamalı. Bu, B1/FE işi.
- **Ret kayıtları ajansın okuyabileceği kapsamda.** `AuditEvent` `tenant_or_shared` politikası altında. Ajans kiracısı kendi `agency.invite.rejected` satırlarını okuyabilir, ama bugün bunu gösteren bir ekran yok. İçerikte kişi yok, risk düşük. Ek bunu "ajansın kendi kayıt alanına yazılır" diye anlatıyor, "panoda görür" demiyor.
- **Satır numaraları kayar.** Tablo bu commit'e göre. Paylaşımlı ağaçta başka ajanlar kod değiştirdikçe numaralar eskir (`messages/tr.json` satırları kartın yazdığı :2081-2083'ten bugün :2083-2086'ya kaymış).

## 5. Açık sorular

| No  | Soru                                                                                                                                                  | Kime           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| A3  | Bağı kaldırma: elle kaldırma süreci kimde, yanıt süresi ne? Ürün içi özellik gelecek mi? Gelmeyecekse ek md.10'daki "planlanıyor" cümlesi çıkar          | LEED-FB / ürün |
| A6  | Kart, raporda `messages/tr.json:2081-2083` diyordu; eşik metni bugün :2084-2086'da. Kodda sorun yok, bilgi olarak not edildi                            | —              |
| A1  | HUKUK-1 … HUKUK-10 (ek §7) hâlâ açık                                                                                                                  | Hukuk          |

## 6. Sonraki adım

1. LEED-FB: A3'ü cevaplar. Ek §6 md.6 (kayıt ekranında ek + `Consent` belgesi) için B1/FE kartı açar.
2. B3 ya da B6 ya da il alanı (TASK-MULV3JXS1AW5X) koda girince: önce ek §2.2 → §2.1, sonra envanter §18c güncellenir.
3. Hukuk dönüşünden sonra ek kesinleşir ve sürüm verilir.

## Platform beyanı

Çalışma **macOS**'ta (Darwin 27.0.0; git, python3, `npx prettier@3`) yapıldı ve doğrulandı. Teslimat yalnız doküman (Markdown). Platforma bağlı bir kod yolu değişmedi (süreç, dosya yolu, kabuk, kısayol, DPI, izin yok). Bu yüzden Windows ve Linux'ta davranış farkı yok. Bu platformlarda koşulmadı, çünkü bu makinede yalnız macOS var ve sonuç platformdan bağımsız.
