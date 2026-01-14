import React from "react";
import { RiCloseCircleLine } from "@remixicon/react";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/useSessionStore";
import { WorkingPlaceholder } from "./message/parts/WorkingPlaceholder";
import { isVSCodeRuntime } from "@/lib/desktop";

interface StatusRowProps {
  isWorking: boolean;
  statusText: string | null;
  isGenericStatus?: boolean;
  isWaitingForPermission?: boolean;
  wasAborted?: boolean;
  abortActive?: boolean;
  completionId?: string | null;
  isComplete?: boolean;
  showAbort?: boolean;
  onAbort?: () => void;
  showAbortStatus?: boolean;
}

export const StatusRow: React.FC<StatusRowProps> = ({
  isWorking,
  statusText,
  isGenericStatus,
  isWaitingForPermission,
  wasAborted,
  abortActive,
  completionId,
  isComplete,
  showAbort,
  onAbort,
  showAbortStatus,
}) => {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const shouldRenderPlaceholder = !showAbortStatus && (wasAborted || !abortActive);
  const [placeholderShowingResult, setPlaceholderShowingResult] = React.useState(false);
  
  const hasContent = isWorking || isComplete || wasAborted || placeholderShowingResult || showAbortStatus;

  if (!hasContent) {
    return null;
  }

  const abortButton = showAbort && onAbort ? (
    <button
      type="button"
      onClick={onAbort}
      className="flex items-center justify-center h-[1.2rem] w-[1.2rem] text-[var(--status-error)] transition-opacity hover:opacity-80 focus-visible:outline-none flex-shrink-0"
      aria-label="Stop generating"
    >
      <RiCloseCircleLine size={18} aria-hidden="true" />
    </button>
  ) : null;

  return (
    <div 
      className={cn(
        "mb-1 w-full",
        isVSCodeRuntime() ? "max-w-full" : "chat-column"
      )}
    >
      <div className="flex items-center justify-between pr-[2ch] py-0.5 gap-2 h-[1.2rem]">
        <div className="flex-1 flex items-center overflow-hidden min-w-0">
          {showAbortStatus ? (
            <div className="flex h-full items-center text-[var(--status-error)] pl-[2ch]">
              <span className="flex items-center gap-1.5 typography-ui-label">
                <RiCloseCircleLine size={16} aria-hidden="true" />
                Aborted
              </span>
            </div>
          ) : shouldRenderPlaceholder ? (
            <WorkingPlaceholder
              key={currentSessionId ?? "no-session"}
              statusText={statusText}
              isGenericStatus={isGenericStatus}
              isWaitingForPermission={isWaitingForPermission}
              wasAborted={wasAborted}
              completionId={completionId ?? null}
              isComplete={isComplete}
              onResultVisibilityChange={setPlaceholderShowingResult}
            />
          ) : null}
        </div>

        {abortButton && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {abortButton}
          </div>
        )}
      </div>
    </div>
  );
};
