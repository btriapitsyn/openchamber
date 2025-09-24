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

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
    this.client = createOpencodeClient({ baseUrl });
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

  // Get system information including home directory
  async getSystemInfo(): Promise<{ homeDirectory: string; username?: string }> {
    try {
      // For now, let's use a simple approach - we know we're on macOS from the path
      // We can detect the username from existing sessions or use the current directory
      
      // Try to get from existing sessions first
      const sessions = await this.listSessions();
      if (sessions.length > 0 && sessions[0].directory) {
        const path = sessions[0].directory;
        // Extract home from path like /Users/username or /home/username
        const match = path.match(/^\/(Users|home)\/([^\/]+)/);
        if (match) {
          return { 
            homeDirectory: `/${match[1]}/${match[2]}`,
            username: match[2]
          };
        }
      }
      
      // For macOS, default to /Users/btriapitsyn for now
      // This should ideally come from the backend
      return { homeDirectory: '/Users/btriapitsyn', username: 'btriapitsyn' };
    } catch (error) {
      console.warn('Failed to get system info:', error);
      // Default fallback
      return { homeDirectory: '/Users/btriapitsyn' };
    }
  }

  // Session Management
  async listSessions(): Promise<Session[]> {
    try {
      const response = await this.client.session.list({
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined
      });
      return response.data || [];
    } catch (error) {
      console.error("Failed to list sessions:", error);
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
      console.error("Failed to create session:", error);
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
      console.error("Failed to get session:", error);
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
      console.error("Failed to delete session:", error);
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
      console.error("Failed to update session:", error);
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
      console.error("Failed to get session messages:", error);
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
  }): Promise<Message> {
    try {
      // Build parts array
      const parts: any[] = [];
      
      // Add text part if there's content
      if (params.text && params.text.trim()) {
        parts.push({ type: 'text', text: params.text });
      }
      
      // Add file parts if provided
      if (params.files && params.files.length > 0) {
        params.files.forEach(file => {
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
      
      const response = await this.client.session.prompt({
        path: { id: params.id },
        query: this.currentDirectory ? { directory: this.currentDirectory } : undefined,
        body: {
          model: {
            providerID: params.providerID,
            modelID: params.modelID
          },
          agent: params.agent,
          parts
        }
      });
      if (!response.data) throw new Error('Failed to send message');
      return response.data.info;
    } catch (error) {
      console.error("Failed to send message:", error);
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
      console.error("Failed to abort session:", error);
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
      console.error("Failed to respond to permission:", error);
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
      console.error("Failed to get config:", error);
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
      console.error("Failed to get app info:", error);
      throw error;
    }
  }

  async initApp(): Promise<boolean> {
    try {
      // Just check if we can connect since there's no init endpoint
      return await this.checkHealth();
    } catch (error) {
      console.error("Failed to init app:", error);
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
      console.error("Failed to list agents:", error);
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

    // Always use relative path for EventSource to ensure compatibility with nginx proxy
    // This is critical for domain deployments where nginx proxies to localhost
    let eventUrl = '/api/event';
    
    // Add directory parameter if set
    if (this.currentDirectory) {
      eventUrl += `?directory=${encodeURIComponent(this.currentDirectory)}`;
    }
    
    console.log('EventSource connecting...');
    this.eventSource = new EventSource(eventUrl);
    
    // Add connection timeout to prevent hanging
    const connectionTimeout = setTimeout(() => {
      if (this.eventSource && this.eventSource.readyState === EventSource.CONNECTING) {
        console.warn('EventSource connection timeout, closing...');
        this.eventSource.close();
        if (onError) {
          onError(new Error('EventSource connection timeout'));
        }
      }
    }, 10000); // 10 second timeout
    
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error("Failed to parse event:", error);
      }
    };
    
    this.eventSource.onerror = (error) => {
      console.error("EventSource error:", error);
      clearTimeout(connectionTimeout);
      if (onError) onError(error);
    };
    
    this.eventSource.onopen = () => {
      console.log("EventSource connected");
      clearTimeout(connectionTimeout);
      if (onOpen) onOpen();
    };

    return () => {
      clearTimeout(connectionTimeout);
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
      console.error('Failed to list files:', error);
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
      console.error("Failed to list commands:", error);
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
      console.error(`Failed to get command details for ${name}:`, error);
      return null;
    }
  }

  // Health Check - using /config as health check since /health doesn't exist
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/config`);
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const opencodeClient = new OpencodeService();

// Export types
export type { Session, Message, Part, Provider, Config, Model };
export type { App };