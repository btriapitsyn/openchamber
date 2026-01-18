import { describe, it, expect } from 'vitest';
import {
  getToolMetadata,
  detectToolOutputLanguage,
  getLanguageFromExtension,
  isImageFile,
  getImageMimeType,
  formatToolInput,
  TOOL_METADATA,
} from './toolHelpers';

describe('getToolMetadata', () => {
  it('should return metadata for known tools', () => {
    expect(getToolMetadata('read').displayName).toBe('Read File');
    expect(getToolMetadata('bash').displayName).toBe('Shell Command');
    expect(getToolMetadata('edit').displayName).toBe('Edit File');
  });

  it('should return default metadata for unknown tools', () => {
    const meta = getToolMetadata('unknown_tool');
    expect(meta.displayName).toBe('Unknown_tool');
    expect(meta.category).toBe('system');
    expect(meta.outputLanguage).toBe('text');
  });

  it('should format unknown tool names nicely', () => {
    expect(getToolMetadata('my-custom-tool').displayName).toBe('My custom tool');
    expect(getToolMetadata('anotherTool').displayName).toBe('AnotherTool');
  });

  it('should have correct categories for tools', () => {
    expect(getToolMetadata('read').category).toBe('file');
    expect(getToolMetadata('bash').category).toBe('system');
    expect(getToolMetadata('grep').category).toBe('search');
    expect(getToolMetadata('task').category).toBe('ai');
    expect(getToolMetadata('webfetch').category).toBe('web');
  });
});

describe('getLanguageFromExtension', () => {
  describe('JavaScript/TypeScript files', () => {
    it('should detect JavaScript files', () => {
      expect(getLanguageFromExtension('app.js')).toBe('javascript');
      expect(getLanguageFromExtension('module.mjs')).toBe('javascript');
      expect(getLanguageFromExtension('config.cjs')).toBe('javascript');
    });

    it('should detect TypeScript files', () => {
      expect(getLanguageFromExtension('app.ts')).toBe('typescript');
      expect(getLanguageFromExtension('module.mts')).toBe('typescript');
      expect(getLanguageFromExtension('types.d.ts')).toBe('typescript');
    });

    it('should detect JSX/TSX files', () => {
      expect(getLanguageFromExtension('Component.jsx')).toBe('jsx');
      expect(getLanguageFromExtension('Component.tsx')).toBe('tsx');
    });
  });

  describe('config files without extensions', () => {
    it('should detect Dockerfile', () => {
      expect(getLanguageFromExtension('Dockerfile')).toBe('dockerfile');
      expect(getLanguageFromExtension('/path/to/Dockerfile')).toBe('dockerfile');
    });

    it('should detect Makefile variants', () => {
      expect(getLanguageFromExtension('Makefile')).toBe('makefile');
      expect(getLanguageFromExtension('GNUmakefile')).toBe('makefile');
    });

    it('should detect Ruby config files', () => {
      expect(getLanguageFromExtension('Gemfile')).toBe('ruby');
      expect(getLanguageFromExtension('Rakefile')).toBe('ruby');
      expect(getLanguageFromExtension('Podfile')).toBe('ruby');
    });

    it('should detect environment files', () => {
      expect(getLanguageFromExtension('.env')).toBe('bash');
      expect(getLanguageFromExtension('.env.local')).toBe('bash');
      expect(getLanguageFromExtension('.env.production')).toBe('bash');
    });
  });

  describe('lock files', () => {
    it('should detect package lock files', () => {
      expect(getLanguageFromExtension('package-lock.json')).toBe('json');
      expect(getLanguageFromExtension('yarn.lock')).toBe('yaml');
      expect(getLanguageFromExtension('pnpm-lock.yaml')).toBe('yaml');
      expect(getLanguageFromExtension('Cargo.lock')).toBe('toml');
      expect(getLanguageFromExtension('bun.lock')).toBe('json');
    });
  });

  describe('common programming languages', () => {
    it('should detect Python files', () => {
      expect(getLanguageFromExtension('script.py')).toBe('python');
      expect(getLanguageFromExtension('types.pyi')).toBe('python');
    });

    it('should detect Go files', () => {
      expect(getLanguageFromExtension('main.go')).toBe('go');
    });

    it('should detect Rust files', () => {
      expect(getLanguageFromExtension('lib.rs')).toBe('rust');
    });

    it('should detect C/C++ files', () => {
      expect(getLanguageFromExtension('main.c')).toBe('c');
      expect(getLanguageFromExtension('header.h')).toBe('c');
      expect(getLanguageFromExtension('main.cpp')).toBe('cpp');
      expect(getLanguageFromExtension('class.hpp')).toBe('cpp');
    });
  });

  describe('data formats', () => {
    it('should detect JSON variants', () => {
      expect(getLanguageFromExtension('data.json')).toBe('json');
      expect(getLanguageFromExtension('config.jsonc')).toBe('json');
      expect(getLanguageFromExtension('tsconfig.json')).toBe('jsonc');
    });

    it('should detect YAML files', () => {
      expect(getLanguageFromExtension('config.yaml')).toBe('yaml');
      expect(getLanguageFromExtension('config.yml')).toBe('yaml');
    });

    it('should detect TOML files', () => {
      expect(getLanguageFromExtension('Cargo.toml')).toBe('toml');
    });
  });

  describe('shell scripts', () => {
    it('should detect shell script variants', () => {
      expect(getLanguageFromExtension('script.sh')).toBe('bash');
      expect(getLanguageFromExtension('script.bash')).toBe('bash');
      expect(getLanguageFromExtension('script.zsh')).toBe('bash');
    });

    it('should detect PowerShell', () => {
      expect(getLanguageFromExtension('script.ps1')).toBe('powershell');
    });
  });

  describe('edge cases', () => {
    it('should return null for unknown extensions', () => {
      expect(getLanguageFromExtension('file.xyz')).toBeNull();
      expect(getLanguageFromExtension('file.unknown')).toBeNull();
    });

    it('should handle files without extensions', () => {
      expect(getLanguageFromExtension('README')).toBeNull();
    });

    it('should handle paths with multiple dots', () => {
      expect(getLanguageFromExtension('file.test.ts')).toBe('typescript');
      expect(getLanguageFromExtension('component.spec.tsx')).toBe('tsx');
    });

    it('should be case-insensitive for extensions', () => {
      expect(getLanguageFromExtension('FILE.JS')).toBe('javascript');
      expect(getLanguageFromExtension('FILE.TS')).toBe('typescript');
    });
  });
});

describe('detectToolOutputLanguage', () => {
  it('should use static language for non-auto tools', () => {
    expect(detectToolOutputLanguage('bash', 'output')).toBe('text');
    expect(detectToolOutputLanguage('edit', 'diff output')).toBe('diff');
    expect(detectToolOutputLanguage('task', 'response')).toBe('markdown');
  });

  it('should detect language from filePath for read tool', () => {
    expect(detectToolOutputLanguage('read', 'content', { filePath: 'app.ts' })).toBe('typescript');
    expect(detectToolOutputLanguage('read', 'content', { filePath: 'style.css' })).toBe('css');
    expect(detectToolOutputLanguage('read', 'content', { file_path: 'main.py' })).toBe('python');
  });

  describe('webfetch auto-detection', () => {
    it('should detect JSON response', () => {
      const jsonOutput = '{"key": "value"}';
      expect(detectToolOutputLanguage('webfetch', jsonOutput)).toBe('json');
    });

    it('should detect JSON array response', () => {
      const jsonOutput = '[{"id": 1}, {"id": 2}]';
      expect(detectToolOutputLanguage('webfetch', jsonOutput)).toBe('json');
    });

    it('should detect HTML response', () => {
      const htmlOutput = '<html><body>Hello</body></html>';
      expect(detectToolOutputLanguage('webfetch', htmlOutput)).toBe('html');
    });

    it('should detect markdown in response', () => {
      const mdOutput = '# Title\n```js\ncode\n```';
      expect(detectToolOutputLanguage('webfetch', mdOutput)).toBe('markdown');
    });

    it('should default to text for plain content', () => {
      expect(detectToolOutputLanguage('webfetch', 'Plain text content')).toBe('text');
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidJson = '{not valid json';
      expect(detectToolOutputLanguage('webfetch', invalidJson)).toBe('text');
    });
  });

  it('should handle unknown tools', () => {
    expect(detectToolOutputLanguage('unknown', 'output')).toBe('text');
  });
});

describe('isImageFile', () => {
  it('should identify common image formats', () => {
    expect(isImageFile('photo.png')).toBe(true);
    expect(isImageFile('photo.jpg')).toBe(true);
    expect(isImageFile('photo.jpeg')).toBe(true);
    expect(isImageFile('animation.gif')).toBe(true);
    expect(isImageFile('icon.svg')).toBe(true);
    expect(isImageFile('image.webp')).toBe(true);
  });

  it('should handle case insensitivity', () => {
    expect(isImageFile('PHOTO.PNG')).toBe(true);
    expect(isImageFile('Photo.JPG')).toBe(true);
  });

  it('should reject non-image files', () => {
    expect(isImageFile('document.pdf')).toBe(false);
    expect(isImageFile('script.js')).toBe(false);
    expect(isImageFile('data.json')).toBe(false);
  });

  it('should handle paths with directories', () => {
    expect(isImageFile('/path/to/image.png')).toBe(true);
    expect(isImageFile('assets/icons/logo.svg')).toBe(true);
  });
});

describe('getImageMimeType', () => {
  it('should return correct MIME types', () => {
    expect(getImageMimeType('image.png')).toBe('image/png');
    expect(getImageMimeType('image.jpg')).toBe('image/jpeg');
    expect(getImageMimeType('image.jpeg')).toBe('image/jpeg');
    expect(getImageMimeType('image.gif')).toBe('image/gif');
    expect(getImageMimeType('image.svg')).toBe('image/svg+xml');
    expect(getImageMimeType('image.webp')).toBe('image/webp');
    expect(getImageMimeType('image.avif')).toBe('image/avif');
  });

  it('should default to image/png for unknown types', () => {
    expect(getImageMimeType('image.unknown')).toBe('image/png');
    expect(getImageMimeType('file')).toBe('image/png');
  });
});

describe('formatToolInput', () => {
  it('should return empty string for null/undefined input', () => {
    expect(formatToolInput(null as unknown as Record<string, unknown>, 'bash')).toBe('');
    expect(formatToolInput(undefined as unknown as Record<string, unknown>, 'bash')).toBe('');
  });

  describe('bash tool formatting', () => {
    it('should extract command for bash tool', () => {
      expect(formatToolInput({ command: 'ls -la' }, 'bash')).toBe('ls -la');
    });

    it('should fall back to generic formatting without command', () => {
      const result = formatToolInput({ description: 'List files' }, 'bash');
      expect(result).toContain('Description');
      expect(result).toContain('List files');
    });
  });

  describe('task tool formatting', () => {
    it('should prefer prompt over description', () => {
      expect(formatToolInput({ prompt: 'Do something', description: 'Desc' }, 'task')).toBe('Do something');
    });

    it('should use description when no prompt', () => {
      expect(formatToolInput({ description: 'Task description' }, 'task')).toBe('Task description');
    });
  });

  describe('edit tool formatting', () => {
    it('should show file path for edit tool', () => {
      expect(formatToolInput({ filePath: '/src/app.ts' }, 'edit')).toBe('File path: /src/app.ts');
    });

    it('should handle different path key names', () => {
      expect(formatToolInput({ file_path: '/src/app.ts' }, 'edit')).toBe('File path: /src/app.ts');
      expect(formatToolInput({ path: '/src/app.ts' }, 'edit')).toBe('File path: /src/app.ts');
    });
  });

  describe('write tool formatting', () => {
    it('should return content for write tool', () => {
      expect(formatToolInput({ content: 'file contents' }, 'write')).toBe('file contents');
    });
  });

  describe('generic formatting', () => {
    it('should format object keys nicely', () => {
      const result = formatToolInput({ filePath: '/test', someOption: true }, 'unknown');
      expect(result).toContain('File path: /test');
      expect(result).toContain('Some option: Yes');
    });

    it('should handle boolean values', () => {
      const result = formatToolInput({ enabled: true, disabled: false }, 'unknown');
      expect(result).toContain('Yes');
      expect(result).toContain('No');
    });

    it('should stringify nested objects', () => {
      const result = formatToolInput({ config: { nested: true } }, 'unknown');
      expect(result).toContain('Config:');
      expect(result).toContain('"nested": true');
    });

    it('should filter out empty values', () => {
      const result = formatToolInput({ 
        filled: 'value', 
        empty: '', 
        nullVal: null, 
        undefinedVal: undefined 
      }, 'unknown');
      expect(result).toContain('Filled: value');
      expect(result).not.toContain('Empty');
      expect(result).not.toContain('Null');
      expect(result).not.toContain('Undefined');
    });

    it('should handle numeric values', () => {
      const result = formatToolInput({ timeout: 5000 }, 'bash');
      expect(result).toContain('Timeout: 5000');
    });
  });
});

describe('TOOL_METADATA completeness', () => {
  const expectedTools = [
    'read', 'write', 'edit', 'multiedit', 'bash', 'grep', 'glob', 
    'list', 'task', 'webfetch', 'websearch', 'codesearch',
    'todowrite', 'todoread', 'skill', 'question'
  ];

  it('should have metadata for all common tools', () => {
    expectedTools.forEach(tool => {
      expect(TOOL_METADATA[tool]).toBeDefined();
      expect(TOOL_METADATA[tool].displayName).toBeDefined();
      expect(TOOL_METADATA[tool].category).toBeDefined();
    });
  });

  it('should have valid categories', () => {
    const validCategories = ['file', 'search', 'code', 'system', 'ai', 'web'];
    Object.values(TOOL_METADATA).forEach(meta => {
      expect(validCategories).toContain(meta.category);
    });
  });
});
