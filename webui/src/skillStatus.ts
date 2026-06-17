/**
 * A skill's "status" in the Terminal skin maps to scene membership: this app has
 * no per-skill enabled flag, so a skill is considered active when it appears in
 * at least one scene (profile). Used to drive the status dot (glowing accent vs muted).
 */
export const isSkillActive = (skill: { inProfiles: string[] }): boolean => skill.inProfiles.length > 0;
