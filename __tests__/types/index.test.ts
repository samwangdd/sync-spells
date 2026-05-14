import { describe, expect, it } from '@jest/globals';
import {
  Profile,
  ValidationResult,
  SkillInfo,
  MaterializeResult,
  ProjectActivationResult,
  SkillCategory,
  InferenceRule,
} from '../../src/types';

describe('Profile', () => {
  it('should create valid profile object', () => {
    const profile: Profile = {
      name: 'test-profile',
      description: 'Test profile',
      skills: ['global/git-commit', 'code/frontend'],
    };

    expect(profile.name).toBe('test-profile');
    expect(profile.skills).toHaveLength(2);
    expect(profile.skills[0]).toBe('global/git-commit');
  });

  it('should support optional extends field', () => {
    const profile: Profile = {
      name: 'extended-profile',
      skills: ['global/docs'],
    };

    expect(profile.extends).toBeUndefined();
  });
});

describe('ValidationResult', () => {
  it('should represent a valid result', () => {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should represent an invalid result with errors', () => {
    const result: ValidationResult = {
      valid: false,
      errors: ['Missing name field'],
      warnings: ['No description provided'],
    };

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing name field');
    expect(result.warnings).toContain('No description provided');
  });
});

describe('SkillInfo', () => {
  it('should represent skill metadata', () => {
    const skill: SkillInfo = {
      path: '/skills/global/git-commit',
      category: 'global',
      name: 'git-commit',
      hasSkillMd: true,
    };

    expect(skill.category).toBe('global');
    expect(skill.hasSkillMd).toBe(true);
  });
});

describe('MaterializeResult', () => {
  it('should represent materialization output', () => {
    const result: MaterializeResult = {
      profile: 'default',
      generatedAt: '2026-05-15T00:00:00Z',
      skills: [
        {
          path: '/skills/global/git-commit',
          symlinkPath: '/target/git-commit',
          status: 'created',
        },
      ],
    };

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].status).toBe('created');
  });

  it('should support error status with message', () => {
    const result: MaterializeResult = {
      profile: 'default',
      generatedAt: '2026-05-15T00:00:00Z',
      skills: [
        {
          path: '/skills/global/broken',
          symlinkPath: '/target/broken',
          status: 'error',
          error: 'Symlink failed',
        },
      ],
    };

    expect(result.skills[0].error).toBe('Symlink failed');
  });
});

describe('ProjectActivationResult', () => {
  it('should represent project activation output', () => {
    const result: ProjectActivationResult = {
      projectPath: '/projects/my-app',
      profile: 'frontend',
      skills: [
        { name: 'react-helper', targetPath: '/target/react-helper', status: 'linked' },
        { name: 'skipped-skill', targetPath: '/target/skipped', status: 'skipped' },
      ],
    };

    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].status).toBe('linked');
  });
});

describe('SkillCategory', () => {
  it('should accept all valid categories', () => {
    const categories: SkillCategory[] = ['global', 'code', 'lifeos', 'inbox'];

    expect(categories).toHaveLength(4);
    expect(categories).toContain('global');
    expect(categories).toContain('code');
    expect(categories).toContain('lifeos');
    expect(categories).toContain('inbox');
  });
});

describe('InferenceRule', () => {
  it('should match pattern against profile', () => {
    const rule: InferenceRule = {
      pattern: /frontend-\w+/,
      profile: 'frontend',
    };

    expect(rule.pattern.test('frontend-react')).toBe(true);
    expect(rule.profile).toBe('frontend');
  });
});
