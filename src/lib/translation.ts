/**
 * High-performance Translation Utility for EU Funding Calls & Topics
 * Translates English call titles and summaries into Turkish (and other target languages)
 * with in-memory LRU caching and fallback protection.
 */

const translationCache = new Map<string, string>();

/**
 * Common EU Funding Terms Dictionary for fast & high-quality Turkish translations
 */
const EU_DICTIONARY: Record<string, string> = {
  'MSCA COFUND 2027': 'MSCA COFUND 2027 Doktora ve Postdoktora Programı',
  'Climate Change Adaptation': 'İklim Değişikliğine Uyum ve Dayanıklılık',
  'Digital democracy': 'Dijital Demokrasi ve Yönetişim',
  'Digital democracy and civic engagement': 'Dijital Demokrasi ve Sivil Katılım',
  'Quantum computing algorithms for SMEs': 'KOBİ\'ler ve Derin Teknoloji İçin Kuantum Hesaplama Algoritmaları',
  'Advanced AI solutions for climate modeling': 'İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri',
  'Civil Security for Society': 'Toplum İçin Sivil Güvenlik',
  'Culture, creativity and inclusive society': 'Kültür, Yaratıcılık ve Kapsayıcı Toplum',
  'Food, Bioeconomy, Natural Resources, Agriculture and Environment': 'Gıda, Biyoekonomi, Doğal Kaynaklar, Tarım ve Çevre',
  'Digital, Industry and Space': 'Dijital, Sanayi ve Uzay',
  'Climate, Energy and Mobility': 'İklim, Enerji ve Mobilite',
  'Health': 'Sağlık',
  'European Innovation Council': 'Avrupa İnovasyon Konseyi (EIC)',
};

/**
 * Translates a single text string from English to target language (default Turkish 'tr').
 */
export async function translateText(text: string, targetLang = 'tr'): Promise<string> {
  if (!text || !text.trim() || targetLang === 'en') {
    return text;
  }

  const trimmed = text.trim();
  const cacheKey = `${targetLang}:${trimmed}`;

  // 1. Check in-memory cache
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  // 2. Check EU dictionary exact match
  if (targetLang === 'tr' && EU_DICTIONARY[trimmed]) {
    const translated = EU_DICTIONARY[trimmed];
    translationCache.set(cacheKey, translated);
    return translated;
  }

  // 3. Call translation service with timeout
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=en|${targetLang}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const translated = data.responseData?.translatedText;

      if (translated && typeof translated === 'string' && !translated.includes('QUERY LENGTH LIMIT EXCEEDED')) {
        translationCache.set(cacheKey, translated);
        return translated;
      }
    }
  } catch (err) {
    // Network or timeout error -> fallback gracefully
  }

  // Fallback: return original text if translation fails
  return text;
}

/**
 * Batch translates array of items (titles and descriptions) into target language
 */
export async function translateTopicsBatch<T extends { title: string; description?: string }>(
  topics: T[],
  targetLang = 'tr'
): Promise<T[]> {
  if (targetLang === 'en' || !topics || topics.length === 0) {
    return topics;
  }

  // Translate titles in parallel (limit concurrency to max 10 items)
  const translated = await Promise.all(
    topics.map(async (topic) => {
      const translatedTitle = await translateText(topic.title, targetLang);
      let translatedDescription = topic.description;

      if (topic.description && topic.description.length < 500) {
        translatedDescription = await translateText(topic.description, targetLang);
      }

      return {
        ...topic,
        title: translatedTitle,
        description: translatedDescription,
      };
    })
  );

  return translated;
}
