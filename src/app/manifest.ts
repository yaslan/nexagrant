import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FonBridge',
    short_name: 'FonBridge',
    description: 'FonBridge — Fon Yönetimi Platformu',
    start_url: '/tr',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#F4F6F8',
    theme_color: '#F4F6F8',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
