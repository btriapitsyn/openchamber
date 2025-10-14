import type { DesktopApi, DesktopSettingsApi } from "@/lib/desktop";

declare global {
  interface Window {
    opencodeDesktop?: DesktopApi;
    opencodeDesktopSettings?: DesktopSettingsApi;
    __OPENCHAMBER_HOME__?: string;
  }
}

export {};
