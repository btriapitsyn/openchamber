/**
 * Tests for DirectoryTree filesystem root browsing.
 *
 * Extracts the pure logic from DirectoryTree.tsx and verifies that
 * setting rootDirectory="/" allows navigating the entire filesystem.
 *
 * Run: bun test packages/ui/src/components/session/__tests__/directory-tree-root.test.ts
 */
import { describe, it, expect } from 'bun:test';

// ── Extracted pure logic from DirectoryTree.tsx ──────────────────────

function stripTrailingSlashes(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  if (value === '/' || value.length === 0) return '/';
  let trimmed = value;
  while (trimmed.length > 1 && trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length === 0 ? '/' : trimmed;
}

function computeEffectiveRoot(
  rootDirectory: string | null,
  normalizedHomeDirectory: string | null
): string | null {
  if (typeof rootDirectory === 'string' && rootDirectory.length > 0) {
    const normalized = rootDirectory.replace(/\\/g, '/');
    const stripped = stripTrailingSlashes(normalized);
    if (stripped) {
      return stripped as string;
    }
  }
  if (normalizedHomeDirectory) {
    return normalizedHomeDirectory;
  }
  return null;
}

function isPathWithinHome(
  targetPath: string | null | undefined,
  effectiveRoot: string | null,
  rootReady: boolean
): boolean {
  if (!targetPath) return false;
  if (!rootReady || !effectiveRoot) return false;
  // When root is '/', all absolute paths are valid
  if (effectiveRoot === '/') return true;
  const normalizedTargetRaw = targetPath.replace(/\\/g, '/');
  const normalizedTarget =
    (stripTrailingSlashes(normalizedTargetRaw) as string) ?? normalizedTargetRaw;
  if (normalizedTarget === effectiveRoot) return true;
  const prefix = `${effectiveRoot}/`;
  return normalizedTarget.startsWith(prefix);
}

/** Simulates the withinHome guard in loadDirectory */
function isLoadAllowed(
  targetPath: string,
  normalizedHome: string
): boolean {
  if (normalizedHome === '/') return true;
  const normalizedTarget = stripTrailingSlashes(targetPath.replace(/\\/g, '/')) ?? targetPath;
  const homePrefix = `${normalizedHome}/`;
  return normalizedTarget === normalizedHome || normalizedTarget.startsWith(homePrefix);
}

/** Simulates the entry filter in loadDirectory */
function isEntryAllowed(
  entryPath: string,
  normalizedHome: string
): boolean {
  const normalizedEntryRaw = entryPath.replace(/\\/g, '/');
  const normalizedEntryPath = stripTrailingSlashes(normalizedEntryRaw) ?? normalizedEntryRaw;
  // When root is '/', show all directories
  if (normalizedHome === '/') return true;
  const entryPrefix =
    normalizedEntryPath === normalizedHome ? normalizedHome : `${normalizedHome}/`;
  return normalizedEntryPath === normalizedHome || normalizedEntryPath.startsWith(entryPrefix);
}

/** Simulates goToParent from useDirectoryStore */
function goToParent(currentDirectory: string): string | null {
  if (currentDirectory === '/') return null; // already at root, no-op
  const cleanPath = currentDirectory.endsWith('/')
    ? currentDirectory.slice(0, -1)
    : currentDirectory;
  const lastSlash = cleanPath.lastIndexOf('/');
  if (lastSlash === -1) return '/';
  if (lastSlash === 0) return '/';
  return cleanPath.substring(0, lastSlash);
}

// ── Tests ────────────────────────────────────────────────────────────

describe('computeEffectiveRoot', () => {
  it('returns "/" when rootDirectory is "/"', () => {
    expect(computeEffectiveRoot('/', '/home/user')).toBe('/');
  });

  it('returns "/" when rootDirectory is "/" and no home', () => {
    expect(computeEffectiveRoot('/', null)).toBe('/');
  });

  it('returns home when rootDirectory is null', () => {
    expect(computeEffectiveRoot(null, '/home/user')).toBe('/home/user');
  });

  it('returns specific root when provided', () => {
    expect(computeEffectiveRoot('/opt', '/home/user')).toBe('/opt');
  });

  it('strips trailing slashes from root', () => {
    expect(computeEffectiveRoot('/opt/', null)).toBe('/opt');
  });
});

describe('isPathWithinHome (root = "/")', () => {
  const root = '/';

  it('allows any absolute path', () => {
    expect(isPathWithinHome('/opt/myapp', root, true)).toBe(true);
    expect(isPathWithinHome('/var/www/html', root, true)).toBe(true);
    expect(isPathWithinHome('/home/ubuntu', root, true)).toBe(true);
    expect(isPathWithinHome('/srv/project', root, true)).toBe(true);
    expect(isPathWithinHome('/', root, true)).toBe(true);
  });

  it('rejects null/undefined paths', () => {
    expect(isPathWithinHome(null, root, true)).toBe(false);
    expect(isPathWithinHome(undefined, root, true)).toBe(false);
  });

  it('rejects when not ready', () => {
    expect(isPathWithinHome('/opt', root, false)).toBe(false);
  });
});

describe('isPathWithinHome (root = "/home/user")', () => {
  const root = '/home/user';

  it('allows paths inside home', () => {
    expect(isPathWithinHome('/home/user', root, true)).toBe(true);
    expect(isPathWithinHome('/home/user/projects', root, true)).toBe(true);
    expect(isPathWithinHome('/home/user/.config', root, true)).toBe(true);
  });

  it('rejects paths outside home', () => {
    expect(isPathWithinHome('/opt/myapp', root, true)).toBe(false);
    expect(isPathWithinHome('/var/www', root, true)).toBe(false);
    expect(isPathWithinHome('/', root, true)).toBe(false);
    expect(isPathWithinHome('/home/otheruser', root, true)).toBe(false);
  });
});

describe('isLoadAllowed (root = "/")', () => {
  it('allows loading any directory', () => {
    expect(isLoadAllowed('/opt', '/')).toBe(true);
    expect(isLoadAllowed('/var/www/html', '/')).toBe(true);
    expect(isLoadAllowed('/', '/')).toBe(true);
    expect(isLoadAllowed('/home/ubuntu/.config', '/')).toBe(true);
  });
});

describe('isLoadAllowed (root = "/home/user")', () => {
  it('allows paths inside home', () => {
    expect(isLoadAllowed('/home/user', '/home/user')).toBe(true);
    expect(isLoadAllowed('/home/user/docs', '/home/user')).toBe(true);
  });

  it('blocks paths outside home', () => {
    expect(isLoadAllowed('/opt', '/home/user')).toBe(false);
    expect(isLoadAllowed('/var/www', '/home/user')).toBe(false);
  });
});

describe('isEntryAllowed (root = "/")', () => {
  it('allows all directory entries', () => {
    expect(isEntryAllowed('/bin', '/')).toBe(true);
    expect(isEntryAllowed('/etc', '/')).toBe(true);
    expect(isEntryAllowed('/opt/myapp', '/')).toBe(true);
    expect(isEntryAllowed('/home/user/.ssh', '/')).toBe(true);
  });
});

describe('isEntryAllowed (root = "/home/user")', () => {
  it('allows entries inside home', () => {
    expect(isEntryAllowed('/home/user/projects', '/home/user')).toBe(true);
    expect(isEntryAllowed('/home/user/.config', '/home/user')).toBe(true);
  });

  it('blocks entries outside home', () => {
    expect(isEntryAllowed('/opt', '/home/user')).toBe(false);
    expect(isEntryAllowed('/var/www', '/home/user')).toBe(false);
  });
});

describe('goToParent', () => {
  it('returns null at root (no-op)', () => {
    expect(goToParent('/')).toBe(null);
  });

  it('navigates from home to parent', () => {
    expect(goToParent('/home/user')).toBe('/home');
  });

  it('navigates from /home to /', () => {
    expect(goToParent('/home')).toBe('/');
  });

  it('navigates from deep path upward', () => {
    expect(goToParent('/opt/myapp/src')).toBe('/opt/myapp');
  });

  it('navigates from /opt to /', () => {
    expect(goToParent('/opt')).toBe('/');
  });

  it('handles trailing slash', () => {
    expect(goToParent('/home/user/')).toBe('/home');
  });
});
