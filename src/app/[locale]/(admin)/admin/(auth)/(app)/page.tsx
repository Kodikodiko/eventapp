import { count } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { requestDb } from '@/server/db';
import { events, people, registrations } from '@/server/db/schema';

export default async function AdminDashboardPage({ params }: LocaleParams) {
  await initLocale(params);
  const t = await getTranslations('dashboard');
  const db = await requestDb();
  const stats = [
    { label: t('events'), value: db.select({ n: count() }).from(events).get()?.n ?? 0 },
    { label: t('registrations'), value: db.select({ n: count() }).from(registrations).get()?.n ?? 0 },
    { label: t('people'), value: db.select({ n: count() }).from(people).get()?.n ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('placeholder')}</p>
      <dl className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className="text-2xl font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
