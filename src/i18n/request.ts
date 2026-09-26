import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export const TIME_ZONE = 'Europe/Vienna';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    timeZone: TIME_ZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
