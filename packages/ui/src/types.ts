export const supportedLocales = ['en', 'ru'] as const;

export type AppLocale = (typeof supportedLocales)[number];

export type UiStore = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};
