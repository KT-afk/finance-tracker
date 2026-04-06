## ADDED Requirements

### Requirement: Persistent memory table
The system SHALL maintain an `ai_memory` table in SQLite storing key-value facts with a source label (`user` or `inferred`).

#### Scenario: Memory entry created
- **WHEN** the user teaches Claude a fact or Claude infers one from transaction patterns
- **THEN** a row SHALL be upserted in ai_memory (unique on `key`) with the appropriate source

#### Scenario: Duplicate key upserted
- **WHEN** a memory entry with an existing key is written
- **THEN** the value SHALL be updated in place rather than creating a duplicate row

### Requirement: Memory fed into all Claude calls
Every call to Claude (insight and ask) SHALL receive the full ai_memory table as part of the system prompt context.

#### Scenario: Memory influences insight card
- **WHEN** ai_memory contains "Netflix is a normal monthly subscription"
- **THEN** the insight card SHALL NOT flag Netflix spending as an anomaly

#### Scenario: Memory influences Ask answers
- **WHEN** the user asks "who is Kt?"
- **THEN** Claude SHALL answer using the stored memory fact (e.g. "Kt is your sister, based on what you told me")

### Requirement: Memory visible and deletable on Ask page
The Ask page SHALL include a section listing all memory entries. The user SHALL be able to delete individual entries.

#### Scenario: User deletes a memory entry
- **WHEN** the user clicks delete on a memory entry
- **THEN** the row SHALL be removed from the ai_memory table and the UI SHALL update without a page reload

#### Scenario: No memory entries
- **WHEN** the ai_memory table is empty
- **THEN** the memory section SHALL show an empty state message (e.g. "Nothing remembered yet")

### Requirement: Memory schema migration
A Drizzle migration SHALL create the `ai_memory` table and the `ai_conversations` table before any API routes that depend on them are callable.

#### Scenario: Migration applied on first run
- **WHEN** the app starts and the migration has not been applied
- **THEN** both tables SHALL be created automatically via `drizzle-kit push` or the existing migration mechanism
