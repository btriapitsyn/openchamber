import React from 'react';
import { AlertTriangle, Check, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Permission, PermissionResponse } from '@/types/permission';
import { useSessionStore } from '@/stores/useSessionStore';

interface PermissionRequestProps {
  permission: Permission;
  onResponse?: (response: 'once' | 'always' | 'reject') => void;
}

export const PermissionRequest: React.FC<PermissionRequestProps> = ({ 
  permission, 
  onResponse 
}) => {
  const [isResponding, setIsResponding] = React.useState(false);
  const [hasResponded, setHasResponded] = React.useState(false);
  const { respondToPermission } = useSessionStore();

  const handleResponse = async (response: PermissionResponse) => {
    setIsResponding(true);
    
    try {
      await respondToPermission(permission.sessionID, permission.id, response);
      setHasResponded(true);
      onResponse?.(response);
    } catch (error) {
      console.error('Failed to respond to permission:', error);
    } finally {
      setIsResponding(false);
    }
  };

  if (hasResponded) {
    return null; // Hide after responding
  }

  // Get the command from metadata if available
  const command = permission.metadata?.command || permission.title;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="min-w-0">
          <span className="text-sm font-medium text-muted-foreground">
            Permission required:
          </span>
          <code className="ml-2 text-xs bg-amber-100/50 dark:bg-amber-800/30 px-1.5 py-0.5 rounded font-mono text-amber-800 dark:text-amber-200">
            {command}
          </code>
        </div>
      </div>
      
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
        <button
          onClick={() => handleResponse('once')}
          disabled={isResponding}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors h-6",
            "border-green-500/60 text-green-600/80 hover:bg-green-50/50 dark:hover:bg-green-900/10",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Check className="h-3 w-3" />
          Once
        </button>
        
        <button
          onClick={() => handleResponse('always')}
          disabled={isResponding}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors h-6",
            "border-blue-500/60 text-blue-600/80 hover:bg-blue-50/50 dark:hover:bg-blue-900/10",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Clock className="h-3 w-3" />
          Always
        </button>
        
        <button
          onClick={() => handleResponse('reject')}
          disabled={isResponding}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors h-6",
            "border-red-500/60 text-red-600/80 hover:bg-red-50/50 dark:hover:bg-red-900/10",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <X className="h-3 w-3" />
          Reject
        </button>

        {isResponding && (
          <div className="ml-2 flex items-center">
            <div className="animate-spin h-3 w-3 border-2 border-muted-foreground border-t-transparent rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
};