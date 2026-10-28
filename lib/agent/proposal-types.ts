/**
 * Proposal types with no code behind them, so the web pages can use them
 * without pulling in the database.
 */

/** A stored proposal as the owner sees it, with buttons to decide it. */
export type Proposal = { id: string; summary: string }

export type Decision = "confirm" | "reject"
export type DecisionOutcome =
  "applied" | "rejected" | "expired" | "used" | "conflict" | "not_found"
