## ADDED Requirements

### Requirement: Backfill script re-categorises Transfer and Others transactions
The system SHALL provide a script at `scripts/recategorize-backfill.ts` that queries all transactions with `category IN ('Transfer', 'Others')` and `is_corrected = false`, re-runs `categorize()` on each, and updates the `category` field in the database.

#### Scenario: Uncorrected Transfer/Others transactions are re-categorised
- **WHEN** the backfill script is run
- **THEN** every transaction with `category = 'Transfer'` or `category = 'Others'` and `is_corrected = false` SHALL have its category updated to the result of `categorize(description)`

#### Scenario: Manually corrected transactions are skipped
- **WHEN** a transaction has `is_corrected = true`
- **THEN** the backfill script SHALL NOT modify its category

#### Scenario: Script logs progress
- **WHEN** the script is running
- **THEN** it SHALL print each transaction description and the old → new category mapping to stdout so the user can review results

#### Scenario: Script is idempotent
- **WHEN** the backfill script is run more than once
- **THEN** transactions already correctly categorised SHALL not be unnecessarily re-called to Claude (rule cache prevents redundant API calls for already-learned patterns)

### Requirement: Backfill script is runnable via npx tsx
The script SHALL be executable with `npx tsx scripts/recategorize-backfill.ts` without additional build steps.

#### Scenario: Script runs successfully
- **WHEN** `npx tsx scripts/recategorize-backfill.ts` is executed
- **THEN** the script SHALL complete without crashing and print a summary of how many transactions were updated
