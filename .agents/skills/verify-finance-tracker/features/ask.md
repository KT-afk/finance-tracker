# Ask

## Sub-features

- Ask a question about spending; the finance agent answers using tools.
- Follow-up questions use the saved web conversation; history shows only the web conversation.
- Empty state shows example prompts.

## How to get to it (user POV)

Sidebar "Ask" (`/ask`).

## Driving it with Playwright

`e2e.sh tests/e2e/ask.spec.ts`.

## Gotchas

- `launch.sh` sets `ANTHROPIC_API_KEY` empty, so real answers are not available; the specs cover the page, not the AI's words.
- Saved conversations persist in the demo database, and the empty-state test depends on them. Use a fresh `launch.sh` before the full suite.
