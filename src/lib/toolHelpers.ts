// Tool-specific helpers for enhanced display in the OpenChamber

export interface ToolMetadata {
  displayName: string;
  icon?: string;
  outputLanguage?: string;
  inputFields?: {
    key: string;
    label: string;
    type: 'command' | 'file' | 'pattern' | 'text' | 'code';
    language?: string;
  }[];
  category: 'file' | 'search' | 'code' | 'system' | 'ai' | 'web';
}

// Tool definitions based on OpenCode spec
export const TOOL_METADATA: Record<string, ToolMetadata> = {
  // File operations
  read: {
    displayName: 'Read File',
    category: 'file',
    outputLanguage: 'auto', // Detect from file extension
    inputFields: [
      { key: 'filePath', label: 'File Path', type: 'file' },
      { key: 'offset', label: 'Start Line', type: 'text' },
      { key: 'limit', label: 'Lines to Read', type: 'text' }
    ]
  },
  write: {
    displayName: 'Write File',
    category: 'file',
    outputLanguage: 'auto',
    inputFields: [
      { key: 'filePath', label: 'File Path', type: 'file' },
      { key: 'content', label: 'Content', type: 'code' }
    ]
  },
  edit: {
    displayName: 'Edit File',
    category: 'file',
    outputLanguage: 'diff',
    inputFields: [
      { key: 'filePath', label: 'File Path', type: 'file' },
      { key: 'oldString', label: 'Find', type: 'code' },
      { key: 'newString', label: 'Replace', type: 'code' },
      { key: 'replaceAll', label: 'Replace All', type: 'text' }
    ]
  },
  multiedit: {
    displayName: 'Multi-Edit',
    category: 'file',
    outputLanguage: 'diff',
    inputFields: [
      { key: 'filePath', label: 'File Path', type: 'file' },
      { key: 'edits', label: 'Edits', type: 'code', language: 'json' }
    ]
  },
  
  // System operations
  bash: {
    displayName: 'Shell Command',
    category: 'system',
    outputLanguage: 'text',
    inputFields: [
      { key: 'command', label: 'Command', type: 'command', language: 'bash' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'timeout', label: 'Timeout (ms)', type: 'text' }
    ]
  },
  
  // Search operations
  grep: {
    displayName: 'Search Files',
    category: 'search',
    outputLanguage: 'text',
    inputFields: [
      { key: 'pattern', label: 'Pattern', type: 'pattern' },
      { key: 'path', label: 'Directory', type: 'file' },
      { key: 'include', label: 'Include Pattern', type: 'pattern' }
    ]
  },
  glob: {
    displayName: 'Find Files',
    category: 'search',
    outputLanguage: 'text',
    inputFields: [
      { key: 'pattern', label: 'Pattern', type: 'pattern' },
      { key: 'path', label: 'Directory', type: 'file' }
    ]
  },
  list: {
    displayName: 'List Directory',
    category: 'file',
    outputLanguage: 'text',
    inputFields: [
      { key: 'path', label: 'Directory', type: 'file' },
      { key: 'ignore', label: 'Ignore Patterns', type: 'pattern' }
    ]
  },
  
  // AI/Agent operations
  task: {
    displayName: 'Agent Task',
    category: 'ai',
    outputLanguage: 'markdown', // Now properly styled for markdown
    inputFields: [
      { key: 'description', label: 'Task', type: 'text' },
      { key: 'prompt', label: 'Instructions', type: 'text' },
      { key: 'subagent_type', label: 'Agent Type', type: 'text' }
    ]
  },
  
  // Web operations
  webfetch: {
    displayName: 'Fetch URL',
    category: 'web',
    outputLanguage: 'auto', // Could be HTML, JSON, or text
    inputFields: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'format', label: 'Format', type: 'text' },
      { key: 'timeout', label: 'Timeout', type: 'text' }
    ]
  },
  
  // Todo operations
  todowrite: {
    displayName: 'Update Todo List',
    category: 'system',
    outputLanguage: 'json',
    inputFields: [
      { key: 'todos', label: 'Todo Items', type: 'code', language: 'json' }
    ]
  },
  todoread: {
    displayName: 'Read Todo List',
    category: 'system',
    outputLanguage: 'json',
    inputFields: []
  },
  
  // Private/local AI operations
  'generate-docs-private': {
    displayName: 'Generate Documentation',
    category: 'ai',
    outputLanguage: 'markdown',
    inputFields: [
      { key: 'sourcePaths', label: 'Source Files', type: 'file' },
      { key: 'outputPath', label: 'Output Path', type: 'file' },
      { key: 'style', label: 'Style', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' }
    ]
  },
  'analyze-file-private': {
    displayName: 'Analyze Code',
    category: 'ai',
    outputLanguage: 'markdown',
    inputFields: [
      { key: 'filePath', label: 'File Path', type: 'file' },
      { key: 'outputPath', label: 'Output Path', type: 'file' },
      { key: 'focus', label: 'Focus', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' }
    ]
  },
  'generate-tests-private': {
    displayName: 'Generate Tests',
    category: 'ai',
    outputLanguage: 'auto',
    inputFields: [
      { key: 'sourcePath', label: 'Source File', type: 'file' },
      { key: 'outputPath', label: 'Output Path', type: 'file' },
      { key: 'framework', label: 'Framework', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' }
    ]
  },
  'refactor-file-private': {
    displayName: 'Refactor Code',
    category: 'ai',
    outputLanguage: 'auto',
    inputFields: [
      { key: 'sourcePath', label: 'Source File', type: 'file' },
      { key: 'outputPath', label: 'Output Path', type: 'file' },
      { key: 'focus', label: 'Focus', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' }
    ]
  },
  'generate-batch-docs-private': {
    displayName: 'Batch Documentation',
    category: 'ai',
    outputLanguage: 'markdown',
    inputFields: [
      { key: 'filePaths', label: 'Files', type: 'file' },
      { key: 'outputPath', label: 'Output Path', type: 'file' },
      { key: 'style', label: 'Style', type: 'text' },
      { key: 'includeIndex', label: 'Include Index', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' }
    ]
  },
  'compare-files-private': {
    displayName: 'Compare Files',
    category: 'ai',
    outputLanguage: 'markdown',
    inputFields: [
      { key: 'file1', label: 'First File', type: 'file' },
      { key: 'file2', label: 'Second File', type: 'file' },
      { key: 'outputPath', label: 'Output Path', type: 'file' },
      { key: 'model', label: 'Model', type: 'text' }
    ]
  }
};

/**
 * Get tool metadata with fallback for unknown tools
 */
export function getToolMetadata(toolName: string): ToolMetadata {
  return TOOL_METADATA[toolName] || {
    displayName: toolName.charAt(0).toUpperCase() + toolName.slice(1).replace(/-/g, ' '),
    category: 'system',
    outputLanguage: 'text',
    inputFields: []
  };
}

/**
 * Detect output language based on tool and content
 */
export function detectToolOutputLanguage(
  toolName: string, 
  output: string, 
  input?: any
): string {
  const metadata = getToolMetadata(toolName);
  
  // If tool specifies auto detection
  if (metadata.outputLanguage === 'auto') {
    // For file operations, try to detect from file path
    if (input?.filePath || input?.file_path || input?.sourcePath) {
      const filePath = input.filePath || input.file_path || input.sourcePath;
      const language = getLanguageFromExtension(filePath);
      if (language) return language;
    }
    
    // For webfetch, detect content type
    if (toolName === 'webfetch') {
      if (output.trim().startsWith('{') || output.trim().startsWith('[')) {
        try {
          JSON.parse(output);
          return 'json';
        } catch {}
      }
      if (output.trim().startsWith('<')) {
        return 'html';
      }
      if (output.includes('```')) {
        return 'markdown';
      }
    }
    
    // Default to text
    return 'text';
  }
  
  return metadata.outputLanguage || 'text';
}

/**
 * Get language from file extension
 */
export function getLanguageFromExtension(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'mjs': 'javascript',
    'cjs': 'javascript',
    
    // Web
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    
    // Data formats
    'json': 'json',
    'jsonc': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'xml': 'xml',
    
    // Programming languages
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'dart': 'dart',
    'r': 'r',
    'lua': 'lua',
    'vim': 'vim',
    
    // Shell
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'fish': 'bash',
    'ps1': 'powershell',
    
    // Documentation
    'md': 'markdown',
    'mdx': 'markdown',
    'rst': 'text',
    'txt': 'text',
    
    // Config files
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'gitignore': 'text',
    'env': 'text',
    'conf': 'text',
    'cfg': 'text',
    'ini': 'ini',
    
    // SQL
    'sql': 'sql',
    
    // Other
    'diff': 'diff',
    'patch': 'diff'
  };
  
  return languageMap[ext || ''] || null;
}

/**
 * Format tool input for display
 */
export function formatToolInput(input: any, toolName: string): string {
  if (!input) return '';
  
  // For bash commands, just return the command
  if (toolName === 'bash' && input.command) {
    return input.command;
  }
  
  // For task tool, format the prompt nicely
  if (toolName === 'task') {
    if (input.prompt) {
      return input.prompt;
    }
    if (input.description) {
      return input.description;
    }
  }
  
  // For edit and multiedit tools, only show the file path
  // The diff view in output shows the actual changes much better
  if ((toolName === 'edit' || toolName === 'multiedit') && typeof input === 'object') {
    const filePath = input.filePath || input.file_path || input.path;
    if (filePath) {
      return `File path: ${filePath}`;
    }
  }
  
  // For write tool, return the content directly for syntax highlighting
  if (toolName === 'write' && typeof input === 'object') {
    // The content field contains the actual file content
    if (input.content) {
      return input.content;
    }
  }
  
  // For other tools, format as key-value pairs
  if (typeof input === 'object') {
    const entries = Object.entries(input)
      .filter(([_key, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        // Format key nicely
        const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')
          .toLowerCase()
          .replace(/^./, str => str.toUpperCase());
        
        // Format value
        let formattedValue = value;
        if (typeof value === 'object') {
          formattedValue = JSON.stringify(value, null, 2);
        } else if (typeof value === 'boolean') {
          formattedValue = value ? 'Yes' : 'No';
        }
        
        return `${formattedKey}: ${formattedValue}`;
      });
    
    return entries.join('\n');
  }
  
  return String(input);
}

/**
 * Check if output should be displayed as markdown
 */
export function shouldRenderAsMarkdown(toolName: string, output: string): boolean {
  const metadata = getToolMetadata(toolName);
  
  // Check if tool is known to output markdown
  if (metadata.outputLanguage === 'markdown') {
    return true;
  }
  
  // For task tool, check if output contains markdown indicators
  if (toolName === 'task') {
    const markdownIndicators = [
      '```',     // Code blocks
      '## ',     // Headers
      '### ',
      '- ',      // Lists
      '* ',
      '1. ',
      '[',       // Links
      '**',      // Bold
      '_',       // Italic
      '>'        // Quotes
    ];
    
    return markdownIndicators.some(indicator => output.includes(indicator));
  }
  
  return false;
}

/**
 * Format task output to add visual structure
 */
export function formatTaskOutput(output: string): string {
  // Don't modify if it's not markdown-like content
  if (!output.includes('**') && !output.includes('##') && !output.includes('- ')) {
    return output;
  }
  
  // Add visual separators and indentation to improve readability
  let formatted = output;
  
  // Add visual separators for main sections
  formatted = formatted.replace(/^(#{1,3}\s+.+)$/gm, '\n$1\n' + '─'.repeat(50));
  
  // Add bullet point indicators for lists
  formatted = formatted.replace(/^(\s*)-\s+/gm, '$1• ');
  formatted = formatted.replace(/^(\s*)\*\s+/gm, '$1• ');
  
  // Add brackets around bold text for emphasis
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '[$1]');
  
  return formatted;
}