import { initLocale, type LocaleParams } from '@/i18n/page';
import { requireAdminWith2fa } from '@/server/auth/session';

/** Fachseiten des Admin-Bereichs: zusätzlich eingerichtete Zwei-Faktor-Anmeldung erforderlich. */
export default async function AdminAppLayout({ children, params }: LocaleParams & { children: React.ReactNode }) {
  const locale = await initLocale(params);
  await requireAdminWith2fa(locale);
  return children;
}
