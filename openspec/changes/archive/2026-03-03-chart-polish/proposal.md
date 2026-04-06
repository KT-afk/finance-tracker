## Why

The three Recharts charts in the app (donut, stacked bar, category line) share a color palette with three perceptual collisions — Food & Drink, Subscriptions, and Others are nearly identical warm oranges — and Bills & Utilities is too desaturated to read on OLED black. The stacked bar hardcodes only 6 of 10 spending categories, silently hiding Health, Subscriptions, Personal, and Others from the trend view. The line chart lacks an area fill and has a cramped zero-based Y domain. These issues compound: a user cannot reliably distinguish categories at a glance in any of the three charts.

## What Changes

- **Category color palette**: redistribute hues across the full 360° wheel — fix the orange cluster (Subscriptions, Others), resaturate Bills & Utilities, separate Shopping/Personal purples
- **Donut chart ring**: thicken the ring (innerRadius 68→60, outerRadius 96→100) and add an active-slice highlight on hover/tap
- **Stacked bar categories**: make `TREND_CATEGORIES` dynamic — show all categories present in the actual trend data instead of a hardcoded 6-item list; fix the rounded-top-corner logic so it always applies to whichever bar is on top of the stack
- **Category line chart**: convert to AreaChart with a gradient fill at 20% opacity of the category color; fix Y-axis domain to start at 0 with `domain={[0, 'auto']}`
- **Tooltip consistency**: add `labelStyle: { color: '#a1a1aa' }` to the stacked bar tooltip to match the other two charts

## Capabilities

### New Capabilities
- `color-palette`: Updated `CATEGORY_COLORS` in `lib/display.ts` — new hex values for Subscriptions, Others, Bills & Utilities, Shopping, Personal, Health; all other categories unchanged
- `donut-chart-polish`: Thicker ring geometry, active slice highlight state in `CategoriesView.tsx`
- `stacked-bar-polish`: Dynamic category list and correct rounded-corner logic in `app/insights/page.tsx`
- `line-chart-polish`: Area fill with gradient, corrected Y-axis domain in `app/insights/[category]/page.tsx`

### Modified Capabilities

## Impact

- `lib/display.ts` — `CATEGORY_COLORS` values change; affects all three chart files and the rules badge in `CategoriesView.tsx`
- `components/CategoriesView.tsx` — donut geometry + active slice state
- `app/insights/page.tsx` — dynamic TREND_CATEGORIES, rounded-corner fix, tooltip labelStyle
- `app/insights/[category]/page.tsx` — LineChart → AreaChart, gradient, Y-axis domain
- No API changes, no DB changes, no new dependencies (Recharts `Area` is already in the package)
