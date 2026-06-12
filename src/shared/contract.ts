import { z } from 'zod';

export const ProfileRecipeSchema = z.object({
  name: z.string().min(1),
  categories: z.array(z.string()).optional(),
  extras: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
});
export type ProfileRecipe = z.infer<typeof ProfileRecipeSchema>;

export const SkillCardSchema = z.object({
  ref: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  requiresBins: z.array(z.string()).optional(),
  inProfiles: z.array(z.string()),
});
export type SkillCard = z.infer<typeof SkillCardSchema>;

export const ProfileViewSchema = z.object({
  name: z.string(),
  categories: z.array(z.string()),
  extras: z.array(z.string()),
  excludes: z.array(z.string()),
  skills: z.array(z.string()),
  resolvedRefs: z.array(z.string()),
  skillCount: z.number(),
  boundPaths: z.array(z.string()),
});
export type ProfileView = z.infer<typeof ProfileViewSchema>;

export const CategoryViewSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  skillRefs: z.array(z.string()),
});
export type CategoryView = z.infer<typeof CategoryViewSchema>;

export const AppStateSchema = z.object({
  profiles: z.array(ProfileViewSchema),
  skills: z.array(SkillCardSchema),
  categories: z.array(CategoryViewSchema),
});
export type AppState = z.infer<typeof AppStateSchema>;

export const ApiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const SkillMarkdownSchema = z.object({ markdown: z.string() });
export type SkillMarkdown = z.infer<typeof SkillMarkdownSchema>;
