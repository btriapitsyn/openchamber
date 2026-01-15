declare module 'react-syntax-highlighter/create-element' {
  import type { ReactNode } from 'react';

  type CreateElementOptions = {
    node: unknown;
    stylesheet: unknown;
    useInlineStyles: boolean;
    key?: string | number;
  };

  const createElement: (options: CreateElementOptions) => ReactNode;

  export default createElement;
}
