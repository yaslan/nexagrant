// Stub for PostHog analytics
export const analytics = {
  track: (event: string, properties?: Record<string, unknown>) => {
    // In production, send to PostHog
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics Track] ${event}`, properties);
    }
  },
  identify: (userId: string, traits?: Record<string, unknown>) => {
    // In production, identify in PostHog
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics Identify] User: ${userId}`, traits);
    }
  }
};
