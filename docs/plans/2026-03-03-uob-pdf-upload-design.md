# UOB PDF Upload Support

## Problem

UOB provides credit card statements as PDF only (no CSV export). The app currently only accepts CSV files. UOB bank account statements also come as PDF but we're starting with credit card support.

## Approach

Use `pdftotext -layout` (poppler, already installed) to extract text from the PDF server-side, then parse the structured tabular output with regex. No new npm dependencies.

## Architecture

The upload flow stays the same — just branching on file type:

```
Upload page (bank=uob, file=.pdf or .csv)
  → /api/upload (detects file type by extension/mime)
    → PDF? → write temp file → pdftotext -layout → parseUOBCreditCardPDF(text)
    → CSV? → parseCSV(csv, bank) (existing path)
  → normalize → categorize → preview → confirm
```

## Components

### `lib/parsers/pdf.ts` — PDF text extraction utility

Thin utility: writes buffer to temp file, calls `pdftotext -layout`, returns text string, cleans up temp file.

### `lib/parsers/uob-pdf.ts` — UOB credit card PDF parser

Parses `pdftotext -layout` output for UOB credit card statements:

- Finds the transaction section between card header and "End of Transaction Details"
- Extracts rows matching: `DD MMM` (post date) + `DD MMM` (trans date) + description + amount
- Handles multi-line descriptions (continuation lines with no date)
- Skips summary lines (PREVIOUS BALANCE, SUB TOTAL, TOTAL BALANCE)
- Returns `RawTransaction[]` with `bank: 'uob'`

### `lib/parsers/index.ts` — Router update

Add `parseFile(buffer: Buffer, filename: string, bank: Bank)` that checks extension: `.pdf` → PDF path, `.csv` → existing CSV path.

### `app/api/upload/route.ts` — Handle binary files

Change `file.text()` → `file.arrayBuffer()` so we can handle both binary PDF and text CSV. Route through `parseFile()` instead of `parseCSV()`.

### `app/upload/page.tsx` — Accept PDF files

Update file input `accept` to include `.pdf`. No other UI changes.

## UOB Credit Card PDF Format

```
Post    Trans    Description of Transaction    Transaction Amount
Date    Date                                              SGD

01 FEB  30 JAN   GRAB* A-XXXXXXXX             15.00
02 FEB  01 FEB   SPOTIFY P1234567              9.90
                 RECURRING CHARGE
```

Parsing rules:
- Transaction lines start with a date pattern (`DD MMM`)
- Amounts are right-aligned, always positive (credit card = expenses)
- Multi-line descriptions: continuation line has no date prefix
- Skip: PREVIOUS BALANCE, SUB TOTAL, TOTAL BALANCE, PAYMENT
- Payments (CR suffix) stored as positive amounts (income)

## What doesn't change

- Bank enum stays `'uob'` — no new bank type
- Normalize, categorize, dedup, confirm — untouched
- Database schema — unchanged

## Future

When a UOB bank account PDF sample is available, add a second parser (`parseUOBBankAccountPDF`) and auto-detect which format based on PDF content (credit card statements mention "Credit Card(s) Statement").
