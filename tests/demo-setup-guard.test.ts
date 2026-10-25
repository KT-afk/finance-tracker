/**
 * db:setup-demo must never change a remote (live) database: the guard
 * stops it before drizzle-kit migrate runs, unless explicitly allowed.
 */
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"

const guard = path.join(__dirname, "..", "scripts", "require-local-db.mjs")

function run(env: Record<string, string>) {
  const clean = { ...process.env }
  for (const key of [
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "DATABASE_URL",
    "DATABASE_AUTH_TOKEN",
    "ALLOW_REMOTE_DEMO_SEED",
  ])
    delete clean[key]
  return spawnSync(process.execPath, [guard], {
    env: { ...clean, ...env },
    encoding: "utf8",
  })
}

assert.equal(run({}).status, 0, "local database is allowed")

for (const name of ["TURSO_DATABASE_URL", "DATABASE_URL"]) {
  const result = run({ [name]: "libsql://example.turso.io" })
  assert.equal(result.status, 1, `${name} is refused`)
  assert.match(result.stderr, new RegExp(name), "says which setting to unset")
}

assert.equal(
  run({
    TURSO_DATABASE_URL: "libsql://example.turso.io",
    ALLOW_REMOTE_DEMO_SEED: "1",
  }).status,
  0,
  "explicit override still works"
)

const pkg = require("../package.json") as { scripts: Record<string, string> }
assert.match(
  pkg.scripts["db:setup-demo"],
  /^node scripts\/require-local-db\.mjs && /,
  "the guard runs before anything else"
)
assert.equal(pkg.scripts["db:migrate"], "drizzle-kit migrate")
console.log("demo-setup-guard: passed")
