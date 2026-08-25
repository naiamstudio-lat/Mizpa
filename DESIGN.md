---
name: Void Cinematic
colors:
  primary: '#ffb1c4'
  on-primary: '#65002e'
  primary-container: '#ff4a8d'
  inverse-primary: '#ba005c'
  primary-fixed: '#ffd9e1'
  primary-fixed-dim: '#ffb1c4'
  on-primary-fixed: '#3f001a'
  on-primary-fixed-variant: '#8f0044'

  secondary: '#ffb4a8'
  on-secondary: '#690000'
  secondary-container: '#ce0301'
  on-secondary-container: '#ffdcd7'
  secondary-fixed: '#ffdad4'
  secondary-fixed-dim: '#ffb4a8'
  on-secondary-fixed: '#410000'
  on-secondary-fixed-variant: '#930000'

  tertiary: '#c6c6c7'
  on-tertiary: '#2f3131'
  tertiary-container: '#909191'
  on-tertiary-container: '#282a2a'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'

  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'

  background: '#000000'
  on-background: '#e2e2e2'
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1b'
  surface-container: '#1f1f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  surface-variant: '#353535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#e5bcc5'
  surface-tint: '#ffb1c4'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#303030'
  outline: '#ac878f'
  outline-variant: '#5c3f46'

typography:
  display-lg:
    fontFamily: Inter
    fontSize: 72px
    fontWeight: '500'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '500'
    lineHeight: '1.1'
  headline-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '400'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: -0.02em

rounded:
  DEFAULT: 0.125rem
  lg: 0.25rem
  xl: 0.5rem
  full: 0.75rem

spacing:
  grid-unit: 8px
  container-max: 1440px
  margin-desktop: 64px
  margin-mobile: 24px
  gutter: 24px
  section-gap: 128px
---

# Void Cinematic — Design System

## Brand & Style

This design system follows a **Void Cinematic** aesthetic — a fusion of **Minimalism** and **High-Tech Etherealism**. The interface is designed to recede into the background, allowing content to feel as if it's projected within a three-dimensional dark space.

The target audience is developers, AI researchers, and technical founders who value speed, clarity, and a sophisticated non-traditional professional environment.

Key visual pillars:
- **Floating Hierarchy:** Elements are anchored by typographic weight, light, and alignment — never by boxes or heavy borders.
- **Atmospheric Depth:** Subtle gradients, radial blurs, and glow effects create a sense of digital horizon.
- **Technical Rigor:** Monospaced accents, fine grid lines, and terminal-style labels signal a system that is constantly calculating.
- **Dark-First:** True black `#000000` background maximizes contrast and immersion. Surface colors follow Material Design 3 elevation tiers.

## Palette Notes

The palette follows Material Design 3's **tonal palette** structure but adapted for a dark-only presentation.

- **Primary (`#ffb1c4`)** — A soft, warm pink. Used for accents, active navigation, status dots, badge text, and the "energy" of the system. Not aggressive — more like a subtle glow on the void.
- **Primary Container (`#ff4a8d`)** — A more saturated hot pink. Used for glow effects (`bloom-primary`, `glow-primary`, `glow-neon-pink`), hover states, and as the bloom color behind elevated elements.
- **Secondary Container (`#ce0301`)** — Deep red. Used sparingly for the running dot in the status indicator.
- **On-Surface (`#e2e2e2`)** — Main text color. Warm off-white for comfortable reading on black.
- **On-Surface Variant (`#e5bcc5`)** — Muted pink-grey for secondary copy.
- **Tertiary (`#c6c6c7`)** — Light grey for metadata, nav items, secondary descriptions.
- **Surface Tint (`#ffb1c4`)** — Mirrors primary; used as the Material 3 "tint" color for elevation.
- **Background (`#000000`)** — True black for maximum contrast and the "void" effect.

All surface colors are dark greys that create subtle elevation hierarchy:
- `surface-container-lowest` (#0e0e0e) → barely distinguishable from black; used for overlays and drawers
- `surface-container-low` (#1b1b1b) → subtle card surface
- `surface-container` (#1f1f1f) → standard card background
- `surface-container-high` (#2a2a2a) → hover/elevated state
- `surface-container-highest` (#353535) → highest elevation surface

## Typography

The system pairs the humanist clarity of **Inter** with the technical precision of **JetBrains Mono**.

### Inter (Primary)

| Token | Size | Weight | Letter-Spacing | Use |
|---|---|---|---|---|
| `display-lg` | 72px | 500 | -0.04em | Desktop hero headline |
| `display-lg-mobile` | 40px | 500 | normal | Mobile hero headline |
| `headline-lg` | 48px | 500 | -0.02em | Section titles |
| `headline-sm` | 24px | 400 | -0.01em | Card titles, feature names |
| `body-md` | 16px | 400 | 0 | Body copy, buttons, nav links |

### JetBrains Mono (Secondary)

| Token | Size | Weight | Letter-Spacing | Use |
|---|---|---|---|---|
| `data-lg` | 32px | 500 | -0.02em | Numerical stats, key metrics |
| `label-mono` | 12px | 400 | 0.05em | Badges, labels, status text, footer links, terminal output, form placeholders |

### Usage Rules
- Headlines are always **Inter** with tight tracking for a compact-premium feel.
- JetBrains Mono is reserved for metadata, system labels, terminal output, and numerical data.
- Uppercase is used on **`label-mono`** sparingly — badges, status labels, terminal text.
- The `data-lg` token is used for stat values on the hero; labels under stats use `label-mono`.

## Layout & Spacing

### Grid System
No universal grid framework. Layout uses CSS Grid and Tailwind's grid utilities per section:
- **2-column grid:** Capabilities section (text + scanner visual)
- **3-column grid:** Features cards, Process steps
- **12-column grid:** Footer, Desktop CTAFinal (neural link section)
- **Single column, centered:** Hero, Quote, Pricing

### Container
- `max-w-container-max: 1440px` centered with auto margin
- Sections use `w-full max-w-container-max mx-auto` with horizontal padding

### Margins
| Breakpoint | Margin |
|---|---|
| Mobile (< 768px) | `margin-mobile: 24px` |
| Desktop (>= 768px) | `margin-desktop: 64px` |

### Vertical Rhythm
- `section-gap: 128px` between major sections
- `grid-unit: 8px` for fine-grained spacing
- `gutter: 24px` for grid column gaps

### Grid Overlay
A decorative background layer on the landing page:
- 1px white lines at 5% opacity
- 80px × 80px grid intervals
- Fixed position (`z-0`), pointer-events disabled
- Implemented via `.grid-overlay` CSS class using `linear-gradient`

## Elevation & Depth

This system rejects box-shadows. Depth is achieved through **luminance, bloom, and backdrop blur**.

- **Level 0 (Base):** Pure black `#000000`
- **Level 1 (Surface):** `surface-container-low` (#1b1b1b) for card-like areas; subtle 1px borders at `rgba(255,255,255,0.05)` to define clickable zones
- **Glow/Bloom:** Two glow utilities:
  - `.bloom-primary` → `box-shadow: 0 0 20px rgba(255, 74, 141, 0.4)` (used on mobile Hero CTA button, CTA form submit)
  - `.glow-primary` → `box-shadow: 0 0 20px rgba(255, 74, 141, 0.3), 0 0 40px rgba(255, 74, 141, 0.1)` (used on nav CTA button, Pricing CTA)
  - `.glow-neon-pink` → `box-shadow: 0 0 24px rgba(255, 74, 141, 0.4), 0 0 60px rgba(255, 74, 141, 0.1)` (used on Hero desktop "TRY NOW" button)
- **Backdrop Blur:** `backdrop-blur-xl` (24px) on navbar; `backdrop-blur-2xl` (40px) on mobile drawer
- **Ethereal Gradient:** `.ethereal-gradient` → `radial-gradient(circle at 50% 50%, rgba(255, 177, 196, 0.05), transparent 70%)` behind Quote section
- **Pricing Glow:** A `blur-[120px]` pink div behind the pricing card for atmospheric depth

## Shapes

Elements are predominantly **sharp** with subtle rounding to maintain a technical, engineered appearance.

- **DEFAULT:** `0.125rem` (2px) — subtle radius on general elements
- **`rounded-lg`:** `0.25rem` (4px) — buttons, inputs, cards, badges
- **`rounded-xl`:** `0.5rem` (8px) — the neural link orb in CTAFinal
- **`rounded-full`:** `0.75rem` (12px) — status dots, the large circular neural link container

Specific shape patterns:
- Status indicators: `rounded-full` with `w-2 h-2`
- Feature number badges: `border border-primary/20` with `px-3 py-1` and `rounded-lg`
- Feature images: `w-full h-48` with `border border-white/5`
- Section borders: `border-y border-white/10` for Quote, `border-t border-white/5` for CTAFinal desktop

## Components

### Navbar
- Fixed top, `z-50`, `bg-background/80 backdrop-blur-xl`
- Height: `h-20` (80px)
- 64px side margins on desktop, 24px on mobile
- Brand: "Mizpa" in uppercase Inter, 24px, `font-extrabold`, next to `label-mono` badge
- Nav links: Inter 16px, `text-primary` for active, `text-on-surface-variant` for inactive
- CTA button: `bg-primary text-on-primary rounded-lg` with `.glow-primary` on hover
- Mobile drawer: 320px wide, from right, `bg-surface-container-lowest/95 backdrop-blur-2xl`, nav links with Material Symbols icons

### Hero
- Full viewport (`min-h-[95vh]`), `bg-[#000000]`, relative positioning
- **Background image:** Full-bleed `object-cover` with `object-position: right center`, `mix-blend-screen` on mobile, `mix-blend-normal` on desktop, parallax scroll via JS (`translateY(scroll * 0.15)`)
- **Mobile layout** (`md:hidden`): Centered, stacked. Badge `label-mono` → H1 `display-lg-mobile` → input + button → 3 stats (horizontal) → scroll indicator (line + text)
- **Desktop layout** (`hidden md:flex`): Left-aligned, horizontal line + badge → H1 `display-lg` (72px) → description paragraph → input with `public` icon + "TRY NOW" button → 3 stats
- Stats use `data-lg` for values, `label-mono` for labels
- CTA buttons: mobile uses `bg-white text-black bloom-primary`, desktop uses `bg-on-surface text-background glow-neon-pink`

### Capabilities
- 2-column grid: text left, scanner visual right
- Left: `label-mono` section label → `headline-lg` title → description paragraph → bullet list with primary pulse dot on first item
- Right: Aspect-square terminal visual with crosshair (corner brackets, center lines), terminal text in `label-mono` showing SCANNING_MODULE_ACTIVE output

### Features
- 3-column card grid
- Each card: `bg-surface-container/20 border border-white/5` → large transparent number (corners) → monospace number badge → Inter headline → description → grayscale image that desaturates-to-color on group hover
- Float number: 120px, `opacity-[0.03]`, top-right corner

### Process
- Centered single-column header: `label-mono` label + `headline-lg` title + description
- 3-column step grid below
- Each step: 01/02/03 badge in `border-primary/20` → step title → description
- Clean, minimal — no card backgrounds, just text hierarchy

### Quote
- `h-[60vh]` section, `border-y border-white/10`
- `.ethereal-gradient` background (radial pink glow)
- Centered italic headline quote → `w-24 h-px bg-primary` divider → monospace author attribution

### Pricing
- Centered, relative, `overflow-hidden`
- Large blur ellipse (`bg-primary/5 blur-[120px]`) behind the card
- `label-mono` label → `headline-lg` title → large price number (`display-lg`) → period label → feature list with `check_circle` Material Symbols → CTA button
- Feature items separated by `border-b border-white/5`

### CTAFinal
- **Mobile:** Centered form with input + `bloom-primary` button + terms text
- **Desktop** (`hidden md:block`): 12-column grid. Left: `headline-lg` italic title + description. Right: circular neural link orb (300px, dashed spinning border, `bg-surface-container-low`, hover bloom effect)
- Has `border-t border-white/5`

### Footer
- 12-column grid
- Brand column: "Mizpa Next Gen" + tagline + copyright + "Product of Naiam Studio"
- RESOURCES column: API Docs, System Status, Whitepaper
- LEGAL column: Privacy Policy, Terms of Service
- Right side: Node status indicator (`NODE_01_ACTIVE` with `.pulse-red` dot)
- Social icons row at bottom

## Interactive States

### Buttons
- **Primary CTA:** `bg-primary text-on-primary` → `hover:glow-primary` → `hover:-translate-y-0.5 active:scale-95`
- **Desktop Hero CTA:** `bg-on-surface text-background` → `hover:glow-neon-pink` → `hover:-translate-y-1`
- **Mobile Hero CTA:** `bg-white text-black` → `hover:bloom-primary hover:scale-105`
- **Ghost nav:** `text-tertiary` → `hover:text-on-surface`
- **Pricing CTA:** `bg-primary text-on-primary rounded-lg` → `hover:glow-primary`

### Inputs
- Default: `border border-white/10` → focus: `focus:border-primary focus:outline-none`
- Monospace text inside, no labels — placeholders only
- Some inputs have Material Symbols icons (left) and `[0x001]` codes (right)

### Links
- Body color `text-on-surface-variant` → `hover:text-primary` with `transition-colors duration-300`
- Active nav link: `text-primary font-bold`

### Images
- Feature cards: grayscale → full color on group hover (`group-hover:grayscale-0 transition-all duration-700`)
- Hero background: `opacity-60 md:opacity-80` with scroll-based parallax

### Navigation Links

- **Desktop Nav:** Logo with `TECHNICAL SEO` badge → 4 links (Capabilities, Process, Infrastructure, Security) → Sign In + Start Audit CTA
- **Mobile Drawer:** Slide-in from right with `backdrop-blur-2xl`. Links have Material Symbol icons, active item has right border accent (`border-r-2 border-primary`). Close button top-right.

## Animations & Effects

| Class/Pattern | Effect | Duration |
|---|---|---|
| `.glow-primary` | Pink outer glow on hover | 300ms |
| `.glow-neon-pink` | Stronger pink glow on hover | 300ms |
| `.bloom-primary` | Soft pink glow on hover | 300ms (opacity) |
| `hover:-translate-y-1` | Lift on hover | 300ms |
| `active:scale-95` | Press feedback | instant |
| `hover:scale-105` | Scale up on hover | 300ms |
| `transition-all duration-300` | Standard transition | 300ms |
| `.animate-pulse` | CSS pulse on status dots | 2s infinite |
| `.pulse-red` | Red pulse animation (footer status) | 2s infinite |
| `animate-[spin_20s_linear_infinite]` | Neural link spinning border | 20s linear infinite |
| `transition-all duration-700` | Image grayscale→color | 700ms |
| Hero parallax | JS-driven `translateY(scroll * 0.15)` | scroll |
| Drawer slide | `translate-x-0` / `translate-x-full` | 300ms ease-in-out |
| `blur-[120px]` | Pricing section glow | static |
| `.ethereal-gradient` | Radial pink gradient | static |

## Selection & Scrollbar

- **Selection:** `background-color: #ffb1c4` with `color: #65002e`
- **Scrollbar:** 4px width, black track, `#353535` thumb (surface-container-highest)
- **Scroll behavior:** `scroll-behavior: smooth` on `<html>`

## Breakpoints (via Tailwind)

| Alias | Min-Width | Behavior |
|---|---|---|
| `md:` | 768px | Desktop layout activates |
| `lg:` | 1024px | Sign In button visible |
| Default | < 768px | Mobile layout |
