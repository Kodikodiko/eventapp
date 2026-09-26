'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';

export function LogoutButton() {
  const t = useTranslations('adminNav');
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await authClient.signOut();
    } finally {
      router.replace('/admin/login');
      router.refresh();
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={logout} disabled={pending}>
      <LogOut aria-hidden className="size-4" />
      {t('logout')}
    </Button>
  );
}
