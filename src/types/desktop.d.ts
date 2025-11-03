import type { DesktopApi, DesktopSettingsApi } from "../lib/desktop";
import type { PromptEnhancerPreferences } from "../lib/promptEnhancerPersistence";

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
 };
 
 type AppearanceBridgeApi = {
   load: () => Promise<AppearanceBridgePayload | null>;
   save: (payload: AppearanceBridgePayload) => Promise<{ success: boolean; data?: AppearanceBridgePayload | null; error?: string }>;
 };
 
 type PromptEnhancerBridgeApi = {
   load: () => Promise<PromptEnhancerPreferences | null>;
   save: (payload: PromptEnhancerPreferences) => Promise<{ success: boolean; error?: string }>;
 };
 
 declare global {
   interface Window {
     opencodeDesktop?: DesktopApi;
     opencodeDesktopSettings?: DesktopSettingsApi;
     opencodeAppearance?: AppearanceBridgeApi;
     opencodePromptEnhancer?: PromptEnhancerBridgeApi;
     __OPENCHAMBER_HOME__?: string;
   }
 }
 
 export {};

