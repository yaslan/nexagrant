# TASK-MUPUHPTNIULIX — crw2-fb inceleme: "fabrika" adı temizliği

**HÜKÜM: ONAY** — bloke eden yok. Dal `fe-fb/rebrand-leftovers`, HEAD `8b50bb0b` (7a09909d, de3a6320, 8b50bb0b). Kod DEĞİŞTİRİLMEDİ.
**Platform: mac (Darwin)** — yalnız burada koşuldu. Kod yolu platformdan bağımsız (dosya adı string'i, JSX href, env varsayılanı); Windows/Linux koşulamadı (makine yok).

## Kontroller
1. Dışa aktarma adı: diff'te 4 yer `fonbridge-data-export-*` (settings/privacy/client.tsx, api/gdpr/export, api/user/export-data, api/user/export). `git grep 'fabrika-data-export'` → boş. ✔
2. Yardım bağlantıları: admin/layout.tsx ve UserMenu.tsx `https://fonbridge.com/yardim`; `git grep docs.fabrika` yalnız test yorumunda (tests/app-url-self-links.test.ts:18). tsc 0 olduğundan import'lar çözülüyor. ✔
3. Landing mock adres `fabrika.eu` → `fonbridge.com/tr/default/pipeline` (page.tsx); `git grep fabrika.eu` boş. ✔
4. `support@fabrika.dev` grep → boş. BETA_MEETING_URL: `src/lib/beta/constants.ts:53` ve `.env.example:178` ikisi de `https://meet.google.com/eio-ftwm-wak` (tutarlı). ✔ Ek: scripts/beta-onboarding.ts ics adı `fonbridge-beta-checkins.ics` (isabetli).
5. `git grep -n -i fabrika -- src messages public` → 77 satır (yazarın 78'i, sonraki commit'te biri daha çıkmış). messages/public: 0. Kalanlar: iç tanımlayıcılar (çerez/anahtar etiketleri, `fabrika_app`/`fabrika` DB rolü, iyzico prefix, ICS UID `@fabrika.app`, externalId, brief şablon işareti) ve `fabrika_app` içeren yorumlar — kullanıcıya görünmez. Yazarın gerekçesi (ICS UID değişirse takvim olayları çiftlenir) doğru. 
   **storage.fabrika.app (m10/server/actions.ts:145,250) değerlendirmesi:** sahte (mock) `contentUrl`. documents/client.tsx'te `contentUrl` yalnız state'e taşınıyor (satır 47/118/166), href/metin olarak basılmıyor; tests/app-url-self-links.test.ts:18 bunu bilinçli istisna sayıyor, m10.test.ts ve 2 e2e spec aynı değeri bekliyor. Görünür değil → bu kartta dokunmamak DOĞRU. Öneri Ö-1.
6. `npx tsc --noEmit` → `TSC=0`. `npm test` (DB :5433, worktree'de kendim koştum): `Test Files  305 passed | 6 skipped (311)` · `Tests  4105 passed | 119 skipped (4224)`. ✔
7. `git merge-tree --write-tree dev fe-fb/rebrand-leftovers` → çıkış 0, tek satır ağaç SHA `cea55e4013ad7380d63ab5836570852859a33359`, çakışma yok. ✔

## Bulgular
- Y-: yok.
- Ö-1 (öneri, bloke etmez): `storage.fabrika.app` mock URL'i ileride gerçek depolama bağlanınca zaten değişecek; o zaman m10.test.ts:79,85, iki e2e spec ve fabricated-fallbacks.test.ts:88 birlikte güncellenmeli. Şimdi dokunmak gereksiz test dalgalanması yaratır.
- Ö-2 (öneri): Raporun "Kanıt" bölümündeki 85→78 sayısı HEAD'de 77; sayım farkı küçük, yazar raporu güncellenebilir.
- Ö-3 (not): `docs/agent-results/TASK-MUPUHPTNIULIX-fe-fb.md` dal içinde; devop-fb süpürmesi dev'e kopya koyarsa add/add çakışması çıkabilir (şu an çıkmıyor).

## Değişen dosyalar
Yok (inceleme). Geçici worktree `../FONBRIDGE-wt-crw2-rebrand` (detached, node_modules symlink, .env kopyası) kaldırıldı.
