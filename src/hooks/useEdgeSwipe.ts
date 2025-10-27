import { useEffect, useRef } from 'react';
import { useUIStore } from '@/stores/useUIStore';

interface EdgeSwipeOptions {
  edgeThreshold?: number; // Distance from edge to trigger swipe detection (px)
  minSwipeDistance?: number; // Minimum swipe distance to trigger (px)
  maxSwipeTime?: number; // Maximum time for swipe (ms)
  enabled?: boolean;
  enableRightSidebar?: boolean; // Allow swiping from right edge to open utilities panel
}

export const useEdgeSwipe = (options: EdgeSwipeOptions = {}) => {
  const {
    edgeThreshold = 30,
    minSwipeDistance = 50,
    maxSwipeTime = 300,
    enabled = true,
    enableRightSidebar = true,
  } = options;

  const { isMobile, setSidebarOpen, isSidebarOpen, setRightSidebarOpen, isRightSidebarOpen } = useUIStore();
  const touchStartRef = useRef<{ x: number; y: number; time: number; edge: 'left' | 'right' } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (!enabled || !isMobile) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) {
        touchStartRef.current = null;
        return;
      }

      const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
      const fromLeft = touch.clientX <= edgeThreshold;
      const fromRight = enableRightSidebar && viewportWidth > 0 && viewportWidth - touch.clientX <= edgeThreshold;

      if (fromLeft) {
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
          edge: 'left',
        };
      } else if (fromRight) {
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
          edge: 'right',
        };
      } else {
        touchStartRef.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) {
        return;
      }

      const touch = e.touches[0];
      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - touchStartRef.current.x;
      const { edge } = touchStartRef.current;

      if (edge === 'left' && deltaX > 10) {
        e.preventDefault();
      } else if (edge === 'right' && deltaX < -10) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      if (!touch) {
        touchStartRef.current = null;
        touchEndRef.current = null;
        return;
      }

      touchEndRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };

      const { x: startX, y: startY, time: startTime, edge } = touchStartRef.current;
      const { x: endX, y: endY, time: endTime } = touchEndRef.current;

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const deltaTime = endTime - startTime;

      const isHorizontal = Math.abs(deltaY) < Math.abs(deltaX);
      const isQuick = deltaTime <= maxSwipeTime;
      const limitedVertical = Math.abs(deltaY) < minSwipeDistance;

      if (edge === 'left') {
        const isValidLeftSwipe =
          deltaX >= minSwipeDistance && isHorizontal && isQuick && limitedVertical;

        if (isValidLeftSwipe && !isSidebarOpen) {
          setSidebarOpen(true);
        }
      } else if (edge === 'right') {
        const isValidRightSwipe =
          deltaX <= -minSwipeDistance && isHorizontal && isQuick && limitedVertical;

        if (isValidRightSwipe && enableRightSidebar && !isRightSidebarOpen) {
          setRightSidebarOpen(true);
        }
      }

      touchStartRef.current = null;
      touchEndRef.current = null;
    };

    const handleTouchCancel = () => {
      touchStartRef.current = null;
      touchEndRef.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true, capture: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.removeEventListener('touchend', handleTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', handleTouchCancel, { capture: true });
    };
  }, [
    enabled,
    isMobile,
    edgeThreshold,
    minSwipeDistance,
    maxSwipeTime,
    enableRightSidebar,
    setSidebarOpen,
    isSidebarOpen,
    setRightSidebarOpen,
    isRightSidebarOpen,
  ]);

  return null;
};