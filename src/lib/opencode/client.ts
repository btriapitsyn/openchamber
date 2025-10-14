import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk";
import type { 
  Session, 
  Message, 
  Part,
  Provider,
  Config,
  Model,
  Agent
} from "@opencode-ai/sdk";

// Use relative path by default (works with both dev and nginx proxy server)
// Can be overridden with VITE_OPENCODE_URL for absolute URLs in special deployments
const DEFAULT_BASE_URL = import.meta.env.VITE_OPENCODE_URL || "/api";

interface App {
  version?: string;
  [key: string]: any;
}

class OpencodeService {
  private client: OpencodeClient;
  private baseUrl: string;
  private sseAbortController: AbortController | null = null;
  private currentDirectory: string | undefined = undefined;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
    this.client = createOpencodeClient({ baseUrl });
  }

  private normalizeCandidatePath(path?: string | null): string | null {
    if (typeof path !== 'string') {
      return null;
    }

    const trimmed = path.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = trimmed.replace(/\\/g, '/');
    const withoutTrailingSlash = normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;

    return withoutTrailingSlash || null;
  }

  private deriveHomeDirectory(path: string): { homeDirectory: string; username?: string } {
    const windowsMatch = path.match(/^([A-Za-z]:)(?:\/|$)/);
    if (windowsMatch) {
      const drive = windowsMatch[1];
      const remainder = path.slice(drive.length + (path.charAt(drive.length) === '/' ? 1 : 0));
      const segments = remainder.split('/').filter(Boolean);

      if (segments.length >= 2) {
        const homeDirectory = `${drive}/${segments[0]}/${segments[1]}`;
        return { homeDirectory, username: segments[1] };
      }

      if (segments.length === 1) {
        const homeDirectory = `${drive}/${segments[0]}`;
        return { homeDirectory, username: segments[0] };
      }

      return { homeDirectory: drive, username: undefined };
    }

    const absolute = path.startsWith('/');
    const segments = path.split('/').filter(Boolean);

    if (segments.length >= 2 && (segments[0] === 'Users' || segments[0] === 'home')) {
      const homeDirectory = `${absolute ? '/' : ''}${segments[0]}/${segments[1]}`;
      return { homeDirectory, username: segments[1] };
    }

    if (absolute) {
      if (segments.length === 0) {
        return { homeDirectory: '/', username: undefined };
      }
      const homeDirectory = `/${segments.join('/')}`;
      return { homeDirectory, username: segments[segments.length - 1] };
    }

    if (segments.length > 0) {
      const homeDirectory = `/${segments.join('/')}`;
      return { homeDirectory, username: segments[segments.length - 1] };
    }

    return { homeDirectory: '/', username: undefined };
  }

  // Set the current working directory for all API calls
  setDirectory(directory: string | undefined) {
    this.currentDirectory = directory;
  }

  getDirectory(): string | undefined {
    return this.currentDirectory;
  }

  // Get the raw API client for direct access
  getApiClient(): OpencodeClient {
    return this.client;
  }


  // Get system information including home directory
  async getSystemInfo(): Promise<{ homeDirectory: string; username?: string }> {
    const candidates = new Set<string>();
    const addCandidate = (value?: string | null) => {
      const normalized = this.normalizeCandidatePath(value);
      if (normalized) {
        candidates.add(normalized);
      }
    };

    try {
      const response = await this.client.path.get({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      const info = response.data;
      if (info) {
        addCandidate(info.directory);
        addCandidate(info.worktree);
        addCandidate(info.state);
      }
    } catch (error) {
      console.debug('Failed to load path info:', error);
    }

    if (!candidates.size) {
      try {
        const project = await this.client.project.current({
          query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
        });
        addCandidate(project.data?.worktree);
      } catch (error) {
        console.debug('Failed to load project info:', error);
      }
    }

    if (!candidates.size) {
      try {
        const sessions = await this.listSessions();
        sessions.forEach((session) => addCandidate(session.directory));
      } catch (error) {
        console.debug('Failed to inspect sessions for system info:', error);
      }
    }

    addCandidate(this.currentDirectory);

    if (typeof window !== 'undefined') {
      try {
        addCandidate(window.localStorage.getItem('lastDirectory'));
        addCandidate(window.localStorage.getItem('homeDirectory'));
      } catch {
        // Access to storage failed (e.g. privacy mode)
      }
    }

    if (!candidates.size && typeof process !== 'undefined' && typeof process.cwd === 'function') {
      addCandidate(process.cwd());
    }

    if (!candidates.size) {
      return { homeDirectory: '/', username: undefined };
    }

    const [primary] = Array.from(candidates);
    return this.deriveHomeDirectory(primary);
  }

  // Session Management
  async listSessions(): Promise<Session[]> {
    try {
      const response = await this.client.session.list({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      return response.data || [];
    } catch (error) {
      throw error;
    }
  }

  async createSession(params?: { parentID?: string; title?: string }): Promise<Session> {
    try {
      const response = await this.client.session.create({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
        body: {
          parentID: params?.parentID,
          title: params?.title
        }
      });
      if (!response.data) throw new Error('Failed to create session');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getSession(id: string): Promise<Session> {
    try {
      const response = await this.client.session.get({
        path: { id },
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      if (!response.data) throw new Error('Session not found');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      const response = await this.client.session.delete({
        path: { id },
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      return response.data || false;
    } catch (error) {
      throw error;
    }
  }

  async updateSession(id: string, title?: string): Promise<Session> {
    try {
      const response = await this.client.session.update({
        path: { id },
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
        body: { title }
      });
      if (!response.data) throw new Error('Failed to update session');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getSessionMessages(id: string): Promise<{ info: Message; parts: Part[] }[]> {
    try {
      const response = await this.client.session.messages({
        path: { id },
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      return response.data || [];
    } catch (error) {
      throw error;
    }
  }

  async sendMessage(params: {
    id: string;
    providerID: string;
    modelID: string;
    text: string;
    agent?: string;
    files?: Array<{
      type: 'file';
      mime: string;
      filename?: string;
      url: string;
    }>;
    messageId?: string;
  }): Promise<string> {
    // Generate a temporary client-side ID for optimistic UI
    // This ID won't be sent to the server - server will generate its own
    const baseTimestamp = Date.now();
    const tempMessageId = params.messageId ?? `temp_${baseTimestamp}_${Math.random().toString(36).substring(2, 9)}`;

    // Build parts array using SDK types (TextPartInput | FilePartInput)
    const parts: any[] = [];

    // Add text part if there's content
    if (params.text && params.text.trim()) {
      parts.push({
        type: 'text',
        text: params.text
      });
    }

    // Add file parts if provided
    if (params.files && params.files.length > 0) {
      params.files.forEach((file) => {
        parts.push({
          type: 'file',
          mime: file.mime,
          filename: file.filename,
          url: file.url
        });
      });
    }

    // Ensure we have at least one part
    if (parts.length === 0) {
      throw new Error('Message must have at least one part (text or file)');
    }

    try {
      // Use SDK session.prompt() method
      // DON'T send messageID - let server generate it (fixes Claude empty response issue)
      await this.client.session.prompt({
        path: { id: params.id },
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
        body: {
          // messageID intentionally omitted - server will generate
          model: {
            providerID: params.providerID,
            modelID: params.modelID
          },
          agent: params.agent,
          parts
        }
      });

      // Return temporary ID for optimistic UI
      // Real messageID will come from server via SSE events
      return tempMessageId;
    } catch (error: any) {
      console.error('Failed to send message via SDK:', error);
      throw error;
    }
  }

  async abortSession(id: string): Promise<boolean> {
    try {
      const response = await this.client.session.abort({
        path: { id }
      });
      return response.data || false;
    } catch (error) {
      throw error;
    }
  }

  // Permissions
  async respondToPermission(
    sessionId: string, 
    permissionId: string, 
    response: 'once' | 'always' | 'reject'
  ): Promise<boolean> {
    try {
      const result = await this.client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
        body: { response }
      });
      return result.data || false;
    } catch (error) {
      throw error;
    }
  }

  // Configuration
  async getConfig(): Promise<Config> {
    try {
      const response = await this.client.config.get();
      if (!response.data) throw new Error('Failed to get config');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async updateConfig(config: any): Promise<Config> {
    try {
      // IMPORTANT: Do NOT pass directory parameter for config updates
      // The config should be global, not directory-specific
      const url = `${this.baseUrl}/config`;

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[OpencodeClient] Failed to update config:', response.status, errorText);
        throw new Error(`Failed to update config: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('[OpencodeClient] updateConfig error:', error);
      throw error;
    }
  }

  /**
   * Update config with a partial modification function.
   * This handles the GET-modify-PATCH pattern required by OpenCode API.
   *
   * NOTE: This method is deprecated for agent configuration.
   * Use backend endpoints at /api/config/agents/* instead, which write directly to files.
   *
   * @param modifier Function that receives current config and returns modified config
   * @returns Updated config from server
   */
  async updateConfigPartial(modifier: (config: Config) => Config): Promise<Config> {
    try {
      const currentConfig = await this.getConfig();
      const updatedConfig = modifier(currentConfig);
      const result = await this.updateConfig(updatedConfig);
      return result;
    } catch (error) {
      console.error('[OpencodeClient] updateConfigPartial error:', error);
      throw error;
    }
  }

  async getProviders(): Promise<{
    providers: Provider[];
    default: { [key: string]: string };
  }> {
    try {
      const response = await this.client.config.providers({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      if (!response.data) throw new Error('Failed to get providers');
      return response.data;
    } catch (error) {
      console.error("Failed to get providers:", error);
      throw error;
    }
  }

  // App Management - using config endpoint since /app doesn't exist in this version
  async getApp(): Promise<App> {
    try {
      // Return basic app info from config
      const config = await this.getConfig();
      return {
        version: "0.0.3", // from the OpenAPI spec
        config
      };
    } catch (error) {
      throw error;
    }
  }

  async initApp(): Promise<boolean> {
    try {
      // Just check if we can connect since there's no init endpoint
      return await this.checkHealth();
    } catch (error) {
      return false;
    }
  }

  // Agent Management
  async listAgents(): Promise<Agent[]> {
    try {
      const response = await this.client.app.agents({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      return response.data || [];
    } catch (error) {
      return [];
    }
  }

  // Event Streaming using SDK SSE (Server-Sent Events) with AsyncGenerator
  subscribeToEvents(
    onMessage: (event: any) => void,
    onError?: (error: any) => void,
    onOpen?: () => void
  ): () => void {
    // Stop any existing subscription
    if (this.sseAbortController) {
      this.sseAbortController.abort();
    }

    // Create new AbortController for this subscription
    const abortController = new AbortController();
    this.sseAbortController = abortController;

    // Start async generator in background
    (async () => {
      try {
        // Call SDK event.subscribe() which returns AsyncGenerator
        const result = await this.client.event.subscribe({
          query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
          signal: abortController.signal,
          // SDK handles retry automatically with exponential backoff
          // Match TUI's conservative retry settings to avoid triggering empty responses
          sseMaxRetryAttempts: 2,
          sseDefaultRetryDelay: 500, // 500ms initial delay (match TUI behavior)
          sseMaxRetryDelay: 8000, // 8 seconds max delay
          onSseError: (error) => {
            // Ignore AbortError - this is expected when unsubscribing
            if (error instanceof Error && error.name === 'AbortError') {
              return;
            }
            if (onError && !abortController.signal.aborted) {
              onError(error);
            }
          },
          onSseEvent: (event) => {
            // This callback fires for each event received
            if (!abortController.signal.aborted) {
              onMessage(event.data);
            }
          }
        });

        // Notify connection opened
        if (onOpen && !abortController.signal.aborted) {
          onOpen();
        }

        // Consume the async generator stream
        for await (const event of result.stream) {
          if (abortController.signal.aborted) {
            break;
          }
          // Event already processed via onSseEvent callback
          // This loop keeps the generator alive
        }
      } catch (error: any) {
        // Ignore AbortError - this is expected when unsubscribing
        if (error?.name === 'AbortError' || abortController.signal.aborted) {
          return;
        }
        console.error('SDK SSE: Stream error:', error);
        if (onError) {
          onError(error);
        }
      }
    })();

    // Return cleanup function
    return () => {
      if (this.sseAbortController === abortController) {
        this.sseAbortController = null;
      }
      abortController.abort();
    };
  }

  // File Operations
  async readFile(path: string): Promise<string> {
    try {
      // For now, we'll use a placeholder implementation
      // In a real implementation, this would call an API endpoint to read the file
      const response = await fetch(`${this.baseUrl}/files/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          path,
          directory: this.currentDirectory 
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.statusText}`);
      }
      
      const data = await response.text();
      return data;
    } catch (error) {
      console.error('Failed to read file:', error);
      // Return placeholder for development
      return `// Content of ${path}\n// This would be loaded from the server`;
    }
  }

  async listFiles(directory?: string): Promise<any[]> {
    try {
      const targetDir = directory || this.currentDirectory || '/';
      const response = await fetch(`${this.baseUrl}/files/list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ directory: targetDir })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      // Return mock data for development
      return [];
    }
  }

  // Command Management
  async listCommands(): Promise<Array<{ name: string; description?: string; agent?: string; model?: string }>> {
    try {
      const response = await this.client.command.list({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      // Return only lightweight info for autocomplete
      return (response.data || []).map((cmd: any) => ({
        name: cmd.name,
        description: cmd.description,
        agent: cmd.agent,
        model: cmd.model
        // Intentionally excluding template to keep memory usage low
      }));
    } catch (error) {
      return [];
    }
  }

  async listCommandsWithDetails(): Promise<Array<{ name: string; description?: string; agent?: string; model?: string; template?: string; subtask?: boolean }>> {
    try {
      const response = await this.client.command.list({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      // Return full command details including template
      return (response.data || []).map((cmd: any) => ({
        name: cmd.name,
        description: cmd.description,
        agent: cmd.agent,
        model: cmd.model,
        template: cmd.template,
        subtask: cmd.subtask
      }));
    } catch (error) {
      return [];
    }
  }

  async getCommandDetails(name: string): Promise<{ name: string; template: string; description?: string; agent?: string; model?: string } | null> {
    try {
      const response = await this.client.command.list({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      
      if (response.data) {
        const command = response.data.find((cmd: any) => cmd.name === name);
        if (command) {
          return {
            name: command.name,
            template: command.template,
            description: command.description,
            agent: command.agent,
            model: command.model
          };
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  // Health Check - using /health endpoint for detailed status
  async checkHealth(): Promise<boolean> {
    try {
      // Health endpoint is at root, not under /api
      const healthUrl = this.baseUrl === '/api' ? '/health' : `${this.baseUrl}/health`;
      const response = await fetch(healthUrl);
      if (!response.ok) {
        return false;
      }

      const healthData = await response.json();

      // Check if OpenCode is actually ready (not just OpenChamber server)
      if (healthData.isOpenCodeReady === false) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  // File System Operations
  async createDirectory(dirPath: string): Promise<{ success: boolean; path: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/fs/mkdir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: dirPath }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to create directory' }));
        throw new Error(error.error || 'Failed to create directory');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Failed to create directory:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const opencodeClient = new OpencodeService();

// Export types
export type { Session, Message, Part, Provider, Config, Model };
export type { App };
