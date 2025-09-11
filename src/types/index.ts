import type { Session, Message, Part, Provider } from "@opencode-ai/sdk";

export type { Session, Message, Part, Provider };

export interface ChatState {
  sessions: Session[];
  currentSessionId: string | null;
  messages: Map<string, { info: Message; parts: Part[] }[]>;
  isLoading: boolean;
  error: string | null;
  streamingMessageId: string | null;
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
  isMobile: boolean;
  isAbortable: boolean;
}

export interface StreamEvent {
  type: string;
  properties: any;
}

export interface ModelOption {
  providerId: string;
  modelId: string;
  displayName: string;
}