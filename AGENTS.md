# Repository Guidelines

## Project Structure

- `app/`: Next.js App Router pages and API routes (`app/api/**/route.ts`).
- `components/`: shared React UI; primitives live in `components/ui/`.
- `lib/`: database, schema, parsers, categorization, display, and shared logic.
- `drizzle/`: SQL migrations and Drizzle metadata.
- `scripts/`: local maintenance scripts.
- `public/`: static assets.
- `docs/`, `openspec/`, `design-system/`: planning and design references.

## Commands

- `npm install`: install dependencies.
- `npm run dev`: start local dev at `http://localhost:3000`.
- `npm run build`: production build plus TypeScript validation.
- `npm run start`: serve the production build.
- `npx drizzle-kit migrate`: apply SQLite migrations.
- `bash scripts/setup-autostart.sh`: install the macOS launchd service.

Use Node `24` when possible; `package.json` requires `>=20.9 <26`.

## Style

Use TypeScript strict mode, 2-space indentation, single quotes, and no semicolons. Keep business logic in `lib/`; keep route handlers thin. Name components in `PascalCase`, utilities in `camelCase`, and route folders by lowercase URL path.

## Testing

No test runner is configured yet. Run `npm run build` before handoff. For parser, category, database, or financial logic changes, prefer adding focused tests when a test runner exists rather than relying only on manual checks.

## Commits and PRs

Use short imperative commit messages, like `Add transaction recategorization action`. PRs should explain the change, link issues when relevant, mention migrations or config changes, and include screenshots for UI changes.

## Agent Workflow

Keep the loop small:

1. Define the done state in one or two bullets before broad edits.
2. Put durable notes in a file when work spans handoffs; prefer `docs/plans/<date>-<topic>.md`.
3. Change one concern at a time.
4. Run `npm run build`.
5. Report what changed, what was checked, and what remains.

Do not create process files unless they reduce ambiguity for the next agent.

## Security

Never commit `.env.local`, `finance.db`, logs, bank statements, or exported transaction files. Use `.env.local.example` for safe configuration examples only. Prefer `FINANCE_DB_PATH` for databases stored outside the repo.
