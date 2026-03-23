import { Octokit } from '@octokit/rest';
import { getGitHubAuth } from './auth.js';

export function getOctokitOrNull() {
  const auth = getGitHubAuth();
  if (!auth?.accessToken) {
    return null;
  }
  return new Octokit({ auth: auth.accessToken });
}
