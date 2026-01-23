import React from 'react';
import { getSafeStorage } from '@/stores/utils/safeStorage';

const SHOW_HIDDEN_STORAGE_KEY = 'directoryTreeShowHidden';
const SHOW_HIDDEN_EVENT = 'directory-show-hidden-change';

const readStoredShowHidden = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const stored = getSafeStorage().getItem(SHOW_HIDDEN_STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
};

export const notifyDirectoryShowHiddenChanged = () => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(SHOW_HIDDEN_EVENT));
};

export const setDirectoryShowHidden = (value: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    getSafeStorage().setItem(SHOW_HIDDEN_STORAGE_KEY, value ? 'true' : 'false');
    notifyDirectoryShowHiddenChanged();
  } catch {
    // ignore storage errors
  }
};

export const useDirectoryShowHidden = (): boolean => {
  const [showHidden, setShowHidden] = React.useState(readStoredShowHidden);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleChange = () => {
      setShowHidden(readStoredShowHidden());
    };

    window.addEventListener('storage', handleChange);
    window.addEventListener(SHOW_HIDDEN_EVENT, handleChange);
    return () => {
      window.removeEventListener('storage', handleChange);
      window.removeEventListener(SHOW_HIDDEN_EVENT, handleChange);
    };
  }, []);

  return showHidden;
};

export const DIRECTORY_SHOW_HIDDEN_STORAGE_KEY = SHOW_HIDDEN_STORAGE_KEY;
