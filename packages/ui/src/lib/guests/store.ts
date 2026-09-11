import { create } from 'zustand';

import type { InstalledGuest } from './types.ts';

type GuestsStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

type GuestsState = {
  status: GuestsStatus;
  guests: InstalledGuest[];
  runtimeKey: string;
  markLoading: () => void;
  replaceCatalog: (guests: InstalledGuest[], runtimeKey: string) => void;
  markFailed: (runtimeKey: string) => void;
  markUnsupported: (runtimeKey: string) => void;
  resetForRuntimeSwitch: (runtimeKey: string) => void;
};

export const useGuestsStore = create<GuestsState>((set, get) => ({
  status: 'idle',
  guests: [],
  runtimeKey: '',
  markLoading: () => {
    if (get().status === 'ready') return;
    set({ status: 'loading' });
  },
  replaceCatalog: (guests, runtimeKey) => {
    if (get().runtimeKey !== runtimeKey) return;
    set({ status: 'ready', guests });
  },
  markFailed: (runtimeKey) => {
    if (get().runtimeKey !== runtimeKey) return;
    if (get().status === 'ready') return;
    set({ status: 'error', guests: [] });
  },
  markUnsupported: (runtimeKey) => {
    if (get().runtimeKey !== runtimeKey) return;
    set({ status: 'unsupported', guests: [] });
  },
  resetForRuntimeSwitch: (runtimeKey) => {
    set({ status: 'idle', guests: [], runtimeKey });
  },
}));
