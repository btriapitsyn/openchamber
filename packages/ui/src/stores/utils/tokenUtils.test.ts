import { describe, it, expect } from 'vitest';
import { extractTokensFromMessage } from './tokenUtils';
import type { Message, Part } from '@opencode-ai/sdk/v2';

describe('extractTokensFromMessage', () => {
  const asPart = (obj: Record<string, unknown>): Part => obj as unknown as Part;
  
  const createMessage = (info: Record<string, unknown>, parts: Part[] = []): { info: Message; parts: Part[] } => ({
    info: {
      id: 'test-id',
      sessionID: 'test-session',
      role: 'assistant',
      createdAt: new Date().toISOString(),
      ...info,
    } as unknown as Message,
    parts,
  });

  it('should return 0 for message without tokens', () => {
    const message = createMessage({});
    expect(extractTokensFromMessage(message)).toBe(0);
  });

  it('should extract tokens from numeric info.tokens', () => {
    const message = createMessage({ tokens: 100 });
    expect(extractTokensFromMessage(message)).toBe(100);
  });

  it('should sum token breakdown from info.tokens object', () => {
    const message = createMessage({
      tokens: {
        input: 50,
        output: 30,
        reasoning: 10,
      },
    });
    expect(extractTokensFromMessage(message)).toBe(90);
  });

  it('should include cache tokens in breakdown sum', () => {
    const message = createMessage({
      tokens: {
        input: 100,
        output: 50,
        cache: {
          read: 20,
          write: 10,
        },
      },
    });
    expect(extractTokensFromMessage(message)).toBe(180);
  });

  it('should handle partial token breakdown', () => {
    const message = createMessage({
      tokens: {
        input: 100,
      },
    });
    expect(extractTokensFromMessage(message)).toBe(100);
  });

  it('should extract tokens from parts when not in info', () => {
    const message = createMessage({}, [
      asPart({ type: 'text', text: 'hello' }),
      asPart({ type: 'text', tokens: 75 }),
    ]);
    expect(extractTokensFromMessage(message)).toBe(75);
  });

  it('should extract token breakdown from parts', () => {
    const message = createMessage({}, [
      asPart({ 
        type: 'text', 
        tokens: { 
          input: 25, 
          output: 25 
        } 
      }),
    ]);
    expect(extractTokensFromMessage(message)).toBe(50);
  });

  it('should prefer info.tokens over parts tokens', () => {
    const message = createMessage(
      { tokens: 200 },
      [asPart({ type: 'text', tokens: 100 })]
    );
    expect(extractTokensFromMessage(message)).toBe(200);
  });

  it('should handle null/undefined cache gracefully', () => {
    const message = createMessage({
      tokens: {
        input: 50,
        output: 50,
        cache: null,
      },
    });
    expect(extractTokensFromMessage(message)).toBe(100);
  });

  it('should return 0 for empty parts array', () => {
    const message = createMessage({}, []);
    expect(extractTokensFromMessage(message)).toBe(0);
  });

  it('should handle reasoning tokens', () => {
    const message = createMessage({
      tokens: {
        input: 100,
        output: 50,
        reasoning: 200,
      },
    });
    expect(extractTokensFromMessage(message)).toBe(350);
  });
});
