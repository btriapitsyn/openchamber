/**
 * Branch name generator utility for auto-generating friendly branch names.
 * Uses Ubuntu-style adjective-noun word pairs for memorable, collision-resistant naming.
 */

import { getGitBranches } from '@/lib/gitApi';

const ADJECTIVES = [
  'artful', 'bionic', 'cosmic', 'disco', 'focal', 'groovy', 'jammy', 'kinetic',
  'lunar', 'noble', 'bold', 'brave', 'calm', 'eager', 'gentle', 'happy', 'keen',
  'lively', 'merry', 'swift', 'warm', 'wise', 'bright', 'clever', 'daring',
  'agile', 'crisp', 'fresh', 'lucid', 'quick', 'sharp', 'vivid', 'zealous',
];

const NOUNS = [
  'aardvark', 'beaver', 'chipmunk', 'dolphin', 'falcon', 'gopher', 'hedgehog',
  'jackal', 'koala', 'lemur', 'mongoose', 'narwhal', 'otter', 'pangolin',
  'quokka', 'raccoon', 'salamander', 'toucan', 'walrus', 'yak', 'zebra',
  'badger', 'condor', 'dingo', 'egret', 'ferret', 'gecko', 'heron', 'iguana',
];

/**
 * Generate a random branch slug (e.g., "cosmic-dolphin", "noble-raccoon").
 */
export function generateBranchSlug(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective}-${noun}`;
}

/**
 * Generate a branch name with optional prefix.
 * @param prefix - Optional prefix like "feature", "bugfix" (no trailing slash)
 * @returns Full branch name like "feature/cosmic-dolphin" or just "cosmic-dolphin"
 */
export function generateBranchName(prefix?: string): string {
  const slug = generateBranchSlug();
  if (prefix && prefix.trim()) {
    const cleanPrefix = prefix.trim().replace(/\/+$/, '');
    return `${cleanPrefix}/${slug}`;
  }
  return slug;
}

/**
 * Generate a unique branch name that doesn't conflict with existing branches.
 * @param projectDirectory - Project directory to check for existing branches
 * @param prefix - Optional branch prefix
 * @param maxAttempts - Maximum attempts to generate a unique name (default: 10)
 * @returns Unique branch name, or null if all attempts failed
 */
export async function generateUniqueBranchName(
  projectDirectory: string,
  prefix?: string,
  maxAttempts: number = 10
): Promise<string | null> {
  let existingBranches: Set<string>;

  try {
    const branches = await getGitBranches(projectDirectory);
    existingBranches = new Set(branches?.all ?? []);
  } catch {
    // If we can't get branches, just generate without checking
    return generateBranchName(prefix);
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateBranchName(prefix);
    if (!existingBranches.has(candidate)) {
      return candidate;
    }
  }

  // All attempts exhausted, return null
  return null;
}
