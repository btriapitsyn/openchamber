import type { DesktopApi, DesktopSettingsApi } from "../lib/desktop";

 type AppearanceBridgePayload = {
   uiFont?: string;
   monoFont?: string;
   markdownDisplayMode?: string;
   typographySizes?: {
     markdown?: string;
     code?: string;
     uiHeader?: string;
     uiLabel?: string;
     meta?: string;
     micro?: string;
   } | null;
   showReasoningTraces?: boolean;
 };
 
 type AppearanceBridgeApi = {
   load: () => Promise<AppearanceBridgePayload | null>;
   save: (payload: AppearanceBridgePayload) => Promise<{ success: boolean; data?: AppearanceBridgePayload | null; error?: string }>;
 };
 
 declare global {
   interface Window {
     opencodeDesktop?: DesktopApi;
     opencodeDesktopSettings?: DesktopSettingsApi;
     opencodeAppearance?: AppearanceBridgeApi;
     __OPENCHAMBER_HOME__?: string;
   }
 }
 
 export {};
