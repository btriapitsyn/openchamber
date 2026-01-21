import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

export type MainTab = 'chat' | 'git' | 'diff' | 'terminal' | 'files';

export interface URLState {
  sessionId: string | null;
  tab: MainTab;
  directory: string | null;
}

interface URLActions {
  setURLState: (state: Partial<URLState>) => void;
  syncFromURL: () => void;
  syncToURL: () => void;
}

interface URLStore extends URLState, URLActions {}

const parseURLState = (): URLState => {
  if (typeof window === 'undefined') {
    return { sessionId: null, tab: 'chat', directory: null };
  }

  const params = new URLSearchParams(window.location.search);

  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const sessionId = pathSegments[0]?.startsWith('session/') ? pathSegments[0].replace('session/', '') : null;
  const isSettingsRoute = pathSegments[0] === 'settings';

  const tabParam = params.get('tab') || params.get('view');
  const validTabs: MainTab[] = ['chat', 'git', 'diff', 'terminal', 'files'];
  const tab = (tabParam && validTabs.includes(tabParam as MainTab) ? tabParam as MainTab : 'chat');

  const directory = params.get('directory') || null;

  if (isSettingsRoute) {
    return { sessionId: null, tab: 'chat', directory: null };
  }

  return { sessionId, tab, directory };
};

const updateURL = (state: URLState) => {
  if (typeof window === 'undefined') {
    return;
  }

  const params = new URLSearchParams(window.location.search);

  if (state.tab !== 'chat') {
    params.set('tab', state.tab);
  } else {
    params.delete('tab');
  }

  if (params.has('view')) {
    params.delete('view');
  }

  if (state.directory) {
    params.set('directory', state.directory);
  } else {
    params.delete('directory');
  }

  let pathname = '/';
  if (state.sessionId) {
    pathname = `/session/${state.sessionId}`;
  }

  const newURL = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
  if (newURL !== window.location.pathname + window.location.search) {
    window.location.pathname = pathname;
    window.location.search = params.toString();
  }
};

export const useURLStore = create<URLStore>((set, get) => ({
  sessionId: null,
  tab: 'chat',
  directory: null,

  setURLState: (partial) => {
    set(partial);
    const currentState = get();
    updateURL({ ...currentState, ...partial });
  },

  syncFromURL: () => {
    const urlState = parseURLState();
    set(urlState);
  },

  syncToURL: () => {
    const state = get();
    updateURL(state);
  },
}));

 export const useURLState = () => useURLStore(
  (state): URLState => ({
    sessionId: state.sessionId,
    tab: state.tab,
    directory: state.directory,
  }),
  useShallow,
);

export const useURLActions = () => useURLStore((state) => ({
  setURLState: state.setURLState,
  syncFromURL: state.syncFromURL,
  syncToURL: state.syncToURL,
}));
