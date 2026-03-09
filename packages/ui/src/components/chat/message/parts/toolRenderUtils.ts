const EXPANDABLE_TOOL_NAMES = new Set<string>([
    'edit', 'multiedit', 'apply_patch', 'str_replace', 'str_replace_based_edit_tool',
    'bash', 'shell', 'cmd', 'terminal',
    'write', 'create', 'file_write',
    'question',
]);

const STANDALONE_TOOL_NAMES = new Set<string>(['task']);

const SEARCH_TOOL_NAMES = new Set<string>(['grep', 'search', 'find', 'ripgrep', 'glob']);

export const isExpandableTool = (toolName: unknown): boolean => {
    return typeof toolName === 'string' && EXPANDABLE_TOOL_NAMES.has(toolName.toLowerCase());
};

export const isStandaloneTool = (toolName: unknown): boolean => {
    return typeof toolName === 'string' && STANDALONE_TOOL_NAMES.has(toolName.toLowerCase());
};

export const isStaticTool = (toolName: unknown): boolean => {
    if (typeof toolName !== 'string') return false;
    return !isExpandableTool(toolName) && !isStandaloneTool(toolName);
};

export const getStaticGroupToolName = (toolName: string): string => {
    const normalized = toolName.toLowerCase();
    if (SEARCH_TOOL_NAMES.has(normalized)) {
        return 'grep';
    }
    return normalized;
};
