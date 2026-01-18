import { describe, it, expect } from 'vitest';
import { calculateEditPermissionUIState } from './editPermissionDefaults';

describe('calculateEditPermissionUIState', () => {
  describe('bash permission detection', () => {
    it('should detect bash ask entry from string', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        bashPermission: 'ask',
      });
      expect(result.bashHasAsk).toBe(true);
      expect(result.bashHasDeny).toBe(false);
      expect(result.bashAllAllow).toBe(false);
    });

    it('should detect bash deny entry from string', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        bashPermission: 'deny',
      });
      expect(result.bashHasAsk).toBe(false);
      expect(result.bashHasDeny).toBe(true);
      expect(result.bashAllAllow).toBe(false);
    });

    it('should detect bash allow all from string', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        bashPermission: 'allow',
      });
      expect(result.bashHasAsk).toBe(false);
      expect(result.bashHasDeny).toBe(false);
      expect(result.bashAllAllow).toBe(true);
    });

    it('should detect ask entry from bash permission map', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        bashPermission: {
          'npm': 'allow',
          'rm': 'ask',
        },
      });
      expect(result.bashHasAsk).toBe(true);
    });

    it('should detect deny entry from bash permission map', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        bashPermission: {
          'npm': 'allow',
          'rm -rf': 'deny',
        },
      });
      expect(result.bashHasDeny).toBe(true);
    });
  });

  describe('webfetch permission detection', () => {
    it('should detect webfetch allow', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        webfetchPermission: 'allow',
      });
      expect(result.webfetchIsAllow).toBe(true);
      expect(result.webfetchNotDeny).toBe(true);
    });

    it('should detect webfetch deny', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        webfetchPermission: 'deny',
      });
      expect(result.webfetchIsAllow).toBe(false);
      expect(result.webfetchNotDeny).toBe(false);
    });

    it('should detect webfetch ask', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        webfetchPermission: 'ask',
      });
      expect(result.webfetchIsAllow).toBe(false);
      expect(result.webfetchNotDeny).toBe(true);
    });
  });

  describe('cascade default mode calculation', () => {
    it('should cascade to full when all allow', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        webfetchPermission: 'allow',
        bashPermission: 'allow',
      });
      expect(result.cascadeDefaultMode).toBe('full');
    });

    it('should cascade to allow when edit allow but bash has ask', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        webfetchPermission: 'allow',
        bashPermission: 'ask',
      });
      expect(result.cascadeDefaultMode).toBe('allow');
    });

    it('should stay at ask when edit mode is ask', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'ask',
        webfetchPermission: 'allow',
        bashPermission: 'allow',
      });
      expect(result.cascadeDefaultMode).toBe('ask');
    });

    it('should cascade full mode through when conditions met', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'full',
        webfetchPermission: 'allow',
        bashPermission: 'allow',
      });
      expect(result.cascadeDefaultMode).toBe('full');
    });
  });

  describe('mode availability', () => {
    it('should make ask available when edit is ask', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'ask',
      });
      expect(result.modeAvailability.ask).toBe(true);
    });

    it('should make allow available when edit is ask', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'ask',
      });
      expect(result.modeAvailability.allow).toBe(true);
    });

    it('should make allow available when edit allow and bash has ask', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        bashPermission: 'ask',
      });
      expect(result.modeAvailability.allow).toBe(true);
    });

    it('should never make deny available', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
      });
      expect(result.modeAvailability.deny).toBe(false);
    });
  });

  describe('auto-approve availability', () => {
    it('should be available when allow mode is available', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'ask',
      });
      expect(result.autoApproveAvailable).toBe(true);
    });

    it('should be available when full mode is available', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'ask',
        webfetchPermission: 'ask',
        bashPermission: 'ask',
      });
      expect(result.autoApproveAvailable).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined permissions', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
      });
      expect(result.bashHasAsk).toBe(false);
      expect(result.bashHasDeny).toBe(false);
      expect(result.bashAllAllow).toBe(true);
      expect(result.webfetchIsAllow).toBe(false);
    });

    it('should handle empty bash permission map', () => {
      const result = calculateEditPermissionUIState({
        agentDefaultEditMode: 'allow',
        bashPermission: {},
      });
      expect(result.bashAllAllow).toBe(true);
    });
  });
});
