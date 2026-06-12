# Web UI — Claude Desktop Re-skin (Light + Dark)

Date: 2026-06-12
Status: Approved (design), pending implementation plan

## Goal

Upgrade the `webui/` app's visual design to match the **Claude desktop aesthetic** —
warm neutral backgrounds, restrained terracotta accent, soft rounded corners,
generous whitespace, serif headings — while **keeping the existing layout
structure unchanged** (top header + scenes/catalog tabs + search). Ship **both
light and dark themes** with a toggle.

This is a **re-skin only**: no layout restructure, no behavioral/data changes
beyond the new theme-toggle logic.

## Approach

**Chosen: keep the existing CSS-variable architecture (Approach A).**

Components already consistently reference colors via `var(--mx-*)` arbitrary
Tailwind values (e.g. `bg-[var(--mx-surface)]`). So the re-skin is:

1. Redefine the `--mx-*` palette to Claude's warm tones (light values).
2. Add a `[data-theme="dark"]` override block in `index.css` with dark values.
3. Add a theme toggle in the header (localStorage persistence + system-preference
   fallback), applied via `data-theme` on `<html>`.

Rejected:
- **B (Tailwind `dark:` variants):** requires touching every component to add
  `dark:` classes and rewriting color classes — churn contradicts "re-skin only".
- **C (Tailwind `@theme` semantic tokens):** cleaner long-term but requires
  rewriting all class strings — too much churn for this scope.

## Design Details

### 1. Palette (Claude warm tones)

| Token | Light | Dark |
|---|---|---|
| `--mx-bg` (page) | `#f5f4ef` | `#262624` |
| `--mx-surface` (card) | `#ffffff` | `#30302e` |
| `--mx-surface-hover` *(new)* | `#faf9f5` | `#383735` |
| `--mx-border` | `#e8e5dd` | `#403e3a` |
| `--mx-text` | `#2b2a28` | `#f0eee6` |
| `--mx-muted` | `#8a857c` | `#a39e94` |
| `--mx-primary` | `#c96442` (terracotta) | `#d97757` |
| `--mx-primary-soft` | `#f6ece8` | `#3a2f2a` |

Replacing the current blue `#2f6df6` with Claude's terracotta is the single most
important change for "desktop style".

### 2. Status / semantic tokens (new — required for dark mode)

Currently hardcoded colors break in dark mode. Replace with variables:

| Hardcoded today | New token | Light | Dark |
|---|---|---|---|
| `bg-red-50` / `text-red-700` | `--mx-danger-soft` / `--mx-danger` | `#fdecea` / `#b3261e` | `#3a2723` / `#f2998c` |
| `bg-amber-50` / `text-amber-700` | `--mx-warning-soft` / `--mx-warning` | `#fdf3e3` / `#9a6b18` | `#3a3122` / `#e0b766` |
| `text-black` (catalog section h3) | use `--mx-text` | — | — |
| `bg-black/30`, `bg-black/20` (overlays) | `--mx-overlay` | `rgba(35,33,30,0.3)` | `rgba(0,0,0,0.55)` |

This is the only place component class strings change.

### 3. Typography

- Headings (`h1` "Spells", catalog section titles, drawer/dialog titles) →
  serif: `ui-serif, Georgia, "Times New Roman", serif`.
- Body / controls → keep current system sans-serif stack.

### 4. Polish

- Softer shadows: lower the `--mx-shadow` opacity for a calmer feel; define a
  dark-mode shadow variant.
- Hover: cards/buttons use `--mx-surface-hover` background instead of (or in
  addition to) border-color change.
- Keep `--mx-radius` (14px); ensure consistent `transition` ~150ms on
  interactive elements.

### 5. Theme toggle

- Header right side: a sun/moon icon button.
- New pure module `webui/src/theme.ts` (mirrors the `searchShortcut.ts` pattern):
  - `resolveInitialTheme(stored, systemPrefersDark): 'light' | 'dark'`
    — stored value wins; else fall back to system preference.
  - `nextTheme(current): 'light' | 'dark'` — toggle helper.
  - `THEME_STORAGE_KEY` constant.
- `main.tsx` (or App): on startup read `localStorage[THEME_STORAGE_KEY]` +
  `window.matchMedia('(prefers-color-scheme: dark)')`, call
  `resolveInitialTheme`, set `document.documentElement.dataset.theme`.
- Toggle writes both `document.documentElement.dataset.theme` and localStorage.
- **Default when nothing stored: follow system preference.**

### 6. Components touched

- `index.css` — palette, dark block, status/overlay tokens, shadow, base body.
- `App.tsx` — header serif h1, theme toggle button + wiring.
- `main.tsx` — apply initial theme before render (avoid flash).
- `CatalogView.tsx` — section h3 (`text-black`→token, serif), overlay, dialog.
- `SkillCard.tsx`, `ProfileCard.tsx`, `SkillDrawer.tsx`, `RecipeEditor.tsx`,
  `ResolvePreview.tsx`, `ScenesView.tsx` — swap hardcoded red/amber/black to
  the new tokens; apply serif to titles where relevant; hover polish.

## Testing / TDD boundary

Per project CLAUDE.md: pure visual changes (CSS variables, Tailwind classes) are
**exempt** from unit tests — rely on diff review + visual verification.

The **theme logic is real logic** and follows TDD (Red→Green→Refactor):

- New test file `__tests__/web/theme.test.ts` covering `webui/src/theme.ts`:
  - `resolveInitialTheme`: stored 'dark' wins over system light; stored 'light'
    wins over system dark; no stored + system dark → 'dark'; no stored + system
    light → 'light'; invalid stored value → falls back to system.
  - `nextTheme`: 'light'→'dark', 'dark'→'light'.
- Write these tests first (fail), then implement `theme.ts`, then wire UI.

## Verification

- `npm test` green (theme tests + existing suite).
- `npm run web:build` succeeds (tsc clean).
- Visual check via `npm run web:dev`: light + dark both render correctly across
  scenes view, catalog view, skill drawer, move dialog, empty/error states; no
  hardcoded color leaks in dark mode; no theme flash on load.

## Out of scope

- Layout restructure (sidebar nav, etc.).
- New features or data/API changes.
- Component behavior changes beyond theme toggle.
