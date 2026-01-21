import { createContext, useContext, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

export const RouterContext = createContext<{ isRouterActive: boolean }>({
  isRouterActive: false,
});

export const useRouterContext = () => useContext(RouterContext);

export function DesktopRouter({ children }: { children: ReactNode }) {
  return (
    <RouterContext.Provider value={{ isRouterActive: false }}>
      {children}
    </RouterContext.Provider>
  );
}

export function WebRouter({ children }: { children: ReactNode }) {
  return (
    <RouterContext.Provider value={{ isRouterActive: true }}>
      {children}
    </RouterContext.Provider>
  );
}
