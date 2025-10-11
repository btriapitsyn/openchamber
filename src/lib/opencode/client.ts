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
  private eventSource: EventSource | null = null;
  private currentDirectory: string | undefined = undefined;
  private pollingInterval: NodeJS.Timeout | null = null;
  private fetchFallbackController: AbortController | null = null;
  private fetchFallbackReconnectTimeout: NodeJS.Timeout | null = null;

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

  // Get the current EventSource instance for debugging
  getEventSource(): EventSource | null {
    return this.eventSource;
  }

  // Check if error is QUIC/HTTP protocol related
  private isQuicError(error: any): boolean {
    return error?.message?.includes('QUIC') ||
           error?.message?.includes('ERR_QUIC_PROTOCOL_ERROR') ||
           error?.type?.includes('NetworkError');
  }

  // Fallback polling mechanism for when EventSource fails
  private startPollingFallback(onMessage: (event: any) => void, onError?: (error: any) => void) {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.stopStreamingFallback();

    console.log('Starting polling fallback for events...');

    const pollEvents = async () => {
      try {
        const eventUrl = this.buildEventUrl();

        const response = await fetch(eventUrl, {
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache'
          }
        });

        if (response.ok) {
          const text = await response.text();
          // Parse server-sent events format
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                onMessage(data);
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (error) {
        console.warn('Polling error:', error);
      }
    };

    // Poll every 2 seconds
    this.pollingInterval = setInterval(pollEvents, 2000);

    // Initial poll
    pollEvents();
  }

  // Stop polling fallback
  private stopPollingFallback() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('Stopped polling fallback');
    }
  }

  private stopStreamingFallback() {
    if (this.fetchFallbackController) {
      this.fetchFallbackController.abort();
      this.fetchFallbackController = null;
    }
    if (this.fetchFallbackReconnectTimeout) {
      clearTimeout(this.fetchFallbackReconnectTimeout);
      this.fetchFallbackReconnectTimeout = null;
    }
  }

  private buildEventUrl(): string {
    const absoluteBase = /^https?:\/\//.test(this.baseUrl);
    if (absoluteBase) {
      const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
      const url = `${base}/event`;
      if (!this.currentDirectory) {
        return url;
      }
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}directory=${encodeURIComponent(this.currentDirectory)}`;
    }

    const normalizedBase = this.baseUrl.startsWith('/') ? this.baseUrl : `/${this.baseUrl}`;
    const baseWithoutTrailing = normalizedBase.endsWith('/') ? normalizedBase.slice(0, -1) : normalizedBase;
    const basePath = `${baseWithoutTrailing}/event`;

    const isBrowserContext = typeof window !== 'undefined' && typeof window.location !== 'undefined';
    let eventUrl = basePath;

    if (isBrowserContext) {
      const isHttps = window.location.protocol === 'https:';
      if (isHttps) {
        eventUrl = `${window.location.origin}${basePath}`;
      }
    }

    if (!this.currentDirectory) {
      return eventUrl;
    }

    const separator = eventUrl.includes('?') ? '&' : '?';
    return `${eventUrl}${separator}directory=${encodeURIComponent(this.currentDirectory)}`;
  }

  private processSseBuffer(buffer: string, onMessage: (event: any) => void): string {
    let working = buffer.replace(/\r\n/g, '\n');
    let separatorIndex = working.indexOf('\n\n');

    while (separatorIndex !== -1) {
      const rawEvent = working.slice(0, separatorIndex);
      working = working.slice(separatorIndex + 2);

      const dataLines = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'));

      if (dataLines.length > 0) {
        const payload = dataLines
          .map((line) => line.slice(5).trimStart())
          .join('\n');

        if (payload) {
          try {
            const parsed = JSON.parse(payload);
            onMessage(parsed);
          } catch (error) {
            // Ignore malformed JSON payloads from stream
          }
        }
      }

      separatorIndex = working.indexOf('\n\n');
    }

    return working;
  }

  private startStreamingFallback(onMessage: (event: any) => void, onError?: (error: any) => void) {
    console.log('Starting fetch-based streaming fallback for events...');

    this.stopStreamingFallback();
    this.stopPollingFallback();

    const controller = new AbortController();
    this.fetchFallbackController = controller;
    let reconnectAttempts = 0;
    let buffer = '';

    const scheduleReconnect = (delay: number) => {
      if (controller.signal.aborted) {
        return;
      }
      if (this.fetchFallbackReconnectTimeout) {
        clearTimeout(this.fetchFallbackReconnectTimeout);
      }
      this.fetchFallbackReconnectTimeout = setTimeout(() => {
        connect();
      }, delay);
    };

    const connect = async () => {
      if (controller.signal.aborted) {
        return;
      }

      try {
        const eventUrl = this.buildEventUrl();
        const response = await fetch(eventUrl, {
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache'
          },
          cache: 'no-cache',
          credentials: 'same-origin',
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          throw new Error(`Streaming fallback request failed with status ${response.status}`);
        }

        reconnectAttempts = 0;
        buffer = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (!value) {
            continue;
          }

          buffer += decoder.decode(value, { stream: true });
          buffer = this.processSseBuffer(buffer, onMessage);
        }

        buffer += decoder.decode();
        buffer = this.processSseBuffer(buffer, onMessage);

        if (!controller.signal.aborted) {
          scheduleReconnect(1000);
        }
      } catch (error: any) {
        if (controller.signal.aborted) {
          return;
        }

        reconnectAttempts += 1;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
        console.warn('Streaming fallback error:', error?.message || error);
        if (onError) {
          onError(error);
        }

        if (reconnectAttempts >= 5) {
          console.log('Streaming fallback failed repeatedly, switching to polling fallback...');
          this.startPollingFallback(onMessage, onError);
          return;
        }

        scheduleReconnect(delay);
      }
    };

    connect();
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
    // Generate a unique message ID for this request to ensure idempotency
    const baseTimestamp = Date.now();
    const messageId = params.messageId ?? `msg_${baseTimestamp}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Build parts array
    const parts: any[] = [];
    
    // Add text part if there's content
    if (params.text && params.text.trim()) {
      parts.push({ 
        type: 'text', 
        text: params.text,
        id: `part-${baseTimestamp}`,
        sessionID: params.id,
        messageID: messageId
      });
    }
    
    // Add file parts if provided
    if (params.files && params.files.length > 0) {
      params.files.forEach((file, index) => {
        parts.push({
          type: 'file',
          id: `part-file-${baseTimestamp}-${index}`,
          sessionID: params.id,
          messageID: messageId,
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
    
    // Implement retry logic with exponential backoff
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use fetch directly for better control
        const url = `${this.baseUrl}/session/${params.id}/message${this.currentDirectory ? `?directory=${encodeURIComponent(this.currentDirectory)}` : ''}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messageID: messageId,
            role: 'user', // Explicitly set role for user messages
            model: {
              providerID: params.providerID,
              modelID: params.modelID
            },
            agent: params.agent,
            parts
          })
        });

        if (!response.ok) {
          // If we get a 504, it means the proxy timed out but the request is still processing
          if (response.status === 504) {
            console.warn('Gateway timeout (504) - request is still processing on server, waiting for EventSource updates');
            // Return successfully - the message was accepted by the server
            return messageId;
          }
          throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
        }

        // Try to read response but don't block on it
        // The response should come through EventSource anyway
        response.json().catch(() => {});
        return messageId;
        
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error?.status === 400 || error?.status === 401 || error?.status === 403) {
          throw error; // Client errors - no retry
        }
        
        // Don't retry on abort
        if (error?.name === 'AbortError') {
          throw error;
        }
        
        // For timeout or server errors, retry with backoff
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`Message send attempt ${attempt} failed, retrying in ${delay}ms:`, error?.message || error);
          
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`Message send failed after ${maxRetries} attempts:`, error?.message || error);
        }
      }
    }
    
    throw lastError || new Error('Failed to send message after retries');
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
      const result = await this.client.postSessionByIdPermissionsByPermissionId({
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
      const response = await (this.client as any).app.agents({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      return response.data || [];
    } catch (error) {
      return [];
    }
  }

  // Event Streaming
  subscribeToEvents(
    onMessage: (event: any) => void,
    onError?: (error: any) => void,
    onOpen?: () => void
  ): () => void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.stopStreamingFallback();
    this.stopPollingFallback();

    const eventUrl = this.buildEventUrl();
    console.log('EventSource connecting to:', eventUrl);

    // Try to create EventSource with fallback mechanism
    try {
      this.eventSource = new EventSource(eventUrl);
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      if (onError) onError(error);
      this.startStreamingFallback(onMessage, onError);
      return () => {};
    }

    // Add connection timeout to prevent hanging
    const connectionTimeout = setTimeout(() => {
      if (this.eventSource && this.eventSource.readyState === EventSource.CONNECTING) {
        console.log('EventSource connection timeout - closing connection');
        this.eventSource.close();
        this.eventSource = null;
        this.startStreamingFallback(onMessage, onError);
        if (onError) {
          onError(new Error('EventSource connection timeout'));
        }
      }
    }, 5000); // Reduced to 5 second timeout for faster feedback
    
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        // Failed to parse event
      }
    };
    
    this.eventSource.onerror = (error) => {
      clearTimeout(connectionTimeout);
      console.warn('EventSource connection error:', error);

      const target = (error as any)?.target as EventSource | undefined;
      const isClosed = target?.readyState === EventSource.CLOSED;

      if (this.isQuicError(error) || isClosed) {
        console.log('Switching to streaming fallback for events...');
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        this.startStreamingFallback(onMessage, onError);
        return;
      }

      if (onError) onError(error);
    };
    
    this.eventSource.onopen = () => {
      clearTimeout(connectionTimeout);
      if (onOpen) onOpen();
    };

    return () => {
      clearTimeout(connectionTimeout);
      this.stopStreamingFallback();
      this.stopPollingFallback();
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
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
      const response = await (this.client as any).command.list({
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
      const response = await (this.client as any).command.list({
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
      const response = await (this.client as any).command.list({
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

      // Check if OpenCode is actually ready (not just WebUI server)
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
