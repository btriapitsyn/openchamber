import React from "react";
import { cn } from "@/lib/utils";
import { OverlayScrollbar } from "./OverlayScrollbar";

type ScrollableOverlayProps = React.HTMLAttributes<HTMLElement> & {
  minThumbSize?: number;
  hideDelayMs?: number;
  as?: React.ElementType;
  outerClassName?: string;
  scrollbarClassName?: string;
  disableHorizontal?: boolean;
  fillContainer?: boolean;
};

export const ScrollableOverlay = React.forwardRef<HTMLElement, ScrollableOverlayProps>(
  ({
    className,
    outerClassName,
    children,
    style,
    minThumbSize,
    hideDelayMs,
    as: Component = "div",
    scrollbarClassName,
    disableHorizontal = false,
    fillContainer = true,
    ...rest
  }, ref) => {
    const containerRef = React.useRef<HTMLElement | null>(null);

    React.useImperativeHandle(ref, () => containerRef.current as HTMLElement, []);

    return (
      <div className={cn("relative flex flex-col min-h-0 w-full overflow-hidden", outerClassName)}>
        <Component
          ref={containerRef as React.Ref<HTMLElement>}
          className={cn(
            "overlay-scrollbar-target overlay-scrollbar-container",
            fillContainer ? "flex-1 min-h-0 w-full h-full" : "flex-none w-full h-auto",
            disableHorizontal ? "overflow-y-auto overflow-x-hidden" : "overflow-auto",
            className
          )}
          style={style}
          {...rest}
        >
          {children}
        </Component>
        <OverlayScrollbar
          containerRef={containerRef}
          minThumbSize={minThumbSize}
          hideDelayMs={hideDelayMs}
          className={scrollbarClassName}
          disableHorizontal={disableHorizontal}
        />
      </div>
    );
  }
);

ScrollableOverlay.displayName = "ScrollableOverlay";
