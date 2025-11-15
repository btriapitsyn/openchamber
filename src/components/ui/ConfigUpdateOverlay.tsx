import React from "react";
import {
  getConfigUpdateSnapshot,
  subscribeConfigUpdate,
} from "@/lib/configUpdate";
import { RiRestartLine } from '@remixicon/react';

export const ConfigUpdateOverlay: React.FC = () => {
  const [{ isUpdating, message }, setState] = React.useState(() => getConfigUpdateSnapshot());

  React.useEffect(() => {
    return subscribeConfigUpdate(setState);
  }, []);

  if (!isUpdating) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-xl border border-border/40 bg-card/90 px-6 py-8 text-center shadow-none">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary/30 border-t-transparent text-primary">
            <RiRestartLine className="h-7 w-7 animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="typography-h3 font-semibold text-foreground">
              Updating OpenCode
            </h2>
            <p className="typography-body text-muted-foreground">
              {message}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
