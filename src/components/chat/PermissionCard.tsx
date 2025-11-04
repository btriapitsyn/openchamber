import React from 'react';
import { Question as Shield, Check, X, Clock, TerminalWindow as Terminal, PencilSimple as FileEdit, Globe, Wrench } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { Permission, PermissionResponse } from '@/types/permission';
import { useSessionStore } from '@/stores/useSessionStore';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';

interface PermissionCardProps {
  permission: Permission;
  onResponse?: (response: 'once' | 'always' | 'reject') => void;
}

// Tool type mapping based on OpenCode's permission system (edit, bash, webfetch)
const getToolIcon = (toolName: string) => {
  const iconClass = "h-3 w-3";
  const tool = toolName.toLowerCase();
  
  // Edit operations (file editing)
  if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
    return <FileEdit className={iconClass} />;
  }
  
  // Bash/Shell operations
  if (tool === 'bash' || tool === 'shell' || tool === 'cmd' || tool === 'terminal' || tool === 'shell_command') {
    return <Terminal className={iconClass} />;
  }
  
  // Web fetch operations
  if (tool === 'webfetch' || tool === 'fetch' || tool === 'curl' || tool === 'wget') {
    return <Globe className={iconClass} />;
  }
  
  // Default for any other tool
  return <Wrench className={iconClass} />;
};

const getToolDisplayName = (toolName: string): string => {
  const tool = toolName.toLowerCase();
  
  if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
    return 'edit';
  }
  if (tool === 'bash' || tool === 'shell' || tool === 'cmd' || tool === 'terminal' || tool === 'shell_command') {
    return 'bash';
  }
  if (tool === 'webfetch' || tool === 'fetch' || tool === 'curl' || tool === 'wget') {
    return 'webfetch';
  }
  
  return toolName;
};

export const PermissionCard: React.FC<PermissionCardProps> = ({ 
  permission, 
  onResponse 
}) => {
  const [isResponding, setIsResponding] = React.useState(false);
  const [hasResponded, setHasResponded] = React.useState(false);
  const { respondToPermission } = useSessionStore();
  const { currentTheme } = useThemeSystem();
  const syntaxTheme = React.useMemo(() => generateSyntaxTheme(currentTheme), [currentTheme]);

  const handleResponse = async (response: PermissionResponse) => {
    setIsResponding(true);
    
    try {
      await respondToPermission(permission.sessionID, permission.id, response);
      setHasResponded(true);
      onResponse?.(response);
    } catch {
      // Failed to respond to permission
    } finally {
      setIsResponding(false);
    }
  };

  if (hasResponded) {
    return null;
  }

  // Extract tool information
  const toolName = permission.type || 'Unknown Tool';
  const tool = toolName.toLowerCase();
  // Helper to safely extract metadata properties - metadata values are unknown types
  const getMeta = (key: string, fallback: string = ''): string => {
    const val = permission.metadata[key];
    return typeof val === 'string' ? val : (typeof val === 'number' ? String(val) : fallback);
  };
  const getMetaNum = (key: string): number | undefined => {
    const val = permission.metadata[key];
    return typeof val === 'number' ? val : undefined;
  };
  const getMetaBool = (key: string): boolean => {
    const val = permission.metadata[key];
    return Boolean(val);
  };
  const displayToolName = getToolDisplayName(toolName);
  
  // Render tool-specific content based on OpenCode's three permission types
  const renderToolContent = () => {
    // Bash commands (OpenCode permission type: bash)
    if (tool === 'bash' || tool === 'shell' || tool === 'shell_command') {
      const command = getMeta('command') || getMeta('cmd') || getMeta('script');
      const description = getMeta('description');
      const workingDir = getMeta('cwd') || getMeta('working_directory') || getMeta('directory') || getMeta('path');
      const timeout = getMetaNum('timeout');
      
      // Check if command is already displayed in title
      const commandInTitle = permission.title === command;
      
      return (
        <>
          {description && (
            <div className="typography-meta text-muted-foreground mb-2">{description}</div>
          )}
          {workingDir && (
            <div className="typography-meta text-muted-foreground mb-2">
              <span className="font-semibold">Working Directory:</span> <code className="px-1 py-0.5 bg-muted/30 rounded">{workingDir}</code>
            </div>
          )}
          {timeout && (
            <div className="typography-meta text-muted-foreground mb-2">
              <span className="font-semibold">Timeout:</span> {timeout}ms
            </div>
          )}
          {/* Only show command if it's not already in the title */}
          {command && !commandInTitle && (
            <div className="overflow-x-auto">
              <SyntaxHighlighter
                language="bash"
                style={syntaxTheme}
                customStyle={{
                  margin: 0,
                  padding: '0.5rem',
                  fontSize: 'var(--text-meta)',
                  lineHeight: '1.25rem',
                  background: 'rgb(var(--muted) / 0.3)',
                  borderRadius: '0.25rem'
                }}
                wrapLongLines={false}
              >
                {command}
              </SyntaxHighlighter>
            </div>
          )}
        </>
      );
    }
    
    // Edit operations (OpenCode permission type: edit)
    if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
      const filePath = getMeta('path') || getMeta('file_path') || getMeta('filename') || getMeta('filePath');
      const oldContent = getMeta('old_str') || getMeta('oldString') || getMeta('old_content') || getMeta('before');
      const newContent = getMeta('new_str') || getMeta('newString') || getMeta('new_content') || getMeta('after');
      const changes = getMeta('changes') || getMeta('diff');
      const replaceAll = getMetaBool('replace_all') || getMetaBool('replaceAll');
      
      return (
        <>
          {filePath && (
            <div className="mb-2">
              <div className="typography-meta text-muted-foreground mb-1">File Path:</div>
              <code className="typography-meta px-2 py-1 bg-muted/30 rounded block break-all">
                {filePath}
              </code>
            </div>
          )}
          {replaceAll && (
            <div className="typography-meta text-muted-foreground mb-2">
              <span className="font-semibold">⚠️ Replace All Occurrences</span>
            </div>
          )}
          {changes ? (
            <div>
              <div className="typography-meta text-muted-foreground mb-1">Changes:</div>
              <div className="max-h-64 overflow-y-auto overflow-x-auto">
                <SyntaxHighlighter
                  language="diff"
                  style={syntaxTheme}
                  customStyle={{
                    margin: 0,
                    padding: '0.5rem',
                    fontSize: 'var(--text-meta)',
                    lineHeight: '1.25rem',
                    background: 'rgb(var(--muted) / 0.3)',
                    borderRadius: '0.25rem'
                  }}
                  wrapLongLines={false}
                >
                  {changes}
                </SyntaxHighlighter>
              </div>
            </div>
          ) : (
            <>
              {oldContent && (
                <div className="mb-2">
                  <div className="typography-meta text-muted-foreground mb-1">Remove:</div>
                  <div className="max-h-32 overflow-y-auto border border-red-500/20 rounded bg-red-500/5 p-2">
                    <pre className="typography-meta font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap break-all">
                      {oldContent.length > 500 ? oldContent.substring(0, 500) + '...' : oldContent}
                    </pre>
                  </div>
                </div>
              )}
              {newContent && (
                <div>
                  <div className="typography-meta text-muted-foreground mb-1">Replace with:</div>
                  <div className="max-h-32 overflow-y-auto border border-green-500/20 rounded bg-green-500/5 p-2">
                    <pre className="typography-meta font-mono text-green-600 dark:text-green-400 whitespace-pre-wrap break-all">
                      {newContent.length > 500 ? newContent.substring(0, 500) + '...' : newContent}
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      );
    }
    
    // Web fetch operations (OpenCode permission type: webfetch)
    if (tool === 'webfetch' || tool === 'fetch' || tool === 'curl' || tool === 'wget') {
      const url = getMeta('url') || getMeta('uri') || getMeta('endpoint');
      const method = getMeta('method') || 'GET';
      const headers = permission.metadata.headers && typeof permission.metadata.headers === 'object' ? (permission.metadata.headers as Record<string, unknown>) : undefined;
      const body = getMeta('body') || getMeta('data') || getMeta('payload');
      const timeout = getMetaNum('timeout');
      const format = getMeta('format') || getMeta('responseType');
      
      return (
        <>
          {url && (
            <div className="mb-2">
              <div className="typography-meta text-muted-foreground mb-1">Request:</div>
              <div className="flex items-center gap-2">
                <span className="typography-meta font-semibold px-1.5 py-0.5 bg-primary/20 text-primary rounded">
                  {method}
                </span>
                <code className="typography-meta px-2 py-1 bg-muted/30 rounded flex-1 break-all">
                  {url}
                </code>
              </div>
            </div>
          )}
          {headers && Object.keys(headers).length > 0 && (
            <div className="mb-2">
              <div className="typography-meta text-muted-foreground mb-1">Headers:</div>
              <div className="max-h-24 overflow-y-auto">
                <SyntaxHighlighter
                  language="json"
                  style={syntaxTheme}
                  customStyle={{
                    margin: 0,
                    padding: '0.5rem',
                    fontSize: 'var(--text-meta)',
                    lineHeight: '1.25rem',
                    background: 'rgb(var(--muted) / 0.3)',
                    borderRadius: '0.25rem'
                  }}
                  wrapLongLines={true}
                >
                  {JSON.stringify(headers, null, 2)}
                </SyntaxHighlighter>
              </div>
            </div>
          )}
          {body && (
            <div className="mb-2">
              <div className="typography-meta text-muted-foreground mb-1">Body:</div>
              <div className="max-h-32 overflow-y-auto">
                <SyntaxHighlighter
                  language={typeof body === 'object' ? 'json' : 'text'}
                  style={syntaxTheme}
                  customStyle={{
                    margin: 0,
                    padding: '0.5rem',
                    fontSize: 'var(--text-meta)',
                    lineHeight: '1.25rem',
                    background: 'rgb(var(--muted) / 0.3)',
                    borderRadius: '0.25rem'
                  }}
                  wrapLongLines={true}
                >
                  {typeof body === 'object' ? JSON.stringify(body, null, 2) : String(body)}
                </SyntaxHighlighter>
              </div>
            </div>
          )}
          {(timeout || format) && (
            <div className="typography-meta text-muted-foreground">
              {timeout && <span>Timeout: {timeout}ms</span>}
              {timeout && format && <span> • </span>}
              {format && <span>Response format: {format}</span>}
            </div>
          )}
        </>
      );
    }
    
    // Generic fallback for unknown tools
    const genericContent = getMeta('command') || getMeta('content') || getMeta('action') || getMeta('operation');
    const description = getMeta('description');

    return (
      <>
        {description && (
          <div className="typography-meta text-muted-foreground mb-2">{description}</div>
        )}
        {genericContent && (
          <div className="mb-2">
            <div className="typography-meta text-muted-foreground mb-1">Action:</div>
            <div className="max-h-32 overflow-y-auto">
              <pre className="typography-meta font-mono px-2 py-1 bg-muted/30 rounded whitespace-pre-wrap break-all">
                {String(genericContent)}
              </pre>
            </div>
          </div>
        )}
        {/* Show metadata for debugging unknown tools */}
        {Object.keys(permission.metadata).length > 0 && !genericContent && !description && (
          <div>
            <div className="typography-meta text-muted-foreground mb-1">Details:</div>
            <div className="max-h-32 overflow-y-auto">
              <pre className="typography-meta font-mono px-2 py-1 bg-muted/30 rounded whitespace-pre-wrap break-all">
                {JSON.stringify(permission.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="group w-full pt-0 pb-2">
      <div className="chat-column">
        <div className="ml-[52px] -mt-1 border border-border/30 rounded-xl bg-muted/10">
          {/* Header */}
          <div className="px-2 py-1.5 border-b border-border/20 bg-muted/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-yellow-500" />
                <span className="typography-meta font-medium text-muted-foreground">
                  Permission Required
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {getToolIcon(toolName)}
                <span className="typography-meta text-muted-foreground font-medium">{displayToolName}</span>
              </div>
            </div>
          </div>
          
          {/* Main content area */}
          <div className="px-2 py-2">
            {/* Title/Command Display with smart deduplication */}
            {(() => {
              // Determine what the primary content is for this tool type
              let primaryContent = '';
              let primaryLanguage = 'text';
              let shouldHighlight = false;
              
              // Bash commands
              if (tool === 'bash' || tool === 'shell' || tool === 'shell_command') {
                primaryContent = getMeta('command') || getMeta('cmd') || getMeta('script');
                primaryLanguage = 'bash';
                shouldHighlight = true;
              }
              // Edit operations - show file path
              else if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
                primaryContent = getMeta('path') || getMeta('file_path') || getMeta('filename') || getMeta('filePath');
                shouldHighlight = false; // File paths don't need syntax highlighting
              }
              // Webfetch - show URL
              else if (tool === 'webfetch' || tool === 'fetch') {
                primaryContent = getMeta('url') || getMeta('uri') || getMeta('endpoint');
                shouldHighlight = false;
              }
              
              const titleMatchesContent = permission.title === primaryContent;
              
              // If title exactly matches the primary content and we should highlight it
              if (titleMatchesContent && primaryContent && shouldHighlight) {
                return (
                  <div className="mb-3 overflow-x-auto">
                    <SyntaxHighlighter
                      language={primaryLanguage}
                      style={syntaxTheme}
                      customStyle={{
                        margin: 0,
                        padding: '0.5rem',
                        fontSize: 'var(--text-meta)',
                        lineHeight: '1.25rem',
                        background: 'rgb(var(--muted) / 0.3)',
                        borderRadius: '0.25rem'
                      }}
                      wrapLongLines={false}
                    >
                      {primaryContent}
                    </SyntaxHighlighter>
                  </div>
                );
              }
              
              // If title matches file path or URL, show it with monospace font
              if (titleMatchesContent && primaryContent && !shouldHighlight) {
                return (
                  <div className="mb-3">
                    <code className="typography-ui-label px-2 py-1 bg-muted/30 rounded block break-all">
                      {primaryContent}
                    </code>
                  </div>
                );
              }
              
              // Otherwise show the title as plain text
              if (permission.title) {
                return (
                  <div className={cn(
                    "typography-ui-label text-foreground mb-3",
                    // Use monospace for technical content
                    (shouldHighlight || primaryContent) && "font-mono"
                  )}>
                    {permission.title}
                  </div>
                );
              }
              
              return null;
            })()}
            
            {/* Tool-specific content (will skip duplicates) */}
            {renderToolContent()}
          </div>
        
          {/* Action buttons */}
          <div className="px-2 pb-1.5 pt-1 flex items-center gap-1.5 border-t border-border/20">
            <button
              onClick={() => handleResponse('once')}
              disabled={isResponding}
              className={cn(
                "flex items-center gap-1 px-2 py-1 typography-meta font-medium rounded transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              style={{
                backgroundColor: 'rgb(var(--status-success) / 0.1)',
                color: 'var(--status-success)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(var(--status-success) / 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(var(--status-success) / 0.1)';
              }}
            >
              <Check className="h-3 w-3"  weight="bold" />
              Allow Once
            </button>
            
            <button
              onClick={() => handleResponse('always')}
              disabled={isResponding}
              className={cn(
                "flex items-center gap-1 px-2 py-1 typography-meta font-medium rounded transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              style={{
                backgroundColor: 'rgb(var(--muted) / 0.5)',
                color: 'var(--muted-foreground)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(var(--muted) / 0.7)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(var(--muted) / 0.5)';
              }}
            >
              <Clock className="h-3 w-3" />
              Always Allow
            </button>
            
            <button
              onClick={() => handleResponse('reject')}
              disabled={isResponding}
              className={cn(
                "flex items-center gap-1 px-2 py-1 typography-meta font-medium rounded transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              style={{
                backgroundColor: 'rgb(var(--status-error) / 0.1)',
                color: 'var(--status-error)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(var(--status-error) / 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(var(--status-error) / 0.1)';
              }}
            >
              <X className="h-3 w-3"  weight="bold" />
              Deny
            </button>
            
            <div className="ml-auto typography-meta text-muted-foreground">
              {isResponding ? (
                <div className="animate-spin h-3 w-3 border border-primary border-t-transparent rounded-full" />
              ) : (
                <span className="flex items-center gap-1">
                  Review carefully before allowing
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
