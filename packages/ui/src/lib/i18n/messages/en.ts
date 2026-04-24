export const dict = {
  'common.language.english': 'English',
  'common.language.simplifiedChinese': 'Chinese (Simplified)',
  'layout.mainTab.chat': 'Chat',
  'layout.mainTab.plan': 'Plan',
  'layout.mainTab.diff': 'Diff',
  'layout.mainTab.files': 'Files',
  'layout.mainTab.terminal': 'Terminal',
  'layout.rightSidebar.git': 'Git',
  'layout.rightSidebar.files': 'Files',
  'layout.rightSidebar.context': 'Context',
  'layout.services.instance': 'Instance',
  'layout.services.usage': 'Usage',
  'settings.appearance.language.label': 'Language',
  'settings.appearance.language.description': 'Choose the interface language.',
  'settings.appearance.language.select': 'Select language',
} as const;

export type I18nKey = keyof typeof dict;
