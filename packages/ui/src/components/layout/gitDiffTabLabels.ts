import type { GitDiffTab } from '@/stores/useGitDiffTabsStore';

const getFileNameFromPath = (path: string): string => {
  const normalized = path.replace(/\\/g, '/').trim();
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    return normalized;
  }
  return segments[segments.length - 1] || normalized;
};

export const getGitDiffTabLabel = (tabs: readonly GitDiffTab[], tab: GitDiffTab): string => {
  const filePath =
    tab.kind === 'working' ? tab.path : tab.target.file.path;
  const basename = getFileNameFromPath(filePath);

  // Check if multiple tabs share this basename
  const basenames = tabs.map((t) =>
    t.kind === 'working' ? t.path : t.target.file.path,
  );

  const otherTabsWithSameBasename = basenames.filter(
    (path) =>
      path !== filePath &&
      getFileNameFromPath(path) === basename,
  );

  if (otherTabsWithSameBasename.length > 0) {
    // Disambiguate: use parent/basename
    const parts = filePath.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
  }

  return basename;
};

export const getGitDiffTabTitle = (tab: GitDiffTab): string => {
  if (tab.kind === 'working') {
    return tab.path;
  }
  const commitHashShort = tab.target.commitHash.slice(0, 7);
  return `${tab.target.file.path} @ ${commitHashShort}`;
};
