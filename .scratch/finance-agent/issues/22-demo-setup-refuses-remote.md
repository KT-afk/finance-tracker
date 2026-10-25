# 22: `db:setup-demo` refuses to migrate a remote database

**Phase:** A

**Priority:** P1

**What to build:** `npm run db:setup-demo` runs `drizzle-kit migrate` before seeding. `drizzle.config.ts` switches to Turso whenever `TURSO_DATABASE_URL` is set, so the migrate step changes the remote (live) database, even though the seed step then refuses to touch it. This happened on 2026-10-25: migration 0006 was applied to the live database during a local test run. It was harmless (two added columns the next deploy needs), but a test setup command must never change the live database.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `db:setup-demo` fails before migrating when `TURSO_DATABASE_URL` or `DATABASE_URL` is set, unless `ALLOW_REMOTE_DEMO_SEED=1`, matching the seed script's guard
- [ ] The error says which variable to unset
- [ ] Migrating the live database stays possible through a separate, explicit command
