## ADDED Requirements

### Requirement: Donut ring is thick enough for small-category slices to be legible
The `Pie` component in `CategoriesView.tsx` SHALL use `innerRadius={60}` and `outerRadius={100}`, giving a ring thickness of 40px. The previous values of `innerRadius={68}` and `outerRadius={96}` (28px ring) are replaced.

#### Scenario: Small category slice is visible
- **WHEN** a category represents less than 5% of total spend
- **THEN** its arc SHALL be at least 40px wide (radially) and clearly visible without zooming

#### Scenario: Center hole remains large enough for label
- **WHEN** the donut renders at any viewport width ≥ 320px
- **THEN** the two-line center label ("Total spend" + grand total amount) SHALL fit inside the hole without overlapping any slice

### Requirement: Active slice is visually highlighted on hover and tap
The `Pie` component SHALL render an active shape when a slice is hovered (desktop) or tapped (mobile). The active shape SHALL use `outerRadius={108}` (8px larger than the resting `outerRadius={100}`). The active shape SHALL be implemented via the Recharts `activeShape` prop with a custom render function using `Sector`.

`activeIndex` state SHALL be tracked in the component. The `Pie` component SHALL set `activeIndex={activeIndex}` and handle `onMouseEnter` (set index), `onMouseLeave` (clear index), and `onClick` (navigate).

#### Scenario: Hover highlights a slice on desktop
- **WHEN** a user hovers over a donut slice on a pointer device
- **THEN** that slice's outer radius SHALL expand by 8px and all other slices SHALL remain at their resting size

#### Scenario: Tap highlights slice briefly on mobile
- **WHEN** a user taps a donut slice on a touch device
- **THEN** the active shape SHALL render momentarily before navigation to `/insights/[category]`

#### Scenario: No slice is highlighted by default
- **WHEN** the donut first renders with no user interaction
- **THEN** no slice SHALL be in the active/expanded state
