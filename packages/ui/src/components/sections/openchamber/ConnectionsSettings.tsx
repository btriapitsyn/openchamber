import React from 'react';
import { useConnectionsStore } from '@/stores/useConnectionsStore';
import { Button } from '@/components/ui/button';
import { RiAddLine, RiDeleteBinLine, RiEditLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import type { Connection } from '@/lib/api/types';
import { toast } from '@/components/ui/toast';

export const ConnectionsSettings: React.FC = () => {
  const connections = useConnectionsStore((state) => state.connections);
  const connectionHealth = useConnectionsStore((state) => state.connectionHealth);
  const addConnection = useConnectionsStore((state) => state.addConnection);
  const removeConnection = useConnectionsStore((state) => state.removeConnection);
  const updateConnection = useConnectionsStore((state) => state.updateConnection);
  const startHealthChecks = useConnectionsStore((state) => state.startHealthChecks);
  const stopHealthChecks = useConnectionsStore((state) => state.stopHealthChecks);

  const [showAddForm, setShowAddForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formLabel, setFormLabel] = React.useState('');
  const [formBaseUrl, setFormBaseUrl] = React.useState('');

  // Start health checks when component mounts
  React.useEffect(() => {
    startHealthChecks();
    return () => {
      stopHealthChecks();
    };
  }, [startHealthChecks, stopHealthChecks]);

  const handleAdd = () => {
    if (!formLabel.trim() || !formBaseUrl.trim()) {
      console.warn('[ConnectionsSettings] Cannot add connection: empty fields');
      return;
    }

    const result = addConnection({
      label: formLabel,
      baseUrl: formBaseUrl,
      type: 'remote',
    });

    if (result) {
      // Check if it's a new connection (different from what we tried to add)
      const isDuplicate = result.baseUrl === formBaseUrl.trim() && 
                          result.label !== formLabel.trim();
      
      if (isDuplicate) {
        toast.error('A connection with this URL already exists');
      } else {
        setFormLabel('');
        setFormBaseUrl('');
        setShowAddForm(false);
      }
    }
  };

  const handleEdit = (connection: Connection) => {
    setEditingId(connection.id);
    setFormLabel(connection.label);
    setFormBaseUrl(connection.baseUrl);
    setShowAddForm(false);
  };

  const handleUpdate = () => {
    if (!editingId || !formLabel.trim() || !formBaseUrl.trim()) {
      console.warn('[ConnectionsSettings] Cannot update connection: empty fields');
      return;
    }

    updateConnection(editingId, {
      label: formLabel,
      baseUrl: formBaseUrl,
    });

    setEditingId(null);
    setFormLabel('');
    setFormBaseUrl('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormLabel('');
    setFormBaseUrl('');
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
    setFormLabel('');
    setFormBaseUrl('');
  };

  const handleDelete = (id: string) => {
    if (id === 'local') {
      return;
    }
    removeConnection(id);
  };

  const getHealthStatusColor = (connectionId: string): string => {
    const health = connectionHealth[connectionId];
    if (!health) {
      return 'var(--color-muted-foreground)';
    }

    switch (health.status) {
      case 'connected':
        return 'var(--color-status-success)';
      case 'disconnected':
        return 'var(--color-status-error)';
      case 'checking':
        return 'var(--color-status-warning)';
      default:
        return 'var(--color-muted-foreground)';
    }
  };

  const getHealthStatusLabel = (connectionId: string): string => {
    const health = connectionHealth[connectionId];
    if (!health) {
      return 'Unknown';
    }

    switch (health.status) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'checking':
        return 'Checking...';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1 pt-2">
        <h3 className="typography-ui-header font-semibold text-foreground">
          Connections
        </h3>
        <p className="typography-meta text-muted-foreground">
          Manage local and remote OpenCode endpoints.
        </p>
      </div>

      {/* Connections list */}
      <div className="space-y-2">
        {connections.map((connection) => {
          const isEditing = editingId === connection.id;
          const isLocal = connection.type === 'local';
          const health = connectionHealth[connection.id];
          const statusColor = getHealthStatusColor(connection.id);
          const statusLabel = getHealthStatusLabel(connection.id);

          if (isEditing) {
            return (
              <div key={connection.id} className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                <div className="space-y-2">
                  <div>
                    <label htmlFor={`connection-label-edit-${connection.id}`} className="typography-micro text-muted-foreground block mb-1">
                      Label
                    </label>
                    <input
                      id={`connection-label-edit-${connection.id}`}
                      type="text"
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 typography-ui text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      placeholder="My Remote Server"
                      aria-required="true"
                    />
                  </div>
                  <div>
                    <label htmlFor={`connection-baseurl-edit-${connection.id}`} className="typography-micro text-muted-foreground block mb-1">
                      Base URL
                    </label>
                    <input
                      id={`connection-baseurl-edit-${connection.id}`}
                      type="text"
                      value={formBaseUrl}
                      onChange={(e) => setFormBaseUrl(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 typography-ui text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      placeholder="http://localhost:39393/api"
                      aria-required="true"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleUpdate}
                    disabled={!formLabel.trim() || !formBaseUrl.trim()}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={connection.id}
              className="rounded-md border border-border bg-muted/10 p-3 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="typography-ui-label font-medium text-foreground">
                      {connection.label}
                    </span>
                    <span
                      className="typography-micro uppercase font-semibold px-1.5 py-0.5 rounded border"
                      style={{
                        backgroundColor: isLocal ? 'var(--color-accent-background)' : 'var(--color-muted-background)',
                        color: isLocal ? 'var(--color-accent-foreground)' : 'var(--color-muted-foreground)',
                        borderColor: isLocal ? 'var(--color-accent-border)' : 'var(--color-border)',
                      }}
                    >
                      {connection.type}
                    </span>
                  </div>
                  <div className="typography-micro text-muted-foreground truncate">
                    {connection.baseUrl}
                  </div>
                  <div className="flex items-center gap-2" aria-live="polite" aria-atomic="true">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: statusColor }}
                      title={statusLabel}
                    />
                    <span className="typography-micro text-muted-foreground">
                      {statusLabel}
                    </span>
                    {health?.status === 'connected' && health.latencyMs !== undefined && (
                      <span className="typography-micro text-muted-foreground">
                        · {health.latencyMs}ms
                      </span>
                    )}
                    {health?.error && (
                      <span className="typography-micro text-muted-foreground">
                        · {health.error}
                      </span>
                    )}
                  </div>
                </div>

                {!isLocal && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEdit(connection)}
                      className="h-8 w-8"
                      title="Edit connection"
                      aria-label={`Edit ${connection.label} connection`}
                    >
                      <RiEditLine className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(connection.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Delete connection"
                      aria-label={`Delete ${connection.label} connection`}
                    >
                      <RiDeleteBinLine className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add connection form */}
      {showAddForm ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
          <div className="space-y-2">
            <div>
              <label htmlFor="connection-label-add" className="typography-micro text-muted-foreground block mb-1">
                Label
              </label>
              <input
                id="connection-label-add"
                type="text"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 typography-ui text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="My Remote Server"
                aria-required="true"
              />
            </div>
            <div>
              <label htmlFor="connection-baseurl-add" className="typography-micro text-muted-foreground block mb-1">
                Base URL
              </label>
              <input
                id="connection-baseurl-add"
                type="text"
                value={formBaseUrl}
                onChange={(e) => setFormBaseUrl(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 typography-ui text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="http://localhost:39393/api"
                aria-required="true"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!formLabel.trim() || !formBaseUrl.trim()}
            >
              Add Connection
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelAdd}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => setShowAddForm(true)}
          className={cn('w-full')}
        >
          <RiAddLine className="h-4 w-4 mr-2" />
          Add Connection
        </Button>
      )}
    </div>
  );
};
