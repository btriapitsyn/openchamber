import React from "react";
import { cn } from "@/lib/utils";
import { OverlayScrollbar } from "./OverlayScrollbar";

type ScrollableOverlayProps = React.HTMLAttributes<HTMLDivElement> & {
  minThumbSize?: number;
  hideDelayMs?: number;
  as?: keyof JSX.IntrinsicElements;
};

export const ScrollableOverlay = React.forwardRef<HTMLDivElement, ScrollableOverlayProps>(
  ({ className, children, style, minThumbSize, hideDelayMs, as: Component = "div", ...rest }, ref) => {
    const containerRef = React.useRef<HTMLDivElement | null>(null);

    React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement, []);

    return (
      <div className="relative">
        <Component
          ref={containerRef as React.Ref<HTMLDivElement>}
          className={cn("overlay-scrollbar-target overflow-auto", className)}
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
