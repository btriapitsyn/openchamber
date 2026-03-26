import { createContext } from 'react';
import type { MessageDictionary } from '@/lib/i18n/messages';
import type { SupportedLocale } from '@/lib/i18n/locale';

export type I18nContextValue = {
  locale: SupportedLocale;
  messages: MessageDictionary;
  t: () => MessageDictionary;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
