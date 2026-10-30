import { AdminShell } from '@/components/admin/admin-shell';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { requireAdmin } from '@/server/auth/session';
import { hasAdminSecondFactor } from '@/server/auth/two-factor-policy';

/** Alles unterhalb erfordert einen angemeldeten Admin. */
export default async function AdminAuthLayout({ children, params }: LocaleParams & { children: React.ReactNode }) {
  const locale = await initLocale(params);
  const session = await requireAdmin(locale);
  return (
    <AdminShell
      locale={locale}
      user={{ name: session.user.name, email: session.user.email }}
      fullAccess={hasAdminSecondFactor(session.user)}
    >
      {children}
    </AdminShell>
  );
}
