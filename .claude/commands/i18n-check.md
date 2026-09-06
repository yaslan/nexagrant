i18n denetimi yap.

1. `src/` içinde kullanıcıya görünen sabit Türkçe/İngilizce string'leri bul (JSX metinleri, placeholder, aria-label, toast).
2. Her biri için `messages/tr.json` ve `messages/en.json`'a anahtar ekle ve `t()` ile değiştir.
3. İki dosyada anahtar kümelerinin eşit olduğunu doğrula (`scripts/i18n-diff.ts`); eksikleri tamamla.
4. Özet raporla.
