/**
 * High-performance Translation Utility for EU Funding Calls & Topics
 * Translates English call titles and summaries into Turkish (and other target languages)
 * with in-memory LRU caching and fallback protection.
 */

const translationCache = new Map<string, string>();

/**
 * Bounds on the free translation service (TASK-MUN66T2HM4A4E O-1). The cache is
 * capped so a stream of distinct titles cannot grow the heap without end (Map
 * keeps insertion order, so the oldest entry goes first), and at most
 * {@link MAX_CONCURRENT_TRANSLATIONS} outbound calls run at once across the
 * whole process, however many requests are translating.
 */
export const TRANSLATION_CACHE_MAX_ENTRIES = 5000;
export const MAX_CONCURRENT_TRANSLATIONS = 8;

let activeTranslations = 0;
const translationQueue: Array<() => void> = [];

/**
 * Runs `run` in one of the shared slots. A waiter whose `signal` fires leaves the
 * queue at once and never gets a slot, so a request the client has given up on
 * (or whose time budget ran out) stops holding a place in front of live ones
 * (TASK-MUS7OVUMOJZP3).
 */
async function withTranslationSlot<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  if (activeTranslations >= MAX_CONCURRENT_TRANSLATIONS) {
    await new Promise<void>((resolve, reject) => {
      const drop = () => {
        const at = translationQueue.indexOf(wake);
        if (at === -1) return;
        translationQueue.splice(at, 1);
        reject(signal?.reason);
      };
      function wake() {
        signal?.removeEventListener('abort', drop);
        resolve();
      }
      translationQueue.push(wake);
      signal?.addEventListener('abort', drop, { once: true });
    });
  } else {
    activeTranslations++;
  }
  try {
    // The signal can fire after `wake` took the abort listener off but before this
    // line runs; `run` would then listen on an already-aborted signal and never hear it.
    signal?.throwIfAborted();
    return await run();
  } finally {
    const next = translationQueue.shift();
    // The slot passes straight to the next waiter, so the count only drops when nobody waits.
    if (next) next();
    else activeTranslations--;
  }
}

function cacheTranslation(key: string, value: string): void {
  if (translationCache.size >= TRANSLATION_CACHE_MAX_ENTRIES && !translationCache.has(key)) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
  translationCache.set(key, value);
}

/** Test seam: the live counters, so a test can prove the bounds hold. */
export function translationStats(): { cacheSize: number; active: number; queued: number } {
  return { cacheSize: translationCache.size, active: activeTranslations, queued: translationQueue.length };
}

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
 * Falls back to the original text when no translation comes back.
 */
export async function translateText(
  text: string,
  targetLang = 'tr',
  signal?: AbortSignal
): Promise<string> {
  return (await translateTextOrNull(text, targetLang, signal)) ?? text;
}

/**
 * The translation, or `null` when the service gave none (quota, timeout, cancel).
 */
async function translateTextOrNull(
  text: string,
  targetLang = 'tr',
  signal?: AbortSignal
): Promise<string | null> {
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
    cacheTranslation(cacheKey, translated);
    return translated;
  }

  // 3. Call translation service with timeout
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=en|${targetLang}`;
    const translated = await withTranslationSlot(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        const data = await res.json();
        const text: unknown = data.responseData?.translatedText;
        return typeof text === 'string' ? text : null;
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', cancel);
      }
    }, signal);

    // MyMemory answers an exhausted quota with a 200 whose text is a warning, not a translation.
    if (translated && !translated.includes('QUERY LENGTH LIMIT EXCEEDED') && !translated.includes('MYMEMORY WARNING')) {
      cacheTranslation(cacheKey, translated);
      return translated;
    }
  } catch {
    // Network or timeout error -> reported as no translation below
  }

  // No translation: the service failed, was over quota, or the call was cancelled.
  return null;
}

/**
 * Batch translates array of items (titles and descriptions) into target language.
 * Once `signal` fires, queued calls are dropped, calls in flight are aborted and
 * the remaining texts come back untranslated. `onUntranslated` runs once for each
 * text that came back in English because the service gave no translation (quota,
 * timeout, error), so the caller can tell a complete result from a partial one.
 */
export async function translateTopicsBatch<T extends { title: string; description?: string }>(
  topics: T[],
  targetLang = 'tr',
  signal?: AbortSignal,
  options?: { onUntranslated?: () => void }
): Promise<T[]> {
  if (targetLang === 'en' || !topics || topics.length === 0) {
    return topics;
  }

  const translateOrKeep = async (value: string): Promise<string> => {
    const out = await translateTextOrNull(value, targetLang, signal);
    if (out === null) {
      options?.onUntranslated?.();
      return value;
    }
    return out;
  };

  // Items start together; the outbound calls themselves queue on withTranslationSlot.
  const translated = await Promise.all(
    topics.map(async (topic) => {
      const translatedTitle = await translateOrKeep(topic.title);
      let translatedDescription = topic.description;

      if (topic.description && topic.description.length < 500) {
        translatedDescription = await translateOrKeep(topic.description);
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
