## Context

The app has three Recharts charts sharing one color map in `lib/display.ts`:
- **Donut** (`CategoriesView.tsx`): spending breakdown by category, current period
- **Stacked bar** (`app/insights/page.tsx`): 6-month category spend trend
- **Area/Line** (`app/insights/[category]/page.tsx`): 6-month trend for one category

Color changes in `CATEGORY_COLORS` propagate to all three charts, the rules badge tint, and the category color dot in the list — so the palette is a single-file change with wide visual impact.

The stacked bar's `TREND_CATEGORIES` constant is a hardcoded array of 6 strings inside `app/insights/page.tsx`. Trend data from the API already returns all categories; the frontend simply filters to those 6.

## Goals / Non-Goals

**Goals:**
- Fix the three orange-family collisions (Food & Drink ≈ Subscriptions ≈ Others)
- Resaturate Bills & Utilities so it reads clearly on OLED black
- Separate the Shopping/Personal violet pair to distinct hue families
- Thicken the donut ring for better slice legibility on small screens
- Show all spending categories in the stacked bar, not just 6
- Fix the stacked bar rounded-corner logic (should always crown the top bar)
- Add area fill + gradient to the category line chart
- Fix tooltip label color consistency across all charts

**Non-Goals:**
- Colorblind mode / pattern overlays (future work)
- Waffle chart replacement for donut
- Recharts version upgrade
- Any new API endpoints or DB schema changes
- Animation or transition effects beyond existing Recharts defaults

## Decisions

### D1: Color palette — full-wheel hue redistribution

**Decision**: Change six colors. Keep four that are working.

| Category | Old | New | Rationale |
|---|---|---|---|
| Food & Drink | `#F97316` | `#F97316` | Keep — orange is iconic, it's the anchor |
| Groceries | `#84CC16` | `#84CC16` | Keep — lime reads "fresh" |
| Transport | `#38BDF8` | `#38BDF8` | Keep — sky blue = movement |
| Entertainment | `#F472B6` | `#F472B6` | Keep — pink is distinct |
| Income | `#22C55E` | `#22C55E` | Keep — excluded from charts |
| Transfer | `#64748B` | `#64748B` | Keep — excluded from charts |
| **Subscriptions** | `#FB923C` | `#F43F5E` | Move from orange (30°) to crimson-rose (350°) — total hue escape from Food & Drink cluster |
| **Others** | `#F59E0B` | `#FBBF24` | Shift to amber-gold (45°), brighter and clearly distinct from crimson-rose |
| **Bills & Utilities** | `#94A3B8` | `#60A5FA` | Replace muted slate with cornflower blue — high saturation, clearly visible on OLED black |
| **Shopping** | `#C084FC` | `#E879F9` | Push to fuchsia (290°) to increase separation from Personal |
| **Personal** | `#A78BFA` | `#818CF8` | Move to indigo (239°) — 51° away from fuchsia Shopping |
| **Health** | `#34D399` | `#2DD4BF` | Shift to teal (178°) — more vivid on dark, distinct from lime Groceries |

**Alternative considered**: Assigning colors by data volume (most-spent = most prominent color). Rejected — categories are stable, colors should be semantic/memorable, not rank-dependent.

### D2: Donut ring geometry — thicker ring

**Decision**: `innerRadius={60}` (was 68), `outerRadius={100}` (was 96).

Ring thickness goes from 28px → 40px (43% increase). The center hole stays large enough for the two-line label. Small categories (<5%) get a wider arc, reducing the chance of invisible slivers on mobile.

**Alternative considered**: Remove innerRadius entirely (full pie). Rejected — the center label with grand total is a key UX element; removing the hole loses it.

### D3: Donut active slice — hover highlight

**Decision**: Track `activeIndex` state, use Recharts `activeShape` prop to render the active slice with `outerRadius={106}` (6px larger). Reset on mouse leave.

**Alternative considered**: Navigate immediately on click with no visual feedback. This is the current behaviour and feels broken on mobile — no confirmation before page transition.

### D4: Stacked bar — dynamic TREND_CATEGORIES

**Decision**: Remove the hardcoded `TREND_CATEGORIES` constant. Derive the category list from the API response: collect all keys from `trendData` rows (excluding `month`), sort by total spend descending across all 6 months, render a `Bar` for each.

The rounded-corner fix follows: apply `radius={[3, 3, 0, 0]}` only to the **last** Bar rendered (which will be the highest-total category), not always Entertainment.

**Alternative considered**: Keep 6 hardcoded but make them configurable via a UI toggle. Rejected as over-engineering — the right default is "show everything".

**Risk**: If a user has 10 active categories, the stacked bar legend gets long on mobile. Mitigation: the legend already wraps; no worse than today. We may revisit legend placement separately.

### D5: Category line chart — AreaChart with gradient

**Decision**: Replace `LineChart`/`Line` with `AreaChart`/`Area`. Add a `<defs>` block with a `LinearGradient` using the category color: `startOpacity={0.25}` at the top, `stopOpacity={0}` at the bottom. Set `fill="url(#areaGradient)"` on the Area.

Fix Y-axis: `domain={[0, 'auto']}` so the baseline is always zero, giving meaningful visual context for months with very low spend.

Height: increase from 180 → 200px to reduce cramping.

**Alternative considered**: Keep LineChart, just add `fill` to the Line. Not possible — Recharts Line does not support area fill; must use AreaChart + Area.

### D6: Tooltip consistency

**Decision**: Add `labelStyle={{ color: '#a1a1aa' }}` to the stacked bar `<Tooltip>` to match CategoriesView and category page tooltips. One-line change.

## Risks / Trade-offs

- **Colour memory**: Returning users will have memorised old colours (e.g. "orange = subscriptions"). Changing 6 colours at once may cause temporary confusion. → No mitigation; the old colours were wrong enough that the reset is worth it.
- **Dynamic TREND_CATEGORIES with many categories**: Legend could overflow on narrow screens. → Existing wrapping behaviour handles this; flag for future legend placement review.
- **AreaChart gradient id collision**: If two `<AreaChart>` components share the same gradient id (`areaGradient`), SVG defs can conflict. The category page renders only one chart, so no collision risk here. → Use a unique id per render: `areaGradient-${category}`.
