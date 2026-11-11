# DESIGN.md — Look & Feel

## 1. Design Philosophy

- **Atmosphere:** Calm, precise, understated, trustworthy—reminiscent of a specialized document editor, an engineer's workbench, or an archival tool.
- **Identity Anti-Pattern:** It must **NOT** look like a generic, flashy AI-generated dashboard. No purple-to-blue gradients, no neon halos, no faux-futuristic visual gimmicks.
- **Copy Tone:** Honest, factual, direct, concise. Never use hype words ("supercharge", "effortless", "magical"). Never claim to bypass AI limits or quotas.

## 2. Color System & Palettes

The UI is **dark-first** with a first-class **light theme**. All color tokens must be declared as CSS custom variables and integrated into Tailwind's theme configuration.

### Dark Theme (Default)

| Role | Hex | Tailwind Token | Usage |
| :--- | :--- | :--- | :--- |
| **Background** | `#0E1116` | `bg-app` | Canvas / primary viewport background |
| **Surface** | `#161B22` | `bg-surface` | Cards, panels, sidebar, dialog bodies |
| **Border** | `#2A313C` | `border-subtle` | Structural 1px separation lines |
| **Text Primary** | `#E6EDF3` | `text-primary` | Headings, primary readable content |
| **Text Muted** | `#8B949E` | `text-muted` | Secondary details, timestamps, helper text |
| **Accent (Brass)** | `#C9A227` | `accent-brass` | Used sparingly: primary CTA, active tabs, readiness ring |
| **Accent Contrast** | `#000000` | `accent-brass-contrast` | Text/icon contrast color on brass CTA backgrounds (black in dark) |
| **Success** | `#3FB950` | `color-success` | Validated states, completed tasks, readiness pass |
| **Warning** | `#D29922` | `color-warning` | Scanner alerts, token limit warnings, review notices |
| **Danger** | `#F85149` | `color-danger` | Hard-blocked files, active bugs, destructive actions |

### Light Theme

| Role | Hex | Tailwind Token | Usage |
| :--- | :--- | :--- | :--- |
| **Background** | `#F6F8FA` | `bg-app` | Canvas / viewport background |
| **Surface** | `#FFFFFF` | `bg-surface` | Cards, dialogs, inputs, panels |
| **Border** | `#D0D7DE` | `border-subtle` | Structural 1px separation lines |
| **Text Primary** | `#1F2328` | `text-primary` | Headings, primary body text |
| **Text Muted** | `#656D76` | `text-muted` | Labels, timestamps, secondary notes |
| **Accent (Brass)** | `#745706` | `accent-brass` | Primary CTA, active tabs, readiness ring (tuned for WCAG AA contrast) |
| **Accent Contrast** | `#FFFFFF` | `accent-brass-contrast` | Text/icon contrast color on brass CTA backgrounds (white in light) |
| **Success** | `#1A7F37` | `color-success` | Validated badges, successful checks |
| **Warning** | `#9A6700` | `color-warning` | Budget warnings, warnings needing review |
| **Danger** | `#CF222E` | `color-danger` | Unresolved secrets, errors, destructive alerts |

*Strict Rule:* The brass accent must be used with restraint. It should denote focus or completion—never painted across wide decorative surfaces. At most one brass primary action should be visible per screen region; list "Add" buttons, filters, and standard secondary actions must use secondary or outline button styles so user attention remains focused on the primary intent.

## 3. Typography & Scale

- **UI Font:** `Inter` (via `@fontsource/inter`) for all general user interface elements, headings, body text, and controls.
- **Monospace Font:** `JetBrains Mono` (via `@fontsource/jetbrains-mono`) for code snippets, JSON payloads, file paths, token estimates, diffs, and stamp badges.

### Typographic Scale

| Size | Class | Application |
| :--- | :--- | :--- |
| **12px** | `text-xs` | Badges, timestamps, token estimates, metadata tags |
| **14px** | `text-sm` | Default body copy, table cells, form inputs, button labels |
| **16px** | `text-base` | Section titles, emphasized list items, modal headers |
| **20px** | `text-xl` | Screen titles, card group headers |
| **28px** | `text-2xl` | Project title, high-level screen headings |

## 4. Spacing, Borders & Radius

- **Border Width:** Uniform `1px` borders throughout (`border border-subtle`). Avoid thick borders.
- **Corner Radius:** Strict `8px` (`rounded-lg` in Tailwind) for cards, dialogs, inputs, and buttons. Stamp badges use `4px` (`rounded-sm`).
- **Layout Spacing:** Generous whitespace. Padding within panels should be `16px` to `24px` (`p-4` or `p-6`). Dense lists use `gap-2` (`8px`).

## 5. Visual Motif: Stamp Badges

- Checkpoints, statuses, and handoff destinations are rendered as **"stamp" badges**.
- **Style:** Small, compact, monospace text, rounded rectangle with a subtle 1px border.
- **Example:** `[v1.0.4 • CKPT]`, `In progress`, `[DEST: CLAUDE]`.
- Status stamps use sentence-case human labels without prefixes or underscores (e.g. `Idea`, `In progress`, `Paused`, `Done`), while system stamps use compact uppercase badges.
- Conveys archival precision and system provenance.

## 6. Forbidden Aesthetic Patterns

The following design treatments are **strictly forbidden**:
- Gradient blobs or animated atmospheric background colors.
- Glassmorphism (blur backgrounds, semi-transparent frosted panels).
- Neon glows, drop shadows with high blur, or pulsating rings.
- Emojis used as system UI icons (use `lucide-react` line icons exclusively).
- Stock hero illustrations, 3D clay figures, or robotic mascot graphics.
- Purple-to-blue gradient fills on buttons or headers.
- Centered marketing hero banners featuring three identical feature cards.

## 7. Component Library Requirements

Components must be designed once as pure, reusable UI primitives in `src/ui/`:
- **Button:** Variants (`primary` [brass], `secondary`, `outline`, `ghost`, `danger`). Explicit loading and disabled states.
- **Card:** Clean surface with 1px border, optional header and footer dividers.
- **Dialog / Modal:** Accessible dialog with clear dismiss action, keyboard escape, and backdrop.
- **Tabs:** Accessible tab list with understated brass underline indicator for active tab.
- **Input & Textarea:** Monospace or sans based on context, clear focus rings, integrated field errors.
- **Badge:** Stamp badge styling with semantic color variants.
- **EmptyState:** Clean icon, concise statement of missing data, and primary action button.
- **Compact Empty State:** In dense list sections and editor item groups, empty states use a compact single-line pattern: one line of muted text (e.g. "No completed items yet") paired with a small secondary "Add..." button. No large dashed cards or big icons.
- **Toast:** Non-intrusive notifications for copy-to-clipboard, saves, and non-blocking warnings.
- **ProgressRing:** SVG-based circular indicator representing the 0–100 Readiness Score.
- **No Hover-Only UI:** Critical actions, tooltips, or details must never rely on mouse hover. All interactive details must be accessible via keyboard focus or explicit taps.

## 8. Screen States

Every view or functional module must define three mandatory states:
1. **Empty State:** Explains what belongs here and offers an immediate first action (e.g. "No tasks yet. Add your first task or paste an AI conversation").
2. **Loading State:** Clean skeleton or subtle spinner indicator without jarring layout shifts.
3. **Error State:** Plain-language diagnosis with an unambiguous recovery step (e.g. "We couldn't read this export format. View format diagnostics").
