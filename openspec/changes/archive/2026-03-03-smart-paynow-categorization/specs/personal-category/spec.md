## ADDED Requirements

### Requirement: Personal is a valid category
The system SHALL include `Personal` in the `CATEGORIES` enum in `lib/schema.ts`, making it selectable as a transaction category alongside existing categories.

#### Scenario: Personal appears in category list
- **WHEN** the CATEGORIES array is referenced anywhere in the app
- **THEN** `"Personal"` SHALL be present as a valid value

#### Scenario: Personal is selectable in correction dropdown
- **WHEN** a user opens the category correction dropdown on the transactions page
- **THEN** `"Personal"` SHALL appear as an option

### Requirement: Personal has a distinct display color
The system SHALL define a color for `Personal` in `CATEGORY_COLORS` in `lib/display.ts` that is visually distinct from all existing category colors.

#### Scenario: Personal color renders in charts and badges
- **WHEN** a transaction with category `"Personal"` is displayed in any chart, badge, or list
- **THEN** it SHALL render using the color defined for `Personal` in `CATEGORY_COLORS`

### Requirement: Personal category meaning
`Personal` SHALL represent person-to-person payments via PayNow-Mobile to a human recipient where no more specific category can be inferred from the memo or merchant name.

#### Scenario: Payment to a human name with no memo
- **WHEN** a transaction is PayNow-Mobile to a human name (e.g., "Thiri", "Kt") with no meaningful memo
- **THEN** the categoriser SHALL assign or suggest `Personal`

#### Scenario: Payment to a human name with meaningful memo
- **WHEN** a transaction is PayNow-Mobile to a human name but memo is "rent for feb"
- **THEN** the categoriser SHALL assign `Bills & Utilities`, not `Personal` (memo wins)
