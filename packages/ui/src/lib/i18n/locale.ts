export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type LocaleInput = string | null | undefined;

const normalizeLocaleToken = (locale: string): string => locale.trim().replace(/_/g, '-').toLowerCase();

const isEnglishLocale = (normalizedLocale: string): boolean =>
  normalizedLocale === 'en' || normalizedLocale.startsWith('en-');

const isSimplifiedChineseLocale = (normalizedLocale: string): boolean => {
  if (normalizedLocale === 'zh' || normalizedLocale === 'zh-cn') {
    return true;
  }

  if (normalizedLocale === 'zh-hans' || normalizedLocale.startsWith('zh-hans-')) {
    return true;
  }

  return false;
};

const isSupportedEnglishLocale = (normalizedLocale: string): boolean => isEnglishLocale(normalizedLocale);

const resolveSupportedLocale = (locale: string): SupportedLocale | null => {
  const normalized = normalizeLocaleToken(locale);
  if (normalized.length === 0) {
    return null;
  }

  if (isSimplifiedChineseLocale(normalized)) {
    return 'zh-CN';
  }

  if (isSupportedEnglishLocale(normalized)) {
    return 'en';
  }

  return null;
};

export function normalizeLocale(locale: LocaleInput): SupportedLocale {
  if (!locale) {
    return 'en';
  }

  return resolveSupportedLocale(locale) ?? 'en';
}

export function pickNormalizedLocale(locales: LocaleInput[]): SupportedLocale {
  for (const locale of locales) {
    if (typeof locale !== 'string' || locale.trim().length === 0) {
      continue;
    }

    const normalized = resolveSupportedLocale(locale);

    if (!normalized) {
      continue;
    }

    if (normalized === 'zh-CN') {
      return normalized;
    }
  }

  return 'en';
}
