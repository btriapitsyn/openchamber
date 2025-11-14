import React, { useRef, memo } from 'react';
import { Paperclip, X, FilePdf, FileImage, File, HardDrives, Monitor } from '@phosphor-icons/react';
import { useSessionStore, type AttachedFile } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import type { ToolPopupContent } from './message/types';

export const FileAttachmentButton = memo(() => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addAttachedFile } = useSessionStore();
  const { isMobile } = useUIStore();
  const buttonSizeClass = isMobile ? 'h-9 w-9' : 'h-7 w-7';
  const iconSizeClass = isMobile ? 'h-5 w-5' : 'h-[18px] w-[18px]';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let attachedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const sizeBefore = useSessionStore.getState().attachedFiles.length;
      try {
        await addAttachedFile(files[i]);
        const sizeAfter = useSessionStore.getState().attachedFiles.length;
        if (sizeAfter > sizeBefore) {
          attachedCount++;
        }
      } catch (error) {
        console.error('File attach failed', error);
        toast.error(error instanceof Error ? error.message : 'Failed to attach file');
      }
    }

    if (attachedCount > 0) {
      toast.success(`Attached ${attachedCount} file${attachedCount > 1 ? 's' : ''}`);
    }

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="*/*"
      />
      <button
        type='button'
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          buttonSizeClass,
          'flex items-center justify-center text-muted-foreground transition-none outline-none focus:outline-none flex-shrink-0'
        )}
        title='Attach files'
      >
        <Paperclip className={cn(iconSizeClass, 'text-current')} />
      </button>
    </>
  );
});

interface FileChipProps {
  file: AttachedFile;
  onRemove: () => void;
}

const FileChip = memo(({ file, onRemove }: FileChipProps) => {
  const getFileIcon = () => {
    if (file.mimeType.startsWith('image/')) {
      return <FileImage className="h-3.5 w-3.5" />;
    }
    if (file.mimeType.includes('text') || file.mimeType.includes('code')) {
      return <File className="h-3.5 w-3.5" />;
    }
    if (file.mimeType.includes('json') || file.mimeType.includes('xml')) {
      return <FilePdf className="h-3.5 w-3.5" />;
    }
    return <File className="h-3.5 w-3.5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Ensure we show just the filename, not the full path
  // Handle various path formats more robustly
  const extractFilename = (path: string): string => {
    // First, normalize the path by replacing backslashes with forward slashes
    const normalized = path.replace(/\\/g, '/');
    
    // Split by forward slash and get the last part
    const parts = normalized.split('/');
    const filename = parts[parts.length - 1];
    
    // If still no filename (shouldn't happen), return the original
    return filename || path;
  };
  
  const displayName = extractFilename(file.filename);
  
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted/30 border border-border/30 rounded-xl typography-meta">
      {/* Show source indicator */}
      <div title={file.source === 'server' ? "Server file" : "Local file"}>
        {file.source === 'server' ? (
          <HardDrives className="h-3 w-3 text-primary" />
        ) : (
          <Monitor className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
      {getFileIcon()}
      <span title={file.serverPath || displayName}>
        {displayName}
      </span>
      <span className="text-muted-foreground flex-shrink-0">
        ({formatFileSize(file.size)})
      </span>
      <button
        onClick={onRemove}
        className="ml-1 hover:text-destructive transition-colors p-0.5"
        title="Remove file"
      >
        <X className="h-3 w-3"  weight="bold" />
      </button>
    </div>
  );
});

export const AttachedFilesList = memo(() => {
  const { attachedFiles, removeAttachedFile } = useSessionStore();

  if (attachedFiles.length === 0) return null;

  return (
    <div className="pb-2">
      <div className="flex items-center flex-wrap gap-2 px-3 py-2 bg-muted/30 rounded-xl border border-border/30">
        <span className="typography-meta text-muted-foreground font-medium">Attached:</span>
        {attachedFiles.map((file) => (
          <FileChip
            key={file.id}
            file={file}
            onRemove={() => removeAttachedFile(file.id)}
          />
        ))}
      </div>
    </div>
  );
});

// Component to display files in sent messages
interface FilePart {
  type: string;
  mime?: string;
  url?: string;
  filename?: string;
  size?: number;
}

interface MessageFilesDisplayProps {
  files: FilePart[];
  onShowPopup?: (content: ToolPopupContent) => void;
}

export const MessageFilesDisplay = memo(({ files, onShowPopup }: MessageFilesDisplayProps) => {
  // Filter for file parts - they have type 'file' and should have mime, url, etc.
  const fileItems = files.filter(f => f.type === 'file' && (f.mime || f.url));

  // Helper to extract filename from path
  const extractFilename = (path?: string): string => {
    if (!path) return 'Unnamed file';
    // Normalize path and get last segment
    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || path;
  };

  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return <File className="h-3.5 w-3.5" />;

    if (mimeType.startsWith('image/')) {
      return <FileImage className="h-3.5 w-3.5" />;
    }
    if (mimeType.includes('text') || mimeType.includes('code')) {
      return <File className="h-3.5 w-3.5" />;
    }
    if (mimeType.includes('json') || mimeType.includes('xml')) {
      return <FilePdf className="h-3.5 w-3.5" />;
    }
    return <File className="h-3.5 w-3.5" />;
  };

  // Separate images from other files
  const imageFiles = fileItems.filter(f => f.mime?.startsWith('image/') && f.url);
  const otherFiles = fileItems.filter(f => !f.mime?.startsWith('image/'));

  const handleImageClick = React.useCallback((file: { filename?: string; mime?: string; size?: number; url?: string }) => {
    if (!onShowPopup || !file?.url) {
      return;
    }

    const filename = extractFilename(file.filename) || 'FileImage';

    const popupPayload: ToolPopupContent = {
      open: true,
      title: filename,
      content: '',
      metadata: {
        tool: 'image-preview',
        filename,
        mime: file.mime,
        size: file.size,
      },
      image: {
        url: file.url,
        mimeType: file.mime,
        filename,
      },
    };

    onShowPopup(popupPayload);
  }, [onShowPopup]);

  if (fileItems.length === 0) return null;

  return (
    <div className="space-y-2 mt-2">
      {/* Non-image files */}
      {otherFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {otherFiles.map((file, index) => (
            <div
              key={`file-${index}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted/30 border border-border/30 rounded-xl typography-meta"
            >
              {getFileIcon(file.mime)}
              <span>
                {extractFilename(file.filename)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* FileImage files with preview */}
      {imageFiles.length > 0 && (
        <div className="overflow-x-auto -mx-1 px-1 py-1 scrollbar-thin">
          <div className="flex gap-3 snap-x snap-mandatory">
            {imageFiles.map((file, index) => {
              const filename = extractFilename(file.filename) || 'FileImage';

              return (
                <Tooltip key={`img-${index}`} delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleImageClick(file)}
                      className="relative flex-none w-32 sm:w-36 md:w-40 aspect-square rounded-xl border border-border/40 bg-muted/10 overflow-hidden snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary"
                      aria-label={filename}
                    >
                      {file.url ? (
                        <img
                          src={file.url}
                          alt={filename}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.visibility = 'hidden';
                          }}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-muted/30 text-muted-foreground">
                          <FileImage className="h-6 w-6" />
                        </div>
                      )}
                      <span className="sr-only">{filename}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6} className="typography-meta px-2 py-1">
                    {filename}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
