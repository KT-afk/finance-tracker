## MODIFIED Requirements

### Requirement: Insight covers 6 months of data
The `/api/insight` endpoint SHALL pass 6 months of spending summaries to Claude (current month + 5 prior months), replacing the previous 1 month + 3-month trend approach.

#### Scenario: Cross-time pattern exists
- **WHEN** a category or merchant has a notable pattern across multiple months (e.g. consistently high, steadily increasing)
- **THEN** the insight SHALL surface the pattern rather than only commenting on the current month

#### Scenario: Current month is unusual vs pattern
- **WHEN** the current month differs significantly from the established pattern
- **THEN** the insight SHALL name the deviation in the context of the pattern (e.g. "usually $200/mo on dining, this month $480")

### Requirement: Dashboard shows MoM delta
The dashboard spend total SHALL display a month-over-month delta line below the total amount, showing the absolute and percentage change vs the prior month.

#### Scenario: Prior month data exists
- **WHEN** the prior month has transaction data
- **THEN** the delta line SHALL show direction (↑/↓), absolute amount, and percentage (e.g. "↑ $420 vs February (+18%)")
- **THEN** the delta SHALL be red for increases and green for decreases

#### Scenario: No prior month data
- **WHEN** there is no data for the prior month
- **THEN** the delta line SHALL be omitted (not shown as zero or error)

#### Scenario: Bank filter applied
- **WHEN** a specific bank filter is selected
- **THEN** the MoM delta SHALL be computed using only transactions from that bank, matching the current month filter
