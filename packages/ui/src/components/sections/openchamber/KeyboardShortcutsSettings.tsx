import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUIStore } from '@/stores/useUIStore';
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
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="typography-ui-header font-semibold text-foreground">Keyboard Shortcuts</h3>
        <p className="typography-meta text-muted-foreground">
          Capture a new key combo, save it, and the runtime/help/palette bindings update together.
        </p>
      </div>

      <div className="space-y-2">
        {actions.map((action) => {
          const effective = getEffectiveShortcutCombo(action.id, shortcutOverrides);
          const draft = draftByAction[action.id];
          const displayCombo = draft ?? effective;
          const hasDraft = typeof draft === 'string' && normalizeCombo(draft) !== normalizeCombo(effective);

          return (
            <div key={action.id} className="rounded-md border border-border/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="typography-ui-label text-foreground">{action.label}</p>
                  {action.description && (
                    <p className="typography-meta text-muted-foreground">{action.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
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
                    className="w-52"
                  />
                  <Button
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
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => resetOne(action.id)}>
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pendingOverwrite && (
        <div className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] p-3">
          <p className="typography-meta" style={{ color: 'var(--surface-foreground)' }}>
            This combo is already used by another shortcut. Overwrite and clear that other mapping?
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" onClick={confirmOverwrite}>Overwrite</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPendingOverwrite(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {errorText && (
        <div
          className="rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-background)] p-2 typography-meta"
          style={{ color: 'var(--surface-foreground)' }}
        >
          {errorText}
        </div>
      )}

      {warningText && (
        <div
          className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] p-2 typography-meta"
          style={{ color: 'var(--surface-foreground)' }}
        >
          {warningText}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            resetAllShortcutOverrides();
            setDraftByAction({});
            setPendingOverwrite(null);
            setErrorText('');
            setWarningText('');
          }}
        >
          Reset all shortcuts
        </Button>
      </div>
    </div>
  );
};
