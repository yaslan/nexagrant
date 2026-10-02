import { MetadataRoute } from 'next';
import { appUrl } from '@/lib/app-url';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = appUrl();
  const sitemapUrl = `${baseUrl}/sitemap.xml`;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/', // No API endpoints
          '/**/giris', // Login (Turkish)
          '/**/kayit', // Register (Turkish)
          '/**/login', // Login (English)
          '/**/register', // Register (English)
          '/**/admin', // Admin panel
          '/**/(app)/', // Protected workspace routes
          '/**/no-workspace', // Error page
        ],
      },
    ],
    sitemap: sitemapUrl,
  };
}
