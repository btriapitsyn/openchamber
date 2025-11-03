/**
 * Prompt Templates and Instructions for Prompt Enhancer
 *
 * This file centralizes all prompt-related text used when generating
 * refined prompts for the OpenCode agent.
 */

/**
 * Base instructions that are always included in the refined prompt,
 * regardless of user selections.
 */
export const BASE_INSTRUCTIONS = [
  'Keep the instructions single-turn, fully self-contained, and free of conversational chatter.',
  'Require the agent to share a short execution plan before implementing changes.',
  'Have the agent call out key risks, open questions, and handoff notes.',
];

/**
 * Conditional instructions that are added based on user selections
 * or available context.
 */
export const CONDITIONAL_INSTRUCTIONS = {
  // Added when includeProjectContext is true
  projectContext: 'Incorporate relevant details from the provided project context when crafting guidance.',

  // Added when includeRepositoryDiff is true
  repositoryDiff: 'Review the repository diff details to align work with outstanding changes.',

  // Added when diff digest is present
  diffDigest: 'Incorporate the provided diff digest when prioritizing implementation details.',
};

/**
 * Builds the system prompt for the AI that generates refined prompts.
 * This AI receives the user's raw request and selected options, then
 * outputs a structured, comprehensive prompt for the coding agent.
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeProjectContext - Whether project context is included
 * @param {boolean} options.includeRepositoryDiff - Whether repository diff is included
 * @returns {string} The complete system prompt
 */
export function buildSystemPrompt({ includeProjectContext, includeRepositoryDiff }) {
  const base =
    'You are a staff-level AI engineer who writes refined prompts for another autonomous coding agent. ' +
    'Return a JSON object with keys "prompt" (string) and "rationale" (array of strings). ';

  const contextDirective = [
    includeProjectContext
      ? 'Use the Project Context section included in the user message to ground your guidance. '
      : '',
    includeRepositoryDiff
      ? 'Factor in the Repository Diff section to respect outstanding local changes. '
      : '',
  ].join('');

  const remainder =
    'Rules: the prompt must stand alone, include sections for Context, Objectives, Constraints, Implementation Plan, Validation, and Deliverables, ' +
    'and ensure tests, runtime expectations, and documentation requirements are explicit. ' +
    'Implementation Plan must be a numbered list. Validation should list concrete commands or checks. ' +
    'Deliverables should enumerate artifacts to produce. Keep tone direct and actionable. ' +
    'If nothing noteworthy warrants rationale, return an empty array. ' +
    'Return only the JSON object with no surrounding commentary or code fences.';

  return base + contextDirective + remainder;
}
