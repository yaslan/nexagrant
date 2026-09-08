/**
 * e-Fatura Entegratör Adaptör Kayıt Defteri (Adapter Registry)
 *
 * Sağlayıcılar `EFATURA_INTEGRATOR_PROVIDER` anahtarıyla kaydedilir.
 * Kayıtlı olmayan sağlayıcı çağrıldığında `provider_unsupported` hatası döndürülür.
 */
export {
  createSandboxAdapter,
  resolveIntegrator,
  fileInvoice,
  fileThrough,
  isFiled,
  readIntegratorConfig,
  type EfaturaIntegrator,
  type EfaturaIntegratorConfig,
  type EfaturaIntegratorSettings,
  type FilingOutcome,
} from '@/lib/efatura-integrator';
