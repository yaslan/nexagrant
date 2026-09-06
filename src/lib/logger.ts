export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, error?: unknown, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] ${message}`, error, meta ? JSON.stringify(meta) : '');
    // In the future, this is where we would report errors to Sentry
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  },
};
