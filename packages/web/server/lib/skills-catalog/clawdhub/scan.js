/**
 * ClawdHub skill scanning
 * 
 * Fetches all available skills from the ClawdHub registry
 * and transforms them into SkillsCatalogItem format.
 */

import { fetchClawdHubSkills } from './api.js';

const MAX_PAGES = 20; // Safety limit to prevent infinite loops
const CLAWDHUB_PAGE_LIMIT = 25;

const mapClawdHubItem = (item) => {
  const latestVersion = item.tags?.latest || item.latestVersion?.version || '1.0.0';

  return {
    sourceId: 'clawdhub',
    repoSource: 'clawdhub:registry',
    repoSubpath: null,
    gitIdentityId: null,
    skillDir: item.slug,
    skillName: item.slug,
    frontmatterName: item.displayName || item.slug,
    description: item.summary || null,
    installable: true,
    warnings: [],
    // ClawdHub-specific metadata
    clawdhub: {
      slug: item.slug,
      version: latestVersion,
      displayName: item.displayName,
      owner: item.owner?.handle || null,
      downloads: item.stats?.downloads || 0,
      stars: item.stats?.stars || 0,
      versionsCount: item.stats?.versions || 1,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    },
  };
};

/**
 * Scan ClawdHub registry for all available skills
 * @returns {Promise<{ ok: boolean, items?: Array, error?: Object }>}
 */
export async function scanClawdHub() {
  try {
    const allItems = [];
    let cursor = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      let items = [];
      let nextCursor = null;

      try {
        const pageResult = await fetchClawdHubSkills({ cursor });
        items = pageResult.items || [];
        nextCursor = pageResult.nextCursor || null;
      } catch (error) {
        if (page > 0 && allItems.length > 0) {
          console.warn('ClawdHub pagination failed; returning partial results.');
          break;
        }
        throw error;
      }

      for (const item of items) {
        allItems.push(mapClawdHubItem(item));
      }

      if (!nextCursor) {
        break;
      }
      cursor = nextCursor;
    }

    // Sort by downloads (most popular first)
    allItems.sort((a, b) => (b.clawdhub?.downloads || 0) - (a.clawdhub?.downloads || 0));

    return { ok: true, items: allItems };
  } catch (error) {
    console.error('ClawdHub scan error:', error);
    return {
      ok: false,
      error: {
        kind: 'networkError',
        message: error instanceof Error ? error.message : 'Failed to fetch skills from ClawdHub',
      },
    };
  }
}

/**
 * Scan a single ClawdHub page (cursor-based)
 * @returns {Promise<{ ok: boolean, items?: Array, nextCursor?: string | null, error?: Object }>}
 */
export async function scanClawdHubPage({ cursor } = {}) {
  try {
    const { items, nextCursor } = await fetchClawdHubSkills({ cursor });
    const mapped = (items || []).map(mapClawdHubItem).slice(0, CLAWDHUB_PAGE_LIMIT);
    mapped.sort((a, b) => (b.clawdhub?.downloads || 0) - (a.clawdhub?.downloads || 0));
    return { ok: true, items: mapped, nextCursor: nextCursor || null };
  } catch (error) {
    console.error('ClawdHub page scan error:', error);
    return {
      ok: false,
      error: {
        kind: 'networkError',
        message: error instanceof Error ? error.message : 'Failed to fetch skills from ClawdHub',
      },
    };
  }
}
