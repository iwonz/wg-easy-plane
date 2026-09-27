import { supportedLocales, type AppLocale } from './types';

export { supportedLocales };

const supported = new Set<string>(supportedLocales);

export function resolveLocale(
  cookieLocale: string | undefined,
  acceptLanguage: string | null,
): AppLocale {
  if (cookieLocale && supported.has(cookieLocale)) {
    return cookieLocale as AppLocale;
  }

  for (const part of acceptLanguage?.split(',') ?? []) {
    const language = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    if (language && supported.has(language)) {
      return language as AppLocale;
    }
  }

  return 'en';
}
