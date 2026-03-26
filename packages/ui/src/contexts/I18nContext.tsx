import React, { useMemo, type ReactNode } from 'react';
import { messagesByLocale } from '@/lib/i18n/messages';
import { normalizeLocale, type LocaleInput } from '@/lib/i18n/locale';
import { I18nContext, type I18nContextValue } from './i18n-context';

export function I18nProvider({ locale, children }: { locale: LocaleInput; children: ReactNode }) {
  const normalizedLocale = normalizeLocale(locale);

  const value = useMemo<I18nContextValue>(() => {
    const resolvedMessages = messagesByLocale[normalizedLocale];
    return {
      locale: normalizedLocale,
      messages: resolvedMessages,
      t: () => resolvedMessages,
    };
  }, [normalizedLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
