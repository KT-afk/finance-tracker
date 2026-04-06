## ADDED Requirements

### Requirement: Chat thread layout
The Ask page SHALL use a chat-style layout with a scrollable thread above a pinned input bar. The thread SHALL show user messages right-aligned and AI responses left-aligned.

#### Scenario: User sends a message
- **WHEN** the user submits a question
- **THEN** the question SHALL appear immediately as a right-aligned bubble in the thread
- **THEN** a loading indicator SHALL appear as a left-aligned AI bubble while waiting
- **THEN** the AI response SHALL replace the loading indicator in place

#### Scenario: Thread scroll position
- **WHEN** a new message is added
- **THEN** the thread SHALL show the most recent message at the bottom without requiring manual scroll

#### Scenario: Empty state
- **WHEN** there is no conversation history
- **THEN** a placeholder message SHALL appear in the thread (e.g. "Ask anything about your spending")

### Requirement: Input pinned at bottom
The text input and submit button SHALL be fixed at the bottom of the viewport on mobile and at the bottom of the content area on desktop. They SHALL remain visible when scrolling through history.

#### Scenario: Long history
- **WHEN** the conversation thread is longer than the viewport
- **THEN** the input bar SHALL remain visible and accessible without scrolling

### Requirement: Memory collapsed by default
The memory section SHALL render as a collapsed chip above the input (e.g. "What I remember (3)"). It SHALL NOT be a full card section.

#### Scenario: User expands memory
- **WHEN** the user clicks the memory chip
- **THEN** an inline list of memory entries expands above the input with delete buttons per entry

#### Scenario: Memory is empty
- **WHEN** there are no memory entries
- **THEN** the chip SHALL show "What I remember (0)" and expanding it SHALL show an empty state message

### Requirement: History and current conversation are one thread
Past conversations from `ai_conversations` and the current session's messages SHALL render as one continuous thread, newest at the bottom.

#### Scenario: Page reload
- **WHEN** the user reloads the Ask page
- **THEN** all prior conversations SHALL be visible in the thread in chronological order
