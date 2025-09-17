// Agent color assignment utilities

// Define color palette using theme CSS variables
// Each entry maps to theme-defined colors for consistency across themes
// Uses colors that are distinct across both default and Flexoki themes
const AGENT_COLOR_PALETTE = [
  { var: '--primary', class: 'agent-primary' },           // Default/Build - golden/primary
  { var: '--status-info', class: 'agent-info' },         // Blue/Teal
  { var: '--status-success', class: 'agent-success' },   // Green/Olive green
  { var: '--syntax-function', class: 'agent-function' }, // Orange (distinct in both themes)
  { var: '--syntax-number', class: 'agent-number' },     // Orange/Purple
  { var: '--syntax-type', class: 'agent-type' },         // Cyan/Yellow
  { var: '--status-warning', class: 'agent-warning' },   // Yellow/Yellow
  { var: '--syntax-variable', class: 'agent-variable' }, // Red/Blue
];

/**
 * Get consistent color assignment for an agent
 * @param agentName - The name of the agent
 * @returns Color configuration with CSS variable and class name
 */
export function getAgentColor(agentName: string | undefined) {
  // Default to primary if no agent name
  if (!agentName) {
    return AGENT_COLOR_PALETTE[0];
  }

  // Rule 1: 'build' agent always gets primary (index 0)
  if (agentName === 'build') {
    return AGENT_COLOR_PALETTE[0];
  }

  // Rule 2: Hash-based consistent assignment for other agents
  // This ensures same agent always gets same color across sessions
  // Use a more robust hash function for better distribution
  let hash = 0;
  for (let i = 0; i < agentName.length; i++) {
    const char = agentName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Start from index 1 to skip primary (reserved for build)
  const paletteIndex = 1 + (Math.abs(hash) % (AGENT_COLOR_PALETTE.length - 1));
  return AGENT_COLOR_PALETTE[paletteIndex];
}

/**
 * Get all available agent colors for preview/legend
 */
export function getAgentColorPalette() {
  return AGENT_COLOR_PALETTE;
}