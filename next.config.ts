import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Grundschutz auch ohne vorgeschalteten Proxy; HSTS setzt der Proxy (DEPLOYMENT.md B.6)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  // natives Modul bzw. Paket mit Schriftdateien (pdfkit) – nicht bündeln
  serverExternalPackages: ['better-sqlite3', 'pdfkit'],
  experimental: {
    // Uploads: Mitgliederliste (max. 2 MB, Vorschau-Daten zurück) und Belege zu Ausgaben (max. 10 MB)
    serverActions: { bodySizeLimit: '12mb' },
    // proxy.ts puffert den Anfrageinhalt (Standard 10 MB) – für Belege etwas mehr erlauben
    proxyClientMaxBodySize: '12mb',
  },
};

export default withNextIntl(nextConfig);
