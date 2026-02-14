import React from 'react';
import { cn } from '@/lib/utils';
import { RiCloseLine, RiSearchLine, RiTimeLine, RiUserLine, RiRobotLine, RiErrorWarningLine } from '@remixicon/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { GridLoader } from '@/components/ui/grid-loader';

type TranscriptSearchResult = {
  sessionId: string;
  timestamp: number;
  role: string;
  snippet: string;
  lineNumber: number;
};

type TranscriptSearchResponse = {
  results: TranscriptSearchResult[];
  total: number;
  hasMore: boolean;
};

interface TranscriptSearchProps {
  onClose: () => void;
  onSessionSelected?: (sessionId: string) => void;
}

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
};

const renderSnippetWithHighlight = (snippet: string): React.ReactNode => {
  // Split by ** markers and alternate between normal and bold text
  const parts = snippet.split('**');
  return parts.map((part, index) => {
    // Even indices are normal text, odd indices are highlighted
    if (index % 2 === 0) {
      return <span key={`n-${index}`}>{part}</span>;
    }
    return (
      <strong key={`h-${index}`} className="font-semibold text-accent-foreground">
        {part}
      </strong>
    );
  });
};

export const TranscriptSearch: React.FC<TranscriptSearchProps> = ({
  onClose,
  onSessionSelected,
}) => {
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [results, setResults] = React.useState<TranscriptSearchResult[]>([]);
  const [total, setTotal] = React.useState(0);
  const [hasMore, setHasMore] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const sessions = useSessionStore((state) => state.sessions);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);

  const sessionTitleMap = React.useMemo(() => {
    return new Map(sessions.map((s) => [s.id, s.title || s.id]));
  }, [sessions]);

  // Debounce query
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setOffset(0); // Reset offset when query changes
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Perform search
  React.useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setTotal(0);
      setHasMore(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    const performSearch = async () => {
      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          limit: '50',
          offset: offset.toString(),
        });

        const response = await fetch(`/api/transcripts/search?${params}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Search failed');
        }

        const data: TranscriptSearchResponse = await response.json();

        if (offset === 0) {
          setResults(data.results);
        } else {
          setResults((prev) => [...prev, ...data.results]);
        }
        setTotal(data.total);
        setHasMore(data.hasMore);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Ignore abort errors
          return;
        }
        console.error('Search error:', error);
        setError('Unable to search transcripts. Please try again.');
        setResults([]);
        setTotal(0);
        setHasMore(false);
      } finally {
        setIsLoading(false);
      }
    };

    void performSearch();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [debouncedQuery, offset]);

  // Focus input on mount
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleResultClick = (sessionId: string) => {
    setCurrentSession(sessionId);
    onSessionSelected?.(sessionId);
    onClose();
  };

  const handleLoadMore = () => {
    setOffset((prev) => prev + 50);
  };

  const getSessionTitle = (sessionId: string): string => {
    return sessionTitleMap.get(sessionId) || sessionId;
  };

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transcripts..."
              aria-label="Search across all conversation transcripts"
              className="w-full pl-9 pr-3 py-1.5 rounded-md border border-border bg-background typography-ui text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              data-keyboard-avoid="true"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Close search"
          >
            <RiCloseLine className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!debouncedQuery.trim() ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <RiSearchLine className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="typography-ui text-muted-foreground">Search your chat history</p>
            <p className="typography-meta text-muted-foreground/60 mt-1">
              Enter a query to find past conversations
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <RiErrorWarningLine className="h-12 w-12 text-status-error mb-3" />
            <p className="typography-ui text-foreground">{error}</p>
          </div>
        ) : isLoading && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <GridLoader size="md" className="text-accent" />
            <p className="typography-meta text-muted-foreground mt-3">Searching...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <RiSearchLine className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="typography-ui text-muted-foreground">No results found</p>
            <p className="typography-meta text-muted-foreground/60 mt-1">
              Try a different search term
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {results.map((result, index) => (
              <button
                key={`${result.sessionId}-${result.lineNumber}-${index}`}
                type="button"
                onClick={() => handleResultClick(result.sessionId)}
                className={cn(
                  'w-full text-left rounded-md px-2 py-2 transition-colors',
                  'hover:bg-interactive-hover focus:outline-none focus:ring-2 focus:ring-accent'
                )}
              >
                <div className="flex items-start gap-2">
                  {/* Role icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {result.role === 'user' ? (
                      <RiUserLine className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <RiRobotLine className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Session title and timestamp */}
                    <div className="flex items-center gap-2 typography-meta text-muted-foreground">
                      <span className="truncate font-medium">
                        {getSessionTitle(result.sessionId)}
                      </span>
                      <span className="flex-shrink-0 flex items-center gap-1">
                        <RiTimeLine className="h-3 w-3" />
                        {formatRelativeTime(result.timestamp)}
                      </span>
                    </div>

                    {/* Snippet with highlights */}
                    <div className="typography-ui text-foreground line-clamp-2">
                      {renderSnippetWithHighlight(result.snippet)}
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {/* Load more button */}
            {hasMore && (
              <div className="pt-2 pb-1">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  className={cn(
                    'w-full rounded-md px-3 py-2 typography-ui font-medium',
                    'bg-accent text-accent-foreground',
                    'hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <GridLoader size="xs" className="text-accent-foreground" />
                      Loading...
                    </span>
                  ) : (
                    `Load more (${total - results.length} remaining)`
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
