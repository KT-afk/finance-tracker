## NEW Requirements

### Requirement: Rules list API
The system SHALL provide `GET /api/rules` that returns all saved categorisation rules.

#### Scenario: Rules exist
- **WHEN** `GET /api/rules` is called
- **THEN** response SHALL include `{ rules: [{ id, keyword, category, created_at }] }` sorted by `created_at` descending (newest first)

#### Scenario: No rules
- **WHEN** no rules exist
- **THEN** response SHALL return `{ rules: [] }`

### Requirement: Create rule API
The system SHALL provide `POST /api/rules` that saves a new keyword→category rule.

#### Scenario: Valid rule creation
- **WHEN** body is `{ keyword: "netflix", category: "Subscriptions" }`
- **THEN** the rule SHALL be saved to `category_rules` and response SHALL include the saved rule object with its generated `id` and `created_at`

#### Scenario: Duplicate keyword
- **WHEN** body contains a keyword that already exists
- **THEN** the rule's category SHALL be updated (upsert) and the existing rule returned

#### Scenario: Invalid category
- **WHEN** body contains a `category` not in the CATEGORIES enum
- **THEN** response SHALL return 400 with `{ error: "Invalid category" }`

#### Scenario: Missing fields
- **WHEN** body is missing `keyword` or `category`
- **THEN** response SHALL return 400 with `{ error: "keyword and category are required" }`

### Requirement: Delete rule API
The system SHALL provide `DELETE /api/rules/[id]` that removes a rule by its id.

#### Scenario: Rule exists
- **WHEN** `DELETE /api/rules/abc123` is called and the rule exists
- **THEN** the rule SHALL be deleted and response SHALL be `{ success: true }`

#### Scenario: Rule not found
- **WHEN** `DELETE /api/rules/nonexistent` is called
- **THEN** response SHALL return 404 with `{ error: "Rule not found" }`
