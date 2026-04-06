## ADDED Requirements

### Requirement: Proactive insight card on home page
The home page SHALL display an AI-generated insight card above the existing dashboard content. The card SHALL be generated fresh on each page load and SHALL reflect the current month's transactions.

#### Scenario: Card loads on home page visit
- **WHEN** the user navigates to the home page
- **THEN** a loading skeleton is shown immediately, then replaced with the insight text once the API responds

#### Scenario: Card surfaces anomalies
- **WHEN** a spending category or merchant has an unusual amount compared to prior months
- **THEN** the insight text SHALL name the anomaly in plain English (e.g. "You spent $340 on dining this month, nearly double your usual $180")

#### Scenario: Card contextually names Others transactions
- **WHEN** transactions in the Others category contain identifiable merchant types (e.g. airlines, vets, bookstores)
- **THEN** the card SHALL use contextual names rather than "Others" (e.g. "flights" or "vet visits")

#### Scenario: Card skips known-normal items
- **WHEN** the ai_memory table contains a fact that a recurring charge is expected (e.g. "Netflix is a normal monthly subscription")
- **THEN** the insight card SHALL NOT flag that item as an anomaly

#### Scenario: No transactions this month
- **WHEN** there are no transactions for the current month
- **THEN** the card SHALL display a neutral message (e.g. "No transactions yet this month") instead of calling the AI

### Requirement: Insight API endpoint
`POST /api/insight` SHALL accept no body, query current month transactions from the DB, summarise them with the last 3 months' totals, fetch all ai_memory entries, and call Claude Sonnet to generate insight text.

#### Scenario: API returns insight text
- **WHEN** the endpoint is called successfully
- **THEN** it SHALL return `{ text: string }` with a 200 status

#### Scenario: API handles Claude failure gracefully
- **WHEN** the Claude API call fails or times out
- **THEN** the endpoint SHALL return a 500 with `{ error: string }` and the home page card SHALL show a neutral fallback message
