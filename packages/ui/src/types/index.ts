import type { Session, Message, Part, Provider } from "@opencode-ai/sdk/v2";

export type { Session, Message, Part, Provider };
export type {
  QuotaProviderId,
  UsageWindow,
  UsageWindows,
  ProviderUsage,
  ProviderResult
} from './quota';

export interface ChatState {
  sessions: Session[];
  currentSessionId: string | null;
  messages: Map<string, { info: Message; parts: Part[] }[]>;
  isLoading: boolean;
  error: string | null;
  streamingMessageIds: Map<string, string | null>;
}

export interface ConfigState {
  providers: Provider[];
  currentProviderId: string;
  currentModelId: string;
  defaultProvider: { [key: string]: string };
  isConnected: boolean;
}

export interface UIState {
  theme: "light" | "dark" | "system";
  isSidebarOpen: boolean;
  isSessionSwitcherOpen: boolean;
  isMobile: boolean;
  isAbortable: boolean;
}

export interface StreamEvent {
  type: string;
  properties: Record<string, unknown>;
}

export interface ModelOption {
  providerId: string;
  modelId: string;
  displayName: string;
}

export interface ModelMetadata {
  id: string;
  providerId: string;
  name?: string;
  tool_call?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  attachment?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
  limit?: {
    context?: number;
    output?: number;
  };
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
}
