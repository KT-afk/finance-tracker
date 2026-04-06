## ADDED Requirements

### Requirement: Category colors span the full hue wheel with no perceptual collisions
`CATEGORY_COLORS` in `lib/display.ts` SHALL use the following exact hex values. No two spending categories (excluding Transfer and Income) SHALL share the same hue family (within ±20° on the HSL wheel).

| Category | Hex | Notes |
|---|---|---|
| Food & Drink | `#F97316` | Unchanged |
| Groceries | `#84CC16` | Unchanged |
| Transport | `#38BDF8` | Unchanged |
| Entertainment | `#F472B6` | Unchanged |
| Income | `#22C55E` | Unchanged |
| Transfer | `#64748B` | Unchanged |
| Subscriptions | `#F43F5E` | Changed from `#FB923C` — crimson-rose, hue ~350° |
| Others | `#FBBF24` | Changed from `#F59E0B` — amber-gold, hue ~45° |
| Bills & Utilities | `#60A5FA` | Changed from `#94A3B8` — cornflower blue, high saturation |
| Shopping | `#E879F9` | Changed from `#C084FC` — fuchsia, hue ~290° |
| Personal | `#818CF8` | Changed from `#A78BFA` — indigo, hue ~239° |
| Health | `#2DD4BF` | Changed from `#34D399` — teal, hue ~178° |

#### Scenario: No orange cluster in donut chart
- **WHEN** a user has Food & Drink, Subscriptions, and Others all in the same period
- **THEN** each category slice SHALL render in a visually distinct color (orange, crimson, amber-gold) with no two slices appearing the same hue to a typical viewer

#### Scenario: Bills & Utilities readable on OLED black
- **WHEN** Bills & Utilities appears as a donut slice or stacked bar segment on a pure black background
- **THEN** its slice/bar SHALL be clearly distinguishable from the background with high saturation

#### Scenario: Shopping and Personal are distinct
- **WHEN** both Shopping and Personal appear in the same chart
- **THEN** their colors SHALL appear as clearly different hues (fuchsia vs indigo) to a typical viewer

#### Scenario: Color map is the single source of truth
- **WHEN** `CATEGORY_COLORS` is updated in `lib/display.ts`
- **THEN** all three charts (donut, stacked bar, category line), the rules badge tint, and the category dot in the list SHALL automatically use the new values with no other file changes required
