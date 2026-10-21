import type { PaymentAlert } from "./parse"

/**
 * The owner's own PayNow mobiles, NRIC ending and account endings, from the
 * environment so real numbers never land in this public repo:
 *   FINANCE_SELF_PAYNOW_MOBILES="91234567"
 *   FINANCE_SELF_NRIC_ENDINGS="123A"
 *   FINANCE_SELF_ACCOUNT_ENDINGS="123456,7890"
 */
export type SelfAccounts = {
  mobiles: string[]
  nricEndings: string[]
  accountEndings: string[]
}

function list(value: string | undefined, keep: RegExp): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.replace(keep, "").toUpperCase())
    .filter(Boolean)
}

export function selfAccountsFromEnv(
  env: Record<string, string | undefined> = process.env
): SelfAccounts {
  return {
    mobiles: list(env.FINANCE_SELF_PAYNOW_MOBILES, /\D/g),
    nricEndings: list(env.FINANCE_SELF_NRIC_ENDINGS, /[^0-9A-Za-z]/g),
    accountEndings: list(env.FINANCE_SELF_ACCOUNT_ENDINGS, /\D/g),
  }
}

/**
 * A Self Transfer is decided by where the money went, never by the Payee's
 * name, which banks mask in alerts. Alerts show only the last few digits,
 * so a match on those is enough.
 */
export function isSelfTransferAlert(
  alert: PaymentAlert,
  self: SelfAccounts
): boolean {
  if (alert.method !== "paynow") return false
  const mobile = alert.payeeMobileEnding
  if (mobile) return self.mobiles.some((own) => own.endsWith(mobile))
  const nric = alert.payeeNricEnding
  if (nric) return self.nricEndings.some((own) => own.endsWith(nric))
  return false
}
