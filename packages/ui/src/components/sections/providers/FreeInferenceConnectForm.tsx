import React from 'react';
import {
  SettingsSection,
  SettingsStackedField,
  SETTINGS_FIELDS_STACK_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { useI18n } from '@/lib/i18n';
import { FREEINFERENCE_PROVIDER_ID, FREEINFERENCE_NAME } from './freeinference-preset';

interface FreeInferenceConnectFormProps {
  busy?: boolean;
  authFailureHint?: string | null;
  onCancel?: () => void;
  onSubmit: (apiKey: string) => void | Promise<void>;
}

export const FreeInferenceConnectForm: React.FC<FreeInferenceConnectFormProps> = ({
  busy = false,
  authFailureHint = null,
  onCancel,
  onSubmit,
}) => {
  const { t } = useI18n();
  const [apiKey, setApiKey] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError(t('settings.providers.page.toast.apiKeyRequired'));
      return;
    }
    setError(null);
    void onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <SettingsSection
        title={(
          <span className="flex items-center gap-2">
            <ProviderLogo providerId={FREEINFERENCE_PROVIDER_ID} className="h-5 w-5 shrink-0" />
            <span>{FREEINFERENCE_NAME}</span>
          </span>
        )}
        description={(
          <span className="block space-y-0.5">
            <span className="block">{t('settings.providers.freeinference.description')}</span>
            <span className="block opacity-90">{t('settings.providers.freeinference.attribution')}</span>
          </span>
        )}
        divider={false}
        settingsItem="providers.connect"
      >
        <div className={SETTINGS_FIELDS_STACK_CLASS}>
          <SettingsStackedField
            label={t('settings.providers.freeinference.apiKeyLabel')}
            info={t('settings.providers.freeinference.infoHint')}
          >
            <Input
              id="freeinference-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t('settings.providers.freeinference.apiKeyPlaceholder')}
              className="mt-1 h-9 font-mono text-xs max-w-lg"
              autoFocus
              disabled={busy}
            />
            {error ? (
              <p className="mt-1 typography-meta text-[var(--status-error)]">{error}</p>
            ) : null}
            {authFailureHint ? (
              <p className="mt-1 typography-meta text-[var(--status-error)]">{authFailureHint}</p>
            ) : null}
          </SettingsStackedField>
        </div>
      </SettingsSection>

      <div className="flex flex-wrap items-center gap-2 py-4">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="!font-normal"
            onClick={onCancel}
            disabled={busy}
          >
            {t('settings.providers.page.custom.actions.back')}
          </Button>
        ) : null}
        <Button
          type="submit"
          size="xs"
          className="!font-normal"
          disabled={busy || !apiKey.trim()}
        >
          {busy
            ? t('settings.providers.freeinference.connecting')
            : t('settings.providers.freeinference.connect')}
        </Button>
      </div>
    </form>
  );
};
