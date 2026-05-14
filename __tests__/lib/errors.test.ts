import { describe, expect, it } from '@jest/globals';
import {
  SyncSpellsError,
  ProfileNotFoundError,
  SkillNotFoundError,
  BrokenSymlinkError
} from '../../src/lib/errors';

describe('Error Classes', () => {
  describe('SyncSpellsError', () => {
    it('should create SyncSpellsError with message', () => {
      const error = new SyncSpellsError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('SyncSpellsError');
    });

    it('should be an instance of Error', () => {
      const error = new SyncSpellsError('base');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SyncSpellsError);
    });

    it('should be an instance of SyncSpellsError for subclasses', () => {
      const profileError = new ProfileNotFoundError('test');
      expect(profileError).toBeInstanceOf(SyncSpellsError);
    });
  });

  describe('ProfileNotFoundError', () => {
    it('should create with profile name', () => {
      const error = new ProfileNotFoundError('unknown-profile');
      expect(error.message).toBe('Profile not found: unknown-profile');
      expect(error.name).toBe('ProfileNotFoundError');
      expect(error.profileName).toBe('unknown-profile');
      expect(error.suggestions).toEqual([]);
    });

    it('should create with suggestions', () => {
      const error = new ProfileNotFoundError('unknown-profile', ['mexc-code', 'lifeos-knowledge']);
      expect(error.message).toContain('unknown-profile');
      expect(error.suggestions).toEqual(['mexc-code', 'lifeos-knowledge']);
    });

    it('should format error message with suggestions', () => {
      const error = new ProfileNotFoundError('bad-profile', ['good-profile']);
      const formatted = error.formatMessage();
      expect(formatted).toContain('bad-profile');
      expect(formatted).toContain('good-profile');
      expect(formatted).toContain('spells profiles list');
    });

    it('should format error message without suggestions', () => {
      const error = new ProfileNotFoundError('missing');
      const formatted = error.formatMessage();
      expect(formatted).toContain('missing');
      expect(formatted).not.toContain('Did you mean');
      expect(formatted).toContain('spells profiles list');
    });
  });

  describe('SkillNotFoundError', () => {
    it('should create with skill path and profile name', () => {
      const error = new SkillNotFoundError('my-skill', 'my-profile');
      expect(error.message).toBe('Skill not found: my-skill');
      expect(error.name).toBe('SkillNotFoundError');
      expect(error.skillPath).toBe('my-skill');
      expect(error.profileName).toBe('my-profile');
    });

    it('should format error message', () => {
      const error = new SkillNotFoundError('my-skill', 'my-profile');
      const formatted = error.formatMessage();
      expect(formatted).toContain('my-skill');
      expect(formatted).toContain('my-profile');
      expect(formatted).toContain('spells skill new');
      expect(formatted).toContain('Edit the profile JSON file directly');
    });
  });

  describe('BrokenSymlinkError', () => {
    it('should create with link path and expected target', () => {
      const error = new BrokenSymlinkError('/path/to/link', '/path/to/target');
      expect(error.message).toBe('Broken symlink detected: /path/to/link');
      expect(error.name).toBe('BrokenSymlinkError');
      expect(error.linkPath).toBe('/path/to/link');
      expect(error.expectedTarget).toBe('/path/to/target');
      expect(error.actualTarget).toBeUndefined();
    });

    it('should create with actual target', () => {
      const error = new BrokenSymlinkError('/link', '/expected', '/actual');
      expect(error.actualTarget).toBe('/actual');
    });

    it('should format error message with actual target', () => {
      const error = new BrokenSymlinkError('/link', '/expected', '/actual');
      const formatted = error.formatMessage();
      expect(formatted).toContain('/link');
      expect(formatted).toContain('/expected');
      expect(formatted).toContain('/actual');
      expect(formatted).toContain('spells doctor --fix');
    });

    it('should format error message without actual target', () => {
      const error = new BrokenSymlinkError('/link', '/expected');
      const formatted = error.formatMessage();
      expect(formatted).toContain('/link');
      expect(formatted).toContain('/expected');
      expect(formatted).not.toContain('Actual:');
      expect(formatted).toContain('spells doctor --fix');
    });
  });
});
