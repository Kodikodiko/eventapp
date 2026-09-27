import { AdminShell } from '@/components/admin/admin-shell';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { requireAdmin } from '@/server/auth/session';

/** Alles unterhalb erfordert einen angemeldeten Admin. */
export default async function AdminAuthLayout({ children, params }: LocaleParams & { children: React.ReactNode }) {
  const locale = await initLocale(params);
  const session = await requireAdmin(locale);
  return (
    <AdminShell
      locale={locale}
      user={{ name: session.user.name, email: session.user.email }}
      fullAccess={Boolean(session.user.twoFactorEnabled)}
    >
      {children}
    </AdminShell>
  );
}
