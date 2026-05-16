## ADDED Requirements

### Requirement: Compact balance card on dashboard
The system SHALL display a compact balance summary card on the dashboard, side by side with the existing monthly spend card. The balance card shows the total balance and "across N banks" subtitle, and links to `/accounts`.

#### Scenario: User has balances
- **WHEN** the dashboard loads and at least one bank has a balance
- **THEN** a balance card appears showing the total and a link arrow to `/accounts`

#### Scenario: User has no balances
- **WHEN** the dashboard loads and no banks have balances
- **THEN** the balance card shows "No balances set" with a link to `/accounts` to get started

#### Scenario: User taps balance card
- **WHEN** the user clicks/taps the balance card
- **THEN** they are navigated to `/accounts`

### Requirement: Side-by-side layout with spend card
The system SHALL display the balance card and monthly spend card in a 2-column grid on the dashboard, replacing the current single spend card layout.

#### Scenario: Desktop layout
- **WHEN** the dashboard is viewed on desktop
- **THEN** balance card and spend card appear side by side in equal-width columns

#### Scenario: Mobile layout
- **WHEN** the dashboard is viewed on mobile
- **THEN** balance card and spend card appear side by side in equal-width columns (compact)
