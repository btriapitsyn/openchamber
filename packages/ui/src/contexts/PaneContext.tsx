import React from 'react';
import { PaneContext, type PaneContextValue } from './paneContextValue';

export const PaneProvider: React.FC<{ value: PaneContextValue; children: React.ReactNode }> = ({
  value,
  children,
}) => {
  return <PaneContext.Provider value={value}>{children}</PaneContext.Provider>;
};
