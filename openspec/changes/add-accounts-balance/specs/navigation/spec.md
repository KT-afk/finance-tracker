## MODIFIED Requirements

### Requirement: Navigation items
The system SHALL display 5 navigation items in both desktop sidebar and mobile bottom nav: Home (`/`), Transactions (`/transactions`), Accounts (`/accounts`), Insights (`/insights`), Ask (`/ask`). Full labels SHALL be used (no abbreviations). The Upload nav item is removed.

#### Scenario: Desktop sidebar navigation
- **WHEN** the app is viewed on desktop (md breakpoint and above)
- **THEN** the sidebar shows 5 items: Home, Transactions, Accounts, Insights, Ask with icons and full labels

#### Scenario: Mobile bottom navigation
- **WHEN** the app is viewed on mobile (below md breakpoint)
- **THEN** the bottom nav shows 5 items: Home, Transactions, Accounts, Insights, Ask with icons and full labels at text-[10px]

### Requirement: Upload action on Transactions page
The system SHALL display an "Upload" button in the Transactions page header, aligned to the right of the page title.

#### Scenario: User wants to upload
- **WHEN** the user is on the Transactions page
- **THEN** an "Upload" button is visible in the header that navigates to `/upload`
