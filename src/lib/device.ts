/**
 * Device detection utilities and types
 * Provides consistent device detection across the application
 */
import React from 'react';

/**
 * Device type enumeration
 */
export type DeviceType = 'desktop' | 'mobile' | 'tablet';

/**
 * Device information interface
 */
export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  deviceType: DeviceType;
  screenWidth: number;
  breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

/**
 * CSS Custom Properties for device detection
 */
export const CSS_DEVICE_VARIABLES = {
  IS_MOBILE: 'var(--is-mobile)',
  DEVICE_TYPE: 'var(--device-type)',
} as const;

/**
 * Breakpoint configuration
 */
export const BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

const setRootDeviceAttributes = (isDesktopRuntime: boolean, isMobile: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = document.documentElement;
  if (isDesktopRuntime) {
    root.classList.add('desktop-runtime');
    root.style.setProperty('--is-mobile', '0');
    root.style.setProperty('--device-type', 'desktop');
    root.style.setProperty('--font-scale', '1');
  } else {
    root.classList.remove('desktop-runtime');
    root.style.setProperty('--is-mobile', isMobile ? '1' : '0');
    root.style.setProperty('--device-type', isMobile ? 'mobile' : 'desktop');
    root.style.setProperty('--font-scale', isMobile ? '0.9' : '1');
  }
};

/**
 * Get current device information
 */
export function getDeviceInfo(): DeviceInfo {
  const width = window.innerWidth;

  const isDesktopRuntime = typeof window !== 'undefined' && typeof window.opencodeDesktop !== 'undefined';

  let isMobile = width <= BREAKPOINTS.lg;
  let isTablet = width > BREAKPOINTS.md && width <= BREAKPOINTS.lg;
  let isDesktop = width > BREAKPOINTS.lg;
  let deviceType: DeviceType = 'desktop';

  if (isDesktopRuntime) {
    isMobile = false;
    isTablet = false;
    isDesktop = true;
    deviceType = 'desktop';
  } else if (isMobile) {
    deviceType = 'mobile';
  } else if (isTablet) {
    deviceType = 'tablet';
  }

  setRootDeviceAttributes(isDesktopRuntime, isMobile);

  let breakpoint: keyof typeof BREAKPOINTS = 'xs';
  for (const [key, value] of Object.entries(BREAKPOINTS)) {
    if (width >= value) {
      breakpoint = key as keyof typeof BREAKPOINTS;
    }
  }

  return {
    isMobile,
    isTablet,
    isDesktop,
    deviceType,
    screenWidth: width,
    breakpoint,
  };
}

/**
 * Check if CSS custom property indicates mobile device
 * Useful for CSS-in-JS scenarios
 */
export function isMobileDeviceViaCSS(): boolean {
  if (typeof window === 'undefined') return false;

  if (typeof window.opencodeDesktop !== 'undefined') {
    return false;
  }

  const root = document.documentElement;
  const isMobileValue = root.style.getPropertyValue('--is-mobile') ||
                        getComputedStyle(root).getPropertyValue('--is-mobile');

  return isMobileValue === '1' || isMobileValue === 'true';
}

/**
 * Hook to get device information (for React components)
 */
export function useDeviceInfo(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = React.useState<DeviceInfo>(() => {
    if (typeof window === 'undefined') {
      return {
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        deviceType: 'desktop',
        screenWidth: 1024,
        breakpoint: 'lg',
      };
    }
    return getDeviceInfo();
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setDeviceInfo(getDeviceInfo());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const isDesktopRuntime = typeof window.opencodeDesktop !== 'undefined';
    setRootDeviceAttributes(isDesktopRuntime, deviceInfo.isMobile);
  }, [deviceInfo.isMobile]);

  return deviceInfo;
}

/**
 * Media query utilities
 */
export const media = {
  mobile: '(max-width: 1024px)',
  tablet: '(min-width: 769px) and (max-width: 1024px)',
  desktop: '(min-width: 1025px)',
  mobileOnly: '(max-width: 768px)',
} as const;

/**
 * CSS media query helpers
 */
export const cssMedia = {
  mobile: `@media ${media.mobile}`,
  tablet: `@media ${media.tablet}`,
  desktop: `@media ${media.desktop}`,
  mobileOnly: `@media ${media.mobileOnly}`,
} as const;
