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
 * Style directives for the prompt generator based on desired prompt length and detail level.
 */
const STYLE_DIRECTIVES = {
  concise:
    'Keep the refined prompt concise and action-focused (target 300-500 words). Prioritize clarity and immediate actionability over completeness. Skip background rationale unless critical.',
  balanced:
    'Craft a balanced refined prompt (target 500-800 words). Include necessary context, clear objectives, and actionable steps without excessive elaboration.',
  detailed:
    'Provide a comprehensive refined prompt (target 800-1200 words). Include thorough context, multiple implementation approaches where relevant, detailed validation criteria, and reasoning for key decisions.',
};

/**
 * Builds the system prompt for the AI that generates refined prompts.
 * This AI receives the user's raw request and selected options, then
 * outputs a structured, comprehensive prompt for the coding agent.
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeProjectContext - Whether project context is included
 * @param {boolean} options.includeRepositoryDiff - Whether repository diff is included
 * @param {'concise'|'balanced'|'detailed'} options.promptStyle - Desired prompt style (defaults to 'balanced')
 * @returns {string} The complete system prompt
 */
export function buildSystemPrompt({ includeProjectContext, includeRepositoryDiff, promptStyle = 'balanced' }) {
  const base =
    'You are a staff-level AI engineer who writes refined prompts for another autonomous coding agent. ' +
    'Return a JSON object with keys "prompt" (string) and "rationale" (array of strings). ';

  const styleDirective = STYLE_DIRECTIVES[promptStyle] || STYLE_DIRECTIVES.balanced;

  const contextDirective = [
    includeProjectContext
      ? 'Use the Project Context section included in the user message to ground your guidance. '
      : '',
    includeRepositoryDiff
      ? 'Factor in the Repository Diff section to respect outstanding local changes. '
      : '',
  ].join('');

  const remainder =
    'Rules: the prompt must stand alone, include sections for Context, Objectives, Constraints, Open Questions, Implementation Plan, and Validation, ' +
    'and ensure tests, runtime expectations, and documentation requirements are explicit. ' +
    'Open Questions should instruct the agent to identify missing context or ambiguities and ask the user for clarification before starting implementation. ' +
    'Implementation Plan must be a numbered list. ' +
    'Validation should instruct the agent to run commands it can execute (if runtime access is available and not restricted in Requirements to Integrate) or manual verification steps the user must perform. Format as actionable items for the agent to communicate. ' +
    'Keep tone direct and actionable. ' +
    'If nothing noteworthy warrants rationale, return an empty array. ' +
    'Return only the JSON object with no surrounding commentary or code fences.';

  return base + styleDirective + ' ' + contextDirective + remainder;
}
