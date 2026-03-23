declare module 'streamdown' {
  import type { FC, ReactNode, ComponentType } from 'react';

  export interface StreamdownProps {
    children: string;
    mode?: 'streaming' | 'static';
    isAnimating?: boolean;
    animated?: {
      animation?: string;
      duration?: number;
      easing?: string;
      sep?: 'word' | 'char';
    };
    className?: string;

    shikiTheme?: readonly [string | object, string | object];

    controls?: boolean | {
      code?: boolean;
      table?: boolean;
      mermaid?: boolean | {
        download?: boolean;
        copy?: boolean;
        fullscreen?: boolean;
        panZoom?: boolean;
      };
    };
    plugins?: Record<string, unknown>;
    mermaid?: Record<string, unknown>;
    components?: {
      [key: string]: ComponentType<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
    };
  }

  export const Streamdown: FC<StreamdownProps>;
}
