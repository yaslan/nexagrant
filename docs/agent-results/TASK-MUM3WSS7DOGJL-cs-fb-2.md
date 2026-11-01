# TASK-MUM3WSS7DOGJL — FB KAMU B12 B6+B1 eşleme, İNCELEME-12 düzeltmesi (cs-fb, 2)

İnceleme: `docs/agent-results/TASK-MUM5YQCBNF5QW-crw-fb.md` Kart 4 → DÜZELTME GEREKLİ (B-1, B-2, K-8, K-9). Yalnız metin değişti; koda dokunulmadı.

## 1. Ne yapıldı

- **B-1 (fazla beyan) düzeltildi.** Ek §2.4 "Ne saklanır" (:95): "Bozuk ya da elle değiştirilmiş bir kod yok sayılır" çıktı. Yerine: "Biçimi bozuk bir kod yok sayılır. Geçerli biçimdeki her kod, kimin doldurduğundan bağımsız olarak kabul edilir; puan kurumun kendi beyanıdır." Parantez içinde de açıkladım: sunucu cevapların karnede gerçekten verildiğini doğrulamaz.
  - **EN karşılığı:** EN metinde (§5) bu iddianın karşılığı **yok**. `grep -i "hand-edit|tampered|malformed|edited by hand"` → yalnız TR :94 ve eski raporum çıktı. EN kullanıcı metni kodun doğrulanması hakkında bir şey söylemiyor, bu yüzden EN'de düzeltilecek cümle olmadı. Yeni bir EN cümlesi de eklemedim.
  - **Önceki raporum §1** (`TASK-MUM3WSS7DOGJL-cs-fb.md:10`): yanlış madde üstü çizildi. Yanına "Yanlıştı (İNCELEME-12 B-1)" notu ve doğru cümle yazıldı.
  - Envanter §18c teknik tedbir satırı ("bozuk kod yok sayılır") zaten doğruydu, değişmedi. (g)'ye "Biçimi geçerli her kod kabul edilir; puan kurumun kendi beyanıdır" eklendi.
- **B-2 (eksik beyan) düzeltildi.**
  - Envanter §18c (g): "Kodlu ya da kodsuz her kayıtta (davet koduna bakılmaz)" eklendi.
  - Envanter §18c "İlgili kişi kategorileri": "(g) için ayrıca davet kodu olmadan kayıt olup karne sonucunu hesabına ekleyen platform kullanıcıları" eklendi.
  - Envanter §18c (g) sonu: HUKUK-12 artık "kodsuz kayıt için ana aydınlatma metnine de yazılıp yazılmayacağı" sorusunu da taşıyor.
  - Ek §2.4'e yeni madde (:93) "Kodlu ya da kodsuz her kayıtta": kutu davet koduna bakmadan çıkar, B6 ekin kapsamından (§0) geniştir, kodsuz kayıt olan kurum bu eki görmez, ajansın adım 2 sayısında yalnız o ajansın kodlarıyla gelen kurumlar sayılır.
  - Ek §2.4 [HUKUK-12] (:100) ve §7 tablosu HUKUK-12 satırı (:284): "ana aydınlatma metnine de yazılmalı mı?" sorusu eklendi. Soru, HUKUK-11'in il için sorduğu sorunun aynı deseninde.
- **K-8 düzeltildi.** Ek §3.1 not (:145) ve envanter (c): "en fazla 366 gün seçilebilir" çıktı. Yerine: "sunucu en fazla 366 gün sonrasını kabul eder (`MAX_VALIDITY_DAYS`); paneldeki tarih alanı bugün en fazla 365 gün sonrasını seçtirir". Ekte fe-fb'nin açık işi (TASK-MUM743H8P5QFK) de yazılı.
- **K-9 düzeltildi.** Ek §2.1 (:60) ve envanter (c): ret nedenleri artık tam liste: `expired`, `revoked`, `agency_inactive`, `lost_race`. `agency_inactive` satırının etkin olmayan ajansın kiracısına yazıldığı ve o ajansın bu satırı ürün içinden okuyamadığı not edildi.
- Ek başlığındaki hizalama satırına bu raporun adı eklendi.

## 2. Kanıt — kod–metin eşleme tablosu

Kod: `dev` @ `9cd87b8f` (HEAD, commit'lenmiş kod). Metin satırları bu kartın commit'inden sonrasına göre.

| #   | Metin iddiası (yer)                                                                        | Kod dayanağı (dosya:satır)                                                                                                                                                                                                                                                            | Sonuç |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Biçimi bozuk kod yok sayılır (ek :95, envanter (g) + teknik tedbir)                        | `share.ts:17` `ANSWERS_PATTERN` (15 hane, izinli değerler); `share.ts:29-30` desen tutmazsa `null`; `share.ts:108-113` tür ya da cevaplar çözülmezse `null`; `account.ts:32-33` `toReadinessCode` çözülmeyen kodu `null` yapar; `account.ts:41-42` `null` ise `settings` yazılmaz     | Tutar |
| 2   | Geçerli biçimdeki her kod kabul edilir, kimin doldurduğuna bakılmaz (ek :95)               | `share.ts:104-115` yalnız biçim ve tür kontrolü; imza, sağlama ya da sunucu tarafı kayıt yok. crw-fb canlı: `karne=municipality.222222222222222` → kutu var, puan 100 (inceleme §2)                                                                                                   | Tutar |
| 3   | Kutu davet koduna bakmadan her kayıtta çıkar (ek :93, envanter (g))                        | `AuthCard.tsx:115-120` `readiness` yalnız `karne=` parametresinden; `:453` kutu `{readiness && …}` içinde, form `:408` `isRegistering` içinde; `:144` `readinessToSend = isRegistering && readiness && importReadiness`, `inviteCode` yok. `agencyRegistration` (`:142`) ayrı         | Tutar |
| 4   | Sonuç kodsuz kayıtta da yazılır (ek :93, envanter (g))                                     | E-posta dalı: `auth.ts:395-399` `agencyId` yalnız `if (inviteCode)`, `:409` `settings: readinessSettings(readiness)` koşulsuz. OAuth kodsuz: `auth.ts:672-680` `readiness` + `agencyId: null`. OAuth kodlu: `oauth-registration.ts:305-309`. Ortak yazım: `oauth-registration.ts:220` | Tutar |
| 5   | Ajansın adım 2 sayısında yalnız o ajansın kodlarıyla gelen kurumlar sayılır (ek :93)       | `funnel.ts` kohort `Tenant.agencyId` ile (İNCELEME-12 Kart 1'de doğrulandı: `funnel.ts:139` `registered ⊇ readiness`, `:455` `deletedAt: null`); kodsuz kayıtta `agencyId = null` (madde 4)                                                                                           | Tutar |
| 6   | Sunucu en fazla 366 gün kabul eder (ek :145, envanter (c))                                 | `codes.ts:23` `MAX_VALIDITY_DAYS = 366`; `codes.ts:111-112` `> now + MAX_VALIDITY_DAYS * 86_400_000` → `INVALID_EXPIRY`                                                                                                                                                               | Tutar |
| 7   | Panel tarih alanı bugün en fazla 365 gün (ek :145, envanter (c))                           | HEAD `invite-codes-panel.tsx:125` `max={isoDay(now, 365)}` (`git show HEAD:…`)                                                                                                                                                                                                        | Tutar |
| 8   | Ret nedenleri: `revoked`, `expired`, `agency_inactive`, `lost_race` (ek :60, envanter (c)) | `agency-invite-no-max-uses.sql:122-127` `CASE` dört değer; `:134-139` `AuditEvent` ajans kiracısına `{reason, codeId}`                                                                                                                                                                | Tutar |
| 9   | `agency_inactive` = ajans kiracısı silinmiş ya da artık ajans değil (ek :60)               | `agency-invite-no-max-uses.sql:125` `a."kind" <> 'AGENCY' OR a."deletedAt" IS NOT NULL`                                                                                                                                                                                               | Tutar |
| 10  | Etkin olmayan ajans bu satırı ürün içinden okuyamaz (ek :60, envanter (c))                 | `ajans/page.tsx:50` `if (!(await isAgencyTenant(…))) forbidden()`; `funnel.ts:499-501` `kind === 'AGENCY' && !deletedAt`. Ret satırları zaten hiçbir ekranda yok (`funnel.ts:43-45` "Not on any screen yet")                                                                          | Tutar |
| 11  | Hiç var olmayan kod ajansa yazılmaz (ek :60, değişmedi)                                    | `agency-invite-no-max-uses.sql:134-139` yalnız `agency IS NOT NULL` ise ajansa yazılır; değilse `:141-145` `SystemAlert` sayacı                                                                                                                                                       | Tutar |

Not: `codes.ts` ve `invite-codes-panel.tsx`'te çalışma ağacında fe-fb'nin **commit'lenmemiş** değişikliği var (TASK-MUM743H8P5QFK: `lastExpiryDay`, `maxExpiresOn`). `MAX_VALIDITY_DAYS` yine `:23`'te. O iş commit'lenince panel 365/366'yı sabitten türetecek ve ek :145'teki "bugün 365" cümlesi güncellenmeli.

Kapılar:

```
$ npx prettier --write docs/legal/agency-channel-notice-addendum.md docs/legal/processing-register.md docs/agent-results/TASK-MUM3WSS7DOGJL-cs-fb.md
docs/legal/agency-channel-notice-addendum.md 109ms
docs/legal/processing-register.md 81ms
docs/agent-results/TASK-MUM3WSS7DOGJL-cs-fb.md 19ms (unchanged)
$ grep -c "elle değiştirilmiş bir kod yok sayılır" docs/legal/agency-channel-notice-addendum.md
0
```

(Ekteki diff'in büyük kısmı §7 tablosunun prettier ile yeniden hizalanması: HUKUK-12 hücresi uzayınca bütün sütun genişledi.)

## 3. Değişen dosyalar

- `docs/legal/agency-channel-notice-addendum.md` — başlık, §2.1 :60, §2.4 :93/:95/:100, §3.1 not :145, §7 HUKUK-12 :284
- `docs/legal/processing-register.md` — §18c veri kategorileri (c) + (g) (:309), ilgili kişi kategorileri (:310)
- `docs/agent-results/TASK-MUM3WSS7DOGJL-cs-fb.md` — §1 :10 yanlış madde düzeltildi
- `docs/agent-results/TASK-MUM3WSS7DOGJL-cs-fb-2.md` — bu rapor (kopyası: `/Users/macbook/alan/docs/agent-results/TASK-MUM3WSS7DOGJL-cs-fb-2.md`, o klasör git dışı)

## 4. Riskler

- **Kodsuz kayıtta aydınlatma boşluğu gerçek.** Kodsuz kayıt olan kurum bu eki görmez; ana aydınlatma metninde de B6 yok. Kutu varsayılan işaretsiz ve altındaki satır ne olacağını söylüyor, ama tek aydınlatma o satır. HUKUK-12'nin cevabına kadar açık.
- **Puan kurumun beyanı.** Elle değiştirilen geçerli kod kabul edildiği için kurumun panosundaki "Hazırlık durumu" kanıt değildir. Ajansa yalnız "sonucu ekleyen kurum sayısı" gittiği için ajans sayısını etkilemez (puan gitmez).
- K-8 metni bugünkü HEAD'i anlatır; fe-fb işi commit'lenince yeniden hizalanmalı.

## 5. Açık sorular

- HUKUK-12 (genişledi): B6 ana aydınlatma metnine mi yazılmalı, yoksa ayrı bir envanter satırına mı taşınmalı? İnceleme ikinci seçeneği de önerdi. Ben satırı taşımadım, soruyu hukukçuya bıraktım; taşıma kararı leed-fb / hukuk.

## 6. Sonraki adım

- crw-fb: Kart 4'ü yeniden incele (B-1, B-2, K-8, K-9).
- fe-fb TASK-MUM743H8P5QFK commit'lenince: ek :145 ve envanter (c)'deki "bugün 365" cümlesini güncelle.

## Platform beyanı

Doğrulama **macOS**'ta yapıldı (Darwin 27, grep + `git show` ile kod okuması, prettier). Değişiklik yalnız Markdown metni; platforma bağlı kod yolu yok. Anlatılan kod yolları (SQL fonksiyonu, TypeScript sunucu kodu, React formu, URL parametresi) Windows ve Linux'ta aynı davranır. Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız macOS var ve iş metin düzeltmesi.
