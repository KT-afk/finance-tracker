## ADDED Requirements

### Requirement: All spending categories present in trend data are shown in the stacked bar
The `TREND_CATEGORIES` hardcoded constant (`['Food & Drink', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities', 'Entertainment']`) SHALL be removed from `app/insights/page.tsx`. Instead, the category list SHALL be derived dynamically from the API response at render time.

Derivation rule: collect all keys from `trendData` rows that are not `"month"`, then sort them by their summed total across all 6 months (descending). Render one `<Bar>` per derived category.

#### Scenario: Health and Subscriptions appear when the user has those transactions
- **WHEN** the API returns trend data that includes non-zero values for Health or Subscriptions
- **THEN** Health and Subscriptions SHALL each render as a distinct bar segment in the stacked chart, colored with their respective `CATEGORY_COLORS` values

#### Scenario: Empty categories are excluded
- **WHEN** a category has zero spend across all 6 months in the trend data
- **THEN** no `<Bar>` SHALL be rendered for that category (API returns no key for it)

#### Scenario: Order is by total spend descending
- **WHEN** the stacked bar renders with multiple categories
- **THEN** the category with the highest 6-month total SHALL be rendered as the first (bottom) bar in the stack, and the lowest as the last (top), so the most significant categories anchor the base

### Requirement: Rounded top corners always crown the topmost bar segment
The `<Bar>` component that renders last in the stack (topmost visually) SHALL receive `radius={[3, 3, 0, 0]}`. All other `<Bar>` components SHALL receive `radius={[0, 0, 0, 0]}`. Since the category list is now dynamic and sorted by ascending total (bottom to top), the last rendered `<Bar>` is always the lowest-total category.

#### Scenario: Correct rounding when the top bar changes
- **WHEN** the top category of the stack changes month to month (e.g. Subscriptions vs Others)
- **THEN** the visual rounding SHALL always appear at the very top of the stacked column, regardless of which category is on top

#### Scenario: Zero-height top bar does not show rounding
- **WHEN** the top bar has zero value for a given month
- **THEN** no rounded corners SHALL be visible on that month's column (nothing to round)

### Requirement: Stacked bar tooltip label matches color of other chart tooltips
The `<Tooltip>` on the stacked bar chart SHALL include `labelStyle={{ color: '#a1a1aa' }}` to render the month label in zinc-400, consistent with `CategoriesView.tsx` and the category detail page.

#### Scenario: Month label color in tooltip
- **WHEN** a user hovers over a stacked bar column
- **THEN** the month label at the top of the tooltip SHALL render in `#a1a1aa` (zinc-400), not the Recharts default white
