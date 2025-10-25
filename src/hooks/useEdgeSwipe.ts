import { useEffect, useRef } from 'react';
import { useUIStore } from '@/stores/useUIStore';

interface EdgeSwipeOptions {
  edgeThreshold?: number; // Distance from edge to trigger swipe detection (px)
  minSwipeDistance?: number; // Minimum swipe distance to trigger (px)
  maxSwipeTime?: number; // Maximum time for swipe (ms)
  enabled?: boolean;
}

export const useEdgeSwipe = (options: EdgeSwipeOptions = {}) => {
  const {
    edgeThreshold = 30,
    minSwipeDistance = 50,
    maxSwipeTime = 300,
    enabled = true
  } = options;

  const { isMobile, setSidebarOpen, isSidebarOpen } = useUIStore();
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (!enabled || !isMobile) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Only track touches that start at the left edge
      const touch = e.touches[0];
      if (touch.clientX <= edgeThreshold) {
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now()
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent default only when we're tracking an edge swipe
      if (touchStartRef.current) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartRef.current.x;
        
        // If user is swiping right from edge, prevent default to avoid browser back gesture
        if (deltaX > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      touchEndRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };

      const { x: startX, y: startY, time: startTime } = touchStartRef.current;
      const { x: endX, y: endY, time: endTime } = touchEndRef.current;

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const deltaTime = endTime - startTime;

      // Check if this is a valid right swipe from edge
      const isValidSwipe = 
        deltaX >= minSwipeDistance && // Right swipe distance
        Math.abs(deltaY) < Math.abs(deltaX) && // More horizontal than vertical
        deltaTime <= maxSwipeTime && // Quick enough
        Math.abs(deltaY) < minSwipeDistance; // Not too much vertical movement

      if (isValidSwipe && !isSidebarOpen) {
        setSidebarOpen(true);
      }

      // Reset refs
      touchStartRef.current = null;
      touchEndRef.current = null;
    };

    const handleTouchCancel = () => {
      touchStartRef.current = null;
      touchEndRef.current = null;
    };

    // Add passive listeners for performance, but use capture for edge detection
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
  }, [enabled, isMobile, edgeThreshold, minSwipeDistance, maxSwipeTime, setSidebarOpen, isSidebarOpen]);

  return null;
};