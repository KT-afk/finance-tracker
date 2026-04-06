## ADDED Requirements

### Requirement: Category trend chart uses AreaChart with a gradient fill
The `LineChart` and `Line` in `app/insights/[category]/page.tsx` SHALL be replaced with `AreaChart` and `Area` from Recharts. A `<defs>` block SHALL define a `LinearGradient` with id `areaGradient-${encodedCategory}` (unique per page render, avoiding SVG id collisions). The gradient SHALL go from `startOpacity={0.25}` at `y="0%"` to `stopOpacity={0}` at `y="100%"`, using the category color as the stop color.

The `Area` component SHALL use:
- `type="monotone"`
- `dataKey="total"`
- `stroke={color}` at `strokeWidth={2}`
- `fill="url(#areaGradient-${encodedCategory})"`
- Dot resting: `fill: color, r: 3, strokeWidth: 0`
- Dot active: `fill: color, r: 5, strokeWidth: 0`

`AreaChart` and `Area` SHALL be imported from `recharts`. `LineChart` and `Line` imports SHALL be removed.

#### Scenario: Area fill appears under the trend line
- **WHEN** the category detail page renders with 6 months of data
- **THEN** a gradient fill SHALL appear between the trend line and the X-axis, fading from 25% opacity of the category color at the top to transparent at the bottom

#### Scenario: Gradient id is unique per category
- **WHEN** a user navigates between two different category detail pages in the same session
- **THEN** each page's gradient SHALL use a distinct SVG id (`areaGradient-Food%20%26%20Drink` vs `areaGradient-Transport`) so they do not conflict

### Requirement: Y-axis starts at zero and chart height is 200px
The `AreaChart` SHALL use `domain={[0, 'auto']}` on the `YAxis` to always baseline at zero. The `ResponsiveContainer` height SHALL be `200` (was `180`).

#### Scenario: Low-variance month data is readable
- **WHEN** all 6 months have values between $200–$250 (tight range)
- **THEN** the Y-axis SHALL start at 0 so the chart shows the true scale rather than amplifying minor variance

#### Scenario: Chart is not cramped on mobile
- **WHEN** the category detail page renders on a 375px-wide screen
- **THEN** the chart area SHALL have at least 150px of vertical drawing space after accounting for axis labels
