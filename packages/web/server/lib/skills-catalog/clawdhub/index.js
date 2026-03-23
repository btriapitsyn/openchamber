/**
 * ClawdHub integration module
 * 
 * Provides skill browsing and installation from the ClawdHub registry.
 * https://clawdhub.com
 */

export { scanClawdHub, scanClawdHubPage } from './scan.js';
export { installSkillsFromClawdHub } from './install.js';
export {
  fetchClawdHubSkills,
  fetchClawdHubSkillVersion,
  fetchClawdHubSkillInfo,
  downloadClawdHubSkill,
} from './api.js';

/**
 * Check if a source string refers to ClawdHub
 * @param {string} source
 * @returns {boolean}
 */
export function isClawdHubSource(source) {
  return typeof source === 'string' && source.startsWith('clawdhub:');
}

/**
 * ClawdHub source identifier used in curated sources
 */
export const CLAWDHUB_SOURCE_ID = 'clawdhub';
export const CLAWDHUB_SOURCE_STRING = 'clawdhub:registry';
