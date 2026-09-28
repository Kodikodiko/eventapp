'use client';

import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';

export function LogoutButton({ variant = 'default', iconOnly = false }: { variant?: 'default' | 'sidebar'; iconOnly?: boolean }) {
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
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'sm'}
      onClick={logout}
      disabled={pending}
      aria-label={iconOnly ? t('logout') : undefined}
      title={iconOnly ? t('logout') : undefined}
      className={variant === 'sidebar' ? 'text-sidebar-foreground hover:bg-white/10 hover:text-white' : undefined}
    >
      <LogOut aria-hidden className="size-4" />
      {!iconOnly && t('logout')}
    </Button>
  );
}
