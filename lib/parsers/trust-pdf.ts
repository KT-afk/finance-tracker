import { RawTransaction, ParseResult, statementDateFromText } from "./types"

const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
}

const SKIP_LINES = [/Previous balance/i, /Interest$/i, /^\s*$/]

/**
 * Extract statement year and month from Trust Bank PDF.
 * Looks for "Statement period  1 Mar 2026 - 31 Mar 2026"
 */
function extractStatementInfo(text: string): { year: number; month: string } {
  const match = text.match(/Statement period\s+\d+\s+(\w+)\s+(\d{4})/i)
  if (match) {
    const mon = match[1]
    const year = parseInt(match[2])
    const monthNum = MONTHS[mon]
    return { year, month: monthNum ?? "01" }
  }
  const now = new Date()
  return {
    year: now.getFullYear(),
    month: String(now.getMonth() + 1).padStart(2, "0"),
  }
}

const parseAmount = (raw: string) => parseFloat(raw.replace(/[+,]/g, ""))

/**
 * Read the ACTIVITY SUMMARY "Total" row: first figure is the opening balance,
 * last is the closing balance, both summed across Main Account + Savings.
 */
function extractSummaryTotals(
  text: string
): { opening: number; closing: number } | undefined {
  const m = text.match(
    /^\s*Total\s+S\$([\d,]+\.\d{2})[^\n]*S\$([\d,]+\.\d{2})\s*$/m
  )
  if (!m) return undefined
  return { opening: parseAmount(m[1]), closing: parseAmount(m[2]) }
}

/**
 * Parse Trust Bank PDF text (pdftotext -layout or pdf-parse) into RawTransactions.
 *
 * Format:
 *   Posting date   Description                    Amount in FCY   Amount in SGD
 *   DD MMM         Description text                               [+]amount
 *
 * - Amounts with "+" prefix are deposits/income
 * - Amounts without prefix are withdrawals/expenses
 * - Foreign currency transactions have an FCY amount and a separate SGD amount
 * - Continuation lines (e.g., FX rate info) are indented
 * - "Main Account" and "Savings" are section headers
 * - pdf-parse puts an FX transaction's SGD amount on a later line, so a dated
 *   line without an amount waits for the next line that ends in one
 */
export function parseTrustPDF(text: string): ParseResult {
  const { year, month } = extractStatementInfo(text)
  // Savings statements have "Main Account" / "Savings" pots and an activity
  // summary. Card statements keep the original parsing (no sample to verify).
  const isSavingsStatement = /Savings Account by Trust/i.test(text)
  const toIsoDate = (dateStr: string) =>
    `${year}-${month}-${dateStr.split(/\s+/)[0].padStart(2, "0")}`
  const lines = text.split("\n")
  const results: RawTransaction[] = []
  let closingBalanceSum = 0
  let lastClosingBalance: number | undefined
  let pendingTx: { date: string; description: string } | null = null

  let inTransactionSection = false
  let currentTx: { date: string; description: string; amount: number } | null =
    null

  for (const line of lines) {
    // Detect transaction section start
    if (/^Posting date\s+Description/i.test(line)) {
      inTransactionSection = true
      continue
    }

    // Section ends at page boundary or new section
    if (
      /^Page \d+ of \d+/i.test(line.trim()) ||
      /^Trust Bank Singapore/i.test(line.trim())
    ) {
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: "trust",
        })
        currentTx = null
      }
      inTransactionSection = false
      continue
    }

    // "Main Account" or "Savings" headers re-enter transaction mode on next header
    if (/^(Main Account|Savings)\s*$/i.test(line.trim())) {
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: "trust",
        })
        currentTx = null
      }
      continue
    }

    if (!inTransactionSection) continue

    // Capture closing balance before skipping
    const closingMatch = line.match(/Closing balance\s+([\d,]+\.\d{2})/i)
    if (closingMatch) {
      lastClosingBalance = parseAmount(closingMatch[1])
      closingBalanceSum += lastClosingBalance
      continue
    }

    // Skip known non-transaction lines
    if (SKIP_LINES.some((p) => p.test(line))) continue

    // Try to match a transaction line: DD MMM  Description  [FCY amount]  SGD amount
    const txMatch = line.match(
      /^(\d{2}\s+[A-Za-z]{3})\s{2,}(.+?)\s{2,}(\+?[\d,]+\.\d{2})\s*$/
    )

    // Dated line with no amount yet (pdf-parse FX layout)
    const datedNoAmount =
      isSavingsStatement &&
      !txMatch &&
      line.match(/^(\d{2}\s+[A-Za-z]{3})\s{2,}(\S.*?)\s*$/)

    if (txMatch || datedNoAmount) {
      // Flush previous
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: "trust",
        })
      }

      currentTx = null
      if (datedNoAmount) {
        const [, dateStr, description] = datedNoAmount
        pendingTx = {
          date: toIsoDate(dateStr),
          description: description.trim(),
        }
        continue
      }
      pendingTx = null

      const [, dateStr, descAndMaybeFcy, amountStr] = txMatch!

      // The description might include an FCY amount — strip it
      // FCY amounts look like "434,600.00 KRW" before the SGD amount
      const description = descAndMaybeFcy
        .replace(/[\d,]+\.\d{2}\s+[A-Z]{3}\s*$/, "")
        .trim()

      const amount = parseAmount(amountStr)
      currentTx = {
        date: toIsoDate(dateStr),
        description,
        amount: amountStr.startsWith("+") ? amount : -amount,
      }
    } else if (pendingTx) {
      const amountMatch = line.match(/(\+?[\d,]+\.\d{2})\s*$/)
      if (amountMatch) {
        const amount = parseAmount(amountMatch[1])
        currentTx = {
          ...pendingTx,
          amount: amountMatch[1].startsWith("+") ? amount : -amount,
        }
        pendingTx = null
      }
    } else if (currentTx) {
      // Continuation line (e.g., FX rate info) — skip, don't append
      // Trust PDFs put FX details on continuation lines which aren't useful for descriptions
    }
  }

  // Flush last
  if (currentTx) {
    results.push({
      date: currentTx.date,
      description: currentTx.description.trim(),
      amount: currentTx.amount,
      bank: "trust",
    })
  }

  const statementDate = statementDateFromText(text, [
    /Statement period\s+\d{1,2}\s+\w+\s+\d{4}\s*-\s*(\d{1,2}\s+\w+\s+\d{4})/i,
  ])

  if (!isSavingsStatement) {
    return {
      transactions: results,
      endingBalance: lastClosingBalance,
      statementDate,
      accountType: "credit_card",
    }
  }

  const totals = extractSummaryTotals(text)
  const endingBalance =
    totals?.closing ??
    (lastClosingBalance !== undefined
      ? Math.round(closingBalanceSum * 100) / 100
      : undefined)
  const expectedNet = totals
    ? Math.round((totals.closing - totals.opening) * 100) / 100
    : undefined

  return {
    transactions: results,
    endingBalance,
    statementDate,
    expectedNet,
    accountType: "savings",
  }
}
