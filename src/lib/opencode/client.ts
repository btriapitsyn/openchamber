import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk";
import type { 
  Session, 
  Message, 
  Part,
  Provider,
  Config,
  Model
} from "@opencode-ai/sdk";

// In development, use the Vite proxy to avoid CORS issues
const DEFAULT_BASE_URL = import.meta.env.DEV 
  ? "/api" 
  : (import.meta.env.VITE_OPENCODE_URL || "http://localhost:4096");

interface App {
  version?: string;
  [key: string]: any;
}

class OpencodeService {
  private client: OpencodeClient;
  private baseUrl: string;
  private eventSource: EventSource | null = null;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
    this.client = createOpencodeClient({ baseUrl });
  }

  // Session Management
  async listSessions(): Promise<Session[]> {
    try {
      const response = await this.client.session.list();
      return response.data || [];
    } catch (error) {
      console.error("Failed to list sessions:", error);
      throw error;
    }
  }

  async createSession(params?: { parentID?: string; title?: string }): Promise<Session> {
    try {
      const response = await this.client.session.create({
        body: params
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
        path: { id }
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
        path: { id }
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
        path: { id }
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
  }): Promise<Message> {
    try {
      const response = await this.client.session.prompt({
        path: { id: params.id },
        body: {
          model: {
            providerID: params.providerID,
            modelID: params.modelID
          },
          parts: [
            { type: 'text', text: params.text }
          ]
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
      const response = await this.client.config.providers();
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

  // Event Streaming
  subscribeToEvents(
    onMessage: (event: any) => void,
    onError?: (error: any) => void,
    onOpen?: () => void
  ): () => void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    // Use SSE directly for event streaming
    // In development, construct the full URL for EventSource since it doesn't work with relative paths
    const eventUrl = this.baseUrl.startsWith('/') 
      ? `${window.location.origin}${this.baseUrl}/event`
      : `${this.baseUrl}/event`;
    this.eventSource = new EventSource(eventUrl);
    
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
      if (onError) onError(error);
    };
    
    this.eventSource.onopen = () => {
      console.log("EventSource connected");
      if (onOpen) onOpen();
    };

    return () => {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
    };
  }

  // Health Check - using /config as health check since /health doesn't exist
  async checkHealth(): Promise<boolean> {
    try {
      console.log('Checking health at:', `${this.baseUrl}/config`);
      const response = await fetch(`${this.baseUrl}/config`);
      console.log('Health check response:', response.ok, response.status);
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