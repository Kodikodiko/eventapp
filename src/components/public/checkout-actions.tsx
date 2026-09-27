'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { useValidationMessage } from '@/components/admin/form-fields';
import { Button } from '@/components/ui/button';
import type { ActionErrorCode } from '@/lib/action-result';
import { useRouter } from '@/i18n/navigation';
import { acceptOfferAction, fakePaymentAction, resumeCheckoutAction } from '@/server/actions/checkout';

function useErrorText() {
  const validation = useValidationMessage();
  const tAction = useTranslations('actionErrors');
  return (res: { error: ActionErrorCode; fieldErrors?: Record<string, string> }) =>
    res.fieldErrors?._form ? validation(res.fieldErrors._form)! : tAction(res.error);
}

function ErrorText({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function ResumeCheckoutButton({ reference }: { reference: string }) {
  const t = useTranslations('checkout');
  const locale = useLocale();
  const errorText = useErrorText();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await resumeCheckoutAction(reference, locale);
            if (res.ok) window.location.assign(res.data.url);
            else setError(errorText(res));
          })
        }
      >
        {t('resume')}
      </Button>
      <ErrorText message={error} />
    </div>
  );
}

/** Wartet auf die Bestätigung der Kasse (Webhook) und lädt die Seite einige Male neu. */
export function AutoRefresh({ intervalMs = 3000, maxTries = 10 }: { intervalMs?: number; maxTries?: number }) {
  const router = useRouter();
  const t = useTranslations('checkout');
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= maxTries) return;
    const id = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, intervalMs);
    return () => clearTimeout(id);
  }, [tries, maxTries, intervalMs, router]);
  return <p className="text-sm text-muted-foreground">{tries >= maxTries ? t('stillProcessing') : t('checking')}</p>;
}

export function AcceptOfferButton({ token, label }: { token: string; label: string }) {
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptOfferAction(token, locale);
            if (!res.ok) return setError(errorText(res));
            if (res.data.checkoutUrl) window.location.assign(res.data.checkoutUrl);
            else router.refresh();
          })
        }
      >
        {label}
      </Button>
      <ErrorText message={error} />
    </div>
  );
}

export function FakeCheckoutButtons({ sessionId, cancelHref }: { sessionId: string; cancelHref: string | null }) {
  const t = useTranslations('fakeCheckout');
  const router = useRouter();
  const errorText = useErrorText();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (outcome: 'paid' | 'failed' | 'expired') =>
    start(async () => {
      const res = await fakePaymentAction(sessionId, outcome);
      if (!res.ok) return setError(errorText(res));
      if (res.data.ref) router.push(`/checkout/${res.data.ref}?result=${outcome === 'paid' ? 'success' : 'cancelled'}`);
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run('paid')}>
          {t('pay')}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run('failed')}>
          {t('fail')}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run('expired')}>
          {t('expire')}
        </Button>
        {cancelHref && (
          <Button variant="ghost" disabled={pending} onClick={() => router.push(cancelHref)}>
            {t('cancel')}
          </Button>
        )}
      </div>
      <ErrorText message={error} />
    </div>
  );
}
