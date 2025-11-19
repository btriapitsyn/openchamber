import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk";
import type { FilesAPI, RuntimeAPIs } from "../api/types";
import { getDesktopHomeDirectory } from "../desktop";
import type {
  Session,
  Message,
  Part,
  Provider,
  Config,
  Model,
  Agent,
  TextPartInput,
  FilePartInput,
  Event
} from "@opencode-ai/sdk";
type StreamEvent<TData> = {
  data: TData;
  event?: string;
  id?: string;
  retry?: number;
};

type DesktopEventsBridge = {
  setDirectory?: (directory: string | undefined | null) => void;
};

// Use relative path by default (works with both dev and nginx proxy server)
// Can be overridden with VITE_OPENCODE_URL for absolute URLs in special deployments
const DEFAULT_BASE_URL = import.meta.env.VITE_OPENCODE_URL || "/api";

const resolveDesktopBaseUrl = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const desktopServer = (window as typeof window & {
    __OPENCHAMBER_DESKTOP_SERVER__?: { origin: string; apiPrefix?: string };
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
  }).__OPENCHAMBER_DESKTOP_SERVER__;

  const isDesktop = Boolean(
    (window as typeof window & { __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs }).__OPENCHAMBER_RUNTIME_APIS__?.runtime?.isDesktop
  );

  if (!desktopServer || !isDesktop) {
    return null;
  }

  const origin = typeof desktopServer.origin === "string" && desktopServer.origin.length > 0 ? desktopServer.origin : null;
  if (!origin) {
    return null;
  }

  return `${origin}/api`;
};

interface App {
  version?: string;
  [key: string]: unknown;
}

export type FilesystemEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink?: boolean;
};

export type ProjectFileSearchHit = {
  name: string;
  path: string;
  relativePath: string;
  extension?: string;
};

export type DirectorySwitchResult = {
  success: boolean;
  restarted: boolean;
  path: string;
  agents?: Agent[];
  providers?: Provider[];
  models?: unknown[];
};

const normalizeFsPath = (path: string): string => path.replace(/\\/g, "/");

const getDesktopFilesApi = (): FilesAPI | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const apis = (window as typeof window & { __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs }).__OPENCHAMBER_RUNTIME_APIS__;
  if (apis && apis.runtime?.isDesktop && apis.files) {
    return apis.files;
  }
  return null;
};

class OpencodeService {
  private client: OpencodeClient;
  private baseUrl: string;
  private sseAbortController: AbortController | null = null;
  private currentDirectory: string | undefined = undefined;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    const desktopBase = resolveDesktopBaseUrl();
    this.baseUrl = desktopBase || baseUrl;
    this.client = createOpencodeClient({ baseUrl: this.baseUrl });
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

    if (typeof window !== 'undefined') {
      const desktopBridge = (window as typeof window & {
        opencodeDesktopEvents?: DesktopEventsBridge;
      }).opencodeDesktopEvents;

      try {
        desktopBridge?.setDirectory?.(directory ?? null);
      } catch (error) {
        console.warn('Failed to update desktop event bridge directory:', error);
      }
    }
  }

  getDirectory(): string | undefined {
    return this.currentDirectory;
  }

  async withDirectory<T>(directory: string | undefined | null, fn: () => Promise<T>): Promise<T> {
    if (directory === undefined || directory === null) {
      return fn();
    }

    const previousDirectory = this.currentDirectory;
    this.currentDirectory = directory;
    try {
      return await fn();
    } finally {
      this.currentDirectory = previousDirectory;
    }
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
    const response = await this.client.session.list({
      query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
    });
    return Array.isArray(response.data) ? response.data : [];
  }

  async createSession(params?: { parentID?: string; title?: string }): Promise<Session> {
    const response = await this.client.session.create({
      query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
      body: {
        parentID: params?.parentID,
        title: params?.title
      }
    });
    if (!response.data) throw new Error('Failed to create session');
    return response.data;
  }

  async getSession(id: string): Promise<Session> {
    const response = await this.client.session.get({
      path: { id },
      query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
    });
    if (!response.data) throw new Error('Session not found');
    return response.data;
  }

  async deleteSession(id: string): Promise<boolean> {
    const response = await this.client.session.delete({
      path: { id },
      query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
    });
    return response.data || false;
  }

  async updateSession(id: string, title?: string): Promise<Session> {
    const response = await this.client.session.update({
      path: { id },
      query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
      body: { title }
    });
    if (!response.data) throw new Error('Failed to update session');
    return response.data;
  }

  async getSessionMessages(id: string): Promise<{ info: Message; parts: Part[] }[]> {
    const response = await this.client.session.messages({
      path: { id },
      query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
    });
    return response.data || [];
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
    const parts: Array<TextPartInput | FilePartInput> = [];

    // Add text part if there's content
    if (params.text && params.text.trim()) {
      const textPart: TextPartInput = {
        type: 'text',
        text: params.text
      };
      parts.push(textPart);
    }

    // Add file parts if provided
    if (params.files && params.files.length > 0) {
      params.files.forEach((file) => {
        const filePart: FilePartInput = {
          type: 'file',
          mime: file.mime,
          filename: file.filename,
          url: file.url
        };
        parts.push(filePart);
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
    } catch (error: unknown) {
      console.error('Failed to send message via SDK:', error);
      throw error;
    }
  }

  async abortSession(id: string): Promise<boolean> {
    const response = await this.client.session.abort({
      path: { id },
      query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
    });
    return response.data || false;
  }

  // Permissions
  async respondToPermission(
    sessionId: string,
    permissionId: string,
    response: 'once' | 'always' | 'reject'
  ): Promise<boolean> {
    const result = await this.client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
      body: { response }
    });
    return result.data || false;
  }

  // Configuration
  async getConfig(): Promise<Config> {
    const response = await this.client.config.get();
    if (!response.data) throw new Error('Failed to get config');
    return response.data;
  }

  async updateConfig(config: Record<string, unknown>): Promise<Config> {
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
    const currentConfig = await this.getConfig();
    const updatedConfig = modifier(currentConfig);
    const result = await this.updateConfig(updatedConfig);
    return result;
  }

  async getProviders(): Promise<{
    providers: Provider[];
    default: { [key: string]: string };
  }> {
    const response = await this.client.config.providers({
      query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
    });
    if (!response.data) throw new Error('Failed to get providers');
    return response.data;
  }

  // App Management - using config endpoint since /app doesn't exist in this version
  async getApp(): Promise<App> {
    // Return basic app info from config
    const config = await this.getConfig();
    return {
      version: "0.0.3", // from the OpenAPI spec
      config
    };
  }

  async initApp(): Promise<boolean> {
    try {
      // Just check if we can connect since there's no init endpoint
      return await this.checkHealth();
    } catch {
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
    } catch {
      return [];
    }
  }

  // Event Streaming using SDK SSE (Server-Sent Events) with AsyncGenerator
  subscribeToEvents(
    onMessage: (event: { type: string; properties?: Record<string, unknown> }) => void,
    onError?: (error: unknown) => void,
    onOpen?: () => void,
    directoryOverride?: string | null
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
        const resolvedDirectory =
          typeof directoryOverride === 'string' && directoryOverride.trim().length > 0
            ? directoryOverride.trim()
            : this.currentDirectory;
        const result = await this.client.event.subscribe({
          query: resolvedDirectory ? { directory: resolvedDirectory } : undefined,
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
          onSseEvent: (event: StreamEvent<unknown>) => {
            // This callback fires for each event received
            if (!abortController.signal.aborted) {
              const payload = event.data;
              if (payload && typeof payload === 'object') {
                onMessage(payload as Event);
              }
            }
          }
        });

        // Notify connection opened
        if (onOpen && !abortController.signal.aborted) {
          onOpen();
        }

        // Consume the async generator stream
        for await (const _ of result.stream) {
          void _;
          if (abortController.signal.aborted) {
            break;
          }
          // Event already processed via onSseEvent callback
          // This loop keeps the generator alive
        }
      } catch (error: unknown) {
        // Ignore AbortError - this is expected when unsubscribing
        if ((error as Error)?.name === 'AbortError' || abortController.signal.aborted) {
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
    } catch {
      // Return placeholder for development
      return `// Content of ${path}\n// This would be loaded from the server`;
    }
  }

  async listFiles(directory?: string): Promise<Record<string, unknown>[]> {
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
    } catch {
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
      return (response.data || []).map((cmd: Record<string, unknown>) => ({
        name: cmd.name as string,
        description: cmd.description as string | undefined,
        agent: cmd.agent as string | undefined,
        model: cmd.model as string | undefined
        // Intentionally excluding template to keep memory usage low
      }));
    } catch {
      return [];
    }
  }

  async listCommandsWithDetails(): Promise<Array<{ name: string; description?: string; agent?: string; model?: string; template?: string; subtask?: boolean }>> {
    try {
      const response = await this.client.command.list({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      // Return full command details including template
      return (response.data || []).map((cmd: Record<string, unknown>) => ({
        name: cmd.name as string,
        description: cmd.description as string | undefined,
        agent: cmd.agent as string | undefined,
        model: cmd.model as string | undefined,
        template: cmd.template as string | undefined,
        subtask: cmd.subtask as boolean | undefined
      }));
    } catch {
      return [];
    }
  }

  async getCommandDetails(name: string): Promise<{ name: string; template: string; description?: string; agent?: string; model?: string } | null> {
    try {
      const response = await this.client.command.list({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });

      if (response.data) {
        const command = response.data.find((cmd: Record<string, unknown>) => cmd.name === name);
        if (command) {
          return {
            name: command.name as string,
            template: command.template as string,
            description: command.description as string | undefined,
            agent: command.agent as string | undefined,
            model: command.model as string | undefined
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // Health Check - using /health endpoint for detailed status
  async checkHealth(): Promise<boolean> {
    try {
      // Health endpoint is at root, not under /api
      let healthUrl: string;
      if (this.baseUrl === '/api') {
        healthUrl = '/health';
      } else if (this.baseUrl.endsWith('/api')) {
        // Desktop: http://127.0.0.1:PORT/api -> http://127.0.0.1:PORT/health
        healthUrl = this.baseUrl.slice(0, -4) + '/health';
      } else {
        healthUrl = `${this.baseUrl}/health`;
      }
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
    } catch {
      return false;
    }
  }

  // File System Operations
  async createDirectory(dirPath: string): Promise<{ success: boolean; path: string }> {
    const desktopFiles = getDesktopFilesApi();
    if (desktopFiles?.createDirectory) {
      try {
        return await desktopFiles.createDirectory(dirPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(message || 'Failed to create directory');
      }
    }

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
  }

  async listLocalDirectory(directoryPath: string | null | undefined): Promise<FilesystemEntry[]> {
    const desktopFiles = getDesktopFilesApi();
    if (desktopFiles) {
      try {
        const result = await desktopFiles.listDirectory(directoryPath || '');
        if (!result || !Array.isArray(result.entries)) {
          return [];
        }
        return result.entries.map<FilesystemEntry>((entry) => ({
          name: entry.name,
          path: normalizeFsPath(entry.path),
          isDirectory: !!entry.isDirectory,
          isFile: !entry.isDirectory,
          isSymbolicLink: false,
        }));
      } catch (error) {
        console.error('Failed to list directory contents:', error);
        throw error;
      }
    }

    try {
      const params = new URLSearchParams();
      if (directoryPath && directoryPath.trim().length > 0) {
        params.set('path', directoryPath);
      }
      const query = params.toString();
      const response = await fetch(`${this.baseUrl}/fs/list${query ? `?${query}` : ''}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const message = typeof error.error === 'string' ? error.error : 'Failed to list directory';
        throw new Error(message);
      }

      const result = await response.json();
      if (!result || !Array.isArray(result.entries)) {
        return [];
      }

      return result.entries as FilesystemEntry[];
    } catch (error) {
      console.error('Failed to list directory contents:', error);
      throw error;
    }
  }

  async searchFiles(query: string, options?: { directory?: string | null; limit?: number }): Promise<ProjectFileSearchHit[]> {
    const desktopFiles = getDesktopFilesApi();
    const directory = typeof options?.directory === 'string' && options.directory.trim().length > 0
      ? options.directory.trim()
      : this.currentDirectory;
    const normalizedDirectory = directory ? normalizeFsPath(directory) : null;

    if (desktopFiles) {
      try {
        const results = await desktopFiles.search({
          directory: directory || '',
          query,
          maxResults: options?.limit,
        });

        if (!Array.isArray(results)) {
          return [];
        }

        return results.map<ProjectFileSearchHit>((file) => {
          const normalizedPath = normalizeFsPath(file.path);
          const name = normalizedPath.split('/').filter(Boolean).pop() || normalizedPath;
          const relativePath = (() => {
            if (file.preview && file.preview.length > 0 && typeof file.preview[0] === 'string') {
              return normalizeFsPath(file.preview[0]);
            }
            if (normalizedDirectory && normalizedPath.startsWith(normalizedDirectory)) {
              const suffix = normalizedPath.slice(normalizedDirectory.length).replace(/^\/+/, '');
              return suffix || name;
            }
            return name;
          })();

          return {
            name,
            path: normalizedPath,
            relativePath,
            extension: name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined,
          };
        });
      } catch (error) {
        console.error('Failed to search files:', error);
        throw error;
      }
    }

    const params = new URLSearchParams();
    if (directory && directory.length > 0) {
      params.set('directory', directory);
    }
    if (typeof query === 'string') {
      params.set('q', query);
    }
    if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
      params.set('limit', String(options.limit));
    }

    const searchUrl = `${this.baseUrl}/fs/search${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message = typeof error.error === 'string' ? error.error : 'Failed to search files';
      throw new Error(message);
    }

    const result = await response.json();
    if (!result || !Array.isArray(result.files)) {
      return [];
    }
    return result.files as ProjectFileSearchHit[];
  }

  async getFilesystemHome(): Promise<string | null> {
    // Optimization: Check for desktop runtime first to avoid unnecessary network calls
    // and fix the "SyntaxError" warning when the endpoint is missing
    const desktopHome = await getDesktopHomeDirectory();
    if (desktopHome) {
      return desktopHome;
    }

    try {
      const response = await fetch(`${this.baseUrl}/fs/home`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const message =
          typeof error.error === 'string' && error.error.length > 0
            ? error.error
            : 'Failed to resolve home directory';
        throw new Error(message);
      }

      const payload = await response.json();
      if (payload && typeof payload.home === 'string' && payload.home.length > 0) {
        return payload.home;
      }
      return null;
    } catch (error) {
      console.warn('Failed to resolve filesystem home directory:', error);
      return null;
    }
  }

  async setOpenCodeWorkingDirectory(directoryPath: string | null | undefined): Promise<DirectorySwitchResult | null> {
    if (!directoryPath || typeof directoryPath !== 'string' || !directoryPath.trim()) {
      console.warn('[OpencodeClient] setOpenCodeWorkingDirectory: invalid path', directoryPath);
      return null;
    }

    const url = `${this.baseUrl}/opencode/directory`;
    console.log('[OpencodeClient] POST', url, 'with path:', directoryPath);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: directoryPath })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const error = payload ?? {};
        const message =
          typeof error.error === 'string' && error.error.length > 0
            ? error.error
            : 'Failed to update OpenCode working directory';
        throw new Error(message);
      }

      if (payload && typeof payload === 'object') {
        return payload as DirectorySwitchResult;
      }

      return {
        success: true,
        restarted: false,
        path: directoryPath
      };
    } catch (error) {
      console.warn('Failed to update OpenCode working directory:', error);
      throw error;
    }
  }
}

// Exported singleton instance
export const opencodeClient = new OpencodeService();

// Exported types
export type { Session, Message, Part, Provider, Config, Model };
export type { App };
