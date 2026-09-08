i18n denetimi yap.

1. `src/` içinde kullanıcıya görünen sabit Türkçe/İngilizce string'leri bul (JSX metinleri, placeholder, aria-label, toast).
2. Her biri için `messages/tr.json` ve `messages/en.json`'a anahtar ekle ve `t()` ile değiştir.
   Katalog **yalnız** bu iki dosyadır — `src/locales/...json` açma, next-intl onu hiç okumaz.
3. `pnpm i18n:check` koş ve temiz çıkmasını sağla. Kapı üç şeyi bloklar: tr ↔ en anahtar
   eşitsizliği, `src/` içinde kullanılıp katalogda bulunmayan anahtar, ve hiçbir anahtara
   uymayan şablon çağrısı (`t(`kinds.${kind}`)`). "Kullanılmayan anahtar" listesi bilgi
   amaçlıdır, hata değildir.
4. Özet raporla.
