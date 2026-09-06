Yeni bir Fabrika modülü iskeleti oluştur. Argüman: modül id (örn. M9) ve key (örn. briefs).

Adımlar:
1. `docs/MODULES.md` içinde ilgili modül bölümünü oku; `PROJECT.md §4` bağımlılık ve plan bilgisini al.
2. `src/modules/<id-lower>-<key>/` altında oluştur: `manifest.ts` (ModuleManifest; requires/recommends/planTiers/addOnSku/nav/routes/permissions/tables/settingsSchema), `server/index.ts` (saf fonksiyonlar), `server/index.test.ts`, `ui/` (sayfa bileşenleri), `README.md` (kısa).
3. `src/core/modules/registry.ts`'e manifesti ekle; `pnpm typecheck` ile bağımlılık grafını doğrula.
4. `messages/tr.json` ve `messages/en.json`'a nav ve boş durum anahtarlarını ekle.
5. Gerekli tablolar için `/add-table` akışını uygula.
6. Route'ları `src/app/(app)/[workspace]/<route>/page.tsx` altında `requireModule('<id>')` ile oluştur.
7. `docs/MODULES.md` bölümünü "uygulama notları" ile güncelle; commit: `feat(<id-lower>): scaffold <key> module`.
