import { asc } from "drizzle-orm"
import { db } from "../db"
import { aiMemory } from "../schema"

export type Memory = { key: string; value: string }

/** Every saved memory, oldest first, so the cached prompt stays stable. */
export async function loadMemories(): Promise<Memory[]> {
  return db
    .select({ key: aiMemory.key, value: aiMemory.value })
    .from(aiMemory)
    .orderBy(asc(aiMemory.id))
}
