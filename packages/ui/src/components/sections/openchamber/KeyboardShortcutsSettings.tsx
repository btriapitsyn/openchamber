import React from 'react';
import { Button } from '@/components/ui/button';
import { ButtonSmall } from '@/components/ui/button-small';
import { Input } from '@/components/ui/input';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import {
  formatShortcutForDisplay,
  getCustomizableShortcutActions,
  getEffectiveShortcutCombo,
  isRiskyBrowserShortcut,
  keyToShortcutToken,
  normalizeCombo,
  UNASSIGNED_SHORTCUT,
  type ShortcutCombo,
} from '@/lib/shortcuts';

const MODIFIER_KEYS = new Set(['shift', 'control', 'alt', 'meta']);

const keyboardEventToCombo = (event: React.KeyboardEvent<HTMLInputElement>): ShortcutCombo | null => {
  if (MODIFIER_KEYS.has(event.key.toLowerCase())) {
    return null;
  }

  const parts: string[] = [];

  if (event.metaKey || event.ctrlKey) {
    parts.push('mod');
  }
  if (event.shiftKey) {
    parts.push('shift');
  }
  if (event.altKey) {
    parts.push('alt');
  }

  const keyToken = keyToShortcutToken(event.key);
  if (!keyToken) {
    return null;
  }

  parts.push(keyToken);
  return normalizeCombo(parts.join('+'));
};

export const KeyboardShortcutsSettings: React.FC = () => {
  const {
    shortcutOverrides,
    setShortcutOverride,
    clearShortcutOverride,
    resetAllShortcutOverrides,
  } = useUIStore();

  const actions = React.useMemo(() => getCustomizableShortcutActions(), []);

  const [capturingActionId, setCapturingActionId] = React.useState<string | null>(null);
  const [draftByAction, setDraftByAction] = React.useState<Record<string, ShortcutCombo>>({});
  const [errorText, setErrorText] = React.useState<string>('');
  const [warningText, setWarningText] = React.useState<string>('');
  const [pendingOverwrite, setPendingOverwrite] = React.useState<{
    actionId: string;
    combo: ShortcutCombo;
    conflictActionId: string;
  } | null>(null);

  const findConflict = React.useCallback((actionId: string, combo: ShortcutCombo): string | null => {
    const normalized = normalizeCombo(combo);
    for (const action of actions) {
      if (action.id === actionId) {
        continue;
      }
      const existing = getEffectiveShortcutCombo(action.id, shortcutOverrides);
      if (normalizeCombo(existing) === normalized) {
        return action.id;
      }
    }
    return null;
  }, [actions, shortcutOverrides]);

  const saveCombo = React.useCallback((actionId: string, combo: ShortcutCombo) => {
    const normalized = normalizeCombo(combo);
    const conflictActionId = findConflict(actionId, normalized);
    if (conflictActionId) {
      setPendingOverwrite({ actionId, combo: normalized, conflictActionId });
      setErrorText('');
      return;
    }

    setShortcutOverride(actionId, normalized);
    setPendingOverwrite(null);
    setErrorText('');
    setWarningText(isRiskyBrowserShortcut(normalized) ? 'This shortcut can conflict with browser defaults. It is still saved.' : '');
    setDraftByAction((current) => {
      const rest = { ...current };
      delete rest[actionId];
      return rest;
    });
  }, [findConflict, setShortcutOverride]);

  const confirmOverwrite = React.useCallback(() => {
    if (!pendingOverwrite) {
      return;
    }

    setShortcutOverride(pendingOverwrite.conflictActionId, UNASSIGNED_SHORTCUT);
    setShortcutOverride(pendingOverwrite.actionId, pendingOverwrite.combo);
    setPendingOverwrite(null);
    setErrorText('');
    setWarningText(isRiskyBrowserShortcut(pendingOverwrite.combo) ? 'This shortcut can conflict with browser defaults. It is still saved.' : '');
    setDraftByAction((current) => {
      const rest = { ...current };
      delete rest[pendingOverwrite.actionId];
      return rest;
    });
  }, [pendingOverwrite, setShortcutOverride]);

  const resetOne = React.useCallback((actionId: string) => {
    clearShortcutOverride(actionId);
    setDraftByAction((current) => {
      const rest = { ...current };
      delete rest[actionId];
      return rest;
    });
    setPendingOverwrite(null);
    setErrorText('');
    setWarningText('');
  }, [clearShortcutOverride]);

  return (
    <div className="mb-8">
      <div className="mb-3 px-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h3 className="typography-ui-header font-semibold text-foreground">Keyboard Shortcuts</h3>
          <p className="typography-meta text-muted-foreground mt-0.5">
            Capture a new key combo, save it, and bindings will update immediately.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            resetAllShortcutOverrides();
            setDraftByAction({});
            setPendingOverwrite(null);
            setErrorText('');
            setWarningText('');
          }}
        >
          Reset All
        </Button>
      </div>

      {(errorText || warningText || pendingOverwrite) && (
        <div className="mb-4 space-y-2 px-1">
          {pendingOverwrite && (
            <div className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="typography-meta text-foreground">
                This combo is already used by another shortcut. Overwrite and clear that other mapping?
              </span>
              <div className="flex gap-2 shrink-0">
                <ButtonSmall type="button" onClick={confirmOverwrite}>Overwrite</ButtonSmall>
                <ButtonSmall type="button" variant="ghost" onClick={() => setPendingOverwrite(null)}>Cancel</ButtonSmall>
              </div>
            </div>
          )}
          {errorText && (
            <div className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-background)] p-3 typography-meta text-foreground">
              {errorText}
            </div>
          )}
          {warningText && (
            <div className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] p-3 typography-meta text-foreground">
              {warningText}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
        {actions.map((action, index) => {
          const effective = getEffectiveShortcutCombo(action.id, shortcutOverrides);
          const draft = draftByAction[action.id];
          const displayCombo = draft ?? effective;
          const hasDraft = typeof draft === 'string' && normalizeCombo(draft) !== normalizeCombo(effective);

          return (
            <div key={action.id} className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3", index > 0 && "border-t border-[var(--surface-subtle)]")}>
              <div className="flex min-w-0 flex-col sm:w-1/2 shrink-0">
                <span className="typography-ui-label text-foreground">{action.label}</span>
              </div>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <Input
                  readOnly
                  value={capturingActionId === action.id ? 'Press keys...' : formatShortcutForDisplay(displayCombo)}
                  onFocus={() => {
                    setCapturingActionId(action.id);
                    setErrorText('');
                  }}
                  onBlur={() => {
                    if (capturingActionId === action.id) {
                      setCapturingActionId(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (event.key === 'Escape') {
                      setCapturingActionId(null);
                      return;
                    }

                    const combo = keyboardEventToCombo(event);
                    if (!combo) {
                      return;
                    }

                    setDraftByAction((current) => ({
                      ...current,
                      [action.id]: combo,
                    }));
                    setCapturingActionId(null);
                    setPendingOverwrite(null);
                    setErrorText('');
                  }}
                  className="w-40 h-8 typography-ui text-center focus-visible:ring-[var(--primary-base)]"
                />
                <ButtonSmall
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const next = draftByAction[action.id];
                    if (!next) {
                      setErrorText('Capture a shortcut first.');
                      return;
                    }
                    saveCombo(action.id, next);
                  }}
                  disabled={!hasDraft}
                >
                  Save
                </ButtonSmall>
                <ButtonSmall type="button" variant="ghost" onClick={() => resetOne(action.id)}>
                  Reset
                </ButtonSmall>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
