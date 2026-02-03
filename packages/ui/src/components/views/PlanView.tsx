import React from 'react';
import { CodeMirrorEditor } from '@/components/ui/CodeMirrorEditor';
import { PreviewToggleButton } from './PreviewToggleButton';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/useUIStore';
import { cn, getModifierLabel } from '@/lib/utils';
import { getLanguageFromExtension } from '@/lib/toolHelpers';
import { useDeviceInfo } from '@/lib/device';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';
import { createFlexokiCodeMirrorTheme } from '@/lib/codemirror/flexokiTheme';
import { languageByExtension } from '@/lib/codemirror/languageByExtension';
import { RiCheckLine, RiClipboardLine, RiFileCopy2Line, RiMoreLine, RiDeleteBinLine } from '@remixicon/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { EditorView } from '@codemirror/view';
import { useInlineCommentDraftStore } from '@/stores/useInlineCommentDraftStore';
import { toast } from '@/components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const normalize = (value: string): string => {
  if (!value) return '';
  const replaced = value.replace(/\\/g, '/');
  return replaced === '/' ? '/' : replaced.replace(/\/+$/, '');
};

const joinPath = (base: string, segment: string): string => {
  const normalizedBase = normalize(base);
  const cleanSegment = segment.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalizedBase || normalizedBase === '/') {
    return `/${cleanSegment}`;
  }
  return `${normalizedBase}/${cleanSegment}`;
};

const buildRepoPlanPath = (directory: string, created: number, slug: string): string => {
  return joinPath(joinPath(joinPath(directory, '.opencode'), 'plans'), `${created}-${slug}.md`);
};

const buildHomePlanPath = (created: number, slug: string): string => {
  return `~/.opencode/plans/${created}-${slug}.md`;
};

const resolveTilde = (path: string, homeDir: string | null): string => {
  const trimmed = path.trim();
  if (!trimmed.startsWith('~')) return trimmed;
  if (trimmed === '~') return homeDir || trimmed;
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return homeDir ? `${homeDir}${trimmed.slice(1)}` : trimmed;
  }
  return trimmed;
};

const toDisplayPath = (resolvedPath: string, options: { currentDirectory: string; homeDirectory: string }): string => {
  const current = normalize(options.currentDirectory);
  const home = normalize(options.homeDirectory);
  const normalized = normalize(resolvedPath);

  if (current && normalized.startsWith(current + '/')) {
    return normalized.slice(current.length + 1);
  }

  if (home && normalized === home) {
    return '~';
  }

  if (home && normalized.startsWith(home + '/')) {
    return `~${normalized.slice(home.length)}`;
  }

  return normalized;
};

type SelectedLineRange = {
  start: number;
  end: number;
};

export const PlanView: React.FC = () => {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const runtimeApis = useRuntimeAPIs();
  const newSessionDraftOpen = useSessionStore((state) => state.newSessionDraft?.open);
  const { inputBarOffset, isKeyboardOpen } = useUIStore();
  const { isMobile } = useDeviceInfo();
  const { currentTheme } = useThemeSystem();
  React.useMemo(() => generateSyntaxTheme(currentTheme), [currentTheme]);

  // Inline comment drafts
  const addDraft = useInlineCommentDraftStore((state) => state.addDraft);
  const removeDraft = useInlineCommentDraftStore((state) => state.removeDraft);
  const allDrafts = useInlineCommentDraftStore((state) => state.drafts);

  // Get session key for drafts
  const getSessionKey = React.useCallback(() => {
    return currentSessionId ?? (newSessionDraftOpen ? 'draft' : null);
  }, [currentSessionId, newSessionDraftOpen]);

  const session = React.useMemo(() => {
    if (!currentSessionId) return null;
    return sessions.find((s) => s.id === currentSessionId) ?? null;
  }, [currentSessionId, sessions]);

  const sessionDirectory = React.useMemo(() => {
    const raw = typeof session?.directory === 'string' ? session.directory : '';
    return normalize(raw || '');
  }, [session?.directory]);

  const [resolvedPath, setResolvedPath] = React.useState<string | null>(null);
  const displayPath = React.useMemo(() => {
    if (!resolvedPath || !sessionDirectory || !homeDirectory) {
      return resolvedPath;
    }
    return toDisplayPath(resolvedPath, { currentDirectory: sessionDirectory, homeDirectory });
  }, [resolvedPath, sessionDirectory, homeDirectory]);
  const [content, setContent] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [copiedPath, setCopiedPath] = React.useState(false);
  const [copiedContent, setCopiedContent] = React.useState(false);
  const [mdViewMode, setMdViewMode] = React.useState<'preview' | 'edit'>('edit');
  const copiedTimeoutRef = React.useRef<number | null>(null);
  const copiedContentTimeoutRef = React.useRef<number | null>(null);

  const [lineSelection, setLineSelection] = React.useState<SelectedLineRange | null>(null);
  const [commentText, setCommentText] = React.useState('');

  const MD_VIEWER_MODE_KEY = 'openchamber:plan:md-viewer-mode';

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(MD_VIEWER_MODE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as unknown;
      if (parsed === 'preview' || parsed === 'edit') {
        setMdViewMode(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const saveMdViewMode = React.useCallback((mode: 'preview' | 'edit') => {
    setMdViewMode(mode);
    try {
      localStorage.setItem(MD_VIEWER_MODE_KEY, JSON.stringify(mode));
    } catch {
      // ignore
    }
  }, []);
  const isSelectingRef = React.useRef(false);
  const selectionStartRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      isSelectingRef.current = false;
      selectionStartRef.current = null;
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  React.useEffect(() => {
    setLineSelection(null);
    setCommentText('');
  }, [content]);

  React.useEffect(() => {
    if (!lineSelection) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const commentUI = document.querySelector('[data-comment-ui]');
      if (commentUI?.contains(target)) return;
      if (target.closest('.cm-gutterElement')) return;
      if (target.closest('[data-sonner-toast]') || target.closest('[data-sonner-toaster]')) return;
      setLineSelection(null);
      setCommentText('');
    };

    const timeoutId = window.setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [lineSelection]);

  const extractSelectedCode = React.useCallback((text: string, range: SelectedLineRange): string => {
    const lines = text.split('\n');
    const startLine = Math.max(1, range.start);
    const endLine = Math.min(lines.length, range.end);
    if (startLine > endLine) return '';
    return lines.slice(startLine - 1, endLine).join('\n');
  }, []);

  const handleCancelComment = React.useCallback(() => {
    setCommentText('');
    setLineSelection(null);
  }, []);

  const handleSaveComment = React.useCallback(() => {
    if (!lineSelection || !commentText.trim()) return;

    const sessionKey = getSessionKey();
    if (!sessionKey) {
      toast.error('Select a session to save comment');
      return;
    }

    const code = extractSelectedCode(content, lineSelection);
    const fileLabel = displayPath ? displayPath.split('/').pop() || 'plan' : 'plan';
    const language = resolvedPath ? getLanguageFromExtension(resolvedPath) || 'markdown' : 'markdown';

    addDraft({
      sessionKey,
      source: 'plan',
      fileLabel,
      startLine: lineSelection.start,
      endLine: lineSelection.end,
      code,
      language,
      text: commentText.trim(),
    });

    setCommentText('');
    setLineSelection(null);

    toast.success('Comment saved');
  }, [lineSelection, commentText, content, displayPath, resolvedPath, addDraft, getSessionKey]);

  const editorExtensions = React.useMemo(() => {
    const extensions = [createFlexokiCodeMirrorTheme(currentTheme)];
    const language = languageByExtension(resolvedPath || 'plan.md');
    if (language) {
      extensions.push(language);
    }
    extensions.push(EditorView.lineWrapping);
    return extensions;
  }, [currentTheme, resolvedPath]);

  React.useEffect(() => {
    let cancelled = false;

    const readText = async (path: string): Promise<string> => {
      if (runtimeApis.files?.readFile) {
        const result = await runtimeApis.files.readFile(path);
        return result?.content ?? '';
      }

      const response = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        throw new Error(`Failed to read plan file (${response.status})`);
      }
      return response.text();
    };

    const run = async (showLoading: boolean) => {
      if (showLoading) {
        setResolvedPath(null);
        setContent('');
      }

      if (!session?.slug || !session?.time?.created || !sessionDirectory) {
        setResolvedPath(null);
        setContent('');
        return;
      }

      if (showLoading) {
        setLoading(true);
      }

      try {
        const repoPath = buildRepoPlanPath(sessionDirectory, session.time.created, session.slug);
        const homePath = resolveTilde(buildHomePlanPath(session.time.created, session.slug), homeDirectory || null);

        let resolved: string | null = null;
        let text: string | null = null;

        try {
          text = await readText(repoPath);
          resolved = repoPath;
        } catch {
          // ignore
        }

        if (!resolved) {
          try {
            text = await readText(homePath);
            resolved = homePath;
          } catch {
            // ignore
          }
        }

        if (cancelled) return;

        if (!resolved || text === null) {
          setResolvedPath(null);
          setContent('');
          return;
        }

        setResolvedPath(resolved);
        setContent(text);
      } catch {
        if (cancelled) return;
        setResolvedPath(null);
        setContent('');
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    void run(true);

    const interval = window.setInterval(() => {
      void run(false);
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionDirectory, session?.slug, session?.time?.created, homeDirectory, runtimeApis.files]);

  React.useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      if (copiedContentTimeoutRef.current !== null) {
        window.clearTimeout(copiedContentTimeoutRef.current);
      }
    };
  }, []);

  const renderCommentUI = () => {
    if (!lineSelection) return null;
    return (
      <div
        data-comment-ui
        className="flex flex-col items-center gap-2 px-4"
        style={{ width: 'min(100vw - 1rem, 42rem)' }}
      >
        <div className="w-full rounded-xl border bg-background flex flex-col relative shadow-lg" style={{ borderColor: 'var(--primary)' }}>
          <Textarea
            value={commentText}
            onChange={(e) => {
              setCommentText(e.target.value);
              const textarea = e.target;
              textarea.style.height = 'auto';
              const lineHeight = 20;
              const maxHeight = lineHeight * 5 + 8;
              textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
            }}
            placeholder="Type your comment..."
            className="min-h-[28px] max-h-[108px] resize-none border-0 px-3 pt-2 pb-1 shadow-none rounded-none appearance-none focus:shadow-none focus-visible:shadow-none focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-transparent hover:border-transparent bg-transparent dark:bg-transparent focus-visible:outline-none overflow-y-auto"
            autoFocus={!isMobile}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSaveComment();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelComment();
              }
            }}
          />
          {/* Footer with Cancel and Comment buttons */}
          <div className="px-2.5 py-1 flex items-center justify-between gap-x-2">
            <span className="text-xs text-muted-foreground">
              Plan:{lineSelection.start}-{lineSelection.end}
            </span>
            <div className="flex items-center gap-x-2">
              {!isMobile && (
                <span className="text-xs text-muted-foreground">
                  {getModifierLabel()}+⏎
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelComment}
                className="h-7 px-2 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSaveComment}
                disabled={!commentText.trim()}
                className="h-7 px-2 text-xs"
                style={{
                  backgroundColor: currentTheme?.colors?.status?.success,
                  color: currentTheme?.colors?.status?.successForeground,
                }}
              >
                Comment
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render saved comment cards
  const renderSavedComments = () => {
    if (mdViewMode === 'preview') return null;

    const sessionKey = getSessionKey();
    if (!sessionKey) return null;

    const sessionDrafts = allDrafts[sessionKey] ?? [];
    const fileLabel = displayPath ? displayPath.split('/').pop() || 'plan' : 'plan';
    const fileDrafts = sessionDrafts.filter((d) => d.source === 'plan' && d.fileLabel === fileLabel);

    if (fileDrafts.length === 0) return null;

    return (
      <div className="absolute inset-0 pointer-events-none z-40">
        {fileDrafts.map((draft) => {
          // For CodeMirror, we need to position based on line
          // This is a simplified version - in production, you'd query the editor's DOM
          const lineHeight = 24; // Approximate line height in pixels
          const top = (draft.startLine - 1) * lineHeight;

          return (
            <div
              key={draft.id}
              className="absolute pointer-events-auto"
              style={{
                top: `${top}px`,
                right: '8px',
                maxWidth: '300px',
              }}
            >
              <div
                className="rounded-lg border p-2 shadow-md"
                style={{
                  backgroundColor: currentTheme?.colors?.surface?.elevated,
                  borderColor: currentTheme?.colors?.interactive?.border,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {draft.fileLabel}:{draft.startLine}-{draft.endLine}
                    </div>
                    <div className="text-sm line-clamp-3">{draft.text}</div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex-shrink-0 p-1 rounded hover:bg-[var(--interactive-hover)] text-muted-foreground"
                      >
                        <RiMoreLine className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => removeDraft(draft.sessionKey, draft.id)}
                        className="text-destructive"
                      >
                        <RiDeleteBinLine className="h-4 w-4 mr-2" />
                        Delete comment
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-background">
      <div className="flex min-w-0 items-center gap-2 border-b border-border/40 px-3 py-1.5 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="typography-ui-label font-medium truncate">Plan</div>
          {resolvedPath ? (
            <div className="typography-meta text-muted-foreground truncate" title={displayPath ?? resolvedPath}>
              {displayPath ?? resolvedPath}
            </div>
          ) : null}
        </div>
        {resolvedPath ? (
          <div className="flex items-center gap-1">
            <PreviewToggleButton
              currentMode={mdViewMode}
              onToggle={() => saveMdViewMode(mdViewMode === 'preview' ? 'edit' : 'preview')}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(content);
                  setCopiedContent(true);
                  if (copiedContentTimeoutRef.current !== null) {
                    window.clearTimeout(copiedContentTimeoutRef.current);
                  }
                  copiedContentTimeoutRef.current = window.setTimeout(() => {
                    setCopiedContent(false);
                  }, 1200);
                } catch {
                  // ignored
                }
              }}
              className="h-5 w-5 p-0"
              title="Copy plan contents"
              aria-label="Copy plan contents"
            >
              {copiedContent ? (
                <RiCheckLine className="h-4 w-4 text-[color:var(--status-success)]" />
              ) : (
                <RiClipboardLine className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(displayPath ?? resolvedPath);
                  setCopiedPath(true);
                  if (copiedTimeoutRef.current !== null) {
                    window.clearTimeout(copiedTimeoutRef.current);
                  }
                  copiedTimeoutRef.current = window.setTimeout(() => {
                    setCopiedPath(false);
                  }, 1200);
                } catch {
                  // ignored
                }
              }}
              className="h-5 w-5 p-0"
              title={`Copy plan path (${displayPath ?? resolvedPath})`}
              aria-label={`Copy plan path (${displayPath ?? resolvedPath})`}
            >
              {copiedPath ? (
                <RiCheckLine className="h-4 w-4 text-[color:var(--status-success)]" />
              ) : (
                <RiFileCopy2Line className="h-4 w-4" />
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 min-w-0 relative">
        <ScrollableOverlay outerClassName="h-full min-w-0" className="h-full min-w-0">
          {loading ? (
            <div className="p-3 typography-ui text-muted-foreground">Loading…</div>
          ) : (
            <div className="relative h-full">
              <div
                className="h-full"
                style={{
                  ['--oc-plan-comment-pad' as string]: lineSelection
                    ? (isMobile
                      ? 'calc(var(--oc-keyboard-inset, 0px) + 140px)'
                      : '140px')
                    : '0px',
                }}
              >
                <div className="h-full oc-plan-editor">
                  {mdViewMode === 'preview' ? (
                    <div className="h-full overflow-auto p-3">
                      <ErrorBoundary
                        fallback={
                          <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                            <div className="mb-1 font-medium text-destructive">Preview unavailable</div>
                            <div className="text-sm text-muted-foreground">
                              Switch to edit mode to fix the issue.
                            </div>
                          </div>
                        }
                      >
                        <SimpleMarkdownRenderer content={content} className="typography-markdown-body" />
                      </ErrorBoundary>
                    </div>
                  ) : (
                    <div className="relative h-full">
                      <CodeMirrorEditor
                        value={content}
                        onChange={() => {
                          // read-only
                        }}
                        readOnly={true}
                        className="h-full [&_.cm-scroller]:pb-[var(--oc-plan-comment-pad)]"
                        extensions={editorExtensions}
                        highlightLines={lineSelection
                          ? {
                            start: Math.min(lineSelection.start, lineSelection.end),
                            end: Math.max(lineSelection.start, lineSelection.end),
                          }
                          : undefined}
                        lineNumbersConfig={{
                          domEventHandlers: {
                            mousedown: (view, line, event) => {
                              if (!(event instanceof MouseEvent)) return false;
                              if (event.button !== 0) return false;
                              event.preventDefault();
                              const lineNumber = view.state.doc.lineAt(line.from).number;

                              if (isMobile && lineSelection && !event.shiftKey) {
                                const start = Math.min(lineSelection.start, lineSelection.end, lineNumber);
                                const end = Math.max(lineSelection.start, lineSelection.end, lineNumber);
                                setLineSelection({ start, end });
                                isSelectingRef.current = false;
                                selectionStartRef.current = null;
                                return true;
                              }

                              isSelectingRef.current = true;
                              selectionStartRef.current = lineNumber;

                              if (lineSelection && event.shiftKey) {
                                const start = Math.min(lineSelection.start, lineNumber);
                                const end = Math.max(lineSelection.end, lineNumber);
                                setLineSelection({ start, end });
                              } else {
                                setLineSelection({ start: lineNumber, end: lineNumber });
                              }

                              return true;
                            },
                            mouseover: (view, line, event) => {
                              if (!(event instanceof MouseEvent)) return false;
                              if (event.buttons !== 1) return false;
                              if (!isSelectingRef.current || selectionStartRef.current === null) return false;
                            const lineNumber = view.state.doc.lineAt(line.from).number;
                            const start = Math.min(selectionStartRef.current, lineNumber);
                            const end = Math.max(selectionStartRef.current, lineNumber);
                            setLineSelection({ start, end });
                            return false;
                          },
                          mouseup: () => {
                            isSelectingRef.current = false;
                            selectionStartRef.current = null;
                            return false;
                          },
                        },
                      }}
                    />
                    {renderSavedComments()}
                  </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </ScrollableOverlay>
      </div>

      {lineSelection && mdViewMode !== 'preview' && (
        <div
          className="pointer-events-none absolute inset-0 z-50 flex flex-col justify-end"
          style={{ paddingBottom: isMobile ? 'var(--oc-keyboard-inset, 0px)' : '0px' }}
        >
          <div
            className={cn(
              "pointer-events-auto pb-2 transition-none w-full flex justify-center",
              isMobile && isKeyboardOpen ? "ios-keyboard-safe-area" : "bottom-safe-area"
            )}
            style={{
              marginBottom: isMobile
                ? (!isKeyboardOpen && inputBarOffset > 0 ? `${inputBarOffset}px` : '16px')
                : '16px'
            }}
            data-keyboard-avoid="true"
          >
            {renderCommentUI()}
          </div>
        </div>
      )}
    </div>
  );
};
