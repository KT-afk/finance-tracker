import type { PaymentAlert } from "./parse"

/**
 * The owner's own PayNow mobiles and account endings, from the environment
 * so real numbers never land in this public repo:
 *   FINANCE_SELF_PAYNOW_MOBILES="91234567"
 *   FINANCE_SELF_ACCOUNT_ENDINGS="123456,7890"
 */
export type SelfAccounts = {
  mobiles: string[]
  accountEndings: string[]
}

function digitsList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.replace(/\D/g, ""))
    .filter(Boolean)
}

export function selfAccountsFromEnv(
  env: Record<string, string | undefined> = process.env
): SelfAccounts {
  return {
    mobiles: digitsList(env.FINANCE_SELF_PAYNOW_MOBILES),
    accountEndings: digitsList(env.FINANCE_SELF_ACCOUNT_ENDINGS),
  }
}

/**
 * A Self Transfer is decided by where the money went, never by the Payee's
 * name, which banks mask in alerts. Alerts show only the last few digits,
 * so a match on those digits is enough.
 */
export function isSelfTransferAlert(
  alert: PaymentAlert,
  self: SelfAccounts
): boolean {
  if (alert.method !== "paynow" || !alert.payeeMobileEnding) return false
  const ending = alert.payeeMobileEnding
  return self.mobiles.some((mobile) => mobile.endsWith(ending))
}
