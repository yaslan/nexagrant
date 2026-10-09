import { z } from 'zod';

/**
 * `SavedSearch.filters` şeması — `POST /api/saved-searches` (yazıcı) ile
 * `src/lib/jobs/tasks/alerts-daily.ts` (okuyucu) arasındaki tek sözleşme.
 *
 * Kendi dosyasında duruyor çünkü rota bunu eskiden cron iş dosyasından import
 * ediyordu; o zincir `resend` gibi yalnızca cron'un ihtiyacı olan paketleri bir
 * API rotasının derleme grafiğine sokuyordu (bkz.
 * docs/agent-results/DOGRULAMA-S12-D4-blok-zincir-dse.md §1.6). Şema burada
 * olduğu için rota artık işi import etmiyor.
 *
 * `filters` DB'de çıplak bir `Json` sütunu. Şema yalnızca `/calls` arama
 * durumunun doğrudan karşılığı olan iki alanı (`q`, `status`) tanır. Okuma
 * tarafında (`parseSavedSearchFilters`) tanınmayan ya da hiç parse edilemeyen
 * bir satır fırlatmak yerine "filtresiz"e düşer — eski ya da bozuk bir satır
 * tüm aramayı kırmak yerine yeni çağrıları saymaya devam eder. Yazma tarafında
 * (rota) aynı şema `.strict()` değil ama zorunlu doğrulayıcıdır: tanınmayan bir
 * `status` değeri 400 döner, sessizce "filtresiz"e düşmez.
 */
export const SavedSearchFiltersSchema = z
  .object({
    q: z.string().trim().min(1),
    status: z.array(z.enum(['FORTHCOMING', 'OPEN', 'CLOSED'])).min(1),
  })
  .partial();

export type SavedSearchFilters = z.infer<typeof SavedSearchFiltersSchema>;

/** Okuma tarafı: parse edilemeyen satır "filtresiz" sayılır, iş kırılmaz. */
export function parseSavedSearchFilters(filters: unknown): SavedSearchFilters {
  const result = SavedSearchFiltersSchema.safeParse(filters);
  return result.success ? result.data : {};
}
