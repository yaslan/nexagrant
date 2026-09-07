export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, error?: unknown, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] ${message}`, error, meta ? JSON.stringify(meta) : '');
    // Operator-visible errors go to the SystemAlert table via
    // recordAlert() in src/lib/observability/system-alert.ts — not called from
    // here, because the logger must stay synchronous and dependency-free.
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  },
};
