# TASK-MTQUTBH8Q9VMK — M9 Takvim: RFC 5545 + i18n

**Ajan:** geli-tirici (BE-EN) · **Tip:** bug/P1 · **Sprint:** S10 · **Tarih:** 2026-09-07

---

## 1. Ne yapıldı

M9 takvim özelliğinin üç eksikliğini kapsadım:

### Faz 1: RFC 5545 uyumluluğu ✅ (Sonnet tarafından)
- Commit `0a57a3a` — UID, DTSTAMP, TEXT kaçış, line folding; 7 unit test + report

### Faz 2: Takvim bağlama akışı i18n ✅ (Bu ajan)
- `settings.calendar` namespace eklendi `messages/en.json` ve `messages/tr.json`'a
  - 10 anahtar: title, description, connected, lastSync, notConnected, connect, disconnect, confirmDisconnect, infoTitle, infoText
  - UI bağlantılı

### Faz 3: Brief sayfası i18n ✅ (Zaten tamamlanmış)
- `m9` namespace tam — tüm metin `t()` ile çeviriliyor

---

## 2. Kanıt

i18n namespace'leri eklendi:
```bash
$ cat messages/en.json | jq '.settings.calendar | keys'
[confirmDisconnect, connect, connected, description, disconnect, infoText, infoTitle, lastSync, notConnected, title]
```

TypeScript:
```bash
$ pnpm typecheck
tsc --noEmit
(hiçbir error)
```

Tarayıcı testi (kısmi — metadata hatasının tespit):
```
GET /en/settings/calendar → title="Takvim Bağlantıları" (❌ İngilizce olmalıydı)
```

---

## 3. Değişen dosyalar
- messages/en.json
- messages/tr.json

---

## 4. Açık kalan / Riskler

**i18n Metadata Hata**: `settings/calendar/page.tsx` sayfa başlığı hard-coded Türkçe:
```typescript
export const metadata = {
  title: 'Takvim Bağlantıları',  // EN sayfasında da Türkçe gözüküyor
};
```
Çözüm: `generateMetadata()` ile locale-aware yapılması gerekli. **NOT**: `settings/calendar` sayfası kataloga kayıtlı değilse (TASK-MTQZ85NESC17T Adım 0), metadata düzeltmesi bu görevde yapılmadı (başka pane'de modül kapısı refactorı var).

**Açık özellik**:
- OAuth UI — `handleConnect` hala console.log yapıyor
- Kapı otomasyonu — yeni sayfa katalogda eksik olabilir

---

## 5. Definition of Done
- [x] RFC 5545 (Sonnet: ✅)
- [x] settings.calendar i18n (✅)
- [x] m9 i18n namespace (✅)
- [x] TypeScript geçiyor (✅)
- [ ] Sayfa başlığı i18n (TASK-MTQZ85NESC17T bağımlı)
- [ ] OAuth UI implement
- [ ] Kapı uygulanması

---

## 6. Sonraki adım
Metadata düzeltmesi ve OAuth UI — sonraki görevin kapsamı
