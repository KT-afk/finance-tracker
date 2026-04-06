## Why

The app captures all your transactions but makes you do the analysis yourself — you have to read every line to find what's wrong. There's no layer that interprets your data, surfaces what's unusual, or lets you ask plain questions about your money.

## What Changes

- **Proactive insight card on the home page**: Claude reads this month's transactions and generates a plain-English summary — flagging anomalies, naming things in "Others" contextually (e.g., "flights" not just "Others"), and skipping known-normal items like regular transfers
- **New "Ask" page**: A natural language input where you can query your finances ("how much did I spend on Grab this year?") and get text + mini visual answers; history of past Q&A is saved and browsable
- **Bidirectional teaching**: Through the Ask page you can correct transactions ("that Town Vets is Health, not Others") or teach Claude facts about your life ("Kt is my sister") — both are applied immediately and stored as memory
- **Memory layer**: A persistent store of inferred and user-provided facts about your finances, fed into every Claude call so insights get smarter over time

## Capabilities

### New Capabilities

- `home-insight-card`: Proactive AI-generated insight card on the home page — anomaly detection, contextual naming of Others transactions, memory-aware (skips flagging known-normal items)
- `ask-page`: New page with natural language Q&A, text + mini visual answers, and browsable history of past questions
- `ai-memory`: Persistent memory table storing inferred and user-provided facts; passively built, actively editable via Ask; fed into all Claude calls

### Modified Capabilities

## Impact

- `app/page.tsx` — add insight card above existing dashboard content
- `app/ask/page.tsx` — new page (new nav item)
- `app/api/insight/route.ts` — new API: generates proactive insight using Claude + transaction data + memory
- `app/api/ask/route.ts` — new API: handles natural language queries, transaction corrections, memory updates
- `drizzle/` — new migrations for `ai_conversations` and `ai_memory` tables
- `lib/schema.ts` — new table definitions
- No changes to existing Insights, Transactions, or Upload pages
- Depends on Anthropic SDK (already installed for categorization)
