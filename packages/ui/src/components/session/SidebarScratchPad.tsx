import React from 'react';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useScratchPadStore } from '@/stores/useScratchPadStore';
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
} from '@remixicon/react';

const SIDEBAR_SCRATCHPAD_COLLAPSED_KEY = 'oc.sidebar.scratchPadCollapsed';
const AUTOSAVE_DEBOUNCE_MS = 500;

export const SidebarScratchPad: React.FC = () => {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const scratchPadsByProject = useScratchPadStore((s) => s.scratchPadsByProject);
  const setScratchPad = useScratchPadStore((s) => s.setScratchPad);

  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_SCRATCHPAD_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const savedContent = activeProjectId ? (scratchPadsByProject[activeProjectId] ?? '') : '';
  const [draft, setDraft] = React.useState(savedContent);

  // Store debounce timer ref
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref to the latest draft so the unmount effect can read it
  const draftRef = React.useRef(draft);
  draftRef.current = draft;

  // Sync draft when project changes or external sync updates the store value
  React.useEffect(() => {
    setDraft(savedContent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  // Save function that checks if content changed
  const saveIfChanged = React.useCallback(
    (content: string) => {
      if (!activeProjectId) return;
      const currentSaved = useScratchPadStore.getState().scratchPadsByProject[activeProjectId] ?? '';
      if (content !== currentSaved) {
        setScratchPad(activeProjectId, content);
      }
    },
    [activeProjectId, setScratchPad]
  );

  // Debounced auto-save on keystroke
  const debouncedSave = React.useCallback(
    (content: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        saveIfChanged(content);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [saveIfChanged]
  );

  // Save on beforeunload to catch page refreshes
  React.useEffect(() => {
    const handleBeforeUnload = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      saveIfChanged(draft);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [draft, saveIfChanged]);

  // Flush pending save on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // Save whatever is in the draft right now
      if (activeProjectId) {
        const currentSaved = useScratchPadStore.getState().scratchPadsByProject[activeProjectId] ?? '';
        if (draftRef.current !== currentSaved) {
          useScratchPadStore.getState().setScratchPad(activeProjectId, draftRef.current);
        }
      }
    };
  }, [activeProjectId]);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_SCRATCHPAD_COLLAPSED_KEY, String(next));
      } catch { /* ignored */ }
      return next;
    });
  }, []);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setDraft(newValue);
      debouncedSave(newValue);
    },
    [debouncedSave]
  );

  const handleBlur = React.useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    saveIfChanged(draft);
  }, [draft, saveIfChanged]);

  if (!activeProjectId) return null;

  return (
    <div className="border-t border-border/60 px-2.5 py-1.5 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground min-w-0"
        >
          {collapsed ? (
            <RiArrowRightSLine className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <RiArrowDownSLine className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className="typography-micro font-semibold">Scratch Pad</span>
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="mt-1">
          <textarea
            value={draft}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="Jot down notes..."
            rows={10}
            className="w-full min-h-[60px] max-h-[50vh] resize-y bg-transparent typography-micro text-foreground placeholder:text-muted-foreground/70 outline-none border border-border/40 rounded-sm px-1.5 py-1"
            data-keyboard-avoid="true"
          />
        </div>
      )}
    </div>
  );
};
