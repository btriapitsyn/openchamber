import React from 'react';
import {
  FilePdf as FileText,
  Code,
  Code as FileJson,
  File as FileType,
  FileImage as Image,
  ArrowsClockwise as Loader2
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';
import { useSessionStore } from '@/stores/useSessionStore';

interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
}

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
  const [files, setFiles] = React.useState<FileInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  // Load and filter files recursively based on search query
  React.useEffect(() => {
    if (!currentDirectory) return;
    
    const loadFilesRecursively = async (dirPath: string): Promise<FileInfo[]> => {
      try {
        const tempClient = opencodeClient.getApiClient();
        const response = await tempClient.file.list({
          query: { 
            path: '.',
            directory: dirPath
          }
        });
        
        if (!response.data) return [];
        
        let allFiles: FileInfo[] = [];
        
        for (const item of response.data) {
          if (item.name.startsWith('.')) continue; // Skip hidden files
          
          if (item.type === 'file') {
            allFiles.push({
              name: item.name,
              path: item.absolute || `${dirPath}/${item.name}`,
              type: 'file' as const,
              extension: item.name.split('.').pop()?.toLowerCase()
            });
          } else if (item.type === 'directory') {
            // Recursively load subdirectories
            const subPath = item.absolute || `${dirPath}/${item.name}`;
            // Skip node_modules and other large directories
            if (!item.name.includes('node_modules') && !item.name.includes('.git')) {
              const subFiles = await loadFilesRecursively(subPath);
              allFiles = allFiles.concat(subFiles);
            }
          }
        }
        
        return allFiles;
      } catch (error) {
        return [];
      }
    };
    
    const loadFiles = async () => {
      setLoading(true);
      try {
        const allFiles = await loadFilesRecursively(currentDirectory);
        
        // Filter by search query
        const filtered = searchQuery 
          ? allFiles.filter((f: FileInfo) => 
              f.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
          : allFiles;
        
        // Limit to top 15 results
        setFiles(filtered.slice(0, 15));
      } catch (error) {
        setFiles([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadFiles();
  }, [searchQuery, currentDirectory]);

  // Reset selection when files change
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [files]);

  // Scroll selected item into view when selection changes
  React.useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedIndex]);

  // Expose keyboard handling to parent
  React.useImperativeHandle(ref, () => ({
    handleKeyDown: (key: string) => {
      if (key === 'ArrowDown') {
        setSelectedIndex(prev => Math.min(prev + 1, files.length - 1));
      } else if (key === 'ArrowUp') {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (key === 'Enter' || key === 'Tab') {
        if (files[selectedIndex]) {
          handleFileSelect(files[selectedIndex]);
        }
      } else if (key === 'Escape') {
        onClose();
      }
    }
  }), [files, selectedIndex, onClose]);

  const handleFileSelect = async (file: FileInfo) => {
    // Add file to attachments
    await addServerFile(file.path, file.name);
    onFileSelect(file);
  };

  const getFileIcon = (file: FileInfo) => {
    const ext = file.extension?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        return <Code className="h-3.5 w-3.5 text-blue-500" />;
      case 'json':
        return <FileJson className="h-3.5 w-3.5 text-yellow-500" />;
      case 'md':
      case 'mdx':
        return <FileType className="h-3.5 w-3.5 text-gray-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        return <Image className="h-3.5 w-3.5 text-green-500" />;
      default:
        return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getRelativePath = (fullPath: string) => {
    if (currentDirectory && fullPath.startsWith(currentDirectory)) {
      const relativePath = fullPath.substring(currentDirectory.length);
      return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    }
    return fullPath.split('/').pop() || fullPath;
  };

  // Always show the component when triggered, even if no files yet
  // This helps with debugging and provides feedback

  return (
    <div 
      className="absolute z-[100] min-w-[200px] max-w-[400px] max-h-64 bg-popover border border-border rounded-xl shadow-xl bottom-full mb-2 left-0 w-max flex flex-col"
    >
      <div className="overflow-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="py-1 pb-2">
            {files.map((file, index) => {
            const relativePath = getRelativePath(file.path);

            return (
              <div
                key={file.path}
                ref={(el) => { itemRefs.current[index] = el; }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 cursor-pointer typography-ui-label",
                  index === selectedIndex && "bg-accent"
                )}
                onClick={() => handleFileSelect(file)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {getFileIcon(file)}
                <span className="whitespace-nowrap">{relativePath}</span>
              </div>
            );
            })}
            {/* Add padding after the last item */}
            {files.length > 0 && <div className="h-2" />}
            {files.length === 0 && (
              <div className="px-3 py-2 typography-ui-label text-muted-foreground">
                No files found
              </div>
            )}
          </div>
        )}
      </div>
      <div className="px-3 pt-1 pb-1.5 border-t typography-meta text-muted-foreground">
        ↑↓ navigate • Enter select • Esc close
      </div>
    </div>
  );
});