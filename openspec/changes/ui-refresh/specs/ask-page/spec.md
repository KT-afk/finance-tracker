## MODIFIED Requirements

### Requirement: Ask page uses chat layout
The Ask page layout SHALL be replaced with the chat-ask-ui layout. The existing stacked-card layout (input card, memory card, history card) SHALL be removed.

#### Scenario: Existing conversations preserved
- **WHEN** the layout changes to chat
- **THEN** all previously saved conversations SHALL still be visible in the thread (data unchanged, only presentation changes)

### Requirement: No separate answer section
The ephemeral answer section (currently shown between input and memory after a question) SHALL be removed. All answers SHALL flow directly into the conversation thread.

#### Scenario: User asks a question
- **WHEN** a question is submitted
- **THEN** the response SHALL appear in the thread as an AI bubble, not as a separate answer section above memory
