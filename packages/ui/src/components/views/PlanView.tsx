import React from 'react';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';

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

export const PlanView: React.FC = () => {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const { currentDirectory } = useDirectoryStore();
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const runtimeApis = useRuntimeAPIs();

  const session = React.useMemo(() => {
    if (!currentSessionId) return null;
    return sessions.find((s) => s.id === currentSessionId) ?? null;
  }, [currentSessionId, sessions]);

  const [resolvedPath, setResolvedPath] = React.useState<string | null>(null);
  const displayPath = React.useMemo(() => {
    if (!resolvedPath || !currentDirectory || !homeDirectory) {
      return resolvedPath;
    }
    return toDisplayPath(resolvedPath, { currentDirectory, homeDirectory });
  }, [resolvedPath, currentDirectory, homeDirectory]);
  const [content, setContent] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

    const run = async () => {
      setResolvedPath(null);
      setContent('');
      setError(null);

      if (!session?.slug || !session?.time?.created || !currentDirectory) {
        return;
      }

      setLoading(true);
      try {
        const repoPath = buildRepoPlanPath(currentDirectory, session.time.created, session.slug);
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
          setError('Plan file not found');
          return;
        }

        setResolvedPath(resolved);
        setContent(text);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load plan');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [currentDirectory, session?.slug, session?.time?.created, homeDirectory, runtimeApis.files]);

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <div className="h-full w-full overflow-auto p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="typography-ui-label font-semibold text-foreground">Plan</div>
            {resolvedPath ? (
              <div className="typography-meta text-muted-foreground truncate" title={displayPath ?? resolvedPath}>
                {displayPath ?? resolvedPath}
              </div>
            ) : null}
          </div>
          {resolvedPath ? (
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-border/50 bg-secondary/40 px-2 py-1 typography-meta text-foreground hover:bg-secondary/60"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(resolvedPath);
                } catch {
                  // ignored
                }
              }}
            >
              Copy path
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="typography-meta text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="typography-meta text-destructive">{error}</div>
        ) : (
          <div className="rounded-lg border border-border/50 bg-background p-4">
            <SimpleMarkdownRenderer content={content} />
          </div>
        )}
      </div>
    </div>
  );
};
