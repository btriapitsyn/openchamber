import { describe, it, expect } from 'vitest';
import { parseAgentMentions } from './agentMentions';
import type { Agent } from '@opencode-ai/sdk/v2';

describe('parseAgentMentions', () => {
  const createAgent = (name: string, mode: string = 'secondary'): Agent => ({
    name,
    mode,
    id: `agent-${name}`,
    systemPrompt: '',
  } as unknown as Agent);

  const agents: Agent[] = [
    createAgent('oracle', 'secondary'),
    createAgent('coder', 'secondary'),
    createAgent('writer', 'secondary'),
    createAgent('primary', 'primary'),
  ];

  it('should return unchanged text when no mentions present', () => {
    const result = parseAgentMentions('Hello world', agents);
    expect(result.sanitizedText).toBe('Hello world');
    expect(result.mention).toBeNull();
  });

  it('should return unchanged text for empty string', () => {
    const result = parseAgentMentions('', agents);
    expect(result.sanitizedText).toBe('');
    expect(result.mention).toBeNull();
  });

  it('should return unchanged when no agents provided', () => {
    const result = parseAgentMentions('#oracle help me', []);
    expect(result.sanitizedText).toBe('#oracle help me');
    expect(result.mention).toBeNull();
  });

  it('should return unchanged when only primary agents exist', () => {
    const primaryOnly = [createAgent('primary', 'primary')];
    const result = parseAgentMentions('#primary help', primaryOnly);
    expect(result.mention).toBeNull();
  });

  it('should detect agent mention at start of text', () => {
    const result = parseAgentMentions('#oracle help me with this', agents);
    expect(result.mention).not.toBeNull();
    expect(result.mention?.name).toBe('oracle');
    expect(result.mention?.source?.start).toBe(0);
    expect(result.mention?.source?.end).toBe(7);
  });

  it('should detect agent mention in middle of text', () => {
    const result = parseAgentMentions('Please #coder fix this bug', agents);
    expect(result.mention?.name).toBe('coder');
    expect(result.mention?.source?.start).toBe(7);
  });

  it('should detect agent mention at end of text', () => {
    const result = parseAgentMentions('Ask #writer', agents);
    expect(result.mention?.name).toBe('writer');
  });

  it('should be case-insensitive', () => {
    const result = parseAgentMentions('#ORACLE help', agents);
    expect(result.mention?.name).toBe('oracle');
  });

  it('should detect first mention when multiple exist', () => {
    const result = parseAgentMentions('#oracle and #coder', agents);
    expect(result.mention?.name).toBe('oracle');
  });

  it('should not match partial agent names', () => {
    const result = parseAgentMentions('#oracletest', agents);
    expect(result.mention).toBeNull();
  });

  it('should match with punctuation after mention', () => {
    const result = parseAgentMentions('#oracle, please help', agents);
    expect(result.mention?.name).toBe('oracle');
  });

  it('should not match when # is part of another word', () => {
    const result = parseAgentMentions('foo#oracle', agents);
    expect(result.mention).toBeNull();
  });

  it('should match after whitespace', () => {
    const result = parseAgentMentions('Hello #oracle', agents);
    expect(result.mention?.name).toBe('oracle');
  });

  it('should match after parenthesis', () => {
    const result = parseAgentMentions('(#oracle)', agents);
    expect(result.mention?.name).toBe('oracle');
  });

  it('should match after brackets', () => {
    const result = parseAgentMentions('[#coder]', agents);
    expect(result.mention?.name).toBe('coder');
  });

  it('should return null for non-string input', () => {
    const result = parseAgentMentions(null as unknown as string, agents);
    expect(result.sanitizedText).toBeNull();
    expect(result.mention).toBeNull();
  });

  it('should include source information in mention', () => {
    const result = parseAgentMentions('test #oracle please', agents);
    expect(result.mention?.source).toEqual({
      value: '#oracle',
      start: 5,
      end: 12,
    });
  });
});
