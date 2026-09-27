import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // natives Modul, nicht bündeln
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    // Upload der Mitgliederliste (max. 2 MB Datei, Vorschau-Daten zurück)
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default withNextIntl(nextConfig);
