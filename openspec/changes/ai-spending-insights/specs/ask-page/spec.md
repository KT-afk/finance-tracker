## ADDED Requirements

### Requirement: Ask page with natural language input
A new `/ask` page SHALL exist with a text input allowing the user to type any finance question. The page SHALL be reachable from the main navigation bar.

#### Scenario: User submits a question
- **WHEN** the user types a question and submits
- **THEN** a loading state is shown while the API processes, then the answer is displayed below the input

#### Scenario: Answer with mini visual
- **WHEN** the API returns `answer_data` alongside `text`
- **THEN** the page SHALL render a small bar chart using the `labels` and `values` fields in `answer_data`

#### Scenario: Answer is text only
- **WHEN** the API returns only `text` with no `answer_data`
- **THEN** the page SHALL display the text answer without any chart

### Requirement: Browsable conversation history
The Ask page SHALL display a scrollable list of all past Q&A pairs, ordered newest-first. Each entry SHALL show the question, the answer text, and the timestamp.

#### Scenario: User returns to Ask page
- **WHEN** the user navigates to `/ask`
- **THEN** all previous questions and answers SHALL be visible in the history list below the input

#### Scenario: First visit with no history
- **WHEN** there are no saved conversations
- **THEN** the history section SHALL show an empty state message (e.g. "Ask your first question above")

### Requirement: Transaction correction via Ask
The user SHALL be able to correct a transaction's category by describing it in plain English (e.g. "that Town Vets charge is Health, not Others").

#### Scenario: Correction is detected and applied
- **WHEN** the user's question describes a category correction
- **THEN** the API SHALL update the matching transaction's category in the DB and store a memory entry recording the correction
- **THEN** the answer text SHALL confirm what was changed (e.g. "Updated: Town Vets → Health")

### Requirement: Teaching via Ask
The user SHALL be able to teach Claude facts about their life or spending patterns (e.g. "Kt is my sister, not a merchant").

#### Scenario: Fact is stored in memory
- **WHEN** the user states a personal fact relevant to their finances
- **THEN** the API SHALL store it in the ai_memory table with `source: "user"`
- **THEN** the answer SHALL confirm the fact was saved

### Requirement: Ask API endpoint
`POST /api/ask` SHALL accept `{ question: string }`, determine the intent (query / correction / teaching), act accordingly, save the conversation, and return `{ text: string, answer_data?: object }`.

#### Scenario: Query intent
- **WHEN** the question is a data query (e.g. "how much did I spend on Grab this year?")
- **THEN** the API SHALL compute or retrieve the relevant data and return it as text, optionally with answer_data for a chart

#### Scenario: Correction intent
- **WHEN** the question describes a category correction
- **THEN** the API SHALL update the DB and include confirmation in the text response

#### Scenario: Teaching intent
- **WHEN** the question provides a personal fact
- **THEN** the API SHALL upsert the fact in ai_memory and include confirmation in the text response
