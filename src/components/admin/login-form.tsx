'use client';

import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';

type Step = 'credentials' | 'totp' | 'backup';

export function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function finish() {
    router.replace('/admin');
    router.refresh();
  }

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { data, error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError) {
        setError(signInError.status === 429 ? t('tooManyAttempts') : t('invalidCredentials'));
        return;
      }
      if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
        setStep('totp');
        return;
      }
      finish();
    } catch {
      setError(t('genericError'));
    } finally {
      setPending(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result =
        step === 'totp'
          ? await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, '') })
          : await authClient.twoFactor.verifyBackupCode({ code: code.trim() });
      if (result.error) {
        setError(result.error.status === 429 ? t('tooManyAttempts') : t('invalidCode'));
        return;
      }
      finish();
    } catch {
      setError(t('genericError'));
    } finally {
      setPending(false);
    }
  }

  if (step === 'credentials') {
    return (
      <form onSubmit={submitCredentials} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
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
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="space-y-4">
      <p className="text-sm text-muted-foreground">{step === 'totp' ? t('totpHint') : t('backupHint')}</p>
      <div className="space-y-2">
        <Label htmlFor="code">{step === 'totp' ? t('code') : t('backupCode')}</Label>
        <Input
          id="code"
          inputMode={step === 'totp' ? 'numeric' : 'text'}
          autoComplete="one-time-code"
          autoFocus
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
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t('submitting') : t('verify')}
      </Button>
      <button
        type="button"
        className="text-sm text-primary underline"
        onClick={() => {
          setStep(step === 'totp' ? 'backup' : 'totp');
          setCode('');
          setError(null);
        }}
      >
        {step === 'totp' ? t('useBackupCode') : t('useTotp')}
      </button>
    </form>
  );
}
