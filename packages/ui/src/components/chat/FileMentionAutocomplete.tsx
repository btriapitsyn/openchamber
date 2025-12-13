import React from 'react';
import { RiCodeLine, RiFileImageLine, RiFileLine, RiFilePdfLine, RiRefreshLine } from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, truncatePathMiddle } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { ProjectFileSearchHit } from '@/lib/opencode/client';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

type FileInfo = ProjectFileSearchHit;

export interface FileMentionHandle {
  handleKeyDown: (key: string) => void;
}

interface FileMentionAutocompleteProps {
  searchQuery: string;
  onFileSelect: (file: FileInfo) => void;
  onClose: () => void;
}

export const FileMentionAutocomplete = React.forwardRef<FileMentionHandle, FileMentionAutocompleteProps>(({
  searchQuery,
  onFileSelect,
  onClose
}, ref) => {
  const { currentDirectory } = useDirectoryStore();
  const { addServerFile } = useSessionStore();
  const searchFiles = useFileSearchStore((state) => state.searchFiles);
  const debouncedQuery = useDebouncedValue(searchQuery, 180);
  const [files, setFiles] = React.useState<FileInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [hoveredTooltipIndex, setHoveredTooltipIndex] = React.useState<number | null>(null);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !containerRef.current) {
        return;
      }
      if (containerRef.current.contains(target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  React.useEffect(() => {
    if (!currentDirectory) {
      setFiles([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    searchFiles(currentDirectory, debouncedQuery ?? '', 40)
      .then((hits) => {
        if (cancelled) {
          return;
        }
        setFiles(hits.slice(0, 15));
      })
      .catch(() => {
        if (!cancelled) {
          setFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentDirectory, debouncedQuery, searchFiles]);

  React.useEffect(() => {
    setSelectedIndex(0);
    setHoveredTooltipIndex(null);
  }, [files]);

  React.useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }, [selectedIndex]);

  const handleFileSelect = React.useCallback(async (file: FileInfo) => {

    await addServerFile(file.path, file.name);
    onFileSelect(file);
  }, [addServerFile, onFileSelect]);

  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      if (key === 'Escape') {
        onClose();
        return;
      }

      const total = files.length;
      if (total === 0) {
        return;
      }

      if (key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % total);
        return;
      }

      if (key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev - 1 + total) % total);
        return;
      }

      if (key === 'Enter' || key === 'Tab') {
        const safeIndex = ((selectedIndex % total) + total) % total;
        const selectedFile = files[safeIndex];
        if (selectedFile) {
          handleFileSelect(selectedFile);
        }
      }
    }
  }), [files, selectedIndex, onClose, handleFileSelect]);

  const getFileIcon = (file: FileInfo) => {
    const ext = file.extension?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return <RiCodeLine className="h-3.5 w-3.5 text-blue-500" />;
      case 'json':
        return <RiCodeLine className="h-3.5 w-3.5 text-yellow-500" />;
      case 'md':
      case 'mdx':
        return <RiFileLine className="h-3.5 w-3.5 text-gray-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        return <RiFileImageLine className="h-3.5 w-3.5 text-green-500" />;
      default:
        return <RiFilePdfLine className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
      <div
        ref={containerRef}
        className="absolute z-[100] min-w-0 w-full max-w-[520px] max-h-64 bg-popover border border-border rounded-xl shadow-none bottom-full mb-2 left-0 flex flex-col"
      >
        <ScrollableOverlay outerClassName="flex-1 min-h-0" className="px-0">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <RiRefreshLine className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="pb-2">
            {files.map((file, index) => {
              const relativePath = file.relativePath || file.name;
              const displayPath = truncatePathMiddle(relativePath, { maxLength: 45 });
              const isSelected = selectedIndex === index;
              const isHovered = hoveredTooltipIndex === index;
              const tooltipOpen = isSelected || isHovered;

              const item = (
                <div
                  ref={(el) => { itemRefs.current[index] = el; }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 cursor-pointer typography-ui-label rounded-lg",
                    isSelected && "bg-accent"
                  )}
                  onClick={() => handleFileSelect(file)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {getFileIcon(file)}
                  <span className="flex-1 truncate max-w-[360px]" aria-label={relativePath}>
                    {displayPath}
                  </span>
                </div>
              );

              return (
                <Tooltip
                  key={file.path}
                  open={tooltipOpen}
                  delayDuration={tooltipOpen ? 0 : 120}
                  onOpenChange={(open) => {
                    setHoveredTooltipIndex((previous) => {
                      if (!open && previous === index) {
                        return null;
                      }
                      if (open) {
                        return index;
                      }
                      return previous;
                    });
                  }}
                >
                  <TooltipTrigger asChild>{item}</TooltipTrigger>
                  <TooltipContent side="right" align="center" className="max-w-xs">
                    <span className="typography-meta text-foreground/80 whitespace-pre-wrap break-all">
                      {relativePath}
                    </span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {}
            {files.length > 0 && <div className="h-2" />}
            {files.length === 0 && (
              <div className="px-3 py-2 typography-ui-label text-muted-foreground">
                No files found
              </div>
            )}
          </div>
        )}
        </ScrollableOverlay>
        <div className="px-3 pt-1 pb-1.5 border-t typography-meta text-muted-foreground">
        ↑↓ navigate • Enter select • Esc close
      </div>
    </div>
  );
});
