export class SyncSpellsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncSpellsError';
  }
}

export class ProfileNotFoundError extends SyncSpellsError {
  constructor(
    public profileName: string,
    public suggestions: string[] = []
  ) {
    super(`Profile not found: ${profileName}`);
    this.name = 'ProfileNotFoundError';
  }

  formatMessage(): string {
    let msg = `❌ Error: Profile "${this.profileName}" not found\n`;
    if (this.suggestions.length > 0) {
      msg += `\n💡 Suggestion:\n`;
      msg += `   Did you mean one of these?\n`;
      this.suggestions.forEach(s => {
        msg += `   - ${s}\n`;
      });
    }
    msg += `\n   Run 'spells profiles list' to see available profiles.\n`;
    return msg;
  }
}

export class SkillNotFoundError extends SyncSpellsError {
  constructor(
    public skillPath: string,
    public profileName: string
  ) {
    super(`Skill not found: ${skillPath}`);
    this.name = 'SkillNotFoundError';
  }

  formatMessage(): string {
    return `❌ Error: Skill "${this.skillPath}" not found in registry\n` +
           `   Required by profile: ${this.profileName}\n\n` +
           `💡 Suggestion:\n` +
           `   1. Add the skill to registry: spells skill new ${this.skillPath}\n` +
           `   2. Or remove from profile: spells profiles edit ${this.profileName}\n`;
  }
}

export class BrokenSymlinkError extends SyncSpellsError {
  constructor(
    public linkPath: string,
    public expectedTarget: string,
    public actualTarget?: string
  ) {
    super(`Broken symlink detected: ${linkPath}`);
    this.name = 'BrokenSymlinkError';
  }

  formatMessage(): string {
    let msg = `❌ Error: Broken symlink detected\n`;
    msg += `   Path: ${this.linkPath}\n`;
    msg += `   Expected: ${this.expectedTarget}\n`;
    if (this.actualTarget) {
      msg += `   Actual: ${this.actualTarget}\n`;
    }
    msg += `\n💡 Suggestion: Run 'spells doctor --fix' to auto-repair\n`;
    msg += `   Or manually remove: rm ${this.linkPath}\n`;
    return msg;
  }
}
