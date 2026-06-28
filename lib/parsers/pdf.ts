import { execFile } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'

function pdftotextCandidates(): string[] {
  return [
    process.env.PDFTOTEXT_BIN,
    'pdftotext',
    '/opt/homebrew/bin/pdftotext',
    '/opt/homebrew/opt/poppler/bin/pdftotext',
    '/usr/local/bin/pdftotext',
  ].filter((candidate): candidate is string => Boolean(candidate))
}

async function runPdftotext(tmpPath: string): Promise<string> {
  const errors: string[] = []

  for (const bin of pdftotextCandidates()) {
    if (bin.includes('/') && !existsSync(bin)) continue

    try {
      return await new Promise<string>((resolve, reject) => {
        execFile(bin, ['-layout', tmpPath, '-'], (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message))
          } else {
            resolve(stdout)
          }
        })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${bin}: ${message}`)
    }
  }

  throw new Error(`pdftotext failed. Tried: ${errors.join('; ') || 'no candidates'}`)
}

async function extractTextWithPdfParse(buffer: Buffer): Promise<string> {
  await import('pdf-parse/worker')
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

/**
 * Extract text from a PDF buffer using pdftotext (poppler).
 * Uses -layout flag to preserve column alignment.
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const tmpPath = join(tmpdir(), `upload-${randomUUID()}.pdf`)

  try {
    await writeFile(tmpPath, buffer)
    try {
      return await runPdftotext(tmpPath)
    } catch (pdftotextError) {
      try {
        return await extractTextWithPdfParse(buffer)
      } catch (pdfParseError) {
        const pdftotextMessage = pdftotextError instanceof Error ? pdftotextError.message : String(pdftotextError)
        const pdfParseMessage = pdfParseError instanceof Error ? pdfParseError.message : String(pdfParseError)
        throw new Error(`${pdftotextMessage}; pdf-parse failed: ${pdfParseMessage}`)
      }
    }
  } finally {
    await unlink(tmpPath).catch(() => {})
  }
}
