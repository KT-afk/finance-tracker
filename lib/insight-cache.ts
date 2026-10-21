import { createHash } from "crypto"
import { eq } from "drizzle-orm"
import { db } from "./db"
import { insightCache } from "./schema"

export const INSIGHT_TTL_MS = 7 * 24 * 60 * 60 * 1000

const KEY = "dashboard"

/**
 * Fingerprint of everything sent to the model. A new upload, an edited
 * category, a new memory or a new month all change the prompt, and so
 * the hash, which makes the saved insight stale straight away.
 */
export function hashInsightInput(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex")
}

/** The saved insight, if it was made from the same input within the TTL. */
export async function getCachedInsight(
  inputHash: string,
  now = Date.now()
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(insightCache)
    .where(eq(insightCache.key, KEY))
  if (!row || row.input_hash !== inputHash) return null
  const age = now - new Date(row.created_at).getTime()
  if (!(age >= 0 && age < INSIGHT_TTL_MS)) return null
  return row.text
}

export async function saveInsight(
  inputHash: string,
  text: string,
  now = Date.now()
): Promise<void> {
  const row = {
    key: KEY,
    input_hash: inputHash,
    text,
    created_at: new Date(now).toISOString(),
  }
  await db
    .insert(insightCache)
    .values(row)
    .onConflictDoUpdate({ target: insightCache.key, set: row })
}
