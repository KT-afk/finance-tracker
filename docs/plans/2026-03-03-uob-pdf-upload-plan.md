# UOB PDF Upload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PDF upload support for UOB credit card statements using `pdftotext` (poppler).

**Architecture:** Detect PDF vs CSV at upload time, extract text with `pdftotext -layout` via child process, parse structured text into `RawTransaction[]`, feed into existing normalize → categorize → preview → confirm pipeline.

**Tech Stack:** Node.js `child_process.execFile`, poppler `pdftotext`, existing Recharts/Next.js stack.

---

### Task 1: Create PDF text extraction utility

**Files:**
- Create: `lib/parsers/pdf.ts`

**Step 1: Create `lib/parsers/pdf.ts`**

```typescript
import { execFile } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'

/**
 * Extract text from a PDF buffer using pdftotext (poppler).
 * Uses -layout flag to preserve column alignment.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const tmpPath = join(tmpdir(), `upload-${randomUUID()}.pdf`)

  try {
    await writeFile(tmpPath, buffer)

    const text = await new Promise<string>((resolve, reject) => {
      execFile('pdftotext', ['-layout', tmpPath, '-'], (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`pdftotext failed: ${stderr || error.message}`))
        } else {
          resolve(stdout)
        }
      })
    })

    return text
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit lib/parsers/pdf.ts` or just `npm run build`

---

### Task 2: Create UOB credit card PDF parser

**Files:**
- Create: `lib/parsers/uob-pdf.ts`

**Step 1: Create `lib/parsers/uob-pdf.ts`**

This parser takes the `pdftotext -layout` output and extracts transactions.

```typescript
import { RawTransaction } from './types'

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04',
  MAY: '05', JUN: '06', JUL: '07', AUG: '08',
  SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

// Match: DD MMM  DD MMM  Description  Amount
// e.g.:  "01 FEB  30 JAN   GRAB* A-12345678                   15.00"
const TX_LINE = /^\s+(\d{2}\s+[A-Z]{3})\s+(\d{2}\s+[A-Z]{3})\s+(.+?)\s{2,}([\d,]+\.\d{2})\s*(CR)?\s*$/

// Lines to skip
const SKIP_PATTERNS = [
  /PREVIOUS BALANCE/i,
  /SUB TOTAL/i,
  /TOTAL BALANCE/i,
  /^\s*$/,
]

/**
 * Extract the statement year from pdftotext output.
 * Looks for "Statement Date" line with format "DD MMM YYYY".
 */
function extractStatementYear(text: string): number {
  const match = text.match(/Statement Date\s+(\d{1,2}\s+[A-Z]{3}\s+(\d{4}))/i)
  if (match) return parseInt(match[2])
  // Fallback: current year
  return new Date().getFullYear()
}

/**
 * Convert "DD MMM" + statement year to YYYY-MM-DD.
 * If the transaction month is after the statement month, it's from the previous year
 * (e.g., statement is Feb 2026, transaction is Dec → Dec 2025).
 */
function resolveDate(ddMmm: string, statementYear: number, statementMonth: number): string {
  const parts = ddMmm.trim().split(/\s+/)
  if (parts.length !== 2) throw new Error(`Invalid date: ${ddMmm}`)
  const [day, mon] = parts
  const month = MONTHS[mon.toUpperCase()]
  if (!month) throw new Error(`Unknown month: ${mon}`)

  const monthNum = parseInt(month)
  // If transaction month is more than 1 month after statement month, it's previous year
  const year = monthNum > statementMonth + 1 ? statementYear - 1 : statementYear

  return `${year}-${month}-${day.padStart(2, '0')}`
}

/**
 * Parse UOB credit card PDF text (from pdftotext -layout) into RawTransactions.
 */
export function parseUOBCreditCardPDF(text: string): RawTransaction[] {
  const statementYear = extractStatementYear(text)
  // Extract statement month from the same line
  const stmtMatch = text.match(/Statement Date\s+\d{1,2}\s+([A-Z]{3})\s+\d{4}/i)
  const statementMonth = stmtMatch ? parseInt(MONTHS[stmtMatch[1].toUpperCase()] ?? '1') : 1

  const lines = text.split('\n')
  const results: RawTransaction[] = []

  let inTransactionSection = false
  let currentTx: { date: string; description: string; amount: number } | null = null

  for (const line of lines) {
    // Detect start of transaction section (after column header)
    if (/Post\s+Trans\s+Description/i.test(line)) {
      inTransactionSection = true
      continue
    }

    // Detect end of transaction section
    if (/End of Transaction Details/i.test(line)) {
      inTransactionSection = false
      // Flush last transaction
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'uob',
        })
        currentTx = null
      }
      continue
    }

    if (!inTransactionSection) continue

    // Skip summary/empty lines
    if (SKIP_PATTERNS.some(p => p.test(line))) continue

    // Try to match a transaction line
    const txMatch = line.match(TX_LINE)
    if (txMatch) {
      // Flush previous transaction
      if (currentTx) {
        results.push({
          date: currentTx.date,
          description: currentTx.description.trim(),
          amount: currentTx.amount,
          bank: 'uob',
        })
      }

      const [, , transDate, description, amountStr, cr] = txMatch
      const date = resolveDate(transDate, statementYear, statementMonth)
      const amount = parseFloat(amountStr.replace(/,/g, ''))

      currentTx = {
        date,
        description: description.trim(),
        // Credit card: expenses are positive in PDF → store as negative
        // CR suffix means payment/refund → store as positive
        amount: cr ? amount : -amount,
      }
    } else if (currentTx) {
      // Continuation line — append to current transaction description
      const trimmed = line.trim()
      if (trimmed) {
        currentTx.description += ' ' + trimmed
      }
    }
  }

  // Flush last transaction if section didn't end with marker
  if (currentTx) {
    results.push({
      date: currentTx.date,
      description: currentTx.description.trim(),
      amount: currentTx.amount,
      bank: 'uob',
    })
  }

  return results
}
```

---

### Task 3: Update parser router to handle PDF files

**Files:**
- Modify: `lib/parsers/index.ts`

**Step 1: Add `parseFile` function to `lib/parsers/index.ts`**

Add imports for `extractTextFromPDF` and `parseUOBCreditCardPDF`, then add a new `parseFile()` function that detects file type and routes accordingly. Keep existing `parseCSV()` unchanged.

```typescript
import { Bank } from '../schema'
import { RawTransaction } from './types'
import { parseOCBC } from './ocbc'
import { parseDBS } from './dbs'
import { parseUOB } from './uob'
import { parseTrust } from './trust'
import { extractTextFromPDF } from './pdf'
import { parseUOBCreditCardPDF } from './uob-pdf'

export type { RawTransaction } from './types'

/**
 * Route a CSV string to the correct parser based on the bank name.
 */
export function parseCSV(csv: string, bank: Bank): RawTransaction[] {
  switch (bank) {
    case 'ocbc':
      return parseOCBC(csv)
    case 'dbs':
      return parseDBS(csv)
    case 'uob':
      return parseUOB(csv)
    case 'trust':
      return parseTrust(csv)
    default:
      throw new Error(`Unsupported bank: ${bank}`)
  }
}

/**
 * Parse a file (CSV or PDF) into RawTransactions.
 * Detects file type by filename extension.
 */
export async function parseFile(
  buffer: Buffer,
  filename: string,
  bank: Bank
): Promise<RawTransaction[]> {
  const isPDF = filename.toLowerCase().endsWith('.pdf')

  if (isPDF) {
    const text = await extractTextFromPDF(buffer)

    // Currently only UOB credit card PDF is supported
    if (bank === 'uob') {
      return parseUOBCreditCardPDF(text)
    }
    throw new Error(`PDF upload is not supported for ${bank}. Please upload a CSV file.`)
  }

  // CSV path (existing)
  const csv = Buffer.from(buffer).toString('utf-8')
  return parseCSV(csv, bank)
}
```

---

### Task 4: Update upload API to handle PDF files

**Files:**
- Modify: `app/api/upload/route.ts`

**Step 1: Update the upload API route**

Change from `parseCSV(csv, bank)` to `parseFile(buffer, filename, bank)`. Read the file as `ArrayBuffer` instead of text to handle binary PDFs.

Key changes:
- `import { parseFile } from '@/lib/parsers'` (replace `parseCSV` import)
- `const buffer = Buffer.from(await file.arrayBuffer())` instead of `file.text()`
- `raws = await parseFile(buffer, file.name, bank as Bank)` instead of `parseCSV(csv, bank as Bank)`
- Error message updated from "CSV" to "file"

---

### Task 5: Update upload page to accept PDF files

**Files:**
- Modify: `app/upload/page.tsx`

**Step 1: Update file input accept attribute**

Change the file input `accept` from `.csv,text/csv` to `.csv,.pdf,text/csv,application/pdf`.

**Step 2: Update the label text**

Change "CSV file" label to "Statement file" since it now accepts both formats.

---

### Task 6: Build verification

**Step 1: Run build**

Run: `npm run build`
Expected: Zero type errors, all routes compile.

**Step 2: Manual test with the sample PDF**

Upload the existing `eStatement_37919.65584235511.pdf` via the UI with bank=UOB.
Expected: Preview shows 0 new transactions (this PDF has no individual transactions, just a balance transfer). No crash, no parse error.

**Step 3: Commit**

```bash
git add lib/parsers/pdf.ts lib/parsers/uob-pdf.ts lib/parsers/index.ts app/api/upload/route.ts app/upload/page.tsx
git commit -m "feat: add UOB credit card PDF upload support"
```
