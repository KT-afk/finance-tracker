// Stops a test setup command before it can change a remote (live) database.
// drizzle.config.ts switches to Turso whenever these are set; see
// docs/book/03-lessons.md, lesson 1.
const remote = ["TURSO_DATABASE_URL", "DATABASE_URL"].filter(
  (name) => process.env[name]
)

if (remote.length && process.env.ALLOW_REMOTE_DEMO_SEED !== "1") {
  console.error(
    `Refusing to set up demo data: ${remote.join(" and ")} points at a remote database.\n` +
      `Unset ${remote.join(" and ")} (and their auth tokens) to use a local file, ` +
      "or set ALLOW_REMOTE_DEMO_SEED=1 if this is intentional.\n" +
      "To migrate the live database on purpose, use npm run db:migrate."
  )
  process.exit(1)
}
