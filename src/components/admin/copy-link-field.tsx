'use client';

import { Check, Copy, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

/** Anmeldelink eines Events zum Kopieren (die Domain kommt aus dem Browser). */
export function CopyLinkField({ path }: { path: string }) {
  const t = useTranslations('cockpit');
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ''
  );
  const url = `${origin}${path}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Feld bleibt markierbar */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={url}
        aria-label={t('link')}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs"
      />
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-live="polite">
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? t('copied') : t('copy')}
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <a href={url} target="_blank" rel="noopener">
          <ExternalLink aria-hidden />
          {t('open')}
        </a>
      </Button>
    </div>
  );
}
