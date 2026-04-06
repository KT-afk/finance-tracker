## NEW Requirements

### Requirement: View toggle on Insights page
The system SHALL render a segmented control at the top of the Insights page with two options: "Overview" and "Categories". The default active view SHALL be "Overview". Switching views SHALL show/hide content without a page navigation.

#### Scenario: Default view
- **WHEN** user navigates to `/insights`
- **THEN** the "Overview" tab SHALL be active and existing chart/table content SHALL be visible

#### Scenario: Switch to Categories
- **WHEN** user taps "Categories"
- **THEN** the Overview content SHALL be hidden and the CategoriesView SHALL be shown

### Requirement: Period and bank pickers
The CategoriesView SHALL render a period picker and a bank picker above the chart. Both pickers SHALL control the chart and category list simultaneously.

#### Scenario: Period picker options
- **WHEN** the period picker is rendered
- **THEN** it SHALL show: "This month", "Last month", "2 months ago", "3 months ago", "All time"
- **AND** the default SHALL be "This month"

#### Scenario: Bank picker options
- **WHEN** the bank picker is rendered
- **THEN** it SHALL show: "All banks", "OCBC", "DBS", "UOB", "Trust"
- **AND** the default SHALL be "All banks"

### Requirement: Donut pie chart
The CategoriesView SHALL render a Recharts PieChart with `innerRadius` (donut shape). The center of the donut SHALL display the grand total spend as formatted SGD.

#### Scenario: Chart renders with data
- **WHEN** the API returns category data
- **THEN** each category SHALL be rendered as a slice using its color from `CATEGORY_COLORS`
- **AND** clicking a slice SHALL navigate to `/insights/[category]`

#### Scenario: Empty state
- **WHEN** the API returns `grandTotal: 0`
- **THEN** a message "No spending data for this period" SHALL be shown instead of the chart

### Requirement: Category list
Below the chart, a list of all expense categories for the selected period/bank SHALL be rendered, sorted by total spend descending.

#### Scenario: Category row
- **WHEN** categories are rendered
- **THEN** each row SHALL show: a color dot (category color), category name, total spend (formatted SGD), and percentage of total
- **AND** clicking a row SHALL navigate to `/insights/[category]`

### Requirement: Rules manager
Below the category list, the CategoriesView SHALL render a rules section showing all saved categorisation keyword rules with the ability to delete or add rules.

#### Scenario: Rules list renders
- **WHEN** rules exist
- **THEN** each rule SHALL show the keyword and a category badge (using category color)
- **AND** a delete button SHALL be present on each rule

#### Scenario: Delete rule
- **WHEN** user taps delete on a rule
- **THEN** `DELETE /api/rules/[id]` SHALL be called and the rule SHALL be removed from the list

#### Scenario: Add rule form
- **WHEN** user types a keyword in the input and selects a category from the dropdown and taps "Add"
- **THEN** `POST /api/rules` SHALL be called and the new rule SHALL appear in the list

#### Scenario: Add form validation
- **WHEN** user taps "Add" with an empty keyword
- **THEN** the form SHALL not submit and SHALL show an inline error
