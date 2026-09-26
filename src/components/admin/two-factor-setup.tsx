'use client';

import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';

type Setup = { qrDataUrl: string; secret: string; backupCodes: string[] };

/** Einrichtung der Zwei-Faktor-Anmeldung (Authenticator-App) – für Admins Pflicht. */
export function TwoFactorSetup() {
  const t = useTranslations('security');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { data, error: enableError } = await authClient.twoFactor.enable({ password, method: 'totp' });
      if (enableError || !data || data.method !== 'totp') {
        setError(t('wrongPassword'));
        return;
      }
      const secret = new URL(data.totpURI).searchParams.get('secret') ?? '';
      setSetup({ qrDataUrl: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }), secret, backupCodes: data.backupCodes });
      setPassword('');
    } catch {
      setError(t('genericError'));
    } finally {
      setPending(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, '') });
      if (verifyError) {
        setError(t('invalidCode'));
        return;
      }
      router.refresh();
    } catch {
      setError(t('genericError'));
    } finally {
      setPending(false);
    }
  }

  if (!setup) {
    return (
      <form onSubmit={start} className="max-w-sm space-y-4">
        <p className="text-sm">{t('step1')}</p>
        <div className="space-y-2">
          <Label htmlFor="password">{t('password')}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {t('start')}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">{t('scanTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('scanHint')}</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- Data-URL, keine Optimierung nötig */}
        <img src={setup.qrDataUrl} alt={t('qrAlt')} width={220} height={220} className="rounded border bg-white p-2" />
        <p className="text-sm">
          {t('manualKey')} <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs break-all">{setup.secret}</code>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t('backupTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('backupHint')}</p>
        <ul className="grid max-w-sm grid-cols-2 gap-1 rounded border bg-muted p-3 font-mono text-sm">
          {setup.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <form onSubmit={confirm} className="max-w-sm space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">{t('confirmCode')}</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {t('confirm')}
        </Button>
      </form>
    </div>
  );
}
