import { readFileSync } from "node:fs"
import path from "node:path"

const drizzleDir = path.join(__dirname, "..", "drizzle")

/** Every journaled migration, in order, as one SQL script for a test database. */
export function migratedSchemaSql(): string {
  const journal = JSON.parse(
    readFileSync(path.join(drizzleDir, "meta", "_journal.json"), "utf8")
  ) as { entries: { tag: string }[] }
  return journal.entries
    .map((entry) =>
      readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8")
        .split("--> statement-breakpoint")
        .join(";\n")
    )
    .join(";\n")
}
