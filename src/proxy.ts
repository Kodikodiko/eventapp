import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

const ADMIN_PATH = new RegExp(`^/(${routing.locales.join('|')})/admin(/.*)?$`);
const PORTAL_PATH = new RegExp(`^/(${routing.locales.join('|')})/portal/?$`);

export default function proxy(request: NextRequest) {
  // Vorprüfung: Admin-Bereich ohne Sitzungs-Cookie direkt zum Login.
  // Die eigentliche Prüfung (gültige Sitzung, Rolle, 2FA) machen Layouts und Aktionen auf dem Server.
  const match = request.nextUrl.pathname.match(ADMIN_PATH);
  if (match && !(match[2] ?? '').startsWith('/login') && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL(`/${match[1]}/admin/login`, request.url));
  }
  // ebenso das Teilnehmerportal (Anmeldeseite ausgenommen)
  const portal = request.nextUrl.pathname.match(PORTAL_PATH);
  if (portal && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL(`/${portal[1]}/portal/login`, request.url));
  }
  return intl(request);
}

export const config = {
  // Alles außer API-Routen, Next-Interna und Dateien mit Endung
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
