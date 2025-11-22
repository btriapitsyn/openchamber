import React from "react";
import { cn } from "@/lib/utils";

type OverlayScrollbarProps = {
  containerRef: React.RefObject<HTMLElement | null>;
  minThumbSize?: number;
  hideDelayMs?: number;
  className?: string;
};

type ThumbMetrics = {
  length: number;
  offset: number;
};

export const OverlayScrollbar: React.FC<OverlayScrollbarProps> = ({
  containerRef,
  minThumbSize = 32,
  hideDelayMs = 1000,
  className,
}) => {
  const [visible, setVisible] = React.useState(false);
  const [vertical, setVertical] = React.useState<ThumbMetrics>({ length: 0, offset: 0 });
  const [horizontal, setHorizontal] = React.useState<ThumbMetrics>({ length: 0, offset: 0 });
  const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const isDraggingRef = React.useRef(false);
  const dragStartRef = React.useRef<{
    pointerX: number;
    pointerY: number;
    scrollTop: number;
    scrollLeft: number;
  }>({ pointerX: 0, pointerY: 0, scrollTop: 0, scrollLeft: 0 });
  const dragAxisRef = React.useRef<"vertical" | "horizontal" | null>(null);

  const updateMetrics = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollHeight, clientHeight, scrollTop, scrollWidth, clientWidth, scrollLeft } = container;

    // Vertical
    if (scrollHeight > clientHeight) {
      const trackLength = clientHeight;
      const rawThumb = (clientHeight / scrollHeight) * trackLength;
      const length = Math.max(minThumbSize, Math.min(trackLength, rawThumb));
      const maxOffset = Math.max(trackLength - length, 0);
      const maxScroll = Math.max(scrollHeight - clientHeight, 1);
      const offset = (scrollTop / maxScroll) * maxOffset;
      setVertical({ length, offset });
    } else {
      setVertical({ length: 0, offset: 0 });
    }

    // Horizontal
    if (scrollWidth > clientWidth) {
      const trackLength = clientWidth;
      const rawThumb = (clientWidth / scrollWidth) * trackLength;
      const length = Math.max(minThumbSize, Math.min(trackLength, rawThumb));
      const maxOffset = Math.max(trackLength - length, 0);
      const maxScroll = Math.max(scrollWidth - clientWidth, 1);
      const offset = (scrollLeft / maxScroll) * maxOffset;
      setHorizontal({ length, offset });
    } else {
      setHorizontal({ length: 0, offset: 0 });
    }
  }, [containerRef, minThumbSize]);

  const scheduleHide = React.useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => setVisible(false), hideDelayMs);
  }, [hideDelayMs]);

  const handleScroll = React.useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      updateMetrics();
      setVisible(true);
      scheduleHide();
    });
  }, [scheduleHide, updateMetrics]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateMetrics();
    setVisible(true);
    scheduleHide();

    container.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updateMetrics())
        : null;
    resizeObserver?.observe(container);

    const mutationObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => updateMetrics())
        : null;
    mutationObserver?.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [containerRef, handleScroll, scheduleHide, updateMetrics]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, axis: "vertical" | "horizontal") => {
    const container = containerRef.current;
    if (!container) return;

    isDraggingRef.current = true;
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollTop: container.scrollTop,
      scrollLeft: container.scrollLeft,
    };
    dragAxisRef.current = axis;
    setVisible(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const axis = dragAxisRef.current;
    if (axis === "vertical") {
      const { pointerY, scrollTop } = dragStartRef.current;
      const delta = event.clientY - pointerY;
      const trackLength = container.clientHeight;
      const thumbTravel = Math.max(trackLength - vertical.length, 1);
      const maxScroll = Math.max(container.scrollHeight - container.clientHeight, 1);
      const scrollDelta = (delta / thumbTravel) * maxScroll;
      container.scrollTop = scrollTop + scrollDelta;
    } else if (axis === "horizontal") {
      const { pointerX, scrollLeft } = dragStartRef.current;
      const delta = event.clientX - pointerX;
      const trackLength = container.clientWidth;
      const thumbTravel = Math.max(trackLength - horizontal.length, 1);
      const maxScroll = Math.max(container.scrollWidth - container.clientWidth, 1);
      const scrollDelta = (delta / thumbTravel) * maxScroll;
      container.scrollLeft = scrollLeft + scrollDelta;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    scheduleHide();
  };

  const showVertical = vertical.length > 0;
  const showHorizontal = horizontal.length > 0;
  if (!showVertical && !showHorizontal) return null;

  return (
    <div
      className={cn("overlay-scrollbar", className)}
      aria-hidden="true"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {showVertical && (
        <div
          className="overlay-scrollbar__thumb overlay-scrollbar__thumb--vertical"
          style={{
            height: `${vertical.length}px`,
            transform: `translateY(${vertical.offset}px)`,
          }}
          onPointerDown={(e) => handlePointerDown(e, "vertical")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      )}
      {showHorizontal && (
        <div
          className="overlay-scrollbar__thumb overlay-scrollbar__thumb--horizontal"
          style={{
            width: `${horizontal.length}px`,
            transform: `translateX(${horizontal.offset}px)`,
          }}
          onPointerDown={(e) => handlePointerDown(e, "horizontal")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      )}
    </div>
  );
};
