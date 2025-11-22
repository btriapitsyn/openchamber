import React from "react";
import { cn } from "@/lib/utils";
import { OverlayScrollbar } from "./OverlayScrollbar";

type ScrollableOverlayProps = React.HTMLAttributes<HTMLDivElement> & {
  minThumbSize?: number;
  hideDelayMs?: number;
  as?: React.ElementType;
  outerClassName?: string;
};

export const ScrollableOverlay = React.forwardRef<HTMLDivElement, ScrollableOverlayProps>(
  ({
    className,
    outerClassName,
    children,
    style,
    minThumbSize,
    hideDelayMs,
    as: Component = "div",
    ...rest
  }, ref) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null);

    React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, []);

    return (
      <div className={cn("relative flex flex-col min-h-0 w-full overflow-hidden", outerClassName)}>
        <Component
          ref={containerRef as React.Ref<HTMLDivElement>}
          className={cn("overlay-scrollbar-target overlay-scrollbar-container flex-1 min-h-0 overflow-auto w-full h-full", className)}
          style={style}
          {...rest}
        >
          {children}
        </Component>
        <OverlayScrollbar containerRef={containerRef} minThumbSize={minThumbSize} hideDelayMs={hideDelayMs} />
      </div>
    );
  }
);

ScrollableOverlay.displayName = "ScrollableOverlay";
