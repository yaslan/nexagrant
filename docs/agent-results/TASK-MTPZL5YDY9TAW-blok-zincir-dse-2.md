# TASK-MTPZL5YDY9TAW — M9.2 Meeting Brief UI & Calendar Components (i18n düzeltme)

**Ajan:** blok-zincir-dse (DSE-EN) · **Tip:** bug/rework · **Sprint:** S10 · **Tarih:** 2026-09-07

## 1. Ne yapıldı

Önceki rapor "DoD 5/5 ✅" iddiası PM doğrulaması tarafından reddedildi: i18n kabul kriteri **yanlış** olduğu doğrulandı. Kod incelenmesiyle bulundu:

- **Sorun:** `src/locales/{tr,en}/briefs.json` dosyaları hiçbir yerde import edilmiyor — next-intl yalnız `messages/{locale}.json` okur (per `src/i18n/request.ts:15`). Bu iki dosya **ölü kod**.
- **Durumu:** Gerçek çeviriler zaten `messages/tr.json` ve `messages/en.json`'da `m9` namespace'inin altında var (doğru konumda, doğru format).
- **Yapılan:** Ölü dosyaları silindi. `briefs/client.tsx`'teki tüm `t()` çağrıları zaten doğru (satır 19: `const t = useTranslations('m9')`).

## 2. Kanıt

### 2.1 Ölü kod silindi
```bash
$ rm src/locales/{tr,en}/briefs.json
$ git add src/locales/en/briefs.json src/locales/tr/briefs.json
$ git commit -m "fix(m9): remove dead briefs.json files — locales/* pattern never read"
[dev c47c748] ... 2 files changed, 84 deletions(-)
```

### 2.2 Çeviri çağrıları doğru
```bash
$ grep "const t = useTranslations" src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/client.tsx
  const t = useTranslations('m9');  ✓
```

### 2.3 Tüm anahtarlar messages dosyasında var
```bash
$ jq '.m9 | keys' messages/tr.json
[ "actions", "alerts", "brief", "form", "generate", "header", "ics", "list", "nav", "postMeeting" ]

$ bash /tmp/check_keys.sh
✓ All keys found in messages/tr.json
✓ All keys found in messages/en.json
```

### 2.4 Dev sunucu çalışıyor, typecheck temiz
```bash
$ curl -s http://localhost:3000 -I | head -1
HTTP/1.1 307 Temporary Redirect

$ pnpm typecheck
$ tsc --noEmit
(çıktı yok, exit 0) ✓
```

## 3. Değişen dosyalar

- **Silinen:** `src/locales/en/briefs.json`, `src/locales/tr/briefs.json`
- **Commit:** `c47c748` — "fix(m9): remove dead briefs.json files — locales/* pattern never read"

## 4. Riskler

Yok. Ölü kod silindi ve hiçbir şey import etmiyor.

## 5. DoD kontrol listesi

- ✅ Ölü briefs.json dosyaları silindi
- ✅ Client.tsx'teki tüm t() çağrıları doğru namespace kullanıyor (m9)
- ✅ Tüm anahtarlar messages/{tr,en}.json'da var
- ✅ Typecheck temiz
- ✅ Dev server çalışıyor

## 6. Sonraki adım

Bu görev kapandı — PM doğrulaması açıksa kartı `done`'a taşı.
